// ALEPH SDP 엔진이 확인한 요청만 받는 학생 판정기 시작점입니다.
// 6단계에서 등록된 기기만 허용합니다.
// 요청 본문의 userId, role, 기기 키, 토큰을 별도로 믿거나 저장하지 마세요.
export const RULE_IDS = Object.freeze(['device_registered', 'step_up_required']);

function validateRequestContext(request) {
  const signals = request?.signals;
  const recentEvents = request?.recentEvents;
  const validEvents = Array.isArray(recentEvents) && recentEvents.length <= 12
    && recentEvents.every(event => event && typeof event.kind === 'string'
      && event.kind.trim() && Number.isFinite(event.ageSeconds) && event.ageSeconds >= 0
      && Number.isInteger(event.count) && event.count >= 0);

  if (!signals || typeof signals !== 'object' || Array.isArray(signals)
      || !['none', 'judge_fixture'].includes(signals.source)
      || typeof signals.region !== 'string' || !signals.region.trim()
      || typeof signals.network !== 'string' || !signals.network.trim()
      || (signals.source === 'none'
        && (signals.region !== 'unknown' || signals.network !== 'unknown'))
      || !Number.isInteger(signals.hour) || signals.hour < 0 || signals.hour > 23
      || !validEvents) {
    throw new TypeError('판정 입력의 신호 출처 또는 접속 문맥이 없거나 유효하지 않습니다.');
  }
}

export async function decide(request) {
  validateRequestContext(request);
  const deviceRegistered = request.deviceRegistered === true;
  const unusualTime = request.signals.hour < 6 || request.signals.hour >= 22;
  const unfamiliarNetwork = request.signals.network === 'unusual';
  const recentReadBurst = request.recentEvents.some(event => event.kind === 'risk_signal'
    && event.count >= 20 && event.ageSeconds <= 300);
  const compositeAnomaly = unusualTime && unfamiliarNetwork && recentReadBurst;
  const stepUpVerified = request.stepUp?.verified === true
    && Number.isInteger(request.stepUp.authAgeSeconds)
    && request.stepUp.authAgeSeconds >= 0 && request.stepUp.authAgeSeconds <= 900;
  const needsStepUp = deviceRegistered && compositeAnomaly && !stepUpVerified;

  return {
    schema: 'aleph.decision.v1',
    requestId: request.requestId,
    decision: !deviceRegistered ? 'deny' : needsStepUp ? 'step_up' : 'allow',
    reasonCode: !deviceRegistered ? 'device_not_registered'
      : needsStepUp ? 'step_up_required' : 'approved',
    ruleIds: !deviceRegistered ? [RULE_IDS[0]]
      : needsStepUp ? [RULE_IDS[1]] : [RULE_IDS[0]],
  };
}
