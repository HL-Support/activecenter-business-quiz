/**
 * Vertragstests der serverseitigen Fehlermeldung (Audit 2026-08-23, P1).
 *
 * Geprueft werden die vier Eigenschaften, ohne die der Melder mehr schadet als nuetzt:
 * er darf nicht werfen, nicht warten, nicht fluten und nichts Personenbezogenes hinaustragen.
 * Alles laeuft deterministisch und OHNE Netz: der Melder bekommt sein `fetch` injiziert, die
 * Adapter-Tests ersetzen `globalThis.fetch` und fangen den POST ab.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

// Muss VOR dem Laden von server/fehlermeldung.js stehen: der Prozess-Melder liest die DSN
// beim Modulladen (genau wie im Container). Ohne das waere er in den Adapter-Tests unten
// inaktiv und die Verdrahtung unbeweisbar.
process.env.GLITCHTIP_DSN = 'https://testschluessel@errors.test/42';

const {
  HOECHSTENS_PRO_MINUTE,
  entschaerfen,
  erzeugeMelder,
  standard,
} = require('../../server/fehlermeldung.js');
const { createApp } = require('../../server/http-adapter.js');

const DSN = 'https://testschluessel@errors.test/42';
const ENDPUNKT = 'https://errors.test/api/42/envelope/';
const SHA = 'e3a0a05be3a0a05be3a0a05be3a0a05be3a0a05b';

/** Sammelt die POSTs, die der Melder absetzt, statt sie zu senden. */
function fetchFaenger() {
  const aufrufe = [];
  return {
    aufrufe,
    impl: async (url, init) => {
      aufrufe.push({ url: String(url), init });
      return { ok: true, status: 200 };
    },
  };
}

/** Zerlegt einen Sentry-Umschlag in Kopf, Item-Kopf und Ereignis. */
function umschlagLesen(aufruf) {
  const roh = String(aufruf.init.body);
  const zeilen = roh.split('\n');
  assert.equal(zeilen.length, 3, 'ein Umschlag besteht aus Kopf, Item-Kopf und Ereignis');
  return {
    roh,
    kopf: JSON.parse(zeilen[0]),
    itemKopf: JSON.parse(zeilen[1]),
    ereignis: JSON.parse(zeilen[2]),
  };
}

// --- Eigenschaft 1: ohne DSN vollstaendig inaktiv ---------------------------------------------

test('ohne GLITCHTIP_DSN wird nichts gesendet und nichts geworfen', () => {
  const faenger = fetchFaenger();
  const melder = erzeugeMelder({ env: {}, fetchImpl: faenger.impl });

  assert.equal(melder.eingerichtet(), false);
  // Weder ein Error noch ein beliebiger Wert darf den Aufrufer kippen.
  assert.doesNotThrow(() => melder.melden(new Error('kaputt')));
  assert.doesNotThrow(() => melder.melden('nur ein Text'));
  assert.doesNotThrow(() => melder.melden(undefined));
  assert.equal(faenger.aufrufe.length, 0, 'ohne DSN darf es keinen einzigen fetch geben');
});

test('eine unbrauchbare DSN schaltet den Melder ab, statt zu werfen', () => {
  for (const kaputt of ['kein-url', 'https://errors.test/42', 'https://key@errors.test/']) {
    const faenger = fetchFaenger();
    const melder = erzeugeMelder({ env: { GLITCHTIP_DSN: kaputt }, fetchImpl: faenger.impl });
    assert.equal(melder.eingerichtet(), false, kaputt);
    melder.melden(new Error('kaputt'));
    assert.equal(faenger.aufrufe.length, 0, kaputt);
  }
});

// --- Umschlagform -------------------------------------------------------------------------------

test('mit DSN entsteht genau ein POST in korrekter Umschlagform', () => {
  const faenger = fetchFaenger();
  const melder = erzeugeMelder({
    env: { GLITCHTIP_DSN: DSN, GIT_COMMIT_SHA: SHA, NODE_ENV: 'production' },
    fetchImpl: faenger.impl,
  });

  assert.equal(melder.eingerichtet(), true);
  melder.melden(new Error('supabase nicht erreichbar'), {
    route: '/api/lead-init',
    request_id: 'req-1',
    status: 500,
  });

  assert.equal(faenger.aufrufe.length, 1, 'genau ein POST');
  const [aufruf] = faenger.aufrufe;
  assert.equal(aufruf.url, ENDPUNKT, 'Endpunkt wird aus der DSN gebaut');
  assert.equal(aufruf.init.method, 'POST');
  assert.equal(aufruf.init.headers['Content-Type'], 'application/x-sentry-envelope');
  assert.match(aufruf.init.headers['X-Sentry-Auth'], /^Sentry sentry_version=7, /);
  assert.match(aufruf.init.headers['X-Sentry-Auth'], /sentry_key=testschluessel/);
  assert.ok(aufruf.init.signal, 'der POST laeuft mit Abbruchsignal, nicht unbegrenzt');

  const { kopf, itemKopf, ereignis } = umschlagLesen(aufruf);
  assert.match(kopf.event_id, /^[0-9a-f]{32}$/, 'Kopf traegt die 32-stellige Ereignis-ID');
  assert.ok(kopf.sent_at, 'Kopf traegt einen Sendezeitpunkt');
  assert.deepEqual(itemKopf, { type: 'event' });

  assert.equal(ereignis.event_id, kopf.event_id, 'Kopf und Ereignis tragen dieselbe ID');
  assert.equal(ereignis.platform, 'node');
  assert.equal(ereignis.level, 'error');
  assert.equal(ereignis.release, SHA, 'Release kommt aus derselben Commit-Aufloesung wie /health/live');
  assert.equal(ereignis.environment, 'production');
  assert.equal(ereignis.server_name, 'business-leads-quiz');
  assert.equal(ereignis.exception.values[0].type, 'Error');
  assert.equal(ereignis.exception.values[0].value, 'supabase nicht erreichbar');
  assert.ok(
    ereignis.exception.values[0].stacktrace.frames.length > 0,
    'ohne Rahmen gruppiert GlitchTip nur ueber den Text'
  );
});

test('Release und Umgebung fallen ohne Angabe auf ehrliche Werte zurueck', () => {
  const faenger = fetchFaenger();
  const melder = erzeugeMelder({ env: { GLITCHTIP_DSN: DSN }, fetchImpl: faenger.impl });

  melder.melden(new Error('ohne Commit'));
  const { ereignis } = umschlagLesen(faenger.aufrufe[0]);

  assert.equal(ereignis.release, 'unbekannt', 'kein Commit im Env -> kein erfundener Release');
  assert.equal(ereignis.environment, 'entwicklung', 'alles ausser NODE_ENV=production');
});

test('die Commit-Reihenfolge von /health/live gilt auch fuer den Release', () => {
  const faenger = fetchFaenger();
  const melder = erzeugeMelder({
    env: { GLITCHTIP_DSN: DSN, SOURCE_COMMIT: SHA },
    fetchImpl: faenger.impl,
  });

  melder.melden(new Error('unter Coolify'));
  assert.equal(umschlagLesen(faenger.aufrufe[0]).ereignis.release, SHA);
});

// --- Eigenschaft 3: nicht fluten ----------------------------------------------------------------

test('derselbe Fehler wird hoechstens einmal pro Minute gemeldet', () => {
  const faenger = fetchFaenger();
  let uhr = 1_000_000;
  const melder = erzeugeMelder({
    env: { GLITCHTIP_DSN: DSN },
    fetchImpl: faenger.impl,
    jetzt: () => uhr,
  });

  for (let i = 0; i < 5; i += 1) {
    melder.melden(new Error('datenbank weg'), { route: '/api/lead-track', status: 500 });
    uhr += 1_000;
  }

  assert.equal(faenger.aufrufe.length, 1, '5x derselbe Fehler ergibt genau 1 POST');

  // Nach Ablauf der Minute darf derselbe Fehler wieder durch - sonst verschwindet ein
  // Dauerausfall nach 60 Sekunden still aus der Sicht.
  uhr += 61_000;
  melder.melden(new Error('datenbank weg'), { route: '/api/lead-track', status: 500 });
  assert.equal(faenger.aufrufe.length, 2, 'nach der Minute wird erneut gemeldet');
});

test('30 verschiedene Fehler ergeben hoechstens 20 POSTs pro Minute', () => {
  const faenger = fetchFaenger();
  let uhr = 2_000_000;
  const melder = erzeugeMelder({
    env: { GLITCHTIP_DSN: DSN },
    fetchImpl: faenger.impl,
    jetzt: () => uhr,
  });

  for (let i = 0; i < 30; i += 1) {
    melder.melden(new Error(`fehler nummer ${i}`), { route: '/api/bridge', status: 500 });
    uhr += 100;
  }

  assert.equal(faenger.aufrufe.length, HOECHSTENS_PRO_MINUTE);
  assert.ok(faenger.aufrufe.length <= 20, 'das Minutenbudget deckelt auch verschiedene Fehler');

  // Das Fenster ist gleitend, nicht endgueltig: die naechste Minute meldet wieder.
  uhr += 61_000;
  melder.melden(new Error('nach dem Fenster'), { route: '/api/bridge', status: 500 });
  assert.equal(faenger.aufrufe.length, 21);
});

test('dieselbe Meldung auf verschiedenen Routen wird getrennt gezaehlt', () => {
  const faenger = fetchFaenger();
  const melder = erzeugeMelder({ env: { GLITCHTIP_DSN: DSN }, fetchImpl: faenger.impl });

  melder.melden(new Error('timeout'), { route: '/api/bridge', status: 500 });
  melder.melden(new Error('timeout'), { route: '/api/lead-init', status: 500 });

  assert.equal(faenger.aufrufe.length, 2, 'die Route gehoert in den Drosselschluessel');
});

// --- Eigenschaft 1+2: nie werfen, nie warten ------------------------------------------------------

test('ein werfendes fetch bricht den Aufrufer nicht ab', () => {
  const melder = erzeugeMelder({
    env: { GLITCHTIP_DSN: DSN },
    fetchImpl: () => {
      throw new Error('Netz kaputt');
    },
  });

  let weitergelaufen = false;
  assert.doesNotThrow(() => {
    melder.melden(new Error('irgendwas'));
    weitergelaufen = true;
  });
  assert.equal(weitergelaufen, true, 'der Aufruferpfad laeuft weiter');
});

test('ein abgelehntes fetch erzeugt keine unbehandelte Ablehnung', async () => {
  const gesehen = [];
  const aufzeichnen = (grund) => gesehen.push(grund);
  process.on('unhandledRejection', aufzeichnen);

  const melder = erzeugeMelder({
    env: { GLITCHTIP_DSN: DSN },
    fetchImpl: async () => {
      throw new Error('GlitchTip antwortet nicht');
    },
  });
  melder.melden(new Error('irgendwas anderes'));

  await new Promise((fertig) => setTimeout(fertig, 50));
  process.off('unhandledRejection', aufzeichnen);
  assert.deepEqual(gesehen, [], 'der Melder verschluckt seinen eigenen Fehlschlag');
});

test('melden gibt nichts zurueck, auf das ein Aufrufer warten koennte', () => {
  const faenger = fetchFaenger();
  const melder = erzeugeMelder({ env: { GLITCHTIP_DSN: DSN }, fetchImpl: faenger.impl });
  assert.equal(melder.melden(new Error('x')), undefined);
});

// --- Eigenschaft 4: nichts Personenbezogenes ------------------------------------------------------

test('entschaerfen entfernt E-Mail, lead_hash, Token und Query-String', () => {
  assert.equal(entschaerfen('mail an kunde@example.com fehlgeschlagen'), 'mail an [email] fehlgeschlagen');
  assert.equal(entschaerfen('lead qz_abcdef1234567890 fehlt'), 'lead [lead_hash] fehlt');
  assert.equal(entschaerfen('session ac_abcdef1234567890'), 'session [session_hash]');
  assert.equal(
    entschaerfen('GET /api/bridge?secret=geheim&email=a@b.de fehlgeschlagen'),
    'GET /api/bridge?[query] fehlgeschlagen'
  );
  assert.match(entschaerfen('bearer eyJhbGciOiJIUzI1NiJ9.abc.def'), /\[token\]/);
  // Ein Fragezeichen im Fliesstext ist kein Query-String.
  assert.equal(entschaerfen('was ist hier los?'), 'was ist hier los?');
});

test('unbekannte Kontextfelder verlassen den Prozess nicht', () => {
  const faenger = fetchFaenger();
  const melder = erzeugeMelder({ env: { GLITCHTIP_DSN: DSN }, fetchImpl: faenger.impl });

  melder.melden(new Error('abgelehnt'), {
    route: '/api/bridge',
    request_id: 'req-77',
    status: 502,
    // Alles ab hier ist NICHT in KONTEXT_FELDER und muss spurlos verschwinden.
    lead_hash: 'qz_abcdef1234567890',
    email: 'kunde@example.com',
    body: { antworten: [1, 2, 3], name: 'Markus' },
    headers: { cookie: 'sid=geheim', authorization: 'Bearer geheim' },
  });

  const { roh, ereignis } = umschlagLesen(faenger.aufrufe[0]);

  // Positiv: der erlaubte Kontext ist da.
  assert.equal(ereignis.tags.route, '/api/bridge');
  assert.equal(ereignis.tags.status, '502');
  assert.equal(ereignis.extra.request_id, 'req-77');
  assert.equal(ereignis.transaction, '/api/bridge');

  // Negativ: nichts davon reist mit.
  for (const verboten of [
    'qz_abcdef1234567890',
    'kunde@example.com',
    'lead_hash',
    'cookie',
    'authorization',
    'Bearer',
    'antworten',
    'Markus',
  ]) {
    assert.ok(!roh.includes(verboten), `"${verboten}" darf nicht im Umschlag stehen`);
  }
});

test('personenbezogene Angaben im Fehlertext selbst werden entschaerft', () => {
  const faenger = fetchFaenger();
  const melder = erzeugeMelder({ env: { GLITCHTIP_DSN: DSN }, fetchImpl: faenger.impl });

  melder.melden(
    new Error('upsert fuer qz_abcdef1234567890 (kunde@example.com) abgelehnt'),
    { route: '/api/lead-track', status: 500 }
  );

  const { roh, ereignis } = umschlagLesen(faenger.aufrufe[0]);
  assert.equal(
    ereignis.exception.values[0].value,
    'upsert fuer [lead_hash] ([email]) abgelehnt'
  );
  assert.ok(!roh.includes('qz_abcdef1234567890'));
  assert.ok(!roh.includes('kunde@example.com'));
});

// --- Verdrahtung im HTTP-Adapter --------------------------------------------------------------------

/**
 * Ersetzt globalThis.fetch fuer AUSGEHENDE Aufrufe und sammelt die GlitchTip-POSTs. Requests
 * an den lokalen Testserver laufen weiter ueber das echte fetch - dasselbe Muster wie in
 * scripts/tests/http-adapter.test.js.
 */
function withMelderMock() {
  const original = globalThis.fetch;
  const aufrufe = [];

  globalThis.fetch = async (url, init) => {
    const ziel = String(url);
    if (ziel.startsWith('http://127.0.0.1:')) return original(url, init);
    if (ziel === ENDPUNKT) {
      aufrufe.push({ url: ziel, init });
      return { ok: true, status: 200 };
    }
    throw new Error(`Unerwarteter externer Netzaufruf im Test: ${ziel}`);
  };

  standard._test.zuruecksetzen();

  return {
    aufrufe,
    restore() {
      globalThis.fetch = original;
      standard._test.zuruecksetzen();
    },
  };
}

/** Startet den echten Adapter mit einer Handler-Attrappe auf einem freien Port. */
async function startServer(handler, options = {}) {
  const app = createApp({
    registry: {
      listModuleNames: () => ['pruefling'],
      resolve: async (name) => (name === 'pruefling' ? handler : null),
    },
    ...options,
  });
  const server = http.createServer(app);
  await new Promise((fertig) => server.listen(0, '127.0.0.1', fertig));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  return {
    async request(pathname, init = {}) {
      const antwort = await fetch(`${baseUrl}${pathname}`, { redirect: 'manual', ...init });
      const text = await antwort.text();
      // Die Meldung faellt im close-Listener an, also nach der gelesenen Antwort.
      await new Promise((fertig) => setTimeout(fertig, 40));
      return { status: antwort.status, text };
    },
    async close() {
      const geschlossen = new Promise((fertig) => server.close(fertig));
      server.closeAllConnections();
      await geschlossen;
    },
  };
}

test('ein werfender api/-Handler wird genau einmal gemeldet - ohne Payload, ohne Query', async (t) => {
  const mock = withMelderMock();
  const server = await startServer(() => {
    throw new Error('supabase abgelehnt fuer qz_abcdef1234567890 (kunde@example.com)');
  });
  t.after(async () => {
    await server.close();
    mock.restore();
  });

  const antwort = await server.request('/api/pruefling?secret=geheim&email=kunde@example.com', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: 'sid=auchgeheim' },
    body: JSON.stringify({ email: 'kunde@example.com', lead_hash: 'qz_abcdef1234567890' }),
  });

  // Das Antwortverhalten bleibt unveraendert: stabiler Code, keine internen Details.
  assert.equal(antwort.status, 500);
  assert.equal(JSON.parse(antwort.text).error, 'internal_server_error');

  assert.equal(mock.aufrufe.length, 1, 'genau eine Meldung, nicht zwei');
  const { roh, ereignis } = umschlagLesen(mock.aufrufe[0]);

  assert.equal(ereignis.tags.route, '/api/pruefling', 'Route ohne Query-String');
  assert.equal(ereignis.tags.status, '500');
  assert.match(ereignis.extra.request_id, /^[0-9a-f-]{36}$/, 'die Request-ID des Logs reist mit');
  assert.equal(ereignis.exception.values[0].type, 'Error');

  for (const verboten of [
    'geheim',
    'auchgeheim',
    'kunde@example.com',
    'qz_abcdef1234567890',
    'secret=',
    'sid=',
  ]) {
    assert.ok(!roh.includes(verboten), `"${verboten}" darf nicht im Umschlag stehen`);
  }
});

test('eine selbst erzeugte 500-Antwort wird gemeldet, obwohl nichts geworfen wurde', async (t) => {
  const mock = withMelderMock();
  const server = await startServer((_req, res) => {
    res.status(500).json({ success: false, error: 'upstream_kaputt' });
  });
  t.after(async () => {
    await server.close();
    mock.restore();
  });

  const antwort = await server.request('/api/pruefling');
  assert.equal(antwort.status, 500);
  assert.equal(mock.aufrufe.length, 1);

  const { ereignis } = umschlagLesen(mock.aufrufe[0]);
  assert.equal(ereignis.tags.route, '/api/pruefling');
  assert.equal(ereignis.tags.status, '500');
  assert.equal(ereignis.exception.values[0].value, 'HTTP 500 auf /api/pruefling');
});

test('4xx-Antworten werden nicht gemeldet', async (t) => {
  const mock = withMelderMock();
  const server = await startServer((_req, res) => {
    res.status(400).json({ success: false, error: 'invalid_lead_hash' });
  });
  t.after(async () => {
    await server.close();
    mock.restore();
  });

  const antwort = await server.request('/api/pruefling');
  assert.equal(antwort.status, 400);
  assert.equal(mock.aufrufe.length, 0, 'ein Client-Fehler ist kein Serverfehler');

  // Auch der geworfene 4xx (kaputtes JSON) bleibt still.
  const kaputt = await server.request('/api/pruefling', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{ das ist kein json',
  });
  assert.equal(kaputt.status, 400);
  assert.equal(mock.aufrufe.length, 0);
});

test('die geplante 503 des Shutdowns wird nicht gemeldet', async (t) => {
  const mock = withMelderMock();
  const server = await startServer(
    (_req, res) => res.status(200).json({ ok: true }),
    { isShuttingDown: () => true }
  );
  t.after(async () => {
    await server.close();
    mock.restore();
  });

  const antwort = await server.request('/api/pruefling');
  assert.equal(antwort.status, 503);
  assert.equal(
    mock.aufrufe.length,
    0,
    'sonst brennt jeder Deploy das Minutenbudget nieder'
  );
});
