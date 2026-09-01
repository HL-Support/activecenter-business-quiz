// 🔴 Bei Seitenblaetterung liefert n8n MEHRERE Elemente, je Seite eines. Die alte Zeile
// nahm nur items[0].json - also nur die erste Seite. Eine Paginierung ohne diesen Fix
// haette gar nichts verbessert. flatMap deckt beide Formen ab: ein Element mit Array
// (unpaginiert) und viele Elemente mit je einem Array oder einem Objekt (paginiert).
const flach = (liste) => liste.flatMap(i => Array.isArray(i.json) ? i.json : [i.json]);
const rows = flach($input.all());
if (!rows || !rows.length) return [];

const now = Date.now();
const H24 = 24 * 60 * 60 * 1000;
const H12 = 12 * 60 * 60 * 1000;
const H48 = 48 * 60 * 60 * 1000;

// A2/B1/C1/D1 bleiben die normalen ersten Erinnerungen.
// A3/B2/C2/D2 sind jetzt vollst?ndig aktiv: 48h nach der ersten Erinnerung, tagsueber.
const ACTIVE_PHASES = ['a2', 'b1', 'c1', 'd1', 'a3', 'b2', 'c2', 'd2'];
const SECOND_PHASES = ['a3', 'b2', 'c2', 'd2'];
// The recovery send cap is applied only after contact, DNC, template, coach and resume-link validation.

let berlinHour = 10;
try {
  const hourPart = new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin', hour: '2-digit', hour12: false
  }).formatToParts(new Date()).find(part => part.type === 'hour');
  berlinHour = Number(hourPart && hourPart.value ? hourPart.value : 10);
} catch (e) {}
if (!Number.isFinite(berlinHour)) berlinHour = 10;
const secondPhaseWindowOpen = berlinHour >= 6 && berlinHour < 18;

const allEvents = flach($('Supabase - Get Test Events').all());
const testEvents = allEvents.filter(e => e.event_name === 'test_lead_marked' || e.event_name === 'test_lead_unmarked');
const sentEvents = allEvents.filter(e => e.event_name === 'nurture_sent');

// Group all sessions by person (email_normalized)
const groups = {};
for (const r of rows) {
  if (!r || !r.lead_hash) continue;
  const key = (r.email_normalized || '').toLowerCase().trim();
  if (!key) continue;
  (groups[key] = groups[key] || []).push(r);
}

// Test-lead exclusion (newest test event per lead_hash / email wins; events are event_at desc)
const testHash = {}; const testEmail = {};
for (const e of testEvents) {
  const lh = e.lead_hash;
  const em = ((e.payload && e.payload.email) || '').toLowerCase().trim();
  if (lh && !(lh in testHash)) testHash[lh] = e.event_name;
  if (em && !(em in testEmail)) testEmail[em] = e.event_name;
}
const isTestMarked = (email, sessions) =>
  testEmail[email] === 'test_lead_marked' ||
  sessions.some(s => testHash[s.lead_hash] === 'test_lead_marked');

const latestSentForPerson = (email, sessions, phase) => {
  const hashes = new Set(sessions.map(s => s.lead_hash).filter(Boolean));
  let latest = 0;
  for (const e of sentEvents) {
    const p = e.payload || {};
    const eventPhase = String(p.phase || '').toLowerCase();
    if (eventPhase !== phase) continue;
    const payloadEmail = String(p.email || p.email_normalized || '').toLowerCase().trim();
    const matches = (e.lead_hash && hashes.has(e.lead_hash)) || (payloadEmail && payloadEmail === email);
    if (!matches) continue;
    const ts = new Date(e.event_at || 0).getTime();
    if (Number.isFinite(ts) && ts > latest) latest = ts;
  }
  return latest || null;
};

// 🔴 Kontakte, die in der MySQL-Kontaktkartei geloescht wurden, duerfen KEINE Mail mehr
// bekommen. PostgreSQL fuehrt diesen Zustand nicht - die Kartei ist die Wahrheit ueber die
// Person. Belegt am 25.08.2026: 12 Mails gingen an 6 Menschen NACH ihrer Loeschung, einer
// meldete sich daraufhin selbst ab.
// Faellt die Abfrage aus, wird BEWUSST nicht versendet statt im Zweifel zu mailen.
let geloeschteHashes = new Set();
{
  const roh = $('MySQL - Geloeschte Kontakte').first().json.hashes;
  const liste = typeof roh === 'string' ? JSON.parse(roh || '[]') : (Array.isArray(roh) ? roh : []);
  geloeschteHashes = new Set(liste.filter(Boolean));
}

const results = [];
for (const email in groups) {
  const sessions = groups[email];
  // exclude test-marked leads (never send)
  if (isTestMarked(email, sessions)) continue;

  // exclude contacts deleted in the MySQL Kontaktkartei (never send)
  if (sessions.some(s => s.lead_hash && geloeschteHashes.has(s.lead_hash))) continue;

  // Rule 1: any CTA anywhere -> no video nurture
  if (sessions.some(s => s.cta_type)) continue;

  // Rule 2 + 4: highest completed_rank; tie -> newest last_seen_at
  let winner = null, maxRank = -1;
  for (const s of sessions) {
    const rank = (s.completed_rank == null) ? 0 : Number(s.completed_rank);
    if (rank > maxRank) { maxRank = rank; winner = s; }
    else if (rank === maxRank && winner) {
      const a = new Date(s.last_seen_at || 0).getTime();
      const b = new Date(winner.last_seen_at || 0).getTime();
      if (a > b) winner = s;
    }
  }
  if (!winner) continue;
  const rank = maxRank;

  // Rule 5: recipient (mautic_contact_id or email) + name + lead_hash
  const mid = (sessions.find(s => s.mautic_contact_id) || {}).mautic_contact_id || '';
  const firstName = winner.first_name || (sessions.find(s => s.first_name) || {}).first_name || '';
  if ((!mid && !email) || !firstName || !winner.lead_hash) continue;

  let phase = null;

  if (rank === 0) {
    const a2SentAt = latestSentForPerson(email, sessions, 'a2');
    const a3SentAt = latestSentForPerson(email, sessions, 'a3');
    if (a2SentAt && !a3SentAt && secondPhaseWindowOpen && (now - a2SentAt) >= H48) {
      phase = 'a3';
    } else if (!a2SentAt) {
      const ref = winner.form_submitted_at;
      if (ref && (now - new Date(ref).getTime()) >= H12) phase = 'a2';
    }
  } else if (rank === 1) {
    const b1SentAt = latestSentForPerson(email, sessions, 'b1');
    const b2SentAt = latestSentForPerson(email, sessions, 'b2');
    if (b1SentAt && !b2SentAt && secondPhaseWindowOpen && (now - b1SentAt) >= H48) {
      phase = 'b2';
    } else if (!b1SentAt) {
      const ref = winner.video1_completed_at;
      if (ref && (now - new Date(ref).getTime()) >= H24) phase = 'b1';
    }
  } else if (rank === 2) {
    const c1SentAt = latestSentForPerson(email, sessions, 'c1');
    const c2SentAt = latestSentForPerson(email, sessions, 'c2');
    if (c1SentAt && !c2SentAt && secondPhaseWindowOpen && (now - c1SentAt) >= H48) {
      phase = 'c2';
    } else if (!c1SentAt) {
      const ref = winner.video2_completed_at;
      if (ref && (now - new Date(ref).getTime()) >= H24) phase = 'c1';
    }
  } else if (rank === 3) {
    const d1SentAt = latestSentForPerson(email, sessions, 'd1');
    const d2SentAt = latestSentForPerson(email, sessions, 'd2');
    if (d1SentAt && !d2SentAt && secondPhaseWindowOpen && (now - d1SentAt) >= H48) {
      phase = 'd2';
    } else if (!d1SentAt) {
      const ref = winner.video3_completed_at;
      if (ref && (now - new Date(ref).getTime()) >= H12) phase = 'd1';
    }
  }

  if (!phase) continue;
  if (!ACTIVE_PHASES.includes(phase)) continue;

  results.push({ json: {
    mauticContactId: String(mid || ''),
    email: email,
    lead_hash: winner.lead_hash,
    phase: phase,
    completed_rank: rank,
    berater_slug: winner.berater_slug || '',
    profile_code: winner.profile_code || '',
    main_aspiration: winner.main_aspiration || '',
    initial_barrier: winner.initial_barrier || '',
    lang: winner.lang || '',
    pilot_batch: '',
    pilot_cap: null,
    pilot_interval_hours: SECOND_PHASES.includes(phase) ? 48 : null
  }});
}

return results;