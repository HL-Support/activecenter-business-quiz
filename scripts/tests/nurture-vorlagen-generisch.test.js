'use strict';

/**
 * Wächter über die generischen Nurture-Vorlagen für hu, fr und ru.
 *
 * 🔴 Was hier bewacht wird, ist die teuerste Fehlerklasse dieser Datei: ein zerschossener
 * Mautic-Platzhalter. `{contactfield=firstname}` mit einem Tippfehler wird NICHT ersetzt —
 * er steht dann wörtlich in der Mail, die ein Interessent liest. Kein Fehler, keine
 * Meldung, nur eine peinliche Mail. Beim Übersetzen ist das besonders naheliegend, weil
 * die Platzhalter mitten im fremdsprachigen Satz stehen.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { PHASEN, TEXTE, RAHMEN, T } = require('../../nurture/vorlagen/generisch-hu-fr-ru.js');

const SPRACHEN = ['de', 'hu', 'fr', 'ru'];
const NEUE_SPRACHEN = ['hu', 'fr', 'ru'];

test('jede aktive Phase hat jede Sprache — keine Lücke, kein Ausrutscher', () => {
  // 🔴 a4 und a5 stehen NICHT in ACTIVE_PHASES des Senders. Wer sie hier ergänzt, legt
  // Vorlagen an, die nie verschickt werden.
  assert.deepEqual(PHASEN, ['a2', 'a3', 'b1', 'b2', 'c1', 'c2', 'd1', 'd2']);
  assert.deepEqual(Object.keys(TEXTE).sort(), [...PHASEN].sort());

  for (const phase of PHASEN) {
    for (const sprache of SPRACHEN) {
      const t = TEXTE[phase][sprache];
      assert.ok(t, `${phase}/${sprache} fehlt`);
      for (const feld of ['betreff', 'knopf', 'gruss', 'team']) {
        assert.ok(String(t[feld] || '').trim(), `${phase}/${sprache}: ${feld} ist leer`);
      }
      assert.ok(Array.isArray(t.absaetze) && t.absaetze.length >= 3,
        `${phase}/${sprache}: zu wenige Absätze`);
      assert.ok(t.absaetze.every((a) => String(a).trim()), `${phase}/${sprache}: leerer Absatz`);
    }
    assert.ok(TEXTE[phase].emoji, `${phase}: kein Emoji`);
  }
});

test('🔴 kein Mautic-Platzhalter ist beim Übersetzen zerbrochen', () => {
  // Jede geschweifte Klammer im Text MUSS ein vollständiger, bekannter Platzhalter sein.
  const erlaubt = new Set(Object.values(T));
  const muster = /\{[^}]*\}?/g;

  for (const phase of PHASEN) {
    for (const sprache of SPRACHEN) {
      const t = TEXTE[phase][sprache];
      const alles = [t.betreff, t.knopf, t.team, ...t.absaetze].join(' ');
      for (const treffer of alles.match(muster) || []) {
        assert.ok(
          erlaubt.has(treffer),
          `${phase}/${sprache}: unbekannter oder abgeschnittener Platzhalter ${JSON.stringify(treffer)}`
        );
      }
      // Gegenprobe: keine halbe Klammer irgendwo
      const auf = (alles.match(/\{/g) || []).length;
      const zu = (alles.match(/\}/g) || []).length;
      assert.equal(auf, zu, `${phase}/${sprache}: ${auf} öffnende, ${zu} schliessende Klammern`);
    }
  }
});

test('die Übersetzungen tragen dieselben Platzhalter wie die deutsche Referenz', () => {
  // 🔴 Fehlt in der ungarischen Fassung der Beratername, steht dort eine Lücke im Satz —
  // und niemand bei uns liest Ungarisch gegen.
  for (const phase of PHASEN) {
    const zaehle = (t) => {
      const alles = [t.betreff, t.knopf, t.team, ...t.absaetze].join(' ');
      return Object.fromEntries(
        Object.entries(T).map(([name, marke]) => [name, alles.split(marke).length - 1])
      );
    };
    const referenz = zaehle(TEXTE[phase].de);
    for (const sprache of NEUE_SPRACHEN) {
      assert.deepEqual(
        zaehle(TEXTE[phase][sprache]),
        referenz,
        `${phase}/${sprache}: andere Platzhalter als die deutsche Referenz`
      );
    }
  }
});

test('der Rahmen ist in jeder Sprache vollständig — halb übersetzt ist schlechter als gar nicht', () => {
  const felder = ['ansprechpartner', 'telefon', 'email', 'vorLink', 'nachLink', 'abmelden', 'impressum'];
  for (const sprache of SPRACHEN) {
    assert.ok(RAHMEN[sprache], `Rahmen für ${sprache} fehlt`);
    for (const feld of felder) {
      assert.ok(String(RAHMEN[sprache][feld] || '').trim(), `${sprache}: Rahmenfeld ${feld} ist leer`);
    }
  }
  // Die Abmeldung zählt rechtlich — sie darf in keiner Sprache deutsch bleiben.
  for (const sprache of NEUE_SPRACHEN) {
    assert.notEqual(RAHMEN[sprache].abmelden, RAHMEN.de.abmelden, `${sprache}: Abmelden nicht übersetzt`);
    assert.notEqual(RAHMEN[sprache].vorLink, RAHMEN.de.vorLink, `${sprache}: Hinweistext nicht übersetzt`);
  }
});

test('🔴 die Lesefassung ist aktuell — sonst gibt jemand einen Text frei, der nie verschickt wird', () => {
  // Die Berater lesen `nurture-email-templates-<lang>.md` gegen, verschickt wird aber, was
  // in `generisch-hu-fr-ru.js` steht. Driften die beiden auseinander, ist die Freigabe
  // wertlos — und niemand merkt es, weil beide für sich plausibel aussehen.
  // 🔴 Der Vergleich läuft im Speicher. Die frühere Fassung startete das Skript und liess
  // es die drei Dateien NEU SCHREIBEN — ein Test, der während der parallel laufenden Suite
  // ins Repo schreibt, ist eine Wettlaufquelle und macht nebenbei den Arbeitsbaum
  // schmutzig. Ein Test, der irgendwann grundlos rot wird, erzieht dazu, ihn zu ignorieren.
  const { baueMarkdown } = require('../nurture-vorlagen-anlegen.js');
  const wurzel = path.join(__dirname, '../..');

  for (const sprache of NEUE_SPRACHEN) {
    const p = path.join(wurzel, 'nurture/vorlagen', `nurture-email-templates-${sprache}.md`);
    assert.ok(fs.existsSync(p), `Lesefassung für ${sprache} fehlt — mit --markdown erzeugen`);
    // Zeilenenden normalisieren: Git checkt hier mit CRLF aus, das Skript schreibt LF.
    // Ohne das meldete der Wächter eine Drift, wo nur die Zeilenenden verschieden sind.
    const inDatei = fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
    const erzeugt = baueMarkdown(sprache).replace(/\r\n/g, '\n');
    assert.equal(
      inDatei,
      erzeugt,
      `Die Lesefassung für ${sprache} ist veraltet. Neu erzeugen: `
        + 'node scripts/nurture-vorlagen-anlegen.js --markdown'
    );
  }
});

test('das Anlegeskript schreibt nur auf ausdrückliche Anweisung', () => {
  const quelle = fs.readFileSync(
    path.join(__dirname, '../..', 'scripts/nurture-vorlagen-anlegen.js'),
    'utf8'
  );
  assert.match(quelle, /const ANLEGEN = process\.argv\.includes\('--anlegen'\)/);
  assert.match(quelle, /if \(!ANLEGEN\)/);
  // 🔴 Das Gerüst wird geholt, nicht kopiert — sonst driften Mautic und Repo auseinander.
  assert.match(quelle, /\/api\/emails\/\$\{REFERENZ_ID\}/);
  assert.doesNotMatch(quelle, /<!DOCTYPE html/);
  // Jede Rahmenersetzung wird geprüft, statt still danebenzugreifen.
  assert.match(quelle, /Abbruch, statt halb übersetzt zu senden/);
});
