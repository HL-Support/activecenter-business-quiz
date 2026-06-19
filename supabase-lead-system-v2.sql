-- AC Lead System v2
-- Final schema, views, RLS, indexes, and RPCs for the one-lead-one-hash architecture.
-- Apply only after reviewing d:/tmp/LEAD_SYSTEM_MASTERPLAN.md.

BEGIN;

-- Required for gen_random_uuid().
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Core tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.lead_state (
  lead_hash             text PRIMARY KEY CHECK (lead_hash ~ '^qz_[a-zA-Z0-9_]+$'),
  client_seed           uuid UNIQUE,

  member_id             text,
  ref_id                text,
  ref_type              text CHECK (ref_type IN ('member','referral_code','campaign','unknown')) DEFAULT 'member',
  berater_slug          text,
  organisation_id       text,

  source_app            text,
  funnel_key            text,
  lang                  text,
  country               text,
  utm_source            text,
  utm_medium            text,
  utm_campaign          text,
  utm_content           text,
  utm_campaign_id       text,
  utm_adset_id          text,
  utm_ad_id             text,
  utm_term              text,
  fbclid                text,
  fbc                   text,
  fbp                   text,
  event_source_url      text,

  first_seen_at         timestamptz DEFAULT now(),
  last_seen_at          timestamptz DEFAULT now(),
  last_event_at         timestamptz,

  first_name            text,
  email                 text,
  email_normalized      text,
  email_hash            text,
  phone                 text,
  form_submitted_at     timestamptz,

  profile_code          text,
  profile_label         text,
  main_aspiration       text,
  main_aspiration_label text,
  initial_barrier       text,

  lifecycle_stage       text DEFAULT 'new',
  next_step             text,
  cta_type              text,
  cta_clicked_at        timestamptz,

  mysql_survey_id       int,
  mautic_contact_id     text,
  sync_status           text DEFAULT 'pending',

  tracking_missing      boolean DEFAULT false,
  migration_source      text,
  migration_flags       jsonb DEFAULT '{}'::jsonb,

  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

ALTER TABLE public.lead_state
  ALTER COLUMN organisation_id TYPE text USING organisation_id::text,
  ADD COLUMN IF NOT EXISTS utm_content text,
  ADD COLUMN IF NOT EXISTS utm_campaign_id text,
  ADD COLUMN IF NOT EXISTS utm_adset_id text,
  ADD COLUMN IF NOT EXISTS utm_ad_id text,
  ADD COLUMN IF NOT EXISTS utm_term text,
  ADD COLUMN IF NOT EXISTS fbclid text,
  ADD COLUMN IF NOT EXISTS fbc text,
  ADD COLUMN IF NOT EXISTS fbp text,
  ADD COLUMN IF NOT EXISTS event_source_url text;

CREATE TABLE IF NOT EXISTS public.lead_video_progress (
  lead_hash                   text REFERENCES public.lead_state(lead_hash) ON DELETE CASCADE,
  video_step                  int CHECK (video_step IN (1,2,3)),
  video_id                    text,
  duration_seconds            int DEFAULT 0 CHECK (duration_seconds >= 0),
  max_unique_watched_percent  numeric(5,2) DEFAULT 0 CHECK (max_unique_watched_percent >= 0 AND max_unique_watched_percent <= 100),
  max_playhead_percent        numeric(5,2) DEFAULT 0 CHECK (max_playhead_percent >= 0 AND max_playhead_percent <= 100),
  unique_watched_seconds      int DEFAULT 0 CHECK (unique_watched_seconds >= 0),
  seek_count                  int DEFAULT 0 CHECK (seek_count >= 0),
  watched_ranges              jsonb DEFAULT '[]'::jsonb,
  unlocked_at                 timestamptz,
  migration_flags             jsonb DEFAULT '{}'::jsonb,
  completed_at                timestamptz,
  first_seen_at               timestamptz DEFAULT now(),
  last_update_at              timestamptz DEFAULT now(),
  created_at                  timestamptz DEFAULT now(),
  updated_at                  timestamptz DEFAULT now(),
  PRIMARY KEY (lead_hash, video_step)
);

ALTER TABLE public.lead_video_progress
  ADD COLUMN IF NOT EXISTS duration_seconds int DEFAULT 0 CHECK (duration_seconds >= 0),
  ADD COLUMN IF NOT EXISTS seek_count int DEFAULT 0 CHECK (seek_count >= 0),
  ADD COLUMN IF NOT EXISTS watched_ranges jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS unlocked_at timestamptz,
  ADD COLUMN IF NOT EXISTS migration_flags jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE TABLE IF NOT EXISTS public.lead_answers_current (
  lead_hash       text REFERENCES public.lead_state(lead_hash) ON DELETE CASCADE,
  question_ref    text NOT NULL,
  question_index  int,
  question_text   text,
  answer_ref      text,
  answer_text     text,
  answer_value    text,
  profile_delta   jsonb DEFAULT '{}'::jsonb,
  lang            text,
  answered_at     timestamptz DEFAULT now(),
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  PRIMARY KEY (lead_hash, question_ref)
);

CREATE TABLE IF NOT EXISTS public.lead_events (
  event_id                    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_uid                   text UNIQUE,
  lead_hash                   text REFERENCES public.lead_state(lead_hash) ON DELETE CASCADE,
  event_name                  text NOT NULL,
  event_at                    timestamptz DEFAULT now(),

  member_id                   text,
  ref_id                      text,
  berater_slug                text,
  source_app                  text,
  funnel_key                  text,

  video_step                  int,
  question_ref                text,
  unique_watched_percent      numeric(5,2),
  playhead_percent            numeric(5,2),

  payload                     jsonb DEFAULT '{}'::jsonb,
  created_at                  timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.lead_migration_unresolved (
  id                           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_table                 text NOT NULL,
  source_id                    text NOT NULL,
  reason                       text NOT NULL,
  session_hash                 text,
  lead_hash_candidate          text,
  payload                      jsonb DEFAULT '{}'::jsonb,
  resolved_at                  timestamptz,
  resolved_lead_hash           text REFERENCES public.lead_state(lead_hash) ON DELETE SET NULL,
  created_at                   timestamptz DEFAULT now(),
  updated_at                   timestamptz DEFAULT now(),
  UNIQUE (source_table, source_id)
);

CREATE TABLE IF NOT EXISTS public.lead_sync_outbox (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  lead_hash       text REFERENCES public.lead_state(lead_hash) ON DELETE CASCADE,
  sync_type       text NOT NULL,
  context_data    jsonb DEFAULT '{}'::jsonb,

  status          text DEFAULT 'pending'
                  CHECK (status IN ('pending','processing','done','failed','dead')),
  attempts        int DEFAULT 0 CHECK (attempts >= 0),
  max_attempts    int DEFAULT 5 CHECK (max_attempts > 0),
  last_error      text,
  response_data   jsonb DEFAULT '{}'::jsonb,
  next_attempt_at timestamptz DEFAULT now(),

  locked_at       timestamptz,
  locked_by       text,
  processed_at    timestamptz,
  dead_at         timestamptz,

  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

ALTER TABLE public.lead_sync_outbox
  ADD COLUMN IF NOT EXISTS response_data jsonb DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS public.app_config (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL,
  updated_at  timestamptz DEFAULT now(),
  updated_by  text
);

CREATE TABLE IF NOT EXISTS public.lead_access_permissions (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     uuid REFERENCES auth.users(id),
  member_id   text,
  ref_id      text,
  role        text CHECK (role IN ('admin','coach','referral')),
  created_at  timestamptz DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_ls_member_created ON public.lead_state(member_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ls_ref_created ON public.lead_state(ref_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ls_organisation_created ON public.lead_state(organisation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ls_utm_ad_id_created ON public.lead_state(utm_ad_id, form_submitted_at DESC) WHERE utm_ad_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ls_utm_content_created ON public.lead_state(utm_content, form_submitted_at DESC) WHERE utm_content IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ls_email_hash ON public.lead_state(email_hash);
CREATE INDEX IF NOT EXISTS idx_ls_email_norm ON public.lead_state(email_normalized);
CREATE INDEX IF NOT EXISTS idx_ls_last_event ON public.lead_state(last_event_at DESC);
CREATE INDEX IF NOT EXISTS idx_ls_lifecycle_created ON public.lead_state(lifecycle_stage, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_lvp_lead_step ON public.lead_video_progress(lead_hash, video_step);
CREATE INDEX IF NOT EXISTS idx_lvp_step_pct ON public.lead_video_progress(video_step, max_unique_watched_percent);

CREATE INDEX IF NOT EXISTS idx_le_lead_time ON public.lead_events(lead_hash, event_at DESC);
CREATE INDEX IF NOT EXISTS idx_le_member_time ON public.lead_events(member_id, event_at DESC);
CREATE INDEX IF NOT EXISTS idx_le_ref_time ON public.lead_events(ref_id, event_at DESC);
CREATE INDEX IF NOT EXISTS idx_le_name_time ON public.lead_events(event_name, event_at DESC);
CREATE INDEX IF NOT EXISTS idx_le_video_time ON public.lead_events(video_step, event_at DESC);
CREATE INDEX IF NOT EXISTS idx_le_question_time ON public.lead_events(question_ref, event_at DESC);
CREATE INDEX IF NOT EXISTS idx_lmu_reason ON public.lead_migration_unresolved(reason, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lmu_session ON public.lead_migration_unresolved(session_hash);

CREATE INDEX IF NOT EXISTS idx_outbox_pending ON public.lead_sync_outbox(status, next_attempt_at)
  WHERE status IN ('pending','failed');
CREATE INDEX IF NOT EXISTS idx_outbox_locked ON public.lead_sync_outbox(status, locked_at)
  WHERE status = 'processing';

-- ---------------------------------------------------------------------------
-- Updated_at triggers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lead_state_updated_at ON public.lead_state;
CREATE TRIGGER trg_lead_state_updated_at
  BEFORE UPDATE ON public.lead_state
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_lead_answers_current_updated_at ON public.lead_answers_current;
CREATE TRIGGER trg_lead_answers_current_updated_at
  BEFORE UPDATE ON public.lead_answers_current
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_lead_sync_outbox_updated_at ON public.lead_sync_outbox;
CREATE TRIGGER trg_lead_sync_outbox_updated_at
  BEFORE UPDATE ON public.lead_sync_outbox
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_lead_video_progress_updated_at ON public.lead_video_progress;
CREATE TRIGGER trg_lead_video_progress_updated_at
  BEFORE UPDATE ON public.lead_video_progress
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_lead_migration_unresolved_updated_at ON public.lead_migration_unresolved;
CREATE TRIGGER trg_lead_migration_unresolved_updated_at
  BEFORE UPDATE ON public.lead_migration_unresolved
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Views. security_invoker keeps RLS behavior for exposed public views.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.v_lead_state_full
WITH (security_invoker = true) AS
SELECT
  ls.*,
  COALESCE(v1.max_unique_watched_percent, 0) AS video1_max_pct,
  COALESCE(v1.unique_watched_seconds, 0) AS video1_watched_sec,
  v1.completed_at AS video1_completed_at,
  COALESCE(v2.max_unique_watched_percent, 0) AS video2_max_pct,
  COALESCE(v2.unique_watched_seconds, 0) AS video2_watched_sec,
  v2.completed_at AS video2_completed_at,
  COALESCE(v3.max_unique_watched_percent, 0) AS video3_max_pct,
  COALESCE(v3.unique_watched_seconds, 0) AS video3_watched_sec,
  v3.completed_at AS video3_completed_at,
  CASE
    WHEN COALESCE(v3.max_unique_watched_percent, 0) >= 95 THEN 3
    WHEN COALESCE(v2.max_unique_watched_percent, 0) >= 95 THEN 2
    WHEN COALESCE(v1.max_unique_watched_percent, 0) >= 95 THEN 1
    ELSE 0
  END AS completed_rank
FROM public.lead_state ls
LEFT JOIN public.lead_video_progress v1 ON v1.lead_hash = ls.lead_hash AND v1.video_step = 1
LEFT JOIN public.lead_video_progress v2 ON v2.lead_hash = ls.lead_hash AND v2.video_step = 2
LEFT JOIN public.lead_video_progress v3 ON v3.lead_hash = ls.lead_hash AND v3.video_step = 3;

CREATE OR REPLACE VIEW public.v_sync_dead_jobs
WITH (security_invoker = true) AS
SELECT *
FROM public.lead_sync_outbox
WHERE status = 'dead'
ORDER BY dead_at DESC;

-- ---------------------------------------------------------------------------
-- RPCs. Kept as SECURITY INVOKER and executable only by service_role.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.init_lead(
  p_client_seed uuid,
  p_lead_hash text DEFAULT NULL,
  p_member_id text DEFAULT NULL,
  p_organisation_id text DEFAULT NULL,
  p_ref_id text DEFAULT NULL,
  p_ref_type text DEFAULT NULL,
  p_berater_slug text DEFAULT NULL,
  p_source_app text DEFAULT 'business_leads_quiz',
  p_funnel_key text DEFAULT 'business',
  p_lang text DEFAULT NULL,
  p_country text DEFAULT NULL,
  p_utm_source text DEFAULT NULL,
  p_utm_medium text DEFAULT NULL,
  p_utm_campaign text DEFAULT NULL,
  p_utm_content text DEFAULT NULL,
  p_fbclid text DEFAULT NULL,
  p_fbc text DEFAULT NULL,
  p_fbp text DEFAULT NULL,
  p_event_source_url text DEFAULT NULL,
  p_utm_campaign_id text DEFAULT NULL,
  p_utm_adset_id text DEFAULT NULL,
  p_utm_ad_id text DEFAULT NULL,
  p_utm_term text DEFAULT NULL
)
RETURNS TABLE (lead_hash text)
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ref_id text;
  v_ref_type text;
  v_lead_hash text;
BEGIN
  IF p_client_seed IS NULL THEN
    RAISE EXCEPTION 'client_seed_required';
  END IF;

  v_lead_hash := COALESCE(NULLIF(p_lead_hash, ''), 'qz_' || replace(gen_random_uuid()::text, '-', ''));
  v_ref_id := COALESCE(NULLIF(p_ref_id, ''), NULLIF(p_member_id, ''));
  v_ref_type := COALESCE(NULLIF(p_ref_type, ''), CASE WHEN v_ref_id IS NOT NULL AND v_ref_id <> p_member_id THEN 'referral_code' ELSE 'member' END);

  RETURN QUERY
  INSERT INTO public.lead_state (
    client_seed,
    lead_hash,
    member_id,
    organisation_id,
    ref_id,
    ref_type,
    berater_slug,
    source_app,
    funnel_key,
    lang,
    country,
    utm_source,
    utm_medium,
    utm_campaign,
    utm_content,
    utm_campaign_id,
    utm_adset_id,
    utm_ad_id,
    utm_term,
    fbclid,
    fbc,
    fbp,
    event_source_url,
    first_seen_at,
    last_seen_at
  )
  VALUES (
    p_client_seed,
    v_lead_hash,
    NULLIF(p_member_id, ''),
    NULLIF(p_organisation_id, ''),
    v_ref_id,
    v_ref_type,
    NULLIF(p_berater_slug, ''),
    COALESCE(NULLIF(p_source_app, ''), 'business_leads_quiz'),
    COALESCE(NULLIF(p_funnel_key, ''), 'business'),
    NULLIF(p_lang, ''),
    NULLIF(p_country, ''),
    NULLIF(p_utm_source, ''),
    NULLIF(p_utm_medium, ''),
    NULLIF(p_utm_campaign, ''),
    NULLIF(p_utm_content, ''),
    NULLIF(p_utm_campaign_id, ''),
    NULLIF(p_utm_adset_id, ''),
    NULLIF(p_utm_ad_id, ''),
    NULLIF(p_utm_term, ''),
    NULLIF(p_fbclid, ''),
    NULLIF(p_fbc, ''),
    NULLIF(p_fbp, ''),
    NULLIF(p_event_source_url, ''),
    now(),
    now()
  )
  ON CONFLICT (client_seed) DO UPDATE SET
    last_seen_at = now(),
    member_id = COALESCE(public.lead_state.member_id, EXCLUDED.member_id),
    organisation_id = COALESCE(public.lead_state.organisation_id, EXCLUDED.organisation_id),
    ref_id = COALESCE(public.lead_state.ref_id, EXCLUDED.ref_id),
    ref_type = COALESCE(public.lead_state.ref_type, EXCLUDED.ref_type),
    berater_slug = COALESCE(public.lead_state.berater_slug, EXCLUDED.berater_slug),
    source_app = COALESCE(public.lead_state.source_app, EXCLUDED.source_app),
    funnel_key = COALESCE(public.lead_state.funnel_key, EXCLUDED.funnel_key),
    lang = COALESCE(public.lead_state.lang, EXCLUDED.lang),
    country = COALESCE(public.lead_state.country, EXCLUDED.country),
    utm_source = COALESCE(public.lead_state.utm_source, EXCLUDED.utm_source),
    utm_medium = COALESCE(public.lead_state.utm_medium, EXCLUDED.utm_medium),
    utm_campaign = COALESCE(public.lead_state.utm_campaign, EXCLUDED.utm_campaign),
    utm_content = COALESCE(public.lead_state.utm_content, EXCLUDED.utm_content),
    utm_campaign_id = COALESCE(public.lead_state.utm_campaign_id, EXCLUDED.utm_campaign_id),
    utm_adset_id = COALESCE(public.lead_state.utm_adset_id, EXCLUDED.utm_adset_id),
    utm_ad_id = COALESCE(public.lead_state.utm_ad_id, EXCLUDED.utm_ad_id),
    utm_term = COALESCE(public.lead_state.utm_term, EXCLUDED.utm_term),
    fbclid = COALESCE(public.lead_state.fbclid, EXCLUDED.fbclid),
    fbc = COALESCE(public.lead_state.fbc, EXCLUDED.fbc),
    fbp = COALESCE(public.lead_state.fbp, EXCLUDED.fbp),
    event_source_url = COALESCE(public.lead_state.event_source_url, EXCLUDED.event_source_url),
    updated_at = now()
  RETURNING public.lead_state.lead_hash;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_answer_current(
  p_lead_hash text,
  p_question_ref text,
  p_question_index int DEFAULT NULL,
  p_question_text text DEFAULT NULL,
  p_answer_ref text DEFAULT NULL,
  p_answer_text text DEFAULT NULL,
  p_answer_value text DEFAULT NULL,
  p_profile_delta jsonb DEFAULT '{}'::jsonb,
  p_lang text DEFAULT NULL,
  p_answered_at timestamptz DEFAULT now()
)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_lead_hash IS NULL OR p_question_ref IS NULL THEN
    RAISE EXCEPTION 'lead_hash_and_question_ref_required';
  END IF;

  INSERT INTO public.lead_answers_current (
    lead_hash,
    question_ref,
    question_index,
    question_text,
    answer_ref,
    answer_text,
    answer_value,
    profile_delta,
    lang,
    answered_at
  )
  VALUES (
    p_lead_hash,
    p_question_ref,
    p_question_index,
    p_question_text,
    p_answer_ref,
    p_answer_text,
    p_answer_value,
    COALESCE(p_profile_delta, '{}'::jsonb),
    p_lang,
    COALESCE(p_answered_at, now())
  )
  ON CONFLICT (lead_hash, question_ref) DO UPDATE SET
    question_index = EXCLUDED.question_index,
    question_text = EXCLUDED.question_text,
    answer_ref = EXCLUDED.answer_ref,
    answer_text = EXCLUDED.answer_text,
    answer_value = EXCLUDED.answer_value,
    profile_delta = EXCLUDED.profile_delta,
    lang = EXCLUDED.lang,
    answered_at = EXCLUDED.answered_at,
    updated_at = now()
  WHERE EXCLUDED.answered_at >= public.lead_answers_current.answered_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.enqueue_lead_sync(
  p_lead_hash text,
  p_sync_type text,
  p_context_data jsonb DEFAULT '{}'::jsonb
)
RETURNS bigint
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id bigint;
BEGIN
  IF p_sync_type = 'coach_hot_lead_email' THEN
    PERFORM pg_advisory_xact_lock(hashtext('coach_hot_lead_email:' || COALESCE(p_lead_hash, '')));

    SELECT id INTO v_id
    FROM public.lead_sync_outbox
    WHERE lead_hash = p_lead_hash
      AND sync_type = p_sync_type
    ORDER BY created_at ASC
    LIMIT 1;

    IF v_id IS NOT NULL THEN
      RETURN v_id;
    END IF;
  END IF;

  INSERT INTO public.lead_sync_outbox (lead_hash, sync_type, context_data)
  VALUES (p_lead_hash, p_sync_type, COALESCE(p_context_data, '{}'::jsonb))
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_video_progress_monotonic(
  p_lead_hash text,
  p_video_step int,
  p_video_id text DEFAULT NULL,
  p_unique_watched_percent numeric DEFAULT 0,
  p_playhead_percent numeric DEFAULT 0,
  p_unique_watched_seconds int DEFAULT 0,
  p_event_at timestamptz DEFAULT now(),
  p_lang text DEFAULT NULL
)
RETURNS TABLE (completed_rank int, rank_changed boolean)
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_before_rank int;
  v_after_rank int;
  v_completed_before boolean;
  v_pct numeric;
BEGIN
  IF p_lead_hash IS NULL OR p_video_step NOT IN (1,2,3) THEN
    RAISE EXCEPTION 'valid_lead_hash_and_video_step_required';
  END IF;

  SELECT v.completed_rank INTO v_before_rank
  FROM public.v_lead_state_full v
  WHERE v.lead_hash = p_lead_hash;
  v_before_rank := COALESCE(v_before_rank, 0);

  SELECT completed_at IS NOT NULL INTO v_completed_before
  FROM public.lead_video_progress
  WHERE lead_hash = p_lead_hash AND video_step = p_video_step;
  v_completed_before := COALESCE(v_completed_before, false);

  v_pct := LEAST(100, GREATEST(0, COALESCE(p_unique_watched_percent, 0)));

  INSERT INTO public.lead_video_progress (
    lead_hash,
    video_step,
    video_id,
    duration_seconds,
    max_unique_watched_percent,
    max_playhead_percent,
    unique_watched_seconds,
    completed_at,
    first_seen_at,
    last_update_at
  )
  VALUES (
    p_lead_hash,
    p_video_step,
    NULLIF(p_video_id, ''),
    0,
    v_pct,
    LEAST(100, GREATEST(0, COALESCE(p_playhead_percent, 0))),
    GREATEST(0, COALESCE(p_unique_watched_seconds, 0)),
    CASE WHEN v_pct >= 95 THEN COALESCE(p_event_at, now()) END,
    COALESCE(p_event_at, now()),
    COALESCE(p_event_at, now())
  )
  ON CONFLICT (lead_hash, video_step) DO UPDATE SET
    video_id = COALESCE(public.lead_video_progress.video_id, EXCLUDED.video_id),
    duration_seconds = GREATEST(
      public.lead_video_progress.duration_seconds,
      EXCLUDED.duration_seconds
    ),
    max_unique_watched_percent = GREATEST(
      public.lead_video_progress.max_unique_watched_percent,
      EXCLUDED.max_unique_watched_percent
    ),
    max_playhead_percent = GREATEST(
      public.lead_video_progress.max_playhead_percent,
      EXCLUDED.max_playhead_percent
    ),
    unique_watched_seconds = GREATEST(
      public.lead_video_progress.unique_watched_seconds,
      EXCLUDED.unique_watched_seconds
    ),
    seek_count = GREATEST(
      public.lead_video_progress.seek_count,
      EXCLUDED.seek_count
    ),
    completed_at = COALESCE(
      public.lead_video_progress.completed_at,
      CASE
        WHEN GREATEST(
          public.lead_video_progress.max_unique_watched_percent,
          EXCLUDED.max_unique_watched_percent
        ) >= 95 THEN COALESCE(p_event_at, now())
      END
    ),
    last_update_at = COALESCE(p_event_at, now());

  UPDATE public.lead_state
  SET last_event_at = GREATEST(COALESCE(last_event_at, COALESCE(p_event_at, now())), COALESCE(p_event_at, now()))
  WHERE lead_hash = p_lead_hash;

  SELECT v.completed_rank INTO v_after_rank
  FROM public.v_lead_state_full v
  WHERE v.lead_hash = p_lead_hash;
  v_after_rank := COALESCE(v_after_rank, 0);

  IF v_after_rank > v_before_rank AND v_after_rank > 0 THEN
    PERFORM public.enqueue_lead_sync(
      p_lead_hash,
      'mysql_rank_update',
      jsonb_build_object('rank', v_after_rank, 'lang', p_lang, 'reason', 'video_progress')
    );
  END IF;

  RETURN QUERY SELECT v_after_rank, v_after_rank > v_before_rank;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_outbox_jobs(worker_id text, batch_size int DEFAULT 10)
RETURNS SETOF public.lead_sync_outbox
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.lead_sync_outbox
  SET
    status = 'failed',
    last_error = COALESCE(last_error, 'stale_lock_timeout'),
    next_attempt_at = now() + interval '5 minutes',
    locked_at = NULL,
    locked_by = NULL,
    updated_at = now()
  WHERE status = 'processing'
    AND locked_at < now() - interval '10 minutes';

  RETURN QUERY
  UPDATE public.lead_sync_outbox
  SET
    status = 'processing',
    locked_at = now(),
    locked_by = worker_id,
    attempts = attempts + 1,
    updated_at = now()
  WHERE id IN (
    SELECT id
    FROM public.lead_sync_outbox
    WHERE status IN ('pending','failed')
      AND next_attempt_at <= now()
      AND attempts < max_attempts
    ORDER BY created_at
    LIMIT batch_size
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_outbox_done(
  p_job_id bigint,
  p_worker_id text,
  p_response_data jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.lead_sync_outbox
  SET
    status = 'done',
    response_data = COALESCE(p_response_data, '{}'::jsonb),
    processed_at = now(),
    locked_at = NULL,
    locked_by = NULL,
    last_error = NULL,
    next_attempt_at = NULL,
    updated_at = now()
  WHERE id = p_job_id
    AND status = 'processing'
    AND (p_worker_id IS NULL OR locked_by = p_worker_id);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'outbox_job_not_locked_by_worker';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_outbox_failed(
  p_job_id bigint,
  p_worker_id text,
  p_error text,
  p_response_data jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.lead_sync_outbox
  SET
    status = CASE WHEN attempts >= max_attempts THEN 'dead' ELSE 'failed' END,
    last_error = left(COALESCE(p_error, 'unknown_outbox_error'), 2000),
    response_data = COALESCE(p_response_data, '{}'::jsonb),
    next_attempt_at = CASE
      WHEN attempts >= max_attempts THEN NULL
      WHEN attempts <= 1 THEN now() + interval '2 minutes'
      WHEN attempts = 2 THEN now() + interval '5 minutes'
      WHEN attempts = 3 THEN now() + interval '15 minutes'
      ELSE now() + interval '60 minutes'
    END,
    dead_at = CASE WHEN attempts >= max_attempts THEN now() ELSE dead_at END,
    locked_at = NULL,
    locked_by = NULL,
    updated_at = now()
  WHERE id = p_job_id
    AND status = 'processing'
    AND (p_worker_id IS NULL OR locked_by = p_worker_id);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'outbox_job_not_locked_by_worker';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- RLS and grants
-- ---------------------------------------------------------------------------

ALTER TABLE public.lead_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_video_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_answers_current ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_migration_unresolved ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_sync_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_access_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lead_state_admin_select ON public.lead_state;
DROP POLICY IF EXISTS lead_state_coach_select ON public.lead_state;
DROP POLICY IF EXISTS lead_state_select ON public.lead_state;
CREATE POLICY lead_state_select ON public.lead_state
  FOR SELECT TO authenticated
  USING (
    ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin'
    OR member_id = ((select auth.jwt()) -> 'app_metadata' ->> 'member_id')
  );

DROP POLICY IF EXISTS lvp_admin_select ON public.lead_video_progress;
DROP POLICY IF EXISTS lvp_coach_select ON public.lead_video_progress;
DROP POLICY IF EXISTS lvp_select ON public.lead_video_progress;
CREATE POLICY lvp_select ON public.lead_video_progress
  FOR SELECT TO authenticated
  USING (
    ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin'
    OR
    EXISTS (
      SELECT 1
      FROM public.lead_state ls
      WHERE ls.lead_hash = lead_video_progress.lead_hash
        AND ls.member_id = ((select auth.jwt()) -> 'app_metadata' ->> 'member_id')
    )
  );

DROP POLICY IF EXISTS lac_admin_select ON public.lead_answers_current;
DROP POLICY IF EXISTS lac_coach_select ON public.lead_answers_current;
DROP POLICY IF EXISTS lac_select ON public.lead_answers_current;
CREATE POLICY lac_select ON public.lead_answers_current
  FOR SELECT TO authenticated
  USING (
    ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin'
    OR
    EXISTS (
      SELECT 1
      FROM public.lead_state ls
      WHERE ls.lead_hash = lead_answers_current.lead_hash
        AND ls.member_id = ((select auth.jwt()) -> 'app_metadata' ->> 'member_id')
    )
  );

DROP POLICY IF EXISTS le_admin_select ON public.lead_events;
DROP POLICY IF EXISTS le_coach_select ON public.lead_events;
DROP POLICY IF EXISTS le_select ON public.lead_events;
CREATE POLICY le_select ON public.lead_events
  FOR SELECT TO authenticated
  USING (
    ((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin'
    OR member_id = ((select auth.jwt()) -> 'app_metadata' ->> 'member_id')
  );

DROP POLICY IF EXISTS lmu_admin_select ON public.lead_migration_unresolved;
CREATE POLICY lmu_admin_select ON public.lead_migration_unresolved
  FOR SELECT TO authenticated
  USING (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

DROP POLICY IF EXISTS outbox_admin_select ON public.lead_sync_outbox;
CREATE POLICY outbox_admin_select ON public.lead_sync_outbox
  FOR SELECT TO authenticated
  USING (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

DROP POLICY IF EXISTS app_config_admin_select ON public.app_config;
CREATE POLICY app_config_admin_select ON public.app_config
  FOR SELECT TO authenticated
  USING (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

DROP POLICY IF EXISTS lap_admin_select ON public.lead_access_permissions;
CREATE POLICY lap_admin_select ON public.lead_access_permissions
  FOR SELECT TO authenticated
  USING (((select auth.jwt()) -> 'app_metadata' ->> 'role') = 'admin');

REVOKE ALL ON FUNCTION public.init_lead(uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_answer_current(text,text,int,text,text,text,text,jsonb,text,timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enqueue_lead_sync(text,text,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_video_progress_monotonic(text,int,text,numeric,numeric,int,timestamptz,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_outbox_jobs(text,int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_outbox_done(bigint,text,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_outbox_failed(bigint,text,text,jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.init_lead(uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.upsert_answer_current(text,text,int,text,text,text,text,jsonb,text,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_lead_sync(text,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.upsert_video_progress_monotonic(text,int,text,numeric,numeric,int,timestamptz,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_outbox_jobs(text,int) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_outbox_done(bigint,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_outbox_failed(bigint,text,text,jsonb) TO service_role;

INSERT INTO public.app_config (key, value)
VALUES
  ('new_lead_writer_enabled', 'true'::jsonb),
  ('new_lead_writer_percent', '100'::jsonb),
  ('legacy_writer_enabled', 'false'::jsonb),
  ('outbox_worker_enabled', 'true'::jsonb)
ON CONFLICT (key) DO NOTHING;

COMMIT;
