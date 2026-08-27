#!/usr/bin/env node
'use strict';

// n8n-Workflows für den Cutover abschalten und wieder anschalten.
//
//   node scripts/cutover-n8n.js stand   zeigt den Ist-Zustand
//   node scripts/cutover-n8n.js aus     deaktiviert die Schreiber (Cutover-Schritt 1)
//   node scripts/cutover-n8n.js an      stellt den GESICHERTEN Zustand wieder her
//
// 🔴 "an" spielt den Stand aus cutover-belege/n8n-stand-vor-cutover.json zurück, nicht
// pauschal alles auf aktiv. Sonst würde ein Workflow angeschaltet, der vorher bewusst
// aus war (der Video-Inactivity-Checker ist genau so ein Fall).
//
// Der Nurture-Sender bleibt nach dem Cutover BEWUSST aus, bis seine sechs Nodes von
// HTTP auf den direkten Treiber umgebaut sind (Entscheidung Markus, 27.08.: Reparatur
// am Folgetag). "an" lässt ihn deshalb aus und sagt das auch.

const fs = require('fs');
const path = require('path');

const KEY = JSON.parse(
  fs.readFileSync('C:/Users/Markus/.agent-secrets/agent-secrets.json', 'utf8')).n8n.apiKey;
const BASIS = 'https://n8n.hl-support.biz/api/v1';
const BELEG = path.join(__dirname, '..', 'docs', 'audits', 'cutover-vorbereitung',
  'cutover-belege', 'n8n-stand-vor-cutover.json');

// Diese schreiben in den Leadkern und müssen im Fenster stehen.
const ABSCHALTEN = {
  ALLHYLRwkvujkuFJ: 'Lead Sync Outbox Worker (laeuft JEDE Minute)',
  RqKSRTgFv8mv04H2: 'Quiz Nurture Email Sender',
  '9RZdrLxfA8IRhd55': 'Lead Post Processor',
  m52uJBbSQUFUA2Dm: 'Lead System Health Monitor',
  'CODeVYeZ_63C-DoT4Z8SN': 'Supabase Keep-Alive',
  vSpXIyOUK9WIlvxi: 'Error Alert (Postmark) — schreibt record_nurture_failure',
};

// Nach dem Cutover bewusst AUS lassen, bis umgebaut (siehe Kopf).
const BLEIBT_AUS = new Set(['RqKSRTgFv8mv04H2']);

async function api(pfad, methode = 'GET') {
  const r = await fetch(`${BASIS}${pfad}`, { method: methode, headers: { 'X-N8N-API-KEY': KEY } });
  if (!r.ok) throw new Error(`n8n ${methode} ${pfad}: HTTP ${r.status} ${(await r.text()).slice(0, 120)}`);
  return r.json();
}

async function stand() {
  console.log('\n== Ist-Zustand ==\n');
  for (const [id, label] of Object.entries(ABSCHALTEN)) {
    const w = await api(`/workflows/${id}`);
    console.log(`  ${w.active ? 'AKTIV ' : 'aus   '} ${String(w.name).slice(0, 46).padEnd(48)} ${label}`);
  }
  return 0;
}

async function aus() {
  console.log('\n== n8n-Schreiber abschalten ==\n');
  // Ist-Zustand IMMER frisch sichern, bevor etwas geändert wird - der Beleg ist der
  // einzige Weg zurück zum exakten Ausgangszustand.
  const gesichert = {};
  for (const id of Object.keys(ABSCHALTEN)) {
    const w = await api(`/workflows/${id}`);
    gesichert[id] = { name: w.name, active: w.active };
  }
  fs.mkdirSync(path.dirname(BELEG), { recursive: true });
  fs.writeFileSync(BELEG, JSON.stringify(
    { gesichert_am: new Date().toISOString(), workflows: gesichert }, null, 2));
  console.log(`  Zustand gesichert: ${path.relative(process.cwd(), BELEG)}\n`);

  let fehler = 0;
  for (const [id, label] of Object.entries(ABSCHALTEN)) {
    try {
      if (!gesichert[id].active) { console.log(`  war schon aus  ${label}`); continue; }
      await api(`/workflows/${id}/deactivate`, 'POST');
      const w = await api(`/workflows/${id}`);
      console.log(`  ${w.active ? '🔴 NOCH AKTIV' : 'abgeschaltet '}  ${label}`);
      if (w.active) fehler += 1;
    } catch (e) { console.log(`  🔴 FEHLER      ${label}: ${e.message}`); fehler += 1; }
  }
  console.log(`\n  ${fehler ? `🔴 ${fehler} Workflow(s) laufen noch — NICHT uebertragen!` : 'Alle Schreiber stehen.'}\n`);
  return fehler ? 1 : 0;
}

async function an() {
  console.log('\n== n8n wieder anschalten (gesicherter Zustand) ==\n');
  if (!fs.existsSync(BELEG)) {
    console.error(`  Beleg fehlt: ${BELEG}\n  Ohne ihn ist der Ausgangszustand unbekannt — nicht raten.`);
    return 2;
  }
  const { workflows } = JSON.parse(fs.readFileSync(BELEG, 'utf8'));
  let fehler = 0;
  for (const [id, eintrag] of Object.entries(workflows)) {
    const label = ABSCHALTEN[id] || eintrag.name;
    if (BLEIBT_AUS.has(id)) {
      console.log(`  BLEIBT AUS     ${label}`);
      console.log('                 (Umbau auf den direkten Treiber steht noch aus)');
      continue;
    }
    if (!eintrag.active) { console.log(`  war vorher aus ${label}`); continue; }
    try {
      await api(`/workflows/${id}/activate`, 'POST');
      const w = await api(`/workflows/${id}`);
      console.log(`  ${w.active ? 'aktiviert    ' : '🔴 BLIEB AUS '}  ${label}`);
      if (!w.active) fehler += 1;
    } catch (e) { console.log(`  🔴 FEHLER      ${label}: ${e.message}`); fehler += 1; }
  }
  console.log(`\n  ${fehler ? `🔴 ${fehler} Workflow(s) nicht aktiviert.` : 'Zustand wiederhergestellt.'}`);
  console.log('  🔴 Wächter W2 wird anschlagen, solange der Nurture-Sender aus ist — das ist gewollt.\n');
  return fehler ? 1 : 0;
}

const SCHRITTE = { stand, aus, an };

(async () => {
  const s = process.argv[2];
  if (!SCHRITTE[s]) {
    console.error(`Schritt fehlt. Verfuegbar: ${Object.keys(SCHRITTE).join(', ')}`);
    process.exit(2);
  }
  process.exit(await SCHRITTE[s]());
})().catch((e) => { console.error('Abbruch:', e.message); process.exit(2); });
