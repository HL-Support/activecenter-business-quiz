-- Migration: Lead Journey Profiles
-- Purpose: One compact profile/state row per quiz lead. Existing tracking_events stay the audit trail.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.lead_profiles (
    id BIGSERIAL PRIMARY KEY,
    profile_key VARCHAR(96) NOT NULL UNIQUE,
    session_hash VARCHAR(96),
    lead_hash VARCHAR(96),

    email_normalized VARCHAR(160),
    email_hash VARCHAR(96),
    first_name VARCHAR(120),
    lang VARCHAR(10) DEFAULT 'de',
    country VARCHAR(5),
    member_id VARCHAR(80),
    berater_slug VARCHAR(80),
    source_app VARCHAR(80) DEFAULT 'business_leads_quiz',
    funnel VARCHAR(80) DEFAULT 'business',

    success_code VARCHAR(40),
    success_code_label VARCHAR(100),
    main_aspiration VARCHAR(60),
    main_aspiration_label VARCHAR(120),
    initial_barrier VARCHAR(60),

    lifecycle_stage VARCHAR(40) NOT NULL DEFAULT 'profiled',
    next_step VARCHAR(60) NOT NULL DEFAULT 'watch_video_1',
    last_completed_video_step SMALLINT NOT NULL DEFAULT 0 CHECK (last_completed_video_step BETWEEN 0 AND 3),

    profiled_at TIMESTAMPTZ,
    video_1_watched_at TIMESTAMPTZ,
    video_2_watched_at TIMESTAMPTZ,
    video_3_watched_at TIMESTAMPTZ,
    interest_signaled_at TIMESTAMPTZ,
    product_info_sent_at TIMESTAMPTZ,
    info_call_booked_at TIMESTAMPTZ,
    info_call_done_at TIMESTAMPTZ,

    tags TEXT[] DEFAULT ARRAY[]::TEXT[],
    last_event_name VARCHAR(80),
    last_event_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_profiles_session_hash ON public.lead_profiles(session_hash);
CREATE INDEX IF NOT EXISTS idx_lead_profiles_lead_hash ON public.lead_profiles(lead_hash);
CREATE INDEX IF NOT EXISTS idx_lead_profiles_email_hash ON public.lead_profiles(email_hash);
CREATE INDEX IF NOT EXISTS idx_lead_profiles_member_id ON public.lead_profiles(member_id);
CREATE INDEX IF NOT EXISTS idx_lead_profiles_stage ON public.lead_profiles(lifecycle_stage);
CREATE INDEX IF NOT EXISTS idx_lead_profiles_next_step ON public.lead_profiles(next_step);
CREATE INDEX IF NOT EXISTS idx_lead_profiles_success_code ON public.lead_profiles(success_code);

ALTER TABLE public.lead_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow service role" ON public.lead_profiles;
CREATE POLICY "Allow service role" ON public.lead_profiles
    FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- Backfill existing quiz/tracking data into the new profile state.
-- This is idempotent and can be rerun after importing older events.
WITH video_summary AS (
    SELECT
        session_hash,
        MAX(video_step) FILTER (
            WHERE COALESCE(unique_watched_percent, 0) >= 95
               OR completed_at IS NOT NULL
        ) AS last_completed_video_step,
        MAX(completed_at) FILTER (WHERE video_step = 1) AS video_1_watched_at,
        MAX(completed_at) FILTER (WHERE video_step = 2) AS video_2_watched_at,
        MAX(completed_at) FILTER (WHERE video_step = 3) AS video_3_watched_at
    FROM public.tracking_video_progress
    GROUP BY session_hash
),
source_rows AS (
    SELECT
        COALESCE(ts.session_hash, ts.lead_hash) AS profile_key,
        ts.session_hash,
        ts.lead_hash,
        LOWER(NULLIF(ts.form_email, '')) AS email_normalized,
        ts.form_first_name AS first_name,
        ts.lang,
        ts.country,
        ts.member_id,
        ts.berater_slug,
        ts.source_app,
        ts.funnel,
        ts.quiz_profile,
        ts.quiz_profile_name,
        ts.main_aspiration,
        ts.main_aspiration_label,
        ts.quiz_barrier,
        ts.form_submitted_at AS profiled_at,
        ts.final_cta_type,
        ts.final_cta_clicked_at,
        COALESCE(v.last_completed_video_step, 0) AS last_completed_video_step,
        v.video_1_watched_at,
        v.video_2_watched_at,
        v.video_3_watched_at,
        ts.current_event AS last_event_name,
        ts.last_event_at,
        1 AS source_rank
    FROM public.tracking_sessions ts
    LEFT JOIN video_summary v ON v.session_hash = ts.session_hash
    WHERE COALESCE(ts.session_hash, ts.lead_hash) IS NOT NULL

    UNION ALL

    SELECT
        qs.hash AS profile_key,
        qs.hash AS session_hash,
        qs.hash AS lead_hash,
        LOWER(NULLIF(qs.form_email, '')) AS email_normalized,
        qs.form_first_name AS first_name,
        qs.lang,
        qs.country,
        qs.herbalife_id AS member_id,
        qs.berater_slug,
        'business_leads_quiz' AS source_app,
        'business' AS funnel,
        qs.quiz_profile,
        qs.quiz_profile_name,
        qs.quiz_aspiration AS main_aspiration,
        NULL AS main_aspiration_label,
        qs.quiz_barrier,
        qs.form_submitted_at AS profiled_at,
        qs.cta_type AS final_cta_type,
        qs.cta_clicked_at AS final_cta_clicked_at,
        GREATEST(
            CASE WHEN COALESCE(qs.video1_max_pct, 0) >= 95 THEN 1 ELSE 0 END,
            CASE WHEN COALESCE(qs.video2_max_pct, 0) >= 95 THEN 2 ELSE 0 END,
            CASE WHEN COALESCE(qs.video3_max_pct, 0) >= 95 THEN 3 ELSE 0 END
        ) AS last_completed_video_step,
        CASE WHEN COALESCE(qs.video1_max_pct, 0) >= 95 THEN qs.video1_last_update ELSE NULL END AS video_1_watched_at,
        CASE WHEN COALESCE(qs.video2_max_pct, 0) >= 95 THEN qs.video2_last_update ELSE NULL END AS video_2_watched_at,
        CASE WHEN COALESCE(qs.video3_max_pct, 0) >= 95 THEN qs.video3_last_update ELSE NULL END AS video_3_watched_at,
        NULL AS last_event_name,
        qs.updated_at AS last_event_at,
        2 AS source_rank
    FROM public.quiz_sessions qs
    WHERE qs.hash IS NOT NULL
),
deduped AS (
    SELECT DISTINCT ON (profile_key) *
    FROM source_rows
    WHERE profile_key IS NOT NULL
    ORDER BY profile_key, source_rank ASC, last_event_at DESC NULLS LAST
),
normalized AS (
    SELECT
        *,
        CASE
            WHEN LOWER(COALESCE(quiz_profile, '')) IN ('r', 'feuer', 'fire', 'typ a', 'tipo a', 'type a') THEN 'feuer'
            WHEN LOWER(COALESCE(quiz_profile, '')) IN ('y', 'wind', 'typ b', 'tipo b', 'type b') THEN 'wind'
            WHEN LOWER(COALESCE(quiz_profile, '')) IN ('g', 'wasser', 'water', 'typ c', 'tipo c', 'type c') THEN 'wasser'
            WHEN LOWER(COALESCE(quiz_profile, '')) IN ('b', 'fels', 'rock', 'typ d', 'tipo d', 'type d') THEN 'fels'
            ELSE NULL
        END AS success_code,
        CASE
            WHEN final_cta_type IN ('whatsapp', 'interest', 'interested') THEN 'interest_signaled'
            WHEN last_completed_video_step >= 3 THEN 'video_3_watched'
            WHEN last_completed_video_step = 2 THEN 'video_2_watched'
            WHEN last_completed_video_step = 1 THEN 'video_1_watched'
            ELSE 'profiled'
        END AS lifecycle_stage,
        CASE
            WHEN final_cta_type IN ('whatsapp', 'interest', 'interested') THEN 'personal_follow_up'
            WHEN last_completed_video_step >= 3 THEN 'signal_interest'
            WHEN last_completed_video_step = 2 THEN 'watch_video_3'
            WHEN last_completed_video_step = 1 THEN 'watch_video_2'
            ELSE 'watch_video_1'
        END AS next_step
    FROM deduped
)
INSERT INTO public.lead_profiles (
    profile_key,
    session_hash,
    lead_hash,
    email_normalized,
    email_hash,
    first_name,
    lang,
    country,
    member_id,
    berater_slug,
    source_app,
    funnel,
    success_code,
    success_code_label,
    main_aspiration,
    main_aspiration_label,
    initial_barrier,
    lifecycle_stage,
    next_step,
    last_completed_video_step,
    profiled_at,
    video_1_watched_at,
    video_2_watched_at,
    video_3_watched_at,
    interest_signaled_at,
    tags,
    last_event_name,
    last_event_at,
    created_at,
    updated_at
)
SELECT
    profile_key,
    session_hash,
    lead_hash,
    email_normalized,
    CASE WHEN email_normalized IS NOT NULL THEN encode(digest(email_normalized, 'sha256'), 'hex') ELSE NULL END,
    first_name,
    lang,
    country,
    member_id,
    berater_slug,
    source_app,
    funnel,
    success_code,
    quiz_profile_name,
    main_aspiration,
    main_aspiration_label,
    quiz_barrier,
    lifecycle_stage,
    next_step,
    COALESCE(last_completed_video_step, 0),
    profiled_at,
    video_1_watched_at,
    video_2_watched_at,
    video_3_watched_at,
    CASE WHEN final_cta_type IN ('whatsapp', 'interest', 'interested') THEN final_cta_clicked_at ELSE NULL END,
    ARRAY_REMOVE(ARRAY[
        CASE WHEN success_code IS NOT NULL THEN 'ac:profile:' || success_code ELSE NULL END,
        CASE WHEN main_aspiration IS NOT NULL THEN 'ac:goal:' || main_aspiration ELSE NULL END,
        CASE WHEN lang IS NOT NULL THEN 'ac:lang:' || lang ELSE NULL END,
        'ac:next:' || next_step
    ], NULL),
    last_event_name,
    last_event_at,
    NOW(),
    NOW()
FROM normalized
ON CONFLICT (profile_key) DO UPDATE SET
    session_hash = COALESCE(EXCLUDED.session_hash, lead_profiles.session_hash),
    lead_hash = COALESCE(EXCLUDED.lead_hash, lead_profiles.lead_hash),
    email_normalized = COALESCE(EXCLUDED.email_normalized, lead_profiles.email_normalized),
    email_hash = COALESCE(EXCLUDED.email_hash, lead_profiles.email_hash),
    first_name = COALESCE(EXCLUDED.first_name, lead_profiles.first_name),
    lang = COALESCE(EXCLUDED.lang, lead_profiles.lang),
    country = COALESCE(EXCLUDED.country, lead_profiles.country),
    member_id = COALESCE(EXCLUDED.member_id, lead_profiles.member_id),
    berater_slug = COALESCE(EXCLUDED.berater_slug, lead_profiles.berater_slug),
    success_code = COALESCE(EXCLUDED.success_code, lead_profiles.success_code),
    success_code_label = COALESCE(EXCLUDED.success_code_label, lead_profiles.success_code_label),
    main_aspiration = COALESCE(EXCLUDED.main_aspiration, lead_profiles.main_aspiration),
    main_aspiration_label = COALESCE(EXCLUDED.main_aspiration_label, lead_profiles.main_aspiration_label),
    initial_barrier = COALESCE(EXCLUDED.initial_barrier, lead_profiles.initial_barrier),
    lifecycle_stage = CASE
        WHEN lead_profiles.lifecycle_stage IN ('product_info_sent', 'info_call_booked', 'info_call_done', 'not_interested')
            THEN lead_profiles.lifecycle_stage
        WHEN CASE EXCLUDED.lifecycle_stage
                WHEN 'interest_signaled' THEN 5
                WHEN 'video_3_watched' THEN 4
                WHEN 'video_2_watched' THEN 3
                WHEN 'video_1_watched' THEN 2
                ELSE 1
             END >= CASE lead_profiles.lifecycle_stage
                WHEN 'interest_signaled' THEN 5
                WHEN 'video_3_watched' THEN 4
                WHEN 'video_2_watched' THEN 3
                WHEN 'video_1_watched' THEN 2
                ELSE 1
             END
            THEN EXCLUDED.lifecycle_stage
        ELSE lead_profiles.lifecycle_stage
    END,
    next_step = CASE
        WHEN lead_profiles.lifecycle_stage IN ('product_info_sent', 'info_call_booked', 'info_call_done', 'not_interested')
            THEN lead_profiles.next_step
        WHEN CASE EXCLUDED.lifecycle_stage
                WHEN 'interest_signaled' THEN 5
                WHEN 'video_3_watched' THEN 4
                WHEN 'video_2_watched' THEN 3
                WHEN 'video_1_watched' THEN 2
                ELSE 1
             END >= CASE lead_profiles.lifecycle_stage
                WHEN 'interest_signaled' THEN 5
                WHEN 'video_3_watched' THEN 4
                WHEN 'video_2_watched' THEN 3
                WHEN 'video_1_watched' THEN 2
                ELSE 1
             END
            THEN EXCLUDED.next_step
        ELSE lead_profiles.next_step
    END,
    last_completed_video_step = GREATEST(lead_profiles.last_completed_video_step, EXCLUDED.last_completed_video_step),
    profiled_at = COALESCE(lead_profiles.profiled_at, EXCLUDED.profiled_at),
    video_1_watched_at = COALESCE(lead_profiles.video_1_watched_at, EXCLUDED.video_1_watched_at),
    video_2_watched_at = COALESCE(lead_profiles.video_2_watched_at, EXCLUDED.video_2_watched_at),
    video_3_watched_at = COALESCE(lead_profiles.video_3_watched_at, EXCLUDED.video_3_watched_at),
    interest_signaled_at = COALESCE(lead_profiles.interest_signaled_at, EXCLUDED.interest_signaled_at),
    tags = EXCLUDED.tags,
    last_event_name = COALESCE(EXCLUDED.last_event_name, lead_profiles.last_event_name),
    last_event_at = COALESCE(EXCLUDED.last_event_at, lead_profiles.last_event_at),
    updated_at = NOW();
