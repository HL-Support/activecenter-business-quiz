/**
 * Regressionstest fuer supabaseRpc in api/bridge.js.
 *
 * Hintergrund (27.08.2026): upsert_answer_current ist RETURNS void - PostgREST
 * antwortet darauf mit leerem Body. Die Bridge-Kopie von supabaseRpc rief darauf
 * bedingungslos response.json() auf ("Unexpected end of JSON input") und riss damit
 * die persistQuizAnswers-Schleife nach der ERSTEN Antwort ab: Antworten 2-6 wurden
 * nie gesendet. Sichtbar wurde das nur, weil der Opt-in-Pfad seit dem 26.08. Fehler
 * meldet statt zu schweigen; real verloren (nur MySQL, nicht PG) war qz_786f83eeb.
 * Die Fassung in server/lead-system.js hatte den 204-Guard immer - diese Tests
 * halten beide Verhalten gleich.
 */
const test = require('node:test');
const assert = require('node:assert');

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'test-key';

const { supabaseRpc } = require('../../api/bridge.js');

function mitFetchStub(response, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = async () => response;
  return fn().finally(() => {
    globalThis.fetch = original;
  });
}

test('void-RPC mit 204 und leerem Body liefert null statt Parse-Fehler', async () => {
  await mitFetchStub(new Response(null, { status: 204 }), async () => {
    assert.strictEqual(await supabaseRpc('upsert_answer_current', { p_lead_hash: 'x' }), null);
  });
});

test('200 mit leerem Body (aeltere PostgREST-Varianten) liefert ebenfalls null', async () => {
  await mitFetchStub(new Response('', { status: 200 }), async () => {
    assert.strictEqual(await supabaseRpc('upsert_answer_current', { p_lead_hash: 'x' }), null);
  });
});

test('RPC mit Rueckgabewert wird weiterhin geparst', async () => {
  const body = JSON.stringify([{ completed_rank: 3, rank_changed: true }]);
  await mitFetchStub(new Response(body, { status: 200 }), async () => {
    const rows = await supabaseRpc('upsert_video_progress_monotonic', {});
    assert.deepStrictEqual(rows, [{ completed_rank: 3, rank_changed: true }]);
  });
});

test('Fehlstatus wirft weiterhin einen Fehler mit Status im Text', async () => {
  await mitFetchStub(new Response('kaputt', { status: 500 }), async () => {
    await assert.rejects(
      () => supabaseRpc('upsert_answer_current', {}),
      /500/
    );
  });
});
