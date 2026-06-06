/**
 * Vercel Serverless Function: /api/bridge (Business Leads Quiz)
 * Proxies requests to the central PHP bridge (ac-reconnect.com) so the browser never needs the Bridge-Key.
 *
 * Public actions used by the quiz:
 * - lookup_subdomain
 * - write_analytics
 * - track_event
 * - forward_typeform_adapter (normalized quiz data -> central Typeform-compatible payload -> HL-support)
 * - generate_resume_token (creates JWT token plus short resume key for resume links)
 * - resolve_resume_token (verifies JWT token and resolves latest video progress)
 * - resolve_resume_key (resolves a short resume key to the latest video progress)
 */

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
function cleanEnvSecret(value) {
  return String(value || '')
    .replace(/\\n$/g, '')
    .trim();
}

const BRIDGE_URL = process.env.BRIDGE_URL || 'https://ac-reconnect.com/db-bridge.php';
const HBA_READ_BRIDGE_URL =
  process.env.HBA_READ_BRIDGE_URL ||
  process.env.MYSQL_READ_BRIDGE_URL ||
  'https://origin-reconnect.ac-reconnect.com/hba-bridge.php';
const BRIDGE_KEY = cleanEnvSecret(process.env.BRIDGE_KEY);
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://xlpiisbozpgmemxhtivj.supabase.co';
const SUPABASE_KEY = cleanEnvSecret(process.env.SUPABASE_SERVICE_KEY);
const JWT_SECRET = process.env.JWT_SECRET;
const RESUME_KEY_SECRET = process.env.RESUME_KEY_SECRET || JWT_SECRET;
const TRACKING_SCHEMA_VERSION = 'ac_tracking_v1';
const POSTMARK_SERVER_TOKEN = process.env.POSTMARK_SERVER_TOKEN;
const POSTMARK_FROM = process.env.POSTMARK_FROM || 'Activecenter-Support <mail@mail.hl-support.biz>';
const POSTMARK_MESSAGE_STREAM = process.env.POSTMARK_MESSAGE_STREAM || 'outbound';
const IDENTITY_ALERT_EMAIL = process.env.IDENTITY_ALERT_EMAIL || 'markus@global-sce.com';
const N8N_UPDATE_RESULT_URL = process.env.N8N_UPDATE_RESULT_URL;
const N8N_UPDATE_RESULT_SECRET = String(process.env.N8N_UPDATE_RESULT_SECRET || '').trim();
const BRAND_LOGO_URL = 'https://hl-support.biz/storage/images/cwemaillogo-1bcb4f.png';
const BRAND_PRIVACY_URL = 'https://impressum.hl-support.biz/privacy.html';
const COACH_INSIGHTS_BASE_URL = 'https://business-schulung.vercel.app/';
const DEFAULT_COACH_LANGUAGE_OVERRIDES = { markus: 'de' };

const TYPEFORM_TARGET = 'https://contacts.hl-support.biz/webhook/typeform';
const ALLOWED_ADAPTER_KEYS = new Set(['business_leads_quiz_v1']);

if (!SUPABASE_KEY) {
  console.error('ERROR: SUPABASE_SERVICE_KEY environment variable is not set');
}

function nowIso() {
  return new Date().toISOString();
}

function compactObject(record) {
  return Object.fromEntries(
    Object.entries(record || {}).filter(([, value]) => value !== undefined)
  );
}

function safeString(value, maxLength = 255) {
  if (value === null || value === undefined) return null;
  return String(value).slice(0, maxLength);
}

function normalizePersonName(value, maxLength = 120) {
  const text = safeString(value, maxLength);
  if (!text) return text;
  const normalized = text.trim().replace(/\s+/g, ' ');
  if (!normalized) return '';

  return normalized
    .split(/([\s'-]+)/)
    .map((part) => {
      if (!part || /^[\s'-]+$/.test(part)) return part;
      const lower = part.toLocaleLowerCase('de-DE');
      const chars = Array.from(lower);
      return chars[0].toLocaleUpperCase('de-DE') + chars.slice(1).join('');
    })
    .join('');
}

function hasTrackingValue(value) {
  return value !== undefined && value !== null && value !== '';
}

function firstTrackingValue(record, keys) {
  for (const key of keys) {
    if (hasTrackingValue(record?.[key])) return record[key];
  }
  return undefined;
}

function safeTrackingString(record, keys, maxLength = 255) {
  const value = firstTrackingValue(record, Array.isArray(keys) ? keys : [keys]);
  return value === undefined ? undefined : safeString(value, maxLength);
}

function safeTrackingPersonName(record, keys, maxLength = 120) {
  const value = firstTrackingValue(record, Array.isArray(keys) ? keys : [keys]);
  return value === undefined ? undefined : normalizePersonName(value, maxLength);
}

function safeInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : null;
}

function normalizeLanguage(...values) {
  for (const value of values) {
    const lang = String(value || '')
      .trim()
      .toLowerCase()
      .slice(0, 2);
    if (['de', 'it', 'en', 'fr', 'ru'].includes(lang)) return lang;
  }
  return 'de';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeTrackingInteger(record, keys) {
  const value = firstTrackingValue(record, Array.isArray(keys) ? keys : [keys]);
  return value === undefined ? undefined : safeInteger(value);
}

function eventNameOf(payload) {
  return safeString(payload.event_name || payload.event || payload.name || 'unknown_event', 80);
}

function normalizeLeadEventName(eventName) {
  const name = safeString(eventName, 100);
  if (name === 'question_answered') return 'quiz_answer';
  if (name === 'form_submit') return 'form_submitted';
  if (name === 'cta_click') return 'cta_clicked';
  return name;
}

function sessionHashOf(payload) {
  return safeString(payload.session_hash || payload.tracking_hash || payload.hash, 96);
}

function normalizeResumeSlug(slug) {
  const normalized = String(slug || '')
    .trim()
    .toLowerCase();
  return /^[a-z0-9_-]+$/.test(normalized) && normalized !== 'default' ? normalized : '';
}

function firstValidSlug(...values) {
  for (const value of values) {
    const slug = normalizeResumeSlug(value);
    if (slug) return slug;
  }
  return '';
}

function requestOrigin(req) {
  const forwardedHost = String(req?.headers?.['x-forwarded-host'] || '').split(',')[0].trim();
  const host = forwardedHost || String(req?.headers?.host || '').trim();
  if (!host) return '';

  const forwardedProto = String(req?.headers?.['x-forwarded-proto'] || '').split(',')[0].trim();
  const proto = forwardedProto || (host.includes('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

function resumeBaseUrl(slug, req) {
  const normalizedSlug = normalizeResumeSlug(slug);
  const configuredBase = String(process.env.RESUME_BASE_URL || '').replace(/\/+$/, '');
  const currentOrigin = requestOrigin(req);
  const useCurrentOrigin =
    currentOrigin &&
    /(^https?:\/\/localhost(:\d+)?$)|(^https?:\/\/127\.0\.0\.1(:\d+)?$)|(\.vercel\.app$)/i.test(
      currentOrigin
    );
  const base = configuredBase || (useCurrentOrigin ? currentOrigin : 'https://business.activecenter.info');

  return normalizedSlug
    ? `${base}/${normalizedSlug}`
    : base;
}

function resumeTargetQuery(target) {
  return target === 'videos' ? '&target=videos' : '';
}

function longResumeUrl(token, slug, req, target = '') {
  return `${resumeBaseUrl(slug, req)}?resume=${encodeURIComponent(String(token || ''))}${resumeTargetQuery(target)}`;
}

function shortResumeUrl(key, slug, req, target = '') {
  return `${resumeBaseUrl(slug, req)}?r=${encodeURIComponent(String(key || ''))}${resumeTargetQuery(target)}`;
}

function toBase62(value) {
  const alphabet = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let number = BigInt(value);
  if (number === 0n) return '0';
  let output = '';
  while (number > 0n) {
    const remainder = Number(number % 62n);
    output = alphabet[remainder] + output;
    number /= 62n;
  }
  return output;
}

function fromBase62(value) {
  const alphabet = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let output = 0n;
  for (const char of String(value || '')) {
    const index = alphabet.indexOf(char);
    if (index < 0) throw new Error('Invalid base62 character');
    output = output * 62n + BigInt(index);
  }
  return output;
}

function resumeKeySignature(encodedId) {
  if (!RESUME_KEY_SECRET) {
    throw new Error('RESUME_KEY_SECRET is not configured');
  }
  return crypto
    .createHmac('sha256', RESUME_KEY_SECRET)
    .update(`resume:${encodedId}`)
    .digest('base64url')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 6);
}

function createResumeKey(recordId) {
  const encodedId = toBase62(recordId);
  return `${encodedId}${resumeKeySignature(encodedId)}`;
}

function decodeResumeKey(key) {
  const raw = String(key || '').trim();
  if (raw.length <= 6) {
    throw new Error('Resume key too short');
  }

  const encodedId = raw.slice(0, -6);
  const signature = raw.slice(-6);
  if (resumeKeySignature(encodedId) !== signature) {
    throw new Error('Resume key signature mismatch');
  }

  return Number(fromBase62(encodedId));
}

async function supabaseRequest(path, options = {}) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return null;
  }

  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Supabase ${path} failed: ${response.status} ${text}`);
  }

  return response;
}

async function supabaseJson(path, options = {}) {
  const response = await supabaseRequest(path, options);
  return response ? response.json() : null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readMysqlTable(table, where, limit = 1) {
  if (!BRIDGE_KEY || !HBA_READ_BRIDGE_URL) {
    return [];
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6500);
  let response;
  try {
    response = await fetch(HBA_READ_BRIDGE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Bridge-Key': BRIDGE_KEY,
      },
      body: JSON.stringify({
        action: 'read_table',
        table,
        where,
        limit,
        offset: 0,
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`mysql_read_bridge_invalid_json:${table}:${text.slice(0, 180)}`);
  }

  if (!response.ok || data.ok === false || data.error) {
    throw new Error(`mysql_read_bridge_failed:${table}:${response.status}:${data.error || text.slice(0, 180)}`);
  }

  return Array.isArray(data.data) ? data.data : [];
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function joinPhone(prefix, number) {
  const left = safeString(prefix, 30);
  const right = safeString(number, 80);
  return [left, right].filter(Boolean).join(' ').trim() || null;
}

async function loadFinalBusinessLeadContext(leadHash) {
  if (!isLeadHash(leadHash)) {
    return { found: false, reason: 'invalid_lead_hash' };
  }

  const retryDelays = [0, 700, 1500, 3000, 5000];
  let lastReason = 'not_found';

  for (const delay of retryDelays) {
    if (delay) await sleep(delay);

    const surveys = await readMysqlTable('typeform_surveys', { hash: leadHash }, 1);
    const survey = surveys[0] || null;
    if (!survey) {
      lastReason = 'survey_not_found';
      continue;
    }

    const contactId = numberOrNull(survey.contact_id);
    if (!contactId) {
      lastReason = 'survey_missing_contact_id';
      continue;
    }

    const contacts = await readMysqlTable('contacts', { id: contactId }, 1);
    const contact = contacts[0] || null;
    if (!contact) {
      lastReason = 'contact_not_found';
      continue;
    }

    let coach = null;
    const coachId = numberOrNull(contact.coach_id);
    if (coachId) {
      coach = (await readMysqlTable('users', { id: coachId }, 1))[0] || null;
    }
    if (!coach && contact.member_id) {
      coach = (await readMysqlTable('users', { herbalife_id: String(contact.member_id).trim() }, 1))[0] || null;
    }

    const finalMemberId = safeString(contact.member_id || coach?.herbalife_id, 120);
    const finalRefId = safeString(coach?.herbalife_id || finalMemberId || survey.ref_id, 120);
    const finalSlug = safeString(coach?.sub_domain, 80);
    const rawOrganisationId = numberOrNull(coach?.organization_id || coach?.organisation_id);
    const organisationId = rawOrganisationId && rawOrganisationId > 0 ? rawOrganisationId : null;

    return {
      found: true,
      source: 'mysql_final_readback',
      lead_hash: leadHash,
      mysql_survey_id: numberOrNull(survey.id),
      mysql_contact_id: contactId,
      mysql_coach_id: coachId,
      member_id: finalMemberId || null,
      ref_id: finalRefId || finalMemberId || null,
      berater_slug: finalSlug || null,
      organisation_id: organisationId,
      first_name: normalizePersonName(contact.first_name, 120) || null,
      email: safeString(contact.email, 180)?.toLowerCase() || null,
      phone: joinPhone(contact.phone_prefix, contact.phone_number),
      form_submitted_at: safeString(survey.submitted_at || survey.created_at, 40) || null,
      coach_herbalife_id: safeString(coach?.herbalife_id, 120) || null,
      coach_found: Boolean(coach),
    };
  }

  return { found: false, reason: lastReason };
}

async function insertIgnoringDuplicates(table, conflictColumn, record) {
  await supabaseRequest(`${table}?on_conflict=${encodeURIComponent(conflictColumn)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Prefer: 'resolution=ignore-duplicates',
    },
    body: JSON.stringify(record),
  });
}

async function patchByEquals(table, column, value, record) {
  const encodedValue = encodeURIComponent(value);
  await supabaseRequest(`${table}?${column}=eq.${encodedValue}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(record),
  });
}

function videoProgressFromSession(session) {
  if (!session) return { lastVideoStep: 1, hasVideoProgress: false };
  if (session.video3_max_pct && Number(session.video3_max_pct) > 0) {
    return { lastVideoStep: 3, hasVideoProgress: true, resumeStartPercent: Number(session.video3_max_pct) || 0 };
  }
  if (session.video2_max_pct && Number(session.video2_max_pct) > 0) {
    return { lastVideoStep: 2, hasVideoProgress: true, resumeStartPercent: Number(session.video2_max_pct) || 0 };
  }
  if (session.video1_max_pct && Number(session.video1_max_pct) > 0) {
    return { lastVideoStep: 1, hasVideoProgress: true, resumeStartPercent: Number(session.video1_max_pct) || 0 };
  }
  return { lastVideoStep: 1, hasVideoProgress: false };
}

function clampResumePercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(90, Math.floor(number)));
}

function resumeStateFromVideoProgress(rows) {
  const progressRows = Array.isArray(rows)
    ? rows
        .map((row) => ({
          videoStep: safeInteger(row.video_step),
          uniquePercent: Number(row.max_unique_watched_percent || 0),
          playheadPercent: Number(row.max_playhead_percent || 0),
          lastUpdateAt: safeString(row.last_update_at, 40),
          completedAt: safeString(row.completed_at, 40),
        }))
        .filter((row) => row.videoStep >= 1 && row.videoStep <= 3)
    : [];

  if (!progressRows.length) {
    return { lastVideoStep: 1, hasVideoProgress: false, resumeStartPercent: 0 };
  }

  const byStep = new Map(progressRows.map((row) => [row.videoStep, row]));
  const partialRows = progressRows
    .filter((row) => row.uniquePercent > 0 && row.uniquePercent < 95)
    .sort((a, b) => {
      if (Date.parse(b.lastUpdateAt || '') !== Date.parse(a.lastUpdateAt || '')) {
        return Date.parse(b.lastUpdateAt || '') - Date.parse(a.lastUpdateAt || '');
      }
      return b.videoStep - a.videoStep;
    });

  if (partialRows[0]) {
    return {
      lastVideoStep: partialRows[0].videoStep,
      hasVideoProgress: true,
      resumeStartPercent: clampResumePercent(partialRows[0].uniquePercent),
    };
  }

  let completedStep = 0;
  for (const step of [1, 2, 3]) {
    const row = byStep.get(step);
    if (row && row.uniquePercent >= 95) completedStep = step;
  }

  if (completedStep >= 3) {
    return {
      lastVideoStep: 3,
      hasVideoProgress: true,
      resumeTarget: 'final',
      resumeStartPercent: 0,
    };
  }

  if (completedStep > 0) {
    return {
      lastVideoStep: completedStep + 1,
      hasVideoProgress: true,
      resumeStartPercent: 0,
    };
  }

  return { lastVideoStep: 1, hasVideoProgress: false, resumeStartPercent: 0 };
}

function normalizeResumeProfileCode(value) {
  const raw = safeString(value, 40).toLowerCase();
  if (!raw) return '';
  if (raw === 'r' || raw === 'a' || raw === 'typ a' || raw === 'type a' || raw === 'tipo a' || raw.includes('macher')) return 'R';
  if (raw === 'y' || raw === 'typ b' || raw === 'type b' || raw === 'tipo b' || raw.includes('netzwerker')) return 'Y';
  if (raw === 'g' || raw === 'c' || raw === 'typ c' || raw === 'type c' || raw === 'tipo c' || raw.includes('anker')) return 'G';
  if (raw === 'b' || raw === 'd' || raw === 'typ d' || raw === 'type d' || raw === 'tipo d' || raw.includes('architekt')) return 'B';
  return raw.toUpperCase();
}

async function loadResumeState({ sessionHash = '', leadHash = '' } = {}) {
  const fallback = {
    resumeTarget: 'result',
    lastVideoStep: 1,
    resumeStartPercent: 0,
    profileCode: '',
    aspiration: '',
    barrier: '',
  };
  if (!sessionHash && !isLeadHash(leadHash)) return fallback;

  try {
    const encodedHash = sessionHash ? encodeURIComponent(sessionHash) : '';
    const encodedLeadHash = isLeadHash(leadHash) ? encodeURIComponent(leadHash) : '';
    const [leadResponse, progressResponse, quizResponse, trackingResponse, ctaResponse] =
      await Promise.all([
        encodedLeadHash
          ? supabaseRequest(
              `lead_state?lead_hash=eq.${encodedLeadHash}&select=profile_code,main_aspiration,initial_barrier&limit=1`
            )
          : null,
        encodedLeadHash
          ? supabaseRequest(
              `lead_video_progress?lead_hash=eq.${encodedLeadHash}&select=video_step,max_unique_watched_percent,max_playhead_percent,last_update_at,completed_at&order=video_step.asc`
            )
          : null,
        encodedHash
          ? supabaseRequest(
              `quiz_sessions?hash=eq.${encodedHash}&select=quiz_profile,quiz_aspiration,quiz_barrier,video1_max_pct,video2_max_pct,video3_max_pct&limit=1`
            )
          : null,
        encodedHash
          ? supabaseRequest(
              `tracking_sessions?session_hash=eq.${encodedHash}&select=quiz_profile,main_aspiration,quiz_barrier&limit=1`
            )
          : null,
        encodedHash
          ? supabaseRequest(
              `tracking_events?session_hash=eq.${encodedHash}&event_name=eq.result_cta_click&select=id&limit=1`
            )
          : null,
      ]);
    const leadRows = await leadResponse?.json?.();
    const progressRows = await progressResponse?.json?.();
    const quizRows = await quizResponse?.json?.();
    const trackingRows = await trackingResponse?.json?.();
    const ctaRows = await ctaResponse?.json?.();
    const leadState = Array.isArray(leadRows) ? leadRows[0] : null;
    const quizSession = Array.isArray(quizRows) ? quizRows[0] : null;
    const trackingSession = Array.isArray(trackingRows) ? trackingRows[0] : null;
    const v2Progress = resumeStateFromVideoProgress(progressRows);
    const legacyProgress = videoProgressFromSession(quizSession);
    const progress = v2Progress.hasVideoProgress ? v2Progress : legacyProgress;
    const hasResultCtaClick = Array.isArray(ctaRows) && ctaRows.length > 0;
    const resumeTarget =
      progress.resumeTarget || (hasResultCtaClick || progress.hasVideoProgress ? 'videos' : 'result');

    return {
      resumeTarget,
      lastVideoStep: progress.lastVideoStep,
      resumeStartPercent: clampResumePercent(progress.resumeStartPercent),
      profileCode: normalizeResumeProfileCode(
        leadState?.profile_code || trackingSession?.quiz_profile || quizSession?.quiz_profile
      ),
      aspiration:
        safeString(
          leadState?.main_aspiration || trackingSession?.main_aspiration || quizSession?.quiz_aspiration,
          60
        ) || '',
      barrier:
        safeString(leadState?.initial_barrier || trackingSession?.quiz_barrier || quizSession?.quiz_barrier, 60) ||
        '',
    };
  } catch (error) {
    console.warn('Could not load resume state, defaulting to result:', error.message);
    return fallback;
  }
}

async function loadLeadStateByHash(leadHash, depth = 0) {
  if (!isLeadHash(leadHash)) return {};
  const response = await supabaseRequest(
    `lead_state?lead_hash=eq.${encodeURIComponent(leadHash)}&select=lead_hash,member_id,organisation_id,ref_id,berater_slug,lang,first_name,email,email_normalized,form_submitted_at,profile_code,main_aspiration,initial_barrier,lifecycle_stage,migration_flags&limit=1`
  );
  const rows = await response?.json?.();
  const row = Array.isArray(rows) ? rows[0] || {} : {};
  const mergedInto = safeString(row?.migration_flags?.merged_into, 96);
  if (
    depth < 3 &&
    (safeString(row.lifecycle_stage, 80) || '').toLowerCase() === 'merged_duplicate' &&
    isLeadHash(mergedInto) &&
    mergedInto !== leadHash
  ) {
    return loadLeadStateByHash(mergedInto, depth + 1);
  }
  return row;
}

function requestedResumeTarget(value) {
  const target = safeString(value, 32).toLowerCase();
  return target === 'videos' ? 'videos' : '';
}

function resumeStateForRequestedTarget(resumeState, target) {
  if (target !== 'videos' || resumeState.resumeTarget === 'final') return resumeState;
  return {
    ...resumeState,
    resumeTarget: 'videos',
    lastVideoStep: resumeState.resumeTarget === 'videos' ? resumeState.lastVideoStep : 1,
  };
}

async function persistContactLeadStateFromResumePayload(payload) {
  const leadHash = safeString(payload?.leadHash || payload?.lead_hash, 96);
  const email = safeString(payload?.email, 180).toLowerCase();
  const firstName = normalizePersonName(payload?.firstName || payload?.first_name, 120);

  if (!isLeadHash(leadHash) || !email || !firstName) {
    return { persisted: false, reason: 'missing_required_contact_fields' };
  }

  const submittedAt = safeString(
    payload?.submittedAt || payload?.submitted_at || new Date().toISOString(),
    40
  );
  const normalizedProfile = normalizeBusinessProfile(
    payload?.profileCode,
    payload?.profile_code,
    payload?.profileLabel,
    payload?.profile_label
  );
  const memberId = safeString(payload?.memberId || payload?.member_id, 120) || null;
  const organisationId =
    safeString(
      payload?.organisationId ||
        payload?.organisation_id ||
        payload?.organizationId ||
        payload?.organization_id,
      120
    ) || null;
  const refId = safeString(payload?.refId || payload?.ref_id || payload?.memberId || payload?.member_id, 120) || memberId;

  await supabaseRequest('lead_state?on_conflict=lead_hash', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify({
      lead_hash: leadHash,
      member_id: memberId,
      ...(organisationId ? { organisation_id: organisationId } : {}),
      ref_id: refId,
      ref_type: refId && refId !== memberId ? 'referral_code' : 'member',
      berater_slug: safeString(payload?.beraterSlug || payload?.berater_slug || payload?.slug, 80) || null,
      source_app: 'business_leads_quiz',
      funnel_key: 'business',
      lang: normalizeLanguage(payload?.lang || payload?.language),
      first_name: firstName,
      email,
      email_normalized: email,
      form_submitted_at: submittedAt,
      profile_code: normalizedProfile?.code || null,
      profile_label: normalizedProfile?.label || null,
      main_aspiration: safeString(payload?.mainAspiration || payload?.main_aspiration, 80) || null,
      main_aspiration_label:
        safeString(payload?.mainAspirationLabel || payload?.main_aspiration_label, 180) || null,
      initial_barrier: safeString(payload?.barrier || payload?.initial_barrier, 120) || null,
      lifecycle_stage: 'contact_known',
      last_event_at: submittedAt,
    }),
  });

  return { persisted: true, leadHash };
}

async function resolveContactLeadForResume({ sessionHash, email, leadHash, fallbackContact }) {
  let resolvedLeadHash = isLeadHash(leadHash) ? leadHash : '';
  let leadState = resolvedLeadHash ? await loadLeadStateByHash(resolvedLeadHash) : {};
  if (isLeadHash(leadState.lead_hash)) resolvedLeadHash = safeString(leadState.lead_hash, 96);

  const shouldPersistFallbackContact =
    fallbackContact &&
    (!leadState.lead_hash ||
      !leadState.email ||
      !leadState.first_name ||
      !leadState.form_submitted_at ||
      (fallbackContact.lang && normalizeLanguage(fallbackContact.lang) !== leadState.lang) ||
      (!leadState.organisation_id &&
        (fallbackContact.organisationId ||
          fallbackContact.organisation_id ||
          fallbackContact.organizationId ||
          fallbackContact.organization_id)));

  if (shouldPersistFallbackContact) {
    const persisted = await persistContactLeadStateFromResumePayload({
      ...fallbackContact,
      leadHash: resolvedLeadHash || fallbackContact.leadHash || fallbackContact.lead_hash,
      email: email || fallbackContact.email,
    });
    if (persisted.persisted) {
      resolvedLeadHash = persisted.leadHash;
      leadState = await loadLeadStateByHash(resolvedLeadHash);
      if (isLeadHash(leadState.lead_hash)) resolvedLeadHash = safeString(leadState.lead_hash, 96);
    }
  }

  if (!leadState.lead_hash && sessionHash) {
    const trackingResponse = await supabaseRequest(
      `tracking_sessions?session_hash=eq.${encodeURIComponent(sessionHash)}&select=lead_hash,form_email,form_first_name,member_id,berater_slug,lang&limit=1`
    );
    const trackingRows = await trackingResponse?.json?.();
    const trackingSession = Array.isArray(trackingRows) ? trackingRows[0] || {} : {};
    if (isLeadHash(trackingSession.lead_hash)) {
      resolvedLeadHash = safeString(trackingSession.lead_hash, 96);
      leadState = await loadLeadStateByHash(resolvedLeadHash);
      if (isLeadHash(leadState.lead_hash)) resolvedLeadHash = safeString(leadState.lead_hash, 96);
    }
  }

  if (!leadState.lead_hash && email) {
    const normalizedEmail = safeString(email, 180).toLowerCase();
    const response = await supabaseRequest(
      `lead_state?email_normalized=eq.${encodeURIComponent(normalizedEmail)}&lifecycle_stage=neq.merged_duplicate&select=lead_hash,member_id,organisation_id,ref_id,berater_slug,lang,first_name,email,email_normalized,form_submitted_at,profile_code,main_aspiration,initial_barrier,lifecycle_stage,migration_flags&order=form_submitted_at.desc&limit=1`
    );
    const rows = await response?.json?.();
    leadState = Array.isArray(rows) ? rows[0] || {} : {};
    resolvedLeadHash = safeString(leadState.lead_hash, 96);
  }

  return {
    leadHash: isLeadHash(resolvedLeadHash) ? resolvedLeadHash : '',
    leadState: leadState || {},
  };
}

async function persistBusinessSubmissionToLeadStateV2(submissionPayload, webhookPayload, finalContext = null) {
  const hidden = {
    ...(submissionPayload?.hidden || {}),
    ...typeformHidden(webhookPayload),
  };
  const leadHash = safeString(hidden.lead_hash || hidden.hash || submissionPayload?.lead_hash, 96);
  const email = safeString(submissionPayload?.email || webhookPayload?.email, 180).toLowerCase();

  if (!isLeadHash(leadHash) || !email) {
    return { persisted: false, reason: 'missing_lead_hash_or_email' };
  }

  const submittedAt = safeString(
    webhookPayload?.form_response?.submitted_at ||
      webhookPayload?.form_response?.landed_at ||
      submissionPayload?.submitted_at ||
      submissionPayload?.landed_at ||
      new Date().toISOString(),
    40
  );
  const profile = submissionPayload?.profile || {};
  const normalizedProfile = normalizeBusinessProfile(
    profile.code,
    profile.name,
    submissionPayload?.profile_code,
    submissionPayload?.profile_label
  );
  const lang = normalizeLanguage(hidden.lang, submissionPayload?.lang, webhookPayload?.form_response?.language);
  const finalLead = finalContext?.found ? finalContext : null;
  const finalEmail = safeString(finalLead?.email || email, 180)?.toLowerCase() || email;
  const memberId =
    safeString(finalLead?.member_id || hidden.member_id || submissionPayload?.member_id, 120) || null;
  const refId =
    safeString(finalLead?.ref_id || hidden.ref_id || hidden.member_id || submissionPayload?.ref_id, 120) ||
    memberId;
  const attribution = {
    ...(submissionPayload?.attribution || {}),
    ...hidden,
    ...submissionPayload,
  };

  await supabaseRequest('lead_state?on_conflict=lead_hash', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(compactObject({
      lead_hash: leadHash,
      client_seed: safeString(hidden.client_seed, 120) || null,
      member_id: memberId,
      ref_id: refId,
      ref_type: refId && refId !== memberId ? 'referral_code' : 'member',
      berater_slug:
        safeString(finalLead?.berater_slug || hidden.berater_slug || hidden.slug || submissionPayload?.berater_slug, 80) ||
        null,
      organisation_id:
        finalLead && Number.isFinite(Number(finalLead.organisation_id)) && Number(finalLead.organisation_id) > 0
          ? Number(finalLead.organisation_id)
          : undefined,
      source_app: 'business_leads_quiz',
      funnel_key: 'business',
      lang,
      country: safeString(hidden.c || submissionPayload?.country, 10) || null,
      first_name:
        normalizePersonName(finalLead?.first_name || submissionPayload?.first_name || webhookPayload?.first_name, 120) ||
        null,
      email: finalEmail,
      email_normalized: finalEmail,
      email_hash: normalizedEmailHash(finalEmail),
      phone: safeString(finalLead?.phone || submissionPayload?.phone, 80) || null,
      form_submitted_at: submittedAt,
      profile_code: normalizedProfile?.code || null,
      profile_label: normalizedProfile?.label || null,
      main_aspiration: safeString(hidden.main_aspiration || submissionPayload?.main_aspiration, 80) || null,
      main_aspiration_label:
        safeString(hidden.main_aspiration_label || submissionPayload?.main_aspiration_label, 180) || null,
      utm_source: safeTrackingString(attribution, 'utm_source', 120),
      utm_medium: safeTrackingString(attribution, 'utm_medium', 120),
      utm_campaign: safeTrackingString(attribution, 'utm_campaign', 180),
      utm_content: safeTrackingString(attribution, 'utm_content', 180),
      fbclid: safeTrackingString(attribution, 'fbclid', 500),
      fbc: safeTrackingString(attribution, 'fbc', 500),
      fbp: safeTrackingString(attribution, 'fbp', 120),
      event_source_url: safeTrackingString(attribution, 'event_source_url', 1000),
      lifecycle_stage: 'contact_known',
      mysql_survey_id: finalLead?.mysql_survey_id || undefined,
      sync_status: finalLead ? 'mysql_final_synced' : 'pending',
      last_event_at: submittedAt,
    })),
  });

  return {
    persisted: true,
    leadHash,
    final_mysql_sync: finalLead
      ? {
          found: true,
          mysql_survey_id: finalLead.mysql_survey_id || null,
          mysql_contact_id: finalLead.mysql_contact_id || null,
          mysql_coach_id: finalLead.mysql_coach_id || null,
          organisation_id: finalLead.organisation_id || null,
        }
      : finalContext || { found: false, reason: 'not_requested' },
  };
}

async function ensureResumeSessionRecord({ sessionHash, email, leadHash, context }) {
  if (!sessionHash) return null;

  const existingResponse = await supabaseRequest(
    `tracking_sessions?session_hash=eq.${encodeURIComponent(sessionHash)}&select=id,session_hash,lead_hash,form_email&limit=1`
  );
  const existingRows = await existingResponse?.json?.();
  if (Array.isArray(existingRows) && existingRows[0]?.id) {
    const existing = existingRows[0];
    if ((!existing.form_email || !existing.lead_hash) && (email || leadHash)) {
      await patchByEquals(
        'tracking_sessions',
        'session_hash',
        sessionHash,
        compactObject({
          form_email: email || undefined,
          lead_hash: leadHash || undefined,
          updated_at: nowIso(),
        })
      );
    }
    return existing;
  }

  const upsertResponse = await supabaseRequest('tracking_sessions?on_conflict=session_hash', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify({
      session_hash: sessionHash,
      lead_hash: leadHash || null,
      source_app: 'business_leads_quiz',
      funnel: context || 'quiz',
      form_email: email || null,
      first_seen_at: nowIso(),
      created_at: nowIso(),
      updated_at: nowIso(),
    }),
  });

  const upsertRows = await upsertResponse?.json?.();
  return Array.isArray(upsertRows) ? upsertRows[0] || null : null;
}

async function resolveResumeRecordByKey(key) {
  const trackingSessionId = decodeResumeKey(key);
  const response = await supabaseRequest(
    `tracking_sessions?id=eq.${trackingSessionId}&select=id,session_hash,lead_hash,form_email,funnel&limit=1`
  );
  const rows = await response?.json?.();
  return Array.isArray(rows) ? rows[0] || null : null;
}

function trackingIdentity(payload) {
  const sessionHash = sessionHashOf(payload);
  return {
    sessionHash,
    leadHash: safeString(
      payload.lead_hash || (String(payload.hash || '').startsWith('qz_') ? payload.hash : ''),
      96
    ),
    memberId: safeString(payload.member_id || payload.herbalife_id || payload.ref_id, 80),
    slug: safeString(payload.berater_slug || payload.slug || payload.coach_slug, 80),
    sourceApp: safeString(payload.source_app || 'business_leads_quiz', 80),
    funnel: safeString(payload.funnel || 'business', 80),
  };
}

async function writeTrackingEvent(payload) {
  const identity = trackingIdentity(payload || {});
  if (!identity.sessionHash) return;

  const eventName = eventNameOf(payload);
  const eventAt = safeString(
    payload.event_at ||
      payload.visited_at ||
      payload.form_submitted_at ||
      payload.cta_clicked_at ||
      nowIso(),
    40
  );
  const base = {
    session_hash: identity.sessionHash,
    lead_hash: identity.leadHash,
    member_id: identity.memberId,
    berater_slug: identity.slug,
    source_app: identity.sourceApp,
    funnel: identity.funnel,
    lang: safeString(payload.lang, 10),
    country: safeString(payload.country, 5),
  };

  try {
    const trackingPayload = {
      ...payload,
      schema_version: safeString(payload.schema_version, 40) || TRACKING_SCHEMA_VERSION,
    };
    await insertIgnoringDuplicates(
      'tracking_sessions',
      'session_hash',
      compactObject({
        ...base,
        first_seen_at: eventAt,
        created_at: eventAt,
      })
    );

    // Determine if this is a resume session (first event with is_resume=true)
    const isResume = payload.is_resume === true || payload.is_resume === 'true';

    await patchByEquals(
      'tracking_sessions',
      'session_hash',
      identity.sessionHash,
      compactObject({
        ...base,
        is_resume: isResume ? true : undefined,
        last_event_at: eventAt,
        current_event: eventName,
        device_type: safeTrackingString(payload, 'device_type', 30),
        page_key: safeTrackingString(payload, ['page_key', 'pageKey'], 80),
        quiz_profile: safeTrackingString(payload, 'quiz_profile', 40),
        quiz_profile_name: safeTrackingString(payload, 'quiz_profile_name', 100),
        main_aspiration: safeTrackingString(payload, ['main_aspiration', 'quiz_aspiration'], 60),
        main_aspiration_label: safeTrackingString(
          payload,
          ['main_aspiration_label', 'quiz_aspiration_label'],
          120
        ),
        quiz_barrier: safeTrackingString(payload, 'quiz_barrier', 60),
        form_first_name: safeTrackingPersonName(payload, 'form_first_name', 120),
        form_email: safeTrackingString(payload, 'form_email', 160),
        form_submitted_at: safeTrackingString(payload, 'form_submitted_at', 40),
        final_cta_type: safeTrackingString(payload, 'cta_type', 60),
        final_cta_clicked_at: safeTrackingString(payload, 'cta_clicked_at', 40),
        updated_at: nowIso(),
      })
    );

    await supabaseRequest('tracking_events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(
        compactObject({
          event_id: safeString(payload.event_id || generateId('evt', 28), 96),
          ...base,
          page_key: safeString(payload.page_key || payload.pageKey, 80),
          event_name: eventName,
          event_at: eventAt,
          step_index: safeInteger(payload.step_index),
          question_index: safeInteger(payload.question_index),
          video_step: safeInteger(payload.video_step),
          video_id: safeString(payload.video_id, 120),
          progress_percent: safeInteger(payload.progress_percent),
          unique_watched_percent: safeInteger(payload.unique_watched_percent),
          properties: trackingPayload,
        })
      ),
    });

    if (payload.video_step || String(eventName).startsWith('video_')) {
      const videoStep = safeInteger(payload.video_step);
      if (videoStep) {
        const videoKey = `${identity.sessionHash}::${videoStep}`;
        await insertIgnoringDuplicates(
          'tracking_video_progress',
          'session_video_key',
          compactObject({
            session_video_key: videoKey,
            session_hash: identity.sessionHash,
            lead_hash: identity.leadHash,
            video_step: videoStep,
            first_seen_at: eventAt,
          })
        );
        await patchByEquals(
          'tracking_video_progress',
          'session_video_key',
          videoKey,
          compactObject({
            ...base,
            session_video_key: videoKey,
            video_step: videoStep,
            video_id: safeTrackingString(payload, 'video_id', 120),
            duration_seconds: safeTrackingInteger(payload, 'duration_seconds'),
            unique_watched_seconds: safeTrackingInteger(payload, 'unique_watched_seconds'),
            unique_watched_percent: safeTrackingInteger(payload, [
              'unique_watched_percent',
              'progress_percent',
            ]),
            max_playhead_percent: safeTrackingInteger(payload, 'max_playhead_percent'),
            seek_count: safeTrackingInteger(payload, 'seek_count'),
            watched_ranges: hasTrackingValue(payload.watched_ranges)
              ? payload.watched_ranges
              : undefined,
            unlocked_at: eventName === 'video_unlocked' ? eventAt : undefined,
            completed_at: eventName === 'video_completed' ? eventAt : undefined,
            last_update_at: eventAt,
            updated_at: nowIso(),
          })
        );
      }
    }
  } catch (error) {
    console.error('Supabase tracking error:', error.message);
  }
}

const PROFILE_STAGE_RANK = {
  profiled: 1,
  video_1_watched: 2,
  video_2_watched: 3,
  video_3_watched: 4,
  interest_signaled: 5,
  product_info_sent: 6,
  info_call_booked: 7,
  info_call_done: 8,
  not_interested: 9,
};

function canonicalSuccessCode(value) {
  const raw = String(value || '')
    .trim()
    .toLowerCase();
  if (!raw) return null;
  if (['r', 'feuer', 'fire', 'typ a', 'tipo a', 'type a'].includes(raw)) return 'feuer';
  if (['y', 'wind', 'typ b', 'tipo b', 'type b'].includes(raw)) return 'wind';
  if (['g', 'wasser', 'water', 'typ c', 'tipo c', 'type c'].includes(raw)) return 'wasser';
  if (['b', 'fels', 'rock', 'typ d', 'tipo d', 'type d'].includes(raw)) return 'fels';
  if (raw.includes('feuer') || raw.includes('fire')) return 'feuer';
  if (raw.includes('wind')) return 'wind';
  if (raw.includes('wasser') || raw.includes('water')) return 'wasser';
  if (raw.includes('fels') || raw.includes('rock')) return 'fels';
  return null;
}

function normalizedEmailHash(email) {
  const normalized = String(email || '')
    .trim()
    .toLowerCase();
  if (!normalized) return null;
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

async function sendMetaCAPILead({
  email,
  firstName,
  clientIp,
  userAgent,
  eventId,
  fbc,
  fbp,
  eventSourceUrl,
  timeoutMs = 2500,
}) {
  const META_PIXEL_ID = process.env.META_PIXEL_ID;
  const META_CAPI_TOKEN = process.env.META_CAPI_TOKEN;
  if (!META_PIXEL_ID || !META_CAPI_TOKEN) return;
  const emailHash = normalizedEmailHash(email);
  if (!emailHash) return;

  const userData = {
    em: [emailHash],
    client_ip_address: clientIp || '',
    client_user_agent: userAgent || '',
  };
  if (firstName) {
    userData.fn = [crypto.createHash('sha256').update(String(firstName).trim().toLowerCase()).digest('hex')];
  }
  const metaFbc = safeString(fbc, 500);
  const metaFbp = safeString(fbp, 120);
  if (metaFbc) userData.fbc = metaFbc;
  if (metaFbp) userData.fbp = metaFbp;

  const payload = {
    data: [
      {
        event_name: 'Lead',
        event_time: Math.floor(Date.now() / 1000),
        event_id: eventId || `capi_${Date.now()}`,
        action_source: 'website',
        event_source_url: safeString(eventSourceUrl, 1000) || 'https://business.activecenter.info/markus',
        user_data: userData,
        custom_data: {
          content_name: 'Erfolgscode Quiz',
          content_category: 'Business Opportunity',
        },
      },
    ],
  };
  if (process.env.META_CAPI_TEST_CODE) {
    payload.test_event_code = process.env.META_CAPI_TEST_CODE;
  }

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeout =
    controller && Number.isFinite(Number(timeoutMs)) && Number(timeoutMs) > 0
      ? setTimeout(() => controller.abort(), Number(timeoutMs))
      : null;
  let response;
  try {
    response = await fetch(
      `https://graph.facebook.com/v21.0/${META_PIXEL_ID}/events?access_token=${META_CAPI_TOKEN}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller ? controller.signal : undefined,
      }
    );
  } finally {
    if (timeout) clearTimeout(timeout);
  }
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    console.warn(`Meta CAPI responded ${response.status}: ${text.slice(0, 200)}`);
  }
}

function watchedVideoStepFromPayload(payload, eventName) {
  const directStep = safeInteger(payload.video_step);
  const uniquePercent = safeInteger(payload.unique_watched_percent);
  const progressPercent = safeInteger(payload.progress_percent);
  const completedByEvent =
    eventName === 'video_completed' ||
    eventName === 'video_unlocked' ||
    uniquePercent >= 95 ||
    progressPercent >= 95;

  if (directStep && completedByEvent) return Math.min(3, directStep);

  const video3 = safeInteger(payload.video3_max_pct);
  if (video3 >= 95) return 3;
  const video2 = safeInteger(payload.video2_max_pct);
  if (video2 >= 95) return 2;
  const video1 = safeInteger(payload.video1_max_pct);
  if (video1 >= 95) return 1;
  return 0;
}

function journeyStateFor({ completedVideoStep, interestSignaled }) {
  if (interestSignaled) {
    return { lifecycleStage: 'interest_signaled', nextStep: 'personal_follow_up' };
  }
  if (completedVideoStep >= 3) {
    return { lifecycleStage: 'video_3_watched', nextStep: 'signal_interest' };
  }
  if (completedVideoStep === 2) {
    return { lifecycleStage: 'video_2_watched', nextStep: 'watch_video_3' };
  }
  if (completedVideoStep === 1) {
    return { lifecycleStage: 'video_1_watched', nextStep: 'watch_video_2' };
  }
  return { lifecycleStage: 'profiled', nextStep: 'watch_video_1' };
}

function strongerStage(currentStage, candidateStage) {
  const currentRank = PROFILE_STAGE_RANK[currentStage] || 0;
  const candidateRank = PROFILE_STAGE_RANK[candidateStage] || 0;
  if (currentStage && !currentRank) return currentStage;
  return candidateRank >= currentRank ? candidateStage : currentStage;
}

async function loadLeadProfile(profileKey) {
  const rows = await supabaseJson(
    `lead_profiles?profile_key=eq.${encodeURIComponent(profileKey)}&select=profile_key,lifecycle_stage,next_step,last_completed_video_step,interest_signaled_at&limit=1`
  );
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function recordLifecycleTransition({ identity, profileKey, fromStage, toStage, nextStep, eventAt }) {
  if (!toStage || fromStage === toStage) return;

  await supabaseRequest('tracking_events', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(
      compactObject({
        event_id: generateId('evt_lifecycle', 28),
        session_hash: identity.sessionHash || profileKey,
        lead_hash: identity.leadHash,
        member_id: identity.memberId,
        berater_slug: identity.slug,
        source_app: identity.sourceApp,
        funnel: identity.funnel,
        event_name: 'lifecycle_stage_changed',
        event_at: eventAt,
        properties: {
          profile_key: profileKey,
          from_stage: fromStage || null,
          to_stage: toStage,
          next_step: nextStep,
        },
      })
    ),
  });
}

async function upsertLeadProfile(payload) {
  const identity = trackingIdentity(payload || {});
  const profileKey = identity.sessionHash || identity.leadHash;
  if (!profileKey) return null;

  try {
    const eventName = eventNameOf(payload);
    const eventAt = safeString(
      payload.event_at ||
        payload.form_submitted_at ||
        payload.quiz_completed_at ||
        payload.cta_clicked_at ||
        nowIso(),
      40
    );
    const current = await loadLeadProfile(profileKey);
    const currentVideoStep = safeInteger(current?.last_completed_video_step) || 0;
    const eventVideoStep = watchedVideoStepFromPayload(payload, eventName);
    const completedVideoStep = Math.max(currentVideoStep, eventVideoStep);
    const ctaType = String(payload.cta_type || payload.final_cta_type || '').toLowerCase();
    const email = safeString(payload.form_email || payload.email, 160);
    const successCode = canonicalSuccessCode(
      payload.success_code || payload.quiz_profile || payload.profile_code || payload.profile
    );
    const mainAspiration = safeString(payload.main_aspiration || payload.quiz_aspiration, 60);
    const hasProfileSignal =
      email ||
      successCode ||
      mainAspiration ||
      payload.form_submitted_at ||
      payload.quiz_completed_at ||
      eventVideoStep > 0 ||
      ctaType;
    if (!current && !hasProfileSignal) return null;

    const interestSignaled =
      current?.interest_signaled_at ||
      ctaType === 'whatsapp' ||
      ctaType === 'interest' ||
      ctaType === 'interested';
    const state = journeyStateFor({
      completedVideoStep,
      interestSignaled: Boolean(interestSignaled),
    });
    const lifecycleStage = strongerStage(current?.lifecycle_stage, state.lifecycleStage);
    const nextStep =
      lifecycleStage === current?.lifecycle_stage && current?.next_step
        ? current.next_step
        : state.nextStep;
    const emailNormalized = email ? email.trim().toLowerCase() : null;
    const tags = [
      successCode ? `ac:profile:${successCode}` : null,
      mainAspiration ? `ac:goal:${mainAspiration}` : null,
      payload.lang ? `ac:lang:${normalizeLanguage(payload.lang)}` : null,
      `ac:next:${nextStep}`,
    ].filter(Boolean);

    const record = compactObject({
      profile_key: profileKey,
      session_hash: identity.sessionHash || undefined,
      lead_hash: identity.leadHash || undefined,
      email_normalized: emailNormalized || undefined,
      email_hash: normalizedEmailHash(emailNormalized) || undefined,
      first_name: safeTrackingPersonName(payload, ['form_first_name', 'first_name'], 120),
      lang: payload.lang ? normalizeLanguage(payload.lang) : undefined,
      country: safeTrackingString(payload, 'country', 5),
      member_id: identity.memberId || undefined,
      berater_slug: identity.slug || undefined,
      source_app: identity.sourceApp || undefined,
      funnel: identity.funnel || undefined,
      success_code: successCode || undefined,
      success_code_label: safeTrackingString(payload, ['quiz_profile_name', 'profile_name'], 100),
      main_aspiration: mainAspiration || undefined,
      main_aspiration_label: safeTrackingString(
        payload,
        ['main_aspiration_label', 'quiz_aspiration_label'],
        120
      ),
      initial_barrier: safeTrackingString(payload, 'quiz_barrier', 60),
      lifecycle_stage: lifecycleStage,
      next_step: nextStep,
      last_completed_video_step: completedVideoStep,
      profiled_at:
        payload.form_submitted_at || payload.quiz_completed_at || email || successCode
          ? eventAt
          : undefined,
      video_1_watched_at: eventVideoStep === 1 ? eventAt : undefined,
      video_2_watched_at: eventVideoStep === 2 ? eventAt : undefined,
      video_3_watched_at: eventVideoStep === 3 ? eventAt : undefined,
      interest_signaled_at: !current?.interest_signaled_at && interestSignaled ? eventAt : undefined,
      tags,
      last_event_name: eventName,
      last_event_at: eventAt,
      updated_at: nowIso(),
    });

    await supabaseRequest('lead_profiles?on_conflict=profile_key', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(record),
    });

    await recordLifecycleTransition({
      identity,
      profileKey,
      fromStage: current?.lifecycle_stage || null,
      toStage: lifecycleStage,
      nextStep,
      eventAt,
    });

    return { profileKey, lifecycleStage, nextStep };
  } catch (error) {
    console.error('Lead profile update error:', error.message);
    return null;
  }
}

function numericPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(100, number));
}

function leadHashOf(payload) {
  const direct = safeString(payload?.lead_hash, 96);
  if (isLeadHash(direct)) return direct;
  const hash = safeString(payload?.hash, 96);
  return isLeadHash(hash) ? hash : '';
}

async function supabaseRpc(functionName, body = {}) {
  const response = await supabaseRequest(`rpc/${functionName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(body),
  });
  return response ? response.json() : null;
}

async function ensureLeadStateForCanonicalMirror(leadHash, payload, eventAt) {
  if (!isLeadHash(leadHash)) return;

  await supabaseRequest('lead_state?on_conflict=lead_hash', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Prefer: 'resolution=ignore-duplicates,return=minimal',
    },
    body: JSON.stringify(
      compactObject({
        lead_hash: leadHash,
        client_seed: safeString(payload.client_seed, 120) || undefined,
        member_id: safeString(payload.member_id || payload.herbalife_id, 120) || undefined,
        ref_id:
          safeString(payload.ref_id || payload.member_id || payload.herbalife_id, 120) ||
          undefined,
        ref_type: 'member',
        berater_slug: safeString(payload.berater_slug || payload.slug, 80) || undefined,
        source_app: safeString(payload.source_app || 'business_leads_quiz', 80),
        funnel_key: safeString(payload.funnel_key || payload.funnel || 'business', 80),
        lang: normalizeLanguage(payload.lang),
        country: safeString(payload.country, 5) || undefined,
        initial_barrier: safeString(payload.initial_barrier || payload.quiz_barrier, 120) || undefined,
        first_seen_at: eventAt,
        last_seen_at: eventAt,
        last_event_at: eventAt,
      })
    ),
  });
}

async function insertCanonicalLeadEvent(leadHash, eventName, eventAt, payload) {
  const eventUid = safeString(payload.event_id || payload.event_uid, 96) || generateId('evt_legacy', 28);
  await supabaseRequest('lead_events?on_conflict=event_uid', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Prefer: 'resolution=ignore-duplicates,return=minimal',
    },
    body: JSON.stringify(
      compactObject({
        event_uid: eventUid,
        lead_hash: leadHash,
        event_name: eventName,
        event_at: eventAt,
        member_id: safeString(payload.member_id || payload.herbalife_id, 120) || null,
        ref_id: safeString(payload.ref_id || payload.member_id || payload.herbalife_id, 120) || null,
        berater_slug: safeString(payload.berater_slug || payload.slug, 80) || null,
        source_app: safeString(payload.source_app || 'business_leads_quiz', 80),
        funnel_key: safeString(payload.funnel_key || payload.funnel || 'business', 80),
        video_step: payload.video_step ? safeInteger(payload.video_step) : null,
        question_ref: safeString(payload.question_ref, 120) || null,
        unique_watched_percent:
          payload.unique_watched_percent === undefined && payload.progress_percent === undefined
            ? null
            : numericPercent(payload.unique_watched_percent ?? payload.progress_percent),
        playhead_percent:
          payload.max_playhead_percent === undefined && payload.playhead_percent === undefined
            ? null
            : numericPercent(payload.max_playhead_percent ?? payload.playhead_percent),
        payload: { ...payload, lead_hash: leadHash },
      })
    ),
  });
}

async function enqueueLeadSync(leadHash, syncType, contextData) {
  await supabaseRpc('enqueue_lead_sync', {
    p_lead_hash: leadHash,
    p_sync_type: syncType,
    p_context_data: contextData || {},
  });
}

async function mirrorLegacyTrackingToLeadSystemV2(payload) {
  const leadHash = leadHashOf(payload);
  if (!leadHash) return { mirrored: false, reason: 'missing_canonical_lead_hash' };

  const eventName = normalizeLeadEventName(eventNameOf(payload));
  const eventAt = safeString(
    payload.event_at ||
      payload.visited_at ||
      payload.form_submitted_at ||
      payload.submitted_at ||
      payload.cta_clicked_at ||
      payload.result_cta_clicked_at ||
      nowIso(),
    40
  );
  const lang = normalizeLanguage(payload.lang);

  await ensureLeadStateForCanonicalMirror(leadHash, payload, eventAt);
  await insertCanonicalLeadEvent(leadHash, eventName, eventAt, payload);

  if (eventName === 'form_submitted') {
    const email = safeString(payload.email || payload.form_email, 180)?.toLowerCase() || null;
    await patchByEquals(
      'lead_state',
      'lead_hash',
      leadHash,
      compactObject({
        first_name: normalizePersonName(payload.first_name || payload.form_first_name, 120) || null,
        email,
        email_normalized: email,
        email_hash: normalizedEmailHash(email),
        form_submitted_at: safeString(payload.submitted_at || payload.form_submitted_at || eventAt, 40),
        initial_barrier: safeString(payload.initial_barrier || payload.quiz_barrier, 120) || undefined,
        lifecycle_stage: 'contact_known',
        lang,
        last_event_at: eventAt,
      })
    );
    return { mirrored: true, eventName };
  }

  if (eventName === 'video_progress' || eventName === 'video_unlocked' || eventName === 'video_completed') {
    const videoStep = safeInteger(payload.video_step);
    if (!videoStep) return { mirrored: true, eventName, skipped_progress: true };

    const progressPercent = numericPercent(payload.unique_watched_percent ?? payload.progress_percent);
    const playheadPercent = numericPercent(payload.max_playhead_percent ?? payload.playhead_percent);
    const rankRows = await supabaseRpc('upsert_video_progress_monotonic', {
      p_lead_hash: leadHash,
      p_video_step: videoStep,
      p_video_id: safeString(payload.video_id, 120) || null,
      p_unique_watched_percent: eventName === 'video_completed' ? Math.max(progressPercent, 100) : progressPercent,
      p_playhead_percent: eventName === 'video_completed' ? Math.max(playheadPercent, 100) : playheadPercent,
      p_unique_watched_seconds: safeInteger(payload.unique_watched_seconds) || 0,
      p_event_at: eventAt,
      p_lang: lang,
    });
    const rankResult = Array.isArray(rankRows) ? rankRows[0] : rankRows;
    if (rankResult?.rank_changed === true && safeInteger(rankResult.completed_rank) >= 3) {
      await enqueueLeadSync(leadHash, 'coach_hot_lead_email', {
        lang,
        rank: safeInteger(rankResult.completed_rank),
        reason: 'all_videos_completed',
        event_at: eventAt,
        video_step: videoStep,
      });
    }
    return { mirrored: true, eventName, rank: rankResult?.completed_rank ?? null };
  }

  if (eventName === 'cta_clicked') {
    await patchByEquals(
      'lead_state',
      'lead_hash',
      leadHash,
      compactObject({
        cta_type: safeString(payload.cta_type, 80) || undefined,
        cta_clicked_at: safeString(payload.cta_clicked_at || eventAt, 40),
        lifecycle_stage: 'cta_clicked',
        last_event_at: eventAt,
      })
    );
    return { mirrored: true, eventName };
  }

  await patchByEquals('lead_state', 'lead_hash', leadHash, { last_event_at: eventAt });
  return { mirrored: true, eventName };
}

async function writeToSupabaseAsync(payload) {
  try {
    if (!SUPABASE_URL || !SUPABASE_KEY) return;
    if (!payload.hash) return;

    await writeTrackingEvent(payload);

    await mirrorLegacyTrackingToLeadSystemV2(payload).catch((error) => {
      console.error('Canonical lead mirror error:', error.message);
    });

    await upsertLeadProfile(payload);

    const fullUpsertData = {
      hash: payload.hash,
      herbalife_id: payload.herbalife_id || null,
      berater_slug: payload.berater_slug || null,
      visited_at: payload.visited_at || null,
      country: payload.country || null,
      device_type: payload.device_type || null,
      lang: payload.lang || null,
      quiz_profile: payload.quiz_profile || null,
      quiz_profile_name: payload.quiz_profile_name || null,
      quiz_aspiration: payload.quiz_aspiration || null,
      quiz_barrier: payload.quiz_barrier || null,
      quiz_completed_at: payload.quiz_completed_at || null,
      form_first_name: normalizePersonName(payload.form_first_name, 120) || null,
      form_email: payload.form_email || null,
      form_submitted_at: payload.form_submitted_at || null,
      video1_watched_sec: payload.video1_watched_sec || 0,
      video1_max_pct: payload.video1_max_pct || 0,
      video1_last_update: payload.video1_last_update || null,
      video2_watched_sec: payload.video2_watched_sec || 0,
      video2_max_pct: payload.video2_max_pct || 0,
      video2_last_update: payload.video2_last_update || null,
      video3_watched_sec: payload.video3_watched_sec || 0,
      video3_max_pct: payload.video3_max_pct || 0,
      video3_last_update: payload.video3_last_update || null,
      cta_type: payload.cta_type || null,
      cta_clicked_at: payload.cta_clicked_at || null,
    };

    const partialUpdateData = {};
    const updateFields = [
      'hash',
      'herbalife_id',
      'berater_slug',
      'visited_at',
      'country',
      'device_type',
      'lang',
      'quiz_profile',
      'quiz_profile_name',
      'quiz_aspiration',
      'quiz_barrier',
      'quiz_completed_at',
      'form_first_name',
      'form_email',
      'form_submitted_at',
      'video1_watched_sec',
      'video1_max_pct',
      'video1_last_update',
      'video2_watched_sec',
      'video2_max_pct',
      'video2_last_update',
      'video3_watched_sec',
      'video3_max_pct',
      'video3_last_update',
      'cta_type',
      'cta_clicked_at',
    ];

    updateFields.forEach((field) => {
      if (field in payload) partialUpdateData[field] = payload[field];
    });

    const checkResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/quiz_sessions?hash=eq.${payload.hash}&select=id`,
      {
        method: 'GET',
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
      }
    );

    const existingRecords = await checkResponse.json();
    const recordExists = Array.isArray(existingRecords) && existingRecords.length > 0;

    await fetch(
      recordExists
        ? `${SUPABASE_URL}/rest/v1/quiz_sessions?hash=eq.${payload.hash}`
        : `${SUPABASE_URL}/rest/v1/quiz_sessions`,
      {
        method: recordExists ? 'PATCH' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
        body: JSON.stringify(recordExists ? partialUpdateData : fullUpsertData),
      }
    );
  } catch (error) {
    console.error('Supabase error:', error.message);
  }
}

async function persistBusinessSubmissionForResume(input) {
  const hidden = input?.hidden || {};
  const sessionHash = safeString(hidden.session_hash || hidden.tracking_hash || hidden.hash, 96);
  const leadHash = safeString(hidden.lead_hash || hidden.hash, 96);
  if (!sessionHash && !leadHash) return;

  const selectedAnswers = Array.isArray(input.selected_answers) ? input.selected_answers : [];
  const profile = input.profile && typeof input.profile === 'object' ? input.profile : {};
  const profileCode = safeString(profile.code, 40);
  const profileName = safeString(profile.name || profile.animal, 100);
  const aspiration = safeString(input.main_aspiration || hidden.main_aspiration, 60);
  const barrier = safeString(
    selectedAnswers.find((answer) => answer && answer.barrier)?.barrier,
    60
  );
  const submittedAt = safeString(input.submitted_at || nowIso(), 40);

  await writeToSupabaseAsync({
    hash: leadHash || sessionHash,
    session_hash: sessionHash || leadHash,
    lead_hash: leadHash || sessionHash,
    herbalife_id: safeString(hidden.member_id || hidden.ref_id, 80),
    member_id: safeString(hidden.member_id || hidden.ref_id, 80),
    berater_slug: safeString(hidden.berater_slug || hidden.slug || hidden.coach_slug, 80),
    source_app: 'business_leads_quiz',
    funnel: 'business',
    lang: safeString(hidden.lang, 10),
    quiz_profile: profileCode,
    quiz_profile_name: profileName,
    quiz_aspiration: aspiration,
    main_aspiration: aspiration,
    main_aspiration_label: safeString(input.main_aspiration_label || hidden.main_aspiration_label, 120),
    quiz_barrier: barrier,
    form_first_name: normalizePersonName(input.first_name, 120),
    form_email: safeString(input.email, 160),
    form_submitted_at: submittedAt,
    event_name: 'form_submit',
    event_at: submittedAt,
  });
}

async function proxyToBridgeOnce(body, forwardedFor, userAgent, timeoutMs) {
  if (!BRIDGE_KEY) {
    return {
      status: 500,
      data: { error: 'Server configuration error' },
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(BRIDGE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Bridge-Key': BRIDGE_KEY,
        'X-Forwarded-For': forwardedFor || '',
        'User-Agent': userAgent || '',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    const isTimeout = err.name === 'AbortError';
    console.error('proxyToBridge fetch error:', err.message);
    return { status: isTimeout ? 504 : 502, data: { error: isTimeout ? 'upstream_timeout' : 'upstream_error' } };
  }
  clearTimeout(timer);

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (_) {
    data = { raw: text };
  }
  if (response.status >= 400) {
    console.error(`proxyToBridgeOnce upstream ${response.status}:`, text.slice(0, 500));
  }
  return { status: response.status, data };
}

async function proxyToBridge(body, forwardedFor, userAgent, timeoutMs = 8000) {
  const result = await proxyToBridgeOnce(body, forwardedFor, userAgent, timeoutMs);
  if (result.status >= 500) {
    console.warn(`proxyToBridge first attempt returned ${result.status}, retrying in 1.5s…`);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return proxyToBridgeOnce(body, forwardedFor, userAgent, timeoutMs);
  }
  return result;
}

async function ensureBusinessSubmissionIdentity(input, forwardedFor, userAgent) {
  const payload = {
    ...(input || {}),
    hidden: { ...((input && input.hidden) || {}) },
  };
  const hidden = payload.hidden;
  const slug = firstValidSlug(
    hidden.berater_slug ||
      '',
    hidden.slug,
    hidden.coach_slug,
    payload.berater_slug,
    payload.slug,
    payload.coach_slug
  );
  let memberId = safeString(
    hidden.member_id ||
      hidden.ref_id ||
      hidden.herbalife_id ||
      payload.member_id ||
      payload.ref_id ||
      payload.herbalife_id,
    80
  );

  if (!slug) {
    return { ok: false, status: 422, error: 'missing_coach_slug' };
  }

  if (!memberId) {
    const lookup = await proxyToBridge(
      { action: 'lookup_subdomain', subdomain: slug },
      forwardedFor,
      userAgent
    );

    if (lookup.status >= 500) {
      return { ok: false, status: 503, error: 'coach_lookup_unavailable' };
    }
    if (lookup.status !== 200) {
      return { ok: false, status: 422, error: 'coach_lookup_failed' };
    }

    memberId = safeString(lookup.data?.herbalife_id || lookup.data?.member_id, 80);
    if (!memberId) {
      return { ok: false, status: 422, error: 'missing_member_id' };
    }
  }

  if (!normalizeResumeSlug(hidden.berater_slug)) hidden.berater_slug = slug;
  if (!normalizeResumeSlug(hidden.slug)) hidden.slug = slug;
  hidden.member_id = memberId;
  hidden.ref_id = hidden.ref_id || memberId;
  payload.member_id = payload.member_id || memberId;
  payload.ref_id = payload.ref_id || memberId;
  return { ok: true, payload };
}

async function sendPostmarkEmail(message) {
  if (!POSTMARK_SERVER_TOKEN) {
    return {
      ok: false,
      status: 501,
      data: { error: 'POSTMARK_SERVER_TOKEN is not configured' },
    };
  }

  const response = await fetch('https://api.postmarkapp.com/email', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Postmark-Server-Token': POSTMARK_SERVER_TOKEN,
    },
    body: JSON.stringify(message),
  });

  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  return { ok: response.ok, status: response.status, data };
}

async function sendIdentityAlertEmail({ payload, error, forwardedFor, userAgent }) {
  if (!IDENTITY_ALERT_EMAIL) return { ok: false, status: 501, data: { error: 'alert_email_missing' } };

  const hidden = payload?.hidden || {};
  const firstName = normalizePersonName(payload?.first_name, 120) || '';
  const email = safeString(payload?.email, 160) || '';
  const slug = safeString(
    hidden.berater_slug || hidden.slug || hidden.coach_slug || payload?.berater_slug || payload?.slug,
    80
  ) || '';
  const leadHash = safeString(hidden.lead_hash || hidden.hash, 96) || '';
  const sessionHash = safeString(hidden.session_hash || hidden.tracking_hash, 96) || '';
  const submittedAt = safeString(payload?.submitted_at || nowIso(), 40) || nowIso();
  const subjectName = firstName || email || leadHash || 'unbekannter Kontakt';
  const rows = [
    ['Fehler', error],
    ['Name', firstName],
    ['E-Mail', email],
    ['Slug', slug],
    ['Lead Hash', leadHash],
    ['Session Hash', sessionHash],
    ['Zeitpunkt', submittedAt],
    ['IP', safeString(forwardedFor, 120) || ''],
    ['User Agent', safeString(userAgent, 240) || ''],
  ];
  const textBody = [
    'Business Leads Quiz: Kontakt ohne sichere Member-ID blockiert',
    '',
    ...rows.map(([label, value]) => `${label}: ${value || '-'}`),
    '',
    'Der externe Webhook wurde nicht weitergeleitet. Bitte den Kontakt pruefen und bei Bedarf manuell nachfassen.',
  ].join('\n');
  const htmlRows = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:6px 10px;color:#64748b;">${escapeHtml(label)}</td><td style="padding:6px 10px;color:#0f172a;font-weight:600;">${escapeHtml(value || '-')}</td></tr>`
    )
    .join('');

  return sendPostmarkEmail({
    From: POSTMARK_FROM,
    To: IDENTITY_ALERT_EMAIL,
    Subject: `Business Leads Quiz: Member-ID fehlt (${subjectName})`,
    HtmlBody: `
      <div style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.5;">
        <h2 style="margin:0 0 12px;">Kontakt ohne sichere Member-ID blockiert</h2>
        <p>Der externe Webhook wurde nicht weitergeleitet, weil keine sichere Member-ID ermittelt werden konnte.</p>
        <table style="border-collapse:collapse;background:#f8fafc;border:1px solid #e2e8f0;">${htmlRows}</table>
        <p style="color:#64748b;font-size:13px;">Bitte den Kontakt pruefen und bei Bedarf manuell nachfassen.</p>
      </div>`,
    TextBody: textBody,
    MessageStream: POSTMARK_MESSAGE_STREAM,
    Metadata: {
      alert_type: 'missing_member_id',
      lead_hash: leadHash,
      session_hash: sessionHash,
      berater_slug: slug,
      error,
    },
  });
}

function isLeadHash(value) {
  return /^qz_[a-z0-9_-]+$/i.test(String(value || '').trim());
}

function buildPointsResultLabel(completedCount, totalVideos, lang) {
  const count = Math.max(0, Math.min(safeInteger(completedCount) || 0, safeInteger(totalVideos) || 3));
  const total = Math.max(1, safeInteger(totalVideos) || 3);
  const language = normalizeLanguage(lang);

  const copy = {
    de: {
      none: 'Noch kein Infovideo vollständig angeschaut',
      one: 'Infovideo 1 vollständig angeschaut',
      some: (value) => `Infovideo ${value} von ${total} vollständig angeschaut`,
      all: `Alle ${total} Infovideos vollständig angeschaut`,
    },
    it: {
      none: 'Nessun video informativo guardato completamente',
      one: 'Video informativo 1 guardato completamente',
      some: (value) => `Video informativo ${value} di ${total} guardato completamente`,
      all: `Tutti e ${total} i video informativi guardati completamente`,
    },
    en: {
      none: 'No info video fully watched yet',
      one: 'Info video 1 fully watched',
      some: (value) => `Info video ${value} of ${total} fully watched`,
      all: `All ${total} info videos fully watched`,
    },
    fr: {
      none: "Aucune vidéo d'information entièrement regardée",
      one: "Vidéo d'information 1 entièrement regardée",
      some: (value) => `Vidéo d'information ${value} sur ${total} entièrement regardée`,
      all: `Les ${total} vidéos d'information entièrement regardées`,
    },
    ru: {
      none: 'Ни одно информационное видео еще не просмотрено полностью',
      one: 'Информационное видео 1 просмотрено полностью',
      some: (value) => `Информационное видео ${value} из ${total} просмотрено полностью`,
      all: `Все ${total} информационных видео просмотрены полностью`,
    },
  };
  const labels = copy[language] || copy.de;
  if (count <= 0) return labels.none;
  if (count >= total) return labels.all;
  if (count === 1) return labels.one;
  return labels.some(count);
}

async function resolvePointsResultContext(payload) {
  const sessionHash = safeString(payload?.session_hash || payload?.tracking_hash, 96);
  const submittedLeadHash = safeString(payload?.lead_hash || payload?.hash, 96);
  let trackingSession = {};
  let leadHash = isLeadHash(submittedLeadHash) ? submittedLeadHash : '';

  if (sessionHash) {
    const trackingRows = await supabaseJson(
      `tracking_sessions?session_hash=eq.${encodeURIComponent(sessionHash)}&select=session_hash,lead_hash,lang,berater_slug,member_id,form_email,form_first_name&limit=1`
    );
    trackingSession = Array.isArray(trackingRows) ? trackingRows[0] || {} : {};
    if (isLeadHash(trackingSession.lead_hash)) {
      leadHash = safeString(trackingSession.lead_hash, 96);
    }
  }

  let quizSession = {};
  if (isLeadHash(leadHash)) {
    const quizRows = await supabaseJson(
      `quiz_sessions?hash=eq.${encodeURIComponent(leadHash)}&select=hash,lang,berater_slug,herbalife_id,form_email,form_first_name&limit=1`
    );
    quizSession = Array.isArray(quizRows) ? quizRows[0] || {} : {};
  }

  const lang = normalizeLanguage(trackingSession.lang, quizSession.lang, payload?.lang);
  const slug = safeString(
    trackingSession.berater_slug || quizSession.berater_slug || payload?.berater_slug || payload?.slug,
    80
  );
  const memberId = safeString(
    trackingSession.member_id || quizSession.herbalife_id || payload?.member_id || payload?.ref_id,
    80
  );
  const email = safeString(trackingSession.form_email || quizSession.form_email || payload?.email, 160);
  const firstName = normalizePersonName(
    trackingSession.form_first_name || quizSession.form_first_name || payload?.first_name,
    120
  );

  return {
    leadHash: isLeadHash(leadHash) ? leadHash : '',
    sessionHash,
    lang,
    slug,
    memberId,
    email,
    firstName,
  };
}

async function sendPointsResultAlertEmail({ error, context = {}, payload = {}, n8nPayload = {}, result = {} }) {
  const rows = [
    ['Fehler', error],
    ['Lead Hash', context.leadHash || n8nPayload.hash || payload.lead_hash || ''],
    ['Session Hash', context.sessionHash || payload.session_hash || ''],
    ['Slug', context.slug || payload.berater_slug || payload.slug || ''],
    ['Member ID', context.memberId || payload.member_id || ''],
    ['Name', normalizePersonName(context.firstName || payload.first_name, 120) || ''],
    ['E-Mail', context.email || payload.email || ''],
    ['Video Step', safeString(payload.video_step, 20) || ''],
    ['Completed Count', safeString(payload.completed_count, 20) || ''],
    ['Label', n8nPayload.personalityType || ''],
    ['n8n Status', safeString(result.status, 20) || ''],
    ['n8n Response', JSON.stringify(result.data || {})],
  ];
  const textBody = [
    'Business Leads Quiz: Points-Result-Update fehlgeschlagen',
    '',
    ...rows.map(([label, value]) => `${label}: ${value || '-'}`),
  ].join('\n');

  return sendPostmarkEmail({
    From: POSTMARK_FROM,
    To: IDENTITY_ALERT_EMAIL,
    Subject: `Points Result Update fehlgeschlagen (${context.leadHash || payload.lead_hash || 'kein lead_hash'})`,
    TextBody: textBody,
    HtmlBody: `<pre style="font-family:Arial,sans-serif;white-space:pre-wrap;">${escapeHtml(textBody)}</pre>`,
    MessageStream: POSTMARK_MESSAGE_STREAM,
    Metadata: {
      alert_type: 'points_result_update_failed',
      lead_hash: context.leadHash || payload.lead_hash || '',
      session_hash: context.sessionHash || payload.session_hash || '',
      error,
    },
  });
}

async function callN8nUpdateResult(payload, timeoutMs = 7000) {
  if (!N8N_UPDATE_RESULT_URL) {
    return {
      status: 0,
      data: { error: 'n8n_update_result_not_configured' },
    };
  }

  const headers = { 'Content-Type': 'application/json' };
  if (N8N_UPDATE_RESULT_SECRET) {
    headers['X-Update-Secret'] = N8N_UPDATE_RESULT_SECRET;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(N8N_UPDATE_RESULT_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timer);
    const text = await response.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }
    return { status: response.status, data };
  } catch (error) {
    clearTimeout(timer);
    return { status: 0, data: { error: error.message || 'n8n_update_failed' } };
  }
}

function pointsResultMatchedRows(result) {
  const matchedRows = Number(result?.data?.matchedRows);
  return Number.isFinite(matchedRows) ? matchedRows : null;
}

function shouldRetryPointsResult(result) {
  const matchedRows = pointsResultMatchedRows(result);
  return result.status === 0 || result.status >= 500 || matchedRows === null || matchedRows === 0;
}

function pointsResultSucceeded(result) {
  const matchedRows = pointsResultMatchedRows(result);
  return (
    result.status >= 200 &&
    result.status < 300 &&
    result.data?.success !== false &&
    matchedRows > 0
  );
}

const HOT_LEAD_EMAIL_I18N = {
  de: {
    subject: (name) => `Hot Lead: ${name} hat alle 3 Videos angesehen`,
    preheader: 'Ein Kontakt hat alle 3 Info-Videos vollständig angeschaut.',
    title: (slug) => `Hot Lead aus business.activecenter.info/${slug || ''}`,
    greeting: (name) => `Hallo ${name},`,
    intro:
      'ein Kontakt hat alle 3 Info-Videos vollständig angeschaut. Das zeigt großes Interesse und ist ein guter Moment für eine persönliche Nachricht.',
    labels: {
      name: 'Name',
      email: 'E-Mail',
      type: 'Typ',
      aspiration: 'Zielsetzung',
      barrier: 'Was ihn aktuell zurückhält',
      completedAt: 'Abgeschlossen am',
    },
    footerReason:
      'Diese Benachrichtigung wurde automatisch erstellt, weil ein Quiz-Kontakt alle 3 Info-Videos vollständig angeschaut hat.',
    privacyLabel: 'Impressum &amp; Datenschutz',
    copyrightLabel: '&copy; HL-Support Ltd. &middot; Alle Rechte vorbehalten',
    profiles: {
      A: 'Typ A Der Macher',
      B: 'Typ B Der Netzwerker',
      C: 'Typ C Der Anker',
      D: 'Typ D Der Architekt',
    },
    aspirations: {
      freedom: 'Freiheit',
      impact: 'Wirkung',
      security: 'Sicherheit',
      growth: 'Wachstum',
    },
    barriers: {
      vehicle: 'ein funktionierendes System',
      community: 'das richtige Umfeld',
      confidence: 'einen sicheren ersten Schritt',
      opportunity: 'die passende Möglichkeit',
    },
  },
  it: {
    subject: (name) => `Hot lead: ${name} ha guardato tutti e 3 i video`,
    preheader: 'Un contatto ha guardato completamente tutti e 3 i video informativi.',
    title: (slug) => `Hot lead da business.activecenter.info/${slug || ''}`,
    greeting: (name) => `Ciao ${name},`,
    intro:
      'un contatto ha guardato completamente tutti e 3 i video informativi. Questo mostra un grande interesse ed è un buon momento per un messaggio personale.',
    labels: {
      name: 'Nome',
      email: 'E-mail',
      type: 'Tipo',
      aspiration: 'Obiettivo',
      barrier: 'Cosa lo trattiene al momento',
      completedAt: 'Completato il',
    },
    footerReason:
      'Questa notifica è stata creata automaticamente perché un contatto del quiz ha guardato completamente tutti e 3 i video informativi.',
    privacyLabel: 'Note legali &amp; privacy',
    copyrightLabel: '&copy; HL-Support Ltd. &middot; Tutti i diritti riservati',
    profiles: {
      A: 'Tipo A Il realizzatore',
      B: 'Tipo B Il connettore',
      C: "Tipo C L'ancora",
      D: "Tipo D L'architetto",
    },
    aspirations: {
      freedom: 'Libertà',
      impact: 'Impatto',
      security: 'Sicurezza',
      growth: 'Crescita',
    },
    barriers: {
      vehicle: 'un sistema che funziona',
      community: "l'ambiente giusto",
      confidence: 'un primo passo sicuro',
      opportunity: "l'opportunità giusta",
    },
  },
  en: {
    subject: (name) => `Hot lead: ${name} watched all 3 videos`,
    preheader: 'A contact has watched all 3 info videos all the way through.',
    title: (slug) => `Hot lead from business.activecenter.info/${slug || ''}`,
    greeting: (name) => `Hi ${name},`,
    intro:
      'a contact has watched all 3 info videos all the way through. This shows strong interest and it is a good moment for a personal message.',
    labels: {
      name: 'Name',
      email: 'Email',
      type: 'Type',
      aspiration: 'Goal',
      barrier: 'What is currently holding them back',
      completedAt: 'Completed on',
    },
    footerReason:
      'This notification was created automatically because a quiz contact watched all 3 info videos all the way through.',
    privacyLabel: 'Legal notice &amp; privacy',
    copyrightLabel: '&copy; HL-Support Ltd. &middot; All rights reserved',
    profiles: {
      A: 'Type A The doer',
      B: 'Type B The connector',
      C: 'Type C The anchor',
      D: 'Type D The architect',
    },
    aspirations: {
      freedom: 'Freedom',
      impact: 'Impact',
      security: 'Security',
      growth: 'Growth',
    },
    barriers: {
      vehicle: 'a working system',
      community: 'the right environment',
      confidence: 'a safe first step',
      opportunity: 'the right opportunity',
    },
  },
  fr: {
    subject: (name) => `Lead chaud : ${name} a regardé les 3 vidéos`,
    preheader: "Un contact a regardé les 3 vidéos d'information jusqu'au bout.",
    title: (slug) => `Lead chaud depuis business.activecenter.info/${slug || ''}`,
    greeting: (name) => `Bonjour ${name},`,
    intro:
      "un contact a regardé les 3 vidéos d'information jusqu'au bout. Cela montre un grand intérêt et c'est un bon moment pour un message personnel.",
    labels: {
      name: 'Nom',
      email: 'E-mail',
      type: 'Type',
      aspiration: 'Objectif',
      barrier: 'Ce qui le bloque actuellement',
      completedAt: 'Terminé le',
    },
    footerReason:
      "Cette notification a été créée automatiquement parce qu'un contact du quiz a regardé les 3 vidéos d'information jusqu'au bout.",
    privacyLabel: 'Mentions légales &amp; confidentialité',
    copyrightLabel: '&copy; HL-Support Ltd. &middot; Tous droits réservés',
    profiles: {
      A: 'Type A Le faiseur',
      B: 'Type B Le connecteur',
      C: "Type C L'ancre",
      D: "Type D L'architecte",
    },
    aspirations: {
      freedom: 'Liberté',
      impact: 'Impact',
      security: 'Sécurité',
      growth: 'Croissance',
    },
    barriers: {
      vehicle: 'un système fonctionnant',
      community: "l'environnement adéquat",
      confidence: 'un premier pas sûr',
      opportunity: "l'opportunité idéale",
    },
  },
  ru: {
    subject: (name) => `Горячий лид: ${name} посмотрел(а) все 3 видео`,
    preheader: 'Контакт полностью посмотрел все 3 информационных видео.',
    title: (slug) => `Горячий лид с business.activecenter.info/${slug || ''}`,
    greeting: (name) => `Здравствуйте, ${name},`,
    intro:
      'контакт полностью посмотрел все 3 информационных видео. Это показывает высокий интерес и это хороший момент для личного сообщения.',
    labels: {
      name: 'Имя',
      email: 'E-mail',
      type: 'Тип',
      aspiration: 'Цель',
      barrier: 'Что сейчас останавливает',
      completedAt: 'Завершено',
    },
    footerReason:
      'Это уведомление было создано автоматически, потому что контакт из квиза полностью посмотрел все 3 информационных видео.',
    privacyLabel: 'Правовая информация и конфиденциальность',
    copyrightLabel: '&copy; HL-Support Ltd. &middot; Все права защищены',
    profiles: {
      A: 'Тип A Деятель',
      B: 'Тип B Соединитель',
      C: 'Тип C Якорь',
      D: 'Тип D Архитектор',
    },
    aspirations: {
      freedom: 'Свобода',
      impact: 'Влияние',
      security: 'Безопасность',
      growth: 'Рост',
    },
    barriers: {
      vehicle: 'работающая система',
      community: 'правильная среда',
      confidence: 'безопасный первый шаг',
      opportunity: 'правильная возможность',
    },
  },
};

function detectCoachLanguage(coach, session, payload) {
  const country = String(coach?.address?.country || coach?.country || '').trim().toUpperCase();
  let overrideMap = DEFAULT_COACH_LANGUAGE_OVERRIDES;
  try {
    overrideMap = {
      ...DEFAULT_COACH_LANGUAGE_OVERRIDES,
      ...JSON.parse(process.env.COACH_LANGUAGE_OVERRIDES_JSON || '{}'),
    };
  } catch (_) { /* ignore parse errors, use defaults */ }
  const slug = String(payload?.berater_slug || payload?.slug || coach?.sub_domain || session?.berater_slug || '')
    .trim()
    .toLowerCase();
  const slugLanguage = overrideMap[slug] || '';
  const countryLanguage =
    {
      DE: 'de',
      AT: 'de',
      CH: 'de',
      IT: 'it',
      FR: 'fr',
      BE: 'fr',
      RU: 'ru',
      GB: 'en',
      UK: 'en',
      US: 'en',
      CA: 'en',
      AU: 'en',
    }[country] || '';
  return normalizeLanguage(
    coach?.preferred_newsletter_language,
    coach?.preferred_language,
    coach?.language,
    coach?.lang,
    coach?.locale,
    session?.coach_preferred_language,
    payload?.coach_language,
    slugLanguage,
    countryLanguage,
    session?.lang,
    payload?.lang,
    'de'
  );
}

function normalizeProfileCode(value) {
  const match = String(value || '').match(/\b([ABCD])\b/i);
  return match ? match[1].toUpperCase() : '';
}

function normalizeProfileInsightSlug(value) {
  const normalized = String(value || '').trim().toLowerCase();
  const profileCode = normalizeProfileCode(value);
  const byCode = {
    A: 'feuer',
    B: 'wind',
    C: 'wasser',
    D: 'fels',
  };
  if (byCode[profileCode]) return byCode[profileCode];
  if (normalized.includes('feuer') || normalized.includes('macher') || normalized.includes('realizzatore')) return 'feuer';
  if (normalized.includes('wind') || normalized.includes('netzwerker') || normalized.includes('connettore')) return 'wind';
  if (normalized.includes('wasser') || normalized.includes('anker') || normalized.includes('ancora')) return 'wasser';
  if (normalized.includes('fels') || normalized.includes('architekt') || normalized.includes('architetto')) return 'fels';
  return '';
}

function normalizeAspirationKey(value) {
  const normalized = String(value || '').trim().toLowerCase();
  const map = {
    freedom: 'freedom',
    freiheit: 'freedom',
    libertà: 'freedom',
    liberta: 'freedom',
    liberté: 'freedom',
    liberte: 'freedom',
    свобода: 'freedom',
    impact: 'impact',
    wirkung: 'impact',
    impatto: 'impact',
    влияние: 'impact',
    security: 'security',
    sicherheit: 'security',
    sicurezza: 'security',
    sécurité: 'security',
    securite: 'security',
    безопасность: 'security',
    growth: 'growth',
    wachstum: 'growth',
    crescita: 'growth',
    croissance: 'growth',
    рост: 'growth',
  };
  return map[normalized] || '';
}

function buildCoachInsightsUrl(profileValue, aspirationValue) {
  const params = [];
  const profileSlug = normalizeProfileInsightSlug(profileValue);
  const aspirationSlug = normalizeAspirationKey(aspirationValue);
  if (profileSlug) params.push(`type=${encodeURIComponent(profileSlug)}`);
  if (aspirationSlug) params.push(`goal=${encodeURIComponent(aspirationSlug)}`);
  const query = params.join('&');
  return query ? `${COACH_INSIGHTS_BASE_URL}?${query}` : COACH_INSIGHTS_BASE_URL;
}

function normalizeBarrierKey(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (
    normalized === 'vehicle' ||
    normalized.includes('system') ||
    normalized.includes('sistema') ||
    normalized.includes('système') ||
    normalized.includes('система')
  ) {
    return 'vehicle';
  }
  if (
    normalized === 'community' ||
    normalized.includes('umfeld') ||
    normalized.includes('ambiente') ||
    normalized.includes('environnement') ||
    normalized.includes('сред')
  ) {
    return 'community';
  }
  if (
    normalized === 'confidence' ||
    normalized.includes('schritt') ||
    normalized.includes('passo') ||
    normalized.includes('pas ') ||
    normalized.includes('шаг')
  ) {
    return 'confidence';
  }
  if (
    normalized === 'opportunity' ||
    normalized.includes('möglichkeit') ||
    normalized.includes('opportun') ||
    normalized.includes('opportunité') ||
    normalized.includes('возмож')
  ) {
    return 'opportunity';
  }
  return '';
}

function formatLocalizedDateTime(value, lang) {
  const date = new Date(value || nowIso());
  if (Number.isNaN(date.getTime())) return '';
  const formatter = new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  if (lang === 'it' || lang === 'fr') {
    return `${parts.day}/${parts.month}/${parts.year} - ${parts.hour}:${parts.minute}`;
  }
  if (lang === 'en') {
    return `${parts.month}/${parts.day}/${parts.year} - ${parts.hour}:${parts.minute}`;
  }
  if (lang === 'ru') {
    return `${parts.day}.${parts.month}.${parts.year} - ${parts.hour}:${parts.minute}`;
  }
  return `${parts.day}.${parts.month}.${parts.year} - ${parts.hour}:${parts.minute} Uhr`;
}

function buildDefaultFooter(reason, lang = 'de') {
  const copy = HOT_LEAD_EMAIL_I18N[lang] || HOT_LEAD_EMAIL_I18N.de;
  return [
    `<p style="margin:0 0 10px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#999999;">${escapeHtml(reason)}</p>`,
    `<p style="margin:0 0 10px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#999999;"><a href="${BRAND_PRIVACY_URL}" style="color:#999999;text-decoration:underline;">${copy.privacyLabel}</a></p>`,
    `<p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#999999;">${copy.copyrightLabel}</p>`,
  ].join('');
}

function buildBrandedEmailShell({ preheader, bodyHtml, footerHtml, brandName = 'Activecenter' }) {
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="x-apple-disable-message-reformatting" />
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title></title>
  <style type="text/css" rel="stylesheet" media="all">
    #outlook a { padding: 0; }
    body { width: 100% !important; height: 100%; margin: 0; -webkit-text-size-adjust: none; -ms-text-size-adjust: 100%; }
    a img { border: none; }
    td { word-break: break-word; }
    body, td, th { font-family: Arial, Helvetica, sans-serif; }
    td, th { font-size: 16px; }
    p, ul, ol { margin: 0 0 18px 0; font-size: 16px; line-height: 1.65; color: #2d2d2d; }
    p:last-child { margin-bottom: 0; }
    a { color: #212529; text-decoration: underline; }
    .email-wrapper    { width: 100%; margin: 0; padding: 0; background-color: #f0f0f0; }
    .email-body_inner { width: 570px; margin: 0 auto; padding: 0; background-color: #ffffff; }
    .content-cell     { padding: 36px 40px; }
    .email-footer     { width: 570px; margin: 0 auto; padding: 0; text-align: center; }
    .email-footer p   { color: #999999; font-size: 12px; line-height: 1.6; }
    .email-footer a   { color: #999999; text-decoration: underline; }
    .email-masthead   { background-color: #212529; padding: 16px 24px; }
    @media only screen and (max-width: 600px) {
      .email-body_inner, .email-footer { width: 100% !important; }
      .content-cell   { padding: 24px 20px !important; }
      .email-masthead { padding: 14px 16px !important; }
      .logo-img       { width: 150px !important; }
    }
    :root { color-scheme: light; }
  </style>
  <!--[if mso]><style type="text/css">body,td,th,p,a,.f-fallback{font-family:Arial,sans-serif !important;}</style><![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#f0f0f0;-webkit-text-size-adjust:none;-ms-text-size-adjust:100%;" bgcolor="#f0f0f0">
<table class="email-wrapper" width="100%" cellpadding="0" cellspacing="0" role="presentation" bgcolor="#f0f0f0">
<tr><td align="center" style="padding:24px 8px;">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation">
  <tr><td>
    <table class="email-body_inner" align="center" width="570" cellpadding="0" cellspacing="0" role="presentation" style="border-radius:4px 4px 0 0;overflow:hidden;">
      <tr><td class="email-masthead" bgcolor="#212529" style="background-color:#212529;padding:16px 24px;border-radius:4px 4px 0 0;">
        <img src="${BRAND_LOGO_URL}" width="180" alt="${escapeHtml(brandName)}" class="logo-img f-fallback" style="display:block;border:0;outline:none;text-decoration:none;height:auto;width:180px;max-width:180px;" />
      </td></tr>
    </table>
  </td></tr>
  <tr><td width="570" cellpadding="0" cellspacing="0">
    <table class="email-body_inner" align="center" width="570" cellpadding="0" cellspacing="0" role="presentation" bgcolor="#ffffff">
      <tr><td class="content-cell f-fallback" style="padding:36px 40px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.65;color:#2d2d2d;">
        <span style="display:none !important;visibility:hidden;mso-hide:all;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${escapeHtml(preheader || '')}</span>
        ${bodyHtml}
      </td></tr>
    </table>
  </td></tr>
  <tr><td>
    <table class="email-footer" align="center" width="570" cellpadding="0" cellspacing="0" role="presentation">
      <tr><td class="content-cell f-fallback" align="center" style="padding:24px 40px 32px 40px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#999999;text-align:center;">
        ${footerHtml}
      </td></tr>
    </table>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

function buildAllVideosCompletedCoachEmail({ session, coach, payload }) {
  const lang = detectCoachLanguage(coach, session, payload);
  const copy = HOT_LEAD_EMAIL_I18N[lang] || HOT_LEAD_EMAIL_I18N.de;
  const firstName = normalizePersonName(session.form_first_name || payload.first_name, 120) || 'Interessent';
  const email = session.form_email || payload.email || '';
  const rawProfileCode = session.quiz_profile || payload.quiz_profile || '';
  const profileCode = normalizeProfileCode(rawProfileCode);
  const fallbackProfile = [rawProfileCode, session.quiz_profile_name || payload.quiz_profile_name]
    .filter(Boolean)
    .join(' - ');
  const profileLabel = copy.profiles[profileCode] || fallbackProfile || '-';
  const rawAspiration =
    session.main_aspiration_label || session.quiz_aspiration || payload.quiz_aspiration || '';
  const aspiration = copy.aspirations[normalizeAspirationKey(rawAspiration)] || rawAspiration || '-';
  const rawBarrier = session.quiz_barrier || payload.quiz_barrier || '';
  const barrier = copy.barriers[normalizeBarrierKey(rawBarrier)] || rawBarrier || '-';
  const insightsUrl = buildCoachInsightsUrl(fallbackProfile || rawProfileCode, rawAspiration);
  const completedAt = formatLocalizedDateTime(payload.completed_at || nowIso(), lang);
  const slug = String(payload.berater_slug || payload.slug || session.berater_slug || '').toLowerCase().trim();
  const coachFirstName = coach.first_name || 'Markus';
  const brandName = coach.organisation_name || coach.org_name || coach.company || 'Activecenter';
  const subject = copy.subject(firstName);
  const rows = [
    [copy.labels.name, firstName],
    [copy.labels.email, email],
    [copy.labels.type, profileLabel],
    [copy.labels.aspiration, aspiration],
    [copy.labels.completedAt, completedAt],
  ];
  if (barrier && barrier !== '-') {
    rows.splice(4, 0, [copy.labels.barrier, barrier]);
  }
  const insightsLinkHtml = `<p style="margin:24px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.65;color:#2d2d2d;"><a href="${escapeHtml(insightsUrl)}" style="color:#212529;text-decoration:underline;font-weight:700;">Erfahre hier mehr zu deinem Kontakt</a></p>`;
  const htmlRows = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:10px 0;border-bottom:1px solid #e6e6e6;font-weight:700;width:180px;">${escapeHtml(label)}</td><td style="padding:10px 0;border-bottom:1px solid #e6e6e6;">${escapeHtml(value)}</td></tr>`
    )
    .join('');
  const textRows = rows.map(([label, value]) => `${label}: ${value || '-'}`).join('\n');
  const bodyHtml = [
    `<h1 style="margin:0 0 20px 0;font-family:Arial,Helvetica,sans-serif;font-size:28px;line-height:1.3;color:#212529;">${escapeHtml(copy.title(slug))}</h1>`,
    `<p style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.65;color:#2d2d2d;">${escapeHtml(copy.greeting(coachFirstName))}</p>`,
    `<p style="margin:0 0 24px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.65;color:#2d2d2d;">${escapeHtml(copy.intro)}</p>`,
    '<table style="width:100%;border-collapse:collapse;margin:0 0 8px 0;">',
    htmlRows,
    '</table>',
    insightsLinkHtml,
  ].join('');

  return {
    to: coach.email,
    subject,
    html: buildBrandedEmailShell({
      preheader: copy.preheader,
      bodyHtml,
      brandName,
      footerHtml: buildDefaultFooter(copy.footerReason, lang),
    }),
    text: [
      copy.title(slug),
      '',
      copy.greeting(coachFirstName),
      '',
      copy.intro,
      '',
      textRows,
      '',
      `Erfahre hier mehr zu deinem Kontakt: ${insightsUrl}`,
    ].join('\n'),
  };
}

async function loadCompletionNotificationContext(payload, forwardedFor, userAgent) {
  const leadHash = safeString(payload.lead_hash || payload.hash, 96);
  const sessionHash = safeString(payload.session_hash || payload.tracking_hash, 96);
  const sessionRows = sessionHash
    ? await supabaseJson(
        `tracking_sessions?session_hash=eq.${encodeURIComponent(sessionHash)}&select=*&limit=1`
      )
    : leadHash
      ? await supabaseJson(
          `tracking_sessions?lead_hash=eq.${encodeURIComponent(leadHash)}&select=*&limit=1`
        )
      : [];
  const trackingSession = Array.isArray(sessionRows) ? sessionRows[0] || {} : {};
  const quizRows = leadHash
    ? await supabaseJson(`quiz_sessions?hash=eq.${encodeURIComponent(leadHash)}&select=*&limit=1`)
    : [];
  const quizSession = Array.isArray(quizRows) ? quizRows[0] || {} : {};
  const session = {
    ...trackingSession,
    ...quizSession,
    form_first_name: quizSession.form_first_name || trackingSession.form_first_name,
    form_email: quizSession.form_email || trackingSession.form_email,
    quiz_profile: quizSession.quiz_profile || trackingSession.quiz_profile,
    quiz_profile_name: quizSession.quiz_profile_name || trackingSession.quiz_profile_name,
    quiz_aspiration: quizSession.quiz_aspiration || trackingSession.main_aspiration,
    main_aspiration_label: trackingSession.main_aspiration_label,
    quiz_barrier: quizSession.quiz_barrier || trackingSession.quiz_barrier,
  };
  const slug = safeString(
    payload.berater_slug || payload.slug || session.berater_slug || trackingSession.berater_slug,
    80
  );
  const coachResult = await proxyToBridge(
    { action: 'lookup_subdomain', subdomain: slug || 'default' },
    forwardedFor,
    userAgent
  );

  return { leadHash, sessionHash, session, slug, coach: coachResult.data || {} };
}

function generateId(prefix, length = 24) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = `${prefix}_`;
  while (out.length < prefix.length + 1 + length) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function normalizeLang(lang) {
  const value = String(lang || '')
    .toLowerCase()
    .trim();
  return ['de', 'it', 'en', 'fr', 'ru'].includes(value) ? value : 'de';
}

function normalizeAspiration(value) {
  const normalized = String(value || '')
    .toLowerCase()
    .trim();
  return ['freedom', 'impact', 'security', 'growth'].includes(normalized) ? normalized : '';
}

const BUSINESS_PROFILE_MAP = {
  a: { code: 'feuer', label: 'Der Macher' },
  r: { code: 'feuer', label: 'Der Macher' },
  'typ-a': { code: 'feuer', label: 'Der Macher' },
  'type-a': { code: 'feuer', label: 'Der Macher' },
  feuer: { code: 'feuer', label: 'Der Macher' },
  macher: { code: 'feuer', label: 'Der Macher' },
  'der-macher': { code: 'feuer', label: 'Der Macher' },
  realizzatore: { code: 'feuer', label: 'Der Macher' },
  'il-realizzatore': { code: 'feuer', label: 'Der Macher' },
  doer: { code: 'feuer', label: 'Der Macher' },
  b: { code: 'wind', label: 'Der Netzwerker' },
  y: { code: 'wind', label: 'Der Netzwerker' },
  'typ-b': { code: 'wind', label: 'Der Netzwerker' },
  'type-b': { code: 'wind', label: 'Der Netzwerker' },
  wind: { code: 'wind', label: 'Der Netzwerker' },
  netzwerker: { code: 'wind', label: 'Der Netzwerker' },
  'der-netzwerker': { code: 'wind', label: 'Der Netzwerker' },
  connettore: { code: 'wind', label: 'Der Netzwerker' },
  'il-connettore': { code: 'wind', label: 'Der Netzwerker' },
  connector: { code: 'wind', label: 'Der Netzwerker' },
  c: { code: 'wasser', label: 'Der Anker' },
  g: { code: 'wasser', label: 'Der Anker' },
  'typ-c': { code: 'wasser', label: 'Der Anker' },
  'type-c': { code: 'wasser', label: 'Der Anker' },
  wasser: { code: 'wasser', label: 'Der Anker' },
  anker: { code: 'wasser', label: 'Der Anker' },
  'der-anker': { code: 'wasser', label: 'Der Anker' },
  ancora: { code: 'wasser', label: 'Der Anker' },
  'l-ancora': { code: 'wasser', label: 'Der Anker' },
  anchor: { code: 'wasser', label: 'Der Anker' },
  d: { code: 'fels', label: 'Der Architekt' },
  'typ-d': { code: 'fels', label: 'Der Architekt' },
  'type-d': { code: 'fels', label: 'Der Architekt' },
  fels: { code: 'fels', label: 'Der Architekt' },
  architekt: { code: 'fels', label: 'Der Architekt' },
  'der-architekt': { code: 'fels', label: 'Der Architekt' },
  architetto: { code: 'fels', label: 'Der Architekt' },
  'l-architetto': { code: 'fels', label: 'Der Architekt' },
  architect: { code: 'fels', label: 'Der Architekt' },
};

function normalizeBusinessProfile(...values) {
  for (const value of values) {
    const key = String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    if (key && BUSINESS_PROFILE_MAP[key]) return BUSINESS_PROFILE_MAP[key];
  }
  return null;
}

const BUSINESS_COPY = {
  de: {
    webhook_title: 'DE - Erfolgscode Quiz',
    result_badge: 'Dein Erfolgscode',
    main_aspiration_title: 'Dein Hauptziel',
    first_name_title: 'Vorname',
    email_title: 'E-Mail-Adresse',
    aspirations: {
      freedom: 'Freiheit',
      impact: 'Wirkung',
      security: 'Sicherheit',
      growth: 'Wachstum',
    },
    questions: [
      [
        'Was treibt dich morgens wirklich aus dem Bett?',
        [
          'Ziele & Fortschritt',
          'Menschen & Begegnungen',
          'Struktur & Ruhe',
          'Tiefe & Herausforderung',
        ],
      ],
      [
        'In einer Gruppe bist du meistens...',
        ['Der Richtungsgeber', 'Der Stimmungsmacher', 'Der Ruhepol', 'Der stille Beobachter'],
      ],
      [
        'Was bringt dich wirklich auf die Palme?',
        ['Blockaden & Zögerer', 'Schlechte Energie', 'Sinnlose Prozesse', 'Vermeidbare Fehler'],
      ],
      [
        'Was ist dir bei deiner Arbeit am wichtigsten?',
        ['Freiheit', 'Wirkung', 'Sicherheit', 'Wachstum'],
      ],
      [
        'Wie sieht dein ideales Leben in 3 Jahren aus?',
        ['Finanziell frei', 'Sinn & Erlebnisse', 'Ruhe & Familie', 'Expertise & System'],
      ],
      [
        'Was hält dich WIRKLICH davon ab, dieses Leben bereits heute zu leben?',
        ['Fehlendes System', 'Fehlendes Umfeld', 'Fehlende Sicherheit', 'Fehlende Möglichkeit'],
      ],
    ],
  },
  it: {
    webhook_title: 'IT - Quiz Codice del Successo',
    result_badge: 'Il tuo codice del successo',
    main_aspiration_title: 'Il tuo obiettivo principale',
    first_name_title: 'Nome',
    email_title: 'Indirizzo e-mail',
    aspirations: {
      freedom: 'Libertà',
      impact: 'Impatto',
      security: 'Sicurezza',
      growth: 'Crescita',
    },
    questions: [
      [
        'Cosa ti fa davvero alzare dal letto la mattina?',
        ['Obiettivi e progresso', 'Persone e incontri', 'Struttura e calma', 'Profondità e sfida'],
      ],
      [
        'In un gruppo sei di solito...',
        [
          'Chi dà la direzione',
          'Chi crea il clima',
          'Il punto di calma',
          "L'osservatore silenzioso",
        ],
      ],
      [
        'Cosa ti manda davvero fuori di testa?',
        ['Blocchi e indecisione', 'Energia negativa', 'Processi senza senso', 'Errori evitabili'],
      ],
      [
        'Che cosa è più importante per te nel lavoro?',
        ['Libertà', 'Impatto', 'Sicurezza', 'Crescita'],
      ],
      [
        'Come appare la tua vita ideale tra 3 anni?',
        [
          'Libero finanziariamente',
          'Senso ed esperienze',
          'Calma e famiglia',
          'Competenza e sistema',
        ],
      ],
      [
        'Che cosa ti impedisce DAVVERO di vivere già oggi quella vita?',
        ['Manca un sistema', "Manca l'ambiente", 'Manca sicurezza', "Manca l'opportunità"],
      ],
    ],
  },
  en: {
    webhook_title: 'EN - Success Code Quiz',
    result_badge: 'Your success code',
    main_aspiration_title: 'Your main goal',
    first_name_title: 'First name',
    email_title: 'Email address',
    aspirations: { freedom: 'Freedom', impact: 'Impact', security: 'Security', growth: 'Growth' },
    questions: [
      [
        'What really gets you out of bed in the morning?',
        ['Goals & progress', 'People & connection', 'Structure & calm', 'Depth & challenge'],
      ],
      [
        'In a group, you are usually...',
        ['The direction setter', 'The energizer', 'The calm center', 'The quiet observer'],
      ],
      [
        'What really gets on your nerves?',
        ['Blockers & hesitators', 'Bad energy', 'Pointless processes', 'Avoidable mistakes'],
      ],
      ['What matters most to you in your work?', ['Freedom', 'Impact', 'Security', 'Growth']],
      [
        'What does your ideal life look like in 3 years?',
        ['Financially free', 'Meaning & experiences', 'Calm & family', 'Expertise & system'],
      ],
      [
        'What is REALLY stopping you from living that life already today?',
        ['Missing system', 'Missing environment', 'Missing certainty', 'Missing opportunity'],
      ],
    ],
  },
};

const BUSINESS_ASPIRATION_LABELS = {
  de: { freedom: 'Freiheit', impact: 'Wirkung', security: 'Sicherheit', growth: 'Wachstum' },
  it: { freedom: 'Libertà', impact: 'Impatto', security: 'Sicurezza', growth: 'Crescita' },
  en: { freedom: 'Freedom', impact: 'Impact', security: 'Security', growth: 'Growth' },
  fr: { freedom: 'Liberté', impact: 'Impact', security: 'Sécurité', growth: 'Croissance' },
  ru: { freedom: 'Свобода', impact: 'Влияние', security: 'Стабильность', growth: 'Рост' },
};

const BUSINESS_SCHEMA = {
  formId: 'hC2yTcU8',
  ending: {
    id: 'QAt7gWPcX7mQ',
    ref: 'd158dcdf-4588-4111-b8ad-efff4f55e5c4',
    title: 'Success',
    type: 'thankyou_screen',
    properties: { show_button: false, share_icons: false, button_mode: 'reload' },
  },
  fields: [
    {
      key: 'profile',
      id: 'Vn4xYk2LmQ8p',
      ref: 'lead_profile_result',
      type: 'short_text',
      titleKey: 'result_badge',
    },
    {
      key: 'main_aspiration',
      id: 'Z2vy6Tx0Bg4D',
      ref: 'lead_main_aspiration',
      type: 'short_text',
      titleKey: 'main_aspiration_title',
    },
    {
      key: 'q1',
      id: 'R4nq8Lp2Ty6V',
      ref: 'lead_q1_drive',
      type: 'multiple_choice',
      titleIndex: 0,
      choices: [
        ['A1rK7pLm2Xq9', 'lead_q1_opt_1'],
        ['B2sL8qMn3Yr0', 'lead_q1_opt_2'],
        ['C3tM9rNo4Zs1', 'lead_q1_opt_3'],
        ['D4uN0sOp5At2', 'lead_q1_opt_4'],
      ],
    },
    {
      key: 'q2',
      id: 'S5or9Mq3Uz7W',
      ref: 'lead_q2_group',
      type: 'multiple_choice',
      titleIndex: 1,
      choices: [
        ['E5vO1tPq6Bu3', 'lead_q2_opt_1'],
        ['F6wP2uQr7Cv4', 'lead_q2_opt_2'],
        ['G7xQ3vRs8Dw5', 'lead_q2_opt_3'],
        ['H8yR4wSt9Ex6', 'lead_q2_opt_4'],
      ],
    },
    {
      key: 'q3',
      id: 'T6ps0Nr4Va8X',
      ref: 'lead_q3_trigger',
      type: 'multiple_choice',
      titleIndex: 2,
      choices: [
        ['I9zS5xTu0Fy7', 'lead_q3_opt_1'],
        ['J0aT6yUv1Gz8', 'lead_q3_opt_2'],
        ['K1bU7zVw2Ha9', 'lead_q3_opt_3'],
        ['L2cV8aWx3Ib0', 'lead_q3_opt_4'],
      ],
    },
    {
      key: 'q4',
      id: 'U7qt1Os5Wb9Y',
      ref: 'lead_q4_priority',
      type: 'multiple_choice',
      titleIndex: 3,
      choices: [
        ['M3dW9bXy4Jc1', 'lead_q4_opt_1'],
        ['N4eX0cYz5Kd2', 'lead_q4_opt_2'],
        ['O5fY1dZa6Le3', 'lead_q4_opt_3'],
        ['P6gZ2eAb7Mf4', 'lead_q4_opt_4'],
      ],
    },
    {
      key: 'q5',
      id: 'V8ru2Pt6Xc0Z',
      ref: 'lead_q5_future',
      type: 'multiple_choice',
      titleIndex: 4,
      choices: [
        ['Q7hA3fBc8Ng5', 'lead_q5_opt_1'],
        ['R8iB4gCd9Oh6', 'lead_q5_opt_2'],
        ['S9jC5hDe0Pi7', 'lead_q5_opt_3'],
        ['T0kD6iEf1Qj8', 'lead_q5_opt_4'],
      ],
    },
    {
      key: 'q6',
      id: 'W9sv3Qu7Yd1A',
      ref: 'lead_q6_barrier',
      type: 'multiple_choice',
      titleIndex: 5,
      choices: [
        ['U1lE7jFg2Rk9', 'lead_q6_opt_1'],
        ['V2mF8kGh3Sl0', 'lead_q6_opt_2'],
        ['W3nG9lHi4Tm1', 'lead_q6_opt_3'],
        ['X4oH0mIj5Un2', 'lead_q6_opt_4'],
      ],
    },
    {
      key: 'first_name',
      id: 'X0tw4Rv8Ze2B',
      ref: 'first_name',
      type: 'short_text',
      titleKey: 'first_name_title',
    },
    { key: 'email', id: 'Y1ux5Sw9Af3C', ref: 'email', type: 'email', titleKey: 'email_title' },
  ],
};

function adminBaseUrl(formId, token) {
  return `https://admin.typeform.com/form/${formId}/results?responseId=${token}`;
}

function answerUrl(formId, token, fieldId) {
  return `${adminBaseUrl(formId, token)}&fieldId=${fieldId}#responses`;
}

function fieldByKey(key) {
  return BUSINESS_SCHEMA.fields.find((field) => field.key === key);
}

function questionDefinitions(lang) {
  const copy = BUSINESS_COPY[lang] || BUSINESS_COPY.de;
  return copy.questions.map(([text, options], index) => ({
    text,
    options: options.map((label, optionIndex) => {
      if (index < 3) return { label, type: ['R', 'Y', 'G', 'B'][optionIndex] };
      if (index < 5)
        return { label, aspiration: ['freedom', 'impact', 'security', 'growth'][optionIndex] };
      return { label, barrier: ['vehicle', 'community', 'confidence', 'opportunity'][optionIndex] };
    }),
  }));
}

function matchOption(question, answer) {
  return (question.options || []).find(
    (option) =>
      (answer.label && option.label === answer.label) ||
      (answer.type && option.type === answer.type) ||
      (answer.aspiration && option.aspiration === answer.aspiration) ||
      (answer.barrier && option.barrier === answer.barrier)
  );
}

function appendTextVariable(variables, key, value) {
  if (!value || variables.some((variable) => variable && variable.key === key)) return variables;
  return [...variables, { key, type: 'text', text: value }];
}

function typeformHidden(payload) {
  return payload?.form_response?.hidden || payload?.hidden || {};
}

function buildBusinessTypeformPayload(input) {
  const hidden = { ...((input && input.hidden) || {}) };
  const lang = normalizeLang(hidden.lang || input.lang);
  const copy = BUSINESS_COPY[lang] || BUSINESS_COPY.de;
  const questions = questionDefinitions(lang);
  const selectedAnswers = Array.isArray(input.selected_answers) ? input.selected_answers : [];
  const profile = input.profile && typeof input.profile === 'object' ? input.profile : {};
  const token = String(input.token || generateId('tf', 28).replace(/_/g, ''));
  const submittedAt = String(input.submitted_at || new Date().toISOString());
  const landedAt = String(input.landed_at || submittedAt);
  const eventId = String(input.event_id || generateId('evt', 24).replace(/_/g, '').toUpperCase());
  const derivedAspiration = selectedAnswers
    .map((answer) => normalizeAspiration(answer && answer.aspiration))
    .find(Boolean);
  const mainAspiration =
    normalizeAspiration(input.main_aspiration || hidden.main_aspiration) || derivedAspiration;
  const suppliedMainAspirationLabel = String(
    input.main_aspiration_label || hidden.main_aspiration_label || ''
  ).trim();
  const aspirationLabels = BUSINESS_ASPIRATION_LABELS[lang] || BUSINESS_ASPIRATION_LABELS.de;
  const mainAspirationLabel = String(
    (mainAspiration && aspirationLabels[mainAspiration]) || suppliedMainAspirationLabel || ''
  ).trim();
  let variables = Array.isArray(input.variables) ? [...input.variables] : [];

  hidden.hash = hidden.hash || hidden.lead_hash || generateId('qz', 16);
  hidden.lang = lang;
  if (mainAspiration) {
    hidden.main_aspiration = mainAspiration;
    hidden.main_aspiration_label = mainAspirationLabel;
    variables = appendTextVariable(variables, 'main_aspiration', mainAspiration);
    variables = appendTextVariable(variables, 'main_aspiration_label', mainAspirationLabel);
  }

  const definitionFields = BUSINESS_SCHEMA.fields.map((field) => {
    const definition = {
      id: field.id,
      ref: field.ref,
      type: field.type,
      title: field.titleKey ? copy[field.titleKey] : field.title || '',
      properties: {},
    };
    if (Number.isInteger(field.titleIndex)) {
      const question = questions[field.titleIndex] || { text: '', options: [] };
      definition.title = question.text;
      definition.choices = (field.choices || []).map(([id, ref], index) => ({
        id,
        ref,
        label: question.options[index] ? question.options[index].label : `Option ${index + 1}`,
      }));
    }
    return definition;
  });

  const answers = [];
  const profileField = fieldByKey('profile');
  const profileLabel = String(profile.name || profile.animal || profile.code || '').trim();
  if (profileField && profileLabel) {
    answers.push({
      type: 'text',
      answer_url: answerUrl(BUSINESS_SCHEMA.formId, token, profileField.id),
      text: profileLabel,
      field: { id: profileField.id, type: profileField.type, ref: profileField.ref },
    });
  }

  const aspirationField = fieldByKey('main_aspiration');
  if (aspirationField && mainAspirationLabel) {
    answers.push({
      type: 'text',
      answer_url: answerUrl(BUSINESS_SCHEMA.formId, token, aspirationField.id),
      text: mainAspirationLabel,
      field: { id: aspirationField.id, type: aspirationField.type, ref: aspirationField.ref },
    });
  }

  selectedAnswers.forEach((answer, index) => {
    if (!answer || typeof answer !== 'object') return;
    const schemaField = fieldByKey(`q${index + 1}`);
    const question = questions[index];
    if (!schemaField || !question) return;
    const matchedOption = matchOption(question, answer);
    const matchedIndex = question.options.indexOf(matchedOption);
    const choiceDef = matchedIndex >= 0 ? schemaField.choices[matchedIndex] : null;
    if (!matchedOption || !choiceDef) return;

    answers.push({
      type: 'choice',
      answer_url: answerUrl(BUSINESS_SCHEMA.formId, token, schemaField.id),
      choice: { id: choiceDef[0], ref: choiceDef[1], label: matchedOption.label },
      field: { id: schemaField.id, type: schemaField.type, ref: schemaField.ref },
    });
  });

  const firstNameField = fieldByKey('first_name');
  if (firstNameField) {
    answers.push({
      type: 'text',
      answer_url: answerUrl(BUSINESS_SCHEMA.formId, token, firstNameField.id),
      text: normalizePersonName(input.first_name, 120) || '',
      field: { id: firstNameField.id, type: firstNameField.type, ref: firstNameField.ref },
    });
  }

  const emailField = fieldByKey('email');
  if (emailField) {
    answers.push({
      type: 'email',
      answer_url: answerUrl(BUSINESS_SCHEMA.formId, token, emailField.id),
      email: String(input.email || '').trim(),
      field: { id: emailField.id, type: emailField.type, ref: emailField.ref },
    });
  }

  return {
    event_id: eventId,
    event_type: 'form_response',
    form_response: {
      form_id: BUSINESS_SCHEMA.formId,
      token,
      response_url: `${adminBaseUrl(BUSINESS_SCHEMA.formId, token)}#responses`,
      landed_at: landedAt,
      submitted_at: submittedAt,
      hidden,
      calculated:
        input.calculated && typeof input.calculated === 'object' ? input.calculated : { score: 0 },
      variables,
      definition: {
        id: BUSINESS_SCHEMA.formId,
        title: copy.webhook_title,
        fields: definitionFields,
        endings: [BUSINESS_SCHEMA.ending],
        settings: { partial_responses_to_all_integrations: false },
      },
      answers,
      ending: { id: BUSINESS_SCHEMA.ending.id, ref: BUSINESS_SCHEMA.ending.ref },
    },
  };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { action, subdomain, payload, target, meta, adapter_key: adapterKey } = req.body || {};
  const forwardedFor = req.headers['x-forwarded-for'] || '';
  const userAgent = req.headers['user-agent'] || '';

  if (!action) {
    return res.status(400).json({ error: 'Missing action' });
  }

  if (action === 'track_event') {
    const trackData = payload || req.body;
    if (!trackData.session_hash && !trackData.hash) {
      return res.status(400).json({ error: 'Missing session_hash or hash' });
    }

    await writeToSupabaseAsync({
      ...trackData,
      hash: trackData.session_hash || trackData.hash || '',
      session_hash: trackData.session_hash || trackData.hash || '',
      herbalife_id: trackData.member_id || trackData.herbalife_id || '',
      berater_slug: trackData.berater_slug || trackData.slug || '',
      visited_at: trackData.visited_at || trackData.event_at || nowIso(),
      event_at: trackData.event_at || nowIso(),
    });

    return res
      .status(200)
      .json({ success: true, session_hash: trackData.session_hash || trackData.hash });
  }

  if (action === 'lookup_subdomain') {
    const normalizedSubdomain = String(subdomain || 'default').trim().toLowerCase();
    const result = await proxyToBridge(
      { action: 'lookup_subdomain', subdomain: normalizedSubdomain },
      forwardedFor,
      userAgent
    );
    return res.status(result.status).json(result.data);
  }

  if (action === 'write_analytics') {
    if (!payload || !payload.hash) {
      return res.status(400).json({ error: 'Missing hash' });
    }
    await writeToSupabaseAsync(payload);
    return res.status(200).json({ success: true, hash: payload.hash });
  }

  if (action === 'write_analytics_batch') {
    if (!payload || !Array.isArray(payload.events) || payload.events.length === 0) {
      return res.status(400).json({ error: 'Missing or empty events array' });
    }

    // Process events in parallel but with controlled concurrency
    const maxConcurrent = 5;
    const events = payload.events;
    let processed = 0;
    let failed = 0;

    for (let i = 0; i < events.length; i += maxConcurrent) {
      const batch = events.slice(i, i + maxConcurrent);
      const results = await Promise.allSettled(
        batch.map((event) =>
          writeToSupabaseAsync({
            ...event,
            hash: event.session_hash || event.hash || '',
            session_hash: event.session_hash || event.hash || '',
            herbalife_id: event.member_id || event.herbalife_id || '',
            berater_slug: event.berater_slug || event.slug || '',
            event_at: event.event_at || nowIso(),
          })
        )
      );

      results.forEach((result) => {
        if (result.status === 'fulfilled') {
          processed++;
        } else {
          failed++;
          console.warn('Batch event processing failed:', result.reason?.message);
        }
      });
    }

    return res.status(200).json({
      success: failed === 0,
      processed,
      failed,
      total: events.length,
    });
  }

  if (action === 'notify_all_videos_completed') {
    if (!payload) {
      return res.status(400).json({ error: 'Missing payload' });
    }

    const completedSteps = Array.isArray(payload.completed_steps)
      ? payload.completed_steps.map((step) => safeInteger(step)).filter(Boolean)
      : [];
    const hasAllVideos = [1, 2, 3].every((step) => completedSteps.includes(step));
    if (!hasAllVideos) {
      return res.status(202).json({
        success: true,
        email_sent: false,
        reason: 'not_all_videos_completed',
      });
    }

    const canonicalLeadHash = leadHashOf(payload);
    if (canonicalLeadHash) {
      const completedAt = safeString(payload.completed_at || nowIso(), 40);
      for (const step of completedSteps) {
        await mirrorLegacyTrackingToLeadSystemV2({
          ...payload,
          lead_hash: canonicalLeadHash,
          event_id: `legacy_notify_video_completed_${canonicalLeadHash}_${step}`,
          event_name: 'video_completed',
          event_at: completedAt,
          video_step: step,
          unique_watched_percent: 100,
          progress_percent: 100,
          max_playhead_percent: 100,
        }).catch((error) => {
          console.error('Canonical all-videos mirror error:', error.message);
        });
      }
      await enqueueLeadSync(canonicalLeadHash, 'coach_hot_lead_email', {
        lang: normalizeLanguage(payload.lang),
        rank: 3,
        reason: 'legacy_all_videos_notification_canonical_outbox',
        event_at: completedAt,
      }).catch((error) => {
        console.error('Canonical hot-lead enqueue error:', error.message);
      });
      return res.status(200).json({
        success: true,
        email_sent: true,
        skipped_direct_email: true,
        reason: 'canonical_outbox_handles_hot_lead',
        lead_hash: canonicalLeadHash,
      });
    }

    const context = await loadCompletionNotificationContext(payload, forwardedFor, userAgent);
    const notificationKey = crypto
      .createHash('sha256')
      .update(`all-videos-completed:${context.leadHash || context.sessionHash || ''}`)
      .digest('hex')
      .slice(0, 40);
    const notificationEventId = `evt_video_all_done_${notificationKey}`;
    const existingRows = await supabaseJson(
      `tracking_events?event_id=eq.${encodeURIComponent(notificationEventId)}&select=id&limit=1`
    );
    if (Array.isArray(existingRows) && existingRows.length > 0) {
      return res.status(200).json({
        success: true,
        email_sent: false,
        skipped: true,
        reason: 'already_notified',
      });
    }

    if (!context.coach.email) {
      return res.status(202).json({
        success: false,
        email_sent: false,
        reason: 'coach_email_missing',
      });
    }

    const email = buildAllVideosCompletedCoachEmail({
      session: context.session,
      coach: context.coach,
      payload,
      slug: context.slug,
    });
    const postmark = await sendPostmarkEmail({
      From: POSTMARK_FROM,
      To: email.to,
      Subject: email.subject,
      HtmlBody: email.html,
      TextBody: email.text,
      MessageStream: POSTMARK_MESSAGE_STREAM,
      Metadata: {
        lead_hash: String(context.leadHash || ''),
        session_hash: String(context.sessionHash || ''),
        event_type: 'all_videos_completed',
      },
    });

    if (!postmark.ok) {
      return res.status(postmark.status || 502).json({
        success: false,
        email_sent: false,
        reason: 'postmark_send_failed',
        postmark: postmark.data,
      });
    }

    await insertIgnoringDuplicates('tracking_events', 'event_id', {
      event_id: notificationEventId,
      session_hash: context.sessionHash || context.leadHash || notificationEventId,
      lead_hash: context.leadHash || null,
      member_id: safeString(payload.member_id || context.session.herbalife_id, 80),
      berater_slug: context.slug || null,
      source_app: 'business_leads_quiz',
      funnel: 'business',
      lang: safeString(payload.lang || context.session.lang, 10),
      event_name: 'video_all_completed_coach_email_sent',
      event_at: safeString(payload.completed_at || nowIso(), 40),
      properties: {
        coach_email: context.coach.email,
        postmark_message_id:
          postmark.data?.MessageID || postmark.data?.MessageId || postmark.data?.messageId || null,
        completed_steps: completedSteps,
      },
    });

    return res.status(200).json({
      success: true,
      email_sent: true,
      postmark_message_id:
        postmark.data?.MessageID || postmark.data?.MessageId || postmark.data?.messageId || null,
    });
  }

  if (action === 'update_points_result') {
    if (!payload) {
      return res.status(400).json({ error: 'Missing payload' });
    }

    const completionReason = safeString(payload.completion_reason, 80);

    if (completionReason === 'manual_unlock') {
      return res.status(200).json({
        success: true,
        skipped: true,
        reason: 'manual_unlock',
      });
    }

    const context = await resolvePointsResultContext(payload);
    if (!context.leadHash) {
      sendPointsResultAlertEmail({
        error: 'lead_hash_unresolvable',
        context,
        payload,
      }).catch((err) => console.warn('sendPointsResultAlertEmail failed:', err.message));
      return res.status(422).json({ success: false, error: 'lead_hash_unresolvable' });
    }

    const totalVideos = Math.max(1, safeInteger(payload.total_videos) || 3);
    const completedCount = Math.max(
      0,
      Math.min(safeInteger(payload.completed_count) || 0, totalVideos)
    );
    if (isLeadHash(context.leadHash) && completedCount > 0) {
      const eventAt = safeString(payload.event_at || payload.completed_at || nowIso(), 40);
      for (let step = 1; step <= completedCount; step += 1) {
        await mirrorLegacyTrackingToLeadSystemV2({
          ...payload,
          lead_hash: context.leadHash,
          event_id: `legacy_points_video_completed_${context.leadHash}_${step}`,
          event_name: 'video_completed',
          event_at: eventAt,
          video_step: step,
          unique_watched_percent: 100,
          progress_percent: 100,
          max_playhead_percent: 100,
        }).catch((error) => {
          console.error('Canonical points-result mirror error:', error.message);
        });
      }
    }
    const label = buildPointsResultLabel(completedCount, totalVideos, context.lang);
    const n8nPayload = {
      hash: context.leadHash,
      personalityType: label,
    };

    if (completionReason === 'initial_form_submit') {
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }

    let result = await callN8nUpdateResult(n8nPayload);
    if (shouldRetryPointsResult(result)) {
      const retryDelayMs =
        completionReason === 'initial_form_submit' && result.data?.matchedRows === 0 ? 5000 : 2000;
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      result = await callN8nUpdateResult(n8nPayload);
    }

    const success = pointsResultSucceeded(result);
    if (!success) {
      const error =
        result.data?.matchedRows === 0
          ? 'typeform_survey_not_found'
          : result.data?.error || 'n8n_update_failed';
      sendPointsResultAlertEmail({
        error,
        context,
        payload,
        n8nPayload,
        result,
      }).catch((err) => console.warn('sendPointsResultAlertEmail failed:', err.message));
    }

    return res.status(success ? 200 : 502).json({
      success,
      n8n_status: result.status,
      n8n_matched: result.data?.matchedRows ?? null,
      n8n_updated: result.data?.updated ?? null,
      label,
      lead_hash: context.leadHash,
      session_hash: context.sessionHash || null,
    });
  }

  if (action === 'forward_typeform_adapter') {
    if (!ALLOWED_ADAPTER_KEYS.has(adapterKey)) {
      return res.status(400).json({ error: 'Unknown adapter_key' });
    }
    if (!payload) {
      return res.status(400).json({ error: 'Missing payload' });
    }
    if (target !== TYPEFORM_TARGET) {
      return res.status(400).json({ error: 'Invalid target' });
    }

    const identity = await ensureBusinessSubmissionIdentity(payload, forwardedFor, userAgent);
    if (!identity.ok) {
      sendIdentityAlertEmail({
        payload,
        error: identity.error,
        forwardedFor,
        userAgent,
      }).catch((err) => console.warn('sendIdentityAlertEmail failed:', err.message));
      return res.status(identity.status).json({ success: false, error: identity.error });
    }

    const submissionPayload = identity.payload;
    const webhookPayload = buildBusinessTypeformPayload(submissionPayload);
    const webhookHidden = {
      ...(submissionPayload.hidden || {}),
      ...typeformHidden(webhookPayload),
    };
    const leadSystemFlag = String(
      webhookHidden.lead_system_v2_enabled ||
        submissionPayload.hidden?.lead_system_v2_enabled ||
        ''
    )
      .trim()
      .toLowerCase();
    const usesLeadSystemV2 = leadSystemFlag === '1' || leadSystemFlag === 'true';
    const [result] = await Promise.all([
      proxyToBridge(
        {
          action: 'forward_webhook',
          payload: webhookPayload,
          target,
          meta,
        },
        forwardedFor,
        userAgent
      ),
      usesLeadSystemV2
        ? Promise.resolve(null)
        : persistBusinessSubmissionForResume(submissionPayload).catch((err) =>
            console.warn('persistBusinessSubmissionForResume failed (non-critical):', err.message)
          ),
    ]);

    let leadSystemV2Persisted = null;
    if (result.status >= 200 && result.status < 300) {
      const finalLeadHash = safeString(
        webhookHidden.lead_hash || webhookHidden.hash || submissionPayload.lead_hash,
        96
      );
      const finalBusinessLeadContext = await loadFinalBusinessLeadContext(finalLeadHash).catch((err) => {
        console.warn('loadFinalBusinessLeadContext failed:', err.message);
        return { found: false, reason: 'mysql_final_readback_error', error: err.message };
      });
      leadSystemV2Persisted = await persistBusinessSubmissionToLeadStateV2(
        submissionPayload,
        webhookPayload,
        finalBusinessLeadContext
      ).catch((err) => {
        console.warn('persistBusinessSubmissionToLeadStateV2 failed:', err.message);
        return { persisted: false, error: err.message };
      });
    }

    // Meta CAPI — server-side Lead event, non-blocking, fires after lead is persisted
    if (result.status >= 200 && result.status < 300) {
      const capiEmail = safeString(submissionPayload.email || webhookPayload.email, 180);
      const capiFirstName = normalizePersonName(submissionPayload.first_name, 120);
      const capiLeadHash = safeString(
        webhookHidden.lead_hash || webhookHidden.hash,
        96
      );
      const capiAttribution = {
        ...(submissionPayload.attribution || {}),
        ...webhookHidden,
        ...submissionPayload,
      };
      await sendMetaCAPILead({
        email: capiEmail,
        firstName: capiFirstName,
        clientIp: forwardedFor,
        userAgent,
        eventId: capiLeadHash ? `capi_${capiLeadHash}` : undefined,
        fbc: safeTrackingString(capiAttribution, 'fbc', 500),
        fbp: safeTrackingString(capiAttribution, 'fbp', 120),
        eventSourceUrl: safeTrackingString(capiAttribution, 'event_source_url', 1000),
      }).catch((err) => console.warn('Meta CAPI Lead failed (non-critical):', err.message));
    }

    // Server-side initial points_result: fire after MySQL row is created (no client dependency)
    if (!usesLeadSystemV2 && result.status >= 200 && result.status < 300) {
      const prLeadHash = safeString(webhookHidden.hash || webhookHidden.lead_hash, 96);
      const prLang = normalizeLanguage(webhookHidden.lang || submissionPayload.lang);
      if (isLeadHash(prLeadHash)) {
        (async () => {
          const label = buildPointsResultLabel(0, 3, prLang);
          const n8nPayload = { hash: prLeadHash, personalityType: label };
          let n8nResult = await callN8nUpdateResult(n8nPayload);
          if (shouldRetryPointsResult(n8nResult)) {
            await new Promise((r) => setTimeout(r, 3000));
            n8nResult = await callN8nUpdateResult(n8nPayload);
          }
          if (!pointsResultSucceeded(n8nResult)) {
            sendPointsResultAlertEmail({
              error: 'initial_points_result_failed',
              context: { leadHash: prLeadHash, lang: prLang },
              payload: submissionPayload,
              n8nPayload,
              result: n8nResult,
            }).catch((err) => console.warn('sendPointsResultAlertEmail failed:', err.message));
          }
        })().catch((err) => console.warn('initial points_result update failed:', err.message));
      }
    }

    result.data = {
      ...result.data,
      adapter_key: adapterKey,
      lead_system_v2_persisted: leadSystemV2Persisted,
      payload: webhookPayload,
    };
    return res.status(result.status).json(result.data);
  }

  if (action === 'forward_webhook') {
    if (!payload) {
      return res.status(400).json({ error: 'Missing payload' });
    }
    if (target !== TYPEFORM_TARGET) {
      return res.status(400).json({ error: 'Invalid target' });
    }

    const result = await proxyToBridge(
      {
        action: 'forward_webhook',
        payload,
        target,
        meta,
      },
      forwardedFor,
      userAgent
    );
    return res.status(result.status).json(result.data);
  }

  if (action === 'generate_resume_token') {
    if (!JWT_SECRET) {
      console.error('ERROR: JWT_SECRET environment variable is not set');
      return res.status(500).json({ error: 'Server configuration error' });
    }
    if (!payload || !payload.sessionHash || !payload.email) {
      return res.status(400).json({ error: 'Missing sessionHash or email' });
    }

    const contactLead = await resolveContactLeadForResume({
      sessionHash: safeString(payload.sessionHash, 96),
      email: safeString(payload.email, 255),
      leadHash: safeString(payload.leadHash || payload.lead_hash, 96),
      fallbackContact: payload.contact || null,
    });
    if (!contactLead.leadHash) {
      return res.status(409).json({ error: 'Resume contact not found' });
    }

    const targetOverride = requestedResumeTarget(
      payload.resumeTarget || payload.resume_target || payload.target
    );
    const resumeState = resumeStateForRequestedTarget(
      await loadResumeState({
        sessionHash: safeString(payload.sessionHash, 96),
        leadHash: contactLead.leadHash,
      }),
      targetOverride
    );
    let resumeSession = null;
    try {
      resumeSession = await ensureResumeSessionRecord({
        sessionHash: payload.sessionHash,
        email: safeString(payload.email, 255),
        leadHash: contactLead.leadHash,
        context: safeString(payload.context || 'quiz', 80),
      });
    } catch (error) {
      console.warn('Could not create short resume key, falling back to JWT link:', error.message);
    }

    const token = jwt.sign(
      {
        sessionHash: payload.sessionHash,
        email: payload.email,
        leadHash: contactLead.leadHash,
        context: payload.context || 'quiz',
        lastVideoStep: resumeState.lastVideoStep,
        resumeTarget: resumeState.resumeTarget,
        resumeStartPercent: resumeState.resumeStartPercent,
        profileCode: resumeState.profileCode,
        aspiration: resumeState.aspiration,
        barrier: resumeState.barrier,
      },
      JWT_SECRET,
      { algorithm: 'HS256' }
    );

    const resumeSlug = safeString(payload.slug || payload.berater_slug || payload.coach_slug, 80);
    const shortKey = resumeSession?.id ? createResumeKey(resumeSession.id) : null;
    const shortUrl = shortKey ? shortResumeUrl(shortKey, resumeSlug, req, resumeState.resumeTarget) : null;

    return res.status(200).json({
      success: true,
      token,
      leadHash: contactLead.leadHash,
      lastVideoStep: resumeState.lastVideoStep,
      resumeTarget: resumeState.resumeTarget,
      resumeStartPercent: resumeState.resumeStartPercent,
      profileCode: resumeState.profileCode,
      aspiration: resumeState.aspiration,
      barrier: resumeState.barrier,
      shortKey,
      shortUrl,
      resumeUrl: shortUrl || longResumeUrl(token, resumeSlug, req, resumeState.resumeTarget),
    });
  }

  if (action === 'resolve_resume_token') {
    if (!JWT_SECRET) {
      console.error('ERROR: JWT_SECRET environment variable is not set');
      return res.status(500).json({ error: 'Server configuration error' });
    }
    if (!payload || !payload.token) {
      return res.status(400).json({ error: 'Missing token' });
    }

    let decoded;
    try {
      decoded = jwt.verify(payload.token, JWT_SECRET, { algorithms: ['HS256'] });
    } catch (_error) {
      return res.status(400).json({ error: 'Invalid resume token' });
    }

    const sessionHash = safeString(decoded.sessionHash, 96);
    const email = safeString(decoded.email, 255);
    const context = safeString(decoded.context || 'quiz', 32) || 'quiz';

    if (!sessionHash || !email) {
      return res.status(400).json({ error: 'Resume token missing required fields' });
    }

    const contactLead = await resolveContactLeadForResume({
      sessionHash,
      email,
      leadHash: safeString(decoded.leadHash || decoded.lead_hash, 96),
    });
    if (!contactLead.leadHash) {
      return res.status(409).json({ error: 'Resume contact not found' });
    }
    const resumeState = resumeStateForRequestedTarget(
      await loadResumeState({ sessionHash, leadHash: contactLead.leadHash }),
      requestedResumeTarget(decoded.resumeTarget)
    );
    const leadState = contactLead.leadState || {};

    return res.status(200).json({
      success: true,
      sessionHash,
      leadHash: contactLead.leadHash,
      email,
      firstName: safeString(leadState.first_name, 120) || '',
      memberId: safeString(leadState.member_id, 120) || '',
      refId: safeString(leadState.ref_id || leadState.member_id, 120) || '',
      beraterSlug: safeString(leadState.berater_slug, 80) || '',
      context,
      lastVideoStep: resumeState.lastVideoStep,
      resumeTarget: resumeState.resumeTarget,
      resumeStartPercent: resumeState.resumeStartPercent,
      profileCode: resumeState.profileCode,
      aspiration: resumeState.aspiration,
      barrier: resumeState.barrier,
    });
  }

  if (action === 'resolve_resume_key') {
    if (!payload || !payload.key) {
      return res.status(400).json({ error: 'Missing key' });
    }

    let resumeRecord;
    try {
      resumeRecord = await resolveResumeRecordByKey(payload.key);
    } catch (_error) {
      return res.status(400).json({ error: 'Invalid resume key' });
    }

    if (!resumeRecord?.session_hash) {
      return res.status(404).json({ error: 'Resume key not found' });
    }

    const sessionHash = safeString(resumeRecord.session_hash, 96);
    let email = safeString(resumeRecord.form_email, 255);
    if (!email) {
      try {
        const quizResponse = await supabaseRequest(
          `quiz_sessions?hash=eq.${encodeURIComponent(sessionHash)}&select=form_email&limit=1`
        );
        const quizRows = await quizResponse?.json?.();
        email = safeString(Array.isArray(quizRows) ? quizRows[0]?.form_email : null, 255);
      } catch (error) {
        console.warn('Could not load form_email for resume key:', error.message);
      }
    }

    const contactLead = await resolveContactLeadForResume({
      sessionHash,
      email,
      leadHash: safeString(resumeRecord.lead_hash, 96),
    });
    if (!contactLead.leadHash) {
      return res.status(409).json({ error: 'Resume contact not found' });
    }
    const resumeState = resumeStateForRequestedTarget(
      await loadResumeState({ sessionHash, leadHash: contactLead.leadHash }),
      requestedResumeTarget(payload.resumeTarget || payload.resume_target || payload.target)
    );
    const leadState = contactLead.leadState || {};

    return res.status(200).json({
      success: true,
      sessionHash,
      leadHash: contactLead.leadHash,
      email,
      firstName: safeString(leadState.first_name, 120) || '',
      memberId: safeString(leadState.member_id, 120) || '',
      refId: safeString(leadState.ref_id || leadState.member_id, 120) || '',
      beraterSlug: safeString(leadState.berater_slug, 80) || '',
      context: safeString(resumeRecord.funnel || 'quiz', 32) || 'quiz',
      lastVideoStep: resumeState.lastVideoStep,
      resumeTarget: resumeState.resumeTarget,
      resumeStartPercent: resumeState.resumeStartPercent,
      profileCode: resumeState.profileCode,
      aspiration: resumeState.aspiration,
      barrier: resumeState.barrier,
    });
  }

  if (action === 'get_funnel_metrics') {
    const slug = payload?.berater_slug || payload?.slug;
    if (!slug) {
      return res.status(400).json({ error: 'Missing berater_slug' });
    }

    try {
      const slugEncoded = encodeURIComponent(String(slug).toLowerCase());
      const response = await supabaseRequest(
        `v_funnel_analysis?berater_slug=eq.${slugEncoded}&select=*`
      );
      const rows = await response?.json?.();
      const metrics = Array.isArray(rows) ? rows[0] : null;

      if (!metrics) {
        return res.status(200).json({
          success: true,
          data: {
            berater_slug: slug,
            step_1_starts: 0,
            step_2_questions: 0,
            step_form_submits: 0,
            completions: 0,
            completion_rate_pct: 0,
          },
        });
      }

      return res.status(200).json({ success: true, data: metrics });
    } catch (error) {
      console.error('get_funnel_metrics error:', error.message);
      return res.status(500).json({ error: 'Failed to fetch funnel metrics' });
    }
  }

  if (action === 'get_resume_metrics') {
    const slug = payload?.berater_slug || payload?.slug;
    if (!slug) {
      return res.status(400).json({ error: 'Missing berater_slug' });
    }

    try {
      const slugEncoded = encodeURIComponent(String(slug).toLowerCase());
      const response = await supabaseRequest(
        `v_resume_metrics?berater_slug=eq.${slugEncoded}&select=*`
      );
      const rows = await response?.json?.();
      const metrics = Array.isArray(rows) ? rows[0] : null;

      if (!metrics) {
        return res.status(200).json({
          success: true,
          data: {
            berater_slug: slug,
            total_resume_sessions: 0,
            resume_completions: 0,
            resume_completion_rate_pct: 0,
          },
        });
      }

      return res.status(200).json({ success: true, data: metrics });
    } catch (error) {
      console.error('get_resume_metrics error:', error.message);
      return res.status(500).json({ error: 'Failed to fetch resume metrics' });
    }
  }

  if (action === 'get_completion_metrics') {
    const slug = payload?.berater_slug || payload?.slug;
    if (!slug) {
      return res.status(400).json({ error: 'Missing berater_slug' });
    }

    try {
      const slugEncoded = encodeURIComponent(String(slug).toLowerCase());
      const response = await supabaseRequest(
        `v_completion_metrics?berater_slug=eq.${slugEncoded}&select=*`
      );
      const rows = await response?.json?.();
      const metrics = Array.isArray(rows) ? rows[0] : null;

      if (!metrics) {
        return res.status(200).json({
          success: true,
          data: {
            berater_slug: slug,
            total_starts: 0,
            total_completions: 0,
            completion_rate_pct: 0,
          },
        });
      }

      return res.status(200).json({ success: true, data: metrics });
    } catch (error) {
      console.error('get_completion_metrics error:', error.message);
      return res.status(500).json({ error: 'Failed to fetch completion metrics' });
    }
  }

  return res.status(400).json({ error: 'Unknown action' });
};
