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

test('ALLE Transport-Guards nutzen dieselbe Prüfung', () => {
  // Vier Stellen prüfen den Transport: supabaseRequest, supabaseJson, supabaseRpc und
  // writeToSupabaseAsync. Guards, die auseinanderlaufen, sind genau die Drift, die den
  // void-RPC-Vorfall verursacht hat. supabaseRpc ist der kritische Pfad
  // (submit_lead_complete) - dort wäre ein stilles null ein verlorener Lead.
  const treffer = bridge.match(/transportFehlt\(\)/g) || [];
  assert.ok(treffer.length >= 5,
    `erwartet mindestens 5 Vorkommen von transportFehlt() (1 Definition + 4 Aufrufe), gefunden ${treffer.length}`);
});
