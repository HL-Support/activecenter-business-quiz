const test = require('node:test');
const assert = require('node:assert/strict');

const { uebersetze } = require('../../server/postgrest-nach-sql.js');

// Beweis für UMZUG-COOLIFY-POSTGRES.md §5 Schritt 1: ALLE Abfragen des Business-
// Kalkulators übersetzen fehlerfrei. Die Strings hier sind keine Nachbauten, sondern
// zeichengleich zu den Aufrufstellen in Business_Kalkulator/api/contacts.js und
// api/sso.js (Stand 28.08.2026), mit realistischen Beispielwerten an den Stellen,
// die dort zur Laufzeit eingesetzt werden.
//
// Wichtigster Fund dieser Messung: Die Kontaktliste nutzt neben email=not.is.null und
// offset AUCH or=(…) aus coachPostgrestFilter (contact-domain.js:142). Diese dritte
// Lücke war in der Messung vom 28.08. unsichtbar, weil der Übersetzer schon am
// not.-Filter davor scheiterte.

const CRM_SELECT_FIELDS = [
  'lead_hash', 'member_id', 'berater_slug', 'manual_added', 'linked_herbalife_id',
  'linked_user_id', 'linked_name', 'linked_email', 'linked_at', 'target_call_done',
  'hom_done', 'wellness_check_done', 'herbalife_registered', 'herbalife_registered_at',
  'not_interested', 'support_signup_done', 'subscription_done', 'starter_video_1_done',
  'starter_video_2_done', 'starter_video_3_done', 'starter_video_4_done',
  'contact_list_done', 'first_check_done', 'reminder_active', 'reminder_at',
  'reminder_subject', 'notes', 'updated_at',
].join(',');

const LEAD_SELECT_FIELDS = [
  'lead_hash', 'organisation_id', 'member_id', 'ref_id', 'berater_slug', 'created_at',
  'form_submitted_at', 'last_event_at', 'first_name', 'email', 'email_normalized',
  'profile_code', 'profile_label', 'main_aspiration', 'main_aspiration_label',
  'initial_barrier', 'video1_max_pct', 'video2_max_pct', 'video3_max_pct',
  'completed_rank', 'cta_type', 'cta_clicked_at', 'utm_medium',
].join(',');

// compactInFilter quotet jeden Wert - genau so kommt der Filter beim Übersetzer an.
const IN_FILTER = '"qz_abc123","qz_def456"';

// coachPostgrestFilter für den Sonderfall markus - die längste Form, die vorkommt.
const COACH_FILTER = 'or=(berater_slug.eq.markus,member_id.in.(25851739,25297671),ref_id.in.(25851739,25297671))';

const ABFRAGEN = [
  ['Historie: Lead-Kopf', `v_lead_state_full?select=lead_hash,member_id,ref_id,berater_slug,created_at,form_submitted_at,first_seen_at,last_seen_at,last_event_at,first_name,email,email_normalized,profile_label,main_aspiration_label,completed_rank,cta_type,cta_clicked_at&lead_hash=eq.qz_abc123&limit=1`],
  ['Historie: verwandte Leads (email_normalized)', `v_lead_state_full?select=lead_hash,member_id,ref_id,berater_slug,email,email_normalized,cta_type,cta_clicked_at&email_normalized=eq.max%40beispiel.de&order=created_at.desc&limit=20`],
  ['Historie: verwandte Leads (email)', `v_lead_state_full?select=lead_hash,member_id,ref_id,berater_slug,email,email_normalized,cta_type,cta_clicked_at&email=eq.max%40beispiel.de&order=created_at.desc&limit=20`],
  ['Historie: Events', `lead_events?select=lead_hash,event_name,event_at,video_step,unique_watched_percent,playhead_percent,payload&lead_hash=in.(${IN_FILTER})&event_name=in.(nurture_sent,nurture_resume_opened,video_completed,result_cta_click,cta_clicked,hot_lead_coach_email_sent,video_all_completed_coach_email_sent)&order=event_at.asc&limit=300`],
  ['Historie: Video-Fortschritt', `lead_video_progress?select=lead_hash,video_step,max_unique_watched_percent,completed_at,first_seen_at,last_update_at&lead_hash=in.(${IN_FILTER})&order=video_step.asc&limit=120`],
  ['Historie: Outbox', `lead_sync_outbox?select=lead_hash,sync_type,status,created_at,processed_at,context_data,response_data,last_error&lead_hash=in.(${IN_FILTER})&order=created_at.asc&limit=160`],
  ['Testlead-Ausschlüsse', 'lead_events?select=lead_hash,event_name,payload&event_name=in.(test_lead_marked,test_lead_unmarked)&order=event_at.desc'],
  ['CRM-Zeilen zur Seite', `lead_contact_crm?select=${CRM_SELECT_FIELDS}&lead_hash=in.(${IN_FILTER})`],
  ['Kontaktliste (not. + or= + offset)', `v_lead_state_full?select=${LEAD_SELECT_FIELDS}&organisation_id=eq.2&email=not.is.null&${COACH_FILTER}&order=created_at.desc&limit=61&offset=60`],
  ['Manuell hinzugefügte Berater', `lead_contact_crm?select=${CRM_SELECT_FIELDS}&manual_added=eq.true&member_id=eq.25851739&order=updated_at.desc`],
  ['CRM-Zeile eines Leads', `lead_contact_crm?select=${CRM_SELECT_FIELDS}&lead_hash=eq.qz_abc123&limit=1`],
  ['Lead-Besitzprüfung', 'v_lead_state_full?select=lead_hash,member_id,ref_id,berater_slug,email&lead_hash=eq.qz_abc123&limit=1'],
  ['Verknüpfte Herbalife-ID', 'lead_contact_crm?select=linked_herbalife_id&lead_hash=eq.qz_abc123&limit=1'],
];

test('alle lesenden Kalkulator-Abfragen übersetzen fehlerfrei', () => {
  for (const [name, pfad] of ABFRAGEN) {
    const r = uebersetze(pfad, { method: 'GET' });
    assert.ok(r.sql.startsWith('SELECT '), `${name}: ${r.sql}`);
    assert.equal(r.erwartetZeilen, true, name);
  }
});

test('die Kontaktliste - meistgenutzte Ansicht - ergibt exakt das erwartete SQL', () => {
  const r = uebersetze(
    `v_lead_state_full?select=${LEAD_SELECT_FIELDS}&organisation_id=eq.2&email=not.is.null&${COACH_FILTER}&order=created_at.desc&limit=61&offset=60`,
    { method: 'GET' }
  );
  assert.ok(r.sql.endsWith(
    'WHERE organisation_id = $1 AND NOT (email IS NULL) '
    + 'AND (berater_slug = $2 OR member_id IN ($3, $4) OR ref_id IN ($5, $6)) '
    + 'ORDER BY created_at DESC LIMIT 61 OFFSET 60'
  ), r.sql);
  assert.deepEqual(r.werte, ['2', 'markus', '25851739', '25297671', '25851739', '25297671']);
});

test('Kontaktliste eines gewöhnlichen Beraters (eq statt in) übersetzt ebenfalls', () => {
  const r = uebersetze(
    `v_lead_state_full?select=${LEAD_SELECT_FIELDS}&organisation_id=eq.2&email=not.is.null&or=(berater_slug.eq.anna,member_id.eq.12345678,ref_id.eq.12345678)&order=created_at.desc&limit=26&offset=0`,
    { method: 'GET' }
  );
  assert.ok(r.sql.includes('(berater_slug = $2 OR member_id = $3 OR ref_id = $4)'), r.sql);
});

test('CRM-Upsert (merge-duplicates) übersetzt in beiden Prefer-Varianten', () => {
  const zeile = {
    lead_hash: 'qz_abc123',
    member_id: '25851739',
    berater_slug: 'markus',
    updated_at: '2026-08-28T20:00:00.000Z',
    notes: 'Rückruf vereinbart',
  };
  const minimal = uebersetze('lead_contact_crm?on_conflict=lead_hash', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(zeile),
  });
  assert.ok(minimal.sql.includes('ON CONFLICT (lead_hash) DO UPDATE SET'), minimal.sql);
  assert.equal(minimal.erwartetZeilen, false);

  const representation = uebersetze('lead_contact_crm?on_conflict=lead_hash', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({ ...zeile, manual_added: true }),
  });
  assert.ok(representation.sql.endsWith('RETURNING *'), representation.sql);
  assert.equal(representation.erwartetZeilen, true);
});

test('SSO-Token-Verbrauch (Replay-Schutz) übersetzt; das Duplikat muss LAUT scheitern', () => {
  const r = uebersetze('sso_token_consumptions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({
      id: 'a'.repeat(64),
      member_id: '25851739',
      expires_at: '2026-08-28T21:00:00.000Z',
    }),
  });
  assert.equal(r.sql, 'INSERT INTO leads.sso_token_consumptions (id, member_id, expires_at) VALUES ($1, $2, $3)');
  // KEIN ON CONFLICT: Der Handler erkennt den Replay am Unique-Fehler (409-Pfad in
  // api/sso.js). Ein stilles DO NOTHING würde jeden Token mehrfach einlösbar machen.
  assert.ok(!r.sql.includes('ON CONFLICT'), r.sql);
});
