/**
 * Tests fuer den Ein-Aufruf-Submit (Stufe A des Phase-4-Designs, 27.08.2026).
 *
 * persistBusinessSubmissionToLeadStateV2 schrieb frueher mit 7 Einzel-Calls
 * (1x lead_state-Upsert + 6x void-RPC je Antwort) - ein Abbruch mittendrin
 * hinterliess Teilzustaende. Seit Stufe A geht ALLES in einem einzigen RPC
 * submit_lead_complete, atomar in der Datenbank. Diese Tests halten fest:
 * genau EIN Call, vollstaendige Nutzlast, und Fehler laufen LAUT nach oben.
 */
const test = require('node:test');
const assert = require('node:assert');

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'test-key';

const { persistBusinessSubmissionToLeadStateV2 } = require('../../api/bridge.js');

function beispielWebhookPayload() {
  const choice = (qNr, optNr, label) => ({
    type: 'choice',
    field: { id: `F${qNr}`, ref: `lead_q${qNr}_${['drive', 'group', 'trigger', 'priority', 'future', 'barrier'][qNr - 1]}`, type: 'multiple_choice' },
    choice: { id: `C${qNr}${optNr}`, ref: `lead_q${qNr}_opt_${optNr}`, label },
  });
  return {
    form_response: {
      form_id: 'hC2yTcU8',
      submitted_at: '2026-08-27T12:00:00Z',
      hidden: { lead_hash: 'qz_stufea_unit_test_hash', lang: 'de' },
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
        { type: 'email', field: { id: 'E1', ref: 'email', type: 'email' }, email: 'unit-test@example.com' },
      ],
    },
  };
}

function mitFetchAufzeichnung(antwortJe, fn) {
  const original = globalThis.fetch;
  const aufrufe = [];
  globalThis.fetch = async (url, options = {}) => {
    aufrufe.push({ url: String(url), body: options.body ? JSON.parse(options.body) : null });
    return antwortJe(String(url));
  };
  return fn(aufrufe).finally(() => {
    globalThis.fetch = original;
  });
}

const ok = (body) => ({
  ok: true,
  status: 200,
  async text() { return JSON.stringify(body); },
  async json() { return body; },
});

test('der komplette Submit ist GENAU EIN Supabase-Call: submit_lead_complete', async () => {
  await mitFetchAufzeichnung(() => ok({ persisted: true }), async (aufrufe) => {
    const ergebnis = await persistBusinessSubmissionToLeadStateV2(
      { email: 'unit-test@example.com', first_name: 'Testperson' },
      beispielWebhookPayload()
    );
    assert.strictEqual(ergebnis.persisted, true);
    const supabaseCalls = aufrufe.filter((a) => a.url.includes('/rest/v1/'));
    assert.strictEqual(supabaseCalls.length, 1, 'genau ein Supabase-Call, keine Einzel-Upserts mehr');
    assert.ok(supabaseCalls[0].url.endsWith('/rest/v1/rpc/submit_lead_complete'));

    const body = supabaseCalls[0].body;
    assert.strictEqual(body.p_state.lead_hash, 'qz_stufea_unit_test_hash');
    assert.strictEqual(body.p_state.email, 'unit-test@example.com');
    assert.strictEqual(body.p_state.initial_barrier, 'community');
    assert.strictEqual(body.p_answers.length, 6);
    assert.deepStrictEqual(body.p_answers.map((a) => a.question_ref), ['1', '2', '3', '4', '5', '6']);
    assert.strictEqual(body.p_answers[5].answer_value, 'community');
    assert.strictEqual(body.p_lang, 'de');
    assert.strictEqual(body.p_answered_at, '2026-08-27T12:00:00Z');
  });
});

test('mitgelieferte null-Felder bleiben im Paket (merge-Semantik), undefined faellt weg', async () => {
  await mitFetchAufzeichnung(() => ok({ persisted: true }), async (aufrufe) => {
    await persistBusinessSubmissionToLeadStateV2(
      { email: 'unit-test@example.com' },
      beispielWebhookPayload()
    );
    const body = aufrufe.find((a) => a.url.includes('submit_lead_complete')).body;
    // phone kommt als null mit (ueberschreibt in der DB), organisation_id (undefined) fehlt
    assert.ok('phone' in body.p_state);
    assert.strictEqual(body.p_state.phone, null);
    assert.ok(!('organisation_id' in body.p_state));
  });
});

test('ein Datenbankfehler laeuft LAUT nach oben statt still zu versickern', async () => {
  const fehler = {
    ok: false,
    status: 400,
    async text() { return '{"message":"unknown_lead_state_columns: kaputt"}'; },
    async json() { return { message: 'unknown_lead_state_columns: kaputt' }; },
  };
  await mitFetchAufzeichnung(() => fehler, async () => {
    await assert.rejects(
      () => persistBusinessSubmissionToLeadStateV2(
        { email: 'unit-test@example.com' },
        beispielWebhookPayload()
      ),
      /unknown_lead_state_columns/
    );
  });
});

test('ohne lead_hash oder E-Mail wird gar nichts gesendet', async () => {
  await mitFetchAufzeichnung(() => ok({}), async (aufrufe) => {
    const ergebnis = await persistBusinessSubmissionToLeadStateV2({}, { form_response: { answers: [] } });
    assert.strictEqual(ergebnis.persisted, false);
    assert.strictEqual(ergebnis.reason, 'missing_lead_hash_or_email');
    assert.strictEqual(aufrufe.length, 0);
  });
});
