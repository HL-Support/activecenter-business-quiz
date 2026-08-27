#!/usr/bin/env node
'use strict';

// Phase-5-Testimport, Schritt 2: Paritaetsvergleich Quelle (Supabase, Schnappschuss aus
// phase5-schema-export.js) gegen den Testimport auf dem PG18-Server (10.0.1.3).
//
// Verglichen wird je Objektart die DEFINITION (Spalten+Typ+NotNull+Default, Constraint-,
// Index-, Trigger-Definition, Funktions- und View-Quelltext). pg_get_*-Ausgaben koennen
// zwischen Postgres-Versionen minimal anders formatiert sein - deshalb wird Whitespace
// normalisiert und ein Rest-Unterschied als PRUEFEN gemeldet, nicht stumm geschluckt.
//
//   node scripts/phase5-testimport-vergleich.js [pfad-zum-paritaet-live-json]

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const SSH = 'C:/Windows/System32/OpenSSH/ssh.exe';
const HOST = 'root@91.99.76.104';
const KEY = 'C:/Users/Markus/.ssh/id_rsa';
const DB = 'business_leads_testimport';

const livePfad = process.argv[2] || path.join(__dirname, '..', 'docs', 'audits',
  'cutover-vorbereitung', 'phase5-testimport', `paritaet-live-${new Date().toISOString().slice(0, 10)}.json`);
const live = JSON.parse(fs.readFileSync(livePfad, 'utf8'));

const inListeTab = [...new Set(live.spalten.map((z) => `('${z.schema}','${z.tabelle}')`))].join(',');
const inListeView = live.views.map((v) => `('${v.schema}','${v.name}')`).join(',');
const inListeFn = live.funktionen.map((f) => `('${f.schema}','${f.name}')`).join(',');

const ABFRAGEN = {
  spalten: `select json_agg(x) from (
    select n.nspname as schema, c.relname as tabelle, a.attname as spalte,
           format_type(a.atttypid, a.atttypmod) as typ, a.attnotnull as not_null,
           a.attidentity as identity,
           pg_get_expr(d.adbin, d.adrelid) as default_ausdruck
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
    left join pg_attrdef d on d.adrelid = c.oid and d.adnum = a.attnum
    where (n.nspname, c.relname) in (${inListeTab})
    order by n.nspname, c.relname, a.attnum) x`,
  constraints: `select json_agg(x) from (
    select n.nspname as schema, c.relname as tabelle, con.conname as name,
           pg_get_constraintdef(con.oid) as definition
    from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    where (n.nspname, c.relname) in (${inListeTab})
      -- PG18 fuehrt NOT NULL als benannte Constraints (contype 'n', neu seit PG17) -
      -- die Quelle (aelteres PG) kennt nur attnotnull. Kein echter Unterschied: der
      -- Spaltenvergleich prueft not_null bereits je Spalte.
      and con.contype <> 'n'
    order by con.conname) x`,
  indexe: `select json_agg(x) from (
    select schemaname as schema, tablename as tabelle, indexname as name, indexdef as definition
    from pg_indexes where (schemaname, tablename) in (${inListeTab})
    order by indexname) x`,
  views: `select json_agg(x) from (
    select n.nspname as schema, c.relname as name, pg_get_viewdef(c.oid, true) as definition
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where c.relkind = 'v' and (n.nspname, c.relname) in (${inListeView})
    order by c.relname) x`,
  funktionen: `select json_agg(x) from (
    select n.nspname as schema, p.proname as name, pg_get_functiondef(p.oid) as definition
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where (n.nspname, p.proname) in (${inListeFn})
    order by p.proname) x`,
  trigger: `select json_agg(x) from (
    select n.nspname as schema, c.relname as tabelle, t.tgname as name,
           pg_get_triggerdef(t.oid) as definition
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where not t.tgisinternal and (n.nspname, c.relname) in (${inListeTab})
    order by t.tgname) x`,
};

function norm(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function remoteJson(sql) {
  const out = execFileSync(SSH,
    ['-o', 'StrictHostKeyChecking=no', '-i', KEY, HOST,
      `sudo -u postgres psql -d ${DB} -tA`],
    { input: sql + ';\n', encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 120000 });
  const zeile = out.trim();
  return zeile ? JSON.parse(zeile) : [];
}

function vergleiche(art, liveZeilen, testZeilen, schluessel, wert) {
  const key = (z) => schluessel.map((k) => z[k]).join('|');
  const testMap = new Map(testZeilen.map((z) => [key(z), z]));
  const befunde = [];
  for (const l of liveZeilen) {
    const t = testMap.get(key(l));
    if (!t) { befunde.push(`FEHLT im Testimport: ${art} ${key(l)}`); continue; }
    if (norm(wert(l)) !== norm(wert(t))) {
      befunde.push(`PRUEFEN ${art} ${key(l)}\n    live: ${norm(wert(l)).slice(0, 160)}\n    test: ${norm(wert(t)).slice(0, 160)}`);
    }
    testMap.delete(key(l));
  }
  for (const uebrig of testMap.keys()) befunde.push(`NUR im Testimport: ${art} ${uebrig}`);
  return befunde;
}

(function main() {
  const alle = [];
  const zaehlung = [];

  const test = {};
  for (const [name, sql] of Object.entries(ABFRAGEN)) test[name] = remoteJson(sql);

  alle.push(...vergleiche('Spalte', live.spalten, test.spalten,
    ['schema', 'tabelle', 'spalte'],
    (z) => `${z.typ} | notnull=${z.not_null} | identity=${z.identity || ''} | default=${z.default_ausdruck || ''}`));
  alle.push(...vergleiche('Constraint', live.constraints, test.constraints,
    ['schema', 'tabelle', 'name'], (z) => z.definition));
  alle.push(...vergleiche('Index', live.indexe, test.indexe,
    ['schema', 'tabelle', 'name'], (z) => z.definition));
  alle.push(...vergleiche('View', live.views, test.views,
    ['schema', 'name'], (z) => z.definition));
  alle.push(...vergleiche('Funktion', live.funktionen, test.funktionen,
    ['schema', 'name'], (z) => z.definition));
  alle.push(...vergleiche('Trigger', live.trigger, test.trigger,
    ['schema', 'tabelle', 'name'], (z) => z.definition));

  zaehlung.push(`Spalten ${live.spalten.length}/${test.spalten.length}`);
  zaehlung.push(`Constraints ${live.constraints.length}/${test.constraints.length}`);
  zaehlung.push(`Indexe ${live.indexe.length}/${test.indexe.length}`);
  zaehlung.push(`Views ${live.views.length}/${test.views.length}`);
  zaehlung.push(`Funktionen ${live.funktionen.length}/${test.funktionen.length}`);
  zaehlung.push(`Trigger ${live.trigger.length}/${test.trigger.length}`);

  console.log(`\nParitaetsvergleich Quelle -> ${DB} (live/test): ${zaehlung.join(' · ')}\n`);
  if (!alle.length) {
    console.log('  Keine Abweichungen - der Testimport ist definitionsgleich zur Quelle.');
  } else {
    for (const b of alle) console.log('  ' + b);
    console.log(`\n  ${alle.length} Befund(e).`);
  }
  process.exit(alle.some((b) => b.startsWith('FEHLT') || b.startsWith('NUR')) ? 1 : 0);
})();
