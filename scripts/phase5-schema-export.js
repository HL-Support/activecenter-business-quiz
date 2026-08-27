#!/usr/bin/env node
'use strict';

// Phase-5-Testimport (Audit 13.5): erzeugt den SELEKTIVEN Schema-Export des
// Business-Leads-Verbunds direkt aus dem Live-Katalog (read-only, Management-API).
//
// Warum aus dem Katalog und nicht aus den Repo-SQL-Dateien: Die Repo-Dateien sind der
// Bauplan, aber die Live-DB hat nachtraegliche Migrationen (z.B. mysql_contact_id,
// points_rank-Umfeld) - Wahrheit ist der Katalog. Und warum nicht pg_dump: Es gibt
// bewusst kein DB-Passwort in den Secrets; der Katalogweg reicht fuer Schema-DDL und
// wird am Ende durch den Paritaetsvergleich (phase5-testimport-vergleich.js) bewiesen.
//
// Bewusst NICHT exportiert (Entscheidungen 27.08., phase5-objektauswahl-2026-08-27.md):
//   - RLS-Policies und Grants: auf Hetzner gilt ein eigenes Rollenmodell.
//   - pg_cron: der Job refresh_event_daily wird auf dem Ziel als eigener Schritt
//     angelegt, Jobs lassen sich nicht dumpen.
//   - archive-Schema (leer, HBA), hba_*, webhook_*, marathon, Supabase-Interna.
//
//   node scripts/phase5-schema-export.js
//     -> docs/audits/cutover-vorbereitung/phase5-testimport/schema-<datum>.sql
//     -> docs/audits/cutover-vorbereitung/phase5-testimport/paritaet-live-<datum>.json

const fs = require('fs');
const path = require('path');
const { executeManagementQuery } = require('./stats-logs-baseline.js');

const TABELLEN = [
  ['public', 'lead_state'], ['public', 'lead_events'], ['public', 'lead_video_progress'],
  ['public', 'lead_answers_current'], ['public', 'lead_sync_outbox'], ['public', 'lead_profiles'],
  ['public', 'app_config'], ['public', 'nurture_sequences'], ['public', 'nurture_runs'],
  ['public', 'nurture_subject_states'], ['public', 'tracking_sessions'], ['public', 'tracking_events'],
  ['public', 'tracking_video_progress'], ['public', 'quiz_sessions'], ['public', 'lead_migration_unresolved'],
  ['public', 'lead_contact_crm'], ['analytics_internal', 'event_daily'], ['analytics_internal', 'refresh_runs'],
];
const VIEWS = [
  ['public', 'v_lead_state_full'], ['public', 'v_sync_dead_jobs'], ['public', 'v_funnel_analysis'],
  ['public', 'v_resume_metrics'], ['public', 'v_completion_metrics'], ['public', 'v_nurture_runs_wahr'],
];
const FUNKTIONEN = [
  ['public', 'init_lead'], ['public', 'upsert_answer_current'], ['public', 'enqueue_lead_sync'],
  ['public', 'upsert_video_progress_monotonic'], ['public', 'claim_outbox_jobs'],
  ['public', 'mark_outbox_done'], ['public', 'mark_outbox_failed'], ['public', 'set_updated_at'],
  ['public', 'record_nurture_sent'], ['public', 'record_nurture_skip'], ['public', 'record_nurture_run'],
  ['public', 'record_nurture_failure'], ['public', 'nurture_overview'], ['public', 'nurture_people_page'],
  ['public', 'nurture_events_page'], ['public', 'nurture_health_signals'],
  ['public', 'analytics_dashboard_v2'], ['public', 'analytics_events_page_v2'],
  ['public', 'submit_lead_complete'], ['analytics_internal', 'refresh_event_daily'],
];
const TRIGGER_TABELLEN = TABELLEN.map(([s, t]) => `${s}.${t}`);

const inListe = (paare) => paare.map(([s, t]) => `('${s}','${t}')`).join(',');

async function main() {
  const datum = new Date().toISOString().slice(0, 10);
  const zielDir = path.join(__dirname, '..', 'docs', 'audits', 'cutover-vorbereitung', 'phase5-testimport');
  fs.mkdirSync(zielDir, { recursive: true });

  // attidentity ist Pflicht: Identity-Spalten (GENERATED ... AS IDENTITY) haben KEINEN
  // pg_attrdef-Default - ohne dieses Feld entstehen nackte Spalten ohne Zaehler. Genau so
  // beim ersten Funktionsbeweis am 27.08. gefunden (Outbox-Insert scheiterte an id null).
  const spalten = await executeManagementQuery(`
    select n.nspname as schema, c.relname as tabelle, a.attname as spalte, a.attnum,
           format_type(a.atttypid, a.atttypmod) as typ,
           a.attnotnull as not_null,
           a.attidentity as identity,
           pg_get_expr(d.adbin, d.adrelid) as default_ausdruck
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
    left join pg_attrdef d on d.adrelid = c.oid and d.adnum = a.attnum
    where (n.nspname, c.relname) in (${inListe(TABELLEN)})
    order by n.nspname, c.relname, a.attnum`);

  // Reihenfolge nach Typ: erst PK (p), dann UNIQUE (u), CHECK (c), zuletzt FK (f) -
  // ein FK braucht den Unique-Traeger seiner Zieltabelle. Beim ersten Importlauf am
  // 27.08. scheiterte genau das (FK auf lead_state vor deren PK).
  const constraints = await executeManagementQuery(`
    select n.nspname as schema, c.relname as tabelle, con.conname as name, con.contype as typ,
           pg_get_constraintdef(con.oid) as definition
    from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    where (n.nspname, c.relname) in (${inListe(TABELLEN)})
    order by array_position(array['p','u','c','f'], con.contype::text), n.nspname, c.relname, con.conname`);

  const indexe = await executeManagementQuery(`
    select schemaname as schema, tablename as tabelle, indexname as name, indexdef as definition
    from pg_indexes
    where (schemaname, tablename) in (${inListe(TABELLEN)})
    order by schemaname, tablename, indexname`);

  const sequenzen = await executeManagementQuery(`
    select s.schemaname as schema, s.sequencename as name, s.data_type::text as typ,
           s.start_value, s.increment_by, s.min_value, s.max_value, s.cache_size, s.cycle,
           d.refobjid::regclass::text as gehoert_zu_tabelle, a.attname as gehoert_zu_spalte
    from pg_sequences s
    join pg_class sc on sc.relname = s.sequencename
    join pg_namespace sn on sn.oid = sc.relnamespace and sn.nspname = s.schemaname
    left join pg_depend d on d.objid = sc.oid and d.deptype in ('a','i')
      and d.refclassid = 'pg_class'::regclass
    left join pg_attribute a on a.attrelid = d.refobjid and a.attnum = d.refobjsubid
    where sc.relkind = 'S'
      and (s.schemaname = 'analytics_internal' or s.schemaname = 'public')
      -- Identity-Sequenzen (deptype 'i') legt die Identity-Spalte selbst an - eine
      -- zusaetzliche CREATE SEQUENCE waere ein Namenskonflikt oder eine Waise.
      and d.deptype is distinct from 'i'`);

  const views = await executeManagementQuery(`
    select n.nspname as schema, c.relname as name, pg_get_viewdef(c.oid, true) as definition
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where c.relkind = 'v' and (n.nspname, c.relname) in (${inListe(VIEWS)})`);

  const funktionen = await executeManagementQuery(`
    select n.nspname as schema, p.proname as name,
           pg_get_functiondef(p.oid) as definition,
           pg_get_function_identity_arguments(p.oid) as argumente
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where (n.nspname, p.proname) in (${inListe(FUNKTIONEN)})
    order by n.nspname, p.proname`);

  const trigger = await executeManagementQuery(`
    select n.nspname as schema, c.relname as tabelle, t.tgname as name,
           pg_get_triggerdef(t.oid) as definition
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where not t.tgisinternal
      and (n.nspname, c.relname) in (${inListe(TABELLEN)})
    order by n.nspname, c.relname, t.tgname`);

  // Vollstaendigkeit erzwingen: fehlt ein ausgewaehltes Objekt im Katalog, ist das ein
  // harter Fehler - stille Luecken sind genau die Fehlerklasse dieses Projekts.
  const fehlend = [];
  for (const [s, t] of TABELLEN) if (!spalten.some((z) => z.schema === s && z.tabelle === t)) fehlend.push(`Tabelle ${s}.${t}`);
  for (const [s, v] of VIEWS) if (!views.some((z) => z.schema === s && z.name === v)) fehlend.push(`View ${s}.${v}`);
  for (const [s, f] of FUNKTIONEN) if (!funktionen.some((z) => z.schema === s && z.name === f)) fehlend.push(`Funktion ${s}.${f}`);
  if (fehlend.length) throw new Error('Auswahl-Objekte fehlen im Live-Katalog: ' + fehlend.join(', '));

  const zeilen = [];
  zeilen.push('-- Phase-5-Testimport: selektiver Schema-Export des Business-Leads-Verbunds');
  zeilen.push(`-- Erzeugt ${new Date().toISOString()} aus dem Live-Katalog (scripts/phase5-schema-export.js)`);
  zeilen.push('-- Auswahlgrundlage: docs/audits/cutover-vorbereitung/phase5-objektauswahl-2026-08-27.md');
  zeilen.push('-- Ohne RLS/Grants/pg_cron (eigenes Rollenmodell bzw. eigener Schritt auf dem Ziel).');
  zeilen.push('');
  zeilen.push('\\set ON_ERROR_STOP on');
  zeilen.push('BEGIN;');
  zeilen.push('');
  zeilen.push('CREATE EXTENSION IF NOT EXISTS pgcrypto;');
  zeilen.push('CREATE SCHEMA IF NOT EXISTS analytics_internal;');
  zeilen.push('');

  const auswahlSequenzen = sequenzen.filter((s) =>
    s.gehoert_zu_tabelle && TABELLEN.some(([sch, t]) => s.gehoert_zu_tabelle === `${t}` || s.gehoert_zu_tabelle === `${sch}.${t}`)
  );
  zeilen.push('-- Sequenzen (nur die der Auswahl-Tabellen; Zaehlerstaende setzt der echte');
  zeilen.push('-- Cutover auf max(id)+Puffer, der Testimport laesst sie bei Start).');
  for (const s of auswahlSequenzen) {
    zeilen.push(`CREATE SEQUENCE ${s.schema}.${s.name} AS ${s.typ} INCREMENT BY ${s.increment_by} MINVALUE ${s.min_value} MAXVALUE ${s.max_value} START WITH ${s.start_value} CACHE ${s.cache_size}${s.cycle ? ' CYCLE' : ''};`);
  }
  zeilen.push('');

  for (const [schema, tabelle] of TABELLEN) {
    const cols = spalten.filter((z) => z.schema === schema && z.tabelle === tabelle);
    zeilen.push(`CREATE TABLE ${schema}.${tabelle} (`);
    zeilen.push(cols.map((c) => {
      let def = `  ${JSON.stringify(c.spalte) === `"${c.spalte}"` ? c.spalte : `"${c.spalte}"`} ${c.typ}`;
      if (c.identity === 'a') def += ' GENERATED ALWAYS AS IDENTITY';
      else if (c.identity === 'd') def += ' GENERATED BY DEFAULT AS IDENTITY';
      else if (c.default_ausdruck) def += ` DEFAULT ${c.default_ausdruck}`;
      if (c.not_null) def += ' NOT NULL';
      return def;
    }).join(',\n'));
    zeilen.push(');');
    zeilen.push('');
  }

  zeilen.push('-- Constraints in Typ-Reihenfolge PK, UNIQUE, CHECK, FK. Die Auswahl traegt 7 FKs,');
  zeilen.push('-- alle INNERHALB der Auswahl (lead_* -> lead_state, nurture_* -> nurture_sequences).');
  for (const c of constraints) {
    zeilen.push(`ALTER TABLE ${c.schema}.${c.tabelle} ADD CONSTRAINT ${c.name} ${c.definition};`);
  }
  zeilen.push('');

  zeilen.push('-- Sequenz-Eigentum (haelt DROP TABLE und Dump-Verhalten identisch zur Quelle).');
  for (const s of auswahlSequenzen) {
    const ziel = s.gehoert_zu_tabelle.includes('.') ? s.gehoert_zu_tabelle : `public.${s.gehoert_zu_tabelle}`;
    zeilen.push(`ALTER SEQUENCE ${s.schema}.${s.name} OWNED BY ${ziel}.${s.gehoert_zu_spalte};`);
  }
  zeilen.push('');

  const constraintNamen = new Set(constraints.map((c) => c.name));
  zeilen.push('-- Indexe (ohne die von Constraints automatisch erzeugten).');
  for (const i of indexe) {
    if (constraintNamen.has(i.name)) continue;
    zeilen.push(`${i.definition};`);
  }
  zeilen.push('');

  zeilen.push('-- Funktionen. check_function_bodies aus: plpgsql prueft Objektbezuege ohnehin');
  zeilen.push('-- erst zur Laufzeit, und die Reihenfolge soll keine versteckte Abhaengigkeit haben.');
  zeilen.push('SET LOCAL check_function_bodies = off;');
  for (const f of funktionen) {
    zeilen.push(`${f.definition};`);
    zeilen.push('');
  }

  // Views in Abhaengigkeitsreihenfolge: erst die, deren Definition keine andere
  // Auswahl-View erwaehnt.
  const viewNamen = views.map((v) => v.name);
  const sortiert = [...views].sort((a, b) => {
    const aHaengt = viewNamen.some((n) => n !== a.name && a.definition.includes(n));
    const bHaengt = viewNamen.some((n) => n !== b.name && b.definition.includes(n));
    return Number(aHaengt) - Number(bHaengt);
  });
  zeilen.push('-- Views.');
  for (const v of sortiert) {
    zeilen.push(`CREATE VIEW ${v.schema}.${v.name} AS`);
    zeilen.push(v.definition.trim().replace(/;$/, '') + ';');
    zeilen.push('');
  }

  zeilen.push('-- Trigger.');
  for (const t of trigger) {
    zeilen.push(`${t.definition};`);
  }
  zeilen.push('');
  zeilen.push('COMMIT;');
  zeilen.push('');

  const sqlPfad = path.join(zielDir, `schema-${datum}.sql`);
  fs.writeFileSync(sqlPfad, zeilen.join('\n'), 'utf8');

  // Paritaets-Schnappschuss der Quelle - der Vergleich nach dem Import misst dagegen.
  const paritaet = { erzeugt: new Date().toISOString(), spalten, constraints, indexe, sequenzen: auswahlSequenzen, views, funktionen, trigger };
  const jsonPfad = path.join(zielDir, `paritaet-live-${datum}.json`);
  fs.writeFileSync(jsonPfad, JSON.stringify(paritaet, null, 2), 'utf8');

  console.log(`Geschrieben: ${sqlPfad}`);
  console.log(`            ${jsonPfad}`);
  console.log(`Tabellen ${TABELLEN.length} · Views ${views.length} · Funktionen ${funktionen.length} · Trigger ${trigger.length} · Sequenzen ${auswahlSequenzen.length} · Constraints ${constraints.length} · Indexe ${indexe.filter((i) => !constraintNamen.has(i.name)).length}`);
}

main().catch((e) => {
  console.error('Export gescheitert:', e.message);
  process.exit(1);
});
