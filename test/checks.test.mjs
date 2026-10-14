import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildChecks,
  checksLogLine
} from '../src/checks.mjs';

const policy = {
  schema: 'aleph.defense.safe-policy.v1',
  version: 9,
  sourceCommit: 'a'.repeat(40),
  sha256: 'b'.repeat(64),
  policyRevision: 'safe-stage9'
};

test(
  'operations room preserves not_run when no measurements exist',
  () => {
    const checks = buildChecks({
      ruleIds: [
        'device_registered',
        'step_up_required',
        'resource_zone'
      ],
      policy,
      record: {
        schema: 'byteback.ops-record.v1',
        status: 'not_run',
        commit: 'c'.repeat(40),
        checkedAt: null,
        rows: []
      }
    });

    assert.equal(
      checks.record.status,
      'not_run'
    );

    assert.deepEqual(
      checks.record.counts,
      {
        total: 0,
        blocked: 0,
        allowed: 0,
        unexpected: 0,
        notRun: 0
      }
    );

    assert.equal(
      checks.areas.detection.status,
      'not_run'
    );

    assert.equal(
      checks.areas.revocation.status,
      'not_run'
    );

    assert.equal(
      checks.recoveryVersion.version,
      9
    );
  }
);

test(
  'screen counts and redacted server record use the same counts',
  () => {
    const checks = buildChecks({
      ruleIds: ['device_registered'],
      policy,
      record: {
        schema: 'byteback.ops-record.v1',
        status: 'confirmed',
        commit: 'd'.repeat(40),
        checkedAt: '2026-10-14T03:00:00.000Z',
        rows: [
          {
            attackId: 'deny-one',
            stage: 8,
            kind: 'deny',
            area: 'decision',
            expected: 'deny',
            observed: 'HTTP 403',
            result: 'blocked',
            requestIds: ['r1'],
            checkedAt:
              '2026-10-14T03:00:00.000Z'
          },
          {
            attackId: 'allow-one',
            stage: 8,
            kind: 'allow',
            area: 'decision',
            expected: 'allow',
            observed: 'HTTP 200',
            result: 'allowed',
            requestIds: ['r2'],
            checkedAt:
              '2026-10-14T03:00:01.000Z'
          },
          {
            attackId: 'not-run-one',
            stage: 11,
            kind: 'allow',
            area: 'app',
            expected: 'allow',
            observed: '미실행',
            result: 'not_run',
            requestIds: [],
            checkedAt: null
          }
        ]
      }
    });

    const log = checksLogLine(checks);

    assert.equal(checks.record.counts.total, 3);
    assert.equal(checks.record.counts.blocked, 1);
    assert.equal(checks.record.counts.allowed, 1);
    assert.equal(checks.record.counts.notRun, 1);

    assert.equal(
      log.total,
      checks.record.counts.total
    );

    assert.equal(
      log.blocked,
      checks.record.counts.blocked
    );

    assert.equal(
      log.allowed,
      checks.record.counts.allowed
    );

    assert.equal(
      log.notRun,
      checks.record.counts.notRun
    );
  }
);
