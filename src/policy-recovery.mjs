import { createHash } from 'node:crypto';
import safeManifest from '../backups/manifest.safe.json' with { type: 'json' };

const BACKUP_SCHEMA = 'aleph.defense.safe-policy.v1';
const MANIFEST_SCHEMA =
  'aleph.defense.safe-backup-manifest.v1';

const SAFE_POLICY_REVISION = 'safe-stage9';
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

function canonical(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonical).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(',')}}`;
  }

  return JSON.stringify(value);
}

function sameValue(left, right) {
  return canonical(left) === canonical(right);
}

export function policyDigest(policy) {
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) {
    throw new TypeError('invalid_policy');
  }

  return createHash('sha256')
    .update(canonical(policy))
    .digest('hex');
}

export function verifySafePolicyBackup(backup) {
  if (!backup || typeof backup !== 'object' || Array.isArray(backup)) {
    throw new TypeError('missing_policy_backup');
  }

  if (backup.schema !== BACKUP_SCHEMA) {
    throw new TypeError('invalid_policy_backup_schema');
  }

  if (!Number.isInteger(backup.version) || backup.version < 1) {
    throw new TypeError('invalid_policy_backup_version');
  }

  if (!backup.policy
      || typeof backup.policy !== 'object'
      || Array.isArray(backup.policy)) {
    throw new TypeError('invalid_policy_backup');
  }

  if (typeof backup.sha256 !== 'string'
      || !/^[a-f0-9]{64}$/u.test(backup.sha256)) {
    throw new TypeError('invalid_policy_backup_digest');
  }

  const actualDigest = policyDigest(backup.policy);

  if (actualDigest !== backup.sha256) {
    throw new Error('policy_backup_verification_failed');
  }

  const backupSha256 = policyDigest(backup);

  if (!safeManifest
      || safeManifest.schema !== MANIFEST_SCHEMA
      || safeManifest.policyVersion !== backup.version
      || safeManifest.policySha256 !== actualDigest
      || safeManifest.backupSha256 !== backupSha256) {
    throw new Error('policy_backup_not_trusted');
  }

  return {
    verified: true,
    version: backup.version,
    sha256: actualDigest,
    backupSha256,
    policy: backup.policy
  };
}

export function verifyNoteRestorePlan({
  backup,
  scope,
  currentRoutes
}) {
  const verified = verifySafePolicyBackup(backup);

  if (backup.policyRevision !== SAFE_POLICY_REVISION
      || backup.service !== 'notes'
      || !backup.restoreScope
      || backup.restoreScope.service !== 'notes'
      || backup.restoreScope.maxNotes !== 1) {
    throw new Error('invalid_restore_policy_scope');
  }

  if (!scope
      || scope.service !== 'notes'
      || !Array.isArray(scope.noteIds)
      || scope.noteIds.length !== 1
      || !UUID.test(scope.noteIds[0] ?? '')) {
    throw new Error('invalid_restore_request_scope');
  }

  if (!Array.isArray(currentRoutes)
      || !sameValue(currentRoutes, verified.policy.allowedRoutes)) {
    throw new Error('restore_routes_do_not_match_backup');
  }

  return {
    ...verified,
    policyRevision: backup.policyRevision,
    scope: {
      service: 'notes',
      noteIds: [scope.noteIds[0].toLowerCase()]
    }
  };
}

function collectChanges(current, safe, prefix = '', changes = []) {
  for (const [key, safeValue] of Object.entries(safe)) {
    const path = prefix ? `${prefix}.${key}` : key;
    const currentValue = current?.[key];

    if (
      safeValue
      && typeof safeValue === 'object'
      && !Array.isArray(safeValue)
    ) {
      collectChanges(
        currentValue && typeof currentValue === 'object'
          ? currentValue
          : {},
        safeValue,
        path,
        changes
      );
      continue;
    }

    if (!sameValue(currentValue, safeValue)) {
      changes.push({
        path,
        current: currentValue ?? null,
        restore: safeValue
      });
    }
  }

  return changes;
}

export function previewPolicyRestore(currentPolicy, backup) {
  if (!currentPolicy
      || typeof currentPolicy !== 'object'
      || Array.isArray(currentPolicy)) {
    throw new TypeError('invalid_current_policy');
  }

  const verifiedBackup = verifySafePolicyBackup(backup);

  const changes = collectChanges(
    currentPolicy,
    verifiedBackup.policy
  );

  return {
    verified: true,
    restoreVersion: verifiedBackup.version,
    restoreDigest: verifiedBackup.sha256,
    changes
  };
}

// 제작 2:
// 검증된 안전 정책 사본의 항목만 시험 정책에 되돌립니다.
// preview 결과를 먼저 확인하지 않으면 실행하지 않습니다.
// 안전 정책 사본에 없는 다른 서비스 설정과 감사 이력은 보존합니다.
export function restoreTestPolicy(currentPolicy, backup, expectedChanges) {
  if (!Array.isArray(expectedChanges)) {
    throw new TypeError('restore_preview_required');
  }

  const preview = previewPolicyRestore(currentPolicy, backup);

  if (!sameValue(preview.changes, expectedChanges)) {
    throw new Error('restore_preview_changed');
  }

  const verifiedBackup = verifySafePolicyBackup(backup);
  const restored = structuredClone(currentPolicy);

  function restoreKnownValues(target, safe) {
    for (const [key, safeValue] of Object.entries(safe)) {
      if (
        safeValue
        && typeof safeValue === 'object'
        && !Array.isArray(safeValue)
      ) {
        const currentValue = target[key];

        if (
          !currentValue
          || typeof currentValue !== 'object'
          || Array.isArray(currentValue)
        ) {
          target[key] = {};
        }

        restoreKnownValues(target[key], safeValue);
        continue;
      }

      target[key] = structuredClone(safeValue);
    }
  }

  restoreKnownValues(restored, verifiedBackup.policy);

  return {
    restored: true,
    version: verifiedBackup.version,
    sha256: verifiedBackup.sha256,
    changedPaths: preview.changes.map((item) => item.path),
    policy: restored
  };
}
