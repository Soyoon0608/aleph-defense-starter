const PATTERNS = Object.freeze({
  admin_group_added: Object.freeze({
    name: '관리자 그룹에 평소 계정 추가',
    condition: '평범한 계정이나 여러 계정이 관리자 그룹에 새로 추가되거나 다시 관리자 그룹에 들어간다.',
    evidence: 'MITRE ATT&CK T1078 정상 계정 도용과 권한 있는 접근'
  }),
  unfamiliar_admin_command: Object.freeze({
    name: '처음 보는 관리자 권한 명령',
    condition: '평범한 계정이 관리자 권한으로 바뀐 직후 관리자 명령을 실행하거나 다른 계정의 권한으로 관리자 명령을 실행한다.',
    evidence: 'MITRE ATT&CK T1068 권한 상승 악용'
  }),
  off_hours_privilege_use: Object.freeze({
    name: '업무 시간 밖 권한 사용',
    condition: '업무나 수업 시간 밖에 처음 보는 주소에서 관리자 명령 또는 관리자 그룹 변경이 발생한다.',
    evidence: '평소와 다른 시간·주소의 관리자 권한 사용은 추가 확인이 필요한 신호'
  })
});

function text(value) {
  return typeof value === 'string' ? value : '';
}

function result(confidence, reason) {
  const action =
    confidence >= 0.85 ? 'block' :
    confidence >= 0.5 ? 'alert' :
    'record';

  return {
    action,
    confidence,
    reason: String(reason).replace(/\s+/gu, ' ').trim()
  };
}

export function decide(alert) {
  const description = text(alert?.rule?.description);
  const group = text(alert?.data?.group).toLowerCase();

  const clearlyNormal =
    /로그인했습니다|로그아웃했습니다|읽기만 했습니다|비밀번호를 변경했습니다|자기 세션 정보를 조회했습니다|자료실을 열었습니다|평소 예약 작업을 확인했습니다/u.test(description);

  if (clearlyNormal) {
    return result(0.05, '권한 상승 악용 패턴 없음');
  }

  const adminGroup =
    group === 'administrators' ||
    (
      /관리자 그룹/u.test(description) &&
      !/관리자 그룹은 아닙니다/u.test(description)
    );

  const groupAdded =
    /추가됐습니다|들어가고|다시 관리자로 들어왔습니다|관리자 그룹 추가/u.test(description);

  const adminCommand =
    /관리자 명령|권한 명령/u.test(description);

  const newlyPrivileged =
    /방금 관리자가 된|관리자 권한으로 바뀌었/u.test(description);

  const otherAccountPrivilege =
    /다른 계정의 권한/u.test(description);

  const unusualContext =
    /원격 주소|처음 보는 주소|업무처럼 보이지 않는 시각|수업 시간 밖/u.test(description);

  if (adminGroup && groupAdded) {
    return result(
      0.95,
      PATTERNS.admin_group_added.name
    );
  }

  if (
    adminCommand &&
    (newlyPrivileged || otherAccountPrivilege)
  ) {
    return result(
      0.95,
      PATTERNS.unfamiliar_admin_command.name
    );
  }

  if (
    adminCommand &&
    unusualContext
  ) {
    return result(
      0.9,
      PATTERNS.off_hours_privilege_use.name
    );
  }

  if (
    /관리자 권한으로 바뀌었/u.test(description) &&
    /처음 봅니다/u.test(description)
  ) {
    return result(
      0.9,
      PATTERNS.unfamiliar_admin_command.name
    );
  }

  /*
   * 권한 관련 변화는 보이지만 단독으로 차단하기에는
   * 근거가 부족한 경우 alert로 남긴다.
   */
  if (
    /권한 상승|관리자 명령|관리자 그룹|새 로컬 그룹|그룹에 추가|그룹 설명/u.test(description)
  ) {
    return result(
      0.6,
      adminCommand
        ? PATTERNS.unfamiliar_admin_command.name
        : PATTERNS.admin_group_added.name
    );
  }

  if (/계정 종류를 조회/u.test(description)) {
    return result(
      0.55,
      PATTERNS.admin_group_added.name
    );
  }

  return result(0.05, '권한 상승 악용 패턴 없음');
}
