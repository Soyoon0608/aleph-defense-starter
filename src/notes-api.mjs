import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createLoginVerifier } from './verify-login.mjs';
import config from '../aleph.config.json' with { type: 'json' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
let verifier;

export function scopeOwnedNote(query, id, ownerId) {
  return query.eq('id', id).eq('owner_id', ownerId);
}

function ownerIdForLogin(login) {
  if (login?.kind === 'judge') {
    return ['a', 'b'].includes(login.identity) ? login.identity : null;
  }
  if (login?.kind === 'student' && typeof login.userId === 'string' && login.userId) {
    return login.userId;
  }
  return null;
}

export async function handleNotes(req, res, single = false, dependencies = {}) {
  res.setHeader('Cache-Control', 'no-store');
  const injectedDependencies = typeof dependencies.verifyLogin === 'function'
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
      login = await dependencies.verifyLogin(req.headers.authorization);
    } else {
      verifier ??= createLoginVerifier({ config, supabaseSecretKey: key });
      login = await verifier(req.headers.authorization);
    }
    if (!login) return res.status(401).json({ error: '로그인이 필요합니다.' });
    const ownerId = ownerIdForLogin(login);
    if (!ownerId) return res.status(403).json({ error: '자료 접근 권한이 없습니다.' });

    const allowed = single ? ['GET', 'PUT', 'DELETE'] : ['GET', 'POST'];
    if (!allowed.includes(req.method)) {
      res.setHeader('Allow', allowed.join(', '));
      return res.status(405).json({ error: '허용되지 않은 요청입니다.' });
    }

    const id = single ? req.query.id : undefined;
    if (single && (typeof id !== 'string' || !UUID.test(id))) {
      return res.status(400).json({ error: '메모 ID 형식을 확인해 주세요.' });
    }

    let input;
    if (req.method === 'POST' || req.method === 'PUT') {
      try {
        input = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      } catch {
        return res.status(400).json({ error: 'JSON 형식을 확인해 주세요.' });
      }
      if (!input || Array.isArray(input) ||
          Object.keys(input).some(key =>
            !(req.method === 'POST' ? ['id', 'title', 'body'] : ['title', 'body']).includes(key)) ||
          typeof input.title !== 'string' || !input.title.trim() ||
          input.title.length > 200 ||
          typeof input.body !== 'string' || !input.body.trim() ||
          input.body.length > 5000 ||
          (req.method === 'POST' && input.id !== undefined &&
           (typeof input.id !== 'string' || !UUID.test(input.id)))) {
        return res.status(400).json({ error: '제목·본문·ID 형식을 확인해 주세요.' });
      }
    }

    const client = injectedDependencies ? dependencies.createClient : createClient;
    const db = client(url, key, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    if (!single && req.method === 'GET') {
      const { data, error } = await db.from('byteback_notes')
        .select('id, title, content')
        .eq('owner_id', ownerId).order('id');
      if (error) throw error;
      return res.status(200).json(data.map(note => ({
        id: note.id, title: note.title, body: note.content
      })));
    }

    if (!single && req.method === 'POST') {
      const newId = input.id ?? randomUUID();
      const { error } = await db.from('byteback_notes').insert({
        id: newId, owner_id: ownerId,
        title: input.title.trim(), content: input.body,
        sample_marker: config.sampleMarker
      });
      if (error?.code === '23505') {
        return res.status(409).json({ error: '이미 사용 중인 메모 ID입니다.' });
      }
      if (error) throw error;
      return res.status(201).json({ id: newId });
    }

    // 4단계: 검증된 사용자 ID와 소유자가 일치하는 행만 처리합니다.
    if (req.method === 'GET') {
      const { data, error } = await scopeOwnedNote(db.from('byteback_notes')
        .select('id, title, content, owner_id'), id, ownerId).maybeSingle();
      if (error) throw error;
      if (!data || data.owner_id !== ownerId) {
        return res.status(404).json({ error: '메모가 없습니다.' });
      }
      return res.status(200).json({
        id: data.id, title: data.title, body: data.content
      });
    }

    if (req.method === 'PUT') {
      const { data, error } = await scopeOwnedNote(db.from('byteback_notes')
        .update({ title: input.title.trim(), content: input.body }), id, ownerId)
        .select('id').maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ error: '메모가 없습니다.' });
      return res.status(200).json({ id: data.id });
    }

    const { data, error } = await scopeOwnedNote(db.from('byteback_notes').delete(),
      id, ownerId).select('id').maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: '메모가 없습니다.' });
    return res.status(200).json({ id: data.id });
  } catch {
    return res.status(503).json({ error: '자료 요청을 처리하지 못했습니다.' });
  }
}
