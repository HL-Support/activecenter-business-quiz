#!/usr/bin/env node
'use strict';

/**
 * Der Grenzzaun um `server/legacy/`.
 *
 * Vorbild: `analysen/scripts/lint.js` und `Umfragen/scripts/lint-grenze.js`.
 * Der Sinn: Es soll GENAU EINEN Ort im Repo geben, der mit dem Altsystem spricht.
 * Wird das Altsystem eines Tages ersetzt, aendert sich nur dieser Ordner — aber das
 * gilt nur, solange niemand nebenher eine zweite Tuer aufmacht. Genau das verhindert
 * dieses Skript, und zwar in `pnpm run lint`, nicht in einem Merkzettel.
 *
 * Laeuft ohne Abhaengigkeiten und ohne Netz.
 */

const fs = require('node:fs');
const path = require('node:path');

const WURZEL = path.resolve(__dirname, '..');

/** Nur hier darf mit dem Altsystem gesprochen werden. */
const ERLAUBT = ['server/legacy/'];

/**
 * Zusaetzlich erlaubt, mit Begruendung — die Liste ist absichtlich kurz und namentlich.
 * Wer hier etwas eintraegt, soll erklaeren muessen, warum.
 */
const AUSNAHMEN = new Map([
  ['sql/legacy-views.sql', 'Die View-Definition selbst — sie IST das Altsystem-Artefakt.'],
  ['scripts/lint-grenze.js', 'Dieses Skript nennt die verbotenen Muster naturgemaess selbst.'],
  [
    'api/bridge.js',
    'Uebergangsweise: haelt bis zum Abschluss von Strang B noch BRIDGE_URL und die ' +
      'forward_webhook-Wege. Faellt mit B5 weg.',
  ],
  [
    'api/lead-outbox-worker.js',
    'Uebergangsweise: haelt bis zum Abschluss von Strang A noch den Bridge-Weg als ' +
      'Standardquelle. Faellt mit A5 weg.',
  ],
  [
    'scripts/abgleich-videorang.js',
    'Einmaliges Analyseskript, laeuft von Hand ueber SSH gegen die Legacy-MySQL. ' +
      'Nicht Teil der Laufzeit — das Dockerfile kopiert nur api/, server/ und dist/.',
  ],
  [
    'scripts/backfill-antworten.js',
    'Einmaliges Nachtragsskript, laeuft von Hand ueber SSH. Ebenfalls nicht im Container.',
  ],
]);

/**
 * Was ausserhalb der Grenze nichts zu suchen hat.
 *
 * 🔴 Bewusst NICHT in dieser Liste: Adressen aus `10.0.1.x`. Unter 10.0.1.3 liegt
 * sowohl die Legacy-MySQL als auch die Plattform-Postgres — ein Verbot dort wuerde
 * den voellig legitimen Plattformzugriff treffen und waere ein Fehlalarm-Erzeuger.
 * Die Grenze zieht sich an dem entlang, was das Altsystem AUSMACHT: sein Treiber,
 * seine Schemata, seine Bridge, seine Zugangsdaten.
 */
const VERBOTEN = [
  { muster: /\bmysql2\b/, name: 'mysql2 (Treiber des Altsystems)' },
  { muster: /prod_activesupport|prod_quiz|prod_contacts_activesupport/, name: 'Legacy-Schema' },
  { muster: /db-bridge\.php/, name: 'die alte PHP-Bridge' },
  { muster: /LEGACY_MYSQL_/, name: 'Zugangsdaten des Altsystems' },
];

/**
 * Kommentarzeilen werden uebersprungen. Ueber das Altsystem zu SCHREIBEN ist erlaubt
 * und sogar erwuenscht — verboten ist, es anzusprechen. Ohne diese Unterscheidung
 * bestraft der Zaun genau die Dokumentation, die erklaert, warum es ihn gibt.
 */
function istKommentar(zeile) {
  const t = zeile.trim();
  return (
    t.startsWith('//') ||
    t.startsWith('*') ||
    t.startsWith('/*') ||
    t.startsWith('--') ||
    t.startsWith('#')
  );
}

const ENDUNGEN = new Set(['.js', '.jsx', '.mjs', '.cjs', '.sql']);
const UEBERSPRINGEN = new Set([
  'node_modules',
  '.git',
  'dist',
  'coverage',
  'test-results',
  '.playwright-cli',
  'n8n',
  'docs',
  'nurture',
]);

function* dateien(verzeichnis) {
  for (const eintrag of fs.readdirSync(verzeichnis, { withFileTypes: true })) {
    if (UEBERSPRINGEN.has(eintrag.name)) continue;
    const voll = path.join(verzeichnis, eintrag.name);
    if (eintrag.isDirectory()) yield* dateien(voll);
    else if (ENDUNGEN.has(path.extname(eintrag.name))) yield voll;
  }
}

function relativ(p) {
  return path.relative(WURZEL, p).split(path.sep).join('/');
}

const befunde = [];
for (const datei of dateien(WURZEL)) {
  const rel = relativ(datei);
  if (ERLAUBT.some((prefix) => rel.startsWith(prefix))) continue;
  if (AUSNAHMEN.has(rel)) continue;

  const zeilen = fs.readFileSync(datei, 'utf8').split('\n');
  zeilen.forEach((zeile, i) => {
    if (istKommentar(zeile)) return;
    for (const { muster, name } of VERBOTEN) {
      if (muster.test(zeile)) befunde.push(`${rel}:${i + 1}  ${name}`);
    }
  });
}

if (befunde.length) {
  console.error('\n🔴 Grenzverletzung: Zugriff auf das Altsystem ausserhalb von server/legacy/\n');
  befunde.forEach((b) => console.error('   ' + b));
  console.error(
    '\nEntweder den Zugriff nach server/legacy/ verlegen — oder, wenn es wirklich dort\n' +
      'hingehoert, in scripts/lint-grenze.js unter AUSNAHMEN eintragen. Mit Begruendung.\n'
  );
  process.exit(1);
}

console.log(`Grenze eingehalten (${ERLAUBT.join(', ')}, ${AUSNAHMEN.size} benannte Ausnahmen).`);
