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

      function device(parent, item) {
        text(parent, 'p', '기기 이름: ' + value(item?.label));
        text(parent, 'p', '기기 ID: ' + value(item?.id));
        text(parent, 'p', '기기 상태: ' +
          (Object.hasOwn(deviceLabels, item?.status)
            ? deviceLabels[item.status] : '확인 불가'));
      }

      function session(parent, item) {
        text(parent, 'p', '세션 ID: ' + value(item?.id));
        text(parent, 'p', '세션 상태: ' +
          (Object.hasOwn(sessionLabels, item?.status)
            ? sessionLabels[item.status] : '확인 불가'));
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
    renderDecision() { return '학생 구현 대기: 서버의 판정과 이유를 연결하세요.'; },
    renderEvents() { return '학생 구현 대기: 본인 접속·XDR 기록을 연결하세요.'; },
    renderStatus() { return '학생 구현 대기: 기기·세션·알림과 연결 점검 상태를 구분하세요.'; },
    renderVulnerabilities() { return '학생 구현 대기: 정확한 설치 버전·OSV 출처·조회 시각·부분 결과·조회 실패를 구분하세요.'; },
    renderAiConnection() { return '학생 구현 대기: 모델 응답 점검과 실제 사건 설명을 구분하고 AI 오류·취소·수동 복구를 안내하세요.'; },
    renderExplanation() { return '학생 구현 대기: 선택한 사건의 근거·규칙·현재 상태와 AI 설명을 연결하세요. 제안은 자동 실행하지 않습니다.'; },
    renderAction() { return '학생 구현 대기: 현재 사건·조치·실제 대상·사람 확인·ACK와 원천 효과·unknown을 구분하세요.'; },
  };
}