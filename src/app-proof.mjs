import { serverDeviceContext } from './server-device.mjs';
import {
  createHash,
  createHmac,
  createPublicKey,
  randomUUID,
  timingSafeEqual,
  verify
} from 'node:crypto';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SHA256 = /^[0-9a-f]{64}$/;

const sha256 = value =>
  createHash('sha256').update(value).digest('hex');

function safePublicKey(value) {
  if (!value
      || typeof value !== 'object'
      || Array.isArray(value)
      || value.kty !== 'EC'
      || value.crv !== 'P-256'
      || value.d !== undefined
      || typeof value.x !== 'string'
      || typeof value.y !== 'string'
      || !/^[A-Za-z0-9_-]{43}$/.test(value.x)
      || !/^[A-Za-z0-9_-]{43}$/.test(value.y)) {
    throw new Error('app_proof_invalid');
  }

  const key = {
    kty: 'EC',
    crv: 'P-256',
    x: value.x,
    y: value.y
  };

  createPublicKey({ key, format: 'jwk' });
  return key;
}

export function canonicalBody(value) {
  if (value === '' || value === undefined) value = null;

  if (typeof value === 'string') {
    value = JSON.parse(value);
  }

  const normalize = input => {
    if (Array.isArray(input)) {
      return input.map(normalize);
    }

    if (input && typeof input === 'object') {
      return Object.fromEntries(
        Object.keys(input)
          .sort()
          .map(key => [key, normalize(input[key])])
      );
    }

    return input;
  };

  const text = JSON.stringify(normalize(value));

  if (text.length > 30000) {
    throw new Error('app_proof_invalid');
  }

  return text;
}

export function proofTarget(url) {
  const target = new URL(url, 'https://local.invalid');
  const id = target.pathname.split('/').at(-1);

  // Vercel이 동적 경로 값을 같은 이름의 query로 중복 전달하는 경우만 제거합니다.
  // 다른 query나 다른 ID는 그대로 서명 대상에 남깁니다.
  for (const key of ['id', 'noteId']) {
    const values = target.searchParams.getAll(key);

    if (values.length === 1
        && values[0] === id
        && /^[0-9a-f-]{36}$/i.test(id)) {
      target.searchParams.delete(key);
    }
  }

  return target.pathname + target.search;
}

function seal(purpose, payload, secret) {
  return createHmac('sha256', secret)
    .update(`${purpose}\n${payload}`)
    .digest('hex');
}

function signedToken(purpose, body, secret) {
  const payload =
    Buffer.from(JSON.stringify(body)).toString('base64url');

  return `${payload}.${seal(purpose, payload, secret)}`;
}

function readSignedToken(purpose, token, secret) {
  if (typeof token !== 'string' || token.length > 4096) {
    throw new Error('app_proof_invalid');
  }

  const [payload, mac, ...extra] = token.split('.');

  if (extra.length
      || typeof payload !== 'string'
      || !SHA256.test(mac ?? '')) {
    throw new Error('app_proof_invalid');
  }

  const expected = seal(purpose, payload, secret);

  if (!timingSafeEqual(
    Buffer.from(mac, 'hex'),
    Buffer.from(expected, 'hex')
  )) {
    throw new Error('app_proof_invalid');
  }

  return JSON.parse(
    Buffer.from(payload, 'base64url').toString('utf8')
  );
}


export function issueAppCertificate({
  identity,
  secret,
  context,
  publicKey,
  expiresAt,
  now = Date.now()
}) {
  if (!identity?.userId
      || !secret
      || !context
      || !/^[0-9a-f]{16}$/.test(context.deviceId ?? '')
      || !Number.isFinite(expiresAt)) {
    throw new Error('app_proof_invalid');
  }

  const exp = Math.min(
    expiresAt,
    now + 10 * 60 * 1000
  );

  if (!Number.isSafeInteger(exp)
      || exp <= now) {
    throw new Error('app_proof_invalid');
  }

  const certificate = signedToken(
    'byteback-device-certificate-v1',
    {
      schema: 'byteback.device.certificate.v1',
      id: randomUUID(),
      userId: identity.userId,
      deviceId: context.deviceId,
      publicKey: safePublicKey(publicKey),
      exp
    },
    secret
  );

  return {
    registered: true,
    deviceId: context.deviceId,
    certificate,
    expiresAt: exp
  };
}

export function proofMessage({
  method,
  url,
  body,
  certificate,
  time,
  nonce
}) {
  return JSON.stringify([
    'byteback-app-proof-v1',
    method,
    proofTarget(url),
    sha256(canonicalBody(body)),
    sha256(certificate),
    time,
    nonce
  ]);
}

export async function verifyAppProof({
  req,
  identity,
  secret,
  context,
  now = Date.now()
}) {
  try {
    const certificate =
      req.headers?.['x-byteback-app-certificate'];
    const signature =
      req.headers?.['x-byteback-app-signature'];
    const time =
      req.headers?.['x-byteback-app-time'];
    const nonce =
      req.headers?.['x-byteback-app-nonce'];

    if (typeof certificate !== 'string'
        || typeof signature !== 'string'
        || !/^[A-Za-z0-9_-]{86}$/.test(signature)
        || typeof time !== 'string'
        || !/^\d{13}$/.test(time)
        || Math.abs(now - Number(time)) > 30000
        || !UUID.test(nonce ?? '')) {
      return false;
    }

    const cert = readSignedToken(
      'byteback-device-certificate-v1',
      certificate,
      secret
    );

    if (cert.schema !== 'byteback.device.certificate.v1'
        || !UUID.test(cert.id ?? '')
        || cert.userId !== identity?.userId
        || typeof cert.deviceId !== 'string'
        || !/^[0-9a-f]{16}$/.test(cert.deviceId)
        || cert.deviceId !== context?.deviceId
        || !Number.isSafeInteger(cert.exp)
        || cert.exp <= now
        || cert.exp > now + 10 * 60 * 1000) {
      return false;
    }

    const key = createPublicKey({
      key: safePublicKey(cert.publicKey),
      format: 'jwk'
    });

    return verify(
      'sha256',
      Buffer.from(proofMessage({
        method: req.method,
        url: req.url,
        body: req.body,
        certificate,
        time,
        nonce
      })),
      {
        key,
        dsaEncoding: 'ieee-p1363'
      },
      Buffer.from(signature, 'base64url')
    );
  } catch {
    return false;
  }
}

export async function enforceAppProof({
  req,
  res,
  identity,
  secret,
  config
}) {
  // 1~10단계 동작은 그대로 보존하고 11단계부터 요청 서명을 요구합니다.
  if (config?.step < 11) return true;

  let context;

  try {
    context = serverDeviceContext(
      req,
      res,
      identity,
      config,
      secret
    );
  } catch {
    res.status(403).json({
      error: '요청 서명을 다시 확인해 주세요.',
      reasonCode: 'app_proof_invalid'
    });
    return false;
  }

  const valid = await verifyAppProof({
    req,
    identity,
    secret,
    context
  });

  if (valid) return true;

  res.status(403).json({
    error: '기기 승인 또는 요청 서명을 확인해 주세요.',
    reasonCode: 'app_proof_invalid'
  });

  return false;
}
