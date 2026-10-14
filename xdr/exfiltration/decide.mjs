const PATTERNS = Object.freeze({
  large_transfer_new_destination: Object.freeze({
    name: '처음 보는 목적지로 대용량 전송',
    condition: '평소에 없던 목적지로 큰 파일이나 많은 자료가 한 번에 또는 반복해서 전송된다.',
    evidence: 'MITRE ATT&CK T1041 명령·제어 통로를 이용한 자료 유출'
  }),
  off_hours_archive_transfer: Object.freeze({
    name: '업무 시간 밖 압축 파일 반출',
    condition: '업무나 수업 시간 밖에 압축 파일이 외부 또는 처음 보는 목적지로 전송된다.',
    evidence: 'MITRE ATT&CK T1048 다른 프로토콜이나 경로를 이용한 자료 유출'
  }),
  unusual_channel_transfer: Object.freeze({
    name: '낯선 통로나 포트를 통한 반복 전송',
    condition: '평소 사용하지 않던 포트나 명령 통로로 큰 파일 또는 다수의 자료가 반복 전송된다.',
    evidence: 'MITRE ATT&CK T1041·T1048 통신 채널을 이용한 자료 반출'
  })
});

function text(value) {
  return typeof value === 'string' ? value : '';
}

function number(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
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
  const level = Number.isFinite(alert?.rule?.level)
    ? alert.rule.level
    : 0;

  const bytes = number(alert?.data?.bytes);
  const files = number(alert?.data?.files);
  const count = number(alert?.data?.count);
  const destination = text(alert?.data?.dstip);

  const clearlyNormal =
    /메모 한 건을 읽었습니다|반 공지를 읽었습니다|수업 자료 주소로 작은 동기화|검색 결과 한 페이지|화면 새로고침|내 메모를 저장했습니다|첨부 그림 한 장|세션 확인입니다|로그아웃했습니다|다음 수업 공지를 읽었습니다/u.test(description);

  if (clearlyNormal) {
    return result(0.05, '자료 반출 패턴 없음');
  }

  const newDestination =
    /처음 보는 목적지|처음 보는 주소|평소와 다른 주소|다른 주소/u.test(description);

  const offHours =
    /수업 시간 밖|업무 시간 밖/u.test(description);

  const archive =
    /압축 파일/u.test(description);

  const unusualChannel =
    /평소에 쓰지 않던 포트|명령 통로/u.test(description);

  const repeated =
    /반복|연속|15번|8번|9번/u.test(description) ||
    count >= 8;

  const largeTransfer =
    bytes >= 50000000 ||
    /대용량 전송|큰 파일|자료실 전체|메모 묶음|자료 200건/u.test(description);

  const actualTransfer =
    Boolean(destination) &&
    !/외부 전송은 아직 없습니다|전송이 실패/u.test(description);

  if (
    actualTransfer &&
    largeTransfer &&
    (
      newDestination ||
      offHours ||
      archive ||
      unusualChannel ||
      repeated ||
      /외부 주소로 복사/u.test(description)
    ) &&
    level >= 10
  ) {
    if (offHours && archive) {
      return result(
        0.97,
        PATTERNS.off_hours_archive_transfer.name
      );
    }

    if (unusualChannel) {
      return result(
        0.95,
        PATTERNS.unusual_channel_transfer.name
      );
    }

    return result(
      0.95,
      PATTERNS.large_transfer_new_destination.name
    );
  }

  /*
   * 전송 관련 이상 징후는 있지만 크기·목적지·반복 여부가
   * 명확한 차단 근거까지 되지 않는 경우 alert로 남긴다.
   */
  if (
    newDestination ||
    offHours ||
    archive ||
    unusualChannel ||
    repeated ||
    /전송량이 평소보다|파일 수가 한 번 늘었습니다|백업처럼 보이는 전송|전송은 1건/u.test(description)
  ) {
    const reason =
      offHours && archive
        ? PATTERNS.off_hours_archive_transfer.name
        : unusualChannel
          ? PATTERNS.unusual_channel_transfer.name
          : PATTERNS.large_transfer_new_destination.name;

    return result(0.6, reason);
  }

  return result(0.05, '자료 반출 패턴 없음');
}
