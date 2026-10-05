import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: '허용되지 않은 요청입니다.' });
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    return res.status(500).json({ error: '자료 서버 설정을 확인해 주세요.' });
  }

  try {
    const db = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data, error } = await db
      .from('byteback_notes')
      .select('title, content, sample_marker')
      .order('id', { ascending: true });

    if (error || !Array.isArray(data) || data.length !== 4 ||
        data.some(note => note.sample_marker !== 'SAMPLE_NOTE_1')) {
      return res.status(502).json({ error: '가상 자료를 불러올 수 없습니다.' });
    }

    return res.status(200).json({
      sampleMarker: 'SAMPLE_NOTE_1',
      notes: data.map(({ title, content }) => ({ title, content }))
    });
  } catch {
    return res.status(502).json({ error: '가상 자료를 불러올 수 없습니다.' });
  }
}
