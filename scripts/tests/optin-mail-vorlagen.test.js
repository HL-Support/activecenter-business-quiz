'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

/**
 * Schritt M1: Die Vorlagen der beiden Opt-in-Mails liegen im Repo und sind prüfbar,
 * BEVOR der Versand umzieht.
 *
 * Zwei Wächter:
 *  1. Driftwächter — der Rumpf von `server/optin-mail-bibliothek.js` ist zeichengleich
 *     mit dem Extrakt aus dem laufenden n8n-Workflow. Ohne das ist „dieselbe Mail wie
 *     heute" eine Behauptung.
 *  2. Goldene Muster — die gerenderten Mails sind festgeschrieben. Ändert sich eine
 *     Betreffzeile oder ein HTML-Rumpf, faellt es auf, statt still beim Empfaenger zu
 *     landen.
 */

const WURZEL = path.resolve(__dirname, '..', '..');
const EXTRAKT = path.join(WURZEL, 'docs/audits/c1-postprocessor-extrakt/bibliothek.js');
const MODUL = path.join(WURZEL, 'server/optin-mail-bibliothek.js');
const MUSTER = path.join(__dirname, 'muster', 'optin-mails.json');

const bibliothek = require('../../server/optin-mail-bibliothek');

/**
 * Der Rumpf ist alles zwischen Kopfkommentar und Export-Block.
 *
 * Zeilenumbrueche werden normalisiert: Git schreibt die Dateien je nach `core.autocrlf`
 * mit CRLF oder LF aus. Ein byteweiser Vergleich haenge damit an einer
 * Arbeitsplatz-Einstellung statt am Inhalt — und schlage auf Windows an, obwohl nichts
 * abweicht. Genau das ist beim ersten Lauf passiert.
 */
function rumpf(inhalt) {
  const normalisiert = inhalt.replace(/\r\n/g, '\n');
  const start = normalisiert.indexOf('function safeJsonParse');
  const ende = normalisiert.indexOf('// Ab hier NEU (nicht Teil des Extrakts)');
  return (ende === -1 ? normalisiert.slice(start) : normalisiert.slice(start, ende)).trim();
}

test('der Rumpf ist zeichengleich mit dem Extrakt aus dem laufenden Workflow', () => {
  const ausExtrakt = rumpf(fs.readFileSync(EXTRAKT, 'utf8'));
  const ausModul = rumpf(fs.readFileSync(MODUL, 'utf8'));

  assert.ok(ausExtrakt.length > 50_000, 'Extrakt unerwartet klein — falsche Datei?');
  assert.equal(
    ausModul,
    ausExtrakt,
    'Der Rumpf weicht vom Extrakt ab. Wer hier etwas aendert, aendert die Mail, die heute ' +
      'wirklich verschickt wird — das gehoert bewusst und mit eigenem Beweis gemacht.'
  );
});

/**
 * Ein Datensatz in der Form, die der Post Processor aus MySQL liest. Bewusst erfunden —
 * keine echten Kontaktdaten in Tests (R0: nie gegen echte Daten testen).
 */
function zeile(uebersteuern = {}) {
  return {
    id: 4711,
    hash: 'qz_musterhash0001',
    token: 'tok_muster',
    submitted_at: '2026-08-31 09:00:00',
    form_response: JSON.stringify({
      hidden: {
        berater_slug: 'markus',
        member_id: '25Y0040191',
        lang: 'de',
      },
      variables: [
        { key: 'profile_code', value: 'A' },
        { key: 'main_aspiration', value: 'freedom' },
        { key: 'initial_barrier', value: 'vehicle' },
      ],
      answers: [],
    }),
    contact_first_name: 'Alex',
    contact_last_name: 'Muster',
    contact_full_name: 'Alex Muster',
    contact_email: 'alex@example.invalid',
    coach_first_name: 'Markus',
    coach_full_name: 'Markus Oberhofer',
    coach_email: 'coach@example.invalid',
    coach_organisation_name: 'Activecenter',
    coach_sub_domain: 'markus',
    ...uebersteuern,
  };
}

const SPRACHEN = ['de', 'it', 'en', 'hu'];

function modellFuer(sprache) {
  const roh = zeile();
  const inhalt = JSON.parse(roh.form_response);
  inhalt.hidden.lang = sprache;
  roh.form_response = JSON.stringify(inhalt);
  return bibliothek.buildLeadModel(roh, { videoBaseUrl: 'https://business.activecenter.info' });
}

function gerendert() {
  const ergebnis = {};
  for (const sprache of SPRACHEN) {
    const model = modellFuer(sprache);
    ergebnis[sprache] = {
      lead_subject: model.lead_email_subject,
      coach_subject: model.coach_email_subject,
      lead_html: bibliothek.buildPremiumLeadEmailHtml(model),
      lead_text: bibliothek.buildPremiumLeadEmailText(model),
      coach_html: bibliothek.buildCoachEmailHtml(model),
      coach_text: bibliothek.buildCoachEmailText(model),
    };
  }
  return ergebnis;
}

test('die gerenderten Mails entsprechen den goldenen Mustern', () => {
  const jetzt = gerendert();

  if (!fs.existsSync(MUSTER)) {
    fs.mkdirSync(path.dirname(MUSTER), { recursive: true });
    fs.writeFileSync(MUSTER, JSON.stringify(jetzt, null, 2) + '\n');
    assert.fail('Goldene Muster neu angelegt — Lauf wiederholen und die Datei mit einchecken.');
  }

  const gold = JSON.parse(fs.readFileSync(MUSTER, 'utf8'));
  for (const sprache of SPRACHEN) {
    for (const feld of Object.keys(gold[sprache])) {
      assert.equal(
        jetzt[sprache][feld],
        gold[sprache][feld],
        `${sprache}.${feld} weicht vom goldenen Muster ab`
      );
    }
  }
});

test('beide Mails tragen in jeder Sprache Betreff, HTML und Text', () => {
  const jetzt = gerendert();
  for (const sprache of SPRACHEN) {
    const m = jetzt[sprache];
    assert.ok(m.lead_subject && m.lead_subject.length > 3, `${sprache}: Lead-Betreff fehlt`);
    assert.ok(m.coach_subject && m.coach_subject.length > 3, `${sprache}: Coach-Betreff fehlt`);
    assert.ok(m.lead_html.includes('<'), `${sprache}: Lead-HTML leer`);
    assert.ok(m.coach_html.includes('<'), `${sprache}: Coach-HTML leer`);
    assert.ok(m.lead_text.length > 20, `${sprache}: Lead-Text leer`);
    assert.ok(m.coach_text.length > 20, `${sprache}: Coach-Text leer`);
  }
});

// 🔴 Befund aus Strang M, hier festgehalten: Mail 1 ist einsprachig deutsch, Mail 2 nicht.
// Wer das spaeter aendern will, soll es bewusst tun — nicht aus Versehen.
test('Mail 1 an den Berater ist einsprachig deutsch, Mail 2 uebersetzt', () => {
  const jetzt = gerendert();
  const coachBetreffe = new Set(SPRACHEN.map((s) => jetzt[s].coach_subject));
  assert.equal(coachBetreffe.size, 1, 'Coach-Betreff ist doch uebersetzt — Befund pruefen');

  const leadBetreffe = new Set(SPRACHEN.map((s) => jetzt[s].lead_subject));
  assert.ok(leadBetreffe.size > 1, 'Lead-Betreff ist nicht uebersetzt — Befund pruefen');
});
