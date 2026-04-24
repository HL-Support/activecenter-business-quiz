/**
 * Vercel Serverless Function: /api/init-quiz-db
 * Legacy helper that checks the old quiz_sessions table.
 * Canonical SQL for quiz_sessions plus the shared tracking_* tables is in /supabase-schema.sql.
 * Call once: curl https://quiz.activecenter.info/api/init-quiz-db
 */

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://xlpiisbozpgmemxhtivj.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

export default async function handler(req, res) {
  // Security: only allow from localhost or specific token
  const token = req.query.token || req.headers['x-init-token'];
  const secret = process.env.INIT_DB_TOKEN || 'quiz_init_secret_change_me';

  if (token !== secret && req.headers.host !== 'localhost:3000') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: 'Missing Supabase credentials' });
  }

  const SQL = `
CREATE TABLE IF NOT EXISTS public.quiz_sessions (
    id BIGSERIAL PRIMARY KEY,
    hash VARCHAR(64) NOT NULL UNIQUE,
    herbalife_id VARCHAR(50),
    berater_slug VARCHAR(50),

    visited_at TIMESTAMP,
    country VARCHAR(5),
    device_type VARCHAR(20),
    lang VARCHAR(10),

    quiz_profile VARCHAR(10),
    quiz_profile_name VARCHAR(50),
    quiz_aspiration VARCHAR(50),
    quiz_barrier VARCHAR(50),
    quiz_completed_at TIMESTAMP,

    form_first_name VARCHAR(100),
    form_email VARCHAR(100),
    form_submitted_at TIMESTAMP,

    video1_watched_sec INTEGER DEFAULT 0,
    video1_max_pct INTEGER DEFAULT 0,
    video1_last_update TIMESTAMP,

    video2_watched_sec INTEGER DEFAULT 0,
    video2_max_pct INTEGER DEFAULT 0,
    video2_last_update TIMESTAMP,

    video3_watched_sec INTEGER DEFAULT 0,
    video3_max_pct INTEGER DEFAULT 0,
    video3_last_update TIMESTAMP,

    cta_type VARCHAR(50),
    cta_clicked_at TIMESTAMP,

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quiz_sessions_herbalife_id ON public.quiz_sessions(herbalife_id);
CREATE INDEX IF NOT EXISTS idx_quiz_sessions_hash ON public.quiz_sessions(hash);
CREATE INDEX IF NOT EXISTS idx_quiz_sessions_created_at ON public.quiz_sessions(created_at);

ALTER TABLE public.quiz_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow service role" ON public.quiz_sessions;
CREATE POLICY "Allow service role" ON public.quiz_sessions
    FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
`;

  try {
    // Try to execute via direct POST (won't work, but we need to show the SQL)
    console.log('Creating table via Supabase...');
    console.log(SQL);

    // Check if table exists by trying to select from it
    const checkResponse = await fetch(`${SUPABASE_URL}/rest/v1/quiz_sessions?limit=1`, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
    });

    if (checkResponse.status === 404) {
      return res.status(200).json({
        status: 'table_not_found',
        message: 'Table does not exist. Execute SQL in Supabase Dashboard.',
        sql: SQL,
        instructions:
          '1. Go to https://app.supabase.com > SQL Editor\n2. Create new query\n3. Paste the SQL above\n4. Execute',
      });
    }

    if (checkResponse.ok || checkResponse.status === 200) {
      return res.status(200).json({
        status: 'ok',
        message: 'quiz_sessions table exists and is ready',
        table: 'quiz_sessions',
      });
    }

    return res.status(200).json({
      status: 'check_needed',
      message: 'Please verify table in Supabase Dashboard',
      sql: SQL,
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message,
      sql: SQL,
      instructions: 'Execute the SQL above in Supabase > SQL Editor',
    });
  }
}
