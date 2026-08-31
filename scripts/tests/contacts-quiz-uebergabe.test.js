'use strict';

/**
 * Strang B / B3 — die Uebergabe an contacts `/webhook/quiz`.
 *
 * Was diese Datei bewacht:
 *   1. Der Standard ist `aus`. Ein Deploy ohne Umgebungsvariablen aendert NICHTS.
 *   2. Feldparitaet: Was heute im Typeform-Payload steht, steht auch im Vertragspayload.
 *   3. fail-closed: ohne Adresse oder Geheimnis wird nicht gesendet — auch nicht ersatzweise.
 *   4. Signatur und Rumpf gehoeren zusammen: signiert wird GENAU die gesendete Zeichenkette.
 *   5. Ein 2xx ohne `contact_id` ist ein Fehlschlag.
 *   6. Der Protokolleintrag entsteht aus dem eingefrorenen Payload — nicht aus Feldern,
 *      die dort gar nicht (mehr) stehen. Das ist die Lehre aus dem Vorbild, wo das
 *      Protokoll einen Tag lang blind war.
 *   7. Die SQL-Objekte tun, was der Vertrag verlangt (Idempotenz, Rueckweg, Rechte).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const {
  MODI,
  REGISTRY_SCHLUESSEL,
  SIGNATUR_KOPF,
  konfiguriert,
  modus,
  pruefeVertrag,
  sendeAnContacts,
  signiere,
  werteAntwortAus,
  wirksamerModus,
} = require('../../server/legacy/kontakte');

const { buildBusinessTypeformPayload, buildContactsQuizPayload } = require('../../api/bridge');

const wurzel = path.resolve(__dirname, '../..');

// Ein Opt-in in genau der Form, die src/lib/core.js an `forward_typeform_adapter` schickt.
// Die Antworten sind ueber ihre WERTE gewaehlt (R/G/B, Aspiration, Barriere), nicht ueber
// uebersetzte Labels — so misst der Test die Zuordnung und nicht sich selbst.
function optIn(zusatz = {}) {
  return {
    first_name: 'anna',
    email: 'Anna@Example.COM',
    token: 'tf7m2probe',
    event_id: 'EVT123',
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
    landed_at: '2026-08-31T09:00:00.000Z',
    submitted_at: '2026-08-31T09:04:12.000Z',
    utm_source: 'facebook',
    utm_medium: 'paid',
    fbc: 'fb.1.123.456',
    hidden: {
      c: 'at',
      hash: 'qz_a1b2c3d4e5f6g7h8i9j0k1l2',
      lead_hash: 'qz_a1b2c3d4e5f6g7h8i9j0k1l2',
      session_hash: 'ac_sitzung123',
      lang: 'de',
      berater_slug: 'markus',
      slug: 'markus',
      member_id: '25851739',
      ref_id: '25851739',
      survey_id: '12',
      utm_source: 'facebook',
      utm_medium: 'paid',
      fbc: 'fb.1.123.456',
    },
    ...zusatz,
  };
}

// ---------------------------------------------------------------------------------------
// 1. Der Schalter
// ---------------------------------------------------------------------------------------

test('der Standard ist aus — ohne Umgebungsvariablen aendert sich nichts', () => {
  assert.equal(modus({}), 'aus');
  assert.equal(modus({ CONTACTS_QUIZ_MODUS: '' }), 'aus');
  // Unbekanntes wird NICHT wohlwollend gedeutet.
  assert.equal(modus({ CONTACTS_QUIZ_MODUS: 'scharf' }), 'aus');
  assert.equal(modus({ CONTACTS_QUIZ_MODUS: 'AN' }), 'an');
  assert.deepEqual(MODI, ['aus', 'schatten', 'an']);
});

test('Modus an ohne Adresse oder Geheimnis faellt auf den alten Weg zurueck', () => {
  const ohne = wirksamerModus({ CONTACTS_QUIZ_MODUS: 'an' });
  assert.equal(ohne.modus, 'aus');
  assert.equal(ohne.gewuenscht, 'an');
  assert.equal(ohne.grund, 'env_missing');

  const halb = wirksamerModus({
    CONTACTS_QUIZ_MODUS: 'an',
    CONTACTS_QUIZ_URL: 'https://contacts.example/webhook/quiz',
  });
  assert.equal(halb.modus, 'aus', 'Adresse ohne Geheimnis reicht nicht');

  const ganz = wirksamerModus({
    CONTACTS_QUIZ_MODUS: 'an',
    CONTACTS_QUIZ_URL: 'https://contacts.example/webhook/quiz',
    CONTACTS_QUIZ_WEBHOOK_SECRET: 'geheim',
  });
  assert.equal(ganz.modus, 'an');
  assert.equal(ganz.grund, null);
  assert.equal(konfiguriert({}), false);
});

test('der Schattenlauf braucht kein Geheimnis — er sendet nie', () => {
  const schatten = wirksamerModus({ CONTACTS_QUIZ_MODUS: 'schatten' });
  assert.equal(schatten.modus, 'schatten');
  assert.equal(schatten.grund, null);
});

// ---------------------------------------------------------------------------------------
// 2. Feldparitaet gegen den heute gesendeten Payload
// ---------------------------------------------------------------------------------------

test('der Vertragspayload traegt jede Antwort, die auch der Typeform-Payload traegt', () => {
  const eingabe = optIn();
  const typeform = buildBusinessTypeformPayload(eingabe);
  const vertrag = buildContactsQuizPayload(eingabe, typeform);

  const tfAuswahl = typeform.form_response.answers
    .filter((a) => a.type === 'choice')
    .map((a) => a.choice.label);
  const vertragAuswahl = vertrag.answers
    .filter((a) => /^q[1-6]$/.test(a.key))
    .map((a) => a.answer);

  assert.equal(tfAuswahl.length, 6, 'alle sechs Fragen sind beantwortet');
  assert.deepEqual(vertragAuswahl, tfAuswahl);

  // Profil und Ziel stehen im alten Payload als Textantworten.
  const tfText = typeform.form_response.answers.filter((a) => a.type === 'text').map((a) => a.text);
  assert.ok(tfText.includes('Der Macher'));
  assert.equal(vertrag.answers.find((a) => a.key === 'profile').answer, 'Der Macher');
  assert.equal(
    vertrag.answers.find((a) => a.key === 'main_aspiration').answer,
    tfText.find((t) => t === 'Freiheit')
  );
});

test('die Werte sind sprachneutral, die Antworten uebersetzt', () => {
  const vertrag = (lang) => {
    const eingabe = optIn({ hidden: { ...optIn().hidden, lang } });
    return buildContactsQuizPayload(eingabe, buildBusinessTypeformPayload(eingabe));
  };

  const de = vertrag('de');
  const it = vertrag('it');

  const werte = (v) => v.answers.map((a) => a.values.join('|'));
  assert.deepEqual(werte(de), werte(it), 'die Werte haengen nicht an der Sprache');
  assert.deepEqual(werte(de), ['feuer', 'freedom', 'R', 'G', 'B', 'freedom', 'growth', 'confidence']);

  const labels = (v) => v.answers.map((a) => a.answer);
  assert.notDeepEqual(labels(de), labels(it), 'die Anzeige dagegen schon');
});

test('meta traegt alles, was der Vertrag verlangt — und den Registry-Schluessel der Gegenstelle', () => {
  const eingabe = optIn();
  const vertrag = buildContactsQuizPayload(eingabe, buildBusinessTypeformPayload(eingabe));

  // K1: die Gegenstelle liest meta.survey. Ein meta.quiz wuerde sie mit 422 abweisen.
  assert.equal(vertrag.meta.survey, REGISTRY_SCHLUESSEL);
  assert.equal(vertrag.meta.quiz, undefined);

  assert.equal(vertrag.meta.hash, 'qz_a1b2c3d4e5f6g7h8i9j0k1l2');
  assert.equal(vertrag.meta.sessionHash, 'ac_sitzung123');
  assert.equal(vertrag.meta.memberId, '25851739');
  assert.equal(vertrag.meta.refId, '25851739');
  assert.equal(vertrag.meta.slug, 'markus');
  assert.equal(vertrag.meta.language, 'de');
  assert.equal(vertrag.meta.country, 'AT');
  assert.equal(vertrag.meta.token, 'tf7m2probe');
  assert.equal(vertrag.meta.submittedAt, '2026-08-31T09:04:12.000Z');
  assert.equal(vertrag.meta.startedAt, '2026-08-31T09:00:00.000Z');

  // Die fuenf, die contacts heute noch nicht nach hidden spiegelt (Korrektur K3). Sie
  // muessen trotzdem mitreisen — ohne sie kann die Gegenstelle die Luecke nicht schliessen.
  assert.equal(vertrag.meta.profileCode, 'feuer');
  assert.equal(vertrag.meta.profileLabel, 'Der Macher');
  assert.equal(vertrag.meta.mainAspiration, 'freedom');
  assert.equal(vertrag.meta.mainAspirationLabel, 'Freiheit');
  assert.equal(vertrag.meta.barrier, 'confidence');

  // 🔴 Der Schluessel entsteht in der Datenbank, nicht hier. Wuerde er hier je Versuch
  // erzeugt, erzeugte jede Wiederholung einen zweiten Kontakt.
  assert.equal(vertrag.meta.submissionId, null);

  assert.equal(vertrag.contact.firstName, 'Anna', 'Namen werden normalisiert');
  assert.equal(vertrag.contact.email, 'anna@example.com', 'Adressen kleingeschrieben');
  assert.equal(vertrag.contact.gender, 'undisclosed', 'das Quiz erhebt kein Geschlecht');

  assert.equal(vertrag.attribution.utm_source, 'facebook');
  assert.equal(vertrag.attribution.fbc, 'fb.1.123.456');
  assert.equal(vertrag.attribution.utm_term, undefined, 'leere Felder reisen nicht mit');
});

test('eine nicht zuordenbare Antwort faellt in BEIDEN Payloads weg — nie nur in einem', () => {
  const eingabe = optIn({
    selected_answers: [{ type: 'R' }, { type: 'gibtesnicht' }, { type: 'B' }],
  });
  const typeform = buildBusinessTypeformPayload(eingabe);
  const vertrag = buildContactsQuizPayload(eingabe, typeform);

  const tfAuswahl = typeform.form_response.answers.filter((a) => a.type === 'choice');
  const vertragAuswahl = vertrag.answers.filter((a) => /^q[1-6]$/.test(a.key));
  assert.equal(tfAuswahl.length, 2);
  assert.equal(vertragAuswahl.length, 2);
  assert.deepEqual(
    vertragAuswahl.map((a) => a.key),
    ['q1', 'q3']
  );
});

// ---------------------------------------------------------------------------------------
// 3. Die Vertragspruefung vor dem Senden
// ---------------------------------------------------------------------------------------

test('pruefeVertrag nennt das fehlende Feld, statt einen halben Rumpf zu senden', () => {
  const eingabe = optIn();
  const vollstaendig = buildContactsQuizPayload(eingabe, buildBusinessTypeformPayload(eingabe));
  assert.equal(pruefeVertrag(vollstaendig), vollstaendig);

  const ohneHash = JSON.parse(JSON.stringify(vollstaendig));
  ohneHash.meta.hash = '';
  assert.throws(() => pruefeVertrag(ohneHash), /vertrag_unvollstaendig:meta\.hash/);

  const ohneEmail = JSON.parse(JSON.stringify(vollstaendig));
  ohneEmail.contact.email = '';
  assert.throws(() => pruefeVertrag(ohneEmail), /contact\.email/);

  const ohneAntworten = JSON.parse(JSON.stringify(vollstaendig));
  ohneAntworten.answers = [];
  assert.throws(() => pruefeVertrag(ohneAntworten), /answers/);
});

// ---------------------------------------------------------------------------------------
// 4. Signieren und Senden
// ---------------------------------------------------------------------------------------

test('signiert wird GENAU die Zeichenkette, die auch gesendet wird', async () => {
  const env = {
    CONTACTS_QUIZ_URL: 'https://contacts.example/webhook/quiz',
    CONTACTS_QUIZ_WEBHOOK_SECRET: 'ein-geheimnis',
  };
  const rumpf = { meta: { survey: REGISTRY_SCHLUESSEL }, contact: {}, answers: [] };

  let gesehen = null;
  const holer = async (adresse, optionen) => {
    gesehen = { adresse, optionen };
    return { ok: true, status: 200, text: async () => '{"contact_id":7,"survey_id":9}' };
  };

  const antwort = await sendeAnContacts(rumpf, env, holer);

  assert.equal(gesehen.adresse, env.CONTACTS_QUIZ_URL);
  assert.equal(gesehen.optionen.method, 'POST');

  const erwartet =
    'sha256=' +
    crypto
      .createHmac('sha256', env.CONTACTS_QUIZ_WEBHOOK_SECRET)
      .update(gesehen.optionen.body, 'utf8')
      .digest('base64');
  assert.equal(gesehen.optionen.headers[SIGNATUR_KOPF], erwartet);
  assert.equal(gesehen.optionen.headers[SIGNATUR_KOPF], signiere(gesehen.optionen.body, env.CONTACTS_QUIZ_WEBHOOK_SECRET));
  assert.equal(antwort.gesendet, gesehen.optionen.body);
  assert.equal(antwort.daten.contact_id, 7);
});

test('ohne Adresse oder Geheimnis wird NICHT gesendet — auch nicht ersatzweise', async () => {
  let versuche = 0;
  const holer = async () => {
    versuche += 1;
    return { ok: true, status: 200, text: async () => '{}' };
  };

  await assert.rejects(() => sendeAnContacts({}, {}, holer), /env_missing/);
  await assert.rejects(
    () => sendeAnContacts({}, { CONTACTS_QUIZ_URL: 'https://contacts.example/x' }, holer),
    /env_missing/
  );
  assert.equal(versuche, 0, 'kein einziger Aufruf ohne Geheimnis');
});

test('signiere verweigert ein leeres Geheimnis', () => {
  assert.throws(() => signiere('{}', ''), /env_missing/);
});

// ---------------------------------------------------------------------------------------
// 5. Die Antwort auswerten
// ---------------------------------------------------------------------------------------

test('ein 2xx OHNE contact_id ist ein Fehlschlag, kein Erfolg', () => {
  const befund = werteAntwortAus({ ok: true, status: 200, daten: { message: 'Submitted' } });
  assert.equal(befund.erfolg, false);
  assert.equal(befund.status, 'failed');
  assert.equal(befund.fehler, 'contacts_2xx_ohne_kennung');
});

test('Erfolg traegt Kennungen, Fall und den aufgeloesten Berater', () => {
  const befund = werteAntwortAus({
    ok: true,
    status: 200,
    daten: {
      message: 'Submitted',
      duplicate: false,
      case: 'fremder_kontakt_bleibt',
      contact_id: 123,
      survey_id: 456,
      coach_member_id: '25851739',
    },
  });
  assert.equal(befund.erfolg, true);
  assert.equal(befund.duplikat, false);
  assert.equal(befund.status, 'success');
  assert.equal(befund.contactId, 123);
  assert.equal(befund.surveyId, 456);
  assert.equal(befund.coachMemberId, '25851739');
  assert.equal(befund.fall, 'fremder_kontakt_bleibt');
});

test('das Duplikat ist ein Erfolg — und traegt bekanntermassen keinen Berater mehr', () => {
  const befund = werteAntwortAus({
    ok: true,
    status: 200,
    daten: { message: 'Already submitted', duplicate: true, contact_id: 123, survey_id: 456 },
  });
  assert.equal(befund.erfolg, true);
  assert.equal(befund.duplikat, true);
  assert.equal(befund.status, 'duplicate');
  assert.equal(befund.coachMemberId, null);
});

test('401, 422 und 503 sind Fehlschlaege mit lesbarem Grund', () => {
  for (const [status, meldung] of [
    [401, 'Invalid signature'],
    [422, 'meta.survey is unknown'],
    [503, 'Quiz webhook secret is not configured'],
  ]) {
    const befund = werteAntwortAus({ ok: false, status, daten: { message: meldung } });
    assert.equal(befund.erfolg, false);
    assert.equal(befund.status, 'failed');
    assert.match(befund.fehler, new RegExp(`contacts_http_${status}`));
    assert.match(befund.fehler, new RegExp(meldung.split(' ')[0]));
  }
});

// ---------------------------------------------------------------------------------------
// 6. Der Protokolleintrag entsteht aus dem eingefrorenen Payload
//
// 🔴 Die Lehre des Vorbilds: Dort war das Protokoll einen Tag lang blind, weil es ein Feld
// las, das der Payload nicht mehr trug. Dieser Test laesst die Protokollfelder aus einem
// ECHTEN Payload entstehen — wandert eines davon, faellt es hier auf und nicht im Betrieb.
// ---------------------------------------------------------------------------------------

test('jedes Protokollfeld ist aus dem eingefrorenen Payload lesbar', () => {
  const eingabe = optIn();
  const vertrag = buildContactsQuizPayload(eingabe, buildBusinessTypeformPayload(eingabe));

  // So friert die Datenbank den Auftrag ein (sql/contacts-quiz-uebergabe.sql).
  const submissionId = '3f2b6c9e-1111-4222-8333-444444444444';
  const auftrag = {
    id: 4711,
    lead_hash: vertrag.meta.hash,
    sync_type: 'contacts_quiz_submission',
    context_data: {
      submission_id: submissionId,
      payload: { ...vertrag, meta: { ...vertrag.meta, submissionId } },
    },
  };

  // Exakt die Griffe, die api/lead-outbox-worker.js benutzt.
  const rumpf = auftrag.context_data.payload;
  assert.equal(auftrag.context_data.submission_id, rumpf.meta.submissionId);
  assert.equal(rumpf.meta.memberId, '25851739');
  assert.equal(rumpf.contact.firstName, 'Anna');
  assert.equal(rumpf.contact.email, 'anna@example.com');
  assert.equal(auftrag.lead_hash, rumpf.meta.hash);

  const quelle = fs.readFileSync(path.join(wurzel, 'api/lead-outbox-worker.js'), 'utf8');
  for (const griff of [
    'rumpf.meta.memberId',
    'rumpf.contact?.firstName',
    'rumpf.contact?.email',
    'rumpf.meta.submissionId',
  ]) {
    assert.ok(quelle.includes(griff), `der Worker liest ${griff}`);
  }
});

test('der Worker sendet nie einen Rumpf, dessen Schluessel nicht zum Auftrag passt', () => {
  const quelle = fs.readFileSync(path.join(wurzel, 'api/lead-outbox-worker.js'), 'utf8');
  assert.match(quelle, /contacts_quiz_submission_id_uneinig/);
  // fail-closed: der Worker kennt keinen Ersatzweg.
  assert.match(quelle, /env_missing:CONTACTS_QUIZ_URL_ODER_SECRET/);
  // Protokollzeile VOR dem Senden.
  const vorher = quelle.indexOf('protokolliere_contacts_quiz_versuch');
  const senden = quelle.indexOf('await sendeAnContacts(');
  assert.ok(vorher > 0 && senden > vorher, 'protokolliert wird vor dem Senden');
});

// ---------------------------------------------------------------------------------------
// 7. Die SQL-Objekte
// ---------------------------------------------------------------------------------------

test('die Einreihung erzeugt den Schluessel genau einmal und friert den Rumpf ein', () => {
  const sql = fs.readFileSync(path.join(wurzel, 'sql/contacts-quiz-uebergabe.sql'), 'utf8');

  assert.match(sql, /SET ROLE leads_owner/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS leads\.contacts_zustellprotokoll/);
  assert.match(sql, /submission_id\s+uuid\s+NOT NULL UNIQUE/);
  // Ohne diese beiden Spalten haengt Strang M in der Luft.
  assert.match(sql, /coach_member_id text/);
  assert.match(sql, /fall\s+text/);

  assert.match(sql, /CREATE OR REPLACE FUNCTION leads\.reihe_contacts_quiz_ein/);
  assert.match(sql, /pg_advisory_xact_lock\(hashtext\('contacts_quiz_submission:'/);
  // SELECT vor INSERT — sonst entstuende bei einem Doppelklick ein zweiter Auftrag.
  const auswahl = sql.indexOf('FROM leads.lead_sync_outbox');
  const einfuegen = sql.indexOf('INSERT INTO leads.lead_sync_outbox');
  assert.ok(auswahl > 0 && einfuegen > auswahl, 'erst suchen, dann einfuegen');
  assert.match(sql, /v_sub := gen_random_uuid\(\)/);
  assert.match(sql, /jsonb_set\(p_payload, '\{meta,submissionId\}'/);

  // Der Zaehler zaehlt hoch, statt den frueheren Versuch zu ueberschreiben.
  assert.match(sql, /attempt_count\s+= z\.attempt_count \+ 1/);
  // Ein spaeterer Versuch loescht einen frueheren Beweis nicht.
  assert.match(sql, /contact_id\s+= COALESCE\(p_contact_id, contact_id\)/);

  // Der Schattenlauf sendet nie — er hat gar keine Sendefunktion, nur eine Protokollzeile.
  assert.match(sql, /'schatten'/);

  // Rechte und Rueckweg stehen in der Datei.
  assert.match(sql, /GRANT EXECUTE ON FUNCTION leads\.reihe_contacts_quiz_ein\(text, jsonb, int\) TO leads_app/);
  assert.match(sql, /DROP TABLE leads\.contacts_zustellprotokoll/);
  assert.doesNotMatch(sql, /DROP TABLE (?!leads\.contacts_zustellprotokoll)/);
});

test('der Adapter bleibt im Standardfall Zeichen fuer Zeichen der alte Weg', () => {
  const quelle = fs.readFileSync(path.join(wurzel, 'api/bridge.js'), 'utf8');

  // Der alte Weg ist unangetastet vorhanden.
  assert.match(quelle, /action: 'forward_webhook'/);
  // Der Modus ist ausschliessend: gesendet wird ueber die alte Route, SOLANGE nicht `an`.
  assert.match(quelle, /const ueberAlteRoute = contactsModus !== 'an'/);
  // Der Vertragspayload wird im Modus `aus` gar nicht erst gebaut.
  assert.match(quelle, /if \(contactsModus !== 'aus'\) \{/);
  // Eingereiht wird NACH lead_state — der Auftrag verweist per Fremdschluessel darauf.
  const lead = quelle.indexOf('leadSystemV2Persisted = await persistBusinessSubmissionToLeadStateV2');
  const einreihen = quelle.indexOf("supabaseRpc('reihe_contacts_quiz_ein'");
  assert.ok(lead > 0 && einreihen > lead, 'erst lead_state, dann einreihen');
});

test('🔴 kein Lead geht verloren: scheitert der neue Weg vor dem Einreihen, greift der Notweg', () => {
  const quelle = fs.readFileSync(path.join(wurzel, 'api/bridge.js'), 'utf8');

  // Alle drei Fehlerklassen vor dem Einreihen fuehren auf den Notweg, nicht in einen 502.
  for (const grund of [
    'payload_unvollstaendig',
    'lead_state_fehlt',
    'einreihen_fehlgeschlagen',
  ]) {
    assert.match(quelle, new RegExp(`contactsQuizRueckfall = \`${grund}`));
  }

  // Der Notweg ist DIESELBE Funktion wie der Normalweg — kein zweiter Sendepfad.
  assert.match(quelle, /const sendeUeberAlteRoute = \(\) =>/);
  assert.match(quelle, /const nachgeholt = await sendeUeberAlteRoute\(\)/);

  // 🔴 Und er greift erst nach einer Wiederholung der Einreihung: Eine bereits
  // eingereihte Uebermittlung, deren Antwort verlorenging, wuerde sonst ein zweites Mal
  // gesendet. Die Einreihung ist je lead_hash idempotent, der zweite Anlauf findet sie.
  assert.match(quelle, /versuch <= 2 && !contactsQuizAuftrag/);

  // Kein 502 mehr auf diesen drei Wegen — der Browser bekaeme sonst „nicht abgesendet"
  // fuer ein Opt-in, das sehr wohl haette ankommen koennen.
  assert.doesNotMatch(quelle, /error: 'contacts_quiz_lead_state_fehlt'/);
  assert.doesNotMatch(quelle, /error: 'contacts_quiz_einreihen_fehlgeschlagen'/);
  assert.doesNotMatch(quelle, /error: 'contacts_quiz_payload_unvollstaendig'/);
});
