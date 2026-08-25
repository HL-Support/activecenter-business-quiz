/**
 * Portabler HTTP-Adapter (Audit 2026-08-23, §6 "HTTP-Server", §7 P0-5).
 *
 * Zweck: Dieselben api/-Handler, die heute als Vercel Serverless Functions laufen, in einem
 * eigenen Node-Prozess bedienen - ohne die Handler selbst anzufassen. Der Adapter bildet
 * ausschliesslich die Plattformzusagen von Vercel nach, die die Handler bereits voraussetzen:
 *
 *   - req.body ist geparst, req.query existiert, Header sind lowercase;
 *   - res.status(...).json(...) / res.send(...) / res.setHeader / res.getHeader / res.end;
 *   - die Rewrites und Security-Header aus vercel.json;
 *   - Client-IP hinter einem Proxy (heute Vercel, kuenftig Traefik) via X-Forwarded-For.
 *
 * Bewusst NICHT hier: Fachlogik. Der Adapter kennt keine Leads, keine Events und kein
 * Supabase-Schema. Die einzige Ausnahme ist der Bereitschafts-Ping in /health/ready, weil
 * ein Container-Healthcheck ohne Datenzugriffspruefung nichts aussagt.
 *
 * Der Vercel-Betrieb bleibt von dieser Datei unberuehrt: vercel.json, build.js und die
 * api/-Handler sind unveraendert; dieser Adapter ist eine zusaetzliche, zweite Laufzeit.
 */
'use strict';

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { Buffer } = require('buffer');
const { pipeline } = require('stream/promises');

const projectRoot = path.resolve(__dirname, '..');

// 1 MB deckt jeden heutigen Payload um Groessenordnungen ab (der groesste reale Body ist ein
// Event-Batch der Client-Queue; keepalive-Fetches sind ohnehin auf 64 KB begrenzt, Audit
// 13.3.11). Alles darueber ist entweder ein Fehler oder ein Angriff und wird abgewiesen,
// bevor der Body im Speicher landet.
const MAX_BODY_BYTES = 1024 * 1024;
// api/bridge.js laeuft auf Vercel mit maxDuration 30 (vercel.json). Derselbe Deckel gilt hier
// fuer JEDE Route, damit ein haengender Upstream keinen Worker-Slot dauerhaft blockiert.
const REQUEST_TIMEOUT_MS = 30_000;
// SIGTERM: Server schliessen, laufende Requests auslaufen lassen, dann Exit 0.
const SHUTDOWN_GRACE_MS = 10_000;
// Kurz genug, dass ein enger Healthcheck-Takt nicht in den Timeout laeuft.
const READY_PROBE_TIMEOUT_MS = 2_000;

/**
 * Pflicht-Env (Audit P0-5: "zentral validiertes Env-Schema, Pflichtwerte fail-closed").
 * `alternatives` bildet die heutige Realitaet ab: der Bridge-Key heisst je nach Aufrufer
 * BRIDGE_KEY oder BRIDGE_SERVICE_KEY, einer von beiden muss gesetzt sein.
 */
const REQUIRED_ENV = [
  { key: 'SUPABASE_URL', alternatives: [] },
  { key: 'SUPABASE_SERVICE_KEY', alternatives: [] },
  { key: 'JWT_SECRET', alternatives: [] },
  { key: 'BRIDGE_KEY', alternatives: ['BRIDGE_SERVICE_KEY'] },
];

// Exakt die vier Header aus vercel.json ("source": "/(.*)"). Sie gelten dort fuer JEDE
// Antwort - statisch wie API - und muessen das hier auch tun, sonst faellt beim Hostingwechsel
// still ein Schutz weg.
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'X-Frame-Options': 'DENY',
};

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

// --- vercel.json "rewrites", in derselben Reihenfolge; die erste Regel gewinnt. -----------

/** { "source": "/api/lead/init", "destination": "/api/lead-init" } */
const API_REWRITES = new Map([['/api/lead/init', 'lead-init']]);

/** { "source": "/berater-info", "destination": "/berater-info.html" } */
const HTML_REWRITES = new Map([['/berater-info', 'berater-info.html']]);

/**
 * { "source": "/:slug([a-z0-9_-]+)", "destination": "/index.html" }
 *
 * Bewusst zeichengleich zur vercel.json-Regel: genau EIN Pfadsegment, nur Kleinbuchstaben,
 * Ziffern, Unterstrich und Bindestrich, kein Slash am Ende. '/Markus' und '/a/b' fallen
 * deshalb hier wie dort NICHT auf index.html zurueck.
 */
const SLUG_REWRITE = /^\/[a-z0-9_-]+$/;

/** Ein API-Dateiname; verhindert, dass ein Pfad wie /api/../server/lead-system etwas laedt. */
const API_MODULE_NAME = /^[a-z0-9][a-z0-9-]*$/;

// --- Env-Schema ---------------------------------------------------------------------------

/**
 * Prueft die Pflichtkonfiguration. Reine Funktion ohne Seiteneffekte, damit sowohl der
 * Prozessstart (fail-closed, Exit 1) als auch /health/ready dieselbe Quelle benutzen.
 */
function validateEnv(env = process.env) {
  const missing = [];
  for (const entry of REQUIRED_ENV) {
    const candidates = [entry.key, ...entry.alternatives];
    const satisfied = candidates.some((key) => String(env[key] || '').trim().length > 0);
    if (!satisfied) {
      missing.push(candidates.join(' oder '));
    }
  }
  return { ok: missing.length === 0, missing };
}

// --- Request-Adapter ----------------------------------------------------------------------

/**
 * Vercel liefert req.query als Objekt; mehrfach vorkommende Parameter werden zum Array.
 * Genau das bilden wir nach, damit `req.query.secret` und Konsorten sich identisch verhalten.
 */
function queryFromSearchParams(searchParams) {
  const query = {};
  for (const key of searchParams.keys()) {
    if (Object.prototype.hasOwnProperty.call(query, key)) continue;
    const values = searchParams.getAll(key);
    query[key] = values.length > 1 ? values : values[0];
  }
  return query;
}

function normalizeIp(value) {
  const ip = String(value || '').trim();
  // Node meldet IPv4-Verbindungen auf Dual-Stack-Sockets als '::ffff:1.2.3.4'.
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

/**
 * Client-IP hinter dem Proxy. Traefik haengt die echte Peer-IP an X-Forwarded-For an bzw.
 * setzt den Header; der erste Eintrag ist der urspruengliche Client. Identisch zu dem, was
 * api/lead-track.js heute schon selbst aus dem Header liest.
 *
 * Achtung (Audit 13.3.4): Der Header ist nur so vertrauenswuerdig wie der Proxy davor. Der
 * Container darf deshalb nie ohne Traefik/Cloudflare direkt aus dem Internet erreichbar sein.
 */
function clientIpFromRequest(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').trim();
  if (forwarded) return normalizeIp(forwarded.split(',')[0]);
  return normalizeIp(req.socket && req.socket.remoteAddress);
}

function decorateRequest(req, url) {
  req.query = queryFromSearchParams(url.searchParams);
  req.clientIp = clientIpFromRequest(req);
  // Ohne vorgelagerten Proxy (lokaler Container-Smoke, interner Aufruf) gibt es keinen
  // X-Forwarded-For. Vercel setzt ihn immer; damit die Handler dieselbe Quelle sehen,
  // wird er hier NUR ergaenzt, wenn er fehlt - eine vorhandene Proxy-Kette bleibt intakt.
  if (!req.headers['x-forwarded-for'] && req.clientIp) {
    req.headers['x-forwarded-for'] = req.clientIp;
  }
  return req;
}

class HttpError extends Error {
  constructor(statusCode, code, message) {
    super(message || code);
    this.statusCode = statusCode;
    this.code = code;
  }
}

/** Liest den Body mit hartem Limit. Ueberschreitung bricht die Verbindung sofort ab. */
function readRawBody(req, limit = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;

    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      req.removeListener('data', onData);
      req.removeListener('end', onEnd);
      req.removeListener('error', onError);
      req.removeListener('aborted', onAborted);
      if (error) reject(error);
      else resolve(value);
    };

    function onData(chunk) {
      size += chunk.length;
      if (size > limit) {
        // Lesen stoppen, aber den Socket NICHT sofort kappen: sonst sieht der Client einen
        // Verbindungsabbruch statt der 413-Antwort und kann den Fehler nicht unterscheiden.
        // Der Socket wird erst geschlossen, wenn die Antwort draussen ist (siehe unten).
        req.pause();
        finish(new HttpError(413, 'payload_too_large', `Body exceeds ${limit} bytes`));
        return;
      }
      chunks.push(chunk);
    }
    function onEnd() {
      finish(null, Buffer.concat(chunks));
    }
    function onError(error) {
      finish(error);
    }
    function onAborted() {
      finish(new HttpError(400, 'client_aborted', 'Client aborted the request'));
    }

    req.on('data', onData);
    req.on('end', onEnd);
    req.on('error', onError);
    req.on('aborted', onAborted);
  });
}

/**
 * Body-Parsing wie auf Vercel: JSON und form-urlencoded werden geparst, text/* wird String,
 * alles andere bleibt Buffer. Ein leerer Body wird zu {} - api/validate-email.js
 * destrukturiert `req.body` ohne Fallback und wuerde bei `undefined` werfen.
 */
function parseBody(raw, contentTypeHeader) {
  if (!raw || raw.length === 0) return {};
  const contentType = String(contentTypeHeader || '')
    .split(';')[0]
    .trim()
    .toLowerCase();

  if (contentType === 'application/json' || contentType.endsWith('+json')) {
    try {
      return JSON.parse(raw.toString('utf8'));
    } catch (error) {
      throw new HttpError(400, 'invalid_json', error.message);
    }
  }

  if (contentType === 'application/x-www-form-urlencoded') {
    return queryFromSearchParams(new URLSearchParams(raw.toString('utf8')));
  }

  if (contentType.startsWith('text/')) {
    return raw.toString('utf8');
  }

  return raw;
}

// --- Response-Adapter ---------------------------------------------------------------------

// HSTS gehoert zur Sicherheitsparitaet mit dem heutigen Betrieb: Vercel liefert
// max-age=63072000 (2 Jahre). Ohne den Header duerfte ein Browser nach dem Wechsel wieder
// eine erste Verbindung ueber http zulassen - das ist die Luecke, die SSL-Stripping nutzt.
// Bewusst hier statt in der Proxy-Konfiguration: Der Header reist mit der Anwendung, egal
// auf welcher Plattform sie laeuft, und steht in derselben Quelle wie die uebrigen vier.
// Nur auf tatsaechlich verschluesselten Anfragen setzen (Traefik terminiert TLS und meldet
// das ueber X-Forwarded-Proto) - sonst wuerde ein lokaler http-Start den Browser aussperren.
const HSTS_HEADER = 'max-age=63072000; includeSubDomains';

function applySecurityHeaders(res, { secure = false } = {}) {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    res.setHeader(name, value);
  }
  if (secure) {
    res.setHeader('Strict-Transport-Security', HSTS_HEADER);
  }
}

function isSecureRequest(req) {
  const forwarded = String(req?.headers?.['x-forwarded-proto'] || '')
    .split(',')[0]
    .trim()
    .toLowerCase();
  if (forwarded) return forwarded === 'https';
  return Boolean(req?.socket?.encrypted);
}

/**
 * Ergaenzt die echte http.ServerResponse um genau die Methoden, die die Handler benutzen.
 * setHeader/getHeader/end/write bringt Node bereits mit - sie werden absichtlich NICHT
 * ueberschrieben, damit sich Streaming und Header-Semantik nicht vom Original unterscheiden.
 */
function decorateResponse(res, { isApi = false } = {}) {
  res.status = function status(code) {
    this.statusCode = code;
    return this;
  };

  res.json = function json(payload) {
    if (!this.headersSent) {
      if (!this.getHeader('Content-Type')) {
        this.setHeader('Content-Type', 'application/json; charset=utf-8');
      }
      // API-Antworten duerfen nie in einem Cache landen (Audit P1). Ein Handler, der
      // bewusst etwas anderes setzt, behaelt seinen Wert.
      if (isApi && !this.getHeader('Cache-Control')) {
        this.setHeader('Cache-Control', 'no-store');
      }
    }
    this.end(JSON.stringify(payload === undefined ? null : payload));
    return this;
  };

  res.send = function send(payload) {
    if (payload === null || payload === undefined) {
      this.end();
      return this;
    }
    if (Buffer.isBuffer(payload)) {
      if (!this.headersSent && !this.getHeader('Content-Type')) {
        this.setHeader('Content-Type', 'application/octet-stream');
      }
      this.end(payload);
      return this;
    }
    if (typeof payload === 'object') {
      return this.json(payload);
    }
    if (!this.headersSent && !this.getHeader('Content-Type')) {
      this.setHeader('Content-Type', 'text/html; charset=utf-8');
    }
    this.end(String(payload));
    return this;
  };

  return res;
}

function sendJsonResponse(res, statusCode, payload) {
  if (res.writableEnded) return;
  if (!res.headersSent) {
    res.statusCode = statusCode;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
  }
  res.end(JSON.stringify(payload));
}

function sendTextResponse(res, statusCode, text) {
  if (res.writableEnded) return;
  if (!res.headersSent) {
    res.statusCode = statusCode;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
  }
  res.end(text);
}

// --- API-Registry -------------------------------------------------------------------------

/**
 * Laedt die api/-Handler nach Bedarf und merkt sie sich.
 *
 * Modulformate: die meisten Handler sind CommonJS (`module.exports = handler`),
 * api/validate-email.js ist ESM (`export default handler`). Node 24 kann ESM aus require()
 * laden, solange kein Top-Level-await im Modul steht; scheitert das trotzdem, faellt der
 * Loader auf dynamisches import() zurueck. So bleibt der Handler unveraendert.
 */
function createApiRegistry(apiDir) {
  const cache = new Map();

  async function loadModule(filePath) {
    let loaded;
    try {
      loaded = require(filePath);
    } catch (error) {
      const recoverable =
        error && (error.code === 'ERR_REQUIRE_ESM' || error.code === 'ERR_REQUIRE_ASYNC_MODULE');
      if (!recoverable) throw error;
      loaded = await import(`file://${filePath.split(path.sep).join('/')}`);
    }
    const handler = loaded && loaded.default ? loaded.default : loaded;
    if (typeof handler !== 'function') {
      throw new Error(`API-Modul ${filePath} exportiert keine Handler-Funktion`);
    }
    return handler;
  }

  return {
    /** Modulnamen aller vorhandenen api/*.js-Dateien (fuer den Preload beim Start). */
    listModuleNames() {
      if (!fs.existsSync(apiDir)) return [];
      return fs
        .readdirSync(apiDir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
        .map((entry) => entry.name.slice(0, -3))
        .filter((name) => API_MODULE_NAME.test(name));
    },

    /** Handler zu einem Modulnamen oder null, wenn es die Route nicht gibt. */
    async resolve(moduleName) {
      if (!API_MODULE_NAME.test(moduleName)) return null;
      if (cache.has(moduleName)) return cache.get(moduleName);

      const filePath = path.join(apiDir, `${moduleName}.js`);
      if (!fs.existsSync(filePath)) {
        cache.set(moduleName, null);
        return null;
      }
      const handler = await loadModule(filePath);
      cache.set(moduleName, handler);
      return handler;
    },
  };
}

// --- Health -------------------------------------------------------------------------------

/**
 * /health/ready: Pflichtkonfiguration vorhanden UND die Datenquelle antwortet innerhalb von
 * 2 Sekunden. Fail-closed - fehlt Env oder antwortet Supabase nicht, ist der Container NICHT
 * bereit. Ein 4xx der Datenquelle gilt als "erreichbar" (der Dienst antwortet), erst 5xx,
 * Netzfehler oder Timeout schalten auf nicht bereit.
 *
 * Der detaillierte /api/lead-system-health bleibt ein geschuetzter Diagnoseendpunkt und wird
 * ausdruecklich NICHT als Container-Healthcheck verwendet (Audit §6 "Healthchecks").
 */
async function readinessReport({
  env = process.env,
  fetchImpl = globalThis.fetch,
  timeoutMs = READY_PROBE_TIMEOUT_MS,
} = {}) {
  const envCheck = validateEnv(env);
  if (!envCheck.ok) {
    return {
      ready: false,
      checks: { env: { ok: false, missing: envCheck.missing }, datasource: { ok: false, skipped: true } },
    };
  }

  const base = String(env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = String(env.SUPABASE_SERVICE_KEY || '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();

  try {
    const response = await fetchImpl(`${base}/rest/v1/`, {
      method: 'HEAD',
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: controller.signal,
    });
    const ok = response.status < 500;
    return {
      ready: ok,
      checks: {
        env: { ok: true },
        datasource: { ok, status: response.status, duration_ms: Date.now() - startedAt },
      },
    };
  } catch (error) {
    return {
      ready: false,
      checks: {
        env: { ok: true },
        datasource: {
          ok: false,
          error: error.name === 'AbortError' ? 'timeout' : String(error.message || error),
          duration_ms: Date.now() - startedAt,
        },
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

function livenessReport({ env = process.env } = {}) {
  return {
    status: 'live',
    pid: process.pid,
    uptime_s: Math.round(process.uptime()),
    // Audit 13.5.6: Commit-SHA und Image-Digest muessen an der Laufzeit ablesbar sein.
    // Beides kommt aus dem Build; fehlt es, bleibt das Feld leer statt zu raten.
    commit: String(env.GIT_COMMIT_SHA || ''),
    image: String(env.IMAGE_DIGEST || ''),
  };
}

// --- Graceful Shutdown --------------------------------------------------------------------

/**
 * SIGTERM-Verhalten (Audit §6): keine neuen Verbindungen annehmen, laufende Requests bis
 * `graceMs` auslaufen lassen, dann Exit 0. `server` und `exit` sind injizierbar, damit der
 * Ablauf ohne echten Prozesssignal-Test pruefbar ist.
 */
function createShutdownController({
  server,
  graceMs = SHUTDOWN_GRACE_MS,
  log = () => {},
  exit = (code) => process.exit(code),
} = {}) {
  let inFlight = 0;
  let shuttingDown = false;
  let drainResolve = null;

  function settleIfDrained() {
    if (shuttingDown && inFlight === 0 && drainResolve) {
      const resolve = drainResolve;
      drainResolve = null;
      resolve('drained');
    }
  }

  return {
    isShuttingDown() {
      return shuttingDown;
    },
    inFlight() {
      return inFlight;
    },
    /** Zaehlt einen Request, solange seine Antwort laeuft. */
    track(res) {
      inFlight += 1;
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        inFlight -= 1;
        settleIfDrained();
      };
      res.on('close', finish);
      res.on('finish', finish);
      return finish;
    },
    async shutdown(signal = 'SIGTERM') {
      if (shuttingDown) return 'already';
      shuttingDown = true;
      log({ level: 'info', msg: 'shutdown_start', signal, in_flight: inFlight });

      if (server && typeof server.close === 'function') {
        server.close();
      }
      // Keep-Alive-Verbindungen ohne laufenden Request sofort schliessen, sonst haelt ein
      // ruhender Browser-Socket den Server bis zum Ablauf des Grace-Fensters offen.
      if (server && typeof server.closeIdleConnections === 'function') {
        server.closeIdleConnections();
      }

      const outcome = await new Promise((resolve) => {
        if (inFlight === 0) {
          resolve('drained');
          return;
        }
        drainResolve = resolve;
        const timer = setTimeout(() => {
          drainResolve = null;
          resolve('timeout');
        }, graceMs);
        if (typeof timer.unref === 'function') timer.unref();
      });

      if (outcome === 'timeout' && server && typeof server.closeAllConnections === 'function') {
        server.closeAllConnections();
      }

      log({ level: 'info', msg: 'shutdown_complete', signal, outcome, in_flight: inFlight });
      exit(0);
      return outcome;
    },
  };
}

// --- Statische Auslieferung ---------------------------------------------------------------

function mimeFor(filePath) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

/** Loest einen URL-Pfad auf eine Datei unterhalb von distDir auf; null bei Ausbruchsversuch. */
function resolveStaticPath(distDir, pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes('\0') || decoded.includes('\\')) return null;

  const normalized = path.posix.normalize(decoded);
  if (!normalized.startsWith('/')) return null;

  const root = path.resolve(distDir);
  const full = path.resolve(root, `.${normalized}`);
  if (full !== root && !full.startsWith(root + path.sep)) return null;
  return full;
}

async function serveStaticFile(req, res, filePath) {
  let stat;
  try {
    stat = await fsp.stat(filePath);
  } catch {
    return false;
  }
  if (!stat.isFile()) return false;

  const etag = `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
  res.setHeader('Content-Type', mimeFor(filePath));
  res.setHeader('Last-Modified', stat.mtime.toUTCString());
  res.setHeader('ETag', etag);
  // Die Assets sind heute NICHT fingerprintet (/assets/app.js). Genau wie Vercel es fuer
  // statische Ausgaben tut, wird deshalb revalidiert statt lange gecacht. Der Umstieg auf
  // Inhalts-Hash + immutable ist P1 und gehoert in den Build, nicht in diesen Adapter.
  res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');

  if (req.headers['if-none-match'] === etag) {
    res.statusCode = 304;
    res.end();
    return true;
  }

  res.statusCode = 200;
  res.setHeader('Content-Length', String(stat.size));
  if (req.method === 'HEAD') {
    res.end();
    return true;
  }

  try {
    await pipeline(fs.createReadStream(filePath), res);
  } catch (error) {
    // Abgebrochene Downloads sind normal (Reload, Tab zu) und kein Serverfehler.
    if (!res.writableEnded) res.destroy(error);
  }
  return true;
}

// --- Request-Pipeline ---------------------------------------------------------------------

function routeLabelFor(pathname) {
  // Slugs sind Beraterkuerzel und damit potenziell personenbeziehbar; im Log steht deshalb
  // das Routenmuster, nicht der konkrete Wert. Query-Strings werden nie geloggt (Audit
  // 13.2.2: Secrets sind in Query-Strings gelandet).
  if (SLUG_REWRITE.test(pathname) && pathname !== '/berater-info') return '/:slug';
  return pathname;
}

/**
 * Baut den Request-Listener. Alle Abhaengigkeiten sind injizierbar, damit der Test dieselbe
 * Pipeline fahren kann wie der Container.
 */
function createApp(options = {}) {
  const distDir = options.distDir || path.join(projectRoot, 'dist');
  const apiDir = options.apiDir || path.join(projectRoot, 'api');
  const registry = options.registry || createApiRegistry(apiDir);
  const log = options.log || (() => {});
  const requestTimeoutMs = options.requestTimeoutMs || REQUEST_TIMEOUT_MS;
  const maxBodyBytes = options.maxBodyBytes || MAX_BODY_BYTES;
  const isShuttingDown = options.isShuttingDown || (() => false);
  const readiness = options.readiness || readinessReport;

  async function handleApi(req, res, url, moduleName) {
    const handler = await registry.resolve(moduleName);
    if (!handler) {
      // Unbekannte /api/*-Pfade bekommen NIE den SPA-Fallback: ein Client, der auf eine
      // umbenannte Route laeuft, soll einen JSON-404 sehen und nicht stillschweigend
      // HTML parsen (Audit §6).
      sendJsonResponse(res, 404, {
        success: false,
        error: 'api_route_not_found',
        path: url.pathname,
      });
      return;
    }

    decorateRequest(req, url);
    decorateResponse(res, { isApi: true });

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const raw = await readRawBody(req, maxBodyBytes);
      req.rawBody = raw;
      req.body = parseBody(raw, req.headers['content-type']);
    } else {
      req.body = {};
    }

    await handler(req, res);
  }

  async function handleStatic(req, res, url) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD');
      sendTextResponse(res, 405, 'Method Not Allowed');
      return;
    }

    const pathname = url.pathname;

    // Reihenfolge wie bei Vercel: erst das Dateisystem, dann die Rewrites.
    if (pathname !== '/') {
      const direct = resolveStaticPath(distDir, pathname);
      if (direct === null) {
        sendTextResponse(res, 400, 'Bad Request');
        return;
      }
      if (await serveStaticFile(req, res, direct)) return;
    }

    if (pathname === '/') {
      if (await serveStaticFile(req, res, path.join(distDir, 'index.html'))) return;
    }

    const rewritten = HTML_REWRITES.get(pathname);
    if (rewritten) {
      if (await serveStaticFile(req, res, path.join(distDir, rewritten))) return;
    }

    if (SLUG_REWRITE.test(pathname)) {
      if (await serveStaticFile(req, res, path.join(distDir, 'index.html'))) return;
    }

    sendTextResponse(res, 404, 'Not Found');
  }

  return async function requestListener(req, res) {
    const startedAt = process.hrtime.bigint();
    const requestId = String(req.headers['x-request-id'] || '') || crypto.randomUUID();
    let url;
    try {
      url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    } catch {
      applySecurityHeaders(res, { secure: isSecureRequest(req) });
      sendTextResponse(res, 400, 'Bad Request');
      return;
    }

    applySecurityHeaders(res, { secure: isSecureRequest(req) });
    res.setHeader('X-Request-Id', requestId);

    const timer = setTimeout(() => {
      if (res.headersSent || res.writableEnded) return;
      sendJsonResponse(res, 504, { success: false, error: 'request_timeout' });
      res.destroy();
    }, requestTimeoutMs);
    if (typeof timer.unref === 'function') timer.unref();

    res.on('close', () => {
      clearTimeout(timer);
      log({
        level: 'info',
        msg: 'request',
        request_id: requestId,
        method: req.method,
        route: routeLabelFor(url.pathname),
        status: res.statusCode,
        duration_ms: Math.round(Number(process.hrtime.bigint() - startedAt) / 1e4) / 100,
        client_ip: req.clientIp || clientIpFromRequest(req),
      });
    });

    try {
      if (isShuttingDown()) {
        // Waehrend des Drains keine neue Arbeit annehmen; Traefik nimmt den Container
        // dann aus der Rotation, statt weiter Requests zu schicken.
        res.setHeader('Connection', 'close');
        sendJsonResponse(res, 503, { success: false, error: 'server_shutting_down' });
        return;
      }

      if (url.pathname === '/health/live') {
        sendJsonResponse(res, 200, livenessReport());
        return;
      }

      if (url.pathname === '/health/ready') {
        const report = await readiness();
        sendJsonResponse(res, report.ready ? 200 : 503, {
          status: report.ready ? 'ready' : 'not_ready',
          checks: report.checks,
        });
        return;
      }

      if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
        const moduleName = API_REWRITES.get(url.pathname) || url.pathname.slice('/api/'.length);
        await handleApi(req, res, url, moduleName);
        return;
      }

      await handleStatic(req, res, url);
    } catch (error) {
      const statusCode = Number(error.statusCode) || Number(error.status) || 500;
      log({
        level: 'error',
        msg: 'request_failed',
        request_id: requestId,
        route: routeLabelFor(url.pathname),
        status: statusCode,
        error: String(error.message || error),
      });
      // Ein abgebrochener Body-Upload wird nicht zu Ende gelesen; die Verbindung muss
      // deshalb nach der Antwort geschlossen werden, sonst wartet Node auf den Rest.
      if (error.code === 'payload_too_large' && !res.headersSent) {
        res.setHeader('Connection', 'close');
        res.once('finish', () => req.destroy());
      }
      // Fehlerdetails bleiben im Log. Nach aussen geht nur ein stabiler Code - der Adapter
      // weiss nicht, ob eine Fehlermeldung interne Namen oder Werte enthaelt.
      sendJsonResponse(res, statusCode >= 400 && statusCode < 600 ? statusCode : 500, {
        success: false,
        error: error.code || 'internal_server_error',
        request_id: requestId,
      });
    }
  };
}

module.exports = {
  API_REWRITES,
  HTML_REWRITES,
  MAX_BODY_BYTES,
  READY_PROBE_TIMEOUT_MS,
  REQUEST_TIMEOUT_MS,
  REQUIRED_ENV,
  SECURITY_HEADERS,
  HSTS_HEADER,
  isSecureRequest,
  SHUTDOWN_GRACE_MS,
  SLUG_REWRITE,
  clientIpFromRequest,
  createApiRegistry,
  createApp,
  createShutdownController,
  decorateRequest,
  decorateResponse,
  livenessReport,
  mimeFor,
  parseBody,
  queryFromSearchParams,
  readRawBody,
  readinessReport,
  resolveStaticPath,
  validateEnv,
};
