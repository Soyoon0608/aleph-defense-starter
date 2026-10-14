// The student changes this check as each stage adds an attack to the same app.
// Never return tokens, private keys, real names, or note bodies.
export async function runAttackChecks(config) {
  if (config.step === 11) return runStepElevenChecks(config);
  if (config.step === 10) return runStepTenChecks(config);
  if (config.step === 9) return runStepNineChecks();
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

async function runStepNineChecks() {
  const { detect } = await import('./detect.mjs');

  const start = Date.UTC(2026, 9, 1, 0, 0, 0);
  const subject = 'learner_fixture';
  const deviceId = 'a'.repeat(16);

  const reads = (count, {
    owner = subject,
    device = null,
    network = null,
    intervalSeconds = 2
  } = {}) => Array.from({ length: count }, (_, index) => ({
    at: new Date(start + index * intervalSeconds * 1000).toISOString(),
    method: 'GET',
    identity: { sub: owner },
    ...(device ? { deviceId: device } : {}),
    ...(network ? {
      decision: 'allow',
      signals: { network }
    } : {})
  }));

  const results = [];

  const normal = detect(reads(30));
  if (normal.action !== 'observe') {
    throw new Error('9단계 정상 조회가 observe로 유지되지 않았습니다.');
  }
  results.push({
    attackId: 'normal_read_observed',
    expected: '정상 조회 사건은 회수 제안 없이 observe',
    observed: `가상 탐지 결과: ${normal.action}`
  });

  const exactLimit = detect(reads(120));
  if (exactLimit.action !== 'observe') {
    throw new Error('9단계 정확히 120건 조회가 잘못 탐지되었습니다.');
  }
  results.push({
    attackId: 'exact_limit_observed',
    expected: '10분 안의 정확히 120건은 observe',
    observed: `가상 탐지 결과: ${exactLimit.action}`
  });

  const burst = detect(reads(121));
  if (burst.action !== 'propose_revocation'
      || burst.reasonCode !== 'burst_read'
      || burst.subject !== subject) {
    throw new Error('9단계 폭주 조회 회수 제안이 올바르지 않습니다.');
  }
  results.push({
    attackId: 'burst_read_revocation_proposed',
    expected: '10분 안의 121건 조회는 burst_read 회수 제안',
    observed: `가상 탐지 결과: ${burst.action}/${burst.reasonCode}`
  });

  const usualNetwork = detect(reads(121, {
    device: deviceId,
    network: 'usual'
  }));
  if (usualNetwork.action !== 'observe') {
    throw new Error('9단계 정상 네트워크 사건이 잘못 탐지되었습니다.');
  }
  results.push({
    attackId: 'usual_network_preserved',
    expected: '정상 네트워크의 다량 조회는 회수 제안하지 않음',
    observed: `가상 탐지 결과: ${usualNetwork.action}`
  });

  const composite = detect(reads(121, {
    device: deviceId,
    network: 'unusual'
  }));
  if (composite.action !== 'propose_revocation'
      || composite.reasonCode !== 'burst_read'
      || composite.subject !== subject
      || composite.deviceId !== deviceId) {
    throw new Error('9단계 복합 의심 사건의 기기 회수 제안이 올바르지 않습니다.');
  }
  results.push({
    attackId: 'unusual_network_burst_revocation',
    expected: '이상 네트워크와 다량 조회가 함께 나타나면 확인된 가상 기기 하나에 회수 제안',
    observed: `가상 탐지 결과: ${composite.action}/${composite.reasonCode}; 기기 1개 지정`
  });

  const splitUsers = detect([
    ...reads(100),
    ...reads(100, { owner: 'other_fixture' })
  ].sort((a, b) => a.at.localeCompare(b.at)));

  if (splitUsers.action !== 'observe') {
    throw new Error('9단계 서로 다른 사용자의 사건이 잘못 합산되었습니다.');
  }
  results.push({
    attackId: 'separate_users_not_combined',
    expected: '서로 다른 사용자의 조회는 합산하지 않음',
    observed: `가상 탐지 결과: ${splitUsers.action}`
  });

  return results;
}

async function runStepTenChecks(config) {
  const { readFile } = await import('node:fs/promises');
  const {
    previewPolicyRestore,
    restoreTestPolicy,
    verifySafePolicyBackup
  } = await import('./policy-recovery.mjs');
  const {
    contentDigest,
    handleRestore,
    noteBindingDigest
  } = await import('./restore-api.mjs');

  const policyBackupUrl =
    new URL('../backups/policy.safe.json', import.meta.url);

  async function readPolicyBackup() {
    return JSON.parse(
      await readFile(policyBackupUrl, 'utf8')
    );
  }

  const policyBackup = await readPolicyBackup();

  const safeManifest = JSON.parse(
    await readFile(
      new URL('../backups/manifest.safe.json', import.meta.url),
      'utf8'
    )
  );

  const results = [];

  // 1. 검증된 안전 정책 사본을 다시 읽습니다.
  const verified = verifySafePolicyBackup(policyBackup);

  if (!verified.verified || verified.version !== 9) {
    throw new Error('10단계 안전 정책 사본을 검증하지 못했습니다.');
  }



  // 2. 복원 직전에 정책 사본을 파일에서 다시 읽어 재검증합니다.
  const rereadPolicyBackup = await readPolicyBackup();
  const rereadVerified =
    verifySafePolicyBackup(rereadPolicyBackup);

  if (rereadVerified.version !== verified.version
      || rereadVerified.sha256 !== verified.sha256) {
    throw new Error(
      '10단계 다시 읽은 정책 사본이 처음 검증한 사본과 다릅니다.'
    );
  }

  results.push({
    attackId: 'safe_policy_backup_verified',
    expected: '검증된 9단계 안전 정책 사본의 해시가 일치',
    observed: `로컬 사본 검증: 최초 검증 후 파일 재읽기·재검증/version-${rereadVerified.version}`
  });

  // 실행 전에 바뀔 정책 항목을 확인합니다.
  const currentPolicy = structuredClone(rereadVerified.policy);
  currentPolicy.zones.notes.crossOwner = 'allow';
  currentPolicy.otherServices = {
    fixtureService: { access: 'preserve' }
  };
  currentPolicy.auditHistory = [
    { id: 'audit-fixture', action: 'policy_changed' }
  ];

  const preview = previewPolicyRestore(
    currentPolicy,
    rereadPolicyBackup
  );

  if (preview.changes.length !== 1
      || preview.changes[0].path !== 'zones.notes.crossOwner'
      || preview.changes[0].current !== 'allow'
      || preview.changes[0].restore !== 'deny') {
    throw new Error('10단계 정책 복원 미리보기가 올바르지 않습니다.');
  }

  results.push({
    attackId: 'policy_restore_previewed',
    expected: '실행 전에 B의 A 자료 허용 변경 한 항목만 표시',
    observed: `로컬 미리보기: ${preview.changes[0].path} allow→deny`
  });

  // 3. 검증한 정책만 복원하고 다른 서비스와 감사 이력을 보존합니다.
  const restoredPolicy = restoreTestPolicy(
    currentPolicy,
    rereadPolicyBackup,
    preview.changes
  );

  if (restoredPolicy.policy.zones.notes.crossOwner !== 'deny'
      || restoredPolicy.policy.zones.notes.ownRead !== 'allow'
      || restoredPolicy.policy.otherServices.fixtureService.access !== 'preserve'
      || restoredPolicy.policy.auditHistory[0]?.id !== 'audit-fixture') {
    throw new Error('10단계 시험 정책 복원 결과가 올바르지 않습니다.');
  }

  results.push({
    attackId: 'safe_policy_restored',
    expected: 'B의 A 자료 요청은 deny로 복원하고 정상 규칙·감사 이력은 보존',
    observed: '로컬 복원: crossOwner=deny; 정상 규칙·감사 이력 보존'
  });

  // 4. 변조된 정책 사본은 사용하지 않습니다.
  const tamperedPolicyBackup = structuredClone(policyBackup);
  tamperedPolicyBackup.policy.zones.notes.crossOwner = 'allow';

  let tamperedPolicyRejected = false;

  try {
    verifySafePolicyBackup(tamperedPolicyBackup);
  } catch (error) {
    tamperedPolicyRejected =
      error.message === 'policy_backup_verification_failed';
  }

  if (!tamperedPolicyRejected) {
    throw new Error('10단계 변조된 정책 사본이 거부되지 않았습니다.');
  }

  results.push({
    attackId: 'tampered_policy_backup_rejected',
    expected: '해시가 다른 정책 사본은 복원 전에 중단',
    observed: '로컬 검증 결과: policy_backup_verification_failed'
  });

  const backupContent = 'fixture-original-content';
  const noteBackup = {
    id: '00000000-0000-4000-8000-00000000000b',
    owner_id: '00000000-0000-4000-8000-0000000000b0',
    title: 'fixture-b-note',
    content: backupContent,
    content_sha256: contentDigest(backupContent),
    sample_marker: config.sampleMarker
  };

  function fakeResponse() {
    return {
      headers: {},
      setHeader(name, value) {
        this.headers[name] = value;
      },
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        this.body = body;
        return this;
      }
    };
  }

  function fakeCreateClient(liveRows, backupRows) {
    return () => ({
      async rpc(name, args) {
        if (name !== 'byteback_restore_note') {
          return {
            data: null,
            error: new Error(`unexpected_rpc:${name}`)
          };
        }

        const backup = backupRows.find(
          (row) =>
            row.id === args.p_id
            && row.owner_id === args.p_owner
        );

        if (!backup
            || contentDigest(backup.content) !== backup.content_sha256) {
          return {
            data: null,
            error: new Error('verified_backup_not_found')
          };
        }

        const existing = liveRows.find(
          (row) => row.id === args.p_id
        );

        if (existing && existing.owner_id !== args.p_owner) {
          return {
            data: null,
            error: new Error('restore_owner_mismatch')
          };
        }

        if (existing) {
          existing.title = backup.title;
          existing.content = backup.content;
          existing.sample_marker = backup.sample_marker;
        } else {
          liveRows.push({
            id: backup.id,
            owner_id: backup.owner_id,
            title: backup.title,
            content: backup.content,
            sample_marker: backup.sample_marker
          });
        }

        return {
          data: [{
            id: backup.id,
            restored: true,
            content_hash: backup.content_sha256,
            record_hash: null,
            owner_matched: true
          }],
          error: null
        };
      },

      from(table) {
        if (table === 'byteback_notes_backup') {
          const filters = [];

          return {
            select() {
              return this;
            },
            eq(field, value) {
              filters.push([field, value]);
              return this;
            },
            async limit(count) {
              return {
                data: backupRows.filter((row) =>
                  filters.every(([field, value]) =>
                    row[field] === value
                  )
                ).slice(0, count)
                .map((row) => structuredClone(row)),
                error: null
              };
            }
          };
        }

        if (table === 'byteback_notes') {
          let restored = null;
          const filters = [];

          return {
            upsert(values) {
              const index = liveRows.findIndex(
                (row) => row.id === values.id
              );

              if (index === -1) {
                liveRows.push({ ...values });
                restored = liveRows.at(-1);
              } else {
                liveRows[index] = {
                  ...liveRows[index],
                  ...values
                };
                restored = liveRows[index];
              }

              return this;
            },
            select() {
              return this;
            },
            eq(field, value) {
              filters.push([field, value]);
              return this;
            },
            async limit(count) {
              return {
                data: liveRows
                  .filter((row) => filters.every(
                    ([field, value]) => row[field] === value
                  ))
                  .slice(0, count)
                  .map((row) => ({ ...row })),
                error: null
              };
            },
            async maybeSingle() {
              return {
                data: restored ? { ...restored } : null,
                error: null
              };
            }
          };
        }

        throw new Error(`unexpected_table:${table}`);
      }
    });
  }

  async function callRestore({
    liveRows,
    backupRows,
    identity = 'b',
    noteId,
    body = {}
  }) {
    const response = fakeResponse();

    await handleRestore({
      method: 'POST',
      headers: {},
      query: {
        noteId: noteId ?? backupRows[0]?.id
      },
      body
    }, response, {
      supabaseUrl:
        new URL(config.identityProvider.issuer).origin,
      verifyLogin: async () => ({
        kind: 'judge',
        userId:
          backupRows[0]?.owner_id
          ?? '00000000-0000-4000-8000-0000000000b0',
        identity
      }),
      createClient:
        fakeCreateClient(liveRows, backupRows),
      loadBackupManifest: async () => ({
        ...safeManifest,
        noteBindingSha256: noteBindingDigest(
          noteBackup.id,
          noteBackup.owner_id,
          noteBackup.content_sha256
        )
      })
    });

    return response;
  }

  // 5. 변조된 B 메모 한 건을 사본에서 복구합니다.
  const modifiedRows = [
    {
      id: noteBackup.id,
      owner_id: noteBackup.owner_id,
      title: 'fixture-modified',
      content: 'fixture-modified-content'
    },
    {
      id: '00000000-0000-4000-8000-00000000000a',
      owner_id: '00000000-0000-4000-8000-0000000000a0',
      title: 'fixture-a-note',
      content: 'fixture-a-preserved'
    }
  ];

  const modifiedResponse = await callRestore({
    liveRows: modifiedRows,
    backupRows: [noteBackup],
    noteId: noteBackup.id
  });

  const modifiedRestored = modifiedRows.find(
    (row) => row.id === noteBackup.id
  );

  if (modifiedResponse.statusCode !== 200
      || modifiedRestored?.owner_id !== noteBackup.owner_id
      || contentDigest(modifiedRestored?.content ?? '')
        !== noteBackup.content_sha256
      || modifiedRows.find(
        (row) => row.id !== noteBackup.id
      )?.content !== 'fixture-a-preserved') {
    throw new Error('10단계 변조 메모 한 건 복구가 올바르지 않습니다.');
  }

  results.push({
    attackId: 'modified_b_note_restored',
    expected: '변조된 B 메모 한 건만 검증된 사본의 ID·소유자·해시로 복구',
    observed: '로컬 복구: 대상 1건 검증 완료; 다른 메모 보존'
  });

  // 6. 삭제된 B 메모도 한 건만 되살립니다.
  const deletedRows = [{
    id: '00000000-0000-4000-8000-00000000000a',
    owner_id: '00000000-0000-4000-8000-0000000000a0',
    title: 'fixture-a-note',
    content: 'fixture-a-preserved'
  }];

  const deletedResponse = await callRestore({
    liveRows: deletedRows,
    backupRows: [noteBackup]
  });

  const deletedRestored = deletedRows.find(
    (row) => row.id === noteBackup.id
  );

  if (deletedResponse.statusCode !== 200
      || !deletedRestored
      || deletedRestored.owner_id !== noteBackup.owner_id
      || contentDigest(deletedRestored.content)
        !== noteBackup.content_sha256
      || deletedRows.length !== 2) {
    throw new Error('10단계 삭제 메모 복구가 올바르지 않습니다.');
  }

  results.push({
    attackId: 'deleted_b_note_restored',
    expected: '삭제된 B 메모 한 건을 검증된 비공개 사본에서 복구',
    observed: '로컬 복구: 삭제 대상 1건 복원 및 ID·소유자·해시 일치'
  });

  // 7. 내용 해시가 바뀐 메모 사본은 거부합니다.
  const badBackup = {
    ...noteBackup,
    content: 'fixture-tampered-backup'
  };

  const rejectedRows = [];

  const badResponse = await callRestore({
    liveRows: rejectedRows,
    backupRows: [badBackup],
    noteId: badBackup.id
  });

  if (badResponse.statusCode !== 409
      || rejectedRows.length !== 0) {
    throw new Error('10단계 잘못된 메모 백업이 거부되지 않았습니다.');
  }

  results.push({
    attackId: 'tampered_note_backup_rejected',
    expected: '내용 해시가 사본과 다르면 메모를 복구하지 않음',
    observed: '로컬 복구 결과: 409; 자료 변경 없음'
  });

  // 8. 시험 계정 B 외에는 복구 경로를 사용할 수 없습니다.
  const deniedRows = [];

  const deniedResponse = await callRestore({
    liveRows: deniedRows,
    backupRows: [noteBackup],
    identity: 'a',
    noteId: noteBackup.id
  });

  if (deniedResponse.statusCode !== 403
      || deniedRows.length !== 0) {
    throw new Error('10단계 B 외 복구 요청이 거부되지 않았습니다.');
  }

  results.push({
    attackId: 'non_b_restore_denied',
    expected: '시험 계정 B 외의 복구 요청은 거부',
    observed: '로컬 복구 결과: 403; 자료 변경 없음'
  });

  // 실제 복구 후 심판의 1~9단계 대표 공격 재전송은 아직 수행하지 않았습니다.
  results.push({
    attackId: 'post_restore_stage_1_9_replay',
    expected: '실제 복구 뒤 1~9단계 정상·금지 요청을 다시 확인',
    observed: '미실행: 실제 대표 공격 재전송은 심판 판정에서 확인'
  });

  return results;
}

async function runStepElevenChecks(config) {
  const results = await runStepTenChecks(config);

  const {
    generateKeyPairSync,
    randomUUID,
    sign
  } = await import('node:crypto');

  const {
    issueAppCertificate,
    proofMessage,
    verifyAppProof
  } = await import('./app-proof.mjs');

  const secret =
    'stage11-local-attack-fixture';

  const identity = {
    userId:
      '11111111-1111-4111-8111-111111111111'
  };

  const context = {
    classId: 'byteback-local-v1',
    projectId: 'a'.repeat(32),
    subjectId: 'fixture-subject',
    deviceId: '0123456789abcdef'
  };

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
    expiresAt:
      Date.now() + 5 * 60 * 1000
  });

  const noteId =
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  const signedRequest = ({
    method = 'GET',
    url = `/api/notes/${noteId}`,
    body
  } = {}) => {
    const time = String(Date.now());
    const nonce = randomUUID();

    const signature = sign(
      'sha256',
      Buffer.from(
        proofMessage({
          method,
          url,
          body,
          certificate:
            approval.certificate,
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
          approval.certificate,
        'x-byteback-app-signature':
          signature,
        'x-byteback-app-time': time,
        'x-byteback-app-nonce': nonce
      }
    };
  };

  const exact = await verifyAppProof({
    req: signedRequest(),
    identity,
    secret,
    context
  });

  if (!exact) {
    throw new Error(
      '승인 기기의 정확한 서명 요청이 거부되었습니다.'
    );
  }

  results.push({
    attackId:
      'approved_device_signed_request',
    expected:
      '승인된 기기의 정확한 method·path·body 서명은 검증 성공',
    observed:
      '로컬 요청 서명 검증: 허용'
  });

  const unsigned = await verifyAppProof({
    req: {
      method: 'GET',
      url: `/api/notes/${noteId}`,
      headers: {}
    },
    identity,
    secret,
    context
  });

  if (unsigned) {
    throw new Error(
      '서명 없는 보호 요청이 허용되었습니다.'
    );
  }

  results.push({
    attackId:
      'unsigned_protected_request_denied',
    expected:
      '서명 없는 보호 요청은 거부',
    observed:
      '로컬 요청 서명 검증: 거부'
  });

  const changedPath = signedRequest();
  changedPath.url =
    '/api/notes/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  if (await verifyAppProof({
    req: changedPath,
    identity,
    secret,
    context
  })) {
    throw new Error(
      '서명 뒤 변경한 요청 경로가 허용되었습니다.'
    );
  }

  results.push({
    attackId: 'signed_path_change_denied',
    expected:
      '서명 뒤 요청 경로를 바꾸면 거부',
    observed:
      '로컬 요청 서명 검증: 경로 변조 거부'
  });

  const changedBody = signedRequest({
    method: 'PUT',
    body: {
      title: '원본',
      body: '원본'
    }
  });

  changedBody.body = {
    title: '변조',
    body: '원본'
  };

  if (await verifyAppProof({
    req: changedBody,
    identity,
    secret,
    context
  })) {
    throw new Error(
      '서명 뒤 변경한 PUT 본문이 허용되었습니다.'
    );
  }

  results.push({
    attackId: 'signed_body_change_denied',
    expected:
      '서명 뒤 PUT 본문을 바꾸면 거부',
    observed:
      '로컬 요청 서명 검증: 본문 변조 거부'
  });

  return results;
}
