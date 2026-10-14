import {
  createHmac,
  randomBytes,
  timingSafeEqual
} from 'node:crypto';

const COOKIE = '__Host-byteback-device';

export function serverDeviceContext(
  req,
  res,
  identity,
  config,
  secret
) {
  if (!identity?.userId || !secret) {
    throw new Error('device_context_invalid');
  }

  const digest = (purpose, value) =>
    createHmac('sha256', secret)
      .update(JSON.stringify([purpose, value]))
      .digest('hex');

  const projectId =
    digest('byteback-project-v1', config.repoUrl)
      .slice(0, 32);

  const subjectId =
    digest(
      'byteback-subject-v1',
      [projectId, identity.userId]
    );

  const cookies =
    String(req.headers?.cookie ?? '')
      .split(';')
      .map(value => value.trim())
      .filter(value =>
        value.startsWith(COOKIE + '=')
      );

  let deviceId;

  if (cookies.length === 1) {
    try {
      const raw =
        cookies[0].slice(COOKIE.length + 1);

      const parts = raw.split('.');

      if (parts.length === 2
          && /^[a-f0-9]{64}$/.test(parts[1])) {
        const expected =
          digest('byteback-device-cookie-v1', parts[0]);

        if (timingSafeEqual(
          Buffer.from(expected, 'hex'),
          Buffer.from(parts[1], 'hex')
        )) {
          const payload = JSON.parse(
            Buffer.from(
              parts[0],
              'base64url'
            ).toString('utf8')
          );

          if (payload.project === projectId
              && /^[a-f0-9]{16}$/.test(payload.id)
              && Number.isSafeInteger(payload.exp)
              && payload.exp > Date.now()) {
            deviceId = payload.id;
          }
        }
      }
    } catch {
      // 변조·만료 쿠키는 등록 기기로 인정하지 않습니다.
    }
  }

  if (!deviceId) {
    deviceId =
      randomBytes(8).toString('hex');

    const payload =
      Buffer.from(
        JSON.stringify({
          id: deviceId,
          project: projectId,
          exp: Date.now() + 86400000
        })
      ).toString('base64url');

    const mac =
      digest('byteback-device-cookie-v1', payload);

    res.setHeader(
      'Set-Cookie',
      `${COOKIE}=${payload}.${mac}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=86400`
    );
  }

  return {
    classId: 'byteback-local-v1',
    projectId,
    subjectId,
    deviceId
  };
}
