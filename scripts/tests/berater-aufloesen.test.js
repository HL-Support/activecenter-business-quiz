'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { STELLEN, schalter, beraterAufloesen } = require('../../server/berater-aufloesen');
const { vergleiche } = require('../../server/berater-verzeichnis');

const BRIDGE = { found: true, email: 'a@b.de', organisation_name: 'EaglesFit', address: { country: 'CH' } };
const GLEICH = { found: true, email: 'a@b.de', organisation_name: 'EaglesFit', country: 'CH' };
const ANDERS = { found: true, email: 'a@b.de', organisation_name: 'EaglesFit-Support', country: 'CH' };

function quellen({ bridge = BRIDGE, verzeichnis = GLEICH, mysql = GLEICH, bridgeFehler } = {}) {
  return {
    bridge: async () => {
      if (bridgeFehler) throw new Error('bridge_kaputt');
      return { status: 200, data: bridge };
    },
    verzeichnis: async () => (verzeichnis instanceof Error ? Promise.reject(verzeichnis) : verzeichnis),
    mysql: async () => (mysql instanceof Error ? Promise.reject(mysql) : mysql),
  };
}

test('ohne Env entscheidet die Bridge und es wird nichts gemessen', () => {
  assert.deepEqual(schalter(STELLEN.FUNNEL, {}), { quelle: 'bridge', schatten: 'aus' });
});

// 🔴 Der heute produktive Wert. Braeche er, riss der laufende Schattenlauf ab.
test('der Altwert "beide" wird weiter verstanden', () => {
  assert.deepEqual(schalter(STELLEN.MAIL, { COACH_LOOKUP_SOURCE: 'beide' }), {
    quelle: 'bridge',
    schatten: 'verzeichnis',
  });
});

test('die Quelle laesst sich je Stelle uebersteuern', () => {
  const env = { COACH_LOOKUP_SOURCE: 'bridge', COACH_LOOKUP_SOURCE_FUNNEL: 'mysql' };
  assert.equal(schalter(STELLEN.FUNNEL, env).quelle, 'mysql');
  assert.equal(schalter(STELLEN.MAIL, env).quelle, 'bridge');
});

test('unbekannte Werte fallen auf den sicheren Standard zurueck', () => {
  assert.deepEqual(schalter(STELLEN.FUNNEL, { COACH_LOOKUP_SOURCE: 'quatsch' }), {
    quelle: 'bridge',
    schatten: 'aus',
  });
});

test('sich selbst zu vergleichen wird abgeschaltet', () => {
  const env = { COACH_LOOKUP_SOURCE: 'mysql', COACH_LOOKUP_SCHATTEN: 'mysql' };
  assert.equal(schalter(STELLEN.FUNNEL, env).schatten, 'aus');
});

test('ohne Env liefert der Aufloeser genau die Bridge-Antwort', async () => {
  const r = await beraterAufloesen({
    slug: 'trix24',
    stelle: STELLEN.FUNNEL,
    quellen: quellen(),
    env: {},
    vergleiche,
  });
  assert.equal(r.status, 200);
  assert.equal(r.quelle, 'bridge');
  assert.deepEqual(r.data, BRIDGE);
});

test('im Schattenlauf entscheidet weiter die Bridge', async () => {
  const befunde = [];
  const r = await beraterAufloesen({
    slug: 'trix24',
    stelle: STELLEN.MAIL,
    quellen: quellen({ verzeichnis: ANDERS }),
    env: { COACH_LOOKUP_SOURCE: 'beide' },
    vergleiche,
    schattenNotiz: (b) => befunde.push(b),
  });
  assert.deepEqual(r.data, BRIDGE, 'die Bridge entscheidet');
  assert.equal(befunde.length, 1);
  assert.deepEqual(befunde[0].abweichungen, ['organisation_name']);
});

// Der Fall, der am 31.08. den Fehlalarm ausloeste: Bridge verschachtelt, Verzeichnis flach.
test('die verschachtelte Landangabe erzeugt keinen Fehlalarm', async () => {
  const befunde = [];
  await beraterAufloesen({
    slug: 'trix24',
    stelle: STELLEN.MAIL,
    quellen: quellen(),
    env: { COACH_LOOKUP_SOURCE: 'beide' },
    vergleiche,
    schattenNotiz: (b) => befunde.push(b),
  });
  assert.deepEqual(befunde[0].abweichungen, []);
});

test('auf mysql gestellt entscheidet mysql', async () => {
  const r = await beraterAufloesen({
    slug: 'trix24',
    stelle: STELLEN.FUNNEL,
    quellen: quellen({ mysql: ANDERS }),
    env: { COACH_LOOKUP_SOURCE: 'mysql' },
    vergleiche,
  });
  assert.equal(r.quelle, 'mysql');
  assert.equal(r.data.organisation_name, 'EaglesFit-Support');
});

// 🔴 Kein Fehler aus einer Nebenquelle darf je einen Verbraucher erreichen.
test('faellt mysql aus, entscheidet die Bridge', async () => {
  const befunde = [];
  const r = await beraterAufloesen({
    slug: 'trix24',
    stelle: STELLEN.FUNNEL,
    quellen: quellen({ mysql: new Error('mysql_weg') }),
    env: { COACH_LOOKUP_SOURCE: 'mysql' },
    vergleiche,
    schattenNotiz: (b) => befunde.push(b),
  });
  assert.equal(r.quelle, 'bridge_rueckfall');
  assert.deepEqual(r.data, BRIDGE);
  assert.deepEqual(befunde[0].abweichungen, ['mysql_fehler']);
});

test('ein Fehler im Schattenweg gefaehrdet den Aufruf nicht', async () => {
  const befunde = [];
  const r = await beraterAufloesen({
    slug: 'trix24',
    stelle: STELLEN.MAIL,
    quellen: quellen({ verzeichnis: new Error('verzeichnis_weg') }),
    env: { COACH_LOOKUP_SOURCE: 'beide' },
    vergleiche,
    schattenNotiz: (b) => befunde.push(b),
  });
  assert.deepEqual(r.data, BRIDGE);
  assert.deepEqual(befunde[0].abweichungen, ['verzeichnis_fehler']);
});

test('eine werfende Schattennotiz bleibt folgenlos', async () => {
  const r = await beraterAufloesen({
    slug: 'trix24',
    stelle: STELLEN.MAIL,
    quellen: quellen(),
    env: { COACH_LOOKUP_SOURCE: 'beide' },
    vergleiche,
    schattenNotiz: () => {
      throw new Error('protokoll_kaputt');
    },
  });
  assert.deepEqual(r.data, BRIDGE);
});

test('faellt die Bridge aus, wird der Fehler weitergereicht', async () => {
  await assert.rejects(
    beraterAufloesen({
      slug: 'trix24',
      stelle: STELLEN.FUNNEL,
      quellen: quellen({ bridgeFehler: true }),
      env: {},
      vergleiche,
    }),
    /bridge_kaputt/
  );
});

// 🔴 Die haltbare Notiz: Der Vergleich darf einen Deploy ueberleben.
test('die Schattennotiz ruft die RPC mit kanonisch sortierten Feldern', async () => {
  const rufe = [];
  const rpc = async (name, args) => {
    rufe.push({ name, args });
    return [{ anzahl: 1 }];
  };
  const { schattenNotizUeberRpc } = require('../../server/berater-aufloesen');

  await beraterAufloesen({
    slug: 'trix24',
    stelle: STELLEN.MAIL,
    quellen: quellen({ verzeichnis: ANDERS }),
    env: { COACH_LOOKUP_SOURCE: 'beide' },
    vergleiche,
    schattenNotiz: schattenNotizUeberRpc(rpc),
  });

  assert.equal(rufe.length, 1);
  assert.equal(rufe[0].name, 'notiere_berater_vergleich');
  assert.deepEqual(rufe[0].args, {
    p_stelle: 'mail',
    p_slug: 'trix24',
    p_quelle: 'bridge',
    p_schatten: 'verzeichnis',
    p_abweichungen: 'organisation_name',
  });
});

test('mehrere Abweichungen werden immer gleich sortiert abgelegt', async () => {
  const { schattenNotizUeberRpc } = require('../../server/berater-aufloesen');
  const rufe = [];
  const notiz = schattenNotizUeberRpc(async (name, args) => rufe.push(args));
  await notiz({ stelle: 'funnel', slug: 'x', quelle: 'bridge', schatten: 'mysql',
    abweichungen: ['organisation_name', 'country', 'email'] });
  assert.equal(rufe[0].p_abweichungen, 'country,email,organisation_name');
});

test('ohne Datenzugang gibt es keine Notiz - und keinen Fehler', async () => {
  const { schattenNotizUeberRpc } = require('../../server/berater-aufloesen');
  assert.equal(schattenNotizUeberRpc(undefined), undefined);
  const r = await beraterAufloesen({
    slug: 'trix24', stelle: STELLEN.MAIL, quellen: quellen(),
    env: { COACH_LOOKUP_SOURCE: 'beide' }, vergleiche,
    schattenNotiz: schattenNotizUeberRpc(undefined),
  });
  assert.deepEqual(r.data, BRIDGE);
});

// Ein Protokoll ist nie ein Datenpfad: faellt die RPC aus, laeuft der Aufruf weiter.
test('eine scheiternde RPC gefaehrdet den Aufruf nicht', async () => {
  const { schattenNotizUeberRpc } = require('../../server/berater-aufloesen');
  const r = await beraterAufloesen({
    slug: 'trix24', stelle: STELLEN.MAIL, quellen: quellen(),
    env: { COACH_LOOKUP_SOURCE: 'beide' }, vergleiche,
    schattenNotiz: schattenNotizUeberRpc(async () => {
      throw new Error('datenbank_weg');
    }),
  });
  assert.deepEqual(r.data, BRIDGE);
});
