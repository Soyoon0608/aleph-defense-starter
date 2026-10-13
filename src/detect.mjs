// 9단계 제작 1
// 가상 사건에서 탐지에 필요한 최소 정보만 읽습니다.
// 원본 사건의 메모 내용, 토큰, 실명 등 다른 값은 저장하거나 출력하지 않습니다.

function cleanString(value) {
  if (typeof value !== 'string') return null;

  const cleaned = value.trim();
  return cleaned ? cleaned : null;
}

function normalizeEvent(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    throw new TypeError('invalid_detection_event');
  }

  const at = cleanString(event.at);
  const method = cleanString(event.method)?.toUpperCase() ?? null;
  const subject = cleanString(event.identity?.sub);

  if (!at || Number.isNaN(Date.parse(at))) {
    throw new TypeError('invalid_detection_event_time');
  }

  if (!method) {
    throw new TypeError('invalid_detection_event_method');
  }

  if (!subject) {
    throw new TypeError('invalid_detection_event_identity');
  }

  // 운영 사건에 해당 값이 제공될 경우에만 읽습니다.
  // 제공되지 않은 값을 임의로 만들지는 않습니다.
  const deviceId = cleanString(event.deviceId);
  const decision = cleanString(event.decision);
  const network = cleanString(event.signals?.network);

  return Object.freeze({
    at,
    method,
    subject,
    ...(deviceId ? { deviceId } : {}),
    ...(decision ? { decision } : {}),
    ...(network ? { network } : {})
  });
}

export function sanitizeDetectionEvents(events) {
  if (!Array.isArray(events)) {
    throw new TypeError('invalid_detection_events');
  }

  return Object.freeze(events.map(normalizeEvent));
}

const READ_BURST_LIMIT = 120;
const READ_BURST_WINDOW_MS = 10 * 60 * 1000;

// 같은 가명 사용자와 같은 확인 기기의 GET 사건을 10분 창으로 검사합니다.
// 운영 사건에 네트워크 신호가 제공되면 unusual 사건만 탐지 대상으로 삼습니다.
// 로컬 연습 계약처럼 네트워크 신호가 아예 없으면 기존 burst_read 계약을 유지합니다.
export function analyzeDetectionEvents(events) {
  const safeEvents = sanitizeDetectionEvents(events);

  const hasNetworkSignal = safeEvents.some(
    (event) => typeof event.network === 'string'
  );

  const groups = new Map();

  for (const event of safeEvents) {
    if (event.method !== 'GET') continue;

    if (hasNetworkSignal && event.network !== 'unusual') {
      continue;
    }

    const deviceKey = event.deviceId ?? 'device-unknown';
    const key = `${event.subject}\u0000${deviceKey}`;

    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(event);
  }

  for (const group of groups.values()) {
    group.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

    let left = 0;

    for (let right = 0; right < group.length; right += 1) {
      const rightTime = Date.parse(group[right].at);

      while (
        left < right
        && rightTime - Date.parse(group[left].at) > READ_BURST_WINDOW_MS
      ) {
        left += 1;
      }

      const count = right - left + 1;

      if (count > READ_BURST_LIMIT) {
        const matched = group[right];

        return Object.freeze({
          suspicious: true,
          reasonCode: 'burst_read',
          subject: matched.subject,
          ...(matched.deviceId ? { deviceId: matched.deviceId } : {})
        });
      }
    }
  }

  return Object.freeze({ suspicious: false });
}

export function detect(events) {
  const result = analyzeDetectionEvents(events);

  if (!result.suspicious) {
    return { action: 'observe' };
  }

  return {
    action: 'propose_revocation',
    reasonCode: result.reasonCode,
    subject: result.subject,
    ...(result.deviceId ? { deviceId: result.deviceId } : {})
  };
}
