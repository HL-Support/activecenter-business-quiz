const crypto = require('crypto');
const dbTransport = require('./db-transport.js');

// Entfernt ein literales '\n' am Ende und Whitespace. Anlass: der produktive JWT_SECRET
// endete auf Backslash+n (Env-Altlast) - dieselbe Falle darf keinen Supabase-Key treffen.
// Fuer saubere Werte ist das ein No-op.
function cleanEnvSecret(value) {
  return String(value || '')
    .replace(/\\n$/g, '')
    .trim();
}

// Kein Fallback auf eine feste Projekt-URL (Markus, 21.07.2026): Ein stiller Fallback wuerde
// nach einem Wechsel des Supabase-Projekts weiter in die ALTE Datenbank schreiben, ohne dass
// irgendwo ein Fehler auftaucht. Fehlt die Variable, greifen die vorhandenen Schutzabfragen.
const SUPABASE_URL = String(process.env.SUPABASE_URL || '').trim();
const SUPABASE_KEY = cleanEnvSecret(process.env.SUPABASE_SERVICE_KEY);
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 90;

function nowIso() {
  return new Date().toISOString();
}

function safeString(value, maxLength = 255) {
  if (value === null || value === undefined) return '';
  return String(value).trim().slice(0, maxLength);
}

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function safeInteger(value, fallback = 0) {
  return Math.max(0, Math.floor(safeNumber(value, fallback)));
}

function normalizeLanguage(value) {
  const lang = safeString(value, 10).toLowerCase().slice(0, 2);
  return ['de', 'it', 'en', 'fr', 'ru', 'hu'].includes(lang) ? lang : 'de';
}

function normalizeEmail(email) {
  return safeString(email, 180).toLowerCase();
}

function normalizeMetaAttributionFallback(attribution = {}) {
  const next = { ...(attribution || {}) };
  const fbclid = safeString(next.fbclid, 500);
  const utmMedium = safeString(next.utm_medium, 120);
  if (fbclid && !utmMedium) {
    next.utm_medium = 'paid_social';
    if (!safeString(next.utm_source, 120)) {
      next.utm_source = 'meta';
    }
  }
  return next;
}

function hashEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return '';
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

function hashMetaValue(value) {
  const normalized = safeString(value, 500).toLowerCase();
  if (!normalized) return '';
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

function isoToUnixSeconds(value) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return Math.floor(Date.now() / 1000);
  return Math.floor(time / 1000);
}

async function sendMetaCAPIEvent({
  eventName,
  email,
  firstName,
  leadHash,
  clientIp,
  userAgent,
  eventId,
  eventAt,
  fbc,
  fbp,
  eventSourceUrl,
  customData,
  timeoutMs = 2500,
}) {
  const META_PIXEL_ID = process.env.META_PIXEL_ID;
  const META_CAPI_TOKEN = process.env.META_CAPI_TOKEN;
  const normalizedEventName = safeString(eventName, 80);
  if (!META_PIXEL_ID || !META_CAPI_TOKEN || !normalizedEventName) return { skipped: true };

  const userData = {};
  const emailHash = hashEmail(email);
  if (emailHash) userData.em = [emailHash];

  const firstNameHash = hashMetaValue(firstName);
  if (firstNameHash) userData.fn = [firstNameHash];

  const externalIdHash = hashMetaValue(leadHash);
  if (externalIdHash) userData.external_id = [externalIdHash];

  const metaFbc = safeString(fbc, 500);
  const metaFbp = safeString(fbp, 120);
  if (metaFbc) userData.fbc = metaFbc;
  if (metaFbp) userData.fbp = metaFbp;

  const ip = safeString(clientIp, 120);
  const ua = safeString(userAgent, 500);
  if (ip) userData.client_ip_address = ip;
  if (ua) userData.client_user_agent = ua;

  if (!Object.keys(userData).length) return { skipped: true };
  const cleanCustomData = Object.fromEntries(
    Object.entries(customData || {}).filter(([, value]) => value !== undefined && value !== null && value !== '')
  );

  const payload = {
    data: [
      {
        event_name: normalizedEventName,
        event_time: isoToUnixSeconds(eventAt),
        event_id: safeString(eventId, 160) || `capi_${normalizedEventName}_${Date.now()}`,
        action_source: 'website',
        event_source_url: safeString(eventSourceUrl, 1000) || 'https://business.activecenter.info/markus',
        user_data: userData,
        custom_data: {
          content_name: 'Erfolgscode Quiz',
          content_category: 'Business Opportunity',
          ...cleanCustomData,
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

  try {
    const response = await fetch(
      `https://graph.facebook.com/v21.0/${META_PIXEL_ID}/events?access_token=${META_CAPI_TOKEN}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller ? controller.signal : undefined,
      }
    );
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      console.warn(`Meta CAPI ${normalizedEventName} responded ${response.status}: ${text.slice(0, 200)}`);
      return { ok: false, status: response.status };
    }
    return { ok: true, status: response.status };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || '')
  );
}

function isLeadHash(value) {
  return /^qz_[a-zA-Z0-9_]{8,96}$/.test(String(value || ''));
}

function generateLeadHash() {
  return `qz_${crypto.randomUUID().replace(/-/g, '')}`;
}

function deterministicBucket(value) {
  const digest = crypto.createHash('sha256').update(String(value || '')).digest();
  return digest[0] % 100;
}

function parseBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  const normalized = String(value ?? '').trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function parsePercent(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(100, Math.floor(number)));
}

function readCookie(req, name) {
  const cookieHeader = String(req?.headers?.cookie || '');
  const parts = cookieHeader.split(';').map((part) => part.trim());
  const prefix = `${name}=`;
  const found = parts.find((part) => part.startsWith(prefix));
  return found ? decodeURIComponent(found.slice(prefix.length)) : '';
}

function setLeadCookie(res, leadHash) {
  if (!leadHash) return;
  res.setHeader(
    'Set-Cookie',
    [
      `lead_hash=${encodeURIComponent(leadHash)}`,
      `Max-Age=${COOKIE_MAX_AGE_SECONDS}`,
      'Path=/',
      'HttpOnly',
      'Secure',
      'SameSite=Lax',
    ].join('; ')
  );
}

function requireSupabase() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    const error = new Error('Supabase is not configured');
    error.status = 500;
    throw error;
  }
}

async function supabaseRequest(path, options = {}) {
  // Phase 4 Stufe B: Im direkten Modus geht derselbe Aufruf ohne PostgREST an die
  // Plattform-Datenbank. Der Rueckgabewert verhaelt sich wie das fetch-Response, das
  // alle Aufrufer erwarten - der Vertrag bleibt Zeile fuer Zeile derselbe.
  // Standard ist unveraendert der HTTP-Weg (server/db-transport.js).
  if (dbTransport.istDirekt()) return dbTransport.direktRequest(path, options);

  requireSupabase();

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
    const error = new Error(`Supabase ${path} failed: ${response.status} ${text}`);
    error.status = response.status;
    error.details = text;
    throw error;
  }

  return response;
}

async function supabaseJson(path, options = {}) {
  const response = await supabaseRequest(path, options);
  // void-RPCs und return=minimal antworten ohne Body - der Schreibvorgang ist dann schon
  // verbucht, es gibt nur nichts zu parsen. Deckt 204 UND leere 200er ab (Vorfall 27.08.2026,
  // Regressionstests in scripts/tests/supabase-rpc-leere-antwort.test.js).
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function supabaseRpc(functionName, body = {}) {
  return supabaseJson(`rpc/${functionName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(body),
  });
}

async function readConfigValue(key, fallback) {
  try {
    const rows = await supabaseJson(
      `app_config?key=eq.${encodeURIComponent(key)}&select=value&limit=1`
    );
    if (Array.isArray(rows) && rows[0] && rows[0].value !== undefined) {
      return rows[0].value;
    }
  } catch (error) {
    if (!String(error.details || error.message || '').includes('app_config')) {
      console.warn(`app_config read failed for ${key}:`, error.message);
    }
  }
  return fallback;
}

// Flags sind manuelle Migrationsschalter und ändern sich selten — wurden aber bei JEDEM
// Event frisch gelesen: 4 app_config-Reads pro Aufruf, ~670.000 Reads seit April (Platz 3
// der DB-Statistik). 45 s Cache pro warmer Instanz: Ein Flag-Flip greift binnen einer
// Minute überall; der Health-Monitor liest bewusst weiter LIVE (eigener Pfad, kein Cache).
const LEAD_FLAGS_TTL_MS = 45_000;
let leadFlagsCache = { at: 0, flags: null };

async function getLeadFlags() {
  if (leadFlagsCache.flags && Date.now() - leadFlagsCache.at < LEAD_FLAGS_TTL_MS) {
    return leadFlagsCache.flags;
  }
  const [
    newWriterEnabled,
    newWriterPercent,
    legacyWriterEnabled,
    outboxWorkerEnabled,
  ] = await Promise.all([
    readConfigValue(
      'new_lead_writer_enabled',
      process.env.NEW_LEAD_WRITER_ENABLED ?? false
    ),
    readConfigValue('new_lead_writer_percent', process.env.NEW_LEAD_WRITER_PERCENT ?? 0),
    readConfigValue('legacy_writer_enabled', process.env.LEGACY_WRITER_ENABLED ?? true),
    readConfigValue('outbox_worker_enabled', process.env.OUTBOX_WORKER_ENABLED ?? false),
  ]);

  const flags = {
    new_lead_writer_enabled: parseBoolean(newWriterEnabled, false),
    new_lead_writer_percent: parsePercent(newWriterPercent, 0),
    legacy_writer_enabled: parseBoolean(legacyWriterEnabled, true),
    outbox_worker_enabled: parseBoolean(outboxWorkerEnabled, false),
  };
  leadFlagsCache = { at: Date.now(), flags };
  return flags;
}

function shouldUseNewWriter(flags, identifier) {
  if (!flags?.new_lead_writer_enabled) return false;
  const percent = parsePercent(flags.new_lead_writer_percent, 0);
  if (percent >= 100) return true;
  if (percent <= 0) return false;
  return deterministicBucket(identifier) < percent;
}

function sendJson(res, status, data) {
  res.status(status).json(data);
}

// P0-4: Kanonische CORS-Allowlist fuer ALLE Routen dieses Projekts. Sie stand seit P0-3 nur
// in api/bridge.js; jede zweite Kopie wuerde frueher oder spaeter auseinanderlaufen. bridge.js
// importiert diese Funktion von hier (der Import bestand fuer sendMetaCAPIEvent bereits,
// server/lead-system.js selbst requiret nur 'crypto' - es gibt keinen Zyklus).
const CORS_ALLOWED_ORIGINS = new Set([
  'https://business.activecenter.info',
  'https://quiz.activecenter.info',
  'https://business.eaglesfit.ch',
  'https://businessleadsquiz.vercel.app',
  // Legacy-Landeseite /<slug>/business-info auf global-sce.com: Sie loest Resume-Links per
  // Browser-fetch gegen resolve_resume_key/resolve_resume_token auf und stand vor der
  // Allowlist (24.08.2026) unter dem alten Wildcard. Ohne diese beiden Eintraege sind
  // Resume-Links aus aelteren Mails, die dorthin zeigen, unerreichbar - der Aufruf schlaegt
  // still im Browser fehl, ohne Serverfehler. Beide Schreibweisen sind live erreichbar.
  'https://global-sce.com',
  'https://www.global-sce.com',
]);
// Eine reine Suffixpruefung auf '.vercel.app' wuerde JEDE fremde Vercel-App zulassen; erlaubt
// ist deshalb nur das projekteigene Team-Suffix der Preview-Deployments.
const PREVIEW_ORIGIN_SUFFIX = '-markus-oberhofers-projects.vercel.app';

function allowedCorsOrigin(origin) {
  const value = String(origin || '').trim();
  if (!value) return '';
  if (CORS_ALLOWED_ORIGINS.has(value)) return value;
  // Nur https-Origins ohne Port, Pfad oder Userinfo - sonst genuegte
  // 'https://evil.example/-markus-oberhofers-projects.vercel.app' fuer die Suffixpruefung.
  if (!/^https:\/\/[a-z0-9.-]+$/i.test(value)) return '';
  return value.endsWith(PREVIEW_ORIGIN_SUFFIX) ? value : '';
}

function handleOptions(req, res) {
  // Identisch zu api/bridge.js: Kein Wildcard mehr. Ist der Origin nicht erlaubt, wird der
  // ACAO-Header GAR NICHT gesetzt - der Browser blockt dann selbst. Der Funnel selbst ruft
  // ausschliesslich relativ (same-origin) auf und braucht den Header nie; Server-zu-Server
  // (n8n, Worker-Selbstaufrufe, curl) sendet keinen Origin und bleibt unberuehrt.
  // 'Vary: Origin' muss immer mitgehen, sonst liefert ein Cache die Antwort eines Origins
  // an einen anderen aus.
  const allowedOrigin = allowedCorsOrigin(req?.headers?.origin);
  res.setHeader('Vary', 'Origin');
  if (allowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}

function eventUid(event) {
  return (
    safeString(event.event_id || event.event_uid, 96) ||
    `evt_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`
  );
}

module.exports = {
  allowedCorsOrigin,
  cleanEnvSecret,
  deterministicBucket,
  eventUid,
  generateLeadHash,
  getLeadFlags,
  handleOptions,
  hashEmail,
  isLeadHash,
  isUuid,
  normalizeEmail,
  normalizeLanguage,
  normalizeMetaAttributionFallback,
  nowIso,
  readCookie,
  safeInteger,
  safeNumber,
  safeString,
  sendMetaCAPIEvent,
  sendJson,
  setLeadCookie,
  shouldUseNewWriter,
  supabaseJson,
  supabaseRequest,
  supabaseRpc,
};
