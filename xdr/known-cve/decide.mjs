const PATTERNS = Object.freeze({
  jndi_lookup_in_header: Object.freeze({
    name: '요청 머리글의 원격 JNDI 조회 구문',
    condition: '요청 머리글 값에 ${jndi:...://...} 형태의 완전한 원격 조회 구문이 있다.',
    evidence: 'CVE-2021-44228의 JNDI 원격 조회 악용 형태'
  }),
  jndi_lookup_in_param: Object.freeze({
    name: '요청 인자의 원격 JNDI 조회 구문',
    condition: '요청 주소의 질의 인자에 ${jndi:...://...} 형태의 완전한 원격 조회 구문이 있다.',
    evidence: 'MITRE ATT&CK T1190 외부 공개 애플리케이션 취약점 악용'
  }),
  known_scanner_trace: Object.freeze({
    name: '알려진 취약점 점검 도구의 흔적',
    condition: '알려진 취약점 점검·스캐닝 또는 관련 약한 흔적이 있다.',
    evidence: '완전한 악용 구문이 없는 점검 흔적은 차단하지 않고 경보로 남김'
  })
});

const LOOKUP = /\$\{jndi:[a-z][a-z0-9+.-]*:\/\/[^}\s]+\}/iu;

const WEAK_REQUEST =
  /cve-\d{4}-\d{4,}|jndi|\$\{|lookup|log4j|log-library|cve-list|class-check/iu;

const WEAK_DESCRIPTION =
  /취약점|점검|스캔|스캐닝|jndi|조회 구문|조회 형태|중괄호|라이브러리/iu;

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
  const level = Number.isFinite(alert?.rule?.level)
    ? alert.rule.level
    : null;

  const description = text(alert?.rule?.description);
  const useragent = text(alert?.data?.useragent);
  const url = text(alert?.data?.url);

  const queryIndex = url.indexOf('?');
  const query = queryIndex >= 0 ? url.slice(queryIndex + 1) : '';

  const headerLookup = LOOKUP.test(useragent);
  const paramLookup = LOOKUP.test(query);

  if (headerLookup && paramLookup) {
    return result(
      0.98,
      `${PATTERNS.jndi_lookup_in_header.name} + ${PATTERNS.jndi_lookup_in_param.name}`
    );
  }

  if (headerLookup) {
    return result(
      0.95,
      PATTERNS.jndi_lookup_in_header.name
    );
  }

  if (paramLookup) {
    return result(
      0.95,
      PATTERNS.jndi_lookup_in_param.name
    );
  }

  const scannerTrace =
    /점검|스캔|스캐닝/iu.test(description);

  if (scannerTrace) {
    return result(
      0.65,
      PATTERNS.known_scanner_trace.name
    );
  }

  const weakSignal =
    WEAK_REQUEST.test(`${url} ${useragent}`) ||
    WEAK_DESCRIPTION.test(description);

  if (weakSignal) {
    return result(
      0.55,
      `${PATTERNS.known_scanner_trace.name} · 약한 관련 신호`
    );
  }

  if (level !== null && level >= 9) {
    return result(
      0.5,
      `${PATTERNS.known_scanner_trace.name} · 높은 규칙 수준이나 명확한 악용 구문 없음`
    );
  }

  return result(
    0.05,
    '알려진 취약점 악용 패턴 없음'
  );
}
