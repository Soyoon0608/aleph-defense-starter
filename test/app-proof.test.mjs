import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateKeyPairSync,
  randomUUID,
  sign
} from 'node:crypto';

import {
  issueAppCertificate,
  proofMessage,
  verifyAppProof
} from '../src/app-proof.mjs';

const secret = 'stage11-local-test-fixture';

const identity = {
  userId: '11111111-1111-4111-8111-111111111111'
};

const context = {
  classId: 'byteback-local-v1',
  projectId: 'a'.repeat(32),
  subjectId: 'fixture-subject',
  deviceId: '0123456789abcdef'
};

const NOTE =
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function approvedDevice() {
  const {
    publicKey,
    privateKey
  } = generateKeyPairSync('ec', {
    namedCurve: 'prime256v1'
  });

  const approval = issueAppCertificate({
    identity,
    secret,
    context,
    publicKey: publicKey.export({
      format: 'jwk'
    }),
    expiresAt: Date.now() + 5 * 60 * 1000
  });

  return {
    privateKey,
    certificate: approval.certificate
  };
}

function signedRequest({
  privateKey,
  certificate,
  method = 'GET',
  url = `/api/notes/${NOTE}`,
  body
}) {
  const time = String(Date.now());
  const nonce = randomUUID();

  const signature = sign(
    'sha256',
    Buffer.from(
      proofMessage({
        method,
        url,
        body,
        certificate,
        time,
        nonce
      })
    ),
    {
      key: privateKey,
      dsaEncoding: 'ieee-p1363'
    }
  ).toString('base64url');

  return {
    method,
    url,
    body,
    headers: {
      'x-byteback-app-certificate':
        certificate,
      'x-byteback-app-signature':
        signature,
      'x-byteback-app-time': time,
      'x-byteback-app-nonce': nonce
    }
  };
}

test(
  'approved device exact signed request is accepted',
  async () => {
    const device = approvedDevice();

    const valid = await verifyAppProof({
      req: signedRequest(device),
      identity,
      secret,
      context
    });

    assert.equal(valid, true);
  }
);

test(
  'unsigned protected request is rejected',
  async () => {
    const valid = await verifyAppProof({
      req: {
        method: 'GET',
        url: `/api/notes/${NOTE}`,
        headers: {}
      },
      identity,
      secret,
      context
    });

    assert.equal(valid, false);
  }
);

test(
  'changing path after signing is rejected',
  async () => {
    const device = approvedDevice();
    const req = signedRequest(device);

    req.url =
      '/api/notes/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

    const valid = await verifyAppProof({
      req,
      identity,
      secret,
      context
    });

    assert.equal(valid, false);
  }
);

test(
  'changing PUT body after signing is rejected',
  async () => {
    const device = approvedDevice();

    const req = signedRequest({
      ...device,
      method: 'PUT',
      body: {
        title: '원본',
        body: '원본'
      }
    });

    req.body = {
      title: '변조',
      body: '원본'
    };

    const valid = await verifyAppProof({
      req,
      identity,
      secret,
      context
    });

    assert.equal(valid, false);
  }
);
