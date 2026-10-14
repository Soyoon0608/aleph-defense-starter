import { createClient } from '@supabase/supabase-js';
import config from '../aleph.config.json' with { type: 'json' };
import { createLoginVerifier } from '../src/verify-login.mjs';
import { issueAppCertificate } from '../src/app-proof.mjs';
import { serverDeviceContext } from '../src/server-device.mjs';

let verifier;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({
      error: 'POST만 가능합니다.'
    });
  }

  const url = process.env.SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;

  if (!url
      || !secret
      || url !== new URL(config.identityProvider.issuer).origin) {
    return res.status(500).json({
      error: '자료 서버 설정을 확인해 주세요.'
    });
  }

  try {
    verifier ??= createLoginVerifier({
      config,
      supabaseSecretKey: secret
    });

    const identity =
      await verifier(req.headers.authorization);

    if (identity?.kind !== 'student'
        || !identity.userId) {
      return res.status(401).json({
        error: '로그인이 필요합니다.'
      });
    }

    const context =
      serverDeviceContext(
        req,
        res,
        identity,
        config,
        secret
      );

    const db = createClient(url, secret, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });

    const { data, error } =
      await db
        .from('principal_bindings')
        .select('enabled,expires_at')
        .eq('class_id', context.classId)
        .eq('project_id', context.projectId)
        .eq('subject_id', context.subjectId)
        .eq('device_id', context.deviceId)
        .eq('user_id', identity.userId)
        .eq('enabled', true)
        .maybeSingle();

    const expiresAt =
      Date.parse(data?.expires_at ?? '');

    if (error
        || !data
        || !Number.isFinite(expiresAt)
        || expiresAt <= Date.now()) {
      return res.status(403).json({
        error:
          '현재 승인된 기기만 요청 서명을 연결할 수 있습니다.'
      });
    }

    const body =
      typeof req.body === 'string'
        ? JSON.parse(req.body)
        : req.body;

    if (!body
        || typeof body !== 'object'
        || Array.isArray(body)
        || Object.keys(body).some(
          key => key !== 'publicKey'
        )
        || !body.publicKey) {
      return res.status(400).json({
        error: '공개키만 전달해 주세요.'
      });
    }

    return res.status(200).json(
      issueAppCertificate({
        identity,
        secret,
        context,
        publicKey: body.publicKey,
        expiresAt
      })
    );
  } catch {
    return res.status(400).json({
      error: '요청 서명 연결을 확인해 주세요.'
    });
  }
}
