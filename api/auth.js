
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: '허용되지 않은 요청입니다.' });
  }

  // 브라우저의 다른 사이트에서 보내는 요청은 받지 않습니다.
  if (req.headers['sec-fetch-site'] === 'cross-site') {
    return res.status(403).json({ error: '허용되지 않은 출처입니다.' });
  }
  if (req.headers.origin) {
    try {
      const origin = new URL(req.headers.origin);
      if (origin.protocol !== 'https:' ||
          origin.host !== req.headers.host) {
        return res.status(403).json({ error: '허용되지 않은 출처입니다.' });
      }
    } catch {
      return res.status(403).json({ error: '허용되지 않은 출처입니다.' });
    }
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    return res.status(500).json({ error: '로그인 서버 설정을 확인해 주세요.' });
  }

  try {
    const input = typeof req.body === 'string'
      ? JSON.parse(req.body) : req.body;
    if (!input || Array.isArray(input) ||
        !['login', 'refresh', 'logout'].includes(input.action)) {
      return res.status(400).json({ error: '로그인 요청 형식을 확인해 주세요.' });
    }

    const auth = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      }
    }).auth;

    let result;
    if (input.action === 'login') {
      if (typeof input.email !== 'string' || input.email.length > 320 ||
          typeof input.password !== 'string' ||
          !input.password || input.password.length > 4096) {
        return res.status(400).json({ error: '이메일과 비밀번호를 확인해 주세요.' });
      }
      result = await auth.signInWithPassword({
        email: input.email.trim(), password: input.password
      });
    } else {
      if (typeof input.refresh_token !== 'string' ||
          !input.refresh_token || input.refresh_token.length > 8192) {
        return res.status(401).json({ error: '다시 로그인해 주세요.' });
      }

      if (input.action === 'logout') {
        if (typeof input.access_token !== 'string' ||
            !input.access_token || input.access_token.length > 8192) {
          return res.status(401).json({ error: '다시 로그인해 주세요.' });
        }
        const restored = await auth.setSession({
          access_token: input.access_token,
          refresh_token: input.refresh_token
        });
        if (restored.error) {
          return res.status(401).json({ error: '다시 로그인해 주세요.' });
        }
        const { error } = await auth.signOut({ scope: 'local' });
        if (error) {
          return res.status(503).json({ error: '로그아웃을 완료하지 못했습니다.' });
        }
        return res.status(200).json({ session: null });
      }

      result = await auth.refreshSession({
        refresh_token: input.refresh_token
      });
    }

    if (result.error || !result.data?.session) {
      return res.status(401).json({
        error: input.action === 'login'
          ? '로그인 실패: 이메일·비밀번호 또는 계정 인증 상태를 확인해 주세요.'
          : '로그인이 만료됐습니다. 다시 로그인해 주세요.'
      });
    }

    const session = result.data.session;
    return res.status(200).json({
      session: {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_at: session.expires_at,
        user: { id: session.user.id }
      }
    });
  } catch {
    return res.status(400).json({ error: '로그인 요청을 처리하지 못했습니다.' });
  }
}
