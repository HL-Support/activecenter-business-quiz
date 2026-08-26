/**
 * Tests fuer den Quiz-Antworten-Extraktor (api/bridge.js).
 *
 * Hintergrund (26.08.2026): 116 Menschen hatten ein Opt-in, aber keine gespeicherten
 * Antworten in PostgreSQL - der Ereignisstrom war verloren gegangen, waehrend das
 * Opt-in-Paket alle Antworten trug. Der Extraktor liest genau dieses Paket und wird
 * vom Live-Pfad UND vom Backfill benutzt. Diese Tests decken beide Formen ab:
 * das live gebaute webhookPayload und das in MySQL gespeicherte form_response-JSON
 * (dieselbe Struktur - an echten Zeilen verifiziert).
 */
const test = require('node:test');
const assert = require('node:assert');

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'test-key';

const { extractQuizAnswersFromFormResponse, Q6_BARRIER_BY_OPT } = require('../../api/bridge.js');

// Struktur exakt dem echten form_response nachgebaut (Feld- und Choice-Form wie in
// typeform_surveys.form_response), Inhalte synthetisch.
function beispielFormResponse() {
  const choice = (qNr, optNr, label) => ({
    type: 'choice',
    field: { id: `F${qNr}`, ref: `lead_q${qNr}_${['drive', 'group', 'trigger', 'priority', 'future', 'barrier'][qNr - 1]}`, type: 'multiple_choice' },
    choice: { id: `C${qNr}${optNr}`, ref: `lead_q${qNr}_opt_${optNr}`, label },
  });
  return {
    form_id: 'hC2yTcU8',
    answers: [
      { type: 'text', field: { id: 'P1', ref: 'lead_profile_result', type: 'short_text' }, text: 'Der Netzwerker' },
      { type: 'text', field: { id: 'A1', ref: 'lead_main_aspiration', type: 'short_text' }, text: 'Wirkung' },
      choice(1, 2, 'Menschen & Begegnungen'),
      choice(2, 1, 'Der stille Beobachter'),
      choice(3, 3, 'Schlechte Energie'),
      choice(4, 2, 'Wirkung'),
      choice(5, 4, 'Sinn & Erlebnisse'),
      choice(6, 2, 'Fehlendes Umfeld'),
      { type: 'text', field: { id: 'N1', ref: 'first_name', type: 'short_text' }, text: 'Testperson' },
      { type: 'email', field: { id: 'E1', ref: 'email', type: 'email' }, email: 'test@example.com' },
    ],
  };
}

test('vollstaendiger Durchlauf: 6 Antworten im Schema des Ereignispfads', () => {
  const e = extractQuizAnswersFromFormResponse(beispielFormResponse());
  assert.strictEqual(e.quizAnswers.length, 6);
  // Schema des Ereignispfads: question_ref '1'..'6', Index 1-basiert - am 26.08. an
  // echten Zeilen von lead_answers_current verifiziert. Eine zweite Zeilenwelt in
  // derselben Tabelle waere ein neues Auseinanderlaufen.
  assert.deepStrictEqual(e.quizAnswers.map((a) => a.question_ref), ['1', '2', '3', '4', '5', '6']);
  assert.deepStrictEqual(e.quizAnswers.map((a) => a.question_index), [1, 2, 3, 4, 5, 6]);
  assert.strictEqual(e.quizAnswers[0].answer_text, 'Menschen & Begegnungen');
  assert.strictEqual(e.quizAnswers[0].answer_ref, 'lead_q1_opt_2');
});

test('Barriere kommt kanonisch aus der Optionsposition, nicht aus dem Text', () => {
  const e = extractQuizAnswersFromFormResponse(beispielFormResponse());
  // opt_2 = community, unabhaengig von der Sprache des Labels
  assert.strictEqual(e.barrier, 'community');
  assert.strictEqual(e.quizAnswers[5].answer_value, 'community');
});

test('die Q6-Zuordnung ist vollstaendig und fest', () => {
  assert.deepStrictEqual(Q6_BARRIER_BY_OPT, {
    lead_q6_opt_1: 'vehicle',
    lead_q6_opt_2: 'community',
    lead_q6_opt_3: 'confidence',
    lead_q6_opt_4: 'opportunity',
  });
});

test('Profil- und Ziel-Label werden herausgezogen, Name und E-Mail nicht als Antworten', () => {
  const e = extractQuizAnswersFromFormResponse(beispielFormResponse());
  assert.strictEqual(e.profileLabel, 'Der Netzwerker');
  assert.strictEqual(e.aspirationLabel, 'Wirkung');
  assert.ok(e.quizAnswers.every((a) => !['first_name', 'email'].includes(a.question_ref)));
});

test('italienische Labels aendern die Kanonik nicht', () => {
  const fr = beispielFormResponse();
  fr.answers[7].choice.label = 'Mancanza di ambiente';
  const e = extractQuizAnswersFromFormResponse(fr);
  assert.strictEqual(e.barrier, 'community');
  assert.strictEqual(e.quizAnswers[5].answer_text, 'Mancanza di ambiente');
});

test('Fremd-Quiz (Landing Page Business, 3 Antworten ohne lead_q-Refs) liefert leer', () => {
  // Genau die Struktur des alten Nebeneingangs vom 17.08. (Can): nur Name, E-Mail und
  // ein Tierprofil - kein einziges lead_q-Feld. Der Extraktor darf daraus nichts erfinden.
  const e = extractQuizAnswersFromFormResponse({
    answers: [
      { type: 'text', field: { id: 'X1', ref: 'first_name' }, text: 'Can' },
      { type: 'email', field: { id: 'X2', ref: 'email' }, email: 'x@example.com' },
      { type: 'text', field: { id: 'X3', ref: 'lead_profile_result' }, text: 'wal' },
    ],
  });
  assert.strictEqual(e.quizAnswers.length, 0);
  assert.strictEqual(e.barrier, null);
  assert.strictEqual(e.profileLabel, 'wal');
});

test('fehlende Frage 6 laesst die Barriere leer statt zu raten', () => {
  const fr = beispielFormResponse();
  fr.answers = fr.answers.filter((a) => a.field.ref !== 'lead_q6_barrier');
  const e = extractQuizAnswersFromFormResponse(fr);
  assert.strictEqual(e.quizAnswers.length, 5);
  assert.strictEqual(e.barrier, null);
});

test('kaputte Eingaben stuerzen nicht ab', () => {
  for (const eingabe of [null, undefined, {}, { answers: null }, { answers: [{}] }, { answers: [{ field: {} }] }]) {
    const e = extractQuizAnswersFromFormResponse(eingabe);
    assert.deepStrictEqual(e.quizAnswers, []);
    assert.strictEqual(e.barrier, null);
  }
});
