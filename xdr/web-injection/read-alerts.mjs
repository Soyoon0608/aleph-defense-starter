
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function safeText(value) {
  if (typeof value !== 'string') return null;
  const secret = /sb_secret_[A-Za-z0-9_-]+|Bearer\s+\S+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|-----BEGIN.*PRIVATE KEY-----|(?:password|passwd|token|secret|api[_-]?key)\s*[:=]\s*\S+/i;
  return secret.test(value) ? '[가림]' : value.slice(0, 500);
}

export async function readAlerts() {
  const fixture = JSON.parse(await readFile(
    new URL('../fixtures/web-injection.json', import.meta.url), 'utf8'
  ));
  if (fixture.schema !== 'aleph.xdr.fixture.v1' ||
      fixture.moduleKey !== 'web-injection' ||
      !Array.isArray(fixture.alerts)) {
    throw new Error('공식 경보 묶음 형식을 확인해 주세요.');
  }

  const rows = fixture.alerts.map(alert => ({
    timestamp: safeText(alert?.timestamp),
    sourceAddress: safeText(alert?.data?.srcip),
    account: safeText(alert?.data?.srcuser),
    level: Number.isFinite(alert?.rule?.level) ? alert.rule.level : null,
    description: safeText(alert?.rule?.description)
  }));
  return { alertCount: fixture.alerts.length, rows };
}

if (process.argv[1] &&
    resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { alertCount, rows } = await readAlerts();
  for (const row of rows) console.log(JSON.stringify(row));
  console.log('경보 건수:', alertCount);
  console.log('뽑은 줄 수:', rows.length);
  console.log('건수 일치:', alertCount === rows.length);
}
