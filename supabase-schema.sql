-- Create quiz_sessions table in Supabase
-- Copy & paste in https://app.supabase.com > SQL Editor > New Query

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

-- Shared tracking layer for Business Leads Quiz and future landingpage-business tracking.
-- session_hash tracks a browser/session across the funnel.
-- lead_hash is created only for a concrete lead submission and is mirrored into MySQL TypeformSurveys.hidden.hash.

CREATE TABLE IF NOT EXISTS public.tracking_sessions (
    id BIGSERIAL PRIMARY KEY,
    session_hash VARCHAR(96) NOT NULL UNIQUE,
    lead_hash VARCHAR(96),
    member_id VARCHAR(80),
    berater_slug VARCHAR(80),
    source_app VARCHAR(80),
    funnel VARCHAR(80),
    lang VARCHAR(10),
    country VARCHAR(5),
    device_type VARCHAR(30),
    page_key VARCHAR(80),

    first_seen_at TIMESTAMPTZ,
    last_event_at TIMESTAMPTZ,
    current_event VARCHAR(80),

    quiz_profile VARCHAR(40),
    quiz_profile_name VARCHAR(100),
    main_aspiration VARCHAR(60),
    main_aspiration_label VARCHAR(120),
    quiz_barrier VARCHAR(60),

    form_first_name VARCHAR(120),
    form_email VARCHAR(160),
    form_submitted_at TIMESTAMPTZ,

    final_cta_type VARCHAR(60),
    final_cta_clicked_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tracking_sessions_member_id ON public.tracking_sessions(member_id);
CREATE INDEX IF NOT EXISTS idx_tracking_sessions_lead_hash ON public.tracking_sessions(lead_hash);
CREATE INDEX IF NOT EXISTS idx_tracking_sessions_last_event ON public.tracking_sessions(last_event_at);
CREATE INDEX IF NOT EXISTS idx_tracking_sessions_source_funnel ON public.tracking_sessions(source_app, funnel);

CREATE TABLE IF NOT EXISTS public.tracking_events (
    id BIGSERIAL PRIMARY KEY,
    event_id VARCHAR(96) NOT NULL UNIQUE,
    session_hash VARCHAR(96) NOT NULL,
    lead_hash VARCHAR(96),
    member_id VARCHAR(80),
    berater_slug VARCHAR(80),
    source_app VARCHAR(80),
    funnel VARCHAR(80),
    page_key VARCHAR(80),
    lang VARCHAR(10),
    country VARCHAR(5),

    event_name VARCHAR(80) NOT NULL,
    event_at TIMESTAMPTZ NOT NULL,
    step_index INTEGER,
    question_index INTEGER,
    video_step INTEGER,
    video_id VARCHAR(120),
    progress_percent INTEGER,
    unique_watched_percent INTEGER,
    properties JSONB DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tracking_events_session_hash ON public.tracking_events(session_hash);
CREATE INDEX IF NOT EXISTS idx_tracking_events_member_id ON public.tracking_events(member_id);
CREATE INDEX IF NOT EXISTS idx_tracking_events_event_name ON public.tracking_events(event_name);
CREATE INDEX IF NOT EXISTS idx_tracking_events_event_at ON public.tracking_events(event_at);
CREATE INDEX IF NOT EXISTS idx_tracking_events_video ON public.tracking_events(video_step, video_id);

CREATE TABLE IF NOT EXISTS public.tracking_video_progress (
    id BIGSERIAL PRIMARY KEY,
    session_video_key VARCHAR(140) NOT NULL UNIQUE,
    session_hash VARCHAR(96) NOT NULL,
    lead_hash VARCHAR(96),
    member_id VARCHAR(80),
    berater_slug VARCHAR(80),
    source_app VARCHAR(80),
    funnel VARCHAR(80),
    lang VARCHAR(10),
    country VARCHAR(5),

    video_step INTEGER NOT NULL,
    video_id VARCHAR(120),
    duration_seconds INTEGER,
    unique_watched_seconds INTEGER,
    unique_watched_percent INTEGER,
    max_playhead_percent INTEGER,
    seek_count INTEGER,
    watched_ranges JSONB DEFAULT '[]'::jsonb,

    first_seen_at TIMESTAMPTZ,
    unlocked_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    last_update_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tracking_video_session_hash ON public.tracking_video_progress(session_hash);
CREATE INDEX IF NOT EXISTS idx_tracking_video_member_id ON public.tracking_video_progress(member_id);
CREATE INDEX IF NOT EXISTS idx_tracking_video_step ON public.tracking_video_progress(video_step);

-- Future dashboard access mapping.
-- Authentication stays in the existing MySQL/Laravel users table; this table only maps a verified login to Supabase scopes.
CREATE TABLE IF NOT EXISTS public.coach_access (
    id BIGSERIAL PRIMARY KEY,
    user_email VARCHAR(160),
    member_id VARCHAR(80),
    role VARCHAR(30) NOT NULL DEFAULT 'coach',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_email, member_id)
);

CREATE INDEX IF NOT EXISTS idx_coach_access_member_id ON public.coach_access(member_id);
CREATE INDEX IF NOT EXISTS idx_coach_access_role ON public.coach_access(role);

ALTER TABLE public.tracking_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracking_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracking_video_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow service role" ON public.tracking_sessions;
CREATE POLICY "Allow service role" ON public.tracking_sessions
    FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Allow service role" ON public.tracking_events;
CREATE POLICY "Allow service role" ON public.tracking_events
    FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Allow service role" ON public.tracking_video_progress;
CREATE POLICY "Allow service role" ON public.tracking_video_progress
    FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Allow service role" ON public.coach_access;
CREATE POLICY "Allow service role" ON public.coach_access
    FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
