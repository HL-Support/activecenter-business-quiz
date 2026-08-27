#!/usr/bin/env node
'use strict';

// Beweis für Phase 4 Stufe B: Der ECHTE Transportweg der Anwendung wird ausgeführt -
// nicht nachgebaut, nicht simuliert. Aufgerufen werden dieselben Funktionen, die im
// Betrieb laufen (server/lead-system.js), nur mit LEADS_DB_MODUS=direkt.
//
// 🔴 Läuft ausschliesslich gegen die TEST-Datenbank. Die Rechte von leads_app reichen
// zwar auch für die echte, aber ein Schreibtest gehört nie an echte Daten - und die
// Testkopie trägt dieselbe Struktur und denselben Bestand.
//
// Nur von 10.0.1.5 (Coolify-Box) ausführbar, weil pg_hba niemanden sonst zulässt.
//
//   LEADS_DB_MODUS=direkt LEADS_DB_NAME=business_leads_testimport … node scripts/stufe-b-beweis.js

const { Buffer } = require('node:buffer');
const transport = require('../server/db-transport.js');
const lead = require('../server/lead-system.js');

const HASH = 'qz_stufeb_' + Date.now().toString(36);
const befunde = [];

function pruefe(name, ok, detail) {
  befunde.push({ name, ok, detail });
  console.log(`  ${ok ? 'OK     ' : 'FEHLER '} ${name}${detail ? ' — ' + detail : ''}`);
}

(async () => {
  console.log(`\nStufe-B-Beweis · Modus ${transport.MODUS} · Schema ${transport.SCHEMA}\n`);
  if (!transport.istDirekt()) {
    console.error('LEADS_DB_MODUS ist nicht "direkt" - dieser Beweis waere wertlos.');
    process.exit(2);
  }

  // 1. LESEN mit Filter und Auswahl - der häufigste Aufruf überhaupt.
  const konfig = await lead.supabaseJson('app_config?select=key,value&limit=5');
  pruefe('Lesen mit select/limit', Array.isArray(konfig) && konfig.length > 0,
    `${Array.isArray(konfig) ? konfig.length : 0} Zeilen aus app_config`);

  // 2. RPC mit Rückgabewert - der kritische Schreibpfad (Stufe A).
  const submit = await lead.supabaseRpc('submit_lead_complete', {
    p_state: {
      lead_hash: HASH, member_id: 'M_STUFEB', first_name: 'Stufe-B Umlautprobe äöüß',
      email: `stufeb+${Date.now()}@example.com`, source_app: 'business_leads_quiz',
      funnel_key: 'business',
    },
    p_answers: [1, 2, 3, 4, 5, 6].map((i) => ({
      question_ref: `q${i}`, question_index: i, answer_ref: `a${i}`,
      answer_text: `Antwort ${i}`, answer_value: String(i),
    })),
    p_lang: 'de',
  });
  pruefe('RPC submit_lead_complete (Kontakt + 6 Antworten atomar)',
    submit && submit[0] && submit[0].submit_lead_complete
      && submit[0].submit_lead_complete.answers_written === 6,
    JSON.stringify(submit && submit[0]));

  // 3. Die Antworten wirklich zählen - W5-Kriterium, gegen die Datenbank gemessen.
  const antworten = await lead.supabaseJson(
    `lead_answers_current?lead_hash=eq.${encodeURIComponent(HASH)}&select=question_ref`);
  pruefe('sechs Antwortzeilen liegen wirklich vor',
    Array.isArray(antworten) && antworten.length === 6,
    `${Array.isArray(antworten) ? antworten.length : 0} Zeilen`);

  // 4. Umlaute über den ganzen Weg - Hex, weil die Konsole nichts beweist.
  const [zustand] = await lead.supabaseJson(
    `lead_state?lead_hash=eq.${encodeURIComponent(HASH)}&select=first_name,email&limit=1`) || [];
  const hex = Buffer.from(String(zustand && zustand.first_name), 'utf8').toString('hex');
  pruefe('Umlaute unversehrt', hex.includes('c3a4c3b6c3bcc39f'), 'äöüß als c3a4 c3b6 c3bc c39f');

  // 5. RPC mit Rang-Logik und Outbox-Erzeugung über eine Identity-Spalte.
  const video = await lead.supabaseRpc('upsert_video_progress_monotonic', {
    p_lead_hash: HASH, p_video_step: 1, p_video_id: 'vid_1',
    p_unique_watched_percent: 96.5, p_playhead_percent: 99, p_unique_watched_seconds: 300,
  });
  pruefe('RPC upsert_video_progress_monotonic', Array.isArray(video) && video.length === 1,
    JSON.stringify(video && video[0]));

  // 6. View lesen - berechneter Rang.
  const [voll] = await lead.supabaseJson(
    `v_lead_state_full?lead_hash=eq.${encodeURIComponent(HASH)}&select=lead_hash,completed_rank&limit=1`) || [];
  pruefe('View v_lead_state_full liefert completed_rank',
    voll && voll.completed_rank === 1, `Rang ${voll && voll.completed_rank}`);

  // 7. Upsert mit merge-duplicates - der heikelste Übersetzungszweig.
  await lead.supabaseRequest('lead_state?on_conflict=lead_hash', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ lead_hash: HASH, cta_type: 'stufeb_probe' }),
  });
  const [nachMerge] = await lead.supabaseJson(
    `lead_state?lead_hash=eq.${encodeURIComponent(HASH)}&select=cta_type,first_name&limit=1`) || [];
  pruefe('Upsert merge-duplicates setzt NUR das mitgelieferte Feld',
    nachMerge && nachMerge.cta_type === 'stufeb_probe'
      && String(nachMerge.first_name).includes('äöüß'),
    'cta_type gesetzt, first_name unberührt');

  // 8. PATCH mit Filter.
  await lead.supabaseRequest(`lead_state?lead_hash=eq.${encodeURIComponent(HASH)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ sync_status: 'stufeb_ok' }),
  });
  const [nachPatch] = await lead.supabaseJson(
    `lead_state?lead_hash=eq.${encodeURIComponent(HASH)}&select=sync_status&limit=1`) || [];
  pruefe('PATCH mit Filter', nachPatch && nachPatch.sync_status === 'stufeb_ok',
    String(nachPatch && nachPatch.sync_status));

  // 9. Leere Trefferliste liefert [], nicht null - sonst brechen Aufrufer mit .length.
  const leer = await lead.supabaseJson('lead_state?lead_hash=eq.qz_gibtesnicht_xyz&select=lead_hash');
  pruefe('leere Treffermenge ist ein leeres Feld', Array.isArray(leer) && leer.length === 0,
    JSON.stringify(leer));

  // 10. Aufräumen: NUR die selbst angelegte Zeile. CASCADE räumt Antworten und Outbox ab.
  await lead.supabaseRequest(`lead_state?lead_hash=eq.${encodeURIComponent(HASH)}`, {
    method: 'DELETE', headers: { Prefer: 'return=minimal' },
  }).catch(async () => {
    // DELETE ist im Übersetzer (noch) nicht abgedeckt - dann direkt aufräumen.
    const sql = require('postgres')({
      host: process.env.LEADS_DB_HOST, port: Number(process.env.LEADS_DB_PORT || 5432),
      database: process.env.LEADS_DB_NAME, username: process.env.LEADS_DB_BENUTZER,
      password: process.env.LEADS_DB_PASSWORT, max: 1, onnotice: () => {},
    });
    await sql.unsafe(`delete from ${transport.SCHEMA}.lead_state where lead_hash = $1`, [HASH]);
    await sql.end({ timeout: 5 });
  });
  const [wegGeprueft] = await lead.supabaseJson(
    `lead_state?lead_hash=eq.${encodeURIComponent(HASH)}&select=lead_hash&limit=1`) || [];
  pruefe('Probezeile wieder entfernt', !wegGeprueft, HASH);

  await transport.schliessen();

  const fehler = befunde.filter((b) => !b.ok);
  console.log(`\n  ${befunde.length - fehler.length}/${befunde.length} bestanden.\n`);
  process.exit(fehler.length ? 1 : 0);
})().catch(async (e) => {
  await transport.schliessen().catch(() => {});
  console.error('Beweis gescheitert:', e.message, e.sql ? `\n  SQL: ${e.sql}` : '');
  process.exit(2);
});
