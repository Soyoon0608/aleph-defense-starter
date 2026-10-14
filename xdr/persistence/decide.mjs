const PATTERNS = Object.freeze({
  unsigned_new_service: Object.freeze({
    name: '서명 없는 새 서비스 등록',
    condition: '새 서비스가 등록되거나 서비스 실행 파일이 바뀌었고 서명이 없거나 평소 목록에 없는 항목이다.',
    evidence: 'MITRE ATT&CK T1543은 공격자가 지속성을 위해 시스템 서비스를 만들거나 기존 서비스를 변경하는 기법을 다룬다.'
  }),
  unknown_scheduled_task: Object.freeze({
    name: '낯선 예약 작업 생성',
    condition: '평소 목록에 없던 예약 작업이 새로 생기거나 임시 폴더의 실행 파일 등 낯선 프로그램을 실행한다.',
    evidence: 'MITRE ATT&CK T1053은 공격자가 지속성이나 실행을 위해 예약 작업 또는 작업 스케줄러를 사용하는 기법을 다룬다.'
  }),
  startup_folder_change: Object.freeze({
    name: '시작 폴더의 낯선 항목 변경',
    condition: '시작 폴더나 시작 프로그램에 평소 목록에 없던 실행 항목이 추가되거나 변경된다.',
    evidence: '부팅이나 로그인 뒤 다시 실행되도록 시작 위치를 변경하는 것은 지속성 확보 여부를 확인해야 하는 신호다.'
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
  const path = text(alert?.data?.path).toLowerCase();
  const level = Number.isFinite(alert?.rule?.level)
    ? alert.rule.level
    : null;

  const tempPath =
    path.includes('\\temp\\') ||
    path.includes('/temp/');

  /* 정상 또는 기존 항목임이 명확한 경우를 먼저 제외한다. */
  const clearlyNormal =
    /로그인했습니다|로그아웃했습니다|읽기만 했습니다|평소 시각에 그대로|서명된 채로 실행 중|평소 저장소에서 끝났습니다|기존 예약 작업|자료실 화면이 열렸습니다/u.test(description);

  if (clearlyNormal) {
    return result(0.05, '지속성 악용 패턴 없음');
  }

  /* T1543: 서명 없는 새 서비스/서비스 실행 파일 변경 */
  const service = /서비스/u.test(description);
  const unsigned = /서명 없는|서명이 없습니다/u.test(description);
  const serviceCreation =
    /새 서비스|서비스 등록|등록됐습니다|실행 파일이 바뀌었/u.test(description);
  const unknownService =
    /평소 목록에 없는 서비스/u.test(description);

  if (
    service &&
    (
      (unsigned && (serviceCreation || tempPath)) ||
      unknownService
    )
  ) {
    return result(
      0.95,
      PATTERNS.unsigned_new_service.name
    );
  }

  /* T1053: 낯선 예약 작업 */
  const scheduledTask = /예약 작업/u.test(description);
  const suspiciousTask =
    /처음 보는|임의 문자열|수업 시간 밖|평소 목록에 없는/u.test(description);

  if (
    scheduledTask &&
    (
      suspiciousTask ||
      (tempPath && level !== null && level >= 9)
    )
  ) {
    return result(
      0.95,
      PATTERNS.unknown_scheduled_task.name
    );
  }

  /* 시작 폴더/시작 프로그램에 낯선 실행 항목 */
  const startup =
    /시작 폴더|시작 프로그램|시작 항목/u.test(description);

  const unknownStartup =
    /평소 목록에 없는 프로그램|같은 임시 파일/u.test(description);

  if (startup && unknownStartup) {
    return result(
      0.9,
      PATTERNS.startup_folder_change.name
    );
  }

  /*
   * 아래는 단독으로 차단하기에는 근거가 부족한 경우다.
   * 정상 사용자를 막지 않고 alert로 남긴다.
   */
  if (scheduledTask) {
    return result(
      0.6,
      PATTERNS.unknown_scheduled_task.name
    );
  }

  if (startup) {
    return result(
      0.6,
      PATTERNS.startup_folder_change.name
    );
  }

  if (service) {
    return result(
      0.6,
      PATTERNS.unsigned_new_service.name
    );
  }

  if (tempPath) {
    return result(
      0.55,
      PATTERNS.unsigned_new_service.name
    );
  }

  return result(0.05, '지속성 악용 패턴 없음');
}
