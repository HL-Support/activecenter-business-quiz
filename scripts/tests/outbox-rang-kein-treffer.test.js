/**
 * Wie der Outbox-Worker mit "kein Treffer in der Kartei" umgeht.
 *
 * `mysql_initial_rank` traegt den Rang per "update ... where hash = <lead_hash>" in die
 * MySQL-Kartei ein. Antwortet n8n mit HTTP 200 und `matchedRows: 0`, gibt es dort keine
 * Zeile — und das bedeutet zwei voellig verschiedene Dinge:
 *
 *   echter Lead  -> stiller Verlust. Der Berater erfaehrt nichts von ihm. Muss werfen,
 *                   wiederholen und notfalls als `dead` alarmieren. Genau dafuer gibt es
 *                   den Alarm.
 *   Testlead     -> erwarteter Ausgang. Zu ihm wurde nie eine Kartei-Zeile angelegt,
 *                   Wiederholungen aendern daran nichts. Am 01.09.2026 sind so 19
 *                   Auftraege gestorben und haben neun Alarmmails ausgeloest, ohne dass
 *                   ein einziger echter Lead betroffen war.
 *
 * Diese Tests halten die Trennlinie fest. Faellt sie, verschluckt der Worker echte
 * Verluste — der teurere der beiden Fehler.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

process.env.SUPABASE_URL = 'https://outbox-rang-test.supabase.co';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'outbox-rang-test-key';
process.env.N8N_UPDATE_RESULT_URL = 'https://n8n.example.invalid/webhook/update_result_by_hash';

const { callN8nUpdateResult } = require('../../api/lead-outbox-worker.js')._test;

const LEAD_HASH = 'qz_outboxrangtest000000001';

const JOB = {
  id: 4711,
  lead_hash: LEAD_HASH,
  sync_type: 'mysql_initial_rank',
  context_data: { rank: 0, lang: 'de', reason: 'form_submitted' },
};

/**
 * @param testMarkiert  ob leads.lead_events eine test_lead_marked-Zeile liefert
 * @param ereignisLesenFehlerhaft  laesst die Testmarken-Abfrage scheitern
 */
function mitMocks({ testMarkiert = false, ereignisLesenFehlerhaft = false } = {}) {
  const originalFetch = globalThis.fetch;
  const aufrufe = [];

  globalThis.fetch = async (url) => {
    const pfad = String(url);
    aufrufe.push(pfad);

    // Der Lead selbst: mit Kontaktdaten, damit die fruehere Weiche
    // "not_a_contact_lead" NICHT greift und wirklich der neue Zweig geprueft wird.
    if (pfad.includes('v_lead_state_full')) {
      return new globalThis.Response(
        JSON.stringify([
          {
            lead_hash: LEAD_HASH,
            email: 'e2e-scroll@example.com',
            form_submitted_at: '2026-09-01T18:25:00.000Z',
            lifecycle_stage: 'contact_known',
          },
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (pfad.includes('event_name=eq.test_lead_marked')) {
      if (ereignisLesenFehlerhaft) throw new Error('lead_events unerreichbar');
      return new globalThis.Response(JSON.stringify(testMarkiert ? [{ event_uid: 'testmarke' }] : []), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Der n8n-Rueckschrieb: 200, aber nichts getroffen — das gemessene Fehlerbild.
    if (pfad.includes('update_result_by_hash')) {
      return new globalThis.Response(
        JSON.stringify({ success: false, matchedRows: 0, updated: false, currentPointsResult: null }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new globalThis.Response('[]', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  return {
    aufrufe,
    aufraeumen() {
      globalThis.fetch = originalFetch;
    },
  };
}

test('Testlead ohne Kartei-Zeile wird uebersprungen statt zu sterben', async () => {
  const mocks = mitMocks({ testMarkiert: true });
  try {
    const ergebnis = await callN8nUpdateResult(JOB);

    assert.equal(ergebnis.success, true);
    assert.equal(ergebnis.skipped, true);
    assert.equal(ergebnis.updated, false);
    assert.equal(ergebnis.reason, 'test_lead_no_kartei_row');
    assert.equal(ergebnis.lead_hash, LEAD_HASH);
  } finally {
    mocks.aufraeumen();
  }
});

test('echter Lead ohne Kartei-Zeile schlaegt weiterhin laut fehl', async () => {
  const mocks = mitMocks({ testMarkiert: false });
  try {
    await assert.rejects(
      () => callN8nUpdateResult(JOB),
      (fehler) => {
        assert.match(fehler.message, /^n8n_update_failed:200:/);
        assert.match(fehler.message, /matchedRows/);
        return true;
      },
      'Eine fehlende Kartei-Zeile bei einem echten Lead ist der stille Verlust, den der Alarm meldet'
    );
  } finally {
    mocks.aufraeumen();
  }
});

test('ist die Testmarke nicht lesbar, gilt der Lead als echt', async () => {
  // Im Zweifel lieber ein lauter Fehlschlag als ein verschluckter Verlust.
  const mocks = mitMocks({ testMarkiert: true, ereignisLesenFehlerhaft: true });
  try {
    await assert.rejects(() => callN8nUpdateResult(JOB), /n8n_update_failed/);
  } finally {
    mocks.aufraeumen();
  }
});

test('die Testmarken-Abfrage laeuft nur nach einem Fehlschlag', async () => {
  const mocks = mitMocks({ testMarkiert: false });
  try {
    // Erfolgreicher Rueckschrieb: die zusaetzliche Abfrage darf gar nicht erst stattfinden.
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      if (String(url).includes('update_result_by_hash')) {
        return new globalThis.Response(JSON.stringify({ success: true, matchedRows: 1, updated: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return originalFetch(url, options);
    };

    const ergebnis = await callN8nUpdateResult(JOB);
    assert.equal(ergebnis.matchedRows, 1);
    assert.equal(
      mocks.aufrufe.some((pfad) => pfad.includes('event_name=eq.test_lead_marked')),
      false,
      'Im Normalfall darf der Zusatz-Lesevorgang nicht anfallen'
    );
  } finally {
    mocks.aufraeumen();
  }
});
