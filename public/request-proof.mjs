// 개인키와 승인 인증서는 이 모듈 메모리에만 둡니다.
// 브라우저 저장소에는 기록하지 않습니다.

const bytes = value =>
  new TextEncoder().encode(value);

const base64url = value =>
  btoa(
    String.fromCharCode(...new Uint8Array(value))
  )
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

const hash = async value => {
  const result = await crypto.subtle.digest(
    'SHA-256',
    bytes(value)
  );

  return Array.from(
    new Uint8Array(result),
    value => value.toString(16).padStart(2, '0')
  ).join('');
};

function canonicalBody(value) {
  if (value === '' || value === undefined) {
    value = null;
  }

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

  return JSON.stringify(normalize(value));
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

export function createDeviceAccess(
  authHeaders,
  dispatch = fetch
) {
  let connection = null;
  let keys = null;

  const clear = () => {
    connection = null;
    keys = null;
  };

  const ensureKeys = async () => {
    if (!keys) {
      keys = await crypto.subtle.generateKey(
        {
          name: 'ECDSA',
          namedCurve: 'P-256'
        },
        false,
        ['sign', 'verify']
      );
    }

    return keys;
  };

  const requestApproval = async () => {
    const currentKeys = await ensureKeys();

    const requestResponse =
      await dispatch('/api/device', {
        method: 'POST',
        cache: 'no-store',
        headers: {
          ...authHeaders(),
          'Content-Type': 'application/json'
        },
        body: '{}'
      });

    const requestData =
      await readJson(requestResponse);

    if (!requestResponse.ok) {
      throw new Error(
        requestData.error
        || '기기 승인 요청을 보낼 수 없습니다.'
      );
    }

    const statusResponse =
      await dispatch('/api/device', {
        method: 'GET',
        cache: 'no-store',
        headers: authHeaders()
      });

    const status =
      await readJson(statusResponse);

    if (!statusResponse.ok) {
      throw new Error(
        status.error
        || '기기 승인 상태를 확인할 수 없습니다.'
      );
    }

    if (status.registered !== true) {
      connection = null;

      return {
        registered: false,
        requested:
          requestData.requested === true,
        deviceId: status.deviceId
      };
    }

    const publicKey =
      await crypto.subtle.exportKey(
        'jwk',
        currentKeys.publicKey
      );

    const certificateResponse =
      await dispatch('/api/app-certificate', {
        method: 'POST',
        cache: 'no-store',
        headers: {
          ...authHeaders(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ publicKey })
      });

    const certificate =
      await readJson(certificateResponse);

    if (!certificateResponse.ok
        || certificate.registered !== true
        || typeof certificate.certificate !== 'string'
        || !Number.isFinite(certificate.expiresAt)
        || certificate.expiresAt <= Date.now()) {
      connection = null;

      throw new Error(
        certificate.error
        || '승인된 기기의 요청 서명을 연결하지 못했습니다.'
      );
    }

    connection = {
      privateKey: currentKeys.privateKey,
      certificate: certificate.certificate,
      expiresAt: certificate.expiresAt,
      deviceId: certificate.deviceId
    };

    return {
      registered: true,
      deviceId: certificate.deviceId,
      expiresAt: certificate.expiresAt
    };
  };

  const protectedFetch =
    async (path, options = {}) => {
      if (!connection
          || connection.expiresAt <= Date.now()) {
        clear();

        throw new Error(
          '먼저 서버에서 기기 승인을 받아 주세요.'
        );
      }

      const url =
        new URL(path, location.origin);

      if (url.origin !== location.origin) {
        throw new Error(
          '다른 서버로 보호 요청을 보낼 수 없습니다.'
        );
      }

      const method =
        (options.method || 'GET').toUpperCase();

      const time = String(Date.now());
      const nonce = crypto.randomUUID();

      const message = JSON.stringify([
        'byteback-app-proof-v1',
        method,
        url.pathname + url.search,
        await hash(canonicalBody(options.body)),
        await hash(connection.certificate),
        time,
        nonce
      ]);

      const signature =
        await crypto.subtle.sign(
          {
            name: 'ECDSA',
            hash: 'SHA-256'
          },
          connection.privateKey,
          bytes(message)
        );

      return dispatch(path, {
        ...options,
        method,
        headers: {
          ...(options.headers || {}),
          ...authHeaders(),
          'X-Byteback-App-Certificate':
            connection.certificate,
          'X-Byteback-App-Signature':
            base64url(signature),
          'X-Byteback-App-Time': time,
          'X-Byteback-App-Nonce': nonce
        }
      });
    };

  return {
    requestApproval,
    protectedFetch,
    clear
  };
}
