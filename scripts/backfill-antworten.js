/**
 * Backfill: Quiz-Antworten, Profil, Ziel und Barriere aus dem MySQL-JSON nach PostgreSQL.
 *
 * HINTERGRUND (26.08.2026)
 * ------------------------
 * 116 Menschen hatten ein Opt-in, aber keine Quiz-Daten in PostgreSQL. Ursache war der
 * fragile Browser-Ereignisstrom (Fire-and-forget bis 23.08.) - waehrend das Opt-in-Paket
 * die vollstaendigen Antworten in das MySQL-JSON der Kontaktkartei trug. 105 davon sind
 * daraus vollstaendig heilbar. Freigabe Markus: nachfuellen, inklusive Nurture-Faehigkeit
 * ("besser jetzt als gar nie").
 *
 * GRUNDSAETZE
 * -----------
 * - Derselbe Extraktor wie im Live-Pfad (Export aus api/bridge.js). Ein zweiter Parser
 *   waere eine zweite Wahrheit.
 * - NUR Luecken fuellen: Ein Feld wird ausschliesslich geschrieben, wenn es in PostgreSQL
 *   NULL ist. Vorhandene Werte werden nie ueberschrieben.
 * - Antworten nur fuer Leads, die noch KEINE Antwortzeilen haben.
 * - Standard ist der Trockenlauf. Schreiben nur mit --anwenden.
 * - MySQL wird ausschliesslich GELESEN (Base64-transportiert, damit JSON-Sonderzeichen
 *   den Tab-getrennten Transport nicht zerreissen koennen).
 *
 *   node scripts/backfill-antworten.js                  # Trockenlauf, zeigt den Plan
 *   node scripts/backfill-antworten.js --nur qz_xxx     # nur diesen Lead (erst so testen!)
 *   node scripts/backfill-antworten.js --anwenden       # schreibt
 */
const { execFileSync } = require('child_process');
const { Buffer } = require('buffer');
const fs = require('fs');

const SSH = process.env.SSH_BIN || 'C:/Windows/System32/OpenSSH/ssh.exe';
const DB_HOST = process.env.MYSQL_SSH_HOST || 'root@91.99.76.104';
const DB_KEY = process.env.MYSQL_SSH_KEY || 'C:/Users/Markus/.ssh/id_rsa';

const SUPABASE_URL = String(process.env.SUPABASE_URL || '').trim();
const SUPABASE_KEY = String(process.env.SUPABASE_SERVICE_KEY || '').trim();
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('SUPABASE_URL und SUPABASE_SERVICE_KEY muessen gesetzt sein.');
  process.exit(2);
}

const { extractQuizAnswersFromFormResponse, normalizeBusinessProfile } = require('../api/bridge.js');

const ANWENDEN = process.argv.includes('--anwenden');
const NUR = process.argv.includes('--nur') ? process.argv[process.argv.indexOf('--nur') + 1] : null;

async function pg(pfad, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pfad}`, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`${pfad.split('?')[0]}: HTTP ${res.status} ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

/** Kandidaten: echte Kontakte mit mindestens einer fuellbaren Luecke. */
async function kandidatenLaden() {
  // Blaettern - die stille 1000er-Grenze ist genau die Fehlerklasse dieses Vorfalls.
  const alle = [];
  for (let offset = 0; ; offset += 1000) {
    const seite = await pg(
      `lead_state?select=lead_hash,email,lang,profile_code,main_aspiration,main_aspiration_label,initial_barrier,form_submitted_at,lifecycle_stage` +
        `&form_submitted_at=not.is.null&email=not.is.null&lifecycle_stage=neq.merged_duplicate` +
        `&order=created_at.asc,lead_hash.asc&limit=1000&offset=${offset}`
    );
    alle.push(...seite);
    if (seite.length < 1000) break;
  }
  const testmuster = /global-sce\.com|hl-support\.biz|example\.com|codex-test|test@test\.com/i;
  // Kandidat ist, wer irgendeine fuellbare Luecke hat - auch wenn NUR Antwortzeilen
  // fehlen. Seit dem 27.08. zaehlen auch TEILVERLUSTE (1-5 Zeilen) als Luecke: der
  // void-RPC-Abriss liess genau eine Antwort stehen, und "keine Zeilen" haette diese
  // Leads fuer immer uebersehen.
  const echte = alle.filter((l) => !testmuster.test(l.email) && (NUR ? l.lead_hash === NUR : true));
  const refs = await antwortRefsLaden(echte.map((l) => l.lead_hash));
  return echte.filter(
    (l) =>
      l.profile_code === null ||
      l.main_aspiration === null ||
      l.initial_barrier === null ||
      (refs.get(l.lead_hash)?.size || 0) < 6
  );
}

/** Vorhandene Antwort-Refs je Lead - gefuellt wird nur, was fehlt, nie ueberschrieben. */
async function antwortRefsLaden(hashes) {
  const refs = new Map();
  for (let i = 0; i < hashes.length; i += 150) {
    const block = hashes.slice(i, i + 150);
    const rows = await pg(
      `lead_answers_current?select=lead_hash,question_ref&lead_hash=in.(${block.join(',')})&limit=10000`
    );
    for (const r of rows) {
      if (!refs.has(r.lead_hash)) refs.set(r.lead_hash, new Set());
      refs.get(r.lead_hash).add(r.question_ref);
    }
  }
  return refs;
}

/** MySQL-JSON je Hash, Base64-sicher transportiert. Rein lesend. */
function mysqlLaden(hashes) {
  const map = new Map();
  for (let i = 0; i < hashes.length; i += 200) {
    const block = hashes.slice(i, i + 200);
    const liste = block.map((h) => `'${h.replace(/[^a-zA-Z0-9_]/g, '')}'`).join(',');
    // REPLACE ist zwingend: MySQL bricht TO_BASE64 alle 76 Zeichen mit Zeilenumbruechen
    // um - ohne das REPLACE zerreisst der zeilenweise Transport, JSON.parse scheitert
    // still, und der Backfill meldet "0 heilbar", obwohl alles da ist. Genau so beim
    // ersten Trockenlauf am 26.08. passiert.
    const sql = `select hash, replace(to_base64(form_response), '\\n', '') from typeform_surveys where hash in (${liste}) and deleted_at is null`;
    const out = execFileSync(
      SSH,
      ['-o', 'StrictHostKeyChecking=no', '-i', DB_KEY, DB_HOST,
       `mysql --defaults-file=/home/forge/.my.cnf -N -B prod_contacts_activesupport -e "${sql}"`],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 180000 }
    );
    for (const zeile of out.split('\n')) {
      if (!zeile.trim()) continue;
      const [hash, ...rest] = zeile.split('\t');
      try {
        map.set(hash, JSON.parse(Buffer.from(rest.join(''), 'base64').toString('utf8')));
      } catch {
        /* unlesbares JSON wird als "nicht heilbar" gezaehlt, nie geraten */
      }
    }
  }
  return map;
}

(async () => {
  console.log(`\nBackfill Quiz-Antworten  ${ANWENDEN ? '— ANWENDEN' : '— Trockenlauf'}${NUR ? `  (nur ${NUR})` : ''}\n`);

  const kandidaten = await kandidatenLaden();
  console.log(`  Kandidaten mit Luecken   : ${kandidaten.length}`);

  const mysql = mysqlLaden(kandidaten.map((k) => k.lead_hash));
  console.log(`  davon mit MySQL-JSON     : ${mysql.size}`);

  const antwortRefs = await antwortRefsLaden(kandidaten.map((k) => k.lead_hash));

  const plan = [];
  const statistik = { profil: 0, ziel: 0, barriere: 0, antworten: 0, nicht_heilbar: 0 };

  for (const lead of kandidaten) {
    const json = mysql.get(lead.lead_hash);
    if (!json) {
      statistik.nicht_heilbar += 1;
      continue;
    }
    const e = extractQuizAnswersFromFormResponse(json);
    const hidden = json.hidden || {};
    const patch = {};

    if (lead.profile_code === null) {
      const profil = normalizeBusinessProfile(e.profileLabel);
      if (profil) {
        patch.profile_code = profil.code;
        patch.profile_label = profil.label;
        statistik.profil += 1;
      }
    }
    if (lead.main_aspiration === null && hidden.main_aspiration) {
      patch.main_aspiration = String(hidden.main_aspiration).slice(0, 80);
      if (hidden.main_aspiration_label) {
        patch.main_aspiration_label = String(hidden.main_aspiration_label).slice(0, 180);
      }
      statistik.ziel += 1;
    }
    if (lead.initial_barrier === null && e.barrier) {
      patch.initial_barrier = e.barrier;
      statistik.barriere += 1;
    }

    // Nur schreiben, wenn MySQL den VOLLEN Satz traegt (6) - und davon nur die Refs,
    // die in PostgreSQL fehlen. Vorhandene Zeilen werden nie angefasst.
    const vorhandene = antwortRefs.get(lead.lead_hash) || new Set();
    const fehlendeAntworten =
      e.quizAnswers.length === 6 ? e.quizAnswers.filter((a) => !vorhandene.has(a.question_ref)) : [];
    if (fehlendeAntworten.length) statistik.antworten += 1;

    if (Object.keys(patch).length || fehlendeAntworten.length) {
      plan.push({ lead, patch, antworten: fehlendeAntworten, lang: lead.lang || hidden.lang || 'de' });
    }
  }

  console.log(`  zu fuellen: Profil ${statistik.profil} · Ziel ${statistik.ziel} · Barriere ${statistik.barriere} · Antwortsaetze ${statistik.antworten}`);
  console.log(`  nicht heilbar (kein MySQL-JSON): ${statistik.nicht_heilbar}\n`);

  fs.writeFileSync(
    `backfill-antworten-${ANWENDEN ? 'anwenden' : 'trockenlauf'}-bericht.json`,
    JSON.stringify({ zeitpunkt: new Date().toISOString(), statistik, plan: plan.map((p) => ({ lead_hash: p.lead.lead_hash, patch: p.patch, antworten: p.antworten.length })) }, null, 2)
  );

  if (!ANWENDEN) {
    for (const p of plan.slice(0, 8)) {
      console.log(`  ${p.lead.lead_hash.slice(0, 26)}…  ${Object.keys(p.patch).join(', ') || '(nur Antworten)'}${p.antworten.length ? `  +${p.antworten.length} Antworten` : ''}`);
    }
    if (plan.length > 8) console.log(`  … und ${plan.length - 8} weitere (siehe Bericht)`);
    console.log('\n  Trockenlauf - nichts geschrieben. Anwenden mit --anwenden, Einzeltest mit --nur <hash>.');
    return;
  }

  let ok = 0;
  for (const p of plan) {
    if (Object.keys(p.patch).length) {
      await pg(`lead_state?lead_hash=eq.${encodeURIComponent(p.lead.lead_hash)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify(p.patch),
      });
    }
    for (const a of p.antworten) {
      await pg('rpc/upsert_answer_current', {
        method: 'POST',
        body: JSON.stringify({
          p_lead_hash: p.lead.lead_hash,
          p_question_ref: a.question_ref,
          p_question_index: a.question_index,
          p_question_text: null,
          p_answer_ref: a.answer_ref,
          p_answer_text: a.answer_text,
          p_answer_value: a.answer_value,
          p_profile_delta: {},
          p_lang: p.lang,
          p_answered_at: p.lead.form_submitted_at,
        }),
      });
    }
    ok += 1;
    if (ok % 20 === 0) console.log(`  ${ok}/${plan.length} …`);
  }
  console.log(`\n  Angewendet: ${ok} Leads.`);
})().catch((e) => {
  console.error('Backfill gescheitert:', e.message);
  process.exit(1);
});
