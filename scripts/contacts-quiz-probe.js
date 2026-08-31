#!/usr/bin/env node
'use strict';

/**
 * Eine Probe-Uebermittlung an contacts `/webhook/quiz` — mit dem ECHTEN Payload-Bau.
 *
 * 🔴 WARUM DIESES WERKZEUG UND NICHT EIN HANDGESCHRIEBENER curl-AUFRUF
 * Eine von Hand getippte Probe misst, ob der Empfaenger einen von Hand getippten Rumpf
 * versteht. Sie sagt NICHTS darueber, ob der Rumpf ankommt, den das Quiz wirklich baut —
 * und genau dort sass am 31.08.2026 der Befund K3 (die Gegenstelle spiegelte `meta` nicht
 * nach `hidden`, und es fiel niemandem auf, weil niemand den echten Weg gemessen hatte).
 * Deshalb geht dieses Skript durch dieselben Funktionen wie der Adapter:
 * `buildBusinessTypeformPayload` -> `buildContactsQuizPayload` -> `pruefeVertrag`
 * -> `sendeAnContacts`. Aendert sich dort etwas, aendert sich die Probe mit.
 *
 * WOFUER
 *   - B2-Beweis 2-4: schreibende Probe, Duplikat, Post-Processor, Rang-Aktualisierer
 *   - B5-Sofortprobe nach dem Umschalten
 *   - Gegenprobe nach einer Geheimnis-Rotation (§7 des Plans)
 *
 * 🔴 STANDARD IST TROCKENLAUF. Ohne `--senden` wird nichts uebermittelt; das Skript zeigt
 * nur, was es senden wuerde. Eine Probe erzeugt einen ECHTEN Kontakt in der Kartei und
 * loest Mail 1 und Mail 2 an den Berater aus — das passiert nie versehentlich.
 *
 *   node --env-file=.env.probe scripts/contacts-quiz-probe.js
 *   node --env-file=.env.probe scripts/contacts-quiz-probe.js --senden
 *   node --env-file=.env.probe scripts/contacts-quiz-probe.js --senden --wiederholen
 *
 * 🔴 `--ueber-adapter` geht den ANDEREN Weg: nicht direkt an contacts, sondern durch den
 * echten Opt-in-Eingang `POST /api/bridge` der laufenden Anwendung — genau so, wie der
 * Browser es tut. Nur damit laesst sich der SCHATTENZWEIG isoliert messen: Er ist in
 * `ohneFolgen()` gekapselt, ein Tippfehler im RPC-Namen bliebe also stumm, und man haette
 * am naechsten Tag „0 Zeilen" gemessen und fuer „kein Verkehr" gehalten. Der Beweis eines
 * Pfads muss den Pfad isoliert messen (Lehre vom 27.08.2026).
 * Achtung: Diese Form erzeugt auch ueber den ALTEN Weg einen echten Kontakt.
 *
 *   node scripts/contacts-quiz-probe.js --ueber-adapter --senden
 *
 * Erwartet: CONTACTS_QUIZ_URL, CONTACTS_QUIZ_WEBHOOK_SECRET (nur ohne `--ueber-adapter`).
 * Exitcode 0 = wie erwartet · 1 = Befund · 2 = nicht durchfuehrbar.
 */

const crypto = require('crypto');

const { buildBusinessTypeformPayload, buildContactsQuizPayload } = require('../api/bridge');
const {
  konfiguriert,
  pruefeVertrag,
  sendeAnContacts,
  werteAntwortAus,
  ziel,
} = require('../server/legacy/kontakte');

function argument(name, standard) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')
    ? process.argv[i + 1]
    : standard;
}

const SENDEN = process.argv.includes('--senden');
const WIEDERHOLEN = process.argv.includes('--wiederholen');
const UEBER_ADAPTER = process.argv.includes('--ueber-adapter');
const ADAPTER_URL = argument('adapter-url', 'https://quiz.activecenter.info/api/bridge');
const TYPEFORM_ZIEL = 'https://contacts.hl-support.biz/webhook/typeform';

const slug = argument('slug', 'markus');
const memberId = argument('member-id', '25851739');
const email = argument('email', 'info+b3probe@global-sce.com');
const vorname = argument('vorname', 'B3Probe');
const sprache = argument('sprache', 'de');

// Der Lesegriff traegt das Datum, damit eine Probezeile in der Kartei auf einen Blick als
// solche zu erkennen ist — und damit zwei Proben am selben Tag sich nicht ins Gehege
// kommen. Die Bauart (`qz_` + 24 Zeichen) ist die des echten Funnels.
const leadHash = `qz_probe${new Date().toISOString().slice(0, 10).replace(/-/g, '')}${crypto
  .randomBytes(4)
  .toString('hex')}`;

// So sieht das Paket aus, das src/lib/core.js an `forward_typeform_adapter` schickt.
const optIn = {
  first_name: vorname,
  email,
  token: crypto.randomBytes(10).toString('hex'),
  selected_answers: [
    { type: 'R' },
    { type: 'G' },
    { type: 'B' },
    { aspiration: 'freedom' },
    { aspiration: 'growth' },
    { barrier: 'confidence' },
  ],
  profile: { code: 'feuer', name: 'Der Macher' },
  main_aspiration: 'freedom',
  landed_at: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
  submitted_at: new Date().toISOString(),
  hidden: {
    c: 'AT',
    hash: leadHash,
    lead_hash: leadHash,
    session_hash: `ac_probe${crypto.randomBytes(6).toString('hex')}`,
    lang: sprache,
    berater_slug: slug,
    slug,
    member_id: memberId,
    ref_id: memberId,
    survey_id: '12',
    utm_source: 'b3-probe',
    utm_medium: 'nachweis',
  },
  calculated: { score: 0 },
  // 🔴 DIESE LISTE MUSS BLEIBEN — sie ist der Unterschied zwischen einer Probe und einem
  // Zerrbild. `noemail: 1` schaltet im ALTEN Weg zwei Mails ab
  // (`sendEmailToContact`, `sendEmailToCoachOnNewContactCreated`); der Browser schickt sie
  // bei jedem echten Opt-in mit (src/lib/core.js:1573-1579).
  //
  // Am 31.08.2026 fehlte sie hier — und prompt verschickte die Probe ueber
  // `--ueber-adapter` eine Mail ("Neuer Kontakt aus: Business"), die der echte Funnel NIE
  // ausloest. Eine Probe, die anders aussieht als der Ernstfall, misst den Ernstfall
  // nicht; sie erzeugt Gespenster, denen man dann hinterherlaeuft.
  variables: [
    { key: 'contact_country', type: 'text', text: 'AT' },
    { key: 'score', type: 'number', number: 0 },
    { key: 'noemail', type: 'number', number: 1 },
    { key: 'main_aspiration', type: 'text', text: 'freedom' },
    { key: 'main_aspiration_label', type: 'text', text: 'Freiheit' },
  ],
};

function zeile(schluessel, wert) {
  console.log(`  ${String(schluessel).padEnd(24)} ${wert}`);
}

(async () => {
  const typeform = buildBusinessTypeformPayload(optIn);
  const rumpf = pruefeVertrag(buildContactsQuizPayload(optIn, typeform));

  // Im Betrieb erzeugt die Datenbank den Schluessel beim Einreihen. Hier gibt es keinen
  // Auftrag — also erzeugt ihn die Probe selbst, in derselben Form.
  rumpf.meta.submissionId = crypto.randomUUID();

  console.log('');
  console.log('Probe-Uebermittlung an contacts /webhook/quiz');
  console.log('');
  zeile('Ziel', ziel(process.env) || '(CONTACTS_QUIZ_URL fehlt)');
  zeile('Berater', `${slug} / ${memberId}`);
  zeile('Interessent', `${vorname} <${email}>`);
  zeile('Lesegriff (hash)', rumpf.meta.hash);
  zeile('submissionId', rumpf.meta.submissionId);
  zeile('Profil', `${rumpf.meta.profileCode} / ${rumpf.meta.profileLabel}`);
  zeile('Ziel des Interessenten', `${rumpf.meta.mainAspiration} / ${rumpf.meta.mainAspirationLabel}`);
  zeile('Barriere', rumpf.meta.barrier);
  zeile('Antworten', `${rumpf.answers.length} Paare`);
  console.log('');

  if (UEBER_ADAPTER) {
    zeile('Weg', `ueber den echten Opt-in-Eingang ${ADAPTER_URL}`);
    console.log('');
    if (!SENDEN) {
      console.log('  TROCKENLAUF — es wurde NICHTS uebermittelt.');
      console.log('  Mit `--senden` geht dieses Opt-in den ECHTEN Weg: die alte Route legt');
      console.log('  einen Kontakt an, und im Modus `schatten` entsteht zusaetzlich eine');
      console.log('  Protokollzeile. Beides muss danach aufgeraeumt werden.');
      process.exit(0);
    }

    const antwort = await fetch(ADAPTER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'forward_typeform_adapter',
        adapter_key: 'business_leads_quiz_v1',
        target: TYPEFORM_ZIEL,
        payload: {
          ...optIn,
          hidden: { ...optIn.hidden, lead_system_v2_enabled: '1', client_seed: 'b3probe' },
        },
        meta: {
          firstName: vorname,
          email,
          lang: sprache,
          leadHash,
          sessionHash: optIn.hidden.session_hash,
          token: optIn.token,
        },
      }),
    });
    const roh = await antwort.text();
    let daten = {};
    try {
      daten = JSON.parse(roh);
    } catch {
      /* egal */
    }
    console.log('  --- Antwort des Adapters:');
    zeile('HTTP', antwort.status);
    zeile('lead_system_v2', JSON.stringify(daten.lead_system_v2_persisted || null).slice(0, 160));
    zeile('contacts_quiz', JSON.stringify(daten.contacts_quiz || null));
    zeile('Notweg', JSON.stringify(daten.contacts_quiz_rueckfall || null));
    console.log('');
    console.log(`  Zu pruefen: leads.contacts_zustellprotokoll muss jetzt EINE Zeile mit`);
    console.log(`  lead_hash = ${leadHash} und status = 'schatten' tragen.`);
    console.log('');
    process.exit(antwort.ok ? 0 : 1);
  }

  if (!SENDEN) {
    console.log('  TROCKENLAUF — es wurde NICHTS uebermittelt. Der Rumpf waere:');
    console.log('');
    console.log(JSON.stringify(rumpf, null, 2));
    console.log('');
    console.log('  Mit `--senden` wird daraus ein echter Kontakt in der Kartei,');
    console.log('  und der Post Processor verschickt Mail 1 und Mail 2 an den Berater.');
    process.exit(0);
  }

  if (!konfiguriert(process.env)) {
    console.error('  🔴 CONTACTS_QUIZ_URL oder CONTACTS_QUIZ_WEBHOOK_SECRET fehlt.');
    process.exit(2);
  }

  const antwort = await sendeAnContacts(rumpf, process.env);
  const befund = werteAntwortAus(antwort);

  console.log('  --- Antwort:');
  zeile('HTTP', antwort.status);
  zeile('Rumpf', antwort.roh.slice(0, 400));
  console.log('');
  zeile('Bewertung', befund.erfolg ? `ERFOLG (${befund.status})` : `FEHLSCHLAG: ${befund.fehler}`);
  zeile('contact_id', befund.contactId ?? '-');
  zeile('survey_id', befund.surveyId ?? '-');
  zeile('coach_member_id', befund.coachMemberId ?? '-');
  zeile('case', befund.fall ?? '-');
  console.log('');

  if (WIEDERHOLEN && befund.erfolg) {
    // 🔴 Derselbe Rumpf, dieselbe submissionId. Genau so wiederholt der Worker.
    const nochmal = await sendeAnContacts(rumpf, process.env);
    const zweite = werteAntwortAus(nochmal);
    console.log('  --- Wiederholung mit DEMSELBEN Rumpf:');
    zeile('HTTP', nochmal.status);
    zeile('duplicate', zweite.duplikat);
    zeile('contact_id', zweite.contactId ?? '-');
    zeile('survey_id', zweite.surveyId ?? '-');
    console.log('');
    if (!zweite.duplikat || zweite.contactId !== befund.contactId) {
      console.error('  🔴 BEFUND: Die Wiederholung hat KEIN Duplikat geliefert. Das heisst,');
      console.error('     die Idempotenz greift nicht — jede Worker-Wiederholung erzeugt');
      console.error('     einen zweiten Kontakt samt zweiter Mail.');
      process.exit(1);
    }
    console.log('  ✓ Die Wiederholung ist ein Duplikat mit denselben Kennungen.');
  }

  if (!befund.erfolg) process.exit(1);

  console.log('  --- Was jetzt noch zu pruefen ist (von Hand, siehe Plan B §5 und §6):');
  console.log(`    1. Post Processor nimmt die Zeile im naechsten 5-Minuten-Lauf auf und`);
  console.log(`       verschickt Mail 1 + Mail 2 — mit RICHTIGEM Profil und Ziel, nicht`);
  console.log(`       "Unbekannt". Das ist der Beweis fuer K3.`);
  console.log(`    2. Rang-Aktualisierer trifft: update_result_by_hash mit hash`);
  console.log(`       ${rumpf.meta.hash} muss matchedRows = 1 liefern.`);
  console.log(`    3. Danach die Probespuren weich loeschen (contact_id ${befund.contactId},`);
  console.log(`       survey_id ${befund.surveyId}).`);
  console.log('');
  process.exit(0);
})().catch((fehler) => {
  console.error(`  🔴 Probe nicht durchfuehrbar: ${fehler.message}`);
  process.exit(2);
});
