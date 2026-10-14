import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { createLoginVerifier } from './verify-login.mjs';
import { verifyNoteRestorePlan } from './policy-recovery.mjs';
import config from '../aleph.config.json' with { type: 'json' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const SHA256 = /^[a-f0-9]{64}$/u;

const SAFE_MANIFEST_SCHEMA =
  'aleph.defense.safe-backup-manifest.v1';

const POLICY_BACKUP_FILE_SHA256 =
  'b3cd7fca1885073b1e32afe449bd5f7e26edee36676719e4152fd8d4084ecfc9';

let verifier;

export function contentDigest(content) {
  if (typeof content !== 'string') {
    throw new TypeError('invalid_backup_content');
  }

  return createHash('sha256')
    .update(content, 'utf8')
    .digest('hex');
}


export function noteBindingDigest(id, ownerId, contentSha256) {
  return createHash('sha256')
    .update(`${id}:${ownerId}:${contentSha256}`, 'utf8')
    .digest('hex');
}

function parseRestoreInput(req) {
  const noteId = req.query?.noteId;
  const body = req.body;

  if (typeof noteId !== 'string' || !UUID.test(noteId)) {
    throw new TypeError('invalid_restore_id');
  }

  if (body !== undefined && body !== null && body !== ''
      && (typeof body !== 'object'
        || Array.isArray(body)
        || Object.keys(body).length !== 0)) {
    throw new TypeError('invalid_restore_input');
  }

  return {
    id: noteId.toLowerCase()
  };
}

async function readVerifiedPolicyBackup(dependencies = {}, noteId) {
  const loadPolicyBackup =
    typeof dependencies.loadPolicyBackup === 'function'
      ? dependencies.loadPolicyBackup
      : async () => await readFile(
          new URL('../backups/policy.safe.json', import.meta.url),
          'utf8'
        );

  const loadBackupManifest =
    typeof dependencies.loadBackupManifest === 'function'
      ? dependencies.loadBackupManifest
      : async () => JSON.parse(
          await readFile(
            new URL('../backups/manifest.safe.json', import.meta.url),
            'utf8'
          )
        );

  const [backupInput, manifest] = await Promise.all([
    loadPolicyBackup(),
    loadBackupManifest()
  ]);

  let backup;
  let backupFileSha256 = null;

  if (typeof backupInput === 'string') {
    backupFileSha256 = createHash('sha256')
      .update(backupInput, 'utf8')
      .digest('hex');

    if (backupFileSha256 !== POLICY_BACKUP_FILE_SHA256) {
      throw new Error('policy_backup_file_verification_failed');
    }

    backup = JSON.parse(backupInput);
  } else {
    backup = backupInput;
  }

  const verified = verifyNoteRestorePlan({
    backup,
    scope: {
      service: 'notes',
      noteIds: [noteId]
    },
    currentRoutes:
      dependencies.currentRoutes ?? config.allowedRoutes
  });

  if (!manifest
      || typeof manifest !== 'object'
      || Array.isArray(manifest)
      || manifest.schema !== SAFE_MANIFEST_SCHEMA
      || manifest.policyVersion !== verified.version
      || manifest.policySha256 !== verified.sha256
      || manifest.backupSha256 !== verified.backupSha256) {
    throw new Error('backup_manifest_verification_failed');
  }

  return {
    ...verified,
    manifest,
    backupFileSha256
  };
}

export async function handleRestore(req, res, dependencies = {}) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: '허용되지 않은 요청입니다.' });
  }

  let input;

  try {
    input = parseRestoreInput(req);
  } catch {
    const rawBody =
      req.body && typeof req.body === 'object' && !Array.isArray(req.body)
        ? req.body
        : {};

    console.log('S10_RESTORE_TRACE', {
      stage: 'input_rejected',
      bodyKeys: Object.keys(rawBody).sort(),
      hasId: typeof rawBody.id === 'string'
    });

    return res.status(400).json({ error: '복구 요청 형식을 확인해 주세요.' });
  }

  console.log('S10_RESTORE_TRACE', {
    stage: 'input_accepted',
    hasId: typeof input.id === 'string'
  });

  const injectedDependencies =
    typeof dependencies.verifyLogin === 'function'
    && typeof dependencies.createClient === 'function';

  const url = dependencies.supabaseUrl ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;

  if (!url || (!key && !injectedDependencies)
      || url !== new URL(config.identityProvider.issuer).origin) {
    return res.status(500).json({ error: '자료 서버 설정을 확인해 주세요.' });
  }

  try {
    let login;

    if (injectedDependencies) {
      login = await dependencies.verifyLogin(req.headers?.authorization);
    } else {
      verifier ??= createLoginVerifier({
        config,
        supabaseSecretKey: key
      });

      login = await verifier(req.headers?.authorization);
    }

    if (!login) {
      return res.status(401).json({ error: '로그인이 필요합니다.' });
    }

    // 10단계 복구 확인은 시험 계정 B로만 수행합니다.
    if (login.kind !== 'judge' || login.identity !== 'b') {
      return res.status(403).json({ error: '복구 권한이 없습니다.' });
    }

    const client = injectedDependencies
      ? dependencies.createClient
      : createClient;

    let verifiedPolicyBackup;

    try {
      verifiedPolicyBackup =
        await readVerifiedPolicyBackup(dependencies, input.id);

      console.log('S10_RESTORE_TRACE', {
        stage: 'policy_backup_verified',
        version: verifiedPolicyBackup.version
      });
    } catch {
      console.log('S10_RESTORE_TRACE', {
        stage: 'policy_backup_rejected'
      });

      return res.status(409).json({
        error: '검증된 정책 사본을 확인할 수 없습니다.'
      });
    }

    const db = client(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });

    async function readBackupRows(expectedId, expectedOwner) {
      let query = db
        .from('byteback_notes_backup')
        .select(
          'id, owner_id, title, content, content_sha256, sample_marker'
        );

      if (expectedId) {
        query = query.eq('id', expectedId);
      }

      if (expectedOwner) {
        query = query.eq('owner_id', expectedOwner);
      }

      const {
        data,
        error
      } = await query.limit(2);

      if (error) throw error;

      return data;
    }

    function verifiedNoteState(row) {
      if (!row
          || !UUID.test(row.id ?? '')
          || !UUID.test(row.owner_id ?? '')
          || typeof row.title !== 'string'
          || typeof row.content !== 'string'
          || !SHA256.test(row.content_sha256 ?? '')) {
        return null;
      }

      const contentSha256 = contentDigest(row.content);

      if (contentSha256 !== row.content_sha256) {
        return null;
      }

      return {
        id: row.id,
        ownerId: row.owner_id,
        contentSha256,
        binding: noteBindingDigest(
          row.id,
          row.owner_id,
          contentSha256
        )
      };
    }

    // 첫 번째 읽기: 복구 대상으로 사용할 안전 사본을 검증합니다.
    const firstBackups = await readBackupRows(input.id, login.userId);

    if (!Array.isArray(firstBackups) || firstBackups.length === 0) {
      return res.status(404).json({
        error: '검증된 복구 사본이 없습니다.'
      });
    }

    if (firstBackups.length !== 1) {
      return res.status(409).json({
        error: '복구 대상을 한 건으로 확정할 수 없습니다.'
      });
    }

    const firstBackup = firstBackups[0];
    const firstState = verifiedNoteState(firstBackup);

    console.log('S10_RESTORE_TRACE', {
      stage: 'backup_selected',
      backupCount: firstBackups.length
    });

    if (!firstState) {
      return res.status(409).json({
        error: '복구 사본 검증에 실패했습니다.'
      });
    }

    if (input.id && input.id !== firstState.id) {
      return res.status(409).json({
        error: '복구 대상 ID가 사본과 다릅니다.'
      });
    }

    // 쓰기 직전 정책 사본과 매니페스트도 다시 읽어 검증합니다.
    let rereadPolicyBackup;

    try {
      rereadPolicyBackup =
        await readVerifiedPolicyBackup(dependencies, input.id);
    } catch {
      return res.status(409).json({
        error: '정책 사본 재검증에 실패했습니다.'
      });
    }

    if (rereadPolicyBackup.version !== verifiedPolicyBackup.version
        || rereadPolicyBackup.sha256 !== verifiedPolicyBackup.sha256
        || rereadPolicyBackup.backupSha256
          !== verifiedPolicyBackup.backupSha256
        || rereadPolicyBackup.backupFileSha256
          !== verifiedPolicyBackup.backupFileSha256) {
      return res.status(409).json({
        error: '검증 뒤 안전 사본이 변경되었습니다.'
      });
    }

    // 쓰기 직전 메모 사본도 다시 읽습니다.
    const rereadBackups = await readBackupRows(
      firstState.id,
      login.userId
    );

    if (!Array.isArray(rereadBackups)
        || rereadBackups.length !== 1) {
      return res.status(409).json({
        error: '검증한 메모 사본을 다시 읽을 수 없습니다.'
      });
    }

    const backup = rereadBackups[0];
    const rereadState = verifiedNoteState(backup);

    const rereadMatches = Boolean(
      rereadState
      && rereadState.id === firstState.id
      && rereadState.ownerId === firstState.ownerId
      && rereadState.contentSha256 === firstState.contentSha256
    );

    if (!rereadMatches) {
      return res.status(409).json({
        error: '재검증한 메모 사본이 처음 검증한 사본과 다릅니다.'
      });
    }

    const digest = rereadState.contentSha256;

    // 실제 쓰기 전에 버전과 변경 범위를 남깁니다.
    console.log('S10_RESTORE_TRACE', {
      stage: 'restore_preview',
      policyBackupVersion: rereadPolicyBackup.version,
      changeScope: ['byteback_notes:one-row']
    });

    // DB 내부에서도 ID·소유자·백업 무결성을 다시 검증한 뒤
    // 정확히 한 건만 복구합니다.
    const {
      data: restoreResult,
      error: restoreError
    } = await db.rpc('byteback_restore_note', {
      p_id: backup.id,
      p_owner: login.userId
    });

    if (restoreError) throw restoreError;

    const rpcResult =
      Array.isArray(restoreResult) && restoreResult.length === 1
        ? restoreResult[0]
        : null;

    const rpcMatches = Boolean(
      rpcResult
      && rpcResult.id === backup.id
      && rpcResult.restored === true
      && rpcResult.owner_matched === true
      && rpcResult.content_hash === digest
    );

    if (!rpcMatches) {
      return res.status(409).json({
        error: 'DB 복구 결과 검증에 실패했습니다.'
      });
    }

    // RPC 응답만 믿지 않고 실제 저장된 한 건을 다시 읽어 확인합니다.
    const {
      data: restoredRows,
      error: restoredReadError
    } = await db
      .from('byteback_notes')
      .select('id, owner_id, title, content')
      .eq('id', backup.id)
      .limit(2);

    if (restoredReadError) throw restoredReadError;

    const restored =
      Array.isArray(restoredRows) && restoredRows.length === 1
        ? restoredRows[0]
        : null;

    const restoreMatches = Boolean(
      restored
      && restored.id === backup.id
      && restored.owner_id === login.userId
      && contentDigest(restored.content) === digest
    );

    console.log('S10_RESTORE_TRACE', {
      stage: 'restore_finished',
      restoreMatches
    });

    if (!restoreMatches) {
      return res.status(409).json({ error: '복구 결과 검증에 실패했습니다.' });
    }

    return res.status(200).json({
      restored: true,
      id: restored.id,
      ownerId: restored.owner_id,
      contentSha256: digest,
      policyBackupVersion: verifiedPolicyBackup.version
    });
  } catch {
    return res.status(503).json({ error: '복구 요청을 처리하지 못했습니다.' });
  }
}
