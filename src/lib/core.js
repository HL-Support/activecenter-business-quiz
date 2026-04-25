const MAUTIC_BASE_URL = 'https://mautic.deinedomain.com';
const TRACKING_SESSION_KEY = 'acTrackingSession';
const TRACKING_COOKIE = 'acTrackingHash';
const TRACKING_SESSION_TTL_MS = 60 * 60 * 1000;
const VISITOR_KEY = 'acVisitorId';
const VISITOR_COOKIE = 'acVisitorId';
const VISITOR_TTL_MS = 180 * 24 * 60 * 60 * 1000;
const INTERNAL_KEY = 'acInternalTraffic';
const INTERNAL_COOKIE = 'acInternalTraffic';
const INTERNAL_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const TRACKING_SCHEMA_VERSION = 'ac_tracking_v1';
const LEGACY_QUIZ_HASH_KEY = 'acQuizHash';
const LEGACY_QUIZ_HASH_PREFIX = 'acQuizHash:';
const LEAD_RUN_PREFIX = 'acLeadRun:';
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

export function getPreferredLang() {
  const preferred = storage.getItem('preferredLang');
  if (preferred && ['de', 'it', 'fr', 'ru', 'en'].includes(preferred)) {
    return preferred;
  }

  const browserLang = String((navigator.language || 'de').split('-')[0] || 'de').toLowerCase();
  return ['it', 'fr', 'ru', 'en'].includes(browserLang) ? browserLang : 'de';
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
  if (!['de', 'it', 'fr', 'ru', 'en'].includes(lang)) {
    return;
  }

  storage.setItem('preferredLang', lang);
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
    body: JSON.stringify({ action: 'lookup_subdomain', subdomain: slug }),
  });

  return response.json();
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
    avatar_300: rawCoach.avatar_300 || '',
    avatar_600: rawCoach.avatar_600 || '',
    address: rawCoach.address || null,
    instagram: rawCoach.instagram || '',
    facebook: rawCoach.facebook || '',
  };
}

export async function initializeQuizEnvironment() {
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
  storage.setItem('acBeraterSlug', coach.slug || slug);
  document.title = applyBrandName(document.title, coach);
  getTrackingSessionHash(coach.slug || slug, coach.member_id || '');
  getActiveLeadRun(coach.slug || slug, coach.member_id || '');

  trackQuizAnalytics('page_view', {
    visited_at: isoNow(),
    country: getCurrentCountry(),
    device_type: getCurrentDeviceType(),
    lang: getPreferredLang(),
  });

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
  const coach = getCoachFromStorage() || {};
  const slug = String(
    coach.slug || storage.getItem('acBeraterSlug') || getCurrentSlug() || 'default'
  );
  const hash = getTrackingSessionHash(slug, coach.member_id || '');

  if (!hash) {
    return;
  }

  const isResume = storage.getItem('acSessionIsResume') === 'true';

  const body = {
    hash,
    session_hash: hash,
    lead_hash: getActiveLeadRun(slug, coach.member_id || '').lead_hash,
    visitor_id: getTrackingVisitorId(),
    is_internal_traffic: isInternalTraffic(),
    is_resume: isResume,
    schema_version: TRACKING_SCHEMA_VERSION,
    event_name: eventName,
    event_at: isoNow(),
    source_app: 'business_leads_quiz',
    funnel: 'business',
    herbalife_id: coach.member_id || '',
    member_id: coach.member_id || '',
    berater_slug: slug,
    lang: getPreferredLang(),
    ...payload,
  };

  fetch('/api/bridge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    keepalive: true,
    body: JSON.stringify({ action: 'write_analytics', payload: body }),
  }).catch(() => {});
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
  setVideoCompleted(slug, videoStep) {
    const key = this.KEY_PREFIX + slug;
    try {
      const data = JSON.parse(storage.getItem(key) || '{}');
      data[videoStep] = true;
      storage.setItem(key, JSON.stringify(data));
    } catch (error) {
      console.warn('Failed to set video completed:', error);
    }
  },
  isVideoCompleted(slug, videoStep) {
    const key = this.KEY_PREFIX + slug;
    try {
      return JSON.parse(storage.getItem(key) || '{}')[videoStep] === true;
    } catch {
      return false;
    }
  },
  clear(slug) {
    storage.setItem(this.KEY_PREFIX + slug, '{}');
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

export async function submitMauticLead({ vorname, email, typ, barriere, berater, aspiration }) {
  if (!MAUTIC_BASE_URL || MAUTIC_BASE_URL.includes('deinedomain.com')) {
    return;
  }

  try {
    await fetch(`${MAUTIC_BASE_URL}/api/contacts/new`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstname: vorname,
        email,
        custom_fields: {
          persoenlichkeitstyp: typ,
          quiz_barriere: barriere || '',
          quiz_aspiration: aspiration || 'freedom',
          berater: berater || '',
        },
      }),
    });
  } catch (error) {
    console.warn('Failed to send analytics:', error);
  }
}

function normalizeAspiration(value) {
  return ['freedom', 'impact', 'security', 'growth'].includes(value) ? value : 'freedom';
}

export function getAspirationLabel(aspiration) {
  return t(`asp_tag_${normalizeAspiration(aspiration)}`);
}

export async function forwardQuizSubmission(
  firstName,
  email,
  selectedAnswers,
  profile,
  aspiration = 'freedom'
) {
  const coach = getCoachFromStorage() || {};
  const slug = String(
    coach.slug || storage.getItem('acBeraterSlug') || getCurrentSlug() || 'default'
  ).toLowerCase();
  const leadRun = markLeadRun(
    slug,
    getLeadRunForSubmission(slug, coach.member_id || ''),
    'submitting'
  );
  const hash = leadRun.lead_hash;
  const sessionHash = leadRun.session_hash || getTrackingSessionHash(slug, coach.member_id || '');
  const visitorId = leadRun.visitor_id || getTrackingVisitorId();

  if (!hash) {
    return null;
  }

  const lang = getPreferredLang();
  const country = getCurrentCountry();
  const submittedAt = isoNow();
  const mainAspiration = normalizeAspiration(aspiration);
  const mainAspirationLabel = getAspirationLabel(mainAspiration);

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
          landed_at: submittedAt,
          submitted_at: submittedAt,
          hidden: {
            c: country,
            hash,
            lead_hash: hash,
            session_hash: sessionHash,
            tracking_hash: sessionHash,
            visitor_id: visitorId,
            schema_version: TRACKING_SCHEMA_VERSION,
            main_aspiration: mainAspiration,
            main_aspiration_label: mainAspirationLabel,
            lang,
            member_id: String(coach.member_id || ''),
            ref_id: String(coach.member_id || ''),
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
        },
      }),
    },
    15000
  )
    .then((response) => {
      if (response.ok) {
        markLeadRun(slug, leadRun, 'submitted');
      } else {
        markLeadRun(slug, leadRun, 'active');
      }
      return response.json().catch(() => ({}));
    })
    .catch((error) => {
      markLeadRun(slug, leadRun, 'active');
      return { success: false, error: error && error.message ? error.message : 'network_error' };
    });
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
