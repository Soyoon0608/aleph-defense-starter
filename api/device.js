import { createClient } from '@supabase/supabase-js';
import config from '../aleph.config.json' with { type: 'json' };
import { createLoginVerifier } from '../src/verify-login.mjs';
import { serverDeviceContext } from '../src/server-device.mjs';

let verifier;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader(
    'X-Content-Type-Options',
    'nosniff'
  );

  if (!['GET', 'POST'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST');

    return res.status(405).json({
      error: '조회 또는 승인 요청만 가능합니다.'
    });
  }

  const url = process.env.SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;

  if (!url
      || !secret
      || url !==
        new URL(
          config.identityProvider.issuer
        ).origin) {
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
      await verifier(
        req.headers.authorization
      );

    if (identity?.kind !== 'student'
        || !identity.userId) {
      return res.status(401).json({
        error: '본인 계정으로 로그인해 주세요.'
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

    const db = createClient(
      url,
      secret,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false
        }
      }
    );

    if (req.method === 'POST') {
      const body =
        typeof req.body === 'string'
          ? JSON.parse(req.body)
          : req.body;

      if (body != null
          && (
            typeof body !== 'object'
            || Array.isArray(body)
            || Object.keys(body).length !== 0
          )) {
        return res.status(400).json({
          error:
            '승인 정보는 서버가 확인합니다.'
        });
      }

      const { error } =
        await db
          .from('device_approval_requests')
          .upsert(
            {
              class_id: context.classId,
              project_id: context.projectId,
              subject_id: context.subjectId,
              device_id: context.deviceId,
              user_id: identity.userId,
              requested_at:
                new Date().toISOString()
            },
            {
              onConflict:
                'class_id,project_id,subject_id,device_id,user_id'
            }
          );

      if (error) {
        return res.status(503).json({
          error:
            '기기 승인 요청을 저장할 수 없습니다.'
        });
      }

      return res.status(202).json({
        requested: true,
        registered: false
      });
    }

    const { data, error } =
      await db
        .from('principal_bindings')
        .select('enabled,expires_at')
        .eq('class_id', context.classId)
        .eq('project_id', context.projectId)
        .eq('subject_id', context.subjectId)
        .eq('device_id', context.deviceId)
        .eq('user_id', identity.userId)
        .maybeSingle();

    if (error) {
      return res.status(503).json({
        error:
          '기기 등록 상태를 확인할 수 없습니다.'
      });
    }

    const expiresAt =
      Date.parse(data?.expires_at ?? '');

    const registered =
      data?.enabled === true
      && Number.isFinite(expiresAt)
      && expiresAt > Date.now();

    return res.status(200).json({
      registered,
      deviceId: context.deviceId,
      ...(registered
        ? { expiresAt }
        : {})
    });
  } catch {
    return res.status(503).json({
      error:
        '기기 등록 상태를 확인할 수 없습니다.'
    });
  }
}
