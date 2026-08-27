-- Phase-5-Testimport: selektiver Schema-Export des Business-Leads-Verbunds
-- Erzeugt 2026-08-27T12:18:59.587Z aus dem Live-Katalog (scripts/phase5-schema-export.js)
-- Auswahlgrundlage: docs/audits/cutover-vorbereitung/phase5-objektauswahl-2026-08-27.md
-- Ohne RLS/Grants/pg_cron (eigenes Rollenmodell bzw. eigener Schritt auf dem Ziel).

\set ON_ERROR_STOP on
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS analytics_internal;

-- Sequenzen (nur die der Auswahl-Tabellen; Zaehlerstaende setzt der echte
-- Cutover auf max(id)+Puffer, der Testimport laesst sie bei Start).
CREATE SEQUENCE public.quiz_sessions_id_seq AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;
CREATE SEQUENCE public.tracking_sessions_id_seq AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;
CREATE SEQUENCE public.tracking_events_id_seq AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;
CREATE SEQUENCE public.tracking_video_progress_id_seq AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;
CREATE SEQUENCE public.lead_profiles_id_seq AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;

CREATE TABLE public.lead_state (
  lead_hash text NOT NULL,
  client_seed uuid,
  member_id text,
  ref_id text,
  ref_type text DEFAULT 'member'::text,
  berater_slug text,
  source_app text,
  funnel_key text,
  lang text,
  country text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  first_seen_at timestamp with time zone DEFAULT now(),
  last_seen_at timestamp with time zone DEFAULT now(),
  last_event_at timestamp with time zone,
  first_name text,
  email text,
  email_normalized text,
  email_hash text,
  phone text,
  form_submitted_at timestamp with time zone,
  profile_code text,
  profile_label text,
  main_aspiration text,
  main_aspiration_label text,
  initial_barrier text,
  lifecycle_stage text DEFAULT 'new'::text,
  next_step text,
  cta_type text,
  cta_clicked_at timestamp with time zone,
  mysql_survey_id integer,
  mautic_contact_id text,
  sync_status text DEFAULT 'pending'::text,
  tracking_missing boolean DEFAULT false,
  migration_source text,
  migration_flags jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  organisation_id text,
  utm_content text,
  fbclid text,
  fbc text,
  fbp text,
  event_source_url text,
  utm_campaign_id text,
  utm_adset_id text,
  utm_ad_id text,
  utm_term text,
  mysql_contact_id bigint
);

CREATE TABLE public.lead_events (
  event_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  event_uid text,
  lead_hash text,
  event_name text NOT NULL,
  event_at timestamp with time zone DEFAULT now(),
  member_id text,
  ref_id text,
  berater_slug text,
  source_app text,
  funnel_key text,
  video_step integer,
  question_ref text,
  unique_watched_percent numeric(5,2),
  playhead_percent numeric(5,2),
  payload jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  organisation_id text
);

CREATE TABLE public.lead_video_progress (
  lead_hash text NOT NULL,
  video_step integer NOT NULL,
  video_id text,
  max_unique_watched_percent numeric(5,2) DEFAULT 0,
  max_playhead_percent numeric(5,2) DEFAULT 0,
  unique_watched_seconds integer DEFAULT 0,
  completed_at timestamp with time zone,
  first_seen_at timestamp with time zone DEFAULT now(),
  last_update_at timestamp with time zone DEFAULT now(),
  duration_seconds integer DEFAULT 0,
  seek_count integer DEFAULT 0,
  watched_ranges jsonb DEFAULT '[]'::jsonb,
  unlocked_at timestamp with time zone,
  migration_flags jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.lead_answers_current (
  lead_hash text NOT NULL,
  question_ref text NOT NULL,
  question_index integer,
  question_text text,
  answer_ref text,
  answer_text text,
  answer_value text,
  profile_delta jsonb DEFAULT '{}'::jsonb,
  lang text,
  answered_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.lead_sync_outbox (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  lead_hash text,
  sync_type text NOT NULL,
  context_data jsonb DEFAULT '{}'::jsonb,
  status text DEFAULT 'pending'::text,
  attempts integer DEFAULT 0,
  max_attempts integer DEFAULT 5,
  last_error text,
  next_attempt_at timestamp with time zone DEFAULT now(),
  locked_at timestamp with time zone,
  locked_by text,
  processed_at timestamp with time zone,
  dead_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  response_data jsonb DEFAULT '{}'::jsonb
);

CREATE TABLE public.lead_profiles (
  id bigint DEFAULT nextval('lead_profiles_id_seq'::regclass) NOT NULL,
  profile_key character varying(96) NOT NULL,
  session_hash character varying(96),
  lead_hash character varying(96),
  email_normalized character varying(160),
  email_hash character varying(96),
  first_name character varying(120),
  lang character varying(10) DEFAULT 'de'::character varying,
  country character varying(5),
  member_id character varying(80),
  berater_slug character varying(80),
  source_app character varying(80) DEFAULT 'business_leads_quiz'::character varying,
  funnel character varying(80) DEFAULT 'business'::character varying,
  success_code character varying(40),
  success_code_label character varying(100),
  main_aspiration character varying(60),
  main_aspiration_label character varying(120),
  initial_barrier character varying(60),
  lifecycle_stage character varying(40) DEFAULT 'profiled'::character varying NOT NULL,
  next_step character varying(60) DEFAULT 'watch_video_1'::character varying NOT NULL,
  last_completed_video_step smallint DEFAULT 0 NOT NULL,
  profiled_at timestamp with time zone,
  video_1_watched_at timestamp with time zone,
  video_2_watched_at timestamp with time zone,
  video_3_watched_at timestamp with time zone,
  interest_signaled_at timestamp with time zone,
  product_info_sent_at timestamp with time zone,
  info_call_booked_at timestamp with time zone,
  info_call_done_at timestamp with time zone,
  tags text[] DEFAULT ARRAY[]::text[],
  last_event_name character varying(80),
  last_event_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.app_config (
  key text NOT NULL,
  value jsonb NOT NULL,
  updated_at timestamp with time zone DEFAULT now(),
  updated_by text
);

CREATE TABLE public.nurture_sequences (
  project_key text NOT NULL,
  sequence_key text NOT NULL,
  project_label text NOT NULL,
  sequence_label text NOT NULL,
  channel text DEFAULT 'email'::text NOT NULL,
  workflow_id text,
  expected_interval_minutes integer,
  telemetry_version integer DEFAULT 1 NOT NULL,
  active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.nurture_runs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  project_key text NOT NULL,
  sequence_key text NOT NULL,
  execution_id text NOT NULL,
  workflow_id text,
  workflow_version_id text,
  started_at timestamp with time zone NOT NULL,
  finished_at timestamp with time zone,
  status text NOT NULL,
  candidates_checked integer DEFAULT 0 NOT NULL,
  sent_count integer DEFAULT 0 NOT NULL,
  skipped_count integer DEFAULT 0 NOT NULL,
  failed_count integer DEFAULT 0 NOT NULL,
  error_code text,
  error_node text,
  telemetry_version integer DEFAULT 1 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.nurture_subject_states (
  project_key text NOT NULL,
  sequence_key text NOT NULL,
  lead_hash text NOT NULL,
  status text NOT NULL,
  reason_code text,
  phase_key text,
  first_seen_at timestamp with time zone NOT NULL,
  last_seen_at timestamp with time zone NOT NULL,
  status_changed_at timestamp with time zone NOT NULL,
  occurrence_count integer DEFAULT 1 NOT NULL,
  last_event_uid text,
  telemetry_version integer DEFAULT 1 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.tracking_sessions (
  id bigint DEFAULT nextval('tracking_sessions_id_seq'::regclass) NOT NULL,
  session_hash character varying(96) NOT NULL,
  lead_hash character varying(96),
  member_id character varying(80),
  berater_slug character varying(80),
  source_app character varying(80),
  funnel character varying(80),
  lang character varying(10),
  country character varying(5),
  device_type character varying(30),
  page_key character varying(80),
  first_seen_at timestamp with time zone,
  last_event_at timestamp with time zone,
  current_event character varying(80),
  quiz_profile character varying(40),
  quiz_profile_name character varying(100),
  main_aspiration character varying(60),
  main_aspiration_label character varying(120),
  quiz_barrier character varying(60),
  form_first_name character varying(120),
  form_email character varying(160),
  form_submitted_at timestamp with time zone,
  final_cta_type character varying(60),
  final_cta_clicked_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  is_resume boolean DEFAULT false,
  initial_step text DEFAULT 'intro'::text
);

CREATE TABLE public.tracking_events (
  id bigint DEFAULT nextval('tracking_events_id_seq'::regclass) NOT NULL,
  event_id character varying(96) NOT NULL,
  session_hash character varying(96) NOT NULL,
  lead_hash character varying(96),
  member_id character varying(80),
  berater_slug character varying(80),
  source_app character varying(80),
  funnel character varying(80),
  page_key character varying(80),
  lang character varying(10),
  country character varying(5),
  event_name character varying(80) NOT NULL,
  event_at timestamp with time zone NOT NULL,
  step_index integer,
  question_index integer,
  video_step integer,
  video_id character varying(120),
  progress_percent integer,
  unique_watched_percent integer,
  properties jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.tracking_video_progress (
  id bigint DEFAULT nextval('tracking_video_progress_id_seq'::regclass) NOT NULL,
  session_video_key character varying(140) NOT NULL,
  session_hash character varying(96) NOT NULL,
  lead_hash character varying(96),
  member_id character varying(80),
  berater_slug character varying(80),
  source_app character varying(80),
  funnel character varying(80),
  lang character varying(10),
  country character varying(5),
  video_step integer NOT NULL,
  video_id character varying(120),
  duration_seconds integer,
  unique_watched_seconds integer,
  unique_watched_percent integer,
  max_playhead_percent integer,
  seek_count integer,
  watched_ranges jsonb DEFAULT '[]'::jsonb,
  first_seen_at timestamp with time zone,
  unlocked_at timestamp with time zone,
  completed_at timestamp with time zone,
  last_update_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.quiz_sessions (
  id bigint DEFAULT nextval('quiz_sessions_id_seq'::regclass) NOT NULL,
  hash character varying(64) NOT NULL,
  herbalife_id character varying(50),
  berater_slug character varying(50),
  visited_at timestamp without time zone,
  country character varying(5),
  device_type character varying(20),
  lang character varying(10),
  quiz_profile character varying(10),
  quiz_profile_name character varying(50),
  quiz_aspiration character varying(50),
  quiz_barrier character varying(50),
  quiz_completed_at timestamp without time zone,
  form_first_name character varying(100),
  form_email character varying(100),
  form_submitted_at timestamp without time zone,
  video1_watched_sec integer DEFAULT 0,
  video1_max_pct integer DEFAULT 0,
  video1_last_update timestamp without time zone,
  video2_watched_sec integer DEFAULT 0,
  video2_max_pct integer DEFAULT 0,
  video2_last_update timestamp without time zone,
  video3_watched_sec integer DEFAULT 0,
  video3_max_pct integer DEFAULT 0,
  video3_last_update timestamp without time zone,
  cta_type character varying(50),
  cta_clicked_at timestamp without time zone,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now()
);

CREATE TABLE public.lead_migration_unresolved (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  source_table text NOT NULL,
  source_id text NOT NULL,
  reason text NOT NULL,
  session_hash text,
  lead_hash_candidate text,
  payload jsonb DEFAULT '{}'::jsonb,
  resolved_at timestamp with time zone,
  resolved_lead_hash text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.lead_contact_crm (
  lead_hash character varying(96) NOT NULL,
  member_id character varying(80),
  berater_slug character varying(80),
  interested boolean DEFAULT false NOT NULL,
  target_call_done boolean DEFAULT false NOT NULL,
  wellness_check_done boolean DEFAULT false NOT NULL,
  herbalife_registered boolean DEFAULT false NOT NULL,
  notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  not_interested boolean DEFAULT false NOT NULL,
  reminder_active boolean DEFAULT false NOT NULL,
  reminder_at timestamp with time zone,
  reminder_subject text,
  hom_done boolean DEFAULT false NOT NULL,
  herbalife_registered_at timestamp with time zone,
  support_signup_done boolean DEFAULT false NOT NULL,
  subscription_done boolean DEFAULT false NOT NULL,
  starter_video_1_done boolean DEFAULT false NOT NULL,
  starter_video_2_done boolean DEFAULT false NOT NULL,
  starter_video_3_done boolean DEFAULT false NOT NULL,
  starter_video_4_done boolean DEFAULT false NOT NULL,
  contact_list_done boolean DEFAULT false NOT NULL,
  first_check_done boolean DEFAULT false NOT NULL,
  manual_added boolean DEFAULT false NOT NULL,
  linked_herbalife_id character varying(80),
  linked_user_id character varying(80),
  linked_name text,
  linked_email text,
  linked_at timestamp with time zone
);

CREATE TABLE analytics_internal.event_daily (
  event_day date NOT NULL,
  event_name text NOT NULL,
  source_app text NOT NULL,
  funnel_key text NOT NULL,
  member_id text NOT NULL,
  event_count bigint NOT NULL,
  distinct_leads bigint NOT NULL,
  first_event_at timestamp with time zone,
  last_event_at timestamp with time zone,
  refreshed_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE analytics_internal.refresh_runs (
  run_id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  range_start date NOT NULL,
  range_end date NOT NULL,
  source_event_count bigint NOT NULL,
  aggregate_event_count bigint NOT NULL,
  aggregate_row_count bigint NOT NULL,
  status text NOT NULL,
  source_min_event_at timestamp with time zone,
  source_max_event_at timestamp with time zone,
  completed_at timestamp with time zone DEFAULT now() NOT NULL,
  error_message text
);

-- Constraints in Typ-Reihenfolge PK, UNIQUE, CHECK, FK. Die Auswahl traegt 7 FKs,
-- alle INNERHALB der Auswahl (lead_* -> lead_state, nurture_* -> nurture_sequences).
ALTER TABLE analytics_internal.event_daily ADD CONSTRAINT event_daily_pkey PRIMARY KEY (event_day, event_name, source_app, funnel_key, member_id);
ALTER TABLE analytics_internal.refresh_runs ADD CONSTRAINT refresh_runs_pkey PRIMARY KEY (run_id);
ALTER TABLE public.app_config ADD CONSTRAINT app_config_pkey PRIMARY KEY (key);
ALTER TABLE public.lead_answers_current ADD CONSTRAINT lead_answers_current_pkey PRIMARY KEY (lead_hash, question_ref);
ALTER TABLE public.lead_contact_crm ADD CONSTRAINT lead_contact_crm_pkey PRIMARY KEY (lead_hash);
ALTER TABLE public.lead_events ADD CONSTRAINT lead_events_pkey PRIMARY KEY (event_id);
ALTER TABLE public.lead_migration_unresolved ADD CONSTRAINT lead_migration_unresolved_pkey PRIMARY KEY (id);
ALTER TABLE public.lead_profiles ADD CONSTRAINT lead_profiles_pkey PRIMARY KEY (id);
ALTER TABLE public.lead_state ADD CONSTRAINT lead_state_pkey PRIMARY KEY (lead_hash);
ALTER TABLE public.lead_sync_outbox ADD CONSTRAINT lead_sync_outbox_pkey PRIMARY KEY (id);
ALTER TABLE public.lead_video_progress ADD CONSTRAINT lead_video_progress_pkey PRIMARY KEY (lead_hash, video_step);
ALTER TABLE public.nurture_runs ADD CONSTRAINT nurture_runs_pkey PRIMARY KEY (id);
ALTER TABLE public.nurture_sequences ADD CONSTRAINT nurture_sequences_pkey PRIMARY KEY (project_key, sequence_key);
ALTER TABLE public.nurture_subject_states ADD CONSTRAINT nurture_subject_states_pkey PRIMARY KEY (project_key, sequence_key, lead_hash);
ALTER TABLE public.quiz_sessions ADD CONSTRAINT quiz_sessions_pkey PRIMARY KEY (id);
ALTER TABLE public.tracking_events ADD CONSTRAINT tracking_events_pkey PRIMARY KEY (id);
ALTER TABLE public.tracking_sessions ADD CONSTRAINT tracking_sessions_pkey PRIMARY KEY (id);
ALTER TABLE public.tracking_video_progress ADD CONSTRAINT tracking_video_progress_pkey PRIMARY KEY (id);
ALTER TABLE public.lead_events ADD CONSTRAINT lead_events_event_uid_key UNIQUE (event_uid);
ALTER TABLE public.lead_migration_unresolved ADD CONSTRAINT lead_migration_unresolved_source_table_source_id_key UNIQUE (source_table, source_id);
ALTER TABLE public.lead_profiles ADD CONSTRAINT lead_profiles_profile_key_key UNIQUE (profile_key);
ALTER TABLE public.lead_state ADD CONSTRAINT lead_state_client_seed_key UNIQUE (client_seed);
ALTER TABLE public.nurture_runs ADD CONSTRAINT nurture_runs_project_key_sequence_key_execution_id_key UNIQUE (project_key, sequence_key, execution_id);
ALTER TABLE public.quiz_sessions ADD CONSTRAINT quiz_sessions_hash_key UNIQUE (hash);
ALTER TABLE public.tracking_events ADD CONSTRAINT tracking_events_event_id_key UNIQUE (event_id);
ALTER TABLE public.tracking_sessions ADD CONSTRAINT tracking_sessions_session_hash_key UNIQUE (session_hash);
ALTER TABLE public.tracking_video_progress ADD CONSTRAINT tracking_video_progress_session_video_key_key UNIQUE (session_video_key);
ALTER TABLE analytics_internal.event_daily ADD CONSTRAINT event_daily_distinct_leads_check CHECK ((distinct_leads >= 0));
ALTER TABLE analytics_internal.event_daily ADD CONSTRAINT event_daily_event_count_check CHECK ((event_count >= 0));
ALTER TABLE analytics_internal.refresh_runs ADD CONSTRAINT refresh_runs_status_check CHECK ((status = ANY (ARRAY['complete'::text, 'failed'::text])));
ALTER TABLE public.lead_profiles ADD CONSTRAINT lead_profiles_last_completed_video_step_check CHECK (((last_completed_video_step >= 0) AND (last_completed_video_step <= 3)));
ALTER TABLE public.lead_state ADD CONSTRAINT lead_state_lead_hash_check CHECK ((lead_hash ~ '^qz_[a-zA-Z0-9_]+$'::text));
ALTER TABLE public.lead_state ADD CONSTRAINT lead_state_ref_type_check CHECK ((ref_type = ANY (ARRAY['member'::text, 'referral_code'::text, 'campaign'::text, 'unknown'::text])));
ALTER TABLE public.lead_sync_outbox ADD CONSTRAINT lead_sync_outbox_attempts_check CHECK ((attempts >= 0));
ALTER TABLE public.lead_sync_outbox ADD CONSTRAINT lead_sync_outbox_max_attempts_check CHECK ((max_attempts > 0));
ALTER TABLE public.lead_sync_outbox ADD CONSTRAINT lead_sync_outbox_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'done'::text, 'failed'::text, 'dead'::text])));
ALTER TABLE public.lead_video_progress ADD CONSTRAINT lead_video_progress_duration_seconds_check CHECK ((duration_seconds >= 0));
ALTER TABLE public.lead_video_progress ADD CONSTRAINT lead_video_progress_max_playhead_percent_check CHECK (((max_playhead_percent >= (0)::numeric) AND (max_playhead_percent <= (100)::numeric)));
ALTER TABLE public.lead_video_progress ADD CONSTRAINT lead_video_progress_max_unique_watched_percent_check CHECK (((max_unique_watched_percent >= (0)::numeric) AND (max_unique_watched_percent <= (100)::numeric)));
ALTER TABLE public.lead_video_progress ADD CONSTRAINT lead_video_progress_seek_count_check CHECK ((seek_count >= 0));
ALTER TABLE public.lead_video_progress ADD CONSTRAINT lead_video_progress_unique_watched_seconds_check CHECK ((unique_watched_seconds >= 0));
ALTER TABLE public.lead_video_progress ADD CONSTRAINT lead_video_progress_video_step_check CHECK ((video_step = ANY (ARRAY[1, 2, 3])));
ALTER TABLE public.nurture_runs ADD CONSTRAINT nurture_runs_candidates_checked_check CHECK ((candidates_checked >= 0));
ALTER TABLE public.nurture_runs ADD CONSTRAINT nurture_runs_execution_id_check CHECK (((length(TRIM(BOTH FROM execution_id)) >= 1) AND (length(TRIM(BOTH FROM execution_id)) <= 160)));
ALTER TABLE public.nurture_runs ADD CONSTRAINT nurture_runs_failed_count_check CHECK ((failed_count >= 0));
ALTER TABLE public.nurture_runs ADD CONSTRAINT nurture_runs_sent_count_check CHECK ((sent_count >= 0));
ALTER TABLE public.nurture_runs ADD CONSTRAINT nurture_runs_skipped_count_check CHECK ((skipped_count >= 0));
ALTER TABLE public.nurture_runs ADD CONSTRAINT nurture_runs_status_check CHECK ((status = ANY (ARRAY['running'::text, 'success'::text, 'failed'::text])));
ALTER TABLE public.nurture_runs ADD CONSTRAINT nurture_runs_telemetry_version_check CHECK ((telemetry_version > 0));
ALTER TABLE public.nurture_sequences ADD CONSTRAINT nurture_sequences_channel_check CHECK ((channel = ANY (ARRAY['email'::text, 'sms'::text, 'whatsapp'::text, 'push'::text])));
ALTER TABLE public.nurture_sequences ADD CONSTRAINT nurture_sequences_expected_interval_minutes_check CHECK (((expected_interval_minutes >= 5) AND (expected_interval_minutes <= 10080)));
ALTER TABLE public.nurture_sequences ADD CONSTRAINT nurture_sequences_project_key_check CHECK ((project_key ~ '^[a-z0-9_]{2,50}$'::text));
ALTER TABLE public.nurture_sequences ADD CONSTRAINT nurture_sequences_sequence_key_check CHECK ((sequence_key ~ '^[a-z0-9_]{2,60}$'::text));
ALTER TABLE public.nurture_sequences ADD CONSTRAINT nurture_sequences_telemetry_version_check CHECK ((telemetry_version > 0));
ALTER TABLE public.nurture_subject_states ADD CONSTRAINT nurture_subject_states_lead_hash_check CHECK (((length(TRIM(BOTH FROM lead_hash)) >= 3) AND (length(TRIM(BOTH FROM lead_hash)) <= 160)));
ALTER TABLE public.nurture_subject_states ADD CONSTRAINT nurture_subject_states_occurrence_count_check CHECK ((occurrence_count > 0));
ALTER TABLE public.nurture_subject_states ADD CONSTRAINT nurture_subject_states_status_check CHECK ((status = ANY (ARRAY['sent'::text, 'skipped'::text])));
ALTER TABLE public.nurture_subject_states ADD CONSTRAINT nurture_subject_states_telemetry_version_check CHECK ((telemetry_version > 0));
ALTER TABLE public.lead_answers_current ADD CONSTRAINT lead_answers_current_lead_hash_fkey FOREIGN KEY (lead_hash) REFERENCES lead_state(lead_hash) ON DELETE CASCADE;
ALTER TABLE public.lead_events ADD CONSTRAINT lead_events_lead_hash_fkey FOREIGN KEY (lead_hash) REFERENCES lead_state(lead_hash) ON DELETE CASCADE;
ALTER TABLE public.lead_migration_unresolved ADD CONSTRAINT lead_migration_unresolved_resolved_lead_hash_fkey FOREIGN KEY (resolved_lead_hash) REFERENCES lead_state(lead_hash) ON DELETE SET NULL;
ALTER TABLE public.lead_sync_outbox ADD CONSTRAINT lead_sync_outbox_lead_hash_fkey FOREIGN KEY (lead_hash) REFERENCES lead_state(lead_hash) ON DELETE CASCADE;
ALTER TABLE public.lead_video_progress ADD CONSTRAINT lead_video_progress_lead_hash_fkey FOREIGN KEY (lead_hash) REFERENCES lead_state(lead_hash) ON DELETE CASCADE;
ALTER TABLE public.nurture_runs ADD CONSTRAINT nurture_runs_project_key_sequence_key_fkey FOREIGN KEY (project_key, sequence_key) REFERENCES nurture_sequences(project_key, sequence_key) ON DELETE RESTRICT;
ALTER TABLE public.nurture_subject_states ADD CONSTRAINT nurture_subject_states_project_key_sequence_key_fkey FOREIGN KEY (project_key, sequence_key) REFERENCES nurture_sequences(project_key, sequence_key) ON DELETE RESTRICT;

-- Sequenz-Eigentum (haelt DROP TABLE und Dump-Verhalten identisch zur Quelle).
ALTER SEQUENCE public.quiz_sessions_id_seq OWNED BY public.quiz_sessions.id;
ALTER SEQUENCE public.tracking_sessions_id_seq OWNED BY public.tracking_sessions.id;
ALTER SEQUENCE public.tracking_events_id_seq OWNED BY public.tracking_events.id;
ALTER SEQUENCE public.tracking_video_progress_id_seq OWNED BY public.tracking_video_progress.id;
ALTER SEQUENCE public.lead_profiles_id_seq OWNED BY public.lead_profiles.id;

-- Indexe (ohne die von Constraints automatisch erzeugten).
CREATE INDEX event_daily_member_day_idx ON analytics_internal.event_daily USING btree (member_id, event_day DESC);
CREATE INDEX event_daily_name_day_idx ON analytics_internal.event_daily USING btree (event_name, event_day DESC);
CREATE INDEX lead_contact_crm_berater_slug_idx ON public.lead_contact_crm USING btree (berater_slug);
CREATE INDEX lead_contact_crm_linked_herbalife_id_idx ON public.lead_contact_crm USING btree (linked_herbalife_id) WHERE (linked_herbalife_id IS NOT NULL);
CREATE INDEX lead_contact_crm_manual_added_idx ON public.lead_contact_crm USING btree (member_id, manual_added) WHERE (manual_added = true);
CREATE INDEX lead_contact_crm_member_id_idx ON public.lead_contact_crm USING btree (member_id);
CREATE INDEX lead_contact_crm_reminder_at_idx ON public.lead_contact_crm USING btree (reminder_at) WHERE (reminder_active = true);
CREATE INDEX idx_le_lead_time ON public.lead_events USING btree (lead_hash, event_at DESC);
CREATE INDEX idx_le_member_time ON public.lead_events USING btree (member_id, event_at DESC);
CREATE INDEX idx_le_name_time ON public.lead_events USING btree (event_name, event_at DESC);
CREATE INDEX idx_le_organisation_time ON public.lead_events USING btree (organisation_id, event_at DESC);
CREATE INDEX idx_le_question_time ON public.lead_events USING btree (question_ref, event_at DESC);
CREATE INDEX idx_le_ref_time ON public.lead_events USING btree (ref_id, event_at DESC);
CREATE INDEX idx_le_video_time ON public.lead_events USING btree (video_step, event_at DESC);
CREATE INDEX idx_lead_events_created_at_event_uid ON public.lead_events USING btree (created_at DESC, event_uid);
CREATE INDEX idx_lead_events_event_at_desc ON public.lead_events USING btree (event_at DESC);
CREATE INDEX idx_lmu_reason ON public.lead_migration_unresolved USING btree (reason, created_at DESC);
CREATE INDEX idx_lmu_resolved_lead_hash ON public.lead_migration_unresolved USING btree (resolved_lead_hash);
CREATE INDEX idx_lmu_session ON public.lead_migration_unresolved USING btree (session_hash);
CREATE INDEX idx_lead_profiles_email_hash ON public.lead_profiles USING btree (email_hash);
CREATE INDEX idx_lead_profiles_lead_hash ON public.lead_profiles USING btree (lead_hash);
CREATE INDEX idx_lead_profiles_member_id ON public.lead_profiles USING btree (member_id);
CREATE INDEX idx_lead_profiles_next_step ON public.lead_profiles USING btree (next_step);
CREATE INDEX idx_lead_profiles_session_hash ON public.lead_profiles USING btree (session_hash);
CREATE INDEX idx_lead_profiles_stage ON public.lead_profiles USING btree (lifecycle_stage);
CREATE INDEX idx_lead_profiles_success_code ON public.lead_profiles USING btree (success_code);
CREATE INDEX idx_ls_email_hash ON public.lead_state USING btree (email_hash);
CREATE INDEX idx_ls_email_norm ON public.lead_state USING btree (email_normalized);
CREATE INDEX idx_ls_last_event ON public.lead_state USING btree (last_event_at DESC);
CREATE INDEX idx_ls_lifecycle_created ON public.lead_state USING btree (lifecycle_stage, created_at DESC);
CREATE INDEX idx_ls_member_created ON public.lead_state USING btree (member_id, created_at DESC);
CREATE INDEX idx_ls_organisation_created ON public.lead_state USING btree (organisation_id, created_at DESC);
CREATE INDEX idx_ls_ref_created ON public.lead_state USING btree (ref_id, created_at DESC);
CREATE INDEX idx_ls_utm_ad_id_created ON public.lead_state USING btree (utm_ad_id, form_submitted_at DESC) WHERE (utm_ad_id IS NOT NULL);
CREATE INDEX idx_ls_utm_content_created ON public.lead_state USING btree (utm_content, form_submitted_at DESC) WHERE (utm_content IS NOT NULL);
CREATE INDEX idx_lead_sync_outbox_lead_hash ON public.lead_sync_outbox USING btree (lead_hash);
CREATE INDEX idx_outbox_locked ON public.lead_sync_outbox USING btree (status, locked_at) WHERE (status = 'processing'::text);
CREATE INDEX idx_outbox_pending ON public.lead_sync_outbox USING btree (status, next_attempt_at) WHERE (status = ANY (ARRAY['pending'::text, 'failed'::text]));
CREATE INDEX idx_lvp_lead_step ON public.lead_video_progress USING btree (lead_hash, video_step);
CREATE INDEX idx_lvp_step_pct ON public.lead_video_progress USING btree (video_step, max_unique_watched_percent);
CREATE INDEX nurture_runs_sequence_finished_idx ON public.nurture_runs USING btree (project_key, sequence_key, finished_at DESC);
CREATE INDEX nurture_runs_status_finished_idx ON public.nurture_runs USING btree (status, finished_at DESC);
CREATE INDEX nurture_subject_states_status_idx ON public.nurture_subject_states USING btree (project_key, sequence_key, status, last_seen_at DESC);
CREATE INDEX idx_quiz_sessions_created_at ON public.quiz_sessions USING btree (created_at);
CREATE INDEX idx_quiz_sessions_hash ON public.quiz_sessions USING btree (hash);
CREATE INDEX idx_quiz_sessions_herbalife_id ON public.quiz_sessions USING btree (herbalife_id);
CREATE INDEX idx_tracking_events_event_at ON public.tracking_events USING btree (event_at);
CREATE INDEX idx_tracking_events_event_name ON public.tracking_events USING btree (event_name);
CREATE INDEX idx_tracking_events_member_id ON public.tracking_events USING btree (member_id);
CREATE INDEX idx_tracking_events_session_hash ON public.tracking_events USING btree (session_hash);
CREATE INDEX idx_tracking_events_video ON public.tracking_events USING btree (video_step, video_id);
CREATE INDEX idx_tracking_sessions_is_resume ON public.tracking_sessions USING btree (is_resume);
CREATE INDEX idx_tracking_sessions_last_event ON public.tracking_sessions USING btree (last_event_at);
CREATE INDEX idx_tracking_sessions_lead_hash ON public.tracking_sessions USING btree (lead_hash);
CREATE INDEX idx_tracking_sessions_member_id ON public.tracking_sessions USING btree (member_id);
CREATE INDEX idx_tracking_sessions_source_funnel ON public.tracking_sessions USING btree (source_app, funnel);
CREATE INDEX idx_tracking_video_member_id ON public.tracking_video_progress USING btree (member_id);
CREATE INDEX idx_tracking_video_session_hash ON public.tracking_video_progress USING btree (session_hash);
CREATE INDEX idx_tracking_video_step ON public.tracking_video_progress USING btree (video_step);

-- Funktionen. check_function_bodies aus: plpgsql prueft Objektbezuege ohnehin
-- erst zur Laufzeit, und die Reihenfolge soll keine versteckte Abhaengigkeit haben.
SET LOCAL check_function_bodies = off;
CREATE OR REPLACE FUNCTION analytics_internal.refresh_event_daily(p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_source_count bigint;
  v_aggregate_count bigint;
  v_row_count bigint;
  v_min_at timestamptz;
  v_max_at timestamptz;
begin
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'invalid analytics refresh range';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('analytics_internal.refresh_event_daily'));

  select count(*), min(event_at), max(event_at)
    into v_source_count, v_min_at, v_max_at
    from public.lead_events
   where event_at >= (p_from::timestamp at time zone 'UTC')
     and event_at < ((p_to + 1)::timestamp at time zone 'UTC');

  delete from analytics_internal.event_daily
   where event_day between p_from and p_to;

  insert into analytics_internal.event_daily (
    event_day, event_name, source_app, funnel_key, member_id,
    event_count, distinct_leads, first_event_at, last_event_at, refreshed_at
  )
  select
    (event_at at time zone 'UTC')::date,
    coalesce(event_name, ''),
    coalesce(source_app, ''),
    coalesce(funnel_key, ''),
    coalesce(member_id, ''),
    count(*)::bigint,
    count(distinct lead_hash)::bigint,
    min(event_at),
    max(event_at),
    pg_catalog.clock_timestamp()
  from public.lead_events
  where event_at >= (p_from::timestamp at time zone 'UTC')
    and event_at < ((p_to + 1)::timestamp at time zone 'UTC')
  group by 1,2,3,4,5;

  select coalesce(sum(event_count), 0), count(*)
    into v_aggregate_count, v_row_count
    from analytics_internal.event_daily
   where event_day between p_from and p_to;

  if v_aggregate_count <> v_source_count then
    raise exception 'analytics parity failure: source %, aggregate %', v_source_count, v_aggregate_count;
  end if;

  insert into analytics_internal.refresh_runs (
    range_start, range_end, source_event_count, aggregate_event_count,
    aggregate_row_count, status, source_min_event_at, source_max_event_at
  ) values (
    p_from, p_to, v_source_count, v_aggregate_count,
    v_row_count, 'complete', v_min_at, v_max_at
  );

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'range_start', p_from,
    'range_end', p_to,
    'source_event_count', v_source_count,
    'aggregate_event_count', v_aggregate_count,
    'aggregate_row_count', v_row_count
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.analytics_dashboard_v2(p_from timestamp with time zone, p_to timestamp with time zone, p_member_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select pg_catalog.jsonb_build_object(
    'version', 2,
    'from', p_from,
    'to', p_to,
    'member_id', p_member_id,
    'event_count', coalesce(sum(d.event_count), 0),
    'buckets', coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'day', d.event_day,
          'event_name', d.event_name,
          'source_app', d.source_app,
          'funnel_key', d.funnel_key,
          'member_id', d.member_id,
          'event_count', d.event_count,
          'distinct_leads', d.distinct_leads
        ) order by d.event_day, d.event_name, d.source_app, d.funnel_key, d.member_id
      ),
      '[]'::jsonb
    )
  )
  from analytics_internal.event_daily d
  where d.event_day >= (p_from at time zone 'UTC')::date
    and d.event_day <= (p_to at time zone 'UTC')::date
    and (p_member_id is null or d.member_id = p_member_id);
$function$
;

CREATE OR REPLACE FUNCTION public.analytics_events_page_v2(p_from timestamp with time zone, p_berater_slug text DEFAULT NULL::text, p_cursor_event_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor_event_id bigint DEFAULT NULL::bigint, p_page_size integer DEFAULT 1000)
 RETURNS SETOF lead_events
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select e.*
  from public.lead_events e
  where e.event_at >= p_from
    and (p_berater_slug is null or e.berater_slug = p_berater_slug)
    and (
      p_cursor_event_at is null
      or e.event_at < p_cursor_event_at
      or (e.event_at = p_cursor_event_at and e.event_id < p_cursor_event_id)
    )
  order by e.event_at desc, e.event_id desc
  limit least(greatest(coalesce(p_page_size, 1000), 1), 1000);
$function$
;

CREATE OR REPLACE FUNCTION public.claim_outbox_jobs(worker_id text, batch_size integer DEFAULT 10)
 RETURNS SETOF lead_sync_outbox
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.enqueue_lead_sync(p_lead_hash text, p_sync_type text, p_context_data jsonb DEFAULT '{}'::jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.init_lead(p_client_seed uuid, p_lead_hash text DEFAULT NULL::text, p_member_id text DEFAULT NULL::text, p_organisation_id text DEFAULT NULL::text, p_ref_id text DEFAULT NULL::text, p_ref_type text DEFAULT NULL::text, p_berater_slug text DEFAULT NULL::text, p_source_app text DEFAULT 'business_leads_quiz'::text, p_funnel_key text DEFAULT 'business'::text, p_lang text DEFAULT NULL::text, p_country text DEFAULT NULL::text, p_utm_source text DEFAULT NULL::text, p_utm_medium text DEFAULT NULL::text, p_utm_campaign text DEFAULT NULL::text, p_utm_content text DEFAULT NULL::text, p_fbclid text DEFAULT NULL::text, p_fbc text DEFAULT NULL::text, p_fbp text DEFAULT NULL::text, p_event_source_url text DEFAULT NULL::text, p_utm_campaign_id text DEFAULT NULL::text, p_utm_adset_id text DEFAULT NULL::text, p_utm_ad_id text DEFAULT NULL::text, p_utm_term text DEFAULT NULL::text)
 RETURNS TABLE(lead_hash text)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_ref_id text;
  v_ref_type text;
  v_lead_hash text;
begin
  if p_client_seed is null then
    raise exception 'client_seed_required';
  end if;

  v_lead_hash := coalesce(nullif(p_lead_hash, ''), 'qz_' || replace(gen_random_uuid()::text, '-', ''));
  v_ref_id := coalesce(nullif(p_ref_id, ''), nullif(p_member_id, ''));
  v_ref_type := coalesce(nullif(p_ref_type, ''), case when v_ref_id is not null and v_ref_id <> p_member_id then 'referral_code' else 'member' end);

  return query
  insert into public.lead_state (
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
    fbclid,
    fbc,
    fbp,
    event_source_url,
    utm_campaign_id,
    utm_adset_id,
    utm_ad_id,
    utm_term,
    first_seen_at,
    last_seen_at
  )
  values (
    p_client_seed,
    v_lead_hash,
    nullif(p_member_id, ''),
    nullif(p_organisation_id, ''),
    v_ref_id,
    v_ref_type,
    nullif(p_berater_slug, ''),
    coalesce(nullif(p_source_app, ''), 'business_leads_quiz'),
    coalesce(nullif(p_funnel_key, ''), 'business'),
    nullif(p_lang, ''),
    nullif(p_country, ''),
    nullif(p_utm_source, ''),
    nullif(p_utm_medium, ''),
    nullif(p_utm_campaign, ''),
    nullif(p_utm_content, ''),
    nullif(p_fbclid, ''),
    nullif(p_fbc, ''),
    nullif(p_fbp, ''),
    nullif(p_event_source_url, ''),
    nullif(p_utm_campaign_id, ''),
    nullif(p_utm_adset_id, ''),
    nullif(p_utm_ad_id, ''),
    nullif(p_utm_term, ''),
    now(),
    now()
  )
  on conflict (client_seed) do update set
    last_seen_at = now(),
    member_id = coalesce(public.lead_state.member_id, excluded.member_id),
    organisation_id = coalesce(public.lead_state.organisation_id, excluded.organisation_id),
    ref_id = coalesce(public.lead_state.ref_id, excluded.ref_id),
    ref_type = coalesce(public.lead_state.ref_type, excluded.ref_type),
    berater_slug = coalesce(public.lead_state.berater_slug, excluded.berater_slug),
    source_app = coalesce(public.lead_state.source_app, excluded.source_app),
    funnel_key = coalesce(public.lead_state.funnel_key, excluded.funnel_key),
    lang = coalesce(public.lead_state.lang, excluded.lang),
    country = coalesce(public.lead_state.country, excluded.country),
    utm_source = coalesce(public.lead_state.utm_source, excluded.utm_source),
    utm_medium = coalesce(public.lead_state.utm_medium, excluded.utm_medium),
    utm_campaign = coalesce(public.lead_state.utm_campaign, excluded.utm_campaign),
    utm_content = coalesce(public.lead_state.utm_content, excluded.utm_content),
    fbclid = coalesce(public.lead_state.fbclid, excluded.fbclid),
    fbc = coalesce(public.lead_state.fbc, excluded.fbc),
    fbp = coalesce(public.lead_state.fbp, excluded.fbp),
    event_source_url = coalesce(public.lead_state.event_source_url, excluded.event_source_url),
    utm_campaign_id = coalesce(public.lead_state.utm_campaign_id, excluded.utm_campaign_id),
    utm_adset_id = coalesce(public.lead_state.utm_adset_id, excluded.utm_adset_id),
    utm_ad_id = coalesce(public.lead_state.utm_ad_id, excluded.utm_ad_id),
    utm_term = coalesce(public.lead_state.utm_term, excluded.utm_term),
    updated_at = now()
  returning public.lead_state.lead_hash;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.mark_outbox_done(p_job_id bigint, p_worker_id text, p_response_data jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.mark_outbox_failed(p_job_id bigint, p_worker_id text, p_error text, p_response_data jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.nurture_events_page(p_since timestamp with time zone, p_until timestamp with time zone, p_project_key text DEFAULT NULL::text, p_sequence_key text DEFAULT NULL::text, p_status text DEFAULT NULL::text, p_phase text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_cursor_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor_uid text DEFAULT NULL::text)
 RETURNS TABLE(event_uid text, occurred_at timestamp with time zone, project_key text, sequence_key text, status text, event_type text, phase_key text, reason_code text, reason_category text, channel text, language text, template_ref text, subject_ref text, execution_ref text, source_family text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with normalized as (
    select
      coalesce(e.event_uid, e.event_id::text) as event_uid,
      coalesce(e.event_at, e.created_at) as occurred_at,
      e.lead_hash,
      coalesce(e.payload->>'project_key', 'business_leads_quiz') as project_key,
      coalesce(e.payload->>'sequence_key', 'video_nurture') as sequence_key,
      case e.event_name
        when 'nurture_sent' then 'sent'
        when 'nurture_skipped' then 'skipped'
        when 'nurture_resume_opened' then 'resumed'
        else 'failed'
      end as status,
      e.event_name as event_type,
      nullif(upper(coalesce(e.payload->>'phase', e.payload->>'acn_phase')), '') as phase_key,
      nullif(coalesce(e.payload->>'reason', e.payload->>'error_code'), '') as reason_code,
      case
        when lower(coalesce(e.payload->>'reason', '')) ~ '(dnc|unsub|already|stopp|complete|cta)' then 'expected_policy'
        when lower(coalesce(e.payload->>'reason', '')) ~ '(unsupported|language|no_email|no_coach|no_mautic|missing_required)' then 'technical_configuration'
        when e.event_name in ('nurture_error', 'n8n_error') then 'technical_failure'
        else 'unknown'
      end as reason_category,
      'email'::text as channel,
      coalesce(nullif(e.payload->>'language', ''), 'unknown') as language,
      nullif(coalesce(e.payload->>'email_id', e.payload->>'acn_email', e.payload->>'email'), '') as template_ref,
      case when e.lead_hash is null then null else left(e.lead_hash, 14) end as subject_ref,
      nullif(coalesce(e.payload->>'execution_id', e.payload->>'acn_run'), '') as execution_ref,
      case
        when e.payload ? 'backfill_source' then 'backfill:' || (e.payload->>'backfill_source')
        when e.payload ? 'pilot_batch' then 'pilot:' || (e.payload->>'pilot_batch')
        else coalesce(nullif(e.payload->>'source', ''), 'current')
      end as source_family
    from public.lead_events e
    where e.event_name in ('nurture_sent', 'nurture_skipped', 'nurture_resume_opened', 'nurture_error', 'n8n_error')
      and coalesce(e.event_at, e.created_at) >= p_since
      and coalesce(e.event_at, e.created_at) < p_until
  ), filtered as (
    select n.*,
      row_number() over (
        partition by n.project_key, n.sequence_key, n.lead_hash, n.status, n.reason_code, n.phase_key
        order by n.occurred_at desc, n.event_uid desc
      ) as skip_rank
    from normalized n
    where (p_project_key is null or n.project_key = p_project_key)
      and (p_sequence_key is null or n.sequence_key = p_sequence_key)
      and (p_status is null or n.status = p_status)
      and (p_phase is null or n.phase_key = upper(p_phase))
  )
  select
    n.event_uid, n.occurred_at, n.project_key, n.sequence_key, n.status,
    n.event_type, n.phase_key, n.reason_code, n.reason_category, n.channel,
    n.language, n.template_ref, n.subject_ref, n.execution_ref, n.source_family
  from filtered n
  where (n.status <> 'skipped' or n.skip_rank = 1)
    and (p_cursor_at is null or (n.occurred_at, n.event_uid) < (p_cursor_at, p_cursor_uid))
  order by n.occurred_at desc, n.event_uid desc
  limit greatest(10, least(coalesce(p_limit, 50), 100));
$function$
;

CREATE OR REPLACE FUNCTION public.nurture_health_signals()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with latest_run as (
    select project_key, sequence_key, status, coalesce(finished_at, started_at) as ran_at,
      error_code, error_node
    from public.nurture_runs
    order by coalesce(finished_at, started_at) desc limit 1
  ), latest_signal as (
    select max(signal_at) as event_at from (
      select max(coalesce(event_at, created_at)) as signal_at
      from public.lead_events
      where event_name in ('nurture_sent', 'nurture_skipped', 'nurture_resume_opened')
      union all
      select max(last_seen_at) from public.nurture_subject_states
    ) signals
  ), failures as (
    select count(*)::integer as count
    from public.lead_events
    where event_name in ('nurture_error', 'n8n_error')
      and coalesce(event_at, created_at) >= now() - interval '24 hours'
  )
  select jsonb_build_object(
    'missing_run_telemetry', case when (select ran_at from latest_run) is null then 1 else 0 end,
    'run_overdue', case when coalesce((select ran_at from latest_run), '-infinity'::timestamptz) < now() - interval '4 hours' then 1 else 0 end,
    'recent_failures', (select count from failures),
    'signal_stale', case when coalesce((select event_at from latest_signal), '-infinity'::timestamptz) < now() - interval '4 hours' then 1 else 0 end,
    'latest_run_at', (select ran_at from latest_run),
    'latest_run_status', (select status from latest_run),
    'latest_error_code', (select error_code from latest_run),
    'latest_error_node', (select error_node from latest_run),
    'latest_signal_at', (select event_at from latest_signal)
  );
$function$
;

CREATE OR REPLACE FUNCTION public.nurture_overview(p_since timestamp with time zone, p_until timestamp with time zone, p_project_key text DEFAULT NULL::text, p_sequence_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with normalized as (
    select
      coalesce(e.event_uid, e.event_id::text) as event_uid,
      coalesce(e.event_at, e.created_at) as occurred_at,
      e.lead_hash,
      coalesce(e.payload->>'project_key', 'business_leads_quiz') as project_key,
      coalesce(e.payload->>'sequence_key', 'video_nurture') as sequence_key,
      e.event_name as event_type,
      case e.event_name
        when 'nurture_sent' then 'sent'
        when 'nurture_skipped' then 'skipped'
        when 'nurture_resume_opened' then 'resumed'
        when 'video_unlocked' then 'continued'
        when 'video_completed' then 'continued'
        when 'video_continue_click' then 'continued'
        when 'cta_clicked' then 'continued'
        when 'result_cta_click' then 'continued'
        else 'failed'
      end as status,
      nullif(upper(coalesce(e.payload->>'phase', e.payload->>'acn_phase')), '') as phase_key,
      nullif(coalesce(e.payload->>'reason', e.payload->>'error_code'), '') as reason_code,
      case
        when lower(coalesce(e.payload->>'reason', '')) ~ '(dnc|unsub|already|stopp|complete|cta)' then 'expected_policy'
        when lower(coalesce(e.payload->>'reason', '')) ~ '(unsupported|language|no_email|no_coach|no_mautic|missing_required)' then 'technical_configuration'
        when e.event_name in ('nurture_error', 'n8n_error') then 'technical_failure'
        else 'unknown'
      end as reason_category,
      coalesce(nullif(e.payload->>'language', ''), 'unknown') as language,
      coalesce(e.payload->>'backfill_source', e.payload->>'pilot_batch') as source_family
    from public.lead_events e
    where e.event_name in (
      'nurture_sent', 'nurture_skipped', 'nurture_resume_opened', 'nurture_error', 'n8n_error',
      'video_unlocked', 'video_completed', 'video_continue_click', 'cta_clicked', 'result_cta_click'
    )
      and coalesce(e.event_at, e.created_at) < p_until
  ), filtered as (
    select * from normalized
    where (p_project_key is null or project_key = p_project_key)
      and (p_sequence_key is null or sequence_key = p_sequence_key)
  ), ranged as (
    select * from filtered where occurred_at >= p_since
  ), sent_events as (
    select * from ranged where event_type = 'nurture_sent' and lead_hash is not null
  ), sent_people as (
    select project_key, sequence_key, lead_hash,
      count(*)::bigint as send_count,
      min(occurred_at) as first_sent_at,
      max(occurred_at) as last_sent_at
    from sent_events group by 1, 2, 3
  ), attributed_returns_ranked as (
    select r.event_uid, r.occurred_at, r.project_key, r.sequence_key, r.lead_hash, r.phase_key,
      s.occurred_at as sent_at,
      row_number() over (partition by r.event_uid order by s.occurred_at desc, s.event_uid desc) as attribution_rank
    from filtered r
    join sent_events s on s.project_key = r.project_key
      and s.sequence_key = r.sequence_key and s.lead_hash = r.lead_hash
      and r.occurred_at >= s.occurred_at
      and r.occurred_at <= s.occurred_at + interval '7 days'
    where r.event_type = 'nurture_resume_opened'
  ), attributed_returns as (
    select * from attributed_returns_ranked where attribution_rank = 1
  ), attributed_continuations_ranked as (
    select c.event_uid, c.occurred_at, c.project_key, c.sequence_key, c.lead_hash, c.phase_key,
      r.event_uid as return_event_uid,
      row_number() over (partition by c.event_uid order by r.occurred_at desc, r.event_uid desc) as attribution_rank
    from filtered c
    join attributed_returns r on r.project_key = c.project_key
      and r.sequence_key = c.sequence_key and r.lead_hash = c.lead_hash
      and c.occurred_at >= r.occurred_at
      and c.occurred_at <= r.sent_at + interval '7 days'
    where c.event_type in ('video_unlocked', 'video_completed', 'video_continue_click', 'cta_clicked', 'result_cta_click')
  ), attributed_continuations as (
    select * from attributed_continuations_ranked where attribution_rank = 1
  ), returned_people as (
    select project_key, sequence_key, lead_hash, count(*)::bigint as return_count
    from attributed_returns group by 1, 2, 3
  ), continued_people as (
    select project_key, sequence_key, lead_hash, count(*)::bigint as continuation_count
    from attributed_continuations group by 1, 2, 3
  ), skip_reasons as (
    select coalesce(reason_code, 'unknown') as reason, reason_category,
      count(distinct lead_hash)::bigint as people,
      count(*)::bigint as observations,
      greatest(count(*) - count(distinct lead_hash), 0)::bigint as repeats
    from ranged where status = 'skipped'
    group by 1, 2 order by count(distinct lead_hash) desc, 1
  ), phases as (
    select coalesce(phase_key, 'UNKNOWN') as phase, status,
      count(distinct lead_hash)::bigint as people, count(*)::bigint as observations
    from ranged where status in ('sent', 'skipped', 'resumed')
    group by 1, 2 order by 1, 2
  ), registered as (
    select s.*,
      (select max(coalesce(r.finished_at, r.started_at)) from public.nurture_runs r
       where r.project_key = s.project_key and r.sequence_key = s.sequence_key) as last_run_at,
      (select r.status from public.nurture_runs r
       where r.project_key = s.project_key and r.sequence_key = s.sequence_key
       order by coalesce(r.finished_at, r.started_at) desc limit 1) as last_run_status
    from public.nurture_sequences s
    where s.active
      and (p_project_key is null or s.project_key = p_project_key)
      and (p_sequence_key is null or s.sequence_key = p_sequence_key)
  )
  select jsonb_build_object(
    'range', jsonb_build_object('since', p_since, 'until', p_until),
    'people_funnel', jsonb_build_object(
      'recipients', (select count(*) from sent_people),
      'returners', (select count(*) from returned_people),
      'continuers', (select count(*) from continued_people),
      'return_rate', coalesce(round(100.0 * (select count(*) from returned_people) / nullif((select count(*) from sent_people), 0), 1), 0),
      'continuation_rate', coalesce(round(100.0 * (select count(*) from continued_people) / nullif((select count(*) from sent_people), 0), 1), 0),
      'return_to_continuation_rate', coalesce(round(100.0 * (select count(*) from continued_people) / nullif((select count(*) from returned_people), 0), 1), 0)
    ),
    'activity', jsonb_build_object(
      'send_events', (select count(*) from sent_events),
      'return_click_events', (select count(*) from attributed_returns),
      'continuation_events', (select count(*) from attributed_continuations),
      'skip_observations', (select count(*) from ranged where status = 'skipped'),
      'failure_events', (select count(*) from ranged where status = 'failed')
    ),
    'kpis', jsonb_build_object(
      'total_people', (select count(*) from sent_people),
      'sent_people', (select count(*) from sent_people),
      'returned_people', (select count(*) from returned_people),
      'continued_people', (select count(*) from continued_people),
      'skipped_people', (select count(distinct lead_hash) from ranged where status = 'skipped'),
      'sent', (select count(*) from sent_events),
      'skipped', (select count(distinct lead_hash) from ranged where status = 'skipped'),
      'resumed', (select count(*) from returned_people),
      'failed', (select count(*) from ranged where status = 'failed')
    ),
    'freshness', jsonb_build_object(
      'latest_event_at', (select max(occurred_at) from ranged),
      'latest_sent_at', (select max(occurred_at) from sent_events),
      'latest_resume_at', (select max(occurred_at) from attributed_returns)
    ),
    'skip_reasons', coalesce((select jsonb_agg(jsonb_build_object(
      'reason', reason, 'category', reason_category, 'count', people,
      'people', people, 'observations', observations, 'repeats', repeats
    ) order by people desc, reason) from skip_reasons), '[]'::jsonb),
    'phases', coalesce((select jsonb_agg(jsonb_build_object(
      'phase', phase, 'status', status, 'count', people,
      'people', people, 'observations', observations
    ) order by phase, status) from phases), '[]'::jsonb),
    'sequences', coalesce((select jsonb_agg(jsonb_build_object(
      'projectKey', project_key, 'sequenceKey', sequence_key,
      'projectLabel', project_label, 'sequenceLabel', sequence_label,
      'channel', channel, 'workflowId', workflow_id,
      'expectedIntervalMinutes', expected_interval_minutes,
      'telemetryVersion', telemetry_version,
      'lastRunAt', last_run_at, 'lastRunStatus', last_run_status
    ) order by project_label, sequence_label) from registered), '[]'::jsonb)
  );
$function$
;

CREATE OR REPLACE FUNCTION public.nurture_people_page(p_since timestamp with time zone, p_until timestamp with time zone, p_project_key text DEFAULT NULL::text, p_sequence_key text DEFAULT NULL::text, p_journey text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_cursor_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor_ref text DEFAULT NULL::text)
 RETURNS TABLE(subject_ref text, journey_state text, send_count bigint, first_sent_at timestamp with time zone, last_sent_at timestamp with time zone, return_count bigint, first_returned_at timestamp with time zone, last_returned_at timestamp with time zone, continuation_count bigint, first_continued_at timestamp with time zone, last_continued_at timestamp with time zone, phases text[], last_activity_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with normalized as (
    select
      coalesce(e.event_uid, e.event_id::text) as event_uid,
      coalesce(e.event_at, e.created_at) as occurred_at,
      e.lead_hash,
      coalesce(e.payload->>'project_key', 'business_leads_quiz') as project_key,
      coalesce(e.payload->>'sequence_key', 'video_nurture') as sequence_key,
      e.event_name as event_type,
      nullif(upper(coalesce(e.payload->>'phase', e.payload->>'acn_phase')), '') as phase_key
    from public.lead_events e
    where e.event_name in (
      'nurture_sent', 'nurture_resume_opened',
      'video_unlocked', 'video_completed', 'video_continue_click', 'cta_clicked', 'result_cta_click'
    )
      and e.lead_hash is not null
      and coalesce(e.event_at, e.created_at) < p_until
  ), filtered as (
    select * from normalized
    where (p_project_key is null or project_key = p_project_key)
      and (p_sequence_key is null or sequence_key = p_sequence_key)
  ), sent_events as (
    select * from filtered
    where event_type = 'nurture_sent' and occurred_at >= p_since
  ), sent_people as (
    select project_key, sequence_key, lead_hash,
      count(*)::bigint as send_count,
      min(occurred_at) as first_sent_at,
      max(occurred_at) as last_sent_at,
      array_remove(array_agg(distinct phase_key order by phase_key), null) as phases
    from sent_events group by 1, 2, 3
  ), returns_ranked as (
    select r.event_uid, r.occurred_at, r.project_key, r.sequence_key, r.lead_hash,
      s.occurred_at as sent_at,
      row_number() over (partition by r.event_uid order by s.occurred_at desc, s.event_uid desc) as attribution_rank
    from filtered r
    join sent_events s on s.project_key = r.project_key
      and s.sequence_key = r.sequence_key and s.lead_hash = r.lead_hash
      and r.occurred_at >= s.occurred_at
      and r.occurred_at <= s.occurred_at + interval '7 days'
    where r.event_type = 'nurture_resume_opened'
  ), attributed_returns as (
    select * from returns_ranked where attribution_rank = 1
  ), return_people as (
    select project_key, sequence_key, lead_hash,
      count(*)::bigint as return_count,
      min(occurred_at) as first_returned_at,
      max(occurred_at) as last_returned_at
    from attributed_returns group by 1, 2, 3
  ), continuations_ranked as (
    select c.event_uid, c.occurred_at, c.project_key, c.sequence_key, c.lead_hash,
      row_number() over (partition by c.event_uid order by r.occurred_at desc, r.event_uid desc) as attribution_rank
    from filtered c
    join attributed_returns r on r.project_key = c.project_key
      and r.sequence_key = c.sequence_key and r.lead_hash = c.lead_hash
      and c.occurred_at >= r.occurred_at
      and c.occurred_at <= r.sent_at + interval '7 days'
    where c.event_type in ('video_unlocked', 'video_completed', 'video_continue_click', 'cta_clicked', 'result_cta_click')
  ), attributed_continuations as (
    select * from continuations_ranked where attribution_rank = 1
  ), continuation_people as (
    select project_key, sequence_key, lead_hash,
      count(*)::bigint as continuation_count,
      min(occurred_at) as first_continued_at,
      max(occurred_at) as last_continued_at
    from attributed_continuations group by 1, 2, 3
  ), journeys as (
    select
      left(s.lead_hash, 14) as subject_ref,
      case when c.lead_hash is not null then 'continued'
        when r.lead_hash is not null then 'returned' else 'sent' end as journey_state,
      s.send_count, s.first_sent_at, s.last_sent_at,
      coalesce(r.return_count, 0)::bigint as return_count,
      r.first_returned_at, r.last_returned_at,
      coalesce(c.continuation_count, 0)::bigint as continuation_count,
      c.first_continued_at, c.last_continued_at,
      s.phases,
      greatest(s.last_sent_at, coalesce(r.last_returned_at, s.last_sent_at), coalesce(c.last_continued_at, s.last_sent_at)) as last_activity_at
    from sent_people s
    left join return_people r using (project_key, sequence_key, lead_hash)
    left join continuation_people c using (project_key, sequence_key, lead_hash)
  )
  select j.* from journeys j
  where (p_journey is null or j.journey_state = p_journey)
    and (p_cursor_at is null or (j.last_activity_at, j.subject_ref) < (p_cursor_at, p_cursor_ref))
  order by j.last_activity_at desc, j.subject_ref desc
  limit greatest(1, least(coalesce(p_limit, 50), 100));
$function$
;

CREATE OR REPLACE FUNCTION public.record_nurture_failure(p_project_key text, p_sequence_key text, p_workflow_id text, p_workflow_version_id text, p_execution_id text, p_error_code text, p_error_node text, p_error_message text, p_occurred_at timestamp with time zone DEFAULT now())
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_event_uid text;
begin
  v_event_uid := 'nurture_error:' || p_workflow_id || ':' || p_execution_id;

  insert into public.lead_events (
    event_uid, lead_hash, event_name, event_at, source_app, funnel_key, payload, created_at
  ) values (
    v_event_uid, null, 'nurture_error', coalesce(p_occurred_at, now()), 'n8n', p_project_key,
    jsonb_build_object(
      'project_key', p_project_key,
      'sequence_key', p_sequence_key,
      'workflow_id', p_workflow_id,
      'workflow_version_id', p_workflow_version_id,
      'execution_id', p_execution_id,
      'error_code', left(coalesce(p_error_code, 'workflow_failed'), 120),
      'error_node', left(coalesce(p_error_node, 'unknown'), 160),
      'message', left(coalesce(p_error_message, 'Workflow failed'), 500),
      'telemetry_version', 1
    ),
    now()
  )
  on conflict (event_uid) do nothing;

  perform public.record_nurture_run(
    p_project_key, p_sequence_key, p_execution_id, 'failed', coalesce(p_occurred_at, now()),
    coalesce(p_occurred_at, now()), p_workflow_id, p_workflow_version_id,
    0, 0, 0, 1, left(coalesce(p_error_code, 'workflow_failed'), 120),
    left(coalesce(p_error_node, 'unknown'), 160), 1
  );
  return v_event_uid;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.record_nurture_run(p_project_key text, p_sequence_key text, p_execution_id text, p_status text, p_started_at timestamp with time zone, p_finished_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_workflow_id text DEFAULT NULL::text, p_workflow_version_id text DEFAULT NULL::text, p_candidates_checked integer DEFAULT 0, p_sent_count integer DEFAULT 0, p_skipped_count integer DEFAULT 0, p_failed_count integer DEFAULT 0, p_error_code text DEFAULT NULL::text, p_error_node text DEFAULT NULL::text, p_telemetry_version integer DEFAULT 1)
 RETURNS nurture_runs
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_run public.nurture_runs;
begin
  if p_status not in ('running', 'success', 'failed') then
    raise exception 'invalid_nurture_run_status';
  end if;

  insert into public.nurture_runs (
    project_key, sequence_key, execution_id, workflow_id, workflow_version_id,
    started_at, finished_at, status, candidates_checked, sent_count,
    skipped_count, failed_count, error_code, error_node, telemetry_version
  ) values (
    p_project_key, p_sequence_key, p_execution_id, p_workflow_id, p_workflow_version_id,
    p_started_at, p_finished_at, p_status, greatest(coalesce(p_candidates_checked, 0), 0),
    greatest(coalesce(p_sent_count, 0), 0), greatest(coalesce(p_skipped_count, 0), 0),
    greatest(coalesce(p_failed_count, 0), 0), left(p_error_code, 120),
    left(p_error_node, 160), greatest(coalesce(p_telemetry_version, 1), 1)
  )
  on conflict (project_key, sequence_key, execution_id) do update set
    workflow_id = coalesce(excluded.workflow_id, public.nurture_runs.workflow_id),
    workflow_version_id = coalesce(excluded.workflow_version_id, public.nurture_runs.workflow_version_id),
    started_at = least(public.nurture_runs.started_at, excluded.started_at),
    finished_at = coalesce(excluded.finished_at, public.nurture_runs.finished_at),
    status = excluded.status,
    candidates_checked = excluded.candidates_checked,
    sent_count = excluded.sent_count,
    skipped_count = excluded.skipped_count,
    failed_count = excluded.failed_count,
    error_code = excluded.error_code,
    error_node = excluded.error_node,
    telemetry_version = excluded.telemetry_version,
    updated_at = now()
  returning * into v_run;
  return v_run;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.record_nurture_sent(p_project_key text, p_sequence_key text, p_event_uid text, p_lead_hash text, p_phase_key text, p_email_id text DEFAULT NULL::text, p_subject text DEFAULT NULL::text, p_language text DEFAULT NULL::text, p_variant text DEFAULT NULL::text, p_mautic_contact_id text DEFAULT NULL::text, p_occurred_at timestamp with time zone DEFAULT now(), p_telemetry_version integer DEFAULT 2)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_at timestamptz := coalesce(p_occurred_at, now());
  v_phase text := nullif(lower(trim(p_phase_key)), '');
begin
  if p_event_uid is null or length(trim(p_event_uid)) < 3 then
    raise exception 'invalid_nurture_event_uid';
  end if;
  if p_lead_hash is null or length(trim(p_lead_hash)) < 3 then
    raise exception 'invalid_nurture_lead_hash';
  end if;

  insert into public.lead_events (
    event_uid, lead_hash, event_name, event_at, source_app, funnel_key, payload, created_at
  ) values (
    p_event_uid, p_lead_hash, 'nurture_sent', v_at, 'business_leads_quiz', 'business',
    jsonb_strip_nulls(jsonb_build_object(
      'project_key', p_project_key,
      'sequence_key', p_sequence_key,
      'phase', v_phase,
      'email_id', nullif(trim(p_email_id), ''),
      'subject', nullif(p_subject, ''),
      'email_subject', nullif(p_subject, ''),
      'language', nullif(lower(trim(p_language)), ''),
      'variant', nullif(p_variant, ''),
      'source', 'mautic',
      'mautic_contact_id', nullif(trim(p_mautic_contact_id), ''),
      'telemetry_version', greatest(coalesce(p_telemetry_version, 2), 1)
    )),
    now()
  )
  on conflict (event_uid) do nothing;

  insert into public.nurture_subject_states (
    project_key, sequence_key, lead_hash, status, reason_code, phase_key,
    first_seen_at, last_seen_at, status_changed_at, occurrence_count,
    last_event_uid, telemetry_version
  ) values (
    p_project_key, p_sequence_key, p_lead_hash, 'sent', null, upper(v_phase),
    v_at, v_at, v_at, 1, p_event_uid, greatest(coalesce(p_telemetry_version, 2), 1)
  )
  on conflict (project_key, sequence_key, lead_hash) do update set
    status = 'sent', reason_code = null, phase_key = excluded.phase_key,
    first_seen_at = case when public.nurture_subject_states.status = 'sent'
      then public.nurture_subject_states.first_seen_at else excluded.first_seen_at end,
    last_seen_at = greatest(public.nurture_subject_states.last_seen_at, excluded.last_seen_at),
    status_changed_at = case when public.nurture_subject_states.status = 'sent'
      then public.nurture_subject_states.status_changed_at else excluded.status_changed_at end,
    occurrence_count = case when public.nurture_subject_states.status = 'sent'
      then public.nurture_subject_states.occurrence_count + 1 else 1 end,
    last_event_uid = excluded.last_event_uid,
    telemetry_version = excluded.telemetry_version,
    updated_at = now();

  return p_event_uid;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.record_nurture_skip(p_project_key text, p_sequence_key text, p_lead_hash text, p_reason_code text, p_phase_key text DEFAULT NULL::text, p_occurred_at timestamp with time zone DEFAULT now(), p_telemetry_version integer DEFAULT 2)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_existing public.nurture_subject_states;
  v_state public.nurture_subject_states;
  v_state_changed boolean;
  v_at timestamptz := coalesce(p_occurred_at, now());
  v_reason text := left(coalesce(nullif(trim(p_reason_code), ''), 'unknown'), 160);
  v_phase text := nullif(upper(trim(p_phase_key)), '');
  v_event_uid text;
begin
  if p_lead_hash is null or length(trim(p_lead_hash)) < 3 then
    raise exception 'invalid_nurture_lead_hash';
  end if;

  select * into v_existing
  from public.nurture_subject_states
  where project_key = p_project_key
    and sequence_key = p_sequence_key
    and lead_hash = p_lead_hash
  for update;

  v_state_changed := not found
    or v_existing.status <> 'skipped'
    or v_existing.reason_code is distinct from v_reason
    or v_existing.phase_key is distinct from v_phase;

  v_event_uid := 'nurture_skip_state:' || left(md5(
    p_project_key || ':' || p_sequence_key || ':' || p_lead_hash || ':' || v_reason || ':' ||
    coalesce(v_phase, '') || ':' || v_at::text
  ), 32);

  insert into public.nurture_subject_states (
    project_key, sequence_key, lead_hash, status, reason_code, phase_key,
    first_seen_at, last_seen_at, status_changed_at, occurrence_count,
    last_event_uid, telemetry_version
  ) values (
    p_project_key, p_sequence_key, p_lead_hash, 'skipped', v_reason, v_phase,
    v_at, v_at, v_at, 1, v_event_uid, greatest(coalesce(p_telemetry_version, 2), 1)
  )
  on conflict (project_key, sequence_key, lead_hash) do update set
    status = excluded.status,
    reason_code = excluded.reason_code,
    phase_key = excluded.phase_key,
    first_seen_at = case
      when public.nurture_subject_states.status = excluded.status
        and public.nurture_subject_states.reason_code is not distinct from excluded.reason_code
        and public.nurture_subject_states.phase_key is not distinct from excluded.phase_key
      then public.nurture_subject_states.first_seen_at else excluded.first_seen_at end,
    last_seen_at = greatest(public.nurture_subject_states.last_seen_at, excluded.last_seen_at),
    status_changed_at = case
      when public.nurture_subject_states.status = excluded.status
        and public.nurture_subject_states.reason_code is not distinct from excluded.reason_code
        and public.nurture_subject_states.phase_key is not distinct from excluded.phase_key
      then public.nurture_subject_states.status_changed_at else excluded.status_changed_at end,
    occurrence_count = case
      when public.nurture_subject_states.status = excluded.status
        and public.nurture_subject_states.reason_code is not distinct from excluded.reason_code
        and public.nurture_subject_states.phase_key is not distinct from excluded.phase_key
      then public.nurture_subject_states.occurrence_count + 1 else 1 end,
    last_event_uid = case when v_state_changed then excluded.last_event_uid else public.nurture_subject_states.last_event_uid end,
    telemetry_version = excluded.telemetry_version,
    updated_at = now()
  returning * into v_state;

  if v_state_changed then
    insert into public.lead_events (
      event_uid, lead_hash, event_name, event_at, source_app, funnel_key, payload, created_at
    ) values (
      v_event_uid, p_lead_hash, 'nurture_skipped', v_at, 'business_leads_quiz', 'business',
      jsonb_build_object(
        'project_key', p_project_key,
        'sequence_key', p_sequence_key,
        'reason', v_reason,
        'phase', v_phase,
        'state_transition', true,
        'telemetry_version', greatest(coalesce(p_telemetry_version, 2), 1)
      ),
      now()
    )
    on conflict (event_uid) do nothing;
  end if;

  return jsonb_build_object(
    'state_changed', v_state_changed,
    'event_uid', case when v_state_changed then v_event_uid else null end,
    'occurrence_count', v_state.occurrence_count,
    'status', v_state.status,
    'reason_code', v_state.reason_code
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.submit_lead_complete(p_state jsonb, p_answers jsonb DEFAULT '[]'::jsonb, p_lang text DEFAULT NULL::text, p_answered_at timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_lead_hash text := p_state->>'lead_hash';
  v_unknown text[];
  v_insert_cols text;
  v_select_cols text;
  v_update_set text;
  v_answer jsonb;
  v_written int := 0;
BEGIN
  IF v_lead_hash IS NULL OR v_lead_hash !~ '^qz_[a-zA-Z0-9_]+$' THEN
    RAISE EXCEPTION 'lead_hash_required';
  END IF;

  -- Unbekannte Schluessel sind ein LAUTER Fehler - exakt wie beim bisherigen
  -- PostgREST-Upsert. Stilles Verwerfen wuerde Drift zwischen Code und Schema verstecken.
  SELECT array_agg(t.k) INTO v_unknown
  FROM jsonb_object_keys(p_state) AS t(k)
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.table_name = 'lead_state' AND c.column_name = t.k
  );
  IF v_unknown IS NOT NULL THEN
    RAISE EXCEPTION 'unknown_lead_state_columns: %', array_to_string(v_unknown, ', ');
  END IF;

  -- merge-duplicates-Semantik wie bisher: genau die MITGELIEFERTEN Schluessel schreiben
  -- (auch ein mitgeliefertes null ueberschreibt), alle anderen Spalten bleiben unberuehrt.
  SELECT
    string_agg(format('%I', c.column_name), ', ' ORDER BY c.ordinal_position),
    string_agg(format('r.%I', c.column_name), ', ' ORDER BY c.ordinal_position),
    string_agg(format('%I = EXCLUDED.%I', c.column_name, c.column_name), ', '
      ORDER BY c.ordinal_position) FILTER (WHERE c.column_name <> 'lead_hash')
  INTO v_insert_cols, v_select_cols, v_update_set
  FROM information_schema.columns c
  WHERE c.table_schema = 'public' AND c.table_name = 'lead_state'
    AND p_state ? c.column_name;

  EXECUTE format(
    'INSERT INTO public.lead_state (%s) '
    || 'SELECT %s FROM jsonb_populate_record(NULL::public.lead_state, $1) AS r '
    || 'ON CONFLICT (lead_hash) DO UPDATE SET %s',
    v_insert_cols, v_select_cols, coalesce(v_update_set, 'lead_hash = EXCLUDED.lead_hash')
  ) USING p_state;

  -- Antworten ueber die bestehende, idempotente Fassung (Unique lead_hash+question_ref) -
  -- ein zweiter Schreibweg waere eine zweite Wahrheit. Alles im selben Transaktionsklammer:
  -- scheitert eine Antwort, wird auch der lead_state-Upsert zurueckgerollt.
  FOR v_answer IN SELECT value FROM jsonb_array_elements(coalesce(p_answers, '[]'::jsonb)) LOOP
    PERFORM public.upsert_answer_current(
      v_lead_hash,
      v_answer->>'question_ref',
      NULLIF(v_answer->>'question_index', '')::int,
      NULL,
      v_answer->>'answer_ref',
      v_answer->>'answer_text',
      v_answer->>'answer_value',
      '{}'::jsonb,
      p_lang,
      p_answered_at
    );
    v_written := v_written + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'persisted', true,
    'lead_hash', v_lead_hash,
    'answers_written', v_written
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.upsert_answer_current(p_lead_hash text, p_question_ref text, p_question_index integer DEFAULT NULL::integer, p_question_text text DEFAULT NULL::text, p_answer_ref text DEFAULT NULL::text, p_answer_text text DEFAULT NULL::text, p_answer_value text DEFAULT NULL::text, p_profile_delta jsonb DEFAULT '{}'::jsonb, p_lang text DEFAULT NULL::text, p_answered_at timestamp with time zone DEFAULT now())
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.upsert_video_progress_monotonic(p_lead_hash text, p_video_step integer, p_video_id text DEFAULT NULL::text, p_unique_watched_percent numeric DEFAULT 0, p_playhead_percent numeric DEFAULT 0, p_unique_watched_seconds integer DEFAULT 0, p_event_at timestamp with time zone DEFAULT now(), p_lang text DEFAULT NULL::text)
 RETURNS TABLE(completed_rank integer, rank_changed boolean)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
;

-- Views.
CREATE VIEW public.v_nurture_runs_wahr AS
SELECT id,
    project_key,
    sequence_key,
    execution_id,
    status,
    started_at AS protokolliert_am,
    candidates_checked,
    ( SELECT count(*) AS count
           FROM lead_events e
          WHERE e.event_name = 'nurture_sent'::text AND (e.payload ->> 'project_key'::text) = r.project_key AND e.event_at >= r.started_at AND e.event_at < COALESCE(( SELECT min(r2.started_at) AS min
                   FROM nurture_runs r2
                  WHERE r2.project_key = r.project_key AND r2.started_at > r.started_at), now() + '00:01:00'::interval)) AS gesendet_wahr,
    sent_count AS gesendet_gemeldet
   FROM nurture_runs r;

CREATE VIEW public.v_sync_dead_jobs AS
SELECT id,
    lead_hash,
    sync_type,
    context_data,
    status,
    attempts,
    max_attempts,
    last_error,
    next_attempt_at,
    locked_at,
    locked_by,
    processed_at,
    dead_at,
    created_at,
    updated_at,
    response_data
   FROM lead_sync_outbox
  WHERE status = 'dead'::text
  ORDER BY dead_at DESC;

CREATE VIEW public.v_funnel_analysis AS
SELECT berater_slug,
    count(*) AS step_1_starts,
    count(
        CASE
            WHEN current_event::text <> 'quiz_started'::text THEN 1
            ELSE NULL::integer
        END) AS step_2_questions,
    count(
        CASE
            WHEN form_email IS NOT NULL THEN 1
            ELSE NULL::integer
        END) AS step_form_submits,
    count(
        CASE
            WHEN current_event::text = 'quiz_completed'::text THEN 1
            ELSE NULL::integer
        END) AS completions,
    round(100.0 * count(
        CASE
            WHEN current_event::text = 'quiz_completed'::text THEN 1
            ELSE NULL::integer
        END)::numeric / NULLIF(count(*), 0)::numeric, 1) AS completion_rate_pct
   FROM tracking_sessions
  GROUP BY berater_slug;

CREATE VIEW public.v_resume_metrics AS
SELECT berater_slug,
    count(
        CASE
            WHEN is_resume = true THEN 1
            ELSE NULL::integer
        END) AS total_resume_sessions,
    count(
        CASE
            WHEN is_resume = true AND current_event::text = 'quiz_completed'::text THEN 1
            ELSE NULL::integer
        END) AS resume_completions,
    round(100.0 * count(
        CASE
            WHEN is_resume = true AND current_event::text = 'quiz_completed'::text THEN 1
            ELSE NULL::integer
        END)::numeric / NULLIF(count(
        CASE
            WHEN is_resume = true THEN 1
            ELSE NULL::integer
        END), 0)::numeric, 1) AS resume_completion_rate_pct
   FROM tracking_sessions
  GROUP BY berater_slug;

CREATE VIEW public.v_completion_metrics AS
SELECT berater_slug,
    count(*) AS total_starts,
    count(
        CASE
            WHEN current_event::text = 'quiz_completed'::text THEN 1
            ELSE NULL::integer
        END) AS total_completions,
    round(100.0 * count(
        CASE
            WHEN current_event::text = 'quiz_completed'::text THEN 1
            ELSE NULL::integer
        END)::numeric / NULLIF(count(*), 0)::numeric, 1) AS completion_rate_pct
   FROM tracking_sessions
  GROUP BY berater_slug;

CREATE VIEW public.v_lead_state_full AS
SELECT ls.lead_hash,
    ls.client_seed,
    ls.member_id,
    ls.ref_id,
    ls.ref_type,
    ls.berater_slug,
    ls.source_app,
    ls.funnel_key,
    ls.lang,
    ls.country,
    ls.utm_source,
    ls.utm_medium,
    ls.utm_campaign,
    ls.first_seen_at,
    ls.last_seen_at,
    ls.last_event_at,
    ls.first_name,
    ls.email,
    ls.email_normalized,
    ls.email_hash,
    ls.phone,
    ls.form_submitted_at,
    ls.profile_code,
    ls.profile_label,
    ls.main_aspiration,
    ls.main_aspiration_label,
    ls.initial_barrier,
    ls.lifecycle_stage,
    ls.next_step,
    ls.cta_type,
    ls.cta_clicked_at,
    ls.mysql_survey_id,
    ls.mautic_contact_id,
    ls.sync_status,
    ls.tracking_missing,
    ls.migration_source,
    ls.migration_flags,
    ls.created_at,
    ls.updated_at,
    COALESCE(v1.max_unique_watched_percent, 0::numeric) AS video1_max_pct,
    COALESCE(v1.unique_watched_seconds, 0) AS video1_watched_sec,
    v1.completed_at AS video1_completed_at,
    COALESCE(v2.max_unique_watched_percent, 0::numeric) AS video2_max_pct,
    COALESCE(v2.unique_watched_seconds, 0) AS video2_watched_sec,
    v2.completed_at AS video2_completed_at,
    COALESCE(v3.max_unique_watched_percent, 0::numeric) AS video3_max_pct,
    COALESCE(v3.unique_watched_seconds, 0) AS video3_watched_sec,
    v3.completed_at AS video3_completed_at,
        CASE
            WHEN COALESCE(v3.max_unique_watched_percent, 0::numeric) >= 95::numeric THEN 3
            WHEN COALESCE(v2.max_unique_watched_percent, 0::numeric) >= 95::numeric THEN 2
            WHEN COALESCE(v1.max_unique_watched_percent, 0::numeric) >= 95::numeric THEN 1
            ELSE 0
        END AS completed_rank,
    ls.organisation_id,
    ls.utm_content,
    ls.fbclid,
    ls.fbc,
    ls.fbp,
    ls.event_source_url,
    ls.utm_campaign_id,
    ls.utm_adset_id,
    ls.utm_ad_id,
    ls.utm_term
   FROM lead_state ls
     LEFT JOIN lead_video_progress v1 ON v1.lead_hash = ls.lead_hash AND v1.video_step = 1
     LEFT JOIN lead_video_progress v2 ON v2.lead_hash = ls.lead_hash AND v2.video_step = 2
     LEFT JOIN lead_video_progress v3 ON v3.lead_hash = ls.lead_hash AND v3.video_step = 3;

-- Trigger.
CREATE TRIGGER trg_lead_answers_current_updated_at BEFORE UPDATE ON public.lead_answers_current FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_lead_migration_unresolved_updated_at BEFORE UPDATE ON public.lead_migration_unresolved FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_lead_state_updated_at BEFORE UPDATE ON public.lead_state FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_lead_sync_outbox_updated_at BEFORE UPDATE ON public.lead_sync_outbox FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_lead_video_progress_updated_at BEFORE UPDATE ON public.lead_video_progress FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;
