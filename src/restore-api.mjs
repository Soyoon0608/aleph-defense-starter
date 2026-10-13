import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { createLoginVerifier } from './verify-login.mjs';
import { verifySafePolicyBackup } from './policy-recovery.mjs';
import config from '../aleph.config.json' with { type: 'json' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const SHA256 = /^[a-f0-9]{64}$/u;

let verifier;

export function contentDigest(content) {
  if (typeof content !== 'string') {
    throw new TypeError('invalid_backup_content');
  }

  return createHash('sha256')
    .update(content, 'utf8')
    .digest('hex');
}

function parseRestoreInput(body) {
  if (body === undefined || body === null || body === '') {
    return {};
  }

  let input;

  try {
    input = typeof body === 'string' ? JSON.parse(body) : body;
  } catch {
    throw new TypeError('invalid_restore_json');
  }

  if (!input || typeof input !== 'object' || Array.isArray(input)
      || Object.keys(input).some((key) => key !== 'id')) {
    throw new TypeError('invalid_restore_input');
  }

  if (input.id !== undefined
      && (typeof input.id !== 'string' || !UUID.test(input.id))) {
    throw new TypeError('invalid_restore_id');
  }

  return input;
}

async function readVerifiedPolicyBackup(dependencies = {}) {
  const loadPolicyBackup =
    typeof dependencies.loadPolicyBackup === 'function'
      ? dependencies.loadPolicyBackup
      : async () => JSON.parse(
          await readFile(
            new URL('../backups/policy.safe.json', import.meta.url),
            'utf8'
          )
        );

  const backup = await loadPolicyBackup();
  return verifySafePolicyBackup(backup);
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
    input = parseRestoreInput(req.body);
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
        await readVerifiedPolicyBackup(dependencies);

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

    let backupQuery = db
      .from('byteback_notes_backup')
      .select('id, owner_id, title, content, content_sha256, sample_marker');

    if (input.id) {
      backupQuery = backupQuery.eq('id', input.id);
    }

    const {
      data: backups,
      error: backupError
    } = await backupQuery.limit(2);

    if (backupError) throw backupError;

    if (!Array.isArray(backups) || backups.length === 0) {
      return res.status(404).json({ error: '검증된 복구 사본이 없습니다.' });
    }

    if (backups.length !== 1) {
      return res.status(409).json({ error: '복구 대상을 한 건으로 확정할 수 없습니다.' });
    }

    const backup = backups[0];

    console.log('S10_RESTORE_TRACE', {
      stage: 'backup_selected',
      backupCount: backups.length
    });

    if (!UUID.test(backup.id ?? '')
        || !UUID.test(backup.owner_id ?? '')
        || typeof backup.title !== 'string'
        || typeof backup.content !== 'string'
        || !SHA256.test(backup.content_sha256 ?? '')) {
      return res.status(409).json({ error: '복구 사본 검증에 실패했습니다.' });
    }

    if (input.id && input.id !== backup.id) {
      return res.status(409).json({ error: '복구 대상 ID가 사본과 다릅니다.' });
    }

    const digest = contentDigest(backup.content);

    if (digest !== backup.content_sha256) {
      return res.status(409).json({ error: '복구 사본 내용 해시가 다릅니다.' });
    }

    // 한 건만 upsert합니다. 다른 메모와 감사 기록은 건드리지 않습니다.
    const {
      data: restored,
      error: restoreError
    } = await db
      .from('byteback_notes')
      .upsert({
        id: backup.id,
        owner_id: backup.owner_id,
        title: backup.title,
        content: backup.content,
        sample_marker:
          typeof backup.sample_marker === 'string' && backup.sample_marker
            ? backup.sample_marker
            : config.sampleMarker
      }, {
        onConflict: 'id'
      })
      .select('id, owner_id, title, content')
      .maybeSingle();

    if (restoreError) throw restoreError;

    const restoreMatches = Boolean(
      restored
      && restored.id === backup.id
      && restored.owner_id === backup.owner_id
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
