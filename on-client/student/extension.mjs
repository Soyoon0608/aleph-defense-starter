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

    renderEvents() {
      return '학생 구현 대기: 본인 접속·XDR 기록을 연결하세요.';
    },

    renderStatus() {
      return '학생 구현 대기: 기기·세션·알림과 연결 점검 상태를 구분하세요.';
    },

    renderVulnerabilities() {
      return '학생 구현 대기: 정확한 설치 버전·OSV 출처·조회 시각·부분 결과·조회 실패를 구분하세요.';
    },

    renderAiConnection() {
      return '학생 구현 대기: 모델 응답 점검과 실제 사건 설명을 구분하고 AI 오류·취소·수동 복구를 안내하세요.';
    },

    renderExplanation() {
      return '학생 구현 대기: 선택한 사건의 근거·규칙·현재 상태와 AI 설명을 연결하세요. 제안은 자동 실행하지 않습니다.';
    },

    renderAction() {
      return '학생 구현 대기: 현재 사건·조치·실제 대상·사람 확인·ACK와 원천 효과·unknown을 구분하세요.';
    },
  };
}