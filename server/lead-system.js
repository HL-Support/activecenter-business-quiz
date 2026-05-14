const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://xlpiisbozpgmemxhtivj.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
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
  return ['de', 'it', 'en', 'fr', 'ru'].includes(lang) ? lang : 'de';
}

function normalizeEmail(email) {
  return safeString(email, 180).toLowerCase();
}

function hashEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return '';
  return crypto.createHash('sha256').update(normalized).digest('hex');
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
  return response.status === 204 ? null : response.json();
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

async function getLeadFlags() {
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

  return {
    new_lead_writer_enabled: parseBoolean(newWriterEnabled, false),
    new_lead_writer_percent: parsePercent(newWriterPercent, 0),
    legacy_writer_enabled: parseBoolean(legacyWriterEnabled, true),
    outbox_worker_enabled: parseBoolean(outboxWorkerEnabled, false),
  };
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

function handleOptions(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
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
  nowIso,
  readCookie,
  safeInteger,
  safeNumber,
  safeString,
  sendJson,
  setLeadCookie,
  shouldUseNewWriter,
  supabaseJson,
  supabaseRequest,
  supabaseRpc,
};
