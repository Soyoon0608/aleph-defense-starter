const RESULTS = [
  'blocked',
  'allowed',
  'unexpected',
  'not_run'
];

const AREAS = [
  'decision',
  'detection',
  'restore',
  'access',
  'device',
  'app'
];

export function countRows(rows) {
  const list = Array.isArray(rows) ? rows : [];

  const count = result =>
    list.filter(item => item?.result === result).length;

  return {
    total: list.length,
    blocked: count('blocked'),
    allowed: count('allowed'),
    unexpected: count('unexpected'),
    notRun: count('not_run')
  };
}

function cleanRow(item) {
  return {
    attackId: String(item?.attackId ?? ''),
    stage: Number(item?.stage ?? 0),
    kind: item?.kind === 'allow' ? 'allow' : 'deny',
    area: AREAS.includes(item?.area)
      ? item.area
      : 'access',
    expected: String(item?.expected ?? ''),
    observed: String(item?.observed ?? ''),
    result: RESULTS.includes(item?.result)
      ? item.result
      : 'not_run',
    requestIds: Array.isArray(item?.requestIds)
      ? item.requestIds.filter(
          id => typeof id === 'string'
        )
      : [],
    checkedAt:
      typeof item?.checkedAt === 'string'
        ? item.checkedAt
        : null
  };
}

function areaSummary(rows, name) {
  const selected =
    rows.filter(item => item.area === name);

  const counts = countRows(selected);

  return {
    status:
      selected.some(item =>
        item.result !== 'not_run'
      )
        ? 'confirmed'
        : 'not_run',
    ...counts
  };
}

export function buildChecks({
  ruleIds,
  policy,
  record
}) {
  const recordShapeOk =
    record?.schema === 'byteback.ops-record.v1'
    && Array.isArray(record.rows);

  const rows = recordShapeOk
    ? record.rows.map(cleanRow)
    : [];

  const counts = countRows(rows);

  const recordConfirmed =
    recordShapeOk
    && record.status === 'confirmed';

  const policyOk =
    policy?.schema === 'aleph.defense.safe-policy.v1'
    && Number.isInteger(policy.version)
    && typeof policy.sourceCommit === 'string'
    && typeof policy.sha256 === 'string';

  return {
    schema: 'byteback.checks.v1',

    record: {
      status:
        recordConfirmed
          ? 'confirmed'
          : 'not_run',
      source: 'ops/ops-record.json',
      commit:
        typeof record?.commit === 'string'
          ? record.commit.slice(0, 12)
          : null,
      checkedAt:
        typeof record?.checkedAt === 'string'
          ? record.checkedAt
          : null,
      counts
    },

    rules: {
      status: 'configured',
      source: 'src/decider.mjs RULE_IDS',
      note:
        '구현된 규칙 이름이며 실측 통과 결과를 뜻하지 않습니다.',
      ids: Array.isArray(ruleIds)
        ? ruleIds.filter(
            id => typeof id === 'string'
          )
        : []
    },

    areas: {
      decision: areaSummary(rows, 'decision'),
      detection: areaSummary(rows, 'detection'),

      revocation: {
        status: 'not_run',
        total: 0,
        blocked: 0,
        allowed: 0,
        unexpected: 0,
        notRun: 0,
        note:
          '현재 저장소에는 접속 회수 집행 결과를 확인한 기록이 없어 미실행으로 표시합니다.'
      },

      restore: areaSummary(rows, 'restore'),
      access: areaSummary(rows, 'access'),
      device: areaSummary(rows, 'device'),
      app: areaSummary(rows, 'app')
    },

    recoveryVersion: policyOk
      ? {
          status: 'configured',
          source: 'backups/policy.safe.json',
          version: policy.version,
          sourceCommit:
            policy.sourceCommit.slice(0, 12),
          policyRevision:
            String(policy.policyRevision ?? ''),
          sha256:
            policy.sha256.slice(0, 12)
        }
      : {
          status: 'not_run',
          source: 'backups/policy.safe.json',
          reason: 'policy_metadata_unavailable'
        },

    rows
  };
}

export function checksLogLine(checks) {
  const counts =
    checks?.record?.counts
    ?? countRows([]);

  return {
    event: 'checks',
    recordStatus:
      checks?.record?.status ?? 'not_run',
    recordCommit:
      checks?.record?.commit ?? null,
    total: counts.total,
    blocked: counts.blocked,
    allowed: counts.allowed,
    unexpected: counts.unexpected,
    notRun: counts.notRun,
    decision:
      checks?.areas?.decision?.status
      ?? 'not_run',
    detection:
      checks?.areas?.detection?.status
      ?? 'not_run',
    revocation:
      checks?.areas?.revocation?.status
      ?? 'not_run',
    restore:
      checks?.areas?.restore?.status
      ?? 'not_run',
    recoveryVersion:
      checks?.recoveryVersion?.version
      ?? null
  };
}
