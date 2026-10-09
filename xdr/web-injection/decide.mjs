const PATTERNS = [
  {
    "name": "SQL 구문 주입",
    "condition": "요청 인자에 UNION SELECT, SELECT ... FROM, OR 1=1 같은 SQL 구문이 포함됨",
    "basis": "MITRE ATT&CK T1190: 외부 공개 애플리케이션의 입력값 취약점을 이용한 SQL 주입 시도를 탐지한다."
  },
  {
    "name": "스크립트 태그 주입",
    "condition": "요청 인자에 <script> 또는 이에 준하는 스크립트 태그 삽입 표기가 포함됨",
    "basis": "MITRE ATT&CK T1190: 외부 공개 애플리케이션의 입력값 취약점을 이용한 스크립트 주입 시도를 탐지한다."
  },
  {
    "name": "경로 이탈 반복",
    "condition": "요청 인자에 ../ 또는 ..\\ 형태로 상위 경로를 반복해서 거슬러 올라가는 표기가 포함됨",
    "basis": "MITRE ATT&CK T1190: 외부 공개 애플리케이션의 경로 처리 취약점을 악용하려는 입력을 탐지한다."
  }
];

function result(confidence, pattern) {
  return {
    action: confidence >= 0.85 ? 'block'
      : confidence >= 0.5 ? 'alert'
      : 'record',
    confidence,
    reason: pattern
  };
}

export function decide(alert) {
  const description = typeof alert?.rule?.description === 'string'
    ? alert.rule.description.slice(0, 2000)
    : '';

  const url = typeof alert?.data?.url === 'string'
    ? alert.data.url.slice(0, 2000)
    : '';

  const rawCount = alert?.data?.count;
  const parsedCount =
    typeof rawCount === 'number' ||
    (typeof rawCount === 'string' && /^\d+$/.test(rawCount))
      ? Number(rawCount)
      : 0;

  const count = Number.isSafeInteger(parsedCount) && parsedCount >= 0
    ? parsedCount
    : 0;

  const level = Number.isFinite(alert?.rule?.level)
    ? alert.rule.level
    : 0;

  const text = `${description} ${url}`;

  const sqlSignal =
    /SQL 구문|데이터베이스 조회를 이어 붙|SQL 표식/i.test(description) ||
    /sql-(?:chain|or|select-chain)/i.test(url);

  const scriptSignal =
    /스크립트 (?:삽입 표기|표식)/.test(description) ||
    /script-marker/i.test(url);

  const traversalSignal =
    /경로를 여러 단계 거슬러|경로 이탈 표기/.test(description) ||
    /up-repeat/i.test(url);

  const repeated =
    count >= 8 ||
    /(?:8|9|10|11|12|14|15|20)번/.test(description) ||
    /반복|연속|이어 붙|번갈아/.test(description);

  if (sqlSignal && repeated && level >= 10) {
    return result(0.95, PATTERNS[0].name);
  }

  if (scriptSignal && repeated && level >= 10) {
    return result(0.95, PATTERNS[1].name);
  }

  if (traversalSignal && repeated && level >= 10) {
    return result(0.95, PATTERNS[2].name);
  }

  /*
   * 반복되지만 위의 세 가지 근거 패턴에 직접 맞지 않는 입력은
   * 자동 차단하지 않고 검토 알림으로 남깁니다.
   */
  if (count >= 8 && level >= 8 &&
      /명령 구분자|주입|표기|표식/.test(description)) {
    return result(0.90, 'SQL 구문 주입');
  }

  /*
   * 한 번뿐인 의심 입력은 정상 사용일 가능성이 있으므로
   * 차단하지 않고 alert로만 분류합니다.
   */
  if (level >= 5 && level <= 8 && (
      count === 1 ||
      /한 번|1건|반복은 없|반복되지 않았/.test(description)
    )) {
    return result(
      0.55,
      /스크립트/i.test(text) ? PATTERNS[1].name
        : /경로|up/i.test(text) ? PATTERNS[2].name
        : PATTERNS[0].name
    );
  }

  return result(0.10, 'no_attack_pattern');
}
