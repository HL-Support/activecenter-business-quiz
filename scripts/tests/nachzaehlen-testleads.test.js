'use strict';

/**
 * Quelltext-Vertraege der Testlead-Behandlung im Nachzaehlen (Auftrag Markus,
 * 02.09.2026, nach der Befund-Nachlese: 39 Opt-ins / 20 Schatten am 01.09.,
 * Delta = exakt die 19 markierten E2E-Leads).
 *
 * Der Vertrag in einem Satz: Testleads werden AUSGEWIESEN, nicht mitgezaehlt —
 * die Paritaet Opt-ins <-> Uebermittlungen vergleicht nur echten Verkehr, und
 * gescheiterte/offene Uebermittlungen alarmieren weiterhin uneingeschraenkt.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.resolve(__dirname, '../../scripts/contacts-quiz-nachzaehlen.js'),
  'utf8'
);

test('Opt-ins und Paritaets-Uebermittlungen schliessen Testleads aus', () => {
  // Beide Zaehler filtern ueber dieselbe Marke — eine Wahrheit, nicht zwei.
  const marken = source.match(/event_name = 'test_lead_marked'/g) || [];
  assert.ok(
    marken.length >= 4,
    `test_lead_marked muss in Opt-in- UND Protokoll-Zaehler stehen (gefunden: ${marken.length})`
  );
  assert.ok(
    /count\(\*\) FILTER \(WHERE NOT EXISTS \(\s*SELECT 1 FROM leads\.lead_events/.test(source),
    'der Opt-in-Zaehler muss echte Leads ueber NOT EXISTS auf die Testmarke zaehlen'
  );
});

test('Testleads erscheinen als eigene Spalte in Tabelle und JSON', () => {
  assert.ok(source.includes('AS testleads'), 'SQL muss eine testleads-Spalte liefern');
  assert.ok(source.includes('Testleads'), 'die Tabellenueberschrift muss Testleads zeigen');
  assert.ok(
    /zeilen\.push\(\{ tag, optins, testleads,/.test(source),
    'die JSON-Zeilen muessen testleads tragen'
  );
});

test('gescheitert und offen alarmieren weiterhin fuer ALLE Zeilen, auch Testleads', () => {
  // Die failed/pending-Zaehler duerfen KEINEN Testlead-Filter tragen: ein
  // gescheiterter Schattenversuch ist auch bei einem Testlead ein Befund.
  const gescheitertZeile = source.match(/count\(\*\) FILTER \(WHERE c\.status = 'failed'[^\n]*/);
  const offenZeile = source.match(/count\(\*\) FILTER \(WHERE c\.status = 'pending'[^\n]*/);
  assert.ok(gescheitertZeile && !gescheitertZeile[0].includes('test_lead_marked'));
  assert.ok(offenZeile && !offenZeile[0].includes('test_lead_marked'));
});
