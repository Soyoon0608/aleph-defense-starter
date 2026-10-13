// The student changes this check as each stage adds an attack to the same app.
// Never return tokens, private keys, real names, or note bodies.
export async function runAttackChecks(config) {
  if (config.step === 8) return runStepEightChecks(config);
  if (config.step === 7) return runStepSevenChecks();
  if (config.step === 6) return runStepSixChecks();
  if (config.step === 5) return runStepFourChecks(config);
  if (config.step === 4) return runStepFourChecks(config);
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

async function runStepFourChecks(config) {
  const results = await runStepThreeChecks(config);
  const expected = '公開用キーだけの直接Data API要求を拒否'.replace(
    '公開用キーだけの直接Data API要求を拒否',
    '공개용 키만 사용한 직접 Data API 요청 거부');
  try {
    const origin = new URL(config.identityProvider.issuer).origin;
    const response = await fetch(
      config.step >= 5 ? config.originalApiUrl + '?select=id&limit=1' : origin + '/rest/v1/byteback_notes?select=id&limit=1',
      {
        headers: { apikey: 'sb_publishable_bXsYOg9-Xygu4sMUfSj_Fg_YR1oDl3e' },
        redirect: 'error',
        signal: AbortSignal.timeout(10000)
      }
    );
    results.push({
      attackId: 'anonymous_direct_data_read',
      expected,
      observed: ([401, 403].includes(response.status)
        ? '직접 Data API 요청 거부 확인'
        : '직접 Data API 거부 확인 실패') +
        ' (HTTP ' + response.status + ')'
    });
    await response.body?.cancel();
  } catch {
    results.push({
      attackId: 'anonymous_direct_data_read',
      expected,
      observed: '요청 실패; 확인하지 못함'
    });
  }
  return results;
}

async function runStepSixChecks() {
  const [{ fixtureRequests }, { decide, RULE_IDS }] = await Promise.all([
    import('../scripts/fixture-7.mjs'),
    import('./decider.mjs')
  ]);
  if (!RULE_IDS.includes('device_registered')) {
    throw new Error('6단계 device_registered 규칙을 먼저 구현해 주세요.');
  }

  const registeredRequest = fixtureRequests().normal;
  const unregisteredRequest = {
    ...fixtureRequests().normal,
    deviceRegistered: false
  };
  const registeredResponse = await decide(registeredRequest);
  const unregisteredResponse = await decide(unregisteredRequest);
  if (registeredResponse.decision !== 'allow') {
    throw new Error('등록 기기 정상 요청이 allow로 판정되지 않았습니다.');
  }
  if (unregisteredResponse.decision !== 'deny'
      || unregisteredResponse.reasonCode !== 'device_not_registered') {
    throw new Error('미등록 기기 가상 요청이 deny/device_not_registered로 판정되지 않았습니다.');
  }

  return [
    {
      attackId: 'registered_device_read',
      expected: '등록 기기의 정상 자료 읽기는 allow',
      observed: `가상 판정 요청 결과: ${registeredResponse.decision}/${registeredResponse.reasonCode}`
    },
    {
      attackId: 'unregistered_device_read',
      expected: '미등록 기기 가상 요청은 deny/device_not_registered',
      observed: `가상 판정 요청 결과: ${unregisteredResponse.decision}/${unregisteredResponse.reasonCode}`
    }
  ];
}

async function runStepSevenChecks() {
  const [{ fixtureRequests }, { decide, RULE_IDS }] = await Promise.all([
    import('../scripts/fixture-7.mjs'),
    import('./decider.mjs')
  ]);
  if (!RULE_IDS.includes('device_registered') || !RULE_IDS.includes('step_up_required')) {
    throw new Error('7단계 device_registered와 step_up_required 규칙을 먼저 구현해 주세요.');
  }

  const { normal, suspicious } = fixtureRequests();
  const checks = [
    {
      attackId: 'registered_device_normal',
      request: normal,
      decision: 'allow',
      reasonCode: 'approved',
      expected: '등록 기기의 정상 요청은 allow'
    },
    {
      attackId: 'unregistered_device_denied',
      request: { ...normal, deviceRegistered: false },
      decision: 'deny',
      reasonCode: 'device_not_registered',
      expected: '미등록 기기 요청은 deny'
    },
    {
      attackId: 'composite_anomaly_step_up',
      request: suspicious,
      decision: 'step_up',
      reasonCode: 'step_up_required',
      expected: '복합 이상 가상 사건은 step_up'
    },
    {
      attackId: 'step_up_verified_allow',
      request: {
        ...suspicious,
        stepUp: { verified: true, authAgeSeconds: 60 }
      },
      decision: 'allow',
      reasonCode: 'approved',
      expected: '가상 추가 인증 확인 후 요청 재판정은 allow'
    }
  ];
  const results = [];
  for (const check of checks) {
    const response = await decide(check.request);
    if (response.decision !== check.decision || response.reasonCode !== check.reasonCode) {
      throw new Error(`7단계 가상 점검 실패: ${check.attackId}`);
    }
    results.push({
      attackId: check.attackId,
      expected: check.expected,
      observed: `가상 판정 결과: ${response.decision}/${response.reasonCode}`
    });
  }
  return results;
}

async function runStepEightChecks(config) {
  const [{ fixtureRequests }, { decide, RULE_IDS }, { identifyResource }, { handleNotes }] = await Promise.all([
    import('../scripts/fixture-7.mjs'),
    import('./decider.mjs'),
    import('./resource-identity.mjs'),
    import('./notes-api.mjs')
  ]);
  for (const ruleId of ['device_registered', 'step_up_required', 'resource_zone']) {
    if (!RULE_IDS.includes(ruleId)) throw new Error(`8단계 규칙 ${ruleId}가 없습니다.`);
  }

  const { normal } = fixtureRequests();
  const noteId = '00000000-0000-4000-8000-000000000001';
  const rows = [{
    id: noteId, owner_id: 'fixture-owner-a', title: '가상 메모', content: '가상 본문'
  }];
  const createClient = () => ({
    from(table) {
      if (table !== 'byteback_notes') throw new Error('예상하지 않은 자료 테이블입니다.');
      const filters = [];
      let update = null;
      return {
        select() { return this; },
        update(values) { update = values; return this; },
        eq(field, value) { filters.push([field, value]); return this; },
        async maybeSingle() {
          const row = rows.find(item => filters.every(([field, value]) => item[field] === value));
          if (!row) return { data: null, error: null };
          if (update) Object.assign(row, update);
          return { data: update ? { id: row.id } : row, error: null };
        }
      };
    }
  });
  const callApi = async (userId, method, body) => {
    const response = {
      statusCode: 200,
      setHeader() {},
      status(code) { this.statusCode = code; return this; },
      json(value) { this.body = value; return this; }
    };
    await handleNotes({ method, headers: {}, query: { id: noteId }, body }, response, true, {
      supabaseUrl: new URL(config.identityProvider.issuer).origin,
      verifyLogin: async () => ({ kind: 'student', userId }),
      createClient
    });
    return response;
  };
  const results = [];
  const checkDecision = async (attackId, expected, request, decision, reasonCode) => {
    const resource = identifyResource(request);
    const response = await decide(request);
    const resourceMatches = reasonCode === 'resource_unknown'
      ? resource === null : resource !== null;
    if (!resourceMatches || response.decision !== decision || response.reasonCode !== reasonCode) {
      throw new Error(`8단계 판정 점검 실패: ${attackId}`);
    }
    results.push({ attackId, expected, observed: `가상 판정: ${response.decision}/${response.reasonCode}` });
  };

  const selfRead = {
    ...normal, service: 'notes', method: 'GET', path: `/api/notes/${noteId}`,
    route: 'GET /api/notes/:id', queryLength: 0
  };
  const selfReadApi = await callApi('fixture-owner-a', 'GET');
  await checkDecision('self_note_read', '자기 메모 읽기 허용', selfRead, 'allow', 'approved');
  if (selfReadApi.statusCode !== 200) throw new Error('자기 메모 API 읽기 점검 실패.');
  results.push({ attackId: 'self_note_api_read', expected: '검증된 소유자의 GET 허용',
    observed: `가상 API 응답: HTTP ${selfReadApi.statusCode}` });

  const selfUpdate = {
    ...normal, service: 'notes', method: 'PUT', path: `/api/notes/${noteId}`,
    route: 'PUT /api/notes/:id', queryLength: 0
  };
  const selfUpdateApi = await callApi('fixture-owner-a', 'PUT', { title: '가상 메모', body: '수정된 가상 본문' });
  await checkDecision('self_note_update', '자기 메모 수정 허용', selfUpdate, 'allow', 'approved');
  if (selfUpdateApi.statusCode !== 200) throw new Error('자기 메모 API 수정 점검 실패.');
  results.push({ attackId: 'self_note_api_update', expected: '검증된 소유자의 PUT 허용',
    observed: `가상 API 응답: HTTP ${selfUpdateApi.statusCode}` });

  const crossReadApi = await callApi('fixture-owner-b', 'GET');
  if (crossReadApi.statusCode !== 404) throw new Error('다른 사용자의 메모 API 읽기가 거부되지 않았습니다.');
  results.push({ attackId: 'cross_note_api_read', expected: '다른 사용자의 메모 GET 거부',
    observed: `가상 API 응답: HTTP ${crossReadApi.statusCode}` });

  const crossUpdateApi = await callApi('fixture-owner-b', 'PUT', { title: '가짜 수정', body: '가짜 본문' });
  if (crossUpdateApi.statusCode !== 404 || rows[0].content !== '수정된 가상 본문') {
    throw new Error('다른 사용자의 메모 API 수정이 거부되지 않았습니다.');
  }
  results.push({ attackId: 'cross_note_api_update', expected: '다른 사용자의 메모 PUT 거부',
    observed: `가상 API 응답: HTTP ${crossUpdateApi.statusCode}; 소유자 자료 유지` });

  const forgedRoleApi = await callApi('fixture-owner-a', 'PUT', {
    title: '가짜 강사 수정', body: '가짜 본문', role: 'teacher'
  });
  if (forgedRoleApi.statusCode !== 400 || rows[0].content !== '수정된 가상 본문') {
    throw new Error('요청 본문의 role이 자료 수정 권한으로 사용됐습니다.');
  }
  results.push({ attackId: 'body_role_rejected', expected: '요청 본문의 role은 권한 근거가 아님',
    observed: `가상 API 응답: HTTP ${forgedRoleApi.statusCode}` });

  for (const [method, path, route, attackId, expected] of [
    ['GET', '/notes', 'GET /notes', 'note_collection_read_denied', '메모 전체 목록 거부'],
    ['GET', '/api/notes', 'GET /api/notes', 'api_note_collection_read_denied',
      '실제 notes API 전체 목록 거부'],
  ]) {
    await checkDecision(attackId, expected, { ...normal, method, path, route },
      'deny', 'resource_unknown');
  }

  for (const [path, route] of [
    ['/notes/all', 'GET /notes/:id'],
    ['/api/notes/all', 'GET /api/notes/:id'],
    ['/notes/export', 'GET /notes/:id'],
    ['/api/notes/export', 'GET /api/notes/:id']
  ]) {
    await checkDecision(`functional_note_path_${path.replaceAll('/', '_')}_denied`,
      '기능성 고정 경로 거부', {
        ...normal, service: 'notes', method: 'GET', path, route, queryLength: 0
      }, 'deny', 'resource_unknown');
  }

  await checkDecision('note_query_selection_denied', 'query 기능 선택 요청 거부', {
    ...normal, service: 'notes', method: 'GET', path: `/api/notes/${noteId}`,
    route: 'GET /api/notes/:id', queryLength: 10
  }, 'deny', 'resource_unknown');
  await checkDecision('unknown_resource_path', '알 수 없는 경로 거부', {
    ...normal, service: 'notes', method: 'GET', path: `/api/notes/${noteId}/extra`,
    route: 'GET /api/notes/:id/extra', queryLength: 0
  }, 'deny', 'resource_unknown');
  await checkDecision('resource_route_mismatch', '경로와 route 불일치 거부', {
    ...normal, service: 'notes', method: 'GET', path: `/api/notes/${noteId}`,
    route: 'GET /api/notes/:other', queryLength: 0
  }, 'deny', 'resource_unknown');

  return results;
}
