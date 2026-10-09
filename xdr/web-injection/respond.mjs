import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { isIP } from 'node:net';
import { decide } from './decide.mjs';

const root = new URL('../', import.meta.url);

export async function respond(alerts, { now = Date.now(), ttlSeconds = 900 } = {}) {
  if (!Array.isArray(alerts) || !Number.isFinite(now) ||
      !Number.isInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > 3600) {
    throw new Error('경보와 만료 설정을 확인해 주세요.');
  }

  const rules = [];
  const logs = [];

  for (const alert of alerts) {
    const out = decide(alert);

    const id = typeof alert?.id === 'string' &&
      /^[a-zA-Z0-9_-]{1,80}$/.test(alert.id)
        ? alert.id
        : null;

    const address = alert?.data?.srcip;

    if (![
      'SQL 구문 주입',
      '스크립트 태그 주입',
      '경로 이탈 반복',
      'no_attack_pattern'
    ].includes(out.reason)) {
      throw new Error('알 수 없는 판단 근거입니다.');
    }

    if (out.action !== 'record') {
      logs.push(JSON.stringify({
        at: new Date(now).toISOString(),
        alertId: id,
        action: out.action,
        confidence: out.confidence,
        reason: out.reason
      }));
    }

    if (
      out.action === 'block' &&
      out.confidence >= 0.85 &&
      id &&
      typeof address === 'string' &&
      isIP(address)
    ) {
      rules.push({
        ruleId: 'xdr.web_injection.' + id,
        decision: 'deny',
        sourceAddress: address,
        evidenceAlertId: id,
        reason: out.reason,
        createdAt: new Date(now).toISOString(),
        expiresAt: new Date(now + ttlSeconds * 1000).toISOString()
      });
    }
  }

  await mkdir(new URL('web-injection/', root), { recursive: true });

  await writeFile(
    new URL('web-injection/block-candidates.json', root),
    JSON.stringify({
      schema: 'aleph.xdr.block-candidates.v1',
      integrationStatus: 'pending_verified_source_address_contract',
      rules
    }, null, 2) + '\n'
  );

  if (logs.length) {
    await appendFile(
      new URL('alerts.log', root),
      logs.join('\n') + '\n'
    );
  }

  return {
    rules,
    logged: logs.length
  };
}

export function matchesCandidate(rules, verifiedSourceAddress, now = Date.now()) {
  if (!Array.isArray(rules) ||
      !isIP(verifiedSourceAddress || '') ||
      !Number.isFinite(now)) {
    return false;
  }

  return rules.some(rule =>
    rule.sourceAddress === verifiedSourceAddress &&
    Date.parse(rule.createdAt) <= now &&
    Date.parse(rule.expiresAt) > now
  );
}
