/** AP5-Trockenlauf: gepatchte Determine-Phase-Logik gegen synthetische Leads. */
const fs = require('fs');
const wf = JSON.parse(fs.readFileSync('d:/tmp/ap5-workflow-patched.json', 'utf8'));
const code = wf.nodes.find((n) => n.name === 'Code - Determine Phase').parameters.jsCode;

const H = 60 * 60 * 1000;
const now = Date.now();

function lauf({ rows, events = [], berlinHour = 14 }) {
  const IntlMock = {
    DateTimeFormat: function () {
      return { formatToParts: () => [{ type: 'hour', value: String(berlinHour).padStart(2, '0') }] };
    },
  };
  const wrap = (arr) => arr.map((json) => ({ json }));
  const dollar = (name) => {
    if (name === 'Supabase - Get Test Events') return { all: () => wrap(events) };
    if (name === 'MySQL - Geloeschte Kontakte') return { first: () => ({ json: { hashes: '[]' } }) };
    throw new Error('unerwarteter Node-Zugriff: ' + name);
  };
  const fn = new Function('$input', '$', 'Intl', code);
  const out = fn({ all: () => wrap(rows) }, dollar, IntlMock);
  return (out || []).map((i) => i.json.phase + ':' + i.json.email);
}

const basis = (over = {}) => ({
  lead_hash: 'h1',
  email_normalized: 'lead@example.com',
  first_name: 'Test',
  mautic_contact_id: '42',
  completed_rank: 0,
  cta_type: null,
  form_submitted_at: new Date(now - 3 * H).toISOString(),
  video1_completed_at: null,
  video2_completed_at: null,
  video3_completed_at: null,
  last_seen_at: new Date(now - H).toISOString(),
  berater_slug: 'markus',
  profile_code: 'feuer',
  main_aspiration: 'freedom',
  initial_barrier: 'vehicle',
  lang: 'de',
  ...over,
});

const faelle = [
  ['Optin 3h, kein Videostart, 14 Uhr -> a1', { rows: [basis()] }, ['a1:lead@example.com']],
  ['Optin 1h -> nichts (zu frueh)', { rows: [basis({ form_submitted_at: new Date(now - H).toISOString() })] }, []],
  ['Optin 3h MIT video_started -> nichts', { rows: [basis()], events: [{ event_name: 'video_started', lead_hash: 'h1', event_at: new Date(now - 2 * H).toISOString(), payload: {} }] }, []],
  ['Optin 13h ohne a2 -> a2 (Vorrang vor a1)', { rows: [basis({ form_submitted_at: new Date(now - 13 * H).toISOString() })] }, ['a2:lead@example.com']],
  ['a1 schon gesendet, Optin 5h -> nichts', { rows: [basis({ form_submitted_at: new Date(now - 5 * H).toISOString() })], events: [{ event_name: 'nurture_sent', lead_hash: 'h1', event_at: new Date(now - 2 * H).toISOString(), payload: { phase: 'a1', email: 'lead@example.com' } }] }, []],
  ['a1 gesendet, Optin 13h -> a2 kommt trotzdem', { rows: [basis({ form_submitted_at: new Date(now - 13 * H).toISOString() })], events: [{ event_name: 'nurture_sent', lead_hash: 'h1', event_at: new Date(now - 10 * H).toISOString(), payload: { phase: 'a1', email: 'lead@example.com' } }] }, ['a2:lead@example.com']],
  ['Optin 3h um 22 Uhr Berlin -> nichts (Fenster)', { rows: [basis()], berlinHour: 22 }, []],
  ['Optin 3h um 7 Uhr Berlin -> nichts (Fenster)', { rows: [basis()], berlinHour: 7 }, []],
  ['Optin 3h mit CTA -> nichts', { rows: [basis({ cta_type: 'call' })] }, []],
  ['Optin 3h, Testlead -> nichts', { rows: [basis()], events: [{ event_name: 'test_lead_marked', lead_hash: 'h1', event_at: new Date(now - 3 * H).toISOString(), payload: { email: 'lead@example.com' } }] }, []],
  ['rank 1, Video1 vor 25h -> b1 (Bestand unberuehrt)', { rows: [basis({ completed_rank: 1, video1_completed_at: new Date(now - 25 * H).toISOString() })] }, ['b1:lead@example.com']],
];

let rot = 0;
for (const [name, eingabe, erwartet] of faelle) {
  const ist = lauf(eingabe);
  const ok = JSON.stringify(ist) === JSON.stringify(erwartet);
  if (!ok) rot += 1;
  console.log(`${ok ? '✔' : '✖'} ${name}${ok ? '' : ` — erwartet ${JSON.stringify(erwartet)}, bekommen ${JSON.stringify(ist)}`}`);
}
console.log(rot ? `FEHLGESCHLAGEN (${rot})` : 'ALLE SZENARIEN OK');
process.exit(rot ? 1 : 0);
