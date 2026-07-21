#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const projectRoot = path.resolve(__dirname, '..');
const env = loadEnvFile(path.join(projectRoot, '.env.prod'));

// Kein Fallback auf eine feste Projekt-URL (Markus, 21.07.2026) - siehe api/bridge.js.
const SUPABASE_URL = String(process.env.SUPABASE_URL || env.SUPABASE_URL || '').trim();
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_KEY;
const MYSQL_WEBHOOK =
  process.env.TYPEFORM_SURVEY_SYNC_URL ||
  'https://n8n.hl-support.biz/webhook/survey_sync?survey_id=12&limit=1000';
const APPLY = process.env.APPLY_LEAD_MIGRATION === '1';
const REPORT_PATH =
  process.env.LEAD_MIGRATION_REPORT ||
  path.join('d:', 'tmp', `lead_system_v2_migration_${APPLY ? 'apply' : 'dry'}_report.json`);

if (!SUPABASE_KEY) {
  throw new Error('Missing SUPABASE_SERVICE_KEY');
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index < 1) continue;
    const key = trimmed.slice(0, index);
    const value = trimmed.slice(index + 1).replace(/^['"]|['"]$/g, '');
    out[key] = value;
  }
  return out;
}

function safeString(value, max = 255) {
  if (value === null || value === undefined) return '';
  return String(value).trim().slice(0, max);
}

function asIso(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function asInt(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : fallback;
}

function isLeadHash(value) {
  return /^qz_[a-zA-Z0-9_]{8,96}$/.test(String(value || ''));
}

function isSessionHash(value) {
  return /^ac_[a-zA-Z0-9_]{8,96}$/.test(String(value || ''));
}

function normalizeEmail(email) {
  return safeString(email, 180).toLowerCase();
}

function hashEmail(email) {
  const normalized = normalizeEmail(email);
  return normalized ? crypto.createHash('sha256').update(normalized).digest('hex') : null;
}

function normalizeLang(...values) {
  for (const value of values) {
    const lang = safeString(value, 10).toLowerCase().slice(0, 2);
    if (['de', 'it', 'en', 'fr', 'ru', 'hu'].includes(lang)) return lang;
  }
  return 'de';
}

function rankFromLabel(value) {
  const text = safeString(value, 255).toLowerCase();
  if (!text) return null;
  if (text.includes('3/3') || text.includes('alle 3') || text.includes('all 3')) return 3;
  if (text.includes('2/3')) return 2;
  if (text.includes('1/3')) return 1;
  if (text.includes('kein') || text.includes('no information') || text.includes('nessun')) return 0;
  return null;
}

async function supabase(pathName, options = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${pathName}`, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      ...(options.headers || {}),
    },
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Supabase ${pathName} failed: ${response.status} ${text}`);
  }
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function fetchAll(table, select = '*') {
  const pageSize = 1000;
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    const page = await supabase(
      `${table}?select=${encodeURIComponent(select)}&limit=${pageSize}&offset=${offset}&order=id.asc`
    );
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

async function upsertBatch(table, rows, onConflict, batchSize = 500) {
  if (!APPLY || rows.length === 0) return;
  for (let index = 0; index < rows.length; index += batchSize) {
    const rawBatch = rows.slice(index, index + batchSize);
    const keys = [...rawBatch.reduce((set, row) => {
      Object.keys(row).forEach((key) => set.add(key));
      return set;
    }, new Set())];
    const batch = rawBatch.map((row) => {
      const normalized = {};
      for (const key of keys) normalized[key] = row[key] === undefined ? null : row[key];
      return normalized;
    });
    await supabase(`${table}?on_conflict=${encodeURIComponent(onConflict)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(batch),
    });
  }
}

async function fetchMysqlRows() {
  const response = await fetch(MYSQL_WEBHOOK);
  if (!response.ok) {
    throw new Error(`MySQL webhook failed: ${response.status}`);
  }
  const data = await response.json();
  return Array.isArray(data.rows) ? data.rows : [];
}

function first(...values) {
  for (const value of values) {
    if (value !== null && value !== undefined && String(value).trim() !== '') return value;
  }
  return null;
}

function mergeState(existing, patch) {
  const next = { ...existing };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null || value === undefined || value === '') continue;
    if (next[key] === null || next[key] === undefined || next[key] === '') {
      next[key] = value;
    }
  }
  next.migration_flags = {
    ...(next.migration_flags || {}),
    ...(patch.migration_flags || {}),
  };
  return next;
}

function collectLeadHashes({ mysqlRows, quizSessions, trackingSessions, trackingProgress, trackingEvents }) {
  const hashes = new Set();
  for (const row of mysqlRows) if (isLeadHash(row.hash)) hashes.add(row.hash);
  for (const row of quizSessions) if (isLeadHash(row.hash)) hashes.add(row.hash);
  for (const row of trackingSessions) if (isLeadHash(row.lead_hash)) hashes.add(row.lead_hash);
  for (const row of trackingProgress) if (isLeadHash(row.lead_hash)) hashes.add(row.lead_hash);
  for (const row of trackingEvents) if (isLeadHash(row.lead_hash)) hashes.add(row.lead_hash);
  return hashes;
}

function buildSessionMap(trackingSessions) {
  const map = new Map();
  const conflicts = [];
  for (const row of trackingSessions) {
    if (!isSessionHash(row.session_hash) || !isLeadHash(row.lead_hash)) continue;
    const existing = map.get(row.session_hash);
    if (existing && existing !== row.lead_hash) {
      conflicts.push({
        type: 'session_hash_multiple_leads',
        session_hash: row.session_hash,
        lead_hashes: [existing, row.lead_hash],
      });
      continue;
    }
    map.set(row.session_hash, row.lead_hash);
  }
  return { map, conflicts };
}

function resolveLeadHash(row, sessionMap) {
  if (isLeadHash(row.lead_hash)) return row.lead_hash;
  if (isLeadHash(row.hash)) return row.hash;
  if (isSessionHash(row.session_hash) && sessionMap.has(row.session_hash)) {
    return sessionMap.get(row.session_hash);
  }
  return '';
}

function buildLeadStates(sources, sessionMap) {
  const { mysqlRows, quizSessions, trackingSessions, trackingProgress, trackingEvents } = sources;
  const states = new Map();
  const conflicts = [];
  const hashes = collectLeadHashes(sources);

  function ensure(hash) {
    const existing = states.get(hash);
    if (existing) return existing;
    const state = {
      lead_hash: hash,
      source_app: 'business_leads_quiz',
      funnel_key: 'business',
      lifecycle_stage: 'migrated',
      sync_status: 'pending',
      tracking_missing: false,
      migration_source: '',
      migration_flags: {},
    };
    states.set(hash, state);
    return state;
  }

  for (const hash of hashes) ensure(hash);

  for (const row of mysqlRows) {
    if (!isLeadHash(row.hash)) continue;
    const memberId = safeString(row.ref_id, 120) || null;
    const patch = {
      mysql_survey_id: row.id ? Number(row.id) : null,
      member_id: memberId,
      ref_id: memberId,
      ref_type: 'member',
      lang: normalizeLang(row.locale),
      form_submitted_at: asIso(row.submitted_at),
      first_seen_at: asIso(row.submitted_at),
      last_seen_at: asIso(row.submitted_at),
      last_event_at: asIso(row.submitted_at),
      migration_source: 'mysql',
      migration_flags: {
        mysql_points_result: row.points_result || null,
        mysql_rank: rankFromLabel(row.points_result),
      },
    };
    states.set(row.hash, mergeState(ensure(row.hash), patch));
  }

  for (const row of quizSessions) {
    if (!isLeadHash(row.hash)) continue;
    const memberId = safeString(row.herbalife_id, 120) || null;
    const patch = {
      member_id: memberId,
      ref_id: memberId,
      ref_type: 'member',
      berater_slug: safeString(row.berater_slug, 80) || null,
      lang: normalizeLang(row.lang),
      country: safeString(row.country, 5) || null,
      first_seen_at: asIso(row.visited_at || row.created_at),
      last_seen_at: asIso(row.updated_at || row.visited_at),
      last_event_at: asIso(row.updated_at || row.quiz_completed_at || row.visited_at),
      first_name: safeString(row.form_first_name, 120) || null,
      email: safeString(row.form_email, 180) || null,
      email_normalized: normalizeEmail(row.form_email) || null,
      email_hash: hashEmail(row.form_email),
      form_submitted_at: asIso(row.form_submitted_at),
      profile_code: safeString(row.quiz_profile, 80) || null,
      profile_label: safeString(row.quiz_profile_name, 180) || null,
      main_aspiration: safeString(row.quiz_aspiration, 120) || null,
      initial_barrier: safeString(row.quiz_barrier, 180) || null,
      cta_type: safeString(row.cta_type, 80) || null,
      cta_clicked_at: asIso(row.cta_clicked_at),
      migration_source: 'mysql_supabase_quiz_sessions',
      migration_flags: { has_quiz_sessions: true },
    };
    states.set(row.hash, mergeState(ensure(row.hash), patch));
  }

  for (const row of trackingSessions) {
    const hash = resolveLeadHash(row, sessionMap);
    if (!hash) {
      conflicts.push({ type: 'tracking_session_without_lead_hash', id: row.id, session_hash: row.session_hash });
      continue;
    }
    const memberId = safeString(row.member_id, 120) || null;
    const patch = {
      member_id: memberId,
      ref_id: memberId,
      ref_type: 'member',
      berater_slug: safeString(row.berater_slug, 80) || null,
      source_app: safeString(row.source_app, 80) || 'business_leads_quiz',
      funnel_key: safeString(row.funnel, 80) || 'business',
      lang: normalizeLang(row.lang),
      country: safeString(row.country, 5) || null,
      first_seen_at: asIso(row.first_seen_at || row.created_at),
      last_seen_at: asIso(row.updated_at || row.last_event_at),
      last_event_at: asIso(row.last_event_at || row.updated_at),
      first_name: safeString(row.form_first_name, 120) || null,
      email: safeString(row.form_email, 180) || null,
      email_normalized: normalizeEmail(row.form_email) || null,
      email_hash: hashEmail(row.form_email),
      form_submitted_at: asIso(row.form_submitted_at),
      profile_code: safeString(row.quiz_profile, 80) || null,
      profile_label: safeString(row.quiz_profile_name, 180) || null,
      main_aspiration: safeString(row.main_aspiration, 120) || null,
      main_aspiration_label: safeString(row.main_aspiration_label, 180) || null,
      initial_barrier: safeString(row.quiz_barrier, 180) || null,
      cta_type: safeString(row.final_cta_type, 80) || null,
      cta_clicked_at: asIso(row.final_cta_clicked_at),
      migration_source: 'mysql_supabase_tracking',
      migration_flags: { has_tracking_sessions: true },
    };
    states.set(hash, mergeState(ensure(hash), patch));
  }

  for (const row of trackingProgress) {
    const hash = resolveLeadHash(row, sessionMap);
    if (hash) ensure(hash).migration_flags.has_tracking_video_progress = true;
  }

  for (const row of trackingEvents) {
    const hash = resolveLeadHash(row, sessionMap);
    if (hash) ensure(hash).migration_flags.has_tracking_events = true;
  }

  for (const state of states.values()) {
    const hasTracking =
      state.migration_flags.has_quiz_sessions ||
      state.migration_flags.has_tracking_sessions ||
      state.migration_flags.has_tracking_video_progress ||
      state.migration_flags.has_tracking_events;
    const hasMysql = state.mysql_survey_id || state.migration_flags.mysql_points_result !== undefined;
    state.tracking_missing = Boolean(hasMysql && !hasTracking);
    state.migration_source = hasMysql && hasTracking ? 'mysql_supabase' : hasMysql ? 'mysql_only' : 'supabase_only';
    state.ref_id = first(state.ref_id, state.member_id);
    state.ref_type = first(state.ref_type, state.ref_id && state.member_id && state.ref_id !== state.member_id ? 'referral_code' : 'member');
    state.created_at = first(state.first_seen_at, state.form_submitted_at, new Date().toISOString());
    state.updated_at = first(state.last_seen_at, state.last_event_at, state.created_at);
  }

  return { states: [...states.values()], conflicts };
}

function collectVideoProgress({ quizSessions, trackingProgress }, sessionMap) {
  const byKey = new Map();
  const conflicts = [];

  function merge(row) {
    const key = `${row.lead_hash}:${row.video_step}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, row);
      return;
    }
    existing.max_unique_watched_percent = Math.max(
      asInt(existing.max_unique_watched_percent),
      asInt(row.max_unique_watched_percent)
    );
    existing.max_playhead_percent = Math.max(asInt(existing.max_playhead_percent), asInt(row.max_playhead_percent));
    existing.unique_watched_seconds = Math.max(
      asInt(existing.unique_watched_seconds),
      asInt(row.unique_watched_seconds)
    );
    existing.completed_at = first(existing.completed_at, row.completed_at);
    existing.last_update_at = first(row.last_update_at, existing.last_update_at);
  }

  for (const row of trackingProgress) {
    const hash = resolveLeadHash(row, sessionMap);
    if (!hash) {
      conflicts.push({
        type: 'video_progress_without_lead_hash',
        id: row.id,
        session_hash: row.session_hash,
        video_step: row.video_step,
      });
      continue;
    }
    const pct = Math.max(asInt(row.unique_watched_percent), asInt(row.max_playhead_percent));
    merge({
      lead_hash: hash,
      video_step: asInt(row.video_step),
      video_id: safeString(row.video_id, 120) || null,
      duration_seconds: asInt(row.duration_seconds),
      unique_watched_seconds: asInt(row.unique_watched_seconds),
      max_unique_watched_percent: Math.min(100, asInt(row.unique_watched_percent, pct)),
      max_playhead_percent: Math.min(100, asInt(row.max_playhead_percent, pct)),
      seek_count: asInt(row.seek_count),
      watched_ranges: row.watched_ranges || [],
      first_seen_at: asIso(row.first_seen_at || row.created_at),
      unlocked_at: asIso(row.unlocked_at),
      completed_at: asIso(row.completed_at) || (asInt(row.unique_watched_percent) >= 95 ? asIso(row.last_update_at) : null),
      last_update_at: asIso(row.last_update_at || row.updated_at),
      created_at: asIso(row.created_at || row.first_seen_at),
      updated_at: asIso(row.updated_at || row.last_update_at),
    });
  }

  for (const row of quizSessions) {
    if (!isLeadHash(row.hash)) continue;
    for (const step of [1, 2, 3]) {
      const pct = asInt(row[`video${step}_max_pct`]);
      const seconds = asInt(row[`video${step}_watched_sec`]);
      if (pct <= 0 && seconds <= 0) continue;
      merge({
        lead_hash: row.hash,
        video_step: step,
        video_id: null,
        duration_seconds: 0,
        unique_watched_seconds: seconds,
        max_unique_watched_percent: Math.min(100, pct),
        max_playhead_percent: Math.min(100, pct),
        seek_count: 0,
        watched_ranges: [],
        first_seen_at: asIso(row.visited_at || row.created_at),
        unlocked_at: null,
        completed_at: pct >= 95 ? asIso(row[`video${step}_last_update`] || row.updated_at) : null,
        last_update_at: asIso(row[`video${step}_last_update`] || row.updated_at),
        created_at: asIso(row.created_at || row.visited_at),
        updated_at: asIso(row.updated_at || row[`video${step}_last_update`]),
      });
    }
  }

  return { videos: [...byKey.values()].filter((row) => row.video_step >= 1 && row.video_step <= 3), conflicts };
}

function collectEvents(trackingEvents, sessionMap) {
  const events = [];
  const conflicts = [];
  for (const row of trackingEvents) {
    const hash = resolveLeadHash(row, sessionMap);
    if (!hash) {
      conflicts.push({ type: 'event_without_lead_hash', id: row.id, session_hash: row.session_hash });
      continue;
    }
    events.push({
      event_uid: safeString(row.event_id, 96) || `legacy_tracking_event_${row.id}`,
      lead_hash: hash,
      event_name: safeString(row.event_name, 100) || 'legacy_event',
      event_at: asIso(row.event_at || row.created_at) || new Date().toISOString(),
      member_id: safeString(row.member_id, 120) || null,
      ref_id: safeString(row.member_id, 120) || null,
      berater_slug: safeString(row.berater_slug, 80) || null,
      source_app: safeString(row.source_app, 80) || 'business_leads_quiz',
      funnel_key: safeString(row.funnel, 80) || 'business',
      video_step: row.video_step === null || row.video_step === undefined ? null : asInt(row.video_step),
      question_ref: null,
      unique_watched_percent:
        row.unique_watched_percent === null || row.unique_watched_percent === undefined
          ? null
          : asInt(row.unique_watched_percent),
      playhead_percent:
        row.progress_percent === null || row.progress_percent === undefined
          ? null
          : asInt(row.progress_percent),
      payload: {
        legacy_table: 'tracking_events',
        legacy_id: row.id,
        session_hash: row.session_hash || null,
        page_key: row.page_key || null,
        step_index: row.step_index || null,
        question_index: row.question_index || null,
        video_id: row.video_id || null,
        properties: row.properties || {},
      },
      created_at: asIso(row.created_at || row.event_at),
    });
  }
  return { events, conflicts };
}

function compareRanks(states, videos) {
  const byLead = new Map();
  for (const video of videos) {
    const list = byLead.get(video.lead_hash) || [];
    list.push(video);
    byLead.set(video.lead_hash, list);
  }
  const conflicts = [];
  for (const state of states) {
    const mysqlRank = state.migration_flags.mysql_rank;
    if (mysqlRank === null || mysqlRank === undefined) continue;
    const videoRank = (byLead.get(state.lead_hash) || []).reduce((rank, video) => {
      return asInt(video.max_unique_watched_percent) >= 95 ? Math.max(rank, asInt(video.video_step)) : rank;
    }, 0);
    if (mysqlRank > videoRank) {
      conflicts.push({
        type: 'mysql_rank_higher_than_supabase_video',
        lead_hash: state.lead_hash,
        mysql_rank: mysqlRank,
        video_rank: videoRank,
        tracking_missing: state.tracking_missing,
      });
    }
  }
  return conflicts;
}

function applyMysqlRankFallback(states, videos) {
  const byKey = new Map(videos.map((video) => [`${video.lead_hash}:${video.video_step}`, video]));
  const inferred = [];

  for (const state of states) {
    const mysqlRank = state.migration_flags.mysql_rank;
    if (mysqlRank === null || mysqlRank === undefined || mysqlRank <= 0) continue;

    for (let step = 1; step <= mysqlRank; step += 1) {
      const key = `${state.lead_hash}:${step}`;
      const existing = byKey.get(key);
      if (existing && asInt(existing.max_unique_watched_percent) >= 95) continue;

      const row = {
        lead_hash: state.lead_hash,
        video_step: step,
        video_id: 'mysql_points_result_inferred',
        duration_seconds: existing ? asInt(existing.duration_seconds) : 0,
        unique_watched_seconds: existing ? asInt(existing.unique_watched_seconds) : 0,
        max_unique_watched_percent: 95,
        max_playhead_percent: Math.max(95, existing ? asInt(existing.max_playhead_percent) : 0),
        seek_count: existing ? asInt(existing.seek_count) : 0,
        watched_ranges: existing?.watched_ranges || [{ source: 'mysql_points_result_inferred' }],
        first_seen_at: existing?.first_seen_at || state.form_submitted_at || state.first_seen_at || new Date().toISOString(),
        unlocked_at: existing?.unlocked_at || null,
        completed_at: existing?.completed_at || state.form_submitted_at || state.last_event_at || new Date().toISOString(),
        last_update_at: existing?.last_update_at || state.form_submitted_at || state.last_event_at || new Date().toISOString(),
        created_at: existing?.created_at || state.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      byKey.set(key, row);
      inferred.push({ lead_hash: state.lead_hash, video_step: step });
    }

    if (inferred.some((row) => row.lead_hash === state.lead_hash)) {
      state.migration_flags.mysql_rank_inferred_video = true;
    }
  }

  return { videos: [...byKey.values()], inferred };
}

async function main() {
  const [mysqlRows, quizSessions, trackingSessions, trackingProgress, trackingEvents] = await Promise.all([
    fetchMysqlRows(),
    fetchAll('quiz_sessions'),
    fetchAll('tracking_sessions'),
    fetchAll('tracking_video_progress'),
    fetchAll('tracking_events'),
  ]);

  const { map: sessionMap, conflicts: sessionConflicts } = buildSessionMap(trackingSessions);
  const stateResult = buildLeadStates(
    { mysqlRows, quizSessions, trackingSessions, trackingProgress, trackingEvents },
    sessionMap
  );
  const videoResult = collectVideoProgress({ quizSessions, trackingProgress }, sessionMap);
  const videoFallback = applyMysqlRankFallback(stateResult.states, videoResult.videos);
  const eventResult = collectEvents(trackingEvents, sessionMap);
  const rankConflicts = compareRanks(stateResult.states, videoFallback.videos);

  await upsertBatch('lead_state', stateResult.states, 'lead_hash');
  await upsertBatch('lead_video_progress', videoFallback.videos, 'lead_hash,video_step');
  await upsertBatch('lead_events', eventResult.events, 'event_uid');

  const report = {
    applied: APPLY,
    generated_at: new Date().toISOString(),
    counts: {
      mysql_rows: mysqlRows.length,
      quiz_sessions: quizSessions.length,
      tracking_sessions: trackingSessions.length,
      tracking_video_progress: trackingProgress.length,
      tracking_events: trackingEvents.length,
      lead_state_rows: stateResult.states.length,
      lead_video_progress_rows: videoFallback.videos.length,
      mysql_rank_inferred_video_rows: videoFallback.inferred.length,
      lead_event_rows: eventResult.events.length,
    },
    source_breakdown: stateResult.states.reduce((acc, row) => {
      acc[row.migration_source] = (acc[row.migration_source] || 0) + 1;
      return acc;
    }, {}),
    conflicts: [
      ...sessionConflicts,
      ...stateResult.conflicts,
      ...videoResult.conflicts,
      ...eventResult.conflicts,
      ...rankConflicts,
    ],
  };

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        applied: report.applied,
        counts: report.counts,
        source_breakdown: report.source_breakdown,
        conflict_count: report.conflicts.length,
        report_path: REPORT_PATH,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
