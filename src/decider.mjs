// ALEPH SDP 엔진이 확인한 요청만 받는 학생 판정기 시작점입니다.
// 6단계에서 등록된 기기만 허용합니다.
// 요청 본문의 userId, role, 기기 키, 토큰을 별도로 믿거나 저장하지 마세요.
export const RULE_IDS = Object.freeze(['device_registered']);

export async function decide(request) {
  const deviceRegistered = request.deviceRegistered === true;
  return {
    schema: 'aleph.decision.v1',
    requestId: request.requestId,
    decision: deviceRegistered ? 'allow' : 'deny',
    reasonCode: deviceRegistered ? 'approved' : 'device_not_registered',
    ruleIds: [RULE_IDS[0]],
  };
}
