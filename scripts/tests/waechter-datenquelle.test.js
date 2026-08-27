const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Die Datenquelle des Wächters entscheidet, WELCHE Datenbank überwacht wird. Der
// teuerste Fehler dieses Projekts wäre ein Wächter, der nach dem Cutover weiter die
// alte Datenbank befragt und zufrieden "alles ruhig" meldet.

const quelle = fs.readFileSync(
  path.join(__dirname, '..', 'waechter-datenquelle.js'), 'utf8'
);
const waechter = fs.readFileSync(
  path.join(__dirname, '..', 'waechter-nurture.js'), 'utf8'
);

test('Standard ist die heutige Quelle - Umschalten ist eine bewusste Handlung', () => {
  // Kein Automatismus: Wer nicht umschaltet, bekommt den bisherigen Zustand, nicht
  // eine halb umgestellte Mischung.
  assert.match(quelle, /process\.env\.WAECHTER_QUELLE \|\| 'supabase'/);
});

test('der Wächter fragt nur über die Datenquelle, nicht an ihr vorbei', () => {
  // Ein direkter executeManagementQuery-Aufruf wäre nach dem Cutover ein stiller
  // Rückkanal auf die ALTE Datenbank - genau der Fehler, den diese Schicht verhindert.
  assert.doesNotMatch(waechter, /executeManagementQuery/,
    'waechter-nurture.js greift wieder direkt auf die Management-API zu');
  assert.match(waechter, /require\('\.\/waechter-datenquelle\.js'\)/);
});

test('der Wächter weist die befragte Quelle im Protokoll aus', () => {
  // Wer das Protokoll liest, muss sehen, welche Datenbank gemeint ist.
  assert.match(waechter, /Quelle\s+: \$\{MODUS\}/,
    'die Quelle steht nicht mehr im Protokollkopf');
  assert.match(waechter, /quelle: MODUS/,
    'die JSON-Ausgabe nennt die Quelle nicht');
});

test('das SQL wird im Plattform-Modus auf die Zielschemata abgebildet', () => {
  // Und zwar mit DERSELBEN Abbildung wie der Schema-Export - keine zweite Wahrheit.
  assert.match(quelle, /require\('\.\/phase5-schema-abbildung\.js'\)/);
  assert.match(quelle, /bildeDefinitionAb\(sql\)/);
});

test('Zeitstempel werden normalisiert - beide Modi liefern denselben Typ', () => {
  // Gemessen am 27.08.2026: Die Management-API liefert ISO-Strings, der Treiber
  // native Date-Objekte. `String(wert).slice(0, 10)` ergab damit einmal "2026-06-11"
  // und einmal "Thu Jun 11". Im Protokoll kosmetisch, beim Datumsvergleich still
  // falsch. Die Schicht muss den Unterschied schlucken, nicht weiterreichen.
  assert.match(quelle, /v instanceof Date \? v\.toISOString\(\) : v/,
    'die Typ-Normalisierung fehlt - der Plattform-Modus liefert Date statt String');
});

test('die Verbindung wird geschlossen, auch im Fehlerfall', () => {
  // Ein offener Pool hält den Prozess am Leben; der Container liefe in den
  // Cron-Ueberlauf und der Herzschlag bliebe aus - was wie eine Stoerung aussieht,
  // obwohl der Lauf sauber war.
  assert.match(waechter, /await schliessen\(\);/);
  assert.match(waechter, /await schliessen\(\)\.catch/);
});

test('ein fehlender Treiber meldet sich sprechend, statt kryptisch zu scheitern', () => {
  assert.match(quelle, /das Paket "postgres" fehlt/);
  assert.match(quelle, /Zugangsdaten fehlen/);
});
