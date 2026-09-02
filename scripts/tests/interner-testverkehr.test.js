/**
 * Interner Testverkehr darf keine Spuren hinterlassen, die wie ein echter Lead wirken.
 *
 * Vorfall 01.09.2026: Ein E2E-Lauf schickt `?test=1` durch den echten Funnel. Der
 * Bridge-Submit ist im Geschirr gestubt, es entsteht also KEINE Zeile in der MySQL-Kartei
 * `typeform_surveys` — /api/lead-track laeuft aber echt weiter und reihte bis dahin einen
 * `mysql_initial_rank`-Auftrag ein. Dieser Auftrag schreibt "update ... where hash =
 * <lead_hash>"; ohne Kartei-Zeile antwortet n8n mit HTTP 200 und `matchedRows: 0`, der
 * Worker wertet das als Fehler, fuenf Versuche ueber rund 1,5 Stunden, dann `dead`.
 * 19 solcher Auftraege liessen den Health-Monitor neun Mal alarmieren.
 *
 * Zweite, unentdeckte Haelfte desselben Fehlers: Ohne Testmarke war der Lead fuer den
 * Nurture-Sender (n8n RqKSRTgFv8mv04H2) von einem echten nicht zu unterscheiden — der
 * schliesst ausschliesslich ueber `test_lead_marked` aus. Zwoelf Stunden nach dem Opt-in
 * waere eine Erinnerung an `e2e-scroll@example.com` gegangen, eine reservierte Domain und
 * damit ein sicherer Hard Bounce.
 *
 * Diese Tests halten beide Haelften fest — und die Gegenprobe, dass echter Verkehr
 * unveraendert weiterlaeuft.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

// Muss VOR dem require der Handler stehen (siehe lead-api-hardening.test.js).
process.env.SUPABASE_URL = 'https://interner-testverkehr.supabase.co';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'interner-testverkehr-key';
process.env.NEW_LEAD_WRITER_ENABLED = 'true';
process.env.NEW_LEAD_WRITER_PERCENT = '100';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'interner-testverkehr-secret-interner-testverkehr';
delete process.env.LEAD_SESSION_ENFORCE;

const trackHandler = require('../../api/lead-track.js');

const LEAD_HASH = 'qz_internertestverkehr0001';

function createResponse() {
  const result = { statusCode: 200, body: null, headers: {} };
  const res = {
    setHeader(name, value) {
      result.headers[name] = value;
    },
    getHeader(name) {
      return result.headers[name];
    },
    status(code) {
      result.statusCode = code;
      return this;
    },
    json(payload) {
      result.body = payload;
      return result;
    },
    end() {
      return result;
    },
  };
  return { res, result };
}

async function withSupabaseMock(run) {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ path: String(url), method: options.method || 'GET', body: options.body || null });
    return new globalThis.Response('[]', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  try {
    return await run(calls);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function optinAbschicken(extraPayload) {
  const { res, result } = createResponse();
  await trackHandler(
    {
      method: 'POST',
      headers: {},
      body: {
        lead_hash: LEAD_HASH,
        event_name: 'form_submitted',
        payload: {
          lead_hash: LEAD_HASH,
          first_name: 'E2E Scrolltest',
          email: 'e2e-scroll@example.com',
          lang: 'de',
          ...extraPayload,
        },
      },
    },
    res
  );
  return result;
}

function eingefuegteEreignisse(calls) {
  return calls
    .filter((call) => call.path.includes('lead_events') && call.method === 'POST')
    .map((call) => JSON.parse(call.body));
}

function rangAuftraege(calls) {
  return calls
    .filter((call) => call.path.includes('rpc/enqueue_lead_sync'))
    .map((call) => JSON.parse(call.body))
    .filter((body) => body.p_sync_type === 'mysql_initial_rank');
}

test('interner Verkehr reiht KEINEN Rang-Rueckschrieb ein', async () => {
  await withSupabaseMock(async (calls) => {
    const antwort = await optinAbschicken({ is_internal_traffic: true });

    assert.equal(antwort.statusCode, 200);
    assert.deepEqual(
      rangAuftraege(calls),
      [],
      'Ohne Kartei-Zeile kann der Auftrag nie zutreffen - er darf gar nicht entstehen'
    );
  });
});

test('interner Verkehr wird beim Opt-in als Testlead markiert', async () => {
  await withSupabaseMock(async (calls) => {
    await optinAbschicken({ is_internal_traffic: true });

    const marke = eingefuegteEreignisse(calls).find(
      (ereignis) => ereignis.event_name === 'test_lead_marked'
    );
    assert.ok(marke, 'Ohne diese Marke schickt der Nurture-Sender eine Mail an die Testadresse');
    assert.equal(marke.lead_hash, LEAD_HASH);
    // Der Sender schliesst ueber payload.email die ganze Person aus, ueber lead_hash die
    // einzelne Sitzung. Beides muss gesetzt sein.
    assert.equal(marke.payload.email, 'e2e-scroll@example.com');
    assert.equal(marke.payload.reason, 'is_internal_traffic');
    // Feste Kennung -> lead_events hat on_conflict=event_uid mit ignore-duplicates,
    // ein zweiter Opt-in-Versuch desselben Laufs erzeugt also keine Dublette.
    assert.equal(marke.event_uid, `testmarke_${LEAD_HASH}`);
  });
});

test('die Marke wird als Zeichenkette "true" genauso erkannt', async () => {
  // Der Client schickt einen echten Boolean, ein handgebauter Aufruf oder ein Proxy
  // aber leicht "true" - parseBoolean deckt beides ab, und das soll so bleiben.
  await withSupabaseMock(async (calls) => {
    await optinAbschicken({ is_internal_traffic: 'true' });

    assert.deepEqual(rangAuftraege(calls), []);
    assert.ok(
      eingefuegteEreignisse(calls).some((e) => e.event_name === 'test_lead_marked')
    );
  });
});

test('echter Verkehr bleibt unveraendert: Rang-Auftrag ja, Testmarke nein', async () => {
  await withSupabaseMock(async (calls) => {
    const antwort = await optinAbschicken({ is_internal_traffic: false });

    assert.equal(antwort.statusCode, 200);
    const auftraege = rangAuftraege(calls);
    assert.equal(auftraege.length, 1, 'Der Rang-Rueckschrieb echter Leads darf nicht wegfallen');
    assert.equal(auftraege[0].p_lead_hash, LEAD_HASH);
    assert.equal(auftraege[0].p_context_data.reason, 'form_submitted');
    assert.equal(
      eingefuegteEreignisse(calls).some((e) => e.event_name === 'test_lead_marked'),
      false,
      'Ein echter Lead darf nie als Testlead markiert werden - er bekaeme sonst keine Nurture-Mail'
    );
  });
});

test('fehlendes Flag gilt als echter Verkehr', async () => {
  // Fail-safe in die richtige Richtung: Wer die Markierung vergisst, verliert keinen
  // echten Lead. Der umgekehrte Standard waere still und teuer.
  await withSupabaseMock(async (calls) => {
    await optinAbschicken({});

    assert.equal(rangAuftraege(calls).length, 1);
    assert.equal(
      eingefuegteEreignisse(calls).some((e) => e.event_name === 'test_lead_marked'),
      false
    );
  });
});
