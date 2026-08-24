import { recordAttributionShadow } from './attribution-shadow.js';
import { createLeadEventQueue } from './lead-event-queue.js';

const TRACKING_SESSION_KEY = 'acQuizTrackingSession_v1';
const TRACKING_COOKIE = 'acTrackingHash';
const TRACKING_SESSION_TTL_MS = 60 * 60 * 1000;
const VISITOR_KEY = 'acVisitorId';
const VISITOR_COOKIE = 'acVisitorId';
const VISITOR_TTL_MS = 180 * 24 * 60 * 60 * 1000;
const INTERNAL_KEY = 'acInternalTraffic';
const INTERNAL_COOKIE = 'acInternalTraffic';
const INTERNAL_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const ATTRIBUTION_KEY = 'acTrackingAttribution';
const TRACKING_SCHEMA_VERSION = 'ac_tracking_v1';
const LEGACY_QUIZ_HASH_KEY = 'acQuizHash';
const LEGACY_QUIZ_HASH_PREFIX = 'acQuizHash:';
const LEAD_RUN_PREFIX = 'acLeadRun:';
const LEAD_SYSTEM_STATE_PREFIX = 'acLeadSystemV2:';
const DEFAULT_VIDEO_COUNT = 3;
const DEFAULT_COACH = {
  slug: 'default',
  member_id: '',
  organisation_name: 'Activecenter',
  phone: '',
  first_name: 'Markus',
  full_name: 'Markus',
  email: '',
  avatar_300: '',
  avatar_600: '',
  address: null,
  instagram: '',
  facebook: '',
};

export const storage = {
  available: (() => {
    try {
      const testKey = '__ac_storage_test__';
      localStorage.setItem(testKey, testKey);
      localStorage.removeItem(testKey);
      return true;
    } catch {
      return false;
    }
  })(),
  memoryStore: {},
  setItem(key, value) {
    try {
      if (this.available) {
        localStorage.setItem(key, value);
      } else {
        this.memoryStore[key] = value;
      }
    } catch {
      this.memoryStore[key] = value;
    }
  },
  getItem(key) {
    try {
      return this.available ? localStorage.getItem(key) : this.memoryStore[key] || null;
    } catch {
      return this.memoryStore[key] || null;
    }
  },
  removeItem(key) {
    try {
      if (this.available) {
        localStorage.removeItem(key);
      }
    } finally {
      delete this.memoryStore[key];
    }
  },
};

export function deriveQuizBarrier(selectedAnswers) {
  if (!Array.isArray(selectedAnswers)) return '';
  const barrierAnswer = selectedAnswers.find((answer) => answer && answer.barrier);
  return barrierAnswer?.barrier || selectedAnswers[5]?.barrier || '';
}

function parseStoredJson(key) {
  try {
    return JSON.parse(storage.getItem(key) || 'null') || {};
  } catch {
    return {};
  }
}

function getCookieValue(name) {
  const target = `${encodeURIComponent(name)}=`;
  return String(document.cookie || '')
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(target))
    ?.slice(target.length) || '';
}

function safeAttributionValue(value, maxLength = 500) {
  return String(value || '').trim().slice(0, maxLength);
}

function buildFbcValue(fbclid) {
  const clickId = safeAttributionValue(fbclid, 500);
  if (!clickId) return '';
  return `fb.1.${Math.floor(Date.now() / 1000)}.${clickId}`;
}

function getLeadAttribution() {
  const params = new URLSearchParams(window.location.search || '');
  const stored = parseStoredJson(ATTRIBUTION_KEY);
  const hasFreshAttribution =
    params.has('utm_source') ||
    params.has('utm_medium') ||
    params.has('utm_campaign') ||
    params.has('utm_content') ||
    params.has('utm_campaign_id') ||
    params.has('utm_adset_id') ||
    params.has('utm_ad_id') ||
    params.has('utm_term') ||
    params.has('fbclid');
  const fbclid = safeAttributionValue(params.get('fbclid') || stored.fbclid, 500);
  const cookieFbc = safeAttributionValue(getCookieValue('_fbc'), 500);
  const cookieFbp = safeAttributionValue(getCookieValue('_fbp'), 120);
  const next = {
    utm_source: safeAttributionValue(params.get('utm_source') || stored.utm_source, 120),
    utm_medium: safeAttributionValue(params.get('utm_medium') || stored.utm_medium, 120),
    utm_campaign: safeAttributionValue(params.get('utm_campaign') || stored.utm_campaign, 180),
    utm_content: safeAttributionValue(params.get('utm_content') || stored.utm_content, 180),
    utm_campaign_id: safeAttributionValue(params.get('utm_campaign_id') || stored.utm_campaign_id, 80),
    utm_adset_id: safeAttributionValue(params.get('utm_adset_id') || stored.utm_adset_id, 80),
    utm_ad_id: safeAttributionValue(params.get('utm_ad_id') || stored.utm_ad_id, 80),
    utm_term: safeAttributionValue(params.get('utm_term') || stored.utm_term, 180),
    fbclid,
    fbc: cookieFbc || safeAttributionValue(stored.fbc, 500) || buildFbcValue(fbclid),
    fbp: cookieFbp || safeAttributionValue(stored.fbp, 120),
    event_source_url: safeAttributionValue(
      hasFreshAttribution ? window.location.href : stored.event_source_url || window.location.href,
      1000
    ),
  };

  if (next.fbclid && !next.utm_medium) {
    next.utm_medium = 'paid_social';
    if (!next.utm_source) next.utm_source = 'meta';
  }

  recordAttributionShadow({
    source: 'lead-submission',
    search: window.location.search || '',
    stored,
    canonical: next,
    currentUrl: window.location.href,
  });

  if (
    next.utm_source ||
    next.utm_medium ||
    next.utm_campaign ||
    next.utm_content ||
    next.utm_campaign_id ||
    next.utm_adset_id ||
    next.utm_ad_id ||
    next.utm_term ||
    next.fbclid ||
    next.fbc ||
    next.fbp ||
    next.event_source_url
  ) {
    storage.setItem(
      ATTRIBUTION_KEY,
      JSON.stringify({
        ...stored,
        ...next,
      })
    );
  }

  return next;
}

export function getPreferredLang() {
  const slug =
    window.location.pathname.replace(/^\/+/, '').toLowerCase().split('/')[0] || 'default';
  const preferred = storage.getItem(`preferredLang:${slug}`);
  if (preferred && ['de', 'it', 'fr', 'ru', 'en', 'hu'].includes(preferred)) {
    return preferred;
  }

  const browserLang = String((navigator.language || 'de').split('-')[0] || 'de').toLowerCase();
  return ['it', 'fr', 'ru', 'en', 'hu'].includes(browserLang) ? browserLang : 'de';
}

export function t(key) {
  const lang = getPreferredLang();
  const raw =
    (window.TRANSLATIONS &&
      ((window.TRANSLATIONS[lang] || {})[key] || (window.TRANSLATIONS.de || {})[key])) ||
    key;
  return applyBrandName(raw);
}

export function setPreferredLang(lang) {
  if (!['de', 'it', 'fr', 'ru', 'en', 'hu'].includes(lang)) {
    return;
  }

  storage.setItem(`preferredLang:${getCurrentSlug()}`, lang);
  window.location.reload();
}

export function validateSlug(slug) {
  return /^[a-z0-9_-]{1,25}$/.test(String(slug || ''));
}

export function getCurrentSlug() {
  const firstPathSegment =
    window.location.pathname.replace(/^\/+/, '').toLowerCase().split('/')[0] || 'default';
  return validateSlug(firstPathSegment) ? firstPathSegment : 'default';
}

function normalizeCoachSlugCandidate(value) {
  const slug = String(value || '').trim().toLowerCase();
  return slug && slug !== 'default' && validateSlug(slug) ? slug : '';
}

function firstValidCoachSlug(...values) {
  for (const value of values) {
    const slug = normalizeCoachSlugCandidate(value);
    if (slug) return slug;
  }
  return '';
}

export function isoNow() {
  return new Date().toISOString();
}

function nowTs() {
  return Date.now();
}

function randomString(length = 24) {
  if (window.crypto && window.crypto.getRandomValues) {
    const bytes = new Uint8Array(Math.ceil(length / 2));
    window.crypto.getRandomValues(bytes);
    return Array.from(bytes, (value) => value.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, length);
  }

  let value = '';
  while (value.length < length) {
    value += Math.random().toString(36).slice(2);
  }
  return value.slice(0, length);
}

function generateId(prefix, length = 24) {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') {
    return `${prefix}_${window.crypto.randomUUID().replace(/-/g, '')}`;
  }

  return `${prefix}_${nowTs().toString(36)}_${randomString(length)}`;
}

function generateClientSeed() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID();
  }

  return [
    randomString(8),
    randomString(4),
    `4${randomString(3)}`,
    `a${randomString(3)}`,
    randomString(12),
  ].join('-');
}

function isServerLeadHash(value) {
  return /^qz_[a-zA-Z0-9_]{8,96}$/.test(String(value || ''));
}

function readJson(key) {
  try {
    return JSON.parse(storage.getItem(key) || 'null');
  } catch {
    return null;
  }
}

function writeSessionCookie(hash) {
  if (!hash) return;
  try {
    document.cookie = [
      `${TRACKING_COOKIE}=${encodeURIComponent(hash)}`,
      `Max-Age=${Math.floor(TRACKING_SESSION_TTL_MS / 1000)}`,
      'Path=/',
      'SameSite=Lax',
      'Secure',
    ].join('; ');
  } catch (error) {
    console.warn('Cookie set failed:', error);
  }
}

function writeCookie(name, value, maxAgeSeconds) {
  if (!name || value === undefined || value === null || value === '') return;
  try {
    document.cookie = [
      `${name}=${encodeURIComponent(String(value))}`,
      `Max-Age=${maxAgeSeconds}`,
      'Path=/',
      'SameSite=Lax',
      'Secure',
    ].join('; ');
  } catch (error) {
    console.warn('Cookie set failed:', error);
  }
}

function clearCookie(name) {
  if (!name) return;
  try {
    document.cookie = [`${name}=`, 'Max-Age=0', 'Path=/', 'SameSite=Lax', 'Secure'].join('; ');
  } catch (error) {
    console.warn('Cookie clear failed:', error);
  }
}

function parseBooleanFlag(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  if (!normalized) return null;
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return null;
}

function generateVisitorId() {
  return generateId('av', 32);
}

export function getTrackingVisitorId() {
  const storedVisitorId = String(storage.getItem(VISITOR_KEY) || '').trim();
  if (storedVisitorId.indexOf('av_') === 0) {
    writeCookie(VISITOR_COOKIE, storedVisitorId, Math.floor(VISITOR_TTL_MS / 1000));
    return storedVisitorId;
  }

  const cookieVisitorId = (() => {
    try {
      const source = document.cookie || '';
      const prefix = `${VISITOR_COOKIE}=`;
      return source
        .split(';')
        .map((part) => part.trim())
        .find((part) => part.indexOf(prefix) === 0)
        ?.slice(prefix.length);
    } catch {
      return '';
    }
  })();

  if (cookieVisitorId && String(cookieVisitorId).indexOf('av_') === 0) {
    storage.setItem(VISITOR_KEY, String(cookieVisitorId));
    writeCookie(VISITOR_COOKIE, cookieVisitorId, Math.floor(VISITOR_TTL_MS / 1000));
    return String(cookieVisitorId);
  }

  const visitorId = generateVisitorId();
  storage.setItem(VISITOR_KEY, visitorId);
  writeCookie(VISITOR_COOKIE, visitorId, Math.floor(VISITOR_TTL_MS / 1000));
  return visitorId;
}

export function isInternalTraffic() {
  const params = new URLSearchParams(window.location.search || '');
  const explicitFlag =
    parseBooleanFlag(params.get('internal')) ??
    parseBooleanFlag(params.get('internal_traffic')) ??
    parseBooleanFlag(params.get('qa')) ??
    parseBooleanFlag(params.get('test'));

  if (explicitFlag !== null) {
    storage.setItem(INTERNAL_KEY, explicitFlag ? '1' : '0');
    if (explicitFlag) {
      writeCookie(INTERNAL_COOKIE, '1', Math.floor(INTERNAL_TTL_MS / 1000));
    } else {
      clearCookie(INTERNAL_COOKIE);
    }
    return explicitFlag;
  }

  const host = String(window.location.hostname || '').toLowerCase();
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host.endsWith('.vercel.app')
  ) {
    storage.setItem(INTERNAL_KEY, '1');
    writeCookie(INTERNAL_COOKIE, '1', Math.floor(INTERNAL_TTL_MS / 1000));
    return true;
  }

  const storedFlag = parseBooleanFlag(storage.getItem(INTERNAL_KEY));
  if (storedFlag !== null) {
    if (storedFlag) {
      writeCookie(INTERNAL_COOKIE, '1', Math.floor(INTERNAL_TTL_MS / 1000));
    }
    return storedFlag;
  }

  return false;
}

function getLeadRunKey(slug = getCurrentSlug()) {
  return `${LEAD_RUN_PREFIX}${String(slug || 'default').toLowerCase()}`;
}

function getLeadSystemStateKey(slug = getCurrentSlug()) {
  return `${LEAD_SYSTEM_STATE_PREFIX}${String(slug || 'default').toLowerCase()}`;
}

function readLeadSystemState(slug = getCurrentSlug()) {
  const state = readJson(getLeadSystemStateKey(slug));
  return state && typeof state === 'object' ? state : null;
}

function writeLeadSystemState(slug, state) {
  storage.setItem(getLeadSystemStateKey(slug), JSON.stringify(state || {}));
}

export function getTrackingSessionHash(slug = getCurrentSlug(), memberId = '') {
  const normalizedSlug = String(slug || 'default').toLowerCase();
  const normalizedMemberId = String(memberId || '');
  const existing = readJson(TRACKING_SESSION_KEY);

  if (
    existing &&
    existing.hash &&
    String(existing.hash).indexOf('ac_') === 0 &&
    existing.updatedAt
  ) {
    const sameCoach =
      !normalizedMemberId || !existing.memberId || existing.memberId === normalizedMemberId;
    const sameSlug = !normalizedSlug || !existing.slug || existing.slug === normalizedSlug;
    if (sameCoach && sameSlug && nowTs() - Number(existing.updatedAt) <= TRACKING_SESSION_TTL_MS) {
      const updated = {
        hash: String(existing.hash),
        memberId: normalizedMemberId || String(existing.memberId || ''),
        slug: normalizedSlug || String(existing.slug || ''),
        updatedAt: nowTs(),
      };
      storage.setItem(TRACKING_SESSION_KEY, JSON.stringify(updated));
      writeSessionCookie(updated.hash);
      return updated.hash;
    }
  }

  const hash = generateId('ac', 32);
  getTrackingVisitorId();
  storage.setItem(
    TRACKING_SESSION_KEY,
    JSON.stringify({
      hash,
      memberId: normalizedMemberId,
      slug: normalizedSlug,
      updatedAt: nowTs(),
    })
  );
  writeSessionCookie(hash);
  return hash;
}

function createLeadRun(slug = getCurrentSlug(), memberId = '') {
  const normalizedSlug = String(slug || 'default').toLowerCase();
  const sessionHash = getTrackingSessionHash(normalizedSlug, memberId);
  const visitorId = getTrackingVisitorId();
  const leadRun = {
    lead_hash: generateId('qz', 24),
    client_seed: generateClientSeed(),
    token: generateId('tf', 28).replace(/_/g, ''),
    event_id: generateId('evt', 24).replace(/_/g, '').toUpperCase(),
    session_hash: sessionHash,
    tracking_hash: sessionHash,
    visitor_id: visitorId,
    slug: normalizedSlug,
    member_id: String(memberId || ''),
    state: 'active',
    createdAt: isoNow(),
    updatedAt: isoNow(),
    submittedAt: null,
  };
  storage.setItem(getLeadRunKey(normalizedSlug), JSON.stringify(leadRun));
  return leadRun;
}

export function getActiveLeadRun(slug = getCurrentSlug(), memberId = '') {
  const normalizedSlug = String(slug || 'default').toLowerCase();
  const existing = readJson(getLeadRunKey(normalizedSlug));
  if (existing && existing.lead_hash && existing.token) {
    const sessionHash = existing.session_hash || getTrackingSessionHash(normalizedSlug, memberId);
    const updated = {
      ...existing,
      client_seed: existing.client_seed || generateClientSeed(),
      session_hash: sessionHash,
      tracking_hash: existing.tracking_hash || sessionHash,
      visitor_id: existing.visitor_id || getTrackingVisitorId(),
      member_id: String(memberId || existing.member_id || ''),
      updatedAt: isoNow(),
    };
    storage.setItem(getLeadRunKey(normalizedSlug), JSON.stringify(updated));
    return updated;
  }

  return createLeadRun(normalizedSlug, memberId);
}

function getLeadRunForSubmission(slug = getCurrentSlug(), memberId = '') {
  const normalizedSlug = String(slug || 'default').toLowerCase();
  const existing = readJson(getLeadRunKey(normalizedSlug));
  if (existing && existing.lead_hash && existing.token && existing.state !== 'submitted') {
    return getActiveLeadRun(normalizedSlug, memberId);
  }

  return createLeadRun(normalizedSlug, memberId);
}

export function resetLeadRun(slug = getCurrentSlug(), memberId = '') {
  return createLeadRun(slug, memberId);
}

function markLeadRun(slug, leadRun, state) {
  if (!leadRun || !leadRun.lead_hash) return leadRun;
  const updated = {
    ...leadRun,
    state,
    updatedAt: isoNow(),
    submittedAt: state === 'submitted' ? isoNow() : leadRun.submittedAt || null,
  };
  storage.setItem(getLeadRunKey(slug), JSON.stringify(updated));
  return updated;
}

function normalizeEventNameForLeadSystem(eventName) {
  const name = String(eventName || '');
  if (name === 'question_answered') return 'quiz_answer';
  if (name === 'cta_click') return 'cta_clicked';
  return name;
}

function isNewLeadWriterActive(slug = getCurrentSlug()) {
  const state = readLeadSystemState(slug);
  return state?.enabled === true && isServerLeadHash(state.lead_hash);
}

export function isLeadSystemV2Active(slug = getCurrentSlug()) {
  return isNewLeadWriterActive(slug);
}

function updateLeadRunWithServerHash(slug, memberId, leadHash, enabled) {
  const current = getActiveLeadRun(slug, memberId);
  const updated = {
    ...current,
    lead_hash: isServerLeadHash(leadHash) ? leadHash : current.lead_hash,
    lead_system_v2_enabled: enabled === true,
    updatedAt: isoNow(),
  };
  storage.setItem(getLeadRunKey(slug), JSON.stringify(updated));
  return updated;
}

export function adoptResumeLeadRun({
  slug = getCurrentSlug(),
  memberId = '',
  leadHash = '',
  sessionHash = '',
}) {
  const normalizedSlug = String(slug || 'default').toLowerCase();
  if (!isServerLeadHash(leadHash)) return null;

  const existing = getActiveLeadRun(normalizedSlug, memberId);
  const trackingHash = sessionHash || existing.session_hash || getTrackingSessionHash(normalizedSlug, memberId);
  const updated = {
    ...existing,
    lead_hash: leadHash,
    session_hash: trackingHash,
    tracking_hash: trackingHash,
    member_id: String(memberId || existing.member_id || ''),
    state: existing.state || 'submitted',
    lead_system_v2_enabled: true,
    updatedAt: isoNow(),
  };
  storage.setItem(getLeadRunKey(normalizedSlug), JSON.stringify(updated));
  writeLeadSystemState(normalizedSlug, {
    enabled: true,
    lead_hash: leadHash,
    client_seed: updated.client_seed,
    source: 'resume',
    checkedAt: isoNow(),
  });
  return updated;
}

async function initializeLeadSystemV2(coach, slug) {
  const normalizedSlug = String(slug || coach?.slug || getCurrentSlug() || 'default').toLowerCase();
  const memberId = String(coach?.member_id || storage.getItem('acMemberId') || '');
  const leadRun = getActiveLeadRun(normalizedSlug, memberId);
  const params = new URLSearchParams(window.location.search || '');
  const attribution = getLeadAttribution();
  const response = await fetch('/api/lead/init', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_seed: leadRun.client_seed,
      lead_hash: leadRun.lead_hash,
      member_id: memberId,
      ref_id: params.get('ref') || params.get('ref_id') || memberId,
      ref_type: params.get('ref') || params.get('ref_id') ? 'referral_code' : 'member',
      berater_slug: normalizedSlug,
      source_app: 'business_leads_quiz',
      funnel_key: 'business',
      lang: getPreferredLang(),
      country: getCurrentCountry(),
      utm_source: attribution.utm_source,
      utm_medium: attribution.utm_medium,
      utm_campaign: attribution.utm_campaign,
      utm_content: attribution.utm_content,
      utm_campaign_id: attribution.utm_campaign_id,
      utm_adset_id: attribution.utm_adset_id,
      utm_ad_id: attribution.utm_ad_id,
      utm_term: attribution.utm_term,
      fbclid: attribution.fbclid,
      fbc: attribution.fbc,
      fbp: attribution.fbp,
      event_source_url: attribution.event_source_url,
    }),
  });

  const data = await response.json().catch(() => ({}));
  const enabled = response.ok && data.enabled === true && isServerLeadHash(data.lead_hash);
  const updatedRun = enabled
    ? updateLeadRunWithServerHash(normalizedSlug, memberId, data.lead_hash, true)
    : leadRun;

  writeLeadSystemState(normalizedSlug, {
    enabled,
    lead_hash: enabled ? updatedRun.lead_hash : leadRun.lead_hash,
    client_seed: leadRun.client_seed,
    flags: data.flags || null,
    checkedAt: isoNow(),
  });

  return { enabled, leadRun: updatedRun, flags: data.flags || null };
}

const LEAD_TRACK_ENDPOINT = '/api/lead-track';
let leadEventQueue = null;

function getLeadEventQueue() {
  if (leadEventQueue) return leadEventQueue;

  const queue = createLeadEventQueue({
    storage,
    // Thunk statt window.fetch: eine losgeloeste fetch-Referenz wirft im Browser "Illegal invocation".
    fetchFn: (url, options) => fetch(url, options),
    endpoint: LEAD_TRACK_ENDPOINT,
  });
  leadEventQueue = queue;

  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    // Einmalige Registrierung beim ersten Queue-Zugriff: der Start selbst liefert nach einem
    // Reload nach, danach uebernehmen Online- und Sichtbarkeitswechsel.
    window.addEventListener('online', () => queue.drain());
    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') queue.drain();
      });
    }
    queue.drain();
  }

  return leadEventQueue;
}

function sendLeadTrackEvent(eventName, payload = {}) {
  const slug = String(
    storage.getItem('acBeraterSlug') || (getCoachFromStorage() || {}).slug || getCurrentSlug() || 'default'
  );
  const memberId = String(storage.getItem('acMemberId') || '');
  const leadRun = getActiveLeadRun(slug, memberId);
  const normalizedName = normalizeEventNameForLeadSystem(eventName);
  const eventPayload = {
    ...payload,
    lead_hash: leadRun.lead_hash,
    client_seed: leadRun.client_seed,
    visitor_id: getTrackingVisitorId(),
    member_id: memberId,
    ref_id: payload.ref_id || memberId,
    berater_slug: slug,
    source_app: 'business_leads_quiz',
    funnel_key: 'business',
    lang: getPreferredLang(),
    event_at: payload.event_at || payload.visited_at || payload.form_submitted_at || isoNow(),
    is_internal_traffic: isInternalTraffic(),
    is_resume: storage.getItem('acSessionIsResume') === 'true',
  };

  getLeadEventQueue().enqueue({
    uid: generateId('evtq', 24),
    leadHash: leadRun.lead_hash,
    eventName: normalizedName,
    payload: eventPayload,
  });
}

function metaQualityFromTrackEvent(eventName, payload = {}) {
  const normalizedName = normalizeEventNameForLeadSystem(eventName);
  if (normalizedName === 'video_completed' || normalizedName === 'video_unlocked') {
    const step = Number(payload.video_step || 0);
    if (step === 1) {
      return {
        customEvent: 'BusinessQuizVideo1Completed',
        standardEvent: 'ViewContent',
        contentName: 'Business Quiz Video 1 Completed',
        value: 1,
      };
    }
    if (step === 2) {
      return {
        customEvent: 'BusinessQuizVideo2Completed',
        standardEvent: 'ViewContent',
        contentName: 'Business Quiz Video 2 Completed',
        value: 3,
      };
    }
    if (step === 3) {
      return {
        customEvent: 'BusinessQuizHotLead',
        standardEvent: 'CompleteRegistration',
        contentName: 'Business Quiz Hot Lead',
        value: 10,
      };
    }
  }

  if (normalizedName === 'cta_clicked') {
    const ctaType = String(payload.cta_type || '').trim().toLowerCase();
    if (ctaType && !['spaeter', 'later', 'not_now', 'nicht_interessiert', 'no'].includes(ctaType)) {
      return {
        customEvent: 'BusinessQuizFinalCTA',
        standardEvent: 'Contact',
        contentName: 'Business Quiz Final CTA',
        value: 20,
      };
    }
  }

  return null;
}

function sendMetaBrowserQualityEvent(eventName, payload = {}, leadHash = '') {
  if (typeof window === 'undefined' || typeof window.fbq !== 'function') return;
  const quality = metaQualityFromTrackEvent(eventName, payload, leadHash);
  if (!quality) return;

  const data = {
    content_name: quality.contentName,
    content_category: 'Business Opportunity',
    funnel: 'business_leads_quiz',
    quality_signal: quality.customEvent,
    video_step: payload.video_step || undefined,
    value: quality.value,
    currency: 'EUR',
  };

  try {
    window.fbq('trackCustom', quality.customEvent, data, {
      eventID: `${leadHash}_${quality.customEvent}`,
    });
    window.fbq('track', quality.standardEvent, data, {
      eventID: `${leadHash}_${quality.customEvent}_${quality.standardEvent}`,
    });
  } catch {
    // Meta tracking must never interrupt the quiz flow.
  }
}

export function getCoachFromStorage() {
  try {
    return JSON.parse(storage.getItem('acCoach') || 'null');
  } catch {
    return null;
  }
}

export function getBrandName(coach = null) {
  const activeCoach = coach || getCoachFromStorage();
  const orgName = String(activeCoach?.organisation_name || '').trim();
  return orgName || 'Activecenter';
}

export function applyBrandName(text, coach = null) {
  return String(text === null || text === undefined ? '' : text)
    .replace(/ActiveCenter/g, getBrandName(coach))
    .replace(/Activecenter/g, getBrandName(coach));
}

function getCurrentCountry() {
  return (
    String((navigator.language || 'de').split('-')[1] || 'DE')
      .toUpperCase()
      .replace(/[^A-Z]/g, '')
      .slice(0, 2) || 'DE'
  );
}

function getCurrentDeviceType() {
  const ua = String(navigator.userAgent || '').toLowerCase();
  if (/ipad|tablet/.test(ua)) return 'tablet';
  if (/mobi|android|iphone|ipod/.test(ua)) return 'mobile';
  return 'desktop';
}

async function lookupCoach(slug) {
  const response = await fetch('/api/bridge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'lookup_subdomain', subdomain: String(slug || '').trim().toLowerCase() }),
  });

  return response.json();
}

async function recoverCoachMemberId(slug) {
  const normalizedSlug = String(slug || '').trim().toLowerCase();
  if (!normalizedSlug || normalizedSlug === 'default') return '';

  const freshCoach = await lookupCoach(normalizedSlug);
  const memberId = String(freshCoach?.herbalife_id || freshCoach?.member_id || '').trim();
  if (!memberId) return '';

  storage.setItem('acMemberId', memberId);
  storage.setItem('acBeraterSlug', normalizedSlug);
  storage.setItem('acCoach', JSON.stringify(normalizeCoach(freshCoach, normalizedSlug)));
  return memberId;
}

function normalizeCoach(rawCoach, slug) {
  if (!rawCoach) {
    return { ...DEFAULT_COACH };
  }

  return {
    slug,
    member_id: rawCoach.herbalife_id || '',
    organisation_name: rawCoach.organisation_name || 'Activecenter',
    full_name: rawCoach.full_name || 'Coach',
    first_name: rawCoach.first_name || 'Coach',
    phone: rawCoach.phone || '',
    email: rawCoach.email || '',
    preferred_newsletter_language: rawCoach.preferred_newsletter_language || '',
    language: rawCoach.preferred_newsletter_language || rawCoach.language || rawCoach.lang || '',
    avatar_300: rawCoach.avatar_300 || '',
    avatar_600: rawCoach.avatar_600 || '',
    address: rawCoach.address || null,
    instagram: rawCoach.instagram || '',
    facebook: rawCoach.facebook || '',
  };
}

export async function initializeQuizEnvironment(options = {}) {
  const { deferLeadSystem = false } = options || {};
  // Queue immer beim App-Start initialisieren (Nachlieferung + online-Listener), auch wenn
  // /api/lead/init danach scheitert oder kein Coach-Slug vorliegt: ein Offline-Reload setzt
  // den v2-State lokal auf enabled:false, und ohne diesen Aufruf wuerde ein wartender
  // Backlog erst beim naechsten erfolgreichen Besuch wieder angefasst.
  getLeadEventQueue();
  const slug = getCurrentSlug();
  storage.removeItem(LEGACY_QUIZ_HASH_KEY);
  storage.removeItem(`${LEGACY_QUIZ_HASH_PREFIX}${slug}`);

  if (slug === 'default') {
    return { coach: null, reason: 'missing_handle', slug };
  }

  let coachResponse;
  try {
    coachResponse = await lookupCoach(slug);
  } catch {
    return { coach: null, reason: 'coach_lookup_failed', slug };
  }

  if (!coachResponse.herbalife_id || String(coachResponse.herbalife_id).trim() === '') {
    return { coach: null, reason: 'coach_not_found', slug };
  }

  const coach = normalizeCoach(coachResponse, slug);

  storage.setItem('acCoach', JSON.stringify(coach));
  storage.setItem('acMemberId', coach.member_id || '');
  storage.setItem('acBeraterSlug', coach.slug || slug);
  document.title = applyBrandName(document.title, coach);
  getTrackingSessionHash(coach.slug || slug, coach.member_id || '');
  getActiveLeadRun(coach.slug || slug, coach.member_id || '');

  async function initializeLeadSystemAndTrackPageView() {
    try {
      await initializeLeadSystemV2(coach, coach.slug || slug);
    } catch (error) {
      writeLeadSystemState(coach.slug || slug, {
        enabled: false,
        error: error?.message || 'lead_system_init_failed',
        checkedAt: isoNow(),
      });
      console.warn('Lead system v2 init failed:', error);
    }

    trackQuizAnalytics('page_view', {
      visited_at: isoNow(),
      country: getCurrentCountry(),
      device_type: getCurrentDeviceType(),
      lang: getPreferredLang(),
    });
  }

  if (deferLeadSystem) {
    setTimeout(() => {
      initializeLeadSystemAndTrackPageView().catch((error) => {
        console.warn('Deferred lead system init failed:', error);
      });
    }, 0);
  } else {
    await initializeLeadSystemAndTrackPageView();
  }

  return { coach, reason: null, slug };
}

export function getVideoConfig() {
  const config = window.AC_VIDEO_CONFIG || {};
  const lang = getPreferredLang();
  const localized = config[lang] || config.de || {};
  const fallback = {
    1: { id: '88b6efb5-c382-4ca6-8935-60bf72bbc47f', lib: '242544' },
    2: { id: '069f507f-4fdb-4e40-a10f-5a3669cc3ca9', lib: '242544' },
    3: { id: '8f497dc5-85b2-4e66-a54a-3356fb0d44e6', lib: '242544' },
  };

  return {
    1: { ...(localized[1] || fallback[1]), title: t('video_1_title'), sub: t('video_1_sub') },
    2: { ...(localized[2] || fallback[2]), title: t('video_2_title'), sub: t('video_2_sub') },
    3: { ...(localized[3] || fallback[3]), title: t('video_3_title'), sub: t('video_3_sub') },
  };
}

export function getQuestions() {
  return [
    {
      id: 1,
      phase: 1,
      phaseLabel: t('q1_phase'),
      text: t('q1_text'),
      sub: t('q1_sub'),
      options: [
        { label: t('q1_opt_r_label'), desc: t('q1_opt_r_desc'), type: 'R' },
        { label: t('q1_opt_y_label'), desc: t('q1_opt_y_desc'), type: 'Y' },
        { label: t('q1_opt_g_label'), desc: t('q1_opt_g_desc'), type: 'G' },
        { label: t('q1_opt_b_label'), desc: t('q1_opt_b_desc'), type: 'B' },
      ],
    },
    {
      id: 2,
      phase: 1,
      phaseLabel: t('q2_phase'),
      text: t('q2_text'),
      sub: t('q2_sub'),
      options: [
        { label: t('q2_opt_r_label'), desc: t('q2_opt_r_desc'), type: 'R' },
        { label: t('q2_opt_y_label'), desc: t('q2_opt_y_desc'), type: 'Y' },
        { label: t('q2_opt_g_label'), desc: t('q2_opt_g_desc'), type: 'G' },
        { label: t('q2_opt_b_label'), desc: t('q2_opt_b_desc'), type: 'B' },
      ],
    },
    {
      id: 3,
      phase: 1,
      phaseLabel: t('q3_phase'),
      text: t('q3_text'),
      sub: t('q3_sub'),
      options: [
        { label: t('q3_opt_r_label'), desc: t('q3_opt_r_desc'), type: 'R' },
        { label: t('q3_opt_y_label'), desc: t('q3_opt_y_desc'), type: 'Y' },
        { label: t('q3_opt_b_label'), desc: t('q3_opt_b_desc'), type: 'B' },
        { label: t('q3_opt_g_label'), desc: t('q3_opt_g_desc'), type: 'G' },
      ],
    },
    {
      id: 4,
      phase: 2,
      phaseLabel: t('q4_phase'),
      text: t('q4_text'),
      sub: t('q4_sub'),
      options: [
        { label: t('q4_opt_freedom_label'), desc: t('q4_opt_freedom_desc'), aspiration: 'freedom' },
        { label: t('q4_opt_impact_label'), desc: t('q4_opt_impact_desc'), aspiration: 'impact' },
        {
          label: t('q4_opt_security_label'),
          desc: t('q4_opt_security_desc'),
          aspiration: 'security',
        },
        { label: t('q4_opt_growth_label'), desc: t('q4_opt_growth_desc'), aspiration: 'growth' },
      ],
    },
    {
      id: 5,
      phase: 2,
      phaseLabel: t('q5_phase'),
      text: t('q5_text'),
      sub: t('q5_sub'),
      options: [
        { label: t('q5_opt_freedom_label'), desc: t('q5_opt_freedom_desc'), aspiration: 'freedom' },
        { label: t('q5_opt_impact_label'), desc: t('q5_opt_impact_desc'), aspiration: 'impact' },
        {
          label: t('q5_opt_security_label'),
          desc: t('q5_opt_security_desc'),
          aspiration: 'security',
        },
        { label: t('q5_opt_growth_label'), desc: t('q5_opt_growth_desc'), aspiration: 'growth' },
      ],
    },
    {
      id: 6,
      phase: 2,
      phaseLabel: t('q6_phase'),
      text: t('q6_text'),
      sub: t('q6_sub'),
      options: [
        { label: t('q6_opt_vehicle_label'), desc: t('q6_opt_vehicle_desc'), barrier: 'vehicle' },
        {
          label: t('q6_opt_community_label'),
          desc: t('q6_opt_community_desc'),
          barrier: 'community',
        },
        {
          label: t('q6_opt_confidence_label'),
          desc: t('q6_opt_confidence_desc'),
          barrier: 'confidence',
        },
        {
          label: t('q6_opt_opportunity_label'),
          desc: t('q6_opt_opportunity_desc'),
          barrier: 'opportunity',
        },
      ],
    },
  ];
}

export function getProfiles() {
  return {
    R: {
      code: t('profile_r_code'),
      name: t('profile_r_name'),
      emoji: '\u{1F525}',
      animal: t('profile_r_animal'),
      tagline: t('profile_r_tagline'),
      accentColor: '#FF6B6B',
      accentSoft: 'rgba(255,107,107,0.1)',
      strengths: [
        t('profile_r_str_1'),
        t('profile_r_str_2'),
        t('profile_r_str_3'),
        t('profile_r_str_4'),
      ],
      shadow: t('profile_r_shadow'),
      fitMap: {
        freedom: t('profile_r_fit_freedom'),
        impact: t('profile_r_fit_impact'),
        security: t('profile_r_fit_security'),
        growth: t('profile_r_fit_growth'),
      },
      ctaMap: {
        freedom: t('profile_r_cta_freedom'),
        impact: t('profile_r_cta_impact'),
        security: t('profile_r_cta_security'),
        growth: t('profile_r_cta_growth'),
      },
      finalCta: t('profile_r_final_cta'),
    },
    Y: {
      code: t('profile_y_code'),
      name: t('profile_y_name'),
      emoji: '\u{1F4A8}',
      animal: t('profile_y_animal'),
      tagline: t('profile_y_tagline'),
      accentColor: '#FFD166',
      accentSoft: 'rgba(255,209,102,0.1)',
      strengths: [
        t('profile_y_str_1'),
        t('profile_y_str_2'),
        t('profile_y_str_3'),
        t('profile_y_str_4'),
      ],
      shadow: t('profile_y_shadow'),
      fitMap: {
        freedom: t('profile_y_fit_freedom'),
        impact: t('profile_y_fit_impact'),
        security: t('profile_y_fit_security'),
        growth: t('profile_y_fit_growth'),
      },
      ctaMap: {
        freedom: t('profile_y_cta_freedom'),
        impact: t('profile_y_cta_impact'),
        security: t('profile_y_cta_security'),
        growth: t('profile_y_cta_growth'),
      },
      finalCta: t('profile_y_final_cta'),
    },
    G: {
      code: t('profile_g_code'),
      name: t('profile_g_name'),
      emoji: '\u{1F30A}',
      animal: t('profile_g_animal'),
      tagline: t('profile_g_tagline'),
      accentColor: '#6ECB8A',
      accentSoft: 'rgba(110,203,138,0.1)',
      strengths: [
        t('profile_g_str_1'),
        t('profile_g_str_2'),
        t('profile_g_str_3'),
        t('profile_g_str_4'),
      ],
      shadow: t('profile_g_shadow'),
      fitMap: {
        freedom: t('profile_g_fit_freedom'),
        impact: t('profile_g_fit_impact'),
        security: t('profile_g_fit_security'),
        growth: t('profile_g_fit_growth'),
      },
      ctaMap: {
        freedom: t('profile_g_cta_freedom'),
        impact: t('profile_g_cta_impact'),
        security: t('profile_g_cta_security'),
        growth: t('profile_g_cta_growth'),
      },
      finalCta: t('profile_g_final_cta'),
    },
    B: {
      code: t('profile_b_code'),
      name: t('profile_b_name'),
      emoji: '\u{1FAA8}',
      animal: t('profile_b_animal'),
      tagline: t('profile_b_tagline'),
      accentColor: '#74B9FF',
      accentSoft: 'rgba(116,185,255,0.1)',
      strengths: [
        t('profile_b_str_1'),
        t('profile_b_str_2'),
        t('profile_b_str_3'),
        t('profile_b_str_4'),
      ],
      shadow: t('profile_b_shadow'),
      fitMap: {
        freedom: t('profile_b_fit_freedom'),
        impact: t('profile_b_fit_impact'),
        security: t('profile_b_fit_security'),
        growth: t('profile_b_fit_growth'),
      },
      ctaMap: {
        freedom: t('profile_b_cta_freedom'),
        impact: t('profile_b_cta_impact'),
        security: t('profile_b_cta_security'),
        growth: t('profile_b_cta_growth'),
      },
      finalCta: t('profile_b_final_cta'),
    },
  };
}

export function getAnalyzingSteps() {
  return [
    t('analyzing_step_1'),
    t('analyzing_step_2'),
    t('analyzing_step_3'),
    t('analyzing_step_4'),
    t('analyzing_step_5'),
  ];
}

export function trackQuizAnalytics(eventName, payload = {}) {
  const slug = String(
    storage.getItem('acBeraterSlug') || (getCoachFromStorage() || {}).slug || getCurrentSlug() || 'default'
  );
  const memberId = String(storage.getItem('acMemberId') || '');
  const leadRun = getActiveLeadRun(slug, memberId);
  sendMetaBrowserQualityEvent(eventName, payload, leadRun.lead_hash);
  if (isNewLeadWriterActive(slug)) {
    sendLeadTrackEvent(eventName, payload);
    return;
  }

  // Dynamically import trackEvent from ac-track.js to use EventBatcher
  // This ensures events are batched, deduplicated with event_id, and persisted to localStorage
  import('../ac-track.js').then(({ trackEvent }) => {
    const isResume = storage.getItem('acSessionIsResume') === 'true';

    // Build enriched payload with all tracking context
    const enrichedPayload = {
      lead_hash: leadRun.lead_hash,
      visitor_id: getTrackingVisitorId(),
      is_internal_traffic: isInternalTraffic(),
      is_resume: isResume,
      herbalife_id: memberId,
      member_id: memberId,
      lang: getPreferredLang(),
      ...payload,
    };

    // Use trackEvent which handles:
    // - event_id generation (unique per event for deduplication)
    // - session_hash from localStorage (acQuizTrackingSession_v1)
    // - berater_slug from localStorage
    // - EventBatcher (batch, retry, localStorage persistence)
    trackEvent(eventName, enrichedPayload);
  }).catch(() => {
    console.warn('Failed to import trackEvent from ac-track.js');
  });
}

export async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeout);
    return response;
  } catch (error) {
    clearTimeout(timeout);
    if (error.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeoutMs}ms`, { cause: error });
    }
    throw error;
  }
}

export const videoProgressStore = {
  KEY_PREFIX: 'acVideoProgress_',
  key(slug) {
    const normalizedSlug = String(slug || getCurrentSlug() || 'default').toLowerCase();
    const memberId = String(storage.getItem('acMemberId') || '');
    const leadRun = getActiveLeadRun(normalizedSlug, memberId);
    const leadScope = leadRun?.lead_hash || leadRun?.client_seed || 'anonymous';
    return `${this.KEY_PREFIX}${normalizedSlug}_${leadScope}`;
  },
  setVideoCompleted(slug, videoStep) {
    const key = this.key(slug);
    try {
      const data = JSON.parse(storage.getItem(key) || '{}');
      data[videoStep] = true;
      storage.setItem(key, JSON.stringify(data));
    } catch (error) {
      console.warn('Failed to set video completed:', error);
    }
  },
  isVideoCompleted(slug, videoStep) {
    const key = this.key(slug);
    try {
      return JSON.parse(storage.getItem(key) || '{}')[videoStep] === true;
    } catch {
      return false;
    }
  },
  clear(slug) {
    const normalizedSlug = String(slug || getCurrentSlug() || 'default').toLowerCase();
    storage.setItem(this.KEY_PREFIX + normalizedSlug, '{}');
    storage.setItem(this.key(normalizedSlug), '{}');
  },
};

export async function validateEmailAddress(email) {
  try {
    const response = await fetchWithTimeout(
      '/api/validate-email',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      },
      5000
    );

    if (!response.ok) {
      return true;
    }

    const data = await response.json();
    return data.valid === true;
  } catch {
    return true;
  }
}

// Der fruehere Browser-Direktcall an Mautic (submitMauticLead) wurde am 23.08.2026
// entfernt: Er scheiterte in Produktion nachweislich an CORS und war damit toter
// Code; die Mautic-Anbindung laeuft ausschliesslich serverseitig ueber den
// Contacts-Webhook (E2E-Livedurchlauf, docs/audits/e2e-livedurchlauf-2026-08-23).

function normalizeAspiration(value) {
  return ['freedom', 'impact', 'security', 'growth'].includes(value) ? value : 'freedom';
}

export function getAspirationLabel(aspiration) {
  return t(`asp_tag_${normalizeAspiration(aspiration)}`);
}

async function performQuizSubmission(
  firstName,
  email,
  selectedAnswers,
  profile,
  aspiration = 'freedom'
) {
  const coach = getCoachFromStorage() || {};
  const slug =
    firstValidCoachSlug(coach.slug, storage.getItem('acBeraterSlug'), getCurrentSlug()) ||
    'default';
  let memberId = String(storage.getItem('acMemberId') || coach.member_id || '');

  if (!memberId && slug && slug !== 'default') {
    try {
      memberId = await recoverCoachMemberId(slug);
    } catch (e) {
      console.warn('member_id recovery failed:', e?.message);
    }
  }

  const leadRun = markLeadRun(
    slug,
    getLeadRunForSubmission(slug, memberId),
    'submitting'
  );
  const hash = leadRun.lead_hash;
  const sessionHash = leadRun.session_hash || getTrackingSessionHash(slug, memberId);
  const visitorId = leadRun.visitor_id || getTrackingVisitorId();

  if (!hash) {
    return null;
  }

  const lang = getPreferredLang();
  const country = getCurrentCountry();
  const submittedAt = isoNow();
  const mainAspiration = normalizeAspiration(aspiration);
  const mainAspirationLabel = getAspirationLabel(mainAspiration);
  const initialBarrier = deriveQuizBarrier(selectedAnswers);
  const leadSystemV2Enabled = isNewLeadWriterActive(slug);
  const attribution = getLeadAttribution();
  const metaEventId = `capi_${hash}`;

  function sendInitialPointsResultUpdate() {
    if (isNewLeadWriterActive(slug)) return;
    fetch('/api/bridge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        action: 'update_points_result',
        payload: {
          lead_hash: hash,
          session_hash: sessionHash,
          berater_slug: slug,
          member_id: memberId,
          lang,
          video_step: 0,
          completed_count: 0,
          total_videos: DEFAULT_VIDEO_COUNT,
          completion_reason: 'initial_form_submit',
        },
      }),
    }).catch(() => undefined);
  }

  return fetchWithTimeout(
    '/api/bridge',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'forward_typeform_adapter',
        adapter_key: 'business_leads_quiz_v1',
        payload: {
          first_name: firstName,
          email,
          event_id: leadRun.event_id,
          token: leadRun.token,
          selected_answers: Array.isArray(selectedAnswers) ? selectedAnswers : [],
          profile: profile || null,
          main_aspiration: mainAspiration,
          main_aspiration_label: mainAspirationLabel,
          utm_source: attribution.utm_source,
          utm_medium: attribution.utm_medium,
          utm_campaign: attribution.utm_campaign,
          utm_content: attribution.utm_content,
          utm_campaign_id: attribution.utm_campaign_id,
          utm_adset_id: attribution.utm_adset_id,
          utm_ad_id: attribution.utm_ad_id,
          utm_term: attribution.utm_term,
          fbclid: attribution.fbclid,
          fbc: attribution.fbc,
          fbp: attribution.fbp,
          event_source_url: attribution.event_source_url,
          landed_at: submittedAt,
          submitted_at: submittedAt,
          hidden: {
            c: country,
            hash,
            lead_hash: hash,
            session_hash: sessionHash,
            tracking_hash: sessionHash,
            client_seed: leadRun.client_seed || '',
            lead_system_v2_enabled: leadSystemV2Enabled ? '1' : '0',
            visitor_id: visitorId,
            schema_version: TRACKING_SCHEMA_VERSION,
            main_aspiration: mainAspiration,
            main_aspiration_label: mainAspirationLabel,
            utm_source: attribution.utm_source,
            utm_medium: attribution.utm_medium,
            utm_campaign: attribution.utm_campaign,
            utm_content: attribution.utm_content,
            utm_campaign_id: attribution.utm_campaign_id,
            utm_adset_id: attribution.utm_adset_id,
            utm_ad_id: attribution.utm_ad_id,
            utm_term: attribution.utm_term,
            fbclid: attribution.fbclid,
            fbc: attribution.fbc,
            fbp: attribution.fbp,
            event_source_url: attribution.event_source_url,
            lang,
            berater_slug: slug,
            slug,
            member_id: memberId,
            ref_id: memberId,
            survey_id: '12',
          },
          calculated: { score: 0 },
          variables: [
            { key: 'contact_country', type: 'text', text: country },
            { key: 'score', type: 'number', number: 0 },
            { key: 'noemail', type: 'number', number: 1 },
            { key: 'main_aspiration', type: 'text', text: mainAspiration },
            { key: 'main_aspiration_label', type: 'text', text: mainAspirationLabel },
          ],
        },
        target: 'https://contacts.hl-support.biz/webhook/typeform',
        meta: {
          firstName,
          email,
          lang,
          leadHash: hash,
          sessionHash,
          visitorId,
          token: leadRun.token,
          mainAspiration,
          mainAspirationLabel,
          metaEventId,
          attribution,
        },
      }),
    },
    15000
  )
    .then((response) => {
      if (response.ok) {
        markLeadRun(slug, leadRun, 'submitted');
        if (isNewLeadWriterActive(slug)) {
          sendLeadTrackEvent('form_submitted', {
            first_name: firstName,
            email,
            form_first_name: firstName,
            form_email: email,
            form_submitted_at: submittedAt,
            submitted_at: submittedAt,
            profile_code: profile?.code || profile?.animal || '',
            profile_label: profile?.name || profile?.animal || '',
            main_aspiration: mainAspiration,
            main_aspiration_label: mainAspirationLabel,
            initial_barrier: initialBarrier,
            member_id: memberId,
            ref_id: memberId,
            berater_slug: slug,
            lang,
            utm_source: attribution.utm_source,
            utm_medium: attribution.utm_medium,
            utm_campaign: attribution.utm_campaign,
            utm_content: attribution.utm_content,
            utm_campaign_id: attribution.utm_campaign_id,
            utm_adset_id: attribution.utm_adset_id,
            utm_ad_id: attribution.utm_ad_id,
            utm_term: attribution.utm_term,
            fbclid: attribution.fbclid,
            fbc: attribution.fbc,
            fbp: attribution.fbp,
            event_source_url: attribution.event_source_url,
          });
        }
        sendInitialPointsResultUpdate();
      } else {
        markLeadRun(slug, leadRun, 'active');
      }
      return response.json().catch(() => ({})).then((data) => ({
        ...data,
        lead_hash: data.lead_hash || hash,
        meta_event_id: data.meta_event_id || metaEventId,
      }));
    })
    .catch((error) => {
      markLeadRun(slug, leadRun, 'active');
      return { success: false, error: error && error.message ? error.message : 'network_error' };
    });
}

let quizSubmissionInFlight = null;

export function forwardQuizSubmission(
  firstName,
  email,
  selectedAnswers,
  profile,
  aspiration = 'freedom'
) {
  if (quizSubmissionInFlight) return quizSubmissionInFlight;

  const submission = performQuizSubmission(
    firstName,
    email,
    selectedAnswers,
    profile,
    aspiration
  );
  quizSubmissionInFlight = submission;
  submission.finally(() => {
    if (quizSubmissionInFlight === submission) quizSubmissionInFlight = null;
  });
  return submission;
}

export const pageLayout = {
  minHeight: '100vh',
  background:
    'radial-gradient(ellipse at 20% 15%, rgba(201,168,76,0.05) 0%, transparent 45%), radial-gradient(ellipse at 80% 85%, rgba(74,100,200,0.05) 0%, transparent 45%), #070B14',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '24px 16px',
  fontFamily: "'DM Sans', system-ui, sans-serif",
};

export const panelStyle = (visible, extra = {}) => ({
  width: '100%',
  maxWidth: '680px',
  background: 'rgba(255,255,255,0.028)',
  borderRadius: '26px',
  border: '1px solid rgba(201,168,76,0.13)',
  padding: 'clamp(28px, 5vw, 50px) clamp(22px, 5vw, 46px)',
  backdropFilter: 'blur(20px)',
  opacity: visible ? 1 : 0,
  transform: visible ? 'translateY(0px)' : 'translateY(10px)',
  transition: 'opacity 0.35s ease, transform 0.35s ease',
  ...extra,
});

export const titleStyle = (size, extra = {}) => ({
  fontFamily: "'Cormorant Garamond', Georgia, serif",
  fontSize: `clamp(${Math.round(size * 0.62)}px, ${size * 0.07}vw + 10px, ${size}px)`,
  lineHeight: 1.2,
  color: '#F5F0E8',
  ...extra,
});

export const badgeStyle = {
  fontFamily: "'DM Sans', system-ui",
  fontSize: '11px',
  letterSpacing: '3.5px',
  textTransform: 'uppercase',
  color: '#C9A84C',
  marginBottom: '12px',
  display: 'block',
};

export const primaryButtonStyle = (backgroundColor, color = '#0A0A0A', extra = {}) => ({
  background: `linear-gradient(135deg, ${backgroundColor}, ${backgroundColor}CC)`,
  color,
  border: 'none',
  borderRadius: '100px',
  padding: '15px 40px',
  fontSize: '15px',
  fontWeight: '600',
  cursor: 'pointer',
  letterSpacing: '0.3px',
  ...extra,
});

export const secondaryButtonStyle = (extra = {}) => ({
  background: 'none',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '100px',
  padding: '13px 24px',
  color: 'rgba(245,240,232,0.38)',
  fontSize: '13px',
  cursor: 'pointer',
  ...extra,
});

export const inputStyle = {
  width: '100%',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '12px',
  padding: '14px 18px',
  fontSize: '15px',
  color: '#F5F0E8',
  outline: 'none',
  boxSizing: 'border-box',
  fontFamily: "'DM Sans', system-ui",
};
