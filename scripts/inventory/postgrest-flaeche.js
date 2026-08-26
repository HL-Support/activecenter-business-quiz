/**
 * Inventur der PostgREST-Flaeche - Vorarbeit fuer Phase 4 (Kysely-Umbau).
 *
 * Warum es dieses Werkzeug gibt: Der Plan verlangt eine "vollstaendige Liste aller
 * PostgREST-Tabellen, Views und RPCs". Die aus dem CODE zu erheben waere falsch - sie
 * wuerde genau das uebersehen, was nur ein n8n-Workflow oder ein Skript anfasst. Diese
 * Erhebung fragt deshalb die Datenbank selbst: PostgREST liefert seine Schnittstellen-
 * beschreibung unter `/rest/v1/` aus, und die ist die Wahrheit darueber, was erreichbar
 * ist.
 *
 * Rein lesend. Ein einziger GET, keine Schreibrechte noetig ausser dem Lesen des Schemas.
 *
 *   node scripts/inventory/postgrest-flaeche.js            # Bericht auf die Konsole
 *   node scripts/inventory/postgrest-flaeche.js --json datei.json
 */
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = String(process.env.SUPABASE_URL || '').trim();
const SUPABASE_SERVICE_KEY = String(process.env.SUPABASE_SERVICE_KEY || '').trim();

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('SUPABASE_URL und SUPABASE_SERVICE_KEY muessen gesetzt sein.');
  process.exit(2);
}

// Die Dateien, die zur Laufzeit wirklich mit der Datenbank sprechen. Skripte und Tests
// bleiben bewusst draussen: Sie muessen beim Umbau nicht mitwandern und wuerden die
// Liste der zu ersetzenden Stellen aufblaehen.
const LAUFZEIT_DATEIEN = [
  'api/bridge.js',
  'api/lead-track.js',
  'api/lead-outbox-worker.js',
  'api/lead-system-health.js',
  'api/lead/init.js',
  'server/lead-system.js',
];

function laufzeitQuelltext() {
  const wurzel = path.resolve(__dirname, '..', '..');
  let text = '';
  for (const rel of LAUFZEIT_DATEIEN) {
    const p = path.join(wurzel, rel);
    if (fs.existsSync(p)) text += fs.readFileSync(p, 'utf8') + '\n';
  }
  return text;
}

async function schema() {
  const antwort = await fetch(`${SUPABASE_URL}/rest/v1/`, {
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      Accept: 'application/openapi+json',
    },
  });
  if (!antwort.ok) throw new Error(`Schema nicht lesbar: HTTP ${antwort.status}`);
  return antwort.json();
}

(async () => {
  const j = await schema();
  const quelltext = laufzeitQuelltext();

  const pfade = Object.keys(j.paths || {});
  const relationen = pfade.filter((p) => p !== '/' && !p.startsWith('/rpc/')).map((p) => p.slice(1));
  const funktionen = pfade.filter((p) => p.startsWith('/rpc/')).map((p) => p.slice(5));

  // Eine Relation gilt als benutzt, wenn ihr Name im Laufzeitcode als Wort vorkommt.
  // Bewusst grosszuegig: Ein falsch positiver Treffer kostet eine Pruefung, ein falsch
  // negativer kostet eine vergessene Abfrage beim Umbau.
  const benutzt = (name) => new RegExp(`\\b${name.replace(/[^a-z0-9_]/gi, '')}\\b`).test(quelltext);

  const relInfo = relationen
    .map((name) => {
      const def = (j.definitions || {})[name] || {};
      const spalten = Object.keys(def.properties || {});
      const istSicht = spalten.length > 0 && !(j.paths[`/${name}`] || {}).post;
      return { name, spalten: spalten.length, sicht: istSicht, benutzt: benutzt(name) };
    })
    .sort((a, b) => Number(b.benutzt) - Number(a.benutzt) || a.name.localeCompare(b.name));

  const fnInfo = funktionen
    .map((name) => {
      const post = (j.paths[`/rpc/${name}`] || {}).post || {};
      const p = (post.parameters || [])[0] || {};
      const args = Object.keys(((p.schema || {}).properties) || {});
      return { name, argumente: args, benutzt: benutzt(name) };
    })
    .sort((a, b) => Number(b.benutzt) - Number(a.benutzt) || a.name.localeCompare(b.name));

  const bericht = {
    erhoben_am: new Date().toISOString(),
    quelle: `${SUPABASE_URL}/rest/v1/ (OpenAPI)`,
    relationen: relInfo,
    funktionen: fnInfo,
    summen: {
      relationen: relInfo.length,
      relationen_benutzt: relInfo.filter((r) => r.benutzt).length,
      funktionen: fnInfo.length,
      funktionen_benutzt: fnInfo.filter((f) => f.benutzt).length,
    },
  };

  const jsonZiel = process.argv.includes('--json')
    ? process.argv[process.argv.indexOf('--json') + 1]
    : null;
  if (jsonZiel) {
    fs.writeFileSync(jsonZiel, JSON.stringify(bericht, null, 2));
    console.log(`Bericht geschrieben: ${jsonZiel}`);
  }

  const j2 = (n) => (n ? 'ja ' : '-  ');
  console.log('');
  console.log(`PostgREST-Flaeche, erhoben ${bericht.erhoben_am.slice(0, 16).replace('T', ' ')} UTC`);
  console.log('');
  console.log(
    `  ${bericht.summen.relationen} Relationen, davon ${bericht.summen.relationen_benutzt} im Laufzeitcode`
  );
  console.log(
    `  ${bericht.summen.funktionen} Funktionen, davon ${bericht.summen.funktionen_benutzt} im Laufzeitcode`
  );
  console.log('');
  console.log('  === Relationen im Laufzeitcode (diese muessen umgebaut werden) ===');
  for (const r of relInfo.filter((x) => x.benutzt)) {
    console.log(`    ${r.name.padEnd(34)} ${String(r.spalten).padStart(3)} Spalten`);
  }
  console.log('');
  console.log('  === Funktionen im Laufzeitcode ===');
  for (const f of fnInfo.filter((x) => x.benutzt)) {
    console.log(`    ${f.name.padEnd(34)} (${f.argumente.join(', ') || 'ohne Argumente'})`);
  }
  console.log('');
  console.log('  === Erreichbar, aber im Laufzeitcode NICHT benutzt ===');
  console.log('  (Fremdverbraucher wie n8n oder Auswertungen - vor dem Abschalten pruefen!)');
  for (const r of relInfo.filter((x) => !x.benutzt)) console.log(`    Relation  ${r.name}`);
  for (const f of fnInfo.filter((x) => !x.benutzt)) console.log(`    Funktion  ${f.name}`);
  void j2;
})().catch((e) => {
  console.error('Erhebung gescheitert:', e.message);
  process.exit(1);
});
