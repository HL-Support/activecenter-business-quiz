/**
 * Vertragstests der portablen Runtime (Audit 2026-08-23, §6 "HTTP-Server", §7 P0-5).
 *
 * Geprueft wird die Pipeline aus server/http-adapter.js gegen die ECHTEN api/-Handler; nur
 * die Aussenwelt (fetch zu Supabase/ZeroBounce) ist gemockt. Damit beweisen die Tests, dass
 * die bestehenden Handler ihre Vertraege unter der neuen Laufzeit unveraendert erfuellen -
 * und nicht bloss, dass ein selbstgebautes Doppel sich wie erwartet verhaelt.
 *
 * dist/ wird NICHT vorausgesetzt: die statischen Faelle laufen gegen ein Fixture-Verzeichnis
 * mit erkennbarem Inhalt, damit `pnpm test` ohne vorherigen Build gruen ist.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Buffer } = require('node:buffer');

// Muss VOR dem Laden der Handler stehen: server/lead-system.js liest SUPABASE_URL/-KEY beim
// Modulladen. Gleiches Muster wie in scripts/tests/lead-api-hardening.test.js.
process.env.SUPABASE_URL = 'https://http-adapter-test.supabase.co';
process.env.SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_KEY || 'http-adapter-test-service-key';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'http-adapter-test-secret-http-adapter-test';
process.env.BRIDGE_KEY = process.env.BRIDGE_KEY || 'http-adapter-test-bridge-key';

const {
  SECURITY_HEADERS,
  createApp,
  createShutdownController,
  parseBody,
  queryFromSearchParams,
  readinessReport,
  resolveCommit,
  resolveImageRef,
  resolveStaticPath,
  validateEnv,
} = require('../../server/http-adapter.js');

const projectRoot = path.resolve(__dirname, '..', '..');
const API_DIR = path.join(projectRoot, 'api');

const INDEX_MARKER = '<!-- fixture:index -->';
const BERATER_MARKER = '<!-- fixture:berater-info -->';

/** Minimales dist/-Fixture mit unterscheidbarem Inhalt pro Datei. */
function createDistFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'http-adapter-dist-'));
  fs.writeFileSync(path.join(dir, 'index.html'), `<html>${INDEX_MARKER}</html>\n`, 'utf8');
  fs.writeFileSync(
    path.join(dir, 'berater-info.html'),
    `<html>${BERATER_MARKER}</html>\n`,
    'utf8'
  );
  fs.mkdirSync(path.join(dir, 'assets'));
  fs.writeFileSync(path.join(dir, 'assets', 'app.js'), 'export const fixture = 1;\n', 'utf8');
  return dir;
}

/**
 * Startet den Adapter auf einem freien Port. Der Aufrufer bekommt eine request()-Hilfe,
 * die Status, Header und Body zurueckgibt.
 */
async function startServer(options = {}) {
  const distDir = options.distDir || createDistFixture();
  const app = createApp({
    distDir,
    apiDir: API_DIR,
    ...options,
  });
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  return {
    baseUrl,
    distDir,
    async request(pathname, init = {}) {
      const response = await fetch(`${baseUrl}${pathname}`, { redirect: 'manual', ...init });
      const text = await response.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
      return { status: response.status, headers: response.headers, text, json };
    },
    async close() {
      // server.close() wartet sonst, bis der Keep-Alive-Socket des Testclients von selbst
      // zumacht (Sekunden pro Test). Im Test sind zu diesem Zeitpunkt alle Antworten
      // gelesen, deshalb ist das harte Schliessen hier korrekt - der Produktionspfad in
      // createShutdownController kappt dagegen erst nach dem Drain-Fenster.
      const closed = new Promise((resolve) => server.close(resolve));
      server.closeAllConnections();
      await closed;
      fs.rmSync(distDir, { recursive: true, force: true });
    },
  };
}

/**
 * Ersetzt globalThis.fetch fuer AUSGEHENDE Aufrufe (Supabase, ZeroBounce, Meta). Requests an
 * den lokalen Testserver laufen weiter ueber das echte fetch, sonst koennte der Test seinen
 * eigenen Server nicht mehr aufrufen. Der Default wirft: die Tests beweisen damit zugleich,
 * dass die geprueften Faelle gar keinen externen Netzverkehr ausloesen.
 */
function withFetchMock(implementation) {
  const original = globalThis.fetch;
  const outbound =
    implementation ||
    (async (url) => {
      throw new Error(`Unerwarteter externer Netzaufruf im Test: ${url}`);
    });

  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith('http://127.0.0.1:')) return original(url, init);
    return outbound(url, init);
  };

  return () => {
    globalThis.fetch = original;
  };
}

// --- API-Vertraege -------------------------------------------------------------------------

test('POST /api/lead-track haelt den 400-Vertrag fuer einen ungueltigen lead_hash', async (t) => {
  const restoreFetch = withFetchMock();
  const server = await startServer();
  t.after(async () => {
    await server.close();
    restoreFetch();
  });

  const response = await server.request('/api/lead-track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lead_hash: 'nicht-gueltig', event_name: 'quiz_started' }),
  });

  assert.equal(response.status, 400);
  assert.deepEqual(response.json, { success: false, error: 'invalid_lead_hash' });
  assert.match(response.headers.get('content-type'), /application\/json/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('POST /api/lead-track ohne event_name meldet missing_event_name', async (t) => {
  const restoreFetch = withFetchMock();
  const server = await startServer();
  t.after(async () => {
    await server.close();
    restoreFetch();
  });

  const response = await server.request('/api/lead-track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lead_hash: 'qz_adaptertestlead0000001' }),
  });

  assert.equal(response.status, 400);
  assert.deepEqual(response.json, { success: false, error: 'missing_event_name' });
});

test('vercel.json-Rewrite /api/lead/init erreicht den lead-init-Handler', async (t) => {
  const restoreFetch = withFetchMock();
  const server = await startServer();
  t.after(async () => {
    await server.close();
    restoreFetch();
  });

  const response = await server.request('/api/lead/init', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_seed: 'kein-uuid' }),
  });

  // 400 invalid_client_seed beweist: der Handler hat den Body gesehen und geprueft.
  assert.equal(response.status, 400);
  assert.deepEqual(response.json, { success: false, error: 'invalid_client_seed' });
});

test('unbekannte /api/*-Pfade liefern JSON-404 statt SPA-Fallback', async (t) => {
  const restoreFetch = withFetchMock();
  const server = await startServer();
  t.after(async () => {
    await server.close();
    restoreFetch();
  });

  for (const pathname of ['/api/gibt-es-nicht', '/api/lead-track-alt', '/api/']) {
    const response = await server.request(pathname);
    assert.equal(response.status, 404, `${pathname} muss 404 sein`);
    assert.match(response.headers.get('content-type'), /application\/json/, pathname);
    assert.equal(response.json.error, 'api_route_not_found', pathname);
    assert.ok(!response.text.includes(INDEX_MARKER), `${pathname} darf kein index.html liefern`);
  }
});

test('/api/-Pfade koennen nicht aus dem api-Verzeichnis ausbrechen', async (t) => {
  const restoreFetch = withFetchMock();
  const server = await startServer();
  t.after(async () => {
    await server.close();
    restoreFetch();
  });

  for (const pathname of ['/api/..%2Fserver%2Flead-system', '/api/lead/track', '/api/Bridge']) {
    const response = await server.request(pathname);
    assert.equal(response.status, 404, `${pathname} muss 404 sein`);
    assert.equal(response.json && response.json.error, 'api_route_not_found', pathname);
  }
});

test('JSON-Body groesser als das Limit wird mit 413 abgewiesen', async (t) => {
  const restoreFetch = withFetchMock();
  const server = await startServer({ maxBodyBytes: 1024 });
  t.after(async () => {
    await server.close();
    restoreFetch();
  });

  const response = await server
    .request('/api/lead-track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lead_hash: 'qz_x', payload: 'x'.repeat(4096) }),
    })
    .catch((error) => ({ status: 0, error }));

  assert.equal(response.status, 413);
  assert.equal(response.json.error, 'payload_too_large');
});

test('kaputtes JSON liefert einen 400-JSON-Fehler, keinen Absturz', async (t) => {
  const restoreFetch = withFetchMock();
  const server = await startServer();
  t.after(async () => {
    await server.close();
    restoreFetch();
  });

  const response = await server.request('/api/lead-track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{ das ist kein json',
  });

  assert.equal(response.status, 400);
  assert.equal(response.json.error, 'invalid_json');
});

test('api/validate-email.js (ESM default export) wird korrekt adaptiert', async (t) => {
  const restoreFetch = withFetchMock();
  const server = await startServer();
  t.after(async () => {
    await server.close();
    restoreFetch();
  });

  const response = await server.request('/api/validate-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });

  assert.equal(response.status, 400);
  assert.deepEqual(response.json, { error: 'Email is required' });
});

// --- Statische Auslieferung und Rewrites ----------------------------------------------------

test('Slug-Route faellt exakt nach vercel.json-Regex auf index.html zurueck', async (t) => {
  const restoreFetch = withFetchMock();
  const server = await startServer();
  t.after(async () => {
    await server.close();
    restoreFetch();
  });

  for (const pathname of ['/markus', '/coach_2', '/a-b-c', '/']) {
    const response = await server.request(pathname);
    assert.equal(response.status, 200, pathname);
    assert.ok(response.text.includes(INDEX_MARKER), `${pathname} muss index.html liefern`);
    assert.match(response.headers.get('content-type'), /text\/html/, pathname);
  }

  // Genau wie bei Vercel NICHT vom Slug-Rewrite erfasst: Grossbuchstaben, mehrere Segmente,
  // Slash am Ende.
  for (const pathname of ['/Markus', '/a/b', '/markus/', '/mark.us']) {
    const response = await server.request(pathname);
    assert.equal(response.status, 404, `${pathname} darf nicht auf index.html fallen`);
  }
});

test('/berater-info liefert berater-info.html, /index.html und Assets direkt', async (t) => {
  const restoreFetch = withFetchMock();
  const server = await startServer();
  t.after(async () => {
    await server.close();
    restoreFetch();
  });

  const beraterInfo = await server.request('/berater-info');
  assert.equal(beraterInfo.status, 200);
  assert.ok(beraterInfo.text.includes(BERATER_MARKER));

  const direct = await server.request('/berater-info.html');
  assert.equal(direct.status, 200);
  assert.ok(direct.text.includes(BERATER_MARKER));

  const asset = await server.request('/assets/app.js');
  assert.equal(asset.status, 200);
  assert.match(asset.headers.get('content-type'), /text\/javascript/);
});

test('Security-Header aus vercel.json liegen auf jeder Antwort', async (t) => {
  const restoreFetch = withFetchMock();
  const server = await startServer();
  t.after(async () => {
    await server.close();
    restoreFetch();
  });

  for (const pathname of ['/markus', '/berater-info', '/api/gibt-es-nicht', '/health/live']) {
    const response = await server.request(pathname);
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      assert.equal(response.headers.get(name.toLowerCase()), value, `${pathname} / ${name}`);
    }
  }
});

test('HSTS liegt nur auf verschluesselten Anfragen, nie auf unverschluesselten', async (t) => {
  const restoreFetch = withFetchMock();
  const server = await startServer();
  t.after(async () => {
    await server.close();
    restoreFetch();
  });

  // Sicherheitsparitaet zum Vercel-Betrieb (max-age=63072000). Ohne den Header duerfte ein
  // Browser nach dem Hostingwechsel wieder eine erste http-Verbindung aufbauen.
  const secure = await server.request('/markus', { headers: { 'x-forwarded-proto': 'https' } });
  assert.equal(
    secure.headers.get('strict-transport-security'),
    'max-age=63072000; includeSubDomains'
  );

  const secureApi = await server.request('/api/gibt-es-nicht', {
    headers: { 'x-forwarded-proto': 'https' },
  });
  assert.equal(
    secureApi.headers.get('strict-transport-security'),
    'max-age=63072000; includeSubDomains',
    'auch API-Antworten tragen HSTS'
  );

  // Ohne TLS davor (lokaler Start, interner Aufruf) darf der Header NICHT gesetzt werden -
  // sonst sperrt sich ein Entwickler den eigenen http-Zugang fuer zwei Jahre aus.
  const plain = await server.request('/markus');
  assert.equal(plain.headers.get('strict-transport-security'), null);

  const forwardedHttp = await server.request('/markus', {
    headers: { 'x-forwarded-proto': 'http' },
  });
  assert.equal(forwardedHttp.headers.get('strict-transport-security'), null);
});

test('Pfad-Traversal aus dist/ heraus wird blockiert', () => {
  const distDir = path.join(projectRoot, 'dist');
  const root = path.resolve(distDir);

  // Kein Eingabepfad darf jemals ausserhalb von dist/ landen - weder aufgeloest noch als null
  // durchgereicht. '..' wird an der Wurzel gekappt (das Ergebnis existiert dann schlicht
  // nicht und endet in einem 404), Nullbytes und Backslashes werden hart abgewiesen.
  const escapes = [
    '/../package.json',
    '/%2e%2e/%2e%2e/package.json',
    '/assets/../../package.json',
    '/..%5Cpackage.json',
    '/%00/package.json',
  ];
  for (const pathname of escapes) {
    const resolved = resolveStaticPath(distDir, pathname);
    if (resolved !== null) {
      assert.ok(
        resolved === root || resolved.startsWith(root + path.sep),
        `${pathname} zeigt aus dist/ heraus: ${resolved}`
      );
    }
  }

  assert.equal(resolveStaticPath(distDir, '/..%5Cpackage.json'), null, 'Backslash wird abgewiesen');
  assert.equal(resolveStaticPath(distDir, '/%00/package.json'), null, 'Nullbyte wird abgewiesen');
  assert.equal(resolveStaticPath(distDir, '/assets/app.js'), path.join(distDir, 'assets', 'app.js'));
});

// --- Health ---------------------------------------------------------------------------------

test('/health/live antwortet ohne externen Aufruf mit 200', async (t) => {
  const restoreFetch = withFetchMock();
  const server = await startServer();
  t.after(async () => {
    await server.close();
    restoreFetch();
  });

  const response = await server.request('/health/live');
  assert.equal(response.status, 200);
  assert.equal(response.json.status, 'live');
  assert.equal(typeof response.json.uptime_s, 'number');
});

// --- Herkunft des laufenden Abbilds (Audit 13.5.6) -------------------------------------------
//
// Grundlage jeder Cutover-Verifikation: Am laufenden Container muss ablesbar sein, WELCHER
// Commit laeuft. Vor diesen Tests lieferte /health/live `commit` und `image` dauerhaft leer,
// weil nichts die Variablen setzte - der Endpunkt sah dabei gesund aus.

const SHA = 'e3a0a05be3a0a05be3a0a05be3a0a05be3a0a05b';
const OTHER_SHA = '51e845de515228345f977917f278a69b07d6b9c1';

test('resolveCommit: gebackenes GIT_COMMIT_SHA schlaegt die Plattformwerte', () => {
  const result = resolveCommit({
    env: { GIT_COMMIT_SHA: SHA, SOURCE_COMMIT: OTHER_SHA, VERCEL_GIT_COMMIT_SHA: OTHER_SHA },
  });
  assert.deepEqual(result, { commit: SHA, commit_source: 'GIT_COMMIT_SHA' });
});

test('resolveCommit: unter Coolify traegt SOURCE_COMMIT den Wert', () => {
  // Coolify uebergibt keinen Commit als Build-Arg, setzt ihn aber zur Laufzeit - genau
  // dieser Pfad haelt die Staging- und spaeter die Produktions-App am Leben.
  assert.deepEqual(resolveCommit({ env: { SOURCE_COMMIT: OTHER_SHA } }), {
    commit: OTHER_SHA,
    commit_source: 'SOURCE_COMMIT',
  });
});

test('resolveCommit: im Vercel-Betrieb greift VERCEL_GIT_COMMIT_SHA', () => {
  // Waehrend des Rollback-Fensters laeuft die Produktion weiter auf Vercel; die Antwort
  // muss auch dort etwas aussagen.
  assert.deepEqual(resolveCommit({ env: { VERCEL_GIT_COMMIT_SHA: SHA } }), {
    commit: SHA,
    commit_source: 'VERCEL_GIT_COMMIT_SHA',
  });
});

test('resolveCommit: ohne Quelle bleibt das Feld leer statt zu raten', () => {
  assert.deepEqual(resolveCommit({ env: {} }), { commit: '', commit_source: '' });
});

test('resolveCommit: unplausible Werte werden uebersprungen, nicht gemeldet', () => {
  // Ein Platzhalter wie "unknown" oder ein leerer Build-Arg darf einen Rollback-Beweis
  // nicht faelschen - er wird verworfen, und die naechste Quelle kommt zum Zug.
  for (const junk of ['', '   ', 'unknown', 'HEAD', 'refs/heads/main', 'abc123']) {
    assert.deepEqual(
      resolveCommit({ env: { GIT_COMMIT_SHA: junk, SOURCE_COMMIT: OTHER_SHA } }),
      { commit: OTHER_SHA, commit_source: 'SOURCE_COMMIT' },
      `"${junk}" ist kein Commit-SHA`,
    );
  }
  assert.deepEqual(resolveCommit({ env: { GIT_COMMIT_SHA: 'unknown' } }), {
    commit: '',
    commit_source: '',
  });
});

test('resolveCommit: kurzer SHA wird akzeptiert und normalisiert', () => {
  assert.deepEqual(resolveCommit({ env: { GIT_COMMIT_SHA: '  E3A0A05  ' } }), {
    commit: 'e3a0a05',
    commit_source: 'GIT_COMMIT_SHA',
  });
});

test('resolveImageRef: IMAGE_DIGEST hat Vorrang vor dem rekonstruierten Tag', () => {
  assert.equal(
    resolveImageRef({
      env: { IMAGE_DIGEST: 'sha256:a9f5f7c9', COOLIFY_RESOURCE_UUID: 'uuid', SOURCE_COMMIT: SHA },
    }),
    'sha256:a9f5f7c9',
  );
});

test('resolveImageRef: unter Coolify entsteht der Tag <resource-uuid>:<sha>', () => {
  // So taggt Coolify nachweislich (`-t <uuid>:<sha>`); am 25.08.2026 gegen `docker ps`
  // der Staging-App gegengeprueft.
  assert.equal(
    resolveImageRef({ env: { COOLIFY_RESOURCE_UUID: 'liydqvexwattbkkhigpluc1q', SOURCE_COMMIT: OTHER_SHA } }),
    `liydqvexwattbkkhigpluc1q:${OTHER_SHA}`,
  );
});

test('resolveImageRef: halbe Angaben ergeben keinen Bezeichner', () => {
  assert.equal(resolveImageRef({ env: { COOLIFY_RESOURCE_UUID: 'uuid' } }), '');
  assert.equal(resolveImageRef({ env: { SOURCE_COMMIT: SHA } }), '');
  assert.equal(resolveImageRef({ env: {} }), '');
});

test('/health/live gibt den laufenden Commit samt Herkunft aus', async (t) => {
  const before = {
    GIT_COMMIT_SHA: process.env.GIT_COMMIT_SHA,
    SOURCE_COMMIT: process.env.SOURCE_COMMIT,
    COOLIFY_RESOURCE_UUID: process.env.COOLIFY_RESOURCE_UUID,
  };
  delete process.env.GIT_COMMIT_SHA;
  process.env.SOURCE_COMMIT = OTHER_SHA;
  process.env.COOLIFY_RESOURCE_UUID = 'liydqvexwattbkkhigpluc1q';

  const restoreFetch = withFetchMock();
  const server = await startServer();
  t.after(async () => {
    await server.close();
    restoreFetch();
    for (const [name, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  const response = await server.request('/health/live');
  assert.equal(response.status, 200);
  assert.equal(response.json.commit, OTHER_SHA, 'der laufende Commit steht in der Antwort');
  assert.equal(response.json.commit_source, 'SOURCE_COMMIT');
  assert.equal(response.json.image, `liydqvexwattbkkhigpluc1q:${OTHER_SHA}`);
});

test('/health/ready ist fail-closed, wenn Pflicht-Env fehlt', async () => {
  const report = await readinessReport({
    env: {},
    fetchImpl: async () => {
      throw new Error('Bei fehlender Env darf kein Netzaufruf passieren');
    },
  });

  assert.equal(report.ready, false);
  assert.equal(report.checks.env.ok, false);
  assert.equal(report.checks.datasource.skipped, true);
  assert.ok(report.checks.env.missing.includes('SUPABASE_URL'));
  assert.ok(report.checks.env.missing.includes('BRIDGE_KEY oder BRIDGE_SERVICE_KEY'));
});

test('/health/ready liefert 503, solange die Pflichtkonfiguration unvollstaendig ist', async (t) => {
  const restoreFetch = withFetchMock();
  const server = await startServer({ readiness: () => readinessReport({ env: {} }) });
  t.after(async () => {
    await server.close();
    restoreFetch();
  });

  const response = await server.request('/health/ready');
  assert.equal(response.status, 503);
  assert.equal(response.json.status, 'not_ready');
});

test('/health/ready wird bereit, sobald Env und Datenquelle antworten', async () => {
  const seen = [];
  const report = await readinessReport({
    env: {
      SUPABASE_URL: 'https://ready-test.supabase.co',
      SUPABASE_SERVICE_KEY: 'ready-test-key',
      JWT_SECRET: 'ready-test-secret',
      BRIDGE_SERVICE_KEY: 'ready-test-bridge',
    },
    fetchImpl: async (url, init) => {
      seen.push({ url: String(url), method: init.method });
      return { status: 200 };
    },
  });

  assert.equal(report.ready, true);
  assert.deepEqual(seen, [{ url: 'https://ready-test.supabase.co/rest/v1/', method: 'HEAD' }]);
});

test('/health/ready meldet nicht bereit, wenn die Datenquelle in den Timeout laeuft', async () => {
  const report = await readinessReport({
    env: {
      SUPABASE_URL: 'https://ready-test.supabase.co',
      SUPABASE_SERVICE_KEY: 'ready-test-key',
      JWT_SECRET: 'ready-test-secret',
      BRIDGE_KEY: 'ready-test-bridge',
    },
    timeoutMs: 25,
    fetchImpl: (url, init) =>
      new Promise((resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        });
      }),
  });

  assert.equal(report.ready, false);
  assert.equal(report.checks.datasource.error, 'timeout');
});

test('validateEnv akzeptiert BRIDGE_KEY oder BRIDGE_SERVICE_KEY', () => {
  const base = {
    SUPABASE_URL: 'https://x.supabase.co',
    SUPABASE_SERVICE_KEY: 'k',
    JWT_SECRET: 's',
  };
  assert.equal(validateEnv({ ...base, BRIDGE_KEY: 'a' }).ok, true);
  assert.equal(validateEnv({ ...base, BRIDGE_SERVICE_KEY: 'b' }).ok, true);
  assert.equal(validateEnv(base).ok, false);
  // Leerstring zaehlt nicht als gesetzt.
  assert.equal(validateEnv({ ...base, BRIDGE_KEY: '   ' }).ok, false);
});

// --- Shutdown --------------------------------------------------------------------------------

/** Server-Attrappe: nur die Methoden, die der Controller anfasst. */
function createFakeServer() {
  const calls = { close: 0, closeIdle: 0, closeAll: 0 };
  return {
    calls,
    close() {
      calls.close += 1;
    },
    closeIdleConnections() {
      calls.closeIdle += 1;
    },
    closeAllConnections() {
      calls.closeAll += 1;
    },
  };
}

/** Minimale Response-Attrappe mit den Events, die der Controller abonniert. */
function createFakeResponse() {
  const listeners = new Map();
  return {
    on(event, callback) {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event).push(callback);
      return this;
    },
    emit(event) {
      for (const callback of listeners.get(event) || []) callback();
    },
  };
}

test('SIGTERM laesst laufende Requests auslaufen und beendet mit Exit 0', async () => {
  const server = createFakeServer();
  const exits = [];
  const controller = createShutdownController({
    server,
    graceMs: 5000,
    exit: (code) => exits.push(code),
  });

  const response = createFakeResponse();
  controller.track(response);
  assert.equal(controller.inFlight(), 1);

  const shutdown = controller.shutdown('SIGTERM');

  // Der Server nimmt sofort nichts Neues mehr an, wartet aber auf den laufenden Request.
  assert.equal(server.calls.close, 1);
  assert.equal(server.calls.closeIdle, 1);
  assert.equal(controller.isShuttingDown(), true);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(exits, [], 'darf nicht beenden, solange ein Request laeuft');

  response.emit('finish');
  const outcome = await shutdown;

  assert.equal(outcome, 'drained');
  assert.equal(server.calls.closeAll, 0, 'sauberer Drain darf keine Verbindung kappen');
  assert.deepEqual(exits, [0]);
});

test('SIGTERM beendet nach Ablauf der Frist auch bei haengendem Request', async () => {
  const server = createFakeServer();
  const exits = [];
  const controller = createShutdownController({
    server,
    graceMs: 30,
    exit: (code) => exits.push(code),
  });

  controller.track(createFakeResponse());
  const outcome = await controller.shutdown('SIGTERM');

  assert.equal(outcome, 'timeout');
  assert.equal(server.calls.closeAll, 1, 'nach der Frist werden Verbindungen geschlossen');
  assert.deepEqual(exits, [0]);
});

test('waehrend des Drains werden neue Requests mit 503 abgelehnt', async (t) => {
  const restoreFetch = withFetchMock();
  const server = await startServer({ isShuttingDown: () => true });
  t.after(async () => {
    await server.close();
    restoreFetch();
  });

  const response = await server.request('/markus');
  assert.equal(response.status, 503);
  assert.equal(response.json.error, 'server_shutting_down');
});

// --- Request-Adapter-Details ------------------------------------------------------------------

test('req.query bildet Vercel nach (Einzelwert vs. Array)', () => {
  const query = queryFromSearchParams(new URLSearchParams('a=1&b=2&b=3'));
  assert.deepEqual(query, { a: '1', b: ['2', '3'] });
});

test('parseBody deckt JSON, Formular, Text und leeren Body ab', () => {
  assert.deepEqual(parseBody(Buffer.from('{"a":1}'), 'application/json; charset=utf-8'), { a: 1 });
  assert.deepEqual(parseBody(Buffer.from('a=1&a=2'), 'application/x-www-form-urlencoded'), {
    a: ['1', '2'],
  });
  assert.equal(parseBody(Buffer.from('hallo'), 'text/plain'), 'hallo');
  assert.deepEqual(parseBody(Buffer.alloc(0), 'application/json'), {});
  assert.deepEqual(parseBody(null, 'application/json'), {});
});

test('X-Forwarded-For wird durchgereicht und bei Direktzugriff ergaenzt', async (t) => {
  const restoreFetch = withFetchMock();
  const seen = [];
  const server = await startServer({
    registry: {
      listModuleNames: () => ['echo-ip'],
      resolve: async (name) =>
        name === 'echo-ip'
          ? async (req, res) => {
              seen.push({ forwarded: req.headers['x-forwarded-for'], clientIp: req.clientIp });
              res.status(200).json({ ok: true });
            }
          : null,
    },
  });
  t.after(async () => {
    await server.close();
    restoreFetch();
  });

  await server.request('/api/echo-ip', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '203.0.113.7, 10.0.0.1' },
    body: '{}',
  });
  await server.request('/api/echo-ip', { method: 'POST', body: '{}' });

  assert.equal(seen[0].forwarded, '203.0.113.7, 10.0.0.1');
  assert.equal(seen[0].clientIp, '203.0.113.7', 'erster Eintrag der Proxy-Kette ist der Client');
  assert.equal(seen[1].forwarded, '127.0.0.1', 'ohne Proxy wird die Peer-IP ergaenzt');
});
