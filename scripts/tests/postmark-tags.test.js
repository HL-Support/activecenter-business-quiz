'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

/**
 * Wächter: Jede Postmark-Versandstelle im Repo trägt einen `Tag`.
 *
 * Warum das zählt: Bis zum 28.08.2026 trug **keine einzige** der 837 Mails einen Tag —
 * jede Auswertung musste Betreffzeilen zurückrechnen (docs/MAILWEGE.md §4). Ohne Tag ist
 * in Postmark nicht unterscheidbar, welcher Mailtyp welche Zustellrate hat.
 *
 * Am 31.08.2026 fiel auf, dass `api/lead-system-health.js` als einzige Stelle noch ganz
 * ohne Tag sendete. Dieser Test hält den Stand fest, statt ihn zu dokumentieren.
 */

const API = path.resolve(__dirname, '..', '..', 'api');

/**
 * Verankert wird an `MessageStream` — das ist der verlaessliche Marker einer
 * Postmark-Nutzlast. Am `fetch`-Aufruf zu verankern waere falsch: Zwei Stellen sind
 * generische Sendehelfer, die den Nachrichtenkoerper als Parameter bekommen und
 * naturgemaess selbst keinen Tag tragen.
 */
const MARKER = /MessageStream:\s*POSTMARK_MESSAGE_STREAM/;

function dateien(verzeichnis) {
  return fs
    .readdirSync(verzeichnis, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.js'))
    .map((e) => path.join(verzeichnis, e.name));
}

test('jede Postmark-Nutzlast traegt einen Tag', () => {
  const ohneTag = [];
  let nutzlasten = 0;

  for (const datei of dateien(API)) {
    const zeilen = fs.readFileSync(datei, 'utf8').split('\n');
    zeilen.forEach((zeile, i) => {
      if (!MARKER.test(zeile)) return;
      nutzlasten += 1;
      // Der Tag steht unmittelbar beim MessageStream — drei Zeilen Puffer genuegen.
      const fenster = zeilen.slice(Math.max(0, i - 3), i + 4).join('\n');
      if (!/\bTag:\s*'/.test(fenster)) {
        ohneTag.push(`${path.basename(datei)}:${i + 1}`);
      }
    });
  }

  assert.equal(nutzlasten, 5, `erwartet 5 Postmark-Nutzlasten, gefunden ${nutzlasten}`);
  assert.deepEqual(
    ohneTag,
    [],
    `Postmark-Nutzlast ohne Tag — in Postmark spaeter nicht auswertbar: ${ohneTag.join(', ')}`
  );
});

test('die Tags sind eindeutig benannt und folgen der Systematik', () => {
  const erwartet = new Set([
    'hot_lead',
    'hot_lead_legacy',
    'alert_missing_member_id',
    'alert_points_result_failed',
    'alert_lead_system_health',
  ]);

  const gefunden = new Set();
  for (const datei of dateien(API)) {
    const inhalt = fs.readFileSync(datei, 'utf8');
    for (const treffer of inhalt.matchAll(/\bTag:\s*'([a-z0-9_]+)'/g)) {
      gefunden.add(treffer[1]);
    }
  }

  assert.deepEqual(
    [...gefunden].sort(),
    [...erwartet].sort(),
    'Tag-Liste weicht ab — docs/MAILWEGE.md §4 mitziehen'
  );
});
