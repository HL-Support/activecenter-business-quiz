'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  VERZEICHNIS_FELDER,
  normalisiereSlug,
  ausVerzeichniszeile,
  beraterAusVerzeichnis,
  vergleiche,
} = require('../../server/berater-verzeichnis');

const ZEILE = {
  slug: 'markus',
  email: 'info@global-sce.com',
  first_name: 'Markus',
  last_name: 'Oberhofer',
  full_name: 'Markus Oberhofer',
  country: 'IT',
  preferred_language: 'de',
  organisation_name: 'Activecenter-Support',
  herbalife_id: '25Y0040191',
};

test('der Slug wird genauso normalisiert wie im Bridge-Weg', () => {
  assert.equal(normalisiereSlug('Markus'), 'markus');
  assert.equal(normalisiereSlug('  MaRkUs  '), 'markus');
  assert.equal(normalisiereSlug(''), 'default');
  assert.equal(normalisiereSlug(null), 'default');
  assert.equal(normalisiereSlug(undefined), 'default');
  // 80 Zeichen ist die Grenze, die safeString(slug, 80) im Worker gezogen hat
  assert.equal(normalisiereSlug('a'.repeat(200)).length, 80);
});

test('eine Verzeichniszeile wird auf die Felder abgebildet, die die Mail erwartet', () => {
  const berater = ausVerzeichniszeile(ZEILE);
  assert.equal(berater.email, 'info@global-sce.com');
  assert.equal(berater.first_name, 'Markus');
  assert.equal(berater.name, 'Markus Oberhofer');
  assert.equal(berater.organisation_name, 'Activecenter-Support');
  assert.equal(berater.country, 'IT');
  // die Mail liest preferred_newsletter_language, die Spalte heisst preferred_language
  assert.equal(berater.preferred_newsletter_language, 'de');
  assert.equal(berater.found, true);
});

test('fehlt der volle Name, wird er aus Vor- und Nachname gebildet', () => {
  const berater = ausVerzeichniszeile({ ...ZEILE, full_name: null });
  assert.equal(berater.name, 'Markus Oberhofer');
});

test('ohne E-Mail gibt es keinen Berater - der Versand faellt aus, statt ins Leere zu gehen', () => {
  assert.equal(ausVerzeichniszeile({ ...ZEILE, email: null }), null);
  assert.equal(ausVerzeichniszeile({ ...ZEILE, email: '' }), null);
  assert.equal(ausVerzeichniszeile(null), null);
});

test('die Abfrage trifft leads.berater und begrenzt auf eine Zeile', async () => {
  let gesehenerPfad = null;
  await beraterAusVerzeichnis('Markus', async (pfad) => {
    gesehenerPfad = pfad;
    return [ZEILE];
  });
  assert.match(gesehenerPfad, /^berater\?slug=eq\.markus&/);
  assert.ok(gesehenerPfad.includes(`select=${VERZEICHNIS_FELDER}`));
  assert.ok(gesehenerPfad.includes('limit=1'));
});

test('eine leere Antwort liefert null statt eines halben Beraters', async () => {
  assert.equal(await beraterAusVerzeichnis('gibtesnicht', async () => []), null);
  assert.equal(await beraterAusVerzeichnis('gibtesnicht', async () => null), null);
});

test('der Slug wird fuer die Abfrage kodiert', async () => {
  let pfad = null;
  await beraterAusVerzeichnis('a/b c', async (p) => {
    pfad = p;
    return [];
  });
  assert.ok(pfad.startsWith('berater?slug=eq.a%2Fb%20c&'), pfad);
});

test('der Vergleich meldet nichts, wenn beide Wege dasselbe liefern', () => {
  const ausBridge = {
    email: 'info@global-sce.com',
    first_name: 'Markus',
    last_name: 'Oberhofer',
    organisation_name: 'Activecenter-Support',
    country: 'IT',
    preferred_newsletter_language: 'de',
  };
  assert.deepEqual(vergleiche(ausBridge, ausVerzeichniszeile(ZEILE)), []);
});

test('der Vergleich ist nachsichtig bei Randabstand, Schreibweise, leer und null', () => {
  const a = { email: ' Info@Global-SCE.com ', first_name: '', country: null };
  const b = { email: 'info@global-sce.com', first_name: null, country: '' };
  assert.deepEqual(vergleiche(a, b), []);
});

test('der Vergleich benennt genau die abweichenden Felder', () => {
  const ausBridge = { email: 'a@b.de', organisation_name: 'Alt', country: 'IT' };
  const ausVerzeichnis = { email: 'a@b.de', organisation_name: 'Neu', country: 'DE' };
  assert.deepEqual(vergleiche(ausBridge, ausVerzeichnis), ['organisation_name', 'country']);
});

test('kennt nur eine Seite den Berater, sagt der Vergleich welche', () => {
  assert.deepEqual(vergleiche(null, { email: 'a@b.de' }), ['nur_im_verzeichnis']);
  assert.deepEqual(vergleiche({ email: 'a@b.de' }, null), ['nur_in_der_bridge']);
  assert.deepEqual(vergleiche(null, null), []);
});
