/**
 * AP5 (Conversion-Plan 2026-09-01): Neue Phase a1 "Erinnerung kein Videostart"
 * im n8n "AC - Quiz Nurture Email Sender" (RqKSRTgFv8mv04H2).
 * Protokoll: agent-core/skills/n8n-workflow-update (frischer GET, exakte
 * Ersetzungen mit Vorkommens-Pruefung, PUT als eigener Schritt).
 *
 * Aufruf: node d:/tmp/patch-ap5-nurture-sender.js
 */
const fs = require('fs');
const s = require('C:/Users/Markus/.agent-secrets/agent-secrets.json');
const BASE = s.n8n.baseUrl.replace(/\/$/, '');
const H = { 'X-N8N-API-KEY': s.n8n.apiKey };
const WF_ID = 'RqKSRTgFv8mv04H2';

function applyAll(code, patches, label) {
  let out = code;
  for (const [oldStr, newStr] of patches) {
    const count = out.split(oldStr).length - 1;
    if (count !== 1) {
      throw new Error(`Patch in ${label}: erwartet 1 Vorkommen, gefunden ${count}: ${oldStr.slice(0, 90)}...`);
    }
    out = out.replace(oldStr, newStr);
  }
  return out;
}

const PHASE_OLD = [
  "const now = Date.now();\nconst H24 = 24 * 60 * 60 * 1000;",
  "const ACTIVE_PHASES = ['a2', 'b1', 'c1', 'd1', 'a3', 'b2', 'c2', 'd2'];",
  "const sentEvents = allEvents.filter(e => e.event_name === 'nurture_sent');",
  [
    "    } else if (!a2SentAt) {",
    "      const ref = winner.form_submitted_at;",
    "      if (ref && (now - new Date(ref).getTime()) >= H12) phase = 'a2';",
    "    }",
  ].join('\n'),
];
const PHASE_NEW = [
  "const now = Date.now();\nconst H2 = 2 * 60 * 60 * 1000;\nconst H24 = 24 * 60 * 60 * 1000;",
  "const ACTIVE_PHASES = ['a1', 'a2', 'b1', 'c1', 'd1', 'a3', 'b2', 'c2', 'd2'];",
  [
    "const sentEvents = allEvents.filter(e => e.event_name === 'nurture_sent');",
    "// AP5 (a1): Wer Video 1 schon GESTARTET hat, braucht keine Starterinnerung.",
    "const videoStartHashes = new Set(",
    "  allEvents.filter(e => e.event_name === 'video_started').map(e => e.lead_hash).filter(Boolean)",
    ");",
  ].join('\n'),
  [
    "    } else if (!a2SentAt) {",
    "      const ref = winner.form_submitted_at;",
    "      if (ref && (now - new Date(ref).getTime()) >= H12) phase = 'a2';",
    "      else if (ref) {",
    "        // AP5 (Conversion-Plan 2026-09-01): a1 = Erinnerung 'kein Videostart',",
    "        // 2-24 h nach dem Opt-in, nur 08-21 Uhr Berlin, einmalig. Die",
    "        // 24-h-Obergrenze verhindert beim Scharfschalten einen Schwall an",
    "        // Altleads - die laufen weiter ueber a2; a2 (12 h) bleibt dahinter",
    "        // unveraendert bestehen.",
    "        const alterMs = now - new Date(ref).getTime();",
    "        const a1SentAt = latestSentForPerson(email, sessions, 'a1');",
    "        const hatVideoStart = sessions.some(s => s.lead_hash && videoStartHashes.has(s.lead_hash));",
    "        const a1Fenster = berlinHour >= 8 && berlinHour < 21;",
    "        if (!a1SentAt && !hatVideoStart && a1Fenster && alterMs >= H2 && alterMs < H24) phase = 'a1';",
    "      }",
    "    }",
  ].join('\n'),
];

const MAP_OLD = [
  "const EMAIL_MAP = {\n  a2: {",
  "const PHASE_DIM = {\n  a2: 'main_goal',",
];
const MAP_NEW = [
  [
    "const EMAIL_MAP = {",
    "  a1: {",
    "    // AP5: Erinnerung 'kein Videostart' - EINE generische Fassung je Sprache.",
    "    // Quelle: nurture/vorlagen/a1-kein-videostart.js, angelegt 01.09.2026.",
    "    de: { _single: 186 },",
    "    it: { _single: 187 },",
    "    en: { _single: 188 },",
    "    fr: { _single: 189 },",
    "    ru: { _single: 190 },",
    "    hu: { _single: 191 },",
    "  },",
    "  a2: {",
  ].join('\n'),
  "const PHASE_DIM = {\n  a1: '_single', a2: 'main_goal',",
];

const EVENTS_OLD = "where event_name in ('test_lead_marked','test_lead_unmarked','nurture_sent')";
const EVENTS_NEW = "where event_name in ('test_lead_marked','test_lead_unmarked','nurture_sent','video_started')";

const CAP_OLD = "const ALLE_PHASEN = ['a2', 'b1', 'c1', 'd1', 'a3', 'b2', 'c2', 'd2'];";
const CAP_NEW = "const ALLE_PHASEN = ['a1', 'a2', 'b1', 'c1', 'd1', 'a3', 'b2', 'c2', 'd2'];";

(async () => {
  const live = await (await fetch(`${BASE}/workflows/${WF_ID}`, { headers: H })).json();
  if (!live.nodes) throw new Error('GET fehlgeschlagen: ' + JSON.stringify(live).slice(0, 300));
  fs.writeFileSync('d:/tmp/ap5-workflow-live.json', JSON.stringify(live, null, 2));
  console.log('Backup: d:/tmp/ap5-workflow-live.json | versionId:', live.versionId);

  const patched = [];
  for (const node of live.nodes) {
    if (node.name === 'Code - Determine Phase') {
      node.parameters.jsCode = applyAll(node.parameters.jsCode, PHASE_OLD.map((o, i) => [o, PHASE_NEW[i]]), node.name);
      patched.push(node.name);
    }
    if (node.name === 'Code - Select Email ID') {
      node.parameters.jsCode = applyAll(node.parameters.jsCode, MAP_OLD.map((o, i) => [o, MAP_NEW[i]]), node.name);
      patched.push(node.name);
    }
    if (node.name === 'Supabase - Get Test Events') {
      node.parameters.query = applyAll(node.parameters.query, [[EVENTS_OLD, EVENTS_NEW]], node.name);
      patched.push(node.name);
    }
    if (node.name === 'Code - Recovery Send Cap') {
      node.parameters.jsCode = applyAll(node.parameters.jsCode, [[CAP_OLD, CAP_NEW]], node.name);
      patched.push(node.name);
    }
  }
  if (patched.length !== 4) throw new Error(`Erwartet 4 gepatchte Nodes, habe ${patched.length}: ${patched}`);
  console.log('Gepatcht:', patched.join(' | '));

  const erlaubteSettings = ['executionOrder', 'saveManualExecutions', 'callerPolicy', 'timezone',
    'saveDataErrorExecution', 'saveDataSuccessExecution', 'saveExecutionProgress',
    'executionTimeout', 'errorWorkflow'];
  const settings = Object.fromEntries(
    Object.entries(live.settings || {}).filter(([k]) => erlaubteSettings.includes(k))
  );
  fs.writeFileSync('d:/tmp/ap5-workflow-patched.json', JSON.stringify({
    name: live.name, nodes: live.nodes, connections: live.connections, settings,
  }, null, 2));
  console.log('Geschrieben: d:/tmp/ap5-workflow-patched.json (PUT ist ein eigener Schritt)');
})().catch((e) => { console.error('ABBRUCH:', e.message); process.exit(1); });
