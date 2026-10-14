import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  runRuleCheck
} from '../src/rule-check.mjs';

for (const id of [
  'registered_device_note_allowed',
  'unregistered_device_denied',
  'unusual_access_step_up',
  'other_zone_route_denied',
  'burst_read_revocation'
]) {
  test(`rule check ready: ${id}`, async () => {
    const result =
      await runRuleCheck(id);

    assert.equal(
      result?.ready,
      true
    );
  });
}

test(
  'unknown rule check is not invented',
  async () => {
    assert.equal(
      await runRuleCheck(
        'unknown-case'
      ),
      null
    );
  }
);
