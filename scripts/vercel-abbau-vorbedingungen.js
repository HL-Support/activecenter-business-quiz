#!/usr/bin/env node
'use strict';

// Misst die Vorbedingungen der Vercel-Abbau-Checkliste
// (docs/audits/cutover-vorbereitung/vercel-abbau-checkliste.md) — damit die
// Entscheidung auf Zahlen steht, nicht auf Erinnerung.
//
// Aufruf:  node scripts/vercel-abbau-vorbedingungen.js
// Braucht: SUPABASE_ACCESS_TOKEN (z.B. aus .env.prod) und den n8n-API-Key
//          (N8N_API_KEY oder C:/Users/Markus/.agent-secrets/agent-secrets.json).
//
// Exit 0 = alle messbaren Vorbedingungen erfuellt. Alles andere: nicht abbauen.
// Markus' ausdrueckliche Freigabe ist zusaetzlich Pflicht und wird hier nur
// als Erinnerung ausgegeben — messen kann man sie nicht.

const fs = require('fs');
const tls = require('tls');
const { executeManagementQuery } = require('./stats-logs-baseline.js');

const DOMAINS = ['business.activecenter.info', 'quiz.activecenter.info', 'business.eaglesfit.ch'];
// Nur die Workflows des Quiz-Verbunds — die n8n-Instanz traegt viele fremde
// Projekte (Marathon, reConnect, Paperless …), deren Fehler uns nicht blockieren.
const QUIZ_WORKFLOWS = {
  RqKSRTgFv8mv04H2: 'AC - Quiz Nurture Email Sender',
  '7Xg6NsE5H3UWgSNc': 'Update "Result" by hash',
  '9RZdrLxfA8IRhd55': 'AC - Lead Post Processor',
  ALLHYLRwkvujkuFJ: 'AC - Lead Sync Outbox Worker',
  m52uJBbSQUFUA2Dm: 'AC - Lead System Health Monitor',
  BLQLWW8oN8M4BSe1: 'AC - Quiz Nightly Data Sync',
  MdCOqTBLoaJzkgDM: '[SWEEP] Domain-Sweep Alarm',
};
const FRUEHESTENS = '2026-09-01';
// Letzter Hosting-Vorfall auf Coolify: Anzeigen-Konversion/HTTP-3, behoben 27.08.2026
// (docs/audits/2026-08-27-anzeigenkonversion-http3.md). Bei neuem Vorfall hier nachziehen.
const LETZTER_VORFALL = '2026-08-27';
const RUHE_TAGE = 7;
const ZERT_MINDEST_TAGE = 60;

function n8nKey() {
  if (process.env.N8N_API_KEY) return process.env.N8N_API_KEY;
  const pfad = 'C:/Users/Markus/.agent-secrets/agent-secrets.json';
  if (fs.existsSync(pfad)) return JSON.parse(fs.readFileSync(pfad, 'utf8')).n8n.apiKey;
  return null;
}

function zertifikat(host) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({ host, port: 443, servername: host, timeout: 15000 }, () => {
      const cert = socket.getPeerCertificate();
      socket.end();
      resolve(cert.valid_to);
    });
    socket.on('error', reject);
    socket.on('timeout', () => { socket.destroy(); reject(new Error('Timeout')); });
  });
}

async function main() {
  const befunde = [];
  const heute = new Date();
  const pruefe = (name, ok, detail) => befunde.push({ name, ok, detail });

  // 1. Datums-Tore
  const ruheBis = new Date(`${LETZTER_VORFALL}T00:00:00+02:00`);
  ruheBis.setDate(ruheBis.getDate() + RUHE_TAGE);
  pruefe(`Fruehestens ${FRUEHESTENS}`, heute >= new Date(`${FRUEHESTENS}T00:00:00+02:00`),
    `heute ${heute.toISOString().slice(0, 10)}`);
  pruefe(`${RUHE_TAGE} ruhige Tage seit letztem Vorfall (${LETZTER_VORFALL})`,
    heute >= ruheBis, `erfuellt ab ${ruheBis.toISOString().slice(0, 10)}`);

  // 2. Domains: erreichbar, kein Alt-Svc, Zertifikat-Restlaufzeit
  for (const domain of DOMAINS) {
    try {
      const antwort = await fetch(`https://${domain}/`, { redirect: 'manual' });
      const status = antwort.status;
      const altSvc = antwort.headers.get('alt-svc');
      pruefe(`${domain} erreichbar`, status >= 200 && status < 400, `HTTP ${status}`);
      pruefe(`${domain} ohne Alt-Svc (HTTP/3 bleibt aus)`, !altSvc, altSvc || 'kein Header');
      const gueltigBis = new Date(await zertifikat(domain));
      const restTage = Math.floor((gueltigBis - heute) / 86400000);
      pruefe(`${domain} Zertifikat > ${ZERT_MINDEST_TAGE} Tage`, restTage > ZERT_MINDEST_TAGE, `${restTage} Tage Rest`);
    } catch (fehler) {
      pruefe(`${domain}`, false, `Fehler: ${fehler.message}`);
    }
  }

  // 3. n8n: keine Fehl-Laeufe in den letzten 7 Tagen
  const key = n8nKey();
  if (!key) {
    pruefe('n8n-Fehlerlage', false, 'kein API-Key gefunden (N8N_API_KEY oder agent-secrets)');
  } else {
    try {
      const antwort = await fetch('https://n8n.hl-support.biz/api/v1/executions?status=error&limit=50', {
        headers: { 'X-N8N-API-KEY': key },
      });
      if (!antwort.ok) throw new Error(`HTTP ${antwort.status}`);
      const daten = (await antwort.json()).data || [];
      const grenze = Date.now() - 7 * 86400000;
      const frisch = daten.filter((e) => new Date(e.startedAt).getTime() > grenze
        && Object.prototype.hasOwnProperty.call(QUIZ_WORKFLOWS, e.workflowId));
      pruefe('n8n Quiz-Workflows ohne Fehl-Laeufe (7 Tage)', frisch.length === 0,
        frisch.length ? frisch.map((e) => `${QUIZ_WORKFLOWS[e.workflowId]}@${e.startedAt}`).slice(0, 5).join(', ') : 'keine');
    } catch (fehler) {
      pruefe('n8n-Fehlerlage', false, `API nicht lesbar: ${fehler.message}`);
    }
  }

  // 4. Nurture laeuft: juengster Lauf (Wahrheits-Sicht) hoechstens 3 h alt und success
  try {
    const laeufe = await executeManagementQuery(`
      select status, protokolliert_am, gesendet_wahr
      from public.v_nurture_runs_wahr
      order by protokolliert_am desc limit 1`);
    const juengster = laeufe[0];
    const alterMin = juengster ? Math.round((Date.now() - new Date(juengster.protokolliert_am).getTime()) / 60000) : null;
    pruefe('Nurture-Lauf frisch (< 3 h) und success',
      Boolean(juengster) && juengster.status === 'success' && alterMin < 180,
      juengster ? `${juengster.status}, vor ${alterMin} min, ${juengster.gesendet_wahr} Sendungen` : 'kein Lauf gefunden');
  } catch (fehler) {
    pruefe('Nurture-Lauf', false, `nicht messbar: ${fehler.message}`);
  }

  // 5. Anzeigen-Konversion (W4-Blick, 48 h): Werbe-Besucher konvertieren wieder
  try {
    const w = await executeManagementQuery(`
      select count(*) filter (where fbclid is not null) as besucher,
             count(*) filter (where fbclid is not null and form_submitted_at is not null) as optins
      from public.lead_state
      where created_at > now() - interval '48 hours'`);
    const besucher = Number(w[0].besucher);
    const optins = Number(w[0].optins);
    pruefe('Werbe-Besucher konvertieren (48 h)', !(besucher >= 15 && optins === 0),
      `${besucher} Besucher, ${optins} Opt-ins`);
  } catch (fehler) {
    pruefe('Anzeigen-Konversion', false, `nicht messbar: ${fehler.message}`);
  }

  // Ausgabe
  let alleOk = true;
  for (const b of befunde) {
    if (!b.ok) alleOk = false;
    process.stdout.write(`${b.ok ? 'ERFUELLT ' : 'OFFEN    '} ${b.name} — ${b.detail}\n`);
  }
  process.stdout.write('\nNicht messbar, von Hand pruefen: GlitchTip ohne offene Hosting-Vorfaelle; '
    + 'Waechter-Protokolle der Box ohne neuen ALARM.\n');
  process.stdout.write('Pflicht unabhaengig vom Ergebnis: ausdrueckliche Freigabe von Markus — '
    + 'der Abbau gibt den Hosting-Rueckweg bewusst auf.\n');
  process.stdout.write(alleOk
    ? '\nALLE messbaren Vorbedingungen erfuellt.\n'
    : '\nNOCH NICHT abbauen — offene Punkte oben.\n');
  process.exit(alleOk ? 0 : 1);
}

main().catch((fehler) => {
  process.stderr.write(`${fehler.message}\n`);
  process.exit(2);
});
