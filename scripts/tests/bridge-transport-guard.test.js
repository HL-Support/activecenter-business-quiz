const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Gefunden im Audit vom 27.08.2026, vor dem Cutover.
//
// api/bridge.js hat einen Guard, der ohne konfiguriertes Supabase `null` zurückgibt
// statt zu werfen (Bridge-Vertrag: Aufrufer prüfen `response ?`). Der Guard lief
// ursprünglich VOR der Delegation und kannte den direkten Modus nicht.
//
// Folge: Entfernt jemand beim Cutover die nicht mehr benötigten SUPABASE_*-Variablen,
// liefern ALLE 28 Bridge-Zugriffe still `null`, während die übrigen Routen über den
// direkten Treiber weiterlaufen. Kein Fehler, kein Alarm, nur fehlende Daten -
// dieselbe Klasse "stiller Verlust" wie beim void-RPC-Vorfall.

const bridge = fs.readFileSync(path.join(__dirname, '..', '..', 'api', 'bridge.js'), 'utf8');

test('der Supabase-Guard kennt den direkten Modus', () => {
  assert.match(bridge, /require\('\.\.\/server\/db-transport'\)/,
    'bridge.js kennt die Transportschicht nicht');
  assert.match(bridge, /if \(dbTransport\.istDirekt\(\)\) return false;/,
    'der Guard prüft den direkten Modus nicht - im Modus "direkt" würde er fälschlich greifen');
});

test('kein Guard umgeht die Modusprüfung', () => {
  // Ein zurückgebliebenes `if (!SUPABASE_URL || !SUPABASE_KEY) return null;` an anderer
  // Stelle hätte exakt denselben Effekt wie der ursprüngliche Fehler.
  const roh = bridge.match(/if \(!SUPABASE_URL \|\| !SUPABASE_KEY\)\s*\{?\s*\n?\s*return null;/g) || [];
  assert.equal(roh.length, 0,
    `${roh.length} Guard(s) prüfen Supabase ohne Modusprüfung - im direkten Modus liefern sie still null`);
});

test('kein roher Supabase-Aufruf am Transport vorbei', () => {
  // Gefunden am 28.08.2026, NACH dem Cutover.
  //
  // writeToSupabaseAsync baute die URL an drei Stellen direkt aus SUPABASE_URL
  // zusammen und ging damit am modusbewussten Transport vorbei. Im direkten Modus
  // schrieb es weiter in die alte, inzwischen schreibgesperrte Datenbank - und weil
  // der Status nie geprüft wurde, verschwand der 403 lautlos. Ergebnis:
  // leads.quiz_sessions bekam vom Cutover an keine einzige neue Zeile mehr.
  //
  // Diese Prüfung ist der Wächter dagegen: In api/bridge.js darf keine URL mehr
  // von Hand aus SUPABASE_URL gebaut werden.
  const roh = bridge.match(/\$\{SUPABASE_URL\}\/rest/g) || [];
  assert.equal(
    roh.length,
    0,
    `${roh.length} roher Supabase-Aufruf in bridge.js - im direkten Modus schreibt er in die falsche Datenbank`
  );
});

test('der einzige rohe Supabase-Aufruf im Server liegt in lead-system.js', () => {
  // Genau EINE Stelle darf die REST-URL bauen: der Rumpf von supabaseRequest in
  // server/lead-system.js - und der prüft vorher dbTransport.istDirekt(). Jede
  // weitere Stelle waere wieder die Drift, die diesen Fehler erzeugt hat.
  const serverDir = path.join(__dirname, '..', '..', 'server');
  const treffer = [];
  for (const datei of fs.readdirSync(serverDir).filter((d) => d.endsWith('.js'))) {
    const inhalt = fs.readFileSync(path.join(serverDir, datei), 'utf8');
    const n = (inhalt.match(/\$\{SUPABASE_URL\}\/rest/g) || []).length;
    if (n) treffer.push(`${datei}:${n}`);
  }
  assert.deepEqual(
    treffer,
    ['lead-system.js:1'],
    `unerwartete rohe Supabase-Aufrufe im Server: ${treffer.join(', ') || 'keine'}`
  );
});

test('ALLE Transport-Guards nutzen dieselbe Prüfung', () => {
  // Vier Stellen prüfen den Transport: supabaseRequest, supabaseJson, supabaseRpc und
  // writeToSupabaseAsync. Guards, die auseinanderlaufen, sind genau die Drift, die den
  // void-RPC-Vorfall verursacht hat. supabaseRpc ist der kritische Pfad
  // (submit_lead_complete) - dort wäre ein stilles null ein verlorener Lead.
  const treffer = bridge.match(/transportFehlt\(\)/g) || [];
  assert.ok(treffer.length >= 5,
    `erwartet mindestens 5 Vorkommen von transportFehlt() (1 Definition + 4 Aufrufe), gefunden ${treffer.length}`);
});
