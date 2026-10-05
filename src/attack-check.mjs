// The student changes this check as each stage adds an attack to the same app.
// Never return tokens, private keys, real names, or note bodies.
export async function runAttackChecks(config) {
  if (config.step === 3) return runStepThreeChecks(config);
  if (config.step === 2) return runStepTwoChecks(config);
  if (config.step !== 1) throw new Error('이 단계의 공격 점검을 src/attack-check.mjs에 구현해 주세요.');
  let app;
  try {
    app = new URL(config.publicAppUrl);
  } catch {
    throw new Error('aleph.config.json의 실제 배포 주소를 먼저 넣어 주세요.');
  }
  if (app.protocol !== 'https:' || app.username || app.password || app.search || app.hash
      || app.pathname !== '/' || app.hostname.endsWith('.example')) {
    throw new Error('aleph.config.json의 실제 배포 주소를 먼저 넣어 주세요.');
  }
  if (typeof config.sampleMarker !== 'string' || !config.sampleMarker) throw new Error('가상 메모의 확인 표시를 넣어 주세요.');
  const response = await fetch(new URL('/data.json', app), {
    redirect: 'error', signal: AbortSignal.timeout(10000),
  });
  let visible = false;
  if (response.ok) {
    try {
      const data = await response.json();
      visible = data?.sampleMarker === config.sampleMarker && Array.isArray(data.notes)
        && data.notes.length > 0;
    } catch {
      // A non-JSON response is a failed check, not a successful deployment.
    }
  }
  return [{ attackId: 'anonymous_note_read', expected: '비로그인 화면에서 가상 메모를 확인',
    observed: visible ? '비로그인 요청에서 공개 가상 메모 확인 표시가 보임' : `비로그인 요청에서 확인 표시가 보이지 않음 (HTTP ${response.status})` }];
}

async function runStepTwoChecks(config) {
  const app = new URL(config.publicAppUrl);
  if (app.protocol !== 'https:' || app.username || app.password ||
      app.search || app.hash || app.pathname !== '/' ||
      app.hostname.endsWith('.example')) {
    throw new Error('실제 배포 주소를 확인해 주세요.');
  }

  const results = [];
  for (const path of ['/data.json', '/api/notes']) {
    const isStatic = path === '/data.json';
    try {
      const response = await fetch(new URL(path, app), {
        redirect: 'error',
        cache: 'no-store',
        signal: AbortSignal.timeout(10000)
      });
      let data = null;
      try { data = await response.json(); } catch {}

      const empty = response.ok && Array.isArray(data?.notes) &&
        data.notes.length === 0;
      const visible = response.ok &&
        data?.sampleMarker === config.sampleMarker &&
        Array.isArray(data.notes) && data.notes.length === 4 &&
        data.notes.every(note =>
          typeof note.title === 'string' && typeof note.content === 'string');

      results.push({
        attackId: isStatic ? 'static_note_seed_read' : 'anonymous_api_note_read',
        expected: isStatic
          ? '정적 자료 파일에 메모가 없어야 함'
          : '2단계의 남은 약점: 비로그인 API에서 가상 메모 네 건이 보임',
        observed: isStatic
          ? (empty ? '빈 메모 배열 확인' : '빈 메모 배열 확인 실패') +
            ' (HTTP ' + response.status + ')'
          : (visible ? '가상 메모 네 건과 확인 표시 확인; 공개 API 약점 남음'
            : '가상 메모 네 건 확인 실패') +
            ' (HTTP ' + response.status + ')'
      });
    } catch {
      results.push({
        attackId: isStatic ? 'static_note_seed_read' : 'anonymous_api_note_read',
        expected: isStatic
          ? '정적 자료 파일에 메모가 없어야 함'
          : '2단계의 남은 약점: 비로그인 API에서 가상 메모 네 건이 보임',
        observed: '요청 실패; 확인하지 못함'
      });
    }
  }
  return results;
}

async function runStepThreeChecks(config) {
  const app = new URL(config.publicAppUrl);
  if (app.protocol !== 'https:' || app.username || app.password ||
      app.search || app.hash || app.pathname !== '/') {
    throw new Error('배포 주소를 확인하세요.');
  }

  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const forged = [
    encode({ alg: 'ES256', typ: 'JWT' }),
    encode({
      iss: config.identityProvider.issuer,
      aud: config.identityProvider.audience,
      sub: '00000000-0000-4000-8000-000000000001',
      role: 'authenticated',
      exp: Math.floor(Date.now() / 1000) + 600
    }),
    Buffer.alloc(64).toString('base64url')
  ].join('.');
  const missingId = '00000000-0000-4000-8000-000000000000';
  const checks = [
    ['static_note_seed_read', '/data.json', 'GET', null],
    ['anonymous_note_read', '/api/notes', 'GET', null],
    ['anonymous_note_create', '/api/notes', 'POST', null],
    ['anonymous_note_update', '/api/notes/' + missingId, 'PUT', null],
    ['anonymous_note_delete', '/api/notes/' + missingId, 'DELETE', null],
    ['forged_login_read', '/api/notes', 'GET', forged]
  ];
  const results = [];
  for (const [attackId, path, method, token] of checks) {
    const isStatic = path === '/data.json';
    const expected = isStatic ? '정적 파일에 메모 없음' : '자료 없이 HTTP 401로 거부';
    try {
      const response = await fetch(new URL(path, app), {
        method, redirect: 'error', cache: 'no-store',
        signal: AbortSignal.timeout(10000),
        headers: {
          ...(token ? { Authorization: 'Bearer ' + token } : {}),
          ...(['POST', 'PUT'].includes(method) ? { 'Content-Type': 'application/json' } : {})
        },
        ...(['POST', 'PUT'].includes(method)
          ? { body: JSON.stringify({ title: '가상 점검', body: '학습용 요청' }) } : {})
      });
      let data;
      try { data = await response.json(); } catch {}
      const passed = isStatic
        ? response.ok && Array.isArray(data?.notes) && data.notes.length === 0
        : response.status === 401 && typeof data?.error === 'string' &&
          Object.keys(data).length === 1;
      results.push({
        attackId, expected,
        observed: (passed ? '기대한 결과 확인' : '기대한 결과 확인 실패') +
          ' (HTTP ' + response.status + ')'
      });
    } catch {
      results.push({ attackId, expected, observed: '요청 실패; 확인하지 못함' });
    }
  }
  return results;
}
