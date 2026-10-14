import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { runAttackRecords } from '../src/attack-check.mjs';
import { countRows } from '../src/checks.mjs';

const root = resolve(import.meta.dirname, '..');

try {
  const config = JSON.parse(
    readFileSync(join(root, 'aleph.config.json'), 'utf8')
  );

  const commit = execFileSync(
    'git',
    ['-C', root, 'rev-parse', '--verify', 'HEAD'],
    {
      encoding: 'utf8',
      timeout: 5000,
      windowsHide: true
    }
  ).trim();

  const rows = await runAttackRecords(config);

  const record = {
    schema: 'byteback.ops-record.v1',
    status: 'confirmed',
    step: config.step,
    commit,
    checkedAt: new Date().toISOString(),
    note:
      '실제 배포 GET 결과와 고정 가상 입력 판정 API 결과입니다. not_run은 보내지 않은 점검입니다. 41종 총공세는 심판이 판정합니다.',
    counts: countRows(rows),
    rows
  };

  const text =
    JSON.stringify(record, null, 2) + '\n';

  mkdirSync(
    join(root, 'ops'),
    { recursive: true }
  );

  writeFileSync(
    join(root, 'ops', 'ops-record.json'),
    text,
    'utf8'
  );

  const c = record.counts;

  console.log(
    `점검 기록 생성: ops/ops-record.json`
  );

  console.log(
    `점검 ${c.total} · 금지 거부 ${c.blocked} · 정상 허용 ${c.allowed} · 예상과 다름 ${c.unexpected} · 미실행 ${c.notRun}`
  );
} catch (error) {
  console.error(
    `점검 기록 생성 중 첫 오류: ${error.message}`
  );
  process.exitCode = 1;
}
