const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Die Transportschicht entscheidet, WELCHE Datenbank die Anwendung beschreibt.
// Ein versehentlich umgestellter Standard oder eine Teilumstellung wären
// Split-Brain: zwei Datenbanken, beide halb gefüllt, keine vollständig.

const transport = fs.readFileSync(
  path.join(__dirname, '..', '..', 'server', 'db-transport.js'), 'utf8'
);
const leadSystem = fs.readFileSync(
  path.join(__dirname, '..', '..', 'server', 'lead-system.js'), 'utf8'
);

test('Standard ist der heutige HTTP-Weg - Umschalten ist eine bewusste Handlung', () => {
  assert.match(transport, /process\.env\.LEADS_DB_MODUS \|\| 'postgrest'/);
});

test('ohne gesetzten Modus meldet die Schicht "nicht direkt"', () => {
  // Der echte Modul-Zustand, nicht nur der Quelltext: In der Testumgebung ist
  // LEADS_DB_MODUS nicht gesetzt, also MUSS der HTTP-Weg gelten.
  const modul = require('../../server/db-transport.js');
  assert.equal(modul.istDirekt(), false);
  assert.equal(modul.MODUS, 'postgrest');
});

test('es gibt genau EINEN Schalter - keine Teilumstellung möglich', () => {
  // Eine zweite Bedingung (etwa "nur RPCs direkt") wäre Split-Brain im Kleinen.
  const treffer = leadSystem.match(/istDirekt\(\)/g) || [];
  assert.equal(treffer.length, 1,
    `istDirekt() wird ${treffer.length}-mal geprüft - erwartet genau einmal, sonst droht Teilumstellung`);
});

test('die Umschaltung sitzt in der gemeinsamen Funktion, nicht in den Aufrufern', () => {
  // Alle ~30 Aufrufstellen laufen durch supabaseRequest. Läge der Schalter in den
  // Aufrufern, würde man beim nächsten neuen Aufruf einen vergessen.
  assert.match(leadSystem,
    /async function supabaseRequest[\s\S]{0,400}?dbTransport\.istDirekt\(\)/,
    'die Weiche steht nicht am Anfang von supabaseRequest');
});

test('die Antwort-Attrappe erfüllt den Vertrag der Aufrufer', () => {
  // Aufrufer prüfen response.ok, lesen .status und rufen .json()/.text().
  for (const feld of ['ok:', 'status:', 'async json()', 'async text()']) {
    assert.ok(transport.includes(feld), `die Attrappe bietet kein ${feld}`);
  }
});

test('leere Rückgaben werden 204 - der Leere-Antwort-Guard greift weiter', () => {
  // supabaseJson wertet status === 204 aus. Käme hier 200 mit leerem Text, liefe
  // der Guard ins Leere und JSON.parse('') würde werfen - exakt der void-RPC-Vorfall.
  assert.match(transport, /status: nutzlast === null \? 204 : 200/);
});

test('fehlender Treiber und fehlende Zugangsdaten melden sich sprechend', () => {
  assert.match(transport, /das Paket "postgres" fehlt/);
  assert.match(transport, /Zugangsdaten fehlen/);
});

test('der Verbindungspool bleibt unter dem CONNECTION LIMIT der Rolle', () => {
  // leads_app hat CONNECTION LIMIT 8. Ein größerer Pool liefe unter Last in
  // "too many connections" - und zwar erst in der Spitze, wenn es wehtut.
  const m = transport.match(/LEADS_DB_POOL \|\| (\d+)/);
  assert.ok(m, 'keine Pool-Obergrenze gesetzt');
  assert.ok(Number(m[1]) < 8, `Pool ${m[1]} liegt nicht unter dem Rollenlimit 8`);
});
