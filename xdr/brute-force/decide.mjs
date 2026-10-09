
const PATTERNS = [
  {
    "name": "repeated_password_guessing",
    "condition": "같은 주소 또는 계정의 인증 실패가 반복됨. 실패 30건 이상이며 짧은 시간·연속 시도·비밀번호 변형 중 하나가 확인되면 강한 신호로 판단.",
    "evidence": "MITRE T1110 및 T1110.001: 비밀번호를 반복적으로 추측하여 계정 접근을 시도하는 형태.",
    "source": "https://attack.mitre.org/techniques/T1110/001/"
  },
  {
    "name": "password_spraying",
    "condition": "여러 계정에 같은 비밀번호를 반복 대입하거나, 다수 계정에 일정한 간격의 인증 실패가 확인됨. 계정 수와 반복성을 함께 확인.",
    "evidence": "MITRE T1110.003: 하나 또는 소수의 비밀번호를 여러 계정에 대입하는 형태. 일정한 간격만으로 같은 비밀번호 사용을 단정하지 않음.",
    "source": "https://attack.mitre.org/techniques/T1110/003/"
  },
  {
    "name": "limited_failure_review",
    "condition": "인증 실패가 3건 이상이지만 대량 반복·다수 계정 대입의 근거가 부족함. 이후 성공했더라도 자동 차단하지 않고 검토 알림으로 분류.",
    "evidence": "MITRE T1110의 반복 인증 실패 탐지에 근거한 검토 조건. 소수 실패만으로 공격을 확정하지 않음.",
    "source": "https://attack.mitre.org/techniques/T1110/"
  }
];

function result(confidence, pattern) {
  return {
    action: confidence >= 0.85 ? 'block'
      : confidence >= 0.5 ? 'alert' : 'record',
    confidence,
    reason: pattern
  };
}

export function decide(alert) {
  const description = typeof alert?.rule?.description === 'string'
    ? alert.rule.description.slice(0, 2000) : '';
  const rawCount = alert?.data?.count;
  const parsedCount = typeof rawCount === 'number' ||
    (typeof rawCount === 'string' && /^\d+$/.test(rawCount))
      ? Number(rawCount) : 0;
  const count = Number.isSafeInteger(parsedCount) && parsedCount >= 0
    ? parsedCount : 0;
  const level = Number.isFinite(alert?.rule?.level)
    ? alert.rule.level : 0;

  // 실패라는 문구만으로 공격을 확정하지 않습니다.
  const failure = /실패/.test(description);
  const iterativeGuess = /비밀번호.*(?:한 글자|바꿔|변형)/.test(description);
  const samePassword = /같은 비밀번호/.test(description);
  const multipleAccounts = /여러 계정|서로 다른 계정|계정 이름을 바꿔/.test(description);
  const accountNumber = description.match(/계정\s*(\d+)개/);
  const accountCount = accountNumber ? Number(accountNumber[1]) : 0;
  const listedAccounts = typeof alert?.data?.accounts === 'string'
    ? new Set(alert.data.accounts.split(',').map(s => s.trim()).filter(Boolean)).size
    : 0;
  const multi = multipleAccounts || accountCount >= 5 || listedAccounts >= 5;
  const regular = /같은 간격|일정한 간격/.test(description);
  const repeated = /연속|이어|쌓|반복/.test(description);
  const minutes = description.match(/(\d+)분/);
  const shortWindow = minutes && Number(minutes[1]) <= 3;

  if (multi && samePassword && (failure || repeated)) {
    return result(0.95, PATTERNS[1].name);
  }
  if (failure && multi && regular && accountCount >= 10 && level >= 10) {
    return result(0.90, PATTERNS[1].name);
  }
  if (failure && count >= 30 &&
      (shortWindow || iterativeGuess || repeated || /성공은 없/.test(description))) {
    return result(0.95, PATTERNS[0].name);
  }
  if (failure && (count >= 3 || (multi && level >= 5))) {
    return result(0.60, PATTERNS[2].name);
  }
  return result(0.10, 'no_attack_pattern');
}
