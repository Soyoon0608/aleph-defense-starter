import record from '../ops/ops-record.json' with { type: 'json' };
import policy from '../backups/policy.safe.json' with { type: 'json' };

import { RULE_IDS } from '../src/decider.mjs';
import {
  buildChecks,
  checksLogLine
} from '../src/checks.mjs';
import { runRuleCheck } from '../src/rule-check.mjs';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader(
    'X-Content-Type-Options',
    'nosniff'
  );

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');

    return res.status(405).json({
      error: 'METHOD_NOT_ALLOWED'
    });
  }

  const caseId = req.query?.case;

  if (caseId !== undefined) {
    if (typeof caseId !== 'string') {
      return res.status(400).json({
        error: 'UNKNOWN_CHECK'
      });
    }

    const result =
      await runRuleCheck(caseId);

    return result
      ? res.status(200).json(result)
      : res.status(400).json({
          error: 'UNKNOWN_CHECK'
        });
  }

  const checks = buildChecks({
    ruleIds: RULE_IDS,
    policy,
    record
  });

  const redactedServerRecord =
    checksLogLine(checks);

  console.warn(
    JSON.stringify(redactedServerRecord)
  );

  return res.status(200).json({
    ...checks,
    redactedServerRecord
  });
}
