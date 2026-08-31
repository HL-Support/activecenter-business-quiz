'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalisiereSlug,
  vorwahl,
  formatiereNummer,
  telefon,
  ausZeile,
} = require('../../server/legacy/berater');
const { konfiguriert, KONFIG_SCHLUESSEL } = require('../../server/legacy/datenbank');

// Diese Zeile hat die Form, die `prod_quiz.quiz_berater` liefert.
// Die Werte stammen aus der Stichprobe vom 31.08.2026, gegen die echte Bridge geprueft.
const ZEILE = {
  slug: 'trix24',
  user_id: 4711,
  first_name: 'Beatrix',
  last_name: 'Buerki',
  full_name: 'Beatrix Buerki',
  email: 'beispiel@example.com',
  herbalife_id: '25Y0040191',
  preferred_newsletter_language: 'de',
  organisation_name: 'EaglesFit',
  organisation_id: 8,
  country: 'CH',
  street: 'Weg 1',
  postal: '3000',
  place: 'Bern',
  area_code: '41',
  phone_number: '765754024',
  image: 'bild.jpg',
  avatar_150: 'a150.jpg',
  avatar_300: 'a300.jpg',
  avatar_600: 'a600.jpg',
  instagram: null,
  facebook: null,
};

test('der Slug wird genauso normalisiert wie im Bridge-Weg', () => {
  assert.equal(normalisiereSlug('TriX24'), 'trix24');
  assert.equal(normalisiereSlug('  Trix24  '), 'trix24');
  assert.equal(normalisiereSlug(''), 'default');
  assert.equal(normalisiereSlug(null), 'default');
  assert.equal(normalisiereSlug('a'.repeat(200)).length, 80);
});

// db-bridge.php:1355-1362
test('die Vorwahl wird wie in der Bridge normalisiert', () => {
  assert.equal(vorwahl('0049'), '+49');
  assert.equal(vorwahl('390049'), '+49');
  assert.equal(vorwahl('49'), '+49');
  assert.equal(vorwahl('+41'), '+41');
  assert.equal(vorwahl(''), '');
});

// db-bridge.php:1364-1396 — laenderspezifische Anzeigeformatierung
test('die Nummer wird je Land wie in der Bridge formatiert', () => {
  assert.equal(formatiereNummer('+41', '0765754024'), '76 575 40 24');
  assert.equal(formatiereNummer('+49', '01761234567'), '176 1234 567');
  assert.equal(formatiereNummer('+49', '0301234567'), '301 234 567');
  // 🔴 Unter neun Ziffern greift KEIN Zweig — die Bridge liefert dann die bereinigte
  // Nummer unformatiert zurueck (db-bridge.php:1381). Genau hier lag meine erste,
  // falsche Testerwartung: "030123456" hat nach dem Kuerzen nur acht Ziffern.
  assert.equal(formatiereNummer('+49', '030123456'), '30123456');
  assert.equal(formatiereNummer('+43', '06641234567'), '664 123 4567');
  assert.equal(formatiereNummer('+39', '3401234567'), '340 123 4567');
  // unbekanntes Land: unveraendert, nur fuehrende Null weg
  assert.equal(formatiereNummer('+1', '0555123'), '555123');
  // CH mit abweichender Laenge faellt auf die bereinigte Nummer zurueck
  assert.equal(formatiereNummer('+41', '012345'), '12345');
});

test('Vorwahl und Nummer werden zusammengesetzt wie in der Bridge', () => {
  assert.equal(telefon('41', '0765754024'), '+41 76 575 40 24');
  assert.equal(telefon('', ''), '');
});

test('eine Zeile wird in die Antwortform der Bridge gebracht', () => {
  const b = ausZeile(ZEILE);
  assert.equal(b.found, true);
  assert.equal(b.source, 'user');
  assert.equal(b.organisation_name, 'EaglesFit');
  assert.equal(b.organisation_id, 8);
  assert.equal(b.full_name, 'Beatrix Buerki');
  assert.equal(b.member_id, '25Y0040191');
  assert.equal(b.ref_id, '25Y0040191');
  assert.equal(b.match, '1');
  assert.equal(b.phone, '+41 76 575 40 24');
});

// 🔴 Der Kern: das Land steht NUR verschachtelt. Genau daran hat sich der
// Schattenvergleich am 31.08. verschluckt und bei JEDEM Berater Alarm geschlagen.
test('das Land steht nur in address, nicht flach', () => {
  const b = ausZeile(ZEILE);
  assert.equal(b.address.country, 'CH');
  assert.equal(b.country, undefined);
  assert.deepEqual(Object.keys(b.address), ['street', 'postal', 'place', 'country']);
});

test('bewusst nicht nachgebaute Felder sind vorhanden, aber null', () => {
  const b = ausZeile(ZEILE);
  for (const feld of ['marketing_status', 'marketing_level_id', 'level_name', 'level_id']) {
    assert.equal(b[feld], null, feld);
  }
});

test('der volle Name wird gebaut, wenn die Quelle keinen fuehrt', () => {
  const b = ausZeile({ ...ZEILE, full_name: null });
  assert.equal(b.full_name, 'Beatrix Buerki');
});

test('ohne E-Mail gibt es keinen Berater', () => {
  assert.equal(ausZeile({ ...ZEILE, email: null }), null);
  assert.equal(ausZeile(null), null);
});

// Ohne vollstaendige Konfiguration bleibt das Modul inert — ein Deploy ohne die
// Variablen verhaelt sich exakt wie vorher, und die Tests brauchen keine Legacy-DB.
test('ohne vollstaendige Konfiguration ist der Zugang inert', () => {
  assert.equal(konfiguriert({}), false);
  const teil = {};
  KONFIG_SCHLUESSEL.slice(0, -1).forEach((k) => {
    teil[k] = 'x';
  });
  assert.equal(konfiguriert(teil), false);
  const voll = {};
  KONFIG_SCHLUESSEL.forEach((k) => {
    voll[k] = 'x';
  });
  assert.equal(konfiguriert(voll), true);
});
