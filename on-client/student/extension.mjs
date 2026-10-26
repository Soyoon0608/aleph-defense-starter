// 이 파일은 학생이 같은 프로젝트에서 이어서 구현합니다.
// 제공 UI를 받은 것만으로 단계 완료를 인정하지 않습니다.
export function createStudentView() {
  return {
    renderIdentity({ me, devices, sessions } = {}) {
      const root = document.createElement('section');
      root.setAttribute('aria-label', '로그인 사용자·기기·세션');

      const deviceLabels = {
        compliant: '보안 기준 충족',
        noncompliant: '보안 기준 미충족',
        unknown: '확인 불가',
      };

      const sessionLabels = {
        active: '활성',
        expired: '만료',
        revoked: '철회됨',
        unknown: '확인 불가',
      };

      function text(parent, tag, content) {
        const element = document.createElement(tag);
        element.textContent = content;
        parent.append(element);
        return element;
      }

      function value(input) {
        return typeof input === 'string' && input.trim()
          ? input
          : '확인 불가';
      }

      // 기기 정보 및 원래 상태 코드 표시
      function device(parent, item) {
        text(parent, 'p', '기기 이름: ' + value(item?.label));
        text(parent, 'p', '기기 ID: ' + value(item?.id));

        const status = item?.status;
        const label = Object.hasOwn(deviceLabels, status)
          ? deviceLabels[status]
          : '확인 불가';

        text(parent, 'p', '기기 상태: ' +
          label + ' (' + value(status) + ')');
      }

      // 세션 정보 및 원래 상태 코드 표시
      function session(parent, item) {
        text(parent, 'p', '세션 ID: ' + value(item?.id));

        const status = item?.status;
        const label = Object.hasOwn(sessionLabels, status)
          ? sessionLabels[status]
          : '확인 불가';

        text(parent, 'p', '세션 상태: ' +
          label + ' (' + value(status) + ')');
      }

      function section(title, state, renderData) {
        const panel = document.createElement('section');
        text(panel, 'h3', title);

        const modeLabels = {
          demo: '예제 자료',
          disconnected: '연결 없음',
          unknown: '확인 불가',
        };

        if (Object.hasOwn(modeLabels, state?.mode)) {
          text(panel, 'p', modeLabels[state.mode]);
        } else if (!state || typeof state.mode !== 'string') {
          text(panel, 'p', '연결 모드: 확인 불가');
        }

        if (state?.status === 'loading') {
          text(panel, 'p', '불러오는 중');
        } else if (state?.status === 'error') {
          text(panel, 'p', '연결 실패: ' + value(state.error?.message));
        } else if (state?.status === 'ok') {
          renderData(panel, state.data);
        } else {
          text(panel, 'p', '상태 확인 불가');
        }

        root.append(panel);
      }

      section('현재 사용자·기기·세션', me, (panel, data) => {
        text(panel, 'p', '사용자 이름: ' + value(data?.user?.label));
        text(panel, 'p', '사용자 ID: ' + value(data?.user?.id));
        device(panel, data?.device);
        session(panel, data?.session);
      });

      section('기기 목록', devices, (panel, data) => {
        if (!Array.isArray(data)) {
          text(panel, 'p', '기기 목록 확인 불가');
          return;
        }

        if (data.length === 0) {
          text(panel, 'p', '표시할 기기 없음');
          return;
        }

        const list = document.createElement('ul');

        for (const item of data) {
          const row = document.createElement('li');
          device(row, item);
          list.append(row);
        }

        panel.append(list);
      });

      section('세션 목록', sessions, (panel, data) => {
        if (!Array.isArray(data)) {
          text(panel, 'p', '세션 목록 확인 불가');
          return;
        }

        if (data.length === 0) {
          text(panel, 'p', '표시할 세션 없음');
          return;
        }

        const list = document.createElement('ul');

        for (const item of data) {
          const row = document.createElement('li');
          session(row, item);
          list.append(row);
        }

        panel.append(list);
      });

      return root;
    },

    renderDecision({ status, mode, data, error, appId } = {}) {
      const root = document.createElement('section');
      root.setAttribute('aria-label', '업무 앱 접근 판정');

      function line(content) {
        const element = document.createElement('p');
        element.textContent = content;
        root.append(element);
      }

      function value(input, fallback = '확인 불가') {
        return typeof input === 'string' && input.trim()
          ? input
          : fallback;
      }

      const modeLabels = {
        demo: '예제 자료 · 실제 연결 아님',
        disconnected: '연결 없음',
        unknown: '확인 불가',
      };

      if (Object.hasOwn(modeLabels, mode)) {
        line(modeLabels[mode]);
      }

      line('선택한 앱 ID: ' + value(appId));

      if (status === 'idle') {
        line('앱을 골라 접속을 요청하세요.');
        return root;
      }

      if (status === 'loading') {
        line('판정 확인 중');
        return root;
      }

      if (status === 'error') {
        line('요청 실패: ' + value(error?.message, '오류 설명 없음'));
        line('요청 실패는 접근 거부 판정이 아닙니다.');
        line('접근 허용 여부를 확인할 수 없습니다.');
        return root;
      }

      if (status !== 'ok') {
        line('판정 확인 불가(unknown)');
        return root;
      }

      // 선택한 앱과 다른 응답을 현재 판정으로 표시하지 않습니다.
      if (
        typeof appId !== 'string' ||
        !appId.trim() ||
        data?.appId !== appId
      ) {
        line('판정 확인 불가(unknown)');
        line('선택한 앱과 판정 응답의 앱 ID가 일치하지 않습니다.');
        return root;
      }

      const labels = {
        allow: '접근 허용(allow)',
        deny: '접근 거부(deny)',
        challenge: '추가 인증 또는 확인 필요(challenge)',
        unknown: '판정 확인 불가(unknown)',
      };

      const decision = Object.hasOwn(labels, data?.decision)
        ? data.decision
        : 'unknown';

      line('판정: ' + labels[decision]);
      line('판정 이유: ' + value(data?.reason, '판정 이유 확인 불가'));
      line('판정 시각: ' + value(data?.checkedAt, '판정 시각 확인 불가'));

      if (decision === 'allow') {
        line('정책상 접근 허용이며 실제 앱 접속 성공을 보장하지 않습니다.');
      } else if (decision === 'challenge') {
        line('추가 인증 또는 확인이 필요합니다.');
        line('이 앱이 확인 절차를 대신 수행하지 않습니다.');
      } else if (decision === 'unknown') {
        line('접근 허용 여부를 확인할 수 없습니다.');
      }

      return root;
    },

    renderEvents({ status, mode, data, error } = {}) {
      const root = document.createElement('section');
      root.setAttribute('aria-label', '본인 접속 기록과 XDR 경보');

      function add(parent, tag, content) {
        const node = document.createElement(tag);
        node.textContent = content;
        parent.append(node);
        return node;
      }

      function value(input, fallback = '확인 불가') {
        return typeof input === 'string' && input.trim()
          ? input : fallback;
      }

      const modeLabels = {
        demo: '예제 자료 · 실제 연결 아님',
        disconnected: '연결 없음',
        unknown: '확인 불가',
      };
      if (Object.hasOwn(modeLabels, mode)) {
        add(root, 'p', modeLabels[mode]);
      }
      add(root, 'p', '조회 범위: 본인의 최근 기록 최대 40건입니다. 전체 직원 이력이 아니며, 저장된 XDR 경보를 표시합니다. 화면에서 새로 탐지하지 않습니다.');

      if (status === 'loading') {
        add(root, 'p', '기록을 불러오는 중');
        return root;
      }
      if (status === 'error') {
        const message = value(error?.message, '오류 설명 없음');
        add(root, 'p', error?.code === 'CONTRACT_MISMATCH'
          ? '기록 확인 불가: ' + message
          : '기록을 불러오지 못했습니다: ' + message);
        return root;
      }
      if (status !== 'ok' || !Array.isArray(data)) {
        add(root, 'p', '기록 확인 불가');
        return root;
      }

      // 원본 배열은 수정하지 않습니다.
      const records = [...data].sort((a, b) => {
        const first = Date.parse(a?.at);
        const second = Date.parse(b?.at);
        return (Number.isFinite(second) ? second : -Infinity) -
          (Number.isFinite(first) ? first : -Infinity);
      });

      const kindLabels = { access: '접속 기록', xdr: 'XDR 경보' };
      const accessLabels = {
        allowed: '접근 허용',
        denied: '접근 거부',
        unknown: '확인 불가',
      };
      const sessionLabels = {
        active: '활성',
        expired: '만료',
        revoked: '철회됨',
        unknown: '확인 불가',
      };
      const deviceLabels = {
        compliant: '보안 기준 충족',
        noncompliant: '보안 기준 미충족',
        unknown: '확인 불가',
      };

      function stateText(labels, raw) {
        const key = Object.hasOwn(labels, raw) ? raw : 'unknown';
        return labels[key] + '(' + key + ')';
      }

      const filters = document.createElement('div');
      root.append(filters);

      function makeFilter(name, values, labelFor) {
        const label = document.createElement('label');
        const caption = document.createElement('span');
        caption.textContent = name + ' ';
        const select = document.createElement('select');
        select.setAttribute('aria-label', name);

        const all = document.createElement('option');
        all.value = 'all';
        all.textContent = '전체';
        select.append(all);

        for (const raw of [...new Set(values)].filter(
          item => typeof item === 'string' && item.trim()
        )) {
          const option = document.createElement('option');
          option.value = raw;
          option.textContent = labelFor(raw);
          select.append(option);
        }

        label.append(caption, select);
        filters.append(label);
        return select;
      }

      const kindFilter = makeFilter(
        '기록 종류',
        records.map(item => item.kind),
        raw => (kindLabels[raw] || '확인 불가') + '(' + raw + ')'
      );
      const appFilter = makeFilter(
        '업무 앱',
        records.map(item => item.appId),
        raw => raw
      );
      const accessFilter = makeFilter(
        '접속 상태',
        records.map(item => item.state?.access),
        raw => stateText(accessLabels, raw)
      );

      const count = add(root, 'p', '');
      count.setAttribute('aria-live', 'polite');
      const list = document.createElement('ul');
      const detail = document.createElement('section');
      detail.setAttribute('aria-label', '선택한 기록 상세');
      root.append(list, detail);

      function showDetail(event) {
        detail.replaceChildren();
        detail.setAttribute('data-student-event-detail', event.id);
        add(detail, 'h3', '기록 상세');
        add(detail, 'p', '사건 ID: ' + value(event.id));
        add(detail, 'p', '업무 앱: ' +
          value(event.appId, '앱 확인 불가'));
        add(detail, 'p', '시각: ' + value(event.at));

        function showEntries(title, entries) {
          add(detail, 'h4', title);
          if (!Array.isArray(entries)) {
            add(detail, 'p', title + ' 확인 불가');
          } else if (entries.length === 0) {
            add(detail, 'p', '제공된 ' + title + ' 없음');
          } else {
            for (const entry of entries) {
              add(detail, 'p', 'ID: ' + value(entry?.id) +
                ' · 내용: ' + value(entry?.text));
            }
          }
        }

        showEntries('근거', event.evidence);
        showEntries('규칙', event.rules);
        add(detail, 'h4', '상태');
        add(detail, 'p', '접속 상태: ' +
          stateText(accessLabels, event.state?.access));
        add(detail, 'p', '세션 상태: ' +
          stateText(sessionLabels, event.state?.session));
        add(detail, 'p', '기기 상태: ' +
          stateText(deviceLabels, event.state?.device));

        const actions = Array.isArray(event.supportedActions)
          ? event.supportedActions.filter(
            action => typeof action === 'string' && action.trim()
          ) : [];
        if (actions.length > 0) {
          add(detail, 'h4', '미지원 조치');
          add(detail, 'p',
            '조치 실행 연결은 준비 중입니다. 아직 지원하지 않는 조치이며 요청을 전송하지 않습니다.');
          for (const action of new Set(actions)) {
            const button = add(detail, 'button', action + ' 미지원');
            button.type = 'button';
            button.disabled = true;
          }
        }
      }

      function renderList() {
        list.replaceChildren();
        detail.replaceChildren();
        detail.removeAttribute('data-student-event-detail');

        const visible = records.filter(event =>
          (kindFilter.value === 'all' ||
            event.kind === kindFilter.value) &&
          (appFilter.value === 'all' ||
            event.appId === appFilter.value) &&
          (accessFilter.value === 'all' ||
            event.state?.access === accessFilter.value)
        );

        count.textContent = '표시 ' + visible.length +
          '건 / 받은 기록 ' + records.length + '건';

        if (visible.length === 0) {
          add(list, 'li', records.length === 0
            ? '표시할 기록이 없습니다'
            : '필터 조건에 맞는 기록이 없습니다');
          return;
        }

        for (const event of visible) {
          const row = document.createElement('li');
          row.setAttribute('data-student-event-id', event.id);
          add(row, 'p', '사건 ID: ' + value(event.id));
          add(row, 'p', '시각: ' + value(event.at));
          add(row, 'p', '종류: ' +
            (kindLabels[event.kind] || '확인 불가') +
            '(' + value(event.kind) + ')');
          add(row, 'p', '업무 앱: ' +
            value(event.appId, '앱 확인 불가'));
          add(row, 'p', '요약: ' + value(event.summary));

          const button = document.createElement('button');
          button.type = 'button';
          button.textContent = event.id + ' 상세';
          button.addEventListener('click', () => showDetail(event));
          row.append(button);
          list.append(row);
        }
      }

      for (const select of [kindFilter, appFilter, accessFilter]) {
        select.addEventListener('change', renderList);
      }
      renderList();
      return root;
    },

    renderStatus({
      devices, sessions, notifications, diagnostics, mode
    } = {}) {
      const root = document.createElement('section');
      root.setAttribute('aria-label', '기기·세션·알림·진단 상태');

      function add(parent, tag, content) {
        const node = document.createElement(tag);
        node.textContent = content;
        parent.append(node);
        return node;
      }

      function safe(input, fallback = '확인 불가') {
        if (typeof input !== 'string' || !input.trim()) return fallback;
        return input
          .replace(/-----BEGIN[\s\S]*?PRIVATE KEY-----[\s\S]*?(?:-----END[\s\S]*?PRIVATE KEY-----|$)/g, '[비밀값 제거]')
          .replace(/\bBearer\s+\S+/gi, 'Bearer [비밀값 제거]')
          .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[비밀값 제거]')
          .replace(/\b(?:sb_secret_|sk-)[A-Za-z0-9_-]+/g, '[비밀값 제거]')
          .replace(/((?:password|passwd|token|api[_-]?key|secret)\s*["']?\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,;]+)/gi, '$1[비밀값 제거]');
      }

      const modeLabels = {
        demo: '예제 자료 · 실제 연결 아님',
        disconnected: '연결 없음',
        unknown: '확인 불가'
      };

      function showMode(parent, currentMode) {
        if (Object.hasOwn(modeLabels, currentMode)) {
          add(parent, 'p', modeLabels[currentMode]);
        }
      }

      function failure(parent, title, error) {
        const timeout = /timeout|timed.out|시간.*초과/i.test(
          String(error?.code || '') + ' ' + String(error?.message || '')
        );
        add(parent, 'p', title + ' 조회에 실패했습니다' +
          (timeout ? ' · 시간 초과' : '') + ': ' +
          safe(error?.message, '오류 설명 없음'));
        add(parent, 'p',
          '다시 시도는 위쪽 다시 불러오기 버튼을 직접 누르세요.');
      }

      const deviceLabels = {
        compliant: '보안 기준 충족',
        noncompliant: '보안 기준 미충족',
        unknown: '확인 불가'
      };
      const sessionLabels = {
        active: '활성',
        expired: '만료',
        revoked: '철회됨',
        unknown: '확인 불가'
      };

      function stateText(labels, raw) {
        const key = Object.hasOwn(labels, raw) ? raw : 'unknown';
        return labels[key] + '(' + key + ')';
      }

      function resource(title, state, emptyMessage, renderItem) {
        const panel = add(root, 'section', '');
        add(panel, 'h3', title);
        showMode(panel, state?.mode);

        if (state?.status === 'loading') {
          add(panel, 'p', title + ' 불러오는 중');
        } else if (state?.status === 'error') {
          failure(panel, title, state.error);
        } else if (state?.status === 'ok' && Array.isArray(state.data)) {
          if (state.data.length === 0) {
            add(panel, 'p', emptyMessage);
          } else {
            const list = add(panel, 'ul', '');
            for (const item of state.data) {
              renderItem(add(list, 'li', ''), item);
            }
          }
        } else {
          add(panel, 'p', title + ' 확인 불가');
        }
      }

      showMode(root, mode);
      add(root, 'p',
        '등록 기기는 최대 100개까지 표시되며, 세션은 현재 검증된 연결 하나입니다. 지난 세션 전체 목록이 아닙니다.');

      resource('기기 목록', devices, '등록된 기기가 없습니다',
        (row, item) => {
          add(row, 'p', '기기 이름: ' + safe(item?.label));
          add(row, 'p', '기기 상태: ' +
            stateText(deviceLabels, item?.status));
        });

      resource('세션 목록', sessions, '현재 연결이 없습니다',
        (row, item) => {
          add(row, 'p', '세션 ID: ' + safe(item?.id));
          add(row, 'p', '세션 상태: ' +
            stateText(sessionLabels, item?.status));
        });

      const noticePanel = add(root, 'section', '');
      add(noticePanel, 'h3', '알림');
      if (!Array.isArray(notifications)) {
        add(noticePanel, 'p', '알림 확인 불가');
      } else if (notifications.length === 0) {
        add(noticePanel, 'p', '주의할 알림이 없습니다');
      } else {
        const list = add(noticePanel, 'ul', '');
        for (const notice of notifications) {
          const row = add(list, 'li', '');
          add(row, 'p', '자료(resource): ' + safe(notice?.resource));
          add(row, 'p', '코드(code): ' + safe(notice?.code));
          add(row, 'p', '내용: ' + safe(notice?.message));
        }
      }

      const diagnosticPanel = add(root, 'section', '');
      add(diagnosticPanel, 'h3', '진단 정보');
      showMode(diagnosticPanel, diagnostics?.mode);

      let safeDiagnostics = null;
      if (diagnostics?.status === 'loading') {
        add(diagnosticPanel, 'p', '진단 정보 불러오는 중');
      } else if (diagnostics?.status === 'error') {
        failure(diagnosticPanel, '진단 정보', diagnostics.error);
        add(diagnosticPanel, 'p',
          '진단 정보는 아래 제공 도움정보 영역의 도움정보 불러오기 버튼으로 다시 조회하세요.');
      } else if (
        diagnostics?.status === 'ok' &&
        diagnostics.data &&
        typeof diagnostics.data === 'object' &&
        !Array.isArray(diagnostics.data)
      ) {
        const data = diagnostics.data;
        safeDiagnostics = {
          requestId: safe(data.requestId),
          component: safe(data.component),
          version: safe(data.version),
          checkedAt: safe(data.checkedAt),
          engine: {
            mode: safe(data.engine?.mode),
            code: safe(data.engine?.code)
          }
        };
        for (const key of ['requestId', 'component', 'version', 'checkedAt']) {
          add(diagnosticPanel, 'p', key + ': ' + safeDiagnostics[key]);
        }
        add(diagnosticPanel, 'p',
          'engine.mode: ' + safeDiagnostics.engine.mode);
        add(diagnosticPanel, 'p',
          'engine.code: ' + safeDiagnostics.engine.code);
      } else if (diagnostics?.status === 'idle') {
        add(diagnosticPanel, 'p',
          '진단 정보는 아직 불러오지 않았습니다');
        add(diagnosticPanel, 'p',
          '진단 정보는 아래 제공 도움정보 영역의 도움정보 불러오기 버튼을 눌러 확인하세요.');
      } else {
        add(diagnosticPanel, 'p', '진단 정보 확인 불가');
      }

      add(diagnosticPanel, 'p',
        '도움 요청에 사용할 지정된 진단 항목만 복사합니다.');
      const copy = add(diagnosticPanel, 'button', '도움정보 복사');
      copy.type = 'button';
      copy.disabled = safeDiagnostics === null;
      const feedback = add(diagnosticPanel, 'p', '');
      feedback.setAttribute('role', 'status');

      copy.addEventListener('click', async () => {
        if (!safeDiagnostics) return;
        try {
          await navigator.clipboard.writeText(
            JSON.stringify(safeDiagnostics, null, 2)
          );
          feedback.textContent = '도움정보를 복사했습니다.';
        } catch {
          feedback.textContent =
            '도움정보를 복사하지 못했습니다. 브라우저의 클립보드 권한을 확인한 뒤 도움정보 복사 버튼을 다시 누르세요.';
        }
      });

      return root;
    },

    renderVulnerabilities({ status, mode, data, error } = {}) {
      const root = document.createElement('section');
      root.setAttribute('aria-label', '학생 설치 패키지 취약점 조회 결과');

      function add(parent, tag, content) {
        const node = document.createElement(tag);
        node.textContent = content;
        parent.append(node);
        return node;
      }

      function value(input, fallback = '확인 불가') {
        if (typeof input === 'string' && input.trim()) return input;
        if (typeof input === 'number' && Number.isFinite(input)) {
          return String(input);
        }
        return fallback;
      }

      function safeMessage(input) {
        return value(input, '오류 설명 없음')
          .replace(/-----BEGIN[\s\S]*?PRIVATE KEY-----[\s\S]*?(?:-----END[\s\S]*?PRIVATE KEY-----|$)/g, '[비밀값 제거]')
          .replace(/\bBearer\s+\S+/gi, 'Bearer [비밀값 제거]')
          .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[비밀값 제거]')
          .replace(/\b(?:sb_secret_|sk-)[A-Za-z0-9_-]+/g, '[비밀값 제거]')
          .replace(/((?:password|passwd|token|api[_-]?key|secret)\s*["']?\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,;]+)/gi, '$1[비밀값 제거]');
      }

      function field(parent, label, input) {
        if (input !== undefined && input !== null) {
          add(parent, 'p', label + ': ' + value(input));
        }
      }

      const modes = {
        demo: '예제 자료 · 실제 연결 아님',
        disconnected: '연결 없음',
        unknown: '연결 상태 확인 불가'
      };
      if (Object.hasOwn(modes, mode)) add(root, 'p', modes[mode]);

      if (status === 'idle') {
        add(root, 'p', '설치 패키지 취약점 조회 전');
        add(root, 'p', '조회하려면 제공 화면의 설치 패키지 조회 버튼을 직접 누르세요.');
        return root;
      }

      if (status === 'loading') {
        add(root, 'p', '설치 패키지 취약점 조회 중');
        return root;
      }

      if (status === 'error') {
        add(root, 'p', '조회 실패: ' + safeMessage(error?.message));
        if (typeof error?.code === 'string' &&
            /^[A-Z][A-Z0-9_]{0,79}$/.test(error.code)) {
          add(root, 'p', '오류 코드: ' + error.code);
        }
        add(root, 'p', '조회 실패는 알려진 취약점이 없다는 뜻이 아닙니다.');
        add(root, 'p', '다시 조회하려면 제공 화면의 설치 패키지 조회 버튼을 직접 누르세요.');
        return root;
      }

      if (status !== 'ok' || !data || typeof data !== 'object') {
        add(root, 'p', '설치 패키지 조회 결과 확인 불가');
        return root;
      }

      const resultLabels = {
        complete: '모두 조회',
        partial: '일부 조회 실패',
        not_checked: '아직 조회 안 함',
        not_configured: '조회 준비 미완료',
        unverifiable: 'lock 파일 확인 불가'
      };

      const resultLabel = Object.hasOwn(resultLabels, data.status)
        ? resultLabels[data.status] : '조회 상태 확인 불가';
      add(root, 'p', '전체 조회 상태: ' +
        resultLabel + '(' + value(data.status) + ')');

      field(root, 'lockfileVersion', data.lockfileVersion);
      field(root, 'lockfileHash', data.lockfileHash);
      field(root, '전체 확인 시각(checkedAt)', data.checkedAt);

      if (data.status === 'not_configured') {
        add(root, 'p', '조회 대상 프로젝트 설정이 필요합니다. 대상 경로와 공개 패키지 허용 설정은 담당자에게 확인하세요.');
      } else if (data.status === 'not_checked') {
        add(root, 'p', '아직 조회하지 않았습니다. 승인된 공개 조회 대상이 없는 경우 등을 포함하며, 취약점 없음으로 판단할 수 없습니다.');
      } else if (data.status === 'unverifiable') {
        add(root, 'p', 'lock 파일과 설치 패키지의 대조 결과를 확인할 수 없습니다. 취약점 없음으로 판단할 수 없습니다.');
      } else if (data.status === 'partial') {
        add(root, 'p', '일부 조회가 실패했습니다. 이미 받은 취약점 ID는 아래에 유지하며, 전체 결과는 확인되지 않았습니다.');
      }

      add(root, 'p', '아래 설치 버전은 제공 화면이 전달한 값을 표시합니다. 학생 화면에서 버전 범위를 설치 버전으로 계산하거나 패키지를 변경하지 않습니다.');
      add(root, 'p', 'OSV는 알려진 취약점 데이터베이스입니다. 조회 결과가 없더라도 패키지나 앱 전체의 안전을 보장하지 않습니다.');

      if (!Array.isArray(data.packages)) {
        add(root, 'p', '패키지 목록 확인 불가');
        return root;
      }

      if (data.packages.length === 0) {
        add(root, 'p', '표시할 패키지 조회 결과가 없습니다. 이 문구는 취약점이 없다는 뜻이 아닙니다.');
        return root;
      }

      const packageLabels = {
        known_vulnerabilities: '알려진 항목 있음',
        none_found: '알려진 항목 없음',
        unverifiable: '조회 확인 불가'
      };

      const list = add(root, 'ul', '');
      for (const item of data.packages) {
        const row = add(list, 'li', '');

        if (typeof item?.name === 'string') {
          row.setAttribute('data-student-package-name', item.name);
        }
        if (typeof item?.version === 'string') {
          row.setAttribute('data-student-package-version', item.version);
        }

        add(row, 'h3', '패키지: ' + value(item?.name));
        add(row, 'p', '설치 버전(version): ' + value(item?.version));

        const packageLabel = Object.hasOwn(packageLabels, item?.status)
          ? packageLabels[item.status] : '조회 상태 확인 불가';
        add(row, 'p', '패키지 조회 상태: ' +
          packageLabel + '(' + value(item?.status) + ')');
        add(row, 'p', '출처(source): ' + value(item?.source));
        add(row, 'p', '확인 시각(checkedAt): ' + value(item?.checkedAt));

        const vulnerabilities = item?.vulnerabilities;
        if (item?.status === 'unverifiable') {
          add(row, 'p', Array.isArray(vulnerabilities) &&
            vulnerabilities.length > 0
            ? '일부 확인·전체 조회 확인 불가'
            : '조회 결과를 확인할 수 없습니다. 알려진 항목 없음으로 판단할 수 없습니다.');
        } else if (item?.status === 'none_found') {
          add(row, 'p', '이 정확한 버전의 조회 범위에서 알려진 항목이 발견되지 않았다는 뜻입니다. 안전을 보장하지 않습니다.');
        }

        if (!Array.isArray(vulnerabilities)) {
          add(row, 'p', '취약점 항목 목록 확인 불가');
        } else if (vulnerabilities.length > 0) {
          add(row, 'h4', '전달받은 취약점 항목');
          const entries = add(row, 'ul', '');
          for (const vulnerability of vulnerabilities) {
            const entry = add(entries, 'li', '');
            add(entry, 'p', '취약점 ID: ' + value(vulnerability?.id));
            add(entry, 'p', '수정 시각(modified): ' +
              value(vulnerability?.modified));
          }
        } else if (item?.status === 'known_vulnerabilities') {
          add(row, 'p', '알려진 항목이 있다고 전달됐으나 취약점 ID는 확인할 수 없습니다.');
        }
      }

      return root;
    },

    renderAiConnection({
      status, mode, data, error, checkedAt, explanationAccepted
    } = {}) {
      const root = document.createElement('section');
      root.setAttribute('aria-label', '학생 AI 연결 점검');

      function line(content) {
        const node = document.createElement('p');
        node.textContent = content;
        root.append(node);
      }

      function safe(input, fallback = '확인 불가') {
        if (typeof input !== 'string' || !input.trim()) return fallback;
        return input
          .replace(/-----BEGIN[\s\S]*?PRIVATE KEY-----[\s\S]*?(?:-----END[\s\S]*?PRIVATE KEY-----|$)/g, '[비밀값 제거]')
          .replace(/\bBearer\s+\S+/gi, 'Bearer [비밀값 제거]')
          .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[비밀값 제거]')
          .replace(/\b(?:sb_secret_|sk-)[A-Za-z0-9_-]+/g, '[비밀값 제거]')
          .replace(/((?:password|passwd|token|api[_-]?key|secret)\s*["']?\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,;]+)/gi, '$1[비밀값 제거]');
      }

      function showMode(mode) {
        const labels = {
          demo: '예제 자료 · 실제 연결 아님',
          disconnected: '연결 없음',
          unknown: '연결 상태 확인 불가'
        };
        if (Object.hasOwn(labels, mode)) line(labels[mode]);
      }

      function showError(error) {
        const guidance = {
          ON_AI_PROVISIONING_PENDING:
            '권한 준비 중입니다. 담당자에게 계정 연결과 앱 권한 발급을 확인해 달라고 요청하세요. 학생 코드 오류로 단정하지 않습니다.',
          WB_CLCO_AUTH_REQUIRED:
            '인증 확인이 필요합니다. 제공 화면에서 계정 연결을 다시 확인하고 담당자에게 문의하세요.',
          WB_CLCO_ACCESS_BLOCKED:
            '접근이 제한됐습니다. 담당자에게 앱 이용 권한을 확인하세요.',
          WB_CLCO_COHORT_BUDGET_EXHAUSTED:
            '반의 AI 사용량이 소진됐습니다. 담당자에게 확인하세요.',
          WB_CLCO_LIMIT_REACHED:
            'AI 이용 한도에 도달했습니다. 담당자에게 확인하세요.',
          WB_CLCO_SESSION_CLOSED:
            '현재 AI 이용 시간이 아닙니다. 이용 시간을 확인하세요.',
          WB_CLCO_RATE_LIMITED:
            '요청이 제한됐습니다. 잠시 뒤 직접 다시 요청하세요.',
          WB_CLCO_TIMEOUT:
            '응답 시간이 초과됐습니다. 잠시 뒤 직접 다시 요청하세요.',
          REQUEST_TIMEOUT:
            '응답 시간이 초과됐습니다. 잠시 뒤 직접 다시 요청하세요.',
          ENGINE_TIMEOUT:
            '서버 확인 시간이 초과됐습니다. 잠시 뒤 직접 다시 요청하세요.',
          TIMEOUT:
            '응답 시간이 초과됐습니다. 잠시 뒤 직접 다시 요청하세요.',
          NETWORK_ERROR:
            '네트워크 연결을 확인하고 잠시 뒤 직접 다시 요청하세요.',
          WB_CLCO_CANCELLED:
            '취소됨. 이전 응답은 현재 결과가 아닙니다.',
          CANCELLED:
            '취소됨. 이전 응답은 현재 결과가 아닙니다.',
          REQUEST_CANCELLED:
            '취소됨. 이전 응답은 현재 결과가 아닙니다.',
          MODEL_NOT_CONFIGURED:
            '사용할 모델이 준비되지 않았습니다. 담당자에게 모델 허용 설정을 확인하세요.',
          ON_AI_MODEL_LIST_EMPTY:
            '사용할 수 있는 모델이 없습니다. 담당자에게 모델 허용 설정을 확인하세요.',
          ON_AI_AUTHORIZATION_CHANGED:
            '점검 중 권한이 변경됐습니다. 담당자에게 현재 계정과 앱 권한을 확인하세요.',
          SUBJECT_SCOPE_UNVERIFIED:
            '현재 로그인과 사건의 연결을 확인할 수 없습니다. 담당자에게 확인하세요.',
          ON_AI_INVALID_INPUT:
            '사건의 근거와 규칙을 확인할 수 없습니다.',
          ON_AI_INVALID_OUTPUT:
            '사건 설명의 응답 형식을 확인할 수 없습니다.',
          AI_REQUEST_UNVERIFIED:
            'AI 연결 또는 응답을 확인할 수 없습니다. 담당자에게 계정 연결과 앱 권한을 확인하세요.'
        };
        const known = Object.hasOwn(guidance, error?.code);
        const code = known ? error.code : 'AI_REQUEST_UNVERIFIED';
        line('오류 코드: ' + code);
        line('오류 안내: ' + (known
          ? safe(error?.message, guidance[code])
          : guidance[code]));
        line(guidance[code]);
      }

      showMode(mode);
      line('연결 점검과 사건 설명 실행은 별도입니다.');
      line('다시 점검하려면 제공 화면의 AI 연결 점검 버튼을 직접 누르세요. 자동으로 다시 요청하지 않습니다.');

      if (status === 'idle') {
        line('AI 연결 점검 전');
      } else if (status === 'loading') {
        line('AI 연결 점검 중');
      } else if (status === 'error') {
        line('AI 연결 점검 실패 또는 취소');
        showError(error);
      } else if (
        status === 'ok' &&
        data?.transportChecked === true &&
        ['test', 'verified'].includes(data.audienceAuthorization) &&
        Number.isInteger(data.modelCount) &&
        data.modelCount >= 0
      ) {
        line(data.audienceAuthorization === 'test'
          ? '시험 연결 점검(test)'
          : '앱 권한 확인 후 점검(verified)');
        line('응답 모델 수(modelCount): ' + data.modelCount);
        line('점검 시각(checkedAt): ' + safe(checkedAt));
        if (data.audienceAuthorization === 'test') {
          line('시험 연결 결과이며 실제 앱 권한 확인 성공을 뜻하지 않습니다.');
        } else {
          line('표시된 점검 시각 기준의 앱 권한 확인과 모델 응답 결과입니다.');
        }
        if (data.modelCount === 0) {
          line('사용할 수 있는 모델이 없습니다. 담당자에게 모델 허용 설정을 확인하세요.');
        }
        line('이 연결 점검에서는 사건 설명은 아직 실행하지 않았습니다.');
      } else {
        line('AI 연결 점검 결과 확인 불가');
      }

      line('실제 사건 설명은 보안 기록에서 별도로 요청하고 결과를 확인하세요.');
      line('Workbench 수업용 AI는 코드 작성 지원, 앱 안의 AI는 사건 설명, ALEPH 공식 과제 판정 AI는 제출 코드 평가를 담당합니다.');
      return root;
    },

    renderExplanation({
      event, explanation, checkedAt
    } = {}) {
      const root = document.createElement('section');
      root.setAttribute('aria-label', '학생 AI 사건 설명');

      function line(content) {
        const node = document.createElement('p');
        node.textContent = content;
        root.append(node);
      }

      function safe(input, fallback = '확인 불가') {
        if (typeof input !== 'string' || !input.trim()) return fallback;
        return input
          .replace(/-----BEGIN[\s\S]*?PRIVATE KEY-----[\s\S]*?(?:-----END[\s\S]*?PRIVATE KEY-----|$)/g, '[비밀값 제거]')
          .replace(/\bBearer\s+\S+/gi, 'Bearer [비밀값 제거]')
          .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[비밀값 제거]')
          .replace(/\b(?:sb_secret_|sk-)[A-Za-z0-9_-]+/g, '[비밀값 제거]')
          .replace(/((?:password|passwd|token|api[_-]?key|secret)\s*["']?\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,;]+)/gi, '$1[비밀값 제거]');
      }

      function showMode(mode) {
        const labels = {
          demo: '예제 자료 · 실제 연결 아님',
          disconnected: '연결 없음',
          unknown: '연결 상태 확인 불가'
        };
        if (Object.hasOwn(labels, mode)) line(labels[mode]);
      }

      function showError(error) {
        const guidance = {
          ON_AI_PROVISIONING_PENDING:
            '권한 준비 중입니다. 담당자에게 계정 연결과 앱 권한 발급을 확인해 달라고 요청하세요. 학생 코드 오류로 단정하지 않습니다.',
          WB_CLCO_AUTH_REQUIRED:
            '인증 확인이 필요합니다. 제공 화면에서 계정 연결을 다시 확인하고 담당자에게 문의하세요.',
          WB_CLCO_ACCESS_BLOCKED:
            '접근이 제한됐습니다. 담당자에게 앱 이용 권한을 확인하세요.',
          WB_CLCO_COHORT_BUDGET_EXHAUSTED:
            '반의 AI 사용량이 소진됐습니다. 담당자에게 확인하세요.',
          WB_CLCO_LIMIT_REACHED:
            'AI 이용 한도에 도달했습니다. 담당자에게 확인하세요.',
          WB_CLCO_SESSION_CLOSED:
            '현재 AI 이용 시간이 아닙니다. 이용 시간을 확인하세요.',
          WB_CLCO_RATE_LIMITED:
            '요청이 제한됐습니다. 잠시 뒤 직접 다시 요청하세요.',
          WB_CLCO_TIMEOUT:
            '응답 시간이 초과됐습니다. 잠시 뒤 직접 다시 요청하세요.',
          REQUEST_TIMEOUT:
            '응답 시간이 초과됐습니다. 잠시 뒤 직접 다시 요청하세요.',
          ENGINE_TIMEOUT:
            '서버 확인 시간이 초과됐습니다. 잠시 뒤 직접 다시 요청하세요.',
          TIMEOUT:
            '응답 시간이 초과됐습니다. 잠시 뒤 직접 다시 요청하세요.',
          NETWORK_ERROR:
            '네트워크 연결을 확인하고 잠시 뒤 직접 다시 요청하세요.',
          WB_CLCO_CANCELLED:
            '취소됨. 이전 응답은 현재 결과가 아닙니다.',
          CANCELLED:
            '취소됨. 이전 응답은 현재 결과가 아닙니다.',
          REQUEST_CANCELLED:
            '취소됨. 이전 응답은 현재 결과가 아닙니다.',
          MODEL_NOT_CONFIGURED:
            '사용할 모델이 준비되지 않았습니다. 담당자에게 모델 허용 설정을 확인하세요.',
          ON_AI_MODEL_LIST_EMPTY:
            '사용할 수 있는 모델이 없습니다. 담당자에게 모델 허용 설정을 확인하세요.',
          ON_AI_AUTHORIZATION_CHANGED:
            '점검 중 권한이 변경됐습니다. 담당자에게 현재 계정과 앱 권한을 확인하세요.',
          SUBJECT_SCOPE_UNVERIFIED:
            '현재 로그인과 사건의 연결을 확인할 수 없습니다. 담당자에게 확인하세요.',
          ON_AI_INVALID_INPUT:
            '사건의 근거와 규칙을 확인할 수 없습니다.',
          ON_AI_INVALID_OUTPUT:
            '사건 설명의 응답 형식을 확인할 수 없습니다.',
          AI_REQUEST_UNVERIFIED:
            'AI 연결 또는 응답을 확인할 수 없습니다. 담당자에게 계정 연결과 앱 권한을 확인하세요.'
        };
        const known = Object.hasOwn(guidance, error?.code);
        const code = known ? error.code : 'AI_REQUEST_UNVERIFIED';
        line('오류 코드: ' + code);
        line('오류 안내: ' + (known
          ? safe(error?.message, guidance[code])
          : guidance[code]));
        line(guidance[code]);
      }

      showMode(explanation?.mode);
      const status = explanation?.status;

      function reject(reason) {
        line('AI 설명을 사용할 수 없습니다');
        line(reason);
        line('오류 코드: ON_AI_INVALID_OUTPUT');
        line('기록은 그대로입니다. 설명 실패가 과제 실패를 뜻하지 않습니다.');
        return root;
      }

      // 오류는 사건 선택 유무보다 먼저 표시합니다.
      if (status === 'error') {
        line('AI 설명 실패');
        showError(explanation.error);
        line('기록은 그대로입니다. AI 설명 실패가 과제 실패를 뜻하지 않습니다.');
        line('근거·규칙 또는 권한을 확인한 뒤 AI 설명 요청 버튼을 직접 누르세요.');
        return root;
      }

      if (!event || typeof event.id !== 'string' || !event.id.trim()) {
        line('보안 기록에서 기록을 먼저 고르세요.');
        return root;
      }

      if (status === 'loading') {
        line('사건 ID: ' + safe(event.id));
        line('AI 설명 요청 중');
        line('기록은 그대로입니다.');
        return root;
      }

      if (!explanation || status === 'idle') {
        line('사건 ID: ' + safe(event.id));
        line('AI 설명 요청 전');
        line('선택한 기록의 AI 설명 요청 버튼을 직접 누르세요.');
        return root;
      }

      if (status !== 'ok') {
        line('AI 설명 상태 확인 불가');
        line('기록은 그대로입니다.');
        return root;
      }

      const data = explanation.data;
      if (data?.executed === true) {
        return reject('AI가 이미 실행했다고 답한 설명은 사용할 수 없습니다.');
      }
      if (data?.executed !== false ||
          data?.requiresHumanConfirmation !== true) {
        return reject('사람 확인 필요 여부와 미실행 상태를 확인할 수 없습니다.');
      }

      if (!Array.isArray(event.evidence) || event.evidence.length === 0 ||
          !event.evidence.every(item =>
            typeof item?.id === 'string' && item.id.trim() &&
            typeof item.text === 'string' && item.text.trim()) ||
          !Array.isArray(event.rules) || event.rules.length === 0 ||
          !event.rules.every(item =>
            typeof item?.id === 'string' && item.id.trim() &&
            typeof item.text === 'string' && item.text.trim())) {
        return reject('현재 기록의 근거 또는 규칙이 부족합니다.');
      }

      const evidence = new Map(
        event.evidence.map(item => [item.id, item.text])
      );
      const validRefs = refs =>
        Array.isArray(refs) && refs.length > 0 &&
        new Set(refs).size === refs.length &&
        refs.every(id => typeof id === 'string' && evidence.has(id));

      if (evidence.size !== event.evidence.length ||
          !validRefs(data.evidenceIds) ||
          data.evidenceIds.length !== evidence.size) {
        return reject('근거가 맞지 않음: 현재 기록에 없는 근거 ID, 중복 또는 누락이 있습니다.');
      }

      if (typeof data.summary !== 'string' || !data.summary.trim() ||
          !Array.isArray(data.proposals) ||
          !Array.isArray(event.supportedActions)) {
        return reject('AI 요약 또는 조치 제안의 형식을 확인할 수 없습니다.');
      }

      const proposalsOk = data.proposals.every(proposal =>
        typeof proposal?.action === 'string' &&
        event.supportedActions.includes(proposal.action) &&
        typeof proposal.reason === 'string' && proposal.reason.trim() &&
        validRefs(proposal.evidenceIds)
      );
      if (!proposalsOk) {
        return reject('조치 제안의 근거가 현재 기록과 맞지 않거나 지원하지 않는 조치입니다.');
      }

      // 검증을 통과한 설명에만 성공 표식을 붙입니다.
      root.setAttribute('data-student-explanation-event', event.id);
      const heading = document.createElement('h3');
      heading.textContent = 'AI 설명(참고용)';
      root.append(heading);
      line('사건 ID: ' + safe(event.id));
      line('AI 요약: ' + safe(data.summary));
      line('설명 확인 시각: ' + safe(checkedAt));
      line('AI 요약은 해석입니다. 사실 판단은 현재 기록의 근거·규칙과 연동 시스템이 알려 준 상태를 기준으로 하세요.');

      line('인용한 근거');
      for (const id of data.evidenceIds) {
        line(safe(id) + ' — ' + safe(evidence.get(id)));
      }

      line('현재 규칙');
      for (const rule of event.rules) {
        line(safe(rule.id) + ' — ' + safe(rule.text));
      }

      line('확인되지 않은 현재 상태');
      const stateLabels = {
        access: {
          allowed: '접근 허용', denied: '접근 거부', unknown: '확인 불가'
        },
        session: {
          active: '활성', expired: '만료',
          revoked: '철회됨', unknown: '확인 불가'
        },
        device: {
          compliant: '보안 기준 충족',
          noncompliant: '보안 기준 미충족', unknown: '확인 불가'
        }
      };
      const names = { access: '접속', session: '세션', device: '기기' };
      let unknownCount = 0;
      for (const key of ['access', 'session', 'device']) {
        const raw = event.state?.[key];
        if (!Object.hasOwn(stateLabels[key], raw) || raw === 'unknown') {
          line(names[key] + ': 확인 불가(unknown)');
          unknownCount += 1;
        }
      }
      if (unknownCount === 0) line('없음');

      line('조치 제안 · 미실행');
      if (data.proposals.length === 0) {
        line(event.supportedActions.length === 0
          ? '연동 시스템이 지원하는 조치가 없어 제안이 없습니다(정상).'
          : 'AI가 제안한 조치가 없습니다.');
      } else {
        for (const proposal of data.proposals) {
          line('조치: ' + safe(proposal.action));
          line('이유: ' + safe(proposal.reason));
          for (const id of proposal.evidenceIds) {
            line('제안 근거: ' + safe(id) + ' — ' + safe(evidence.get(id)));
          }
          line('사람 확인이 필요하며 실행되지 않았습니다.');
        }
      }
      line('AI 설명과 제안만으로 보안 조치가 실행되지는 않습니다.');
      return root;
    },

    renderAction({
      status, event, actionId, target, receipt, observation,
      message, confirmationExpiresAt, error
    } = {}) {
      const root = document.createElement('section');
      root.setAttribute('aria-label', '학생 보안 조치 상태');

      function line(content) {
        const node = document.createElement('p');
        node.textContent = content;
        root.append(node);
      }

      function safe(input) {
        return input
          .replace(/-----BEGIN[\s\S]*?PRIVATE KEY-----[\s\S]*?(?:-----END[\s\S]*?PRIVATE KEY-----|$)/g, '[비밀값 제거]')
          .replace(/\bBearer\s+\S+/gi, 'Bearer [비밀값 제거]')
          .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[비밀값 제거]')
          .replace(/\b(?:sb_secret_|sk-)[A-Za-z0-9_-]+/g, '[비밀값 제거]')
          .replace(/((?:password|passwd|token|api[_-]?key|secret)\s*["']?\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,;]+)/gi, '$1[비밀값 제거]');
      }

      function present(value) {
        return (typeof value === 'string' && value.trim().length > 0) ||
          (typeof value === 'number' && Number.isFinite(value)) ||
          typeof value === 'boolean';
      }

      function field(label, value) {
        if (present(value)) line(label + ': ' + safe(String(value)));
      }

      const labels = {
        idle: '아직 미실행(idle)',
        loading: '조치 준비 또는 결과 조회 중(loading) · 결과 미확인',
        prepared: '준비됨·미실행(prepared)',
        executing: '서버에 전달 중(executing) · 결과가 아직 확인되지 않았습니다',
        pending: '서버 접수·처리 중(pending) · 접수 응답(ACK)은 효과 확인이 아닙니다',
        succeeded: '효과 확인(succeeded)',
        denied: '거절(denied)',
        failed: '실패(failed)',
        unknown: '결과 불명(unknown)',
        expired: '확인 기한 지남(expired)',
        error: '요청 처리 안 됨(error)'
      };

      const eventMismatch = receipt?.eventId != null &&
        receipt.eventId !== event?.id;
      const actionMismatch = receipt?.actionId != null &&
        receipt.actionId !== actionId;
      const mismatch = eventMismatch || actionMismatch;

      let displayStatus = Object.hasOwn(labels, status) ? status : 'unknown';
      if (mismatch ||
          (status === 'succeeded' && observation?.effectApplied !== true) ||
          receipt?.superseded === true) {
        displayStatus = 'unknown';
      }

      line(labels[displayStatus]);
      if (displayStatus !== status && present(status)) {
        field('수신 상태', status);
      }

      if (mismatch) {
        line('현재 사건 또는 조치와 접수 정보가 일치하지 않아 결과를 연결할 수 없습니다.');
      }

      if (!mismatch) {
        if (typeof event?.id === 'string' && event.id.trim()) {
          root.setAttribute('data-student-action-event', event.id);
        }
        if (typeof receipt?.requestId === 'string' &&
            receipt.requestId.trim()) {
          root.setAttribute('data-student-action-request', receipt.requestId);
        }
      }

      field('사건 ID(event.id)', event?.id);
      if (Array.isArray(event?.evidence)) {
        for (const item of event.evidence) {
          field('근거 ID', item?.id);
        }
      }
      field('조치(actionId)', actionId);
      field('실제 대상(target.id)', target?.id);
      field('대상 세대(target.generation)', target?.generation);
      field('요청 ID(requestId)', receipt?.requestId);
      field('접수 ID(receiptId)', receipt?.receiptId);
      field('접수 사건 ID', receipt?.eventId);
      field('접수 조치 ID', receipt?.actionId);
      field('접수 상태', receipt?.status);
      field('버전(version)', receipt?.version);
      field('재사용 응답(replayed)', receipt?.replayed);

      if (displayStatus === 'prepared') {
        field('사람 확인 기한(confirmationExpiresAt)', confirmationExpiresAt);
        line('아직 실행되지 않았습니다. 제공 화면에서 실제 대상·조치·확인 기한을 읽고 사람이 직접 확인해야 합니다.');
      } else if (displayStatus === 'executing') {
        line('서버에 전달하는 단계입니다. 처리 결과와 실제 효과는 아직 확인되지 않았습니다.');
      } else if (displayStatus === 'pending') {
        line('서버가 요청을 받았으며 처리 중입니다. ACK만으로 실행 성공을 판단하지 않습니다.');
        line('제공 화면의 결과 재조회 버튼으로 결과만 직접 확인하세요.');
      } else if (displayStatus === 'succeeded') {
        field('관측 시각(observedAt)', observation.observedAt);
        line('effectApplied: true');
        line('연동 시스템이 보고한 효과 관측 결과입니다.');
      } else if (displayStatus === 'unknown') {
        line('성공 또는 효과 없음으로 판단하지 마세요.');
        line('조치를 다시 보내지 말고 제공 화면의 결과 재조회 버튼으로 결과만 직접 확인하세요.');
        if (receipt?.superseded === true) {
          line('이전 조회는 최신 결과를 대신하지 않습니다(superseded).');
        }
      } else if (displayStatus === 'expired') {
        field('사람 확인 기한(confirmationExpiresAt)', confirmationExpiresAt);
        line('이번 확인 기한으로는 집행할 수 없습니다. 제공 화면에서 조치를 다시 준비하고 대상을 확인하세요.');
      } else if (displayStatus === 'denied') {
        line('연동 시스템이 조치를 거절했습니다.');
      } else if (displayStatus === 'failed') {
        line('연동 시스템의 조치 처리가 실패했습니다.');
      } else if (displayStatus === 'error') {
        line('요청 처리 오류입니다. 아래 원인을 확인하세요.');
      }

      field('안내(message)', message);
      if (error) {
        const errorCode = typeof error.code === 'string' &&
          /^[A-Z][A-Z0-9_]{0,79}$/.test(error.code)
          ? error.code : 'ACTION_RESULT_UNVERIFIED';
        field('오류 코드', errorCode);
        field('오류 안내', error.message);
      }

      if (Array.isArray(event?.supportedActions) &&
          event.supportedActions.length === 0) {
        line('연동 시스템이 지원하는 조치가 없어 조치 준비 버튼이 나오지 않는 것이 정상입니다.');
      }

      line('AI 제안은 실행이 아닙니다. 사람 확인·요청 접수·효과 관측은 각각 별도 단계입니다.');
      line('조치 화면 취소는 이미 서버에 전달된 조치의 효과를 되돌리지 않습니다.');
      line('자동 집행·자동 재전송은 하지 않습니다. 상태 확인에는 제공 화면의 버튼을 사용하세요.');
      return root;
    },
  };
}