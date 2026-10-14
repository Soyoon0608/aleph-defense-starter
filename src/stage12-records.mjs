import { randomUUID } from 'node:crypto';

export async function runAttackRecords(config) {
  const app =
    new URL(config.publicAppUrl);
  
  if (app.protocol !== 'https:'
      || app.pathname !== '/'
      || app.search
      || app.hash
      || app.username
      || app.password) {
    throw new Error(
      'publicAppUrl을 확인해 주세요.'
    );
  }
  
  const rows = [];
  
  const row = (
    attackId,
    stage,
    kind,
    area,
    expected
  ) => ({
    attackId,
    stage,
    kind,
    area,
    expected,
    observed: '',
    result: 'not_run',
    requestIds: [],
    checkedAt: null
  });
  
  const add = item => {
    rows.push(item);
    return item;
  };
  
  const notRun = (item, reason) => {
    item.observed = `미실행: ${reason}`;
    item.result = 'not_run';
    return item;
  };
  
  async function probe(
    item,
    url,
    {
      headers = {},
      check
    }
  ) {
    const requestId = randomUUID();
  
    item.requestIds = [requestId];
    item.checkedAt =
      new Date().toISOString();
  
    try {
      const response =
        await fetch(url, {
          method: 'GET',
          cache: 'no-store',
          redirect: 'error',
          headers: {
            accept: 'application/json',
            ...headers
          },
          signal:
            AbortSignal.timeout(10000),
  
          alephEvidence: {
            caseId: item.attackId,
            requestKey: requestId
          }
        });
  
      const text =
        await response.text();
  
      let json = null;
  
      try {
        json = JSON.parse(text);
      } catch {
        // JSON이 아닌 응답도 HTTP 결과로 기록합니다.
      }
  
      let detail = '';
  
      if (Array.isArray(json?.notes)) {
        detail =
          `; notes=${json.notes.length}`;
      } else if (
        typeof json?.ready === 'boolean'
      ) {
        detail =
          `; jsonReady=${json.ready}`;
      } else if (
        typeof json?.display === 'string'
      ) {
        detail =
          `; display=${json.display}`;
      }
  
      item.observed =
        `HTTP ${response.status}${detail}`;
  
      const ok =
        check({
          response,
          json,
          text
        });
  
      item.result =
        ok
          ? (
              item.kind === 'allow'
                ? 'allowed'
                : 'blocked'
            )
          : 'unexpected';
    } catch (error) {
      item.observed =
        `미실행: 응답 없이 실패 (${String(
          error?.name ?? 'Error'
        ).slice(0, 40)})`;
  
      item.result = 'not_run';
    }
  
    return item;
  }
  
  const deny401 =
    ({ response, text }) =>
      response.status === 401
      && !/"(?:title|content|body)"\s*:/u
        .test(text);
  
  const denyAny =
    ({ response, text }) =>
      [401, 403, 404, 405]
        .includes(response.status)
      && !/"(?:title|content|body)"\s*:/u
        .test(text);
  
  const ruleCase = async (
    attackId,
    stage,
    kind,
    area,
    expected
  ) =>
    probe(
      add(
        row(
          attackId,
          stage,
          kind,
          area,
          expected
        )
      ),
      new URL(
        `/api/checks?case=${attackId}`,
        app
      ),
      {
        check:
          ({ response, json }) =>
            response.status === 200
            && json?.ready === true
      }
    );
  
  /* 1~2단계: 공개 시작 자료가 현재 최종 상태에 남지 않았는지 */
  await probe(
    add(
      row(
        'stage1_public_seed_removed',
        1,
        'deny',
        'access',
        '최종 상태에서 시작 틀 공개 메모가 남아 있지 않음'
      )
    ),
    new URL('/data.json', app),
    {
      check:
        ({ response, json }) =>
          response.status === 200
          && Array.isArray(json?.notes)
          && json.notes.length === 0
    }
  );
  
  await probe(
    add(
      row(
        'static_data_json_notes',
        2,
        'deny',
        'access',
        '정적 /data.json의 메모 배열이 비어 있음'
      )
    ),
    new URL('/data.json', app),
    {
      check:
        ({ response, json }) =>
          response.status === 200
          && Array.isArray(json?.notes)
          && json.notes.length === 0
    }
  );
  
  /* 3단계 */
  await probe(
    add(
      row(
        'anonymous_list_read',
        3,
        'deny',
        'access',
        '로그인 없는 GET /api/notes는 자료 없이 401'
      )
    ),
    new URL('/api/notes', app),
    {
      check: deny401
    }
  );
  
  await probe(
    add(
      row(
        'forged_token_list_read',
        3,
        'deny',
        'access',
        '위조 토큰 GET /api/notes는 자료 없이 401'
      )
    ),
    new URL('/api/notes', app),
    {
      headers: {
        authorization:
          'Bearer aaa.bbb.ccc'
      },
      check: deny401
    }
  );
  
  add(
    notRun(
      row(
        'anonymous_write',
        3,
        'deny',
        'access',
        '비로그인 쓰기 요청 거부'
      ),
      '실제 자료를 바꾸는 POST·PUT·DELETE는 이 기록 절차에서 보내지 않음'
    )
  );
  
  /* 4단계 */
  await probe(
    add(
      row(
        'query_identity_ignored',
        4,
        'deny',
        'access',
        '쿼리의 userId·role을 권한으로 믿지 않고 401'
      )
    ),
    new URL(
      '/api/notes?userId=00000000-0000-4000-8000-000000000000&role=instructor',
      app
    ),
    {
      check: deny401
    }
  );
  
  await probe(
    add(
      row(
        'header_identity_ignored',
        4,
        'deny',
        'access',
        '헤더의 사용자·역할을 권한으로 믿지 않고 401'
      )
    ),
    new URL('/api/notes', app),
    {
      headers: {
        'x-user-id':
          '00000000-0000-4000-8000-000000000000',
        'x-role': 'instructor'
      },
      check: deny401
    }
  );
  
  add(
    notRun(
      row(
        'login_required',
        4,
        'allow',
        'access',
        '로그인 본인 CRUD와 타인 차단'
      ),
      '로그인 토큰과 실제 쓰기 요청이 필요하므로 자동 기록에서 실행하지 않음'
    )
  );
  
  /* 5단계 */
  await probe(
    add(
      row(
        'app_page_available',
        5,
        'allow',
        'app',
        '자료실 첫 화면 GET이 200'
      )
    ),
    new URL('/', app),
    {
      headers: {
        accept: 'text/html'
      },
      check:
        ({ response }) =>
          response.status === 200
    }
  );
  
  await probe(
    add(
      row(
        'original_direct_no_key',
        5,
        'deny',
        'access',
        '키 없는 원본 Data API 직접 GET 거부'
      )
    ),
    `${config.originalApiUrl}?select=id&limit=1`,
    {
      check:
        ({ response }) =>
          [401, 403].includes(
            response.status
          )
    }
  );
  
  /* 6~9단계: 실제 /api/checks 응답으로 고정 가상 입력 판정 */
  await ruleCase(
    'registered_device_note_allowed',
    6,
    'allow',
    'decision',
    '등록 기기의 정상 메모 가상 요청 allow'
  );
  
  await ruleCase(
    'unregistered_device_denied',
    6,
    'deny',
    'decision',
    '미등록 기기 가상 요청 deny'
  );
  
  await ruleCase(
    'unusual_access_step_up',
    7,
    'deny',
    'decision',
    '복합 이상 접속 가상 요청 step_up'
  );
  
  await ruleCase(
    'other_zone_route_denied',
    8,
    'deny',
    'decision',
    '강사 자료 구역 가상 요청 deny'
  );
  
  await ruleCase(
    'burst_read_revocation',
    9,
    'deny',
    'detection',
    '10분 내 과다 GET 가상 사건은 회수 제안'
  );
  
  /* 10단계 */
  await probe(
    add(
      row(
        'restore_without_login',
        10,
        'deny',
        'restore',
        '로그인 없는 복구 경로는 보호됨'
      )
    ),
    new URL(
      '/api/restore/00000000-0000-4000-8000-000000000000',
      app
    ),
    {
      check: denyAny
    }
  );
  
  /* 11단계 */
  await probe(
    add(
      row(
        'pwa_manifest_available',
        11,
        'allow',
        'app',
        '설치형 웹앱 manifest가 200이고 standalone'
      )
    ),
    new URL(
      '/manifest.webmanifest',
      app
    ),
    {
      check:
        ({ response, json }) =>
          response.status === 200
          && json?.display ===
            'standalone'
    }
  );
  
  await probe(
    add(
      row(
        'device_status_without_login',
        11,
        'deny',
        'device',
        '로그인 없는 기기 상태 조회는 승인되지 않음'
      )
    ),
    new URL('/api/device', app),
    {
      check: deny401
    }
  );
  
  add(
    notRun(
      row(
        'approved_device_signed_requests',
        11,
        'allow',
        'device',
        '승인된 로그인 기기의 서명 요청으로 기존 자료실 사용'
      ),
      '실제 로그인과 관리자 승인 principal binding이 필요해 자동 기록에서 실행하지 않음'
    )
  );

  return rows;
}
