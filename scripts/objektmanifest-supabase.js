#!/usr/bin/env node
'use strict';

// Objektmanifest fuer den Datenbankumzug (Audit 13.5.1, Phase 5).
//
// Liest NUR den Katalog der Supabase-Datenbank (read-only ueber die Management-API)
// und schreibt ein maschinenlesbares Manifest plus eine menschenlesbare Zusammenfassung:
//   - Schema-Inventar der GESAMTEN Datenbank (die DB beherbergt mehrere Apps —
//     u.a. `marathon`; nichts darf unsichtbar bleiben)
//   - je App-Schema (public, analytics_internal, archive): Tabellen, Sequenzen samt
//     Ownership, Constraints, Views, Funktionen, Trigger, RLS-Policies, Grants (relacl)
//   - Extensions und pg_cron-Jobs (die Schreibbarriere 13.5.2 muss sie kennen)
//   - Katalogtest: haengt ein Verbund-Objekt an einem Objekt ausserhalb des Verbunds?
//
// Aufruf:  node scripts/objektmanifest-supabase.js            (schreibt beide Dateien)
//          node scripts/objektmanifest-supabase.js --stdout   (nur JSON auf stdout)
//
// Vor dem Testimport der Phase 5 FRISCH erzeugen — ein altes Manifest ist keins.
// Das Manifest ZAEHLT auf; die Auswahl, welche public-Objekte wirklich zum
// Business-Leads-Verbund gehoeren, trifft Phase 5 gegen das Verbraucher-Inventar.

const fs = require('fs');
const path = require('path');
const { executeManagementQuery } = require('./stats-logs-baseline.js');

// App-Schemata, die der Umzug abdecken muss. `marathon*` gehoert der Fitapp und
// zieht NICHT mit um — es erscheint trotzdem im Schema-Inventar.
const VERBUND_SCHEMATA = ['public', 'analytics_internal', 'archive'];
const S = `any(array['${VERBUND_SCHEMATA.join("','")}'])`;

const ABFRAGEN = {
  schema_inventar: `
    select n.nspname as schema,
           count(*) filter (where c.relkind in ('r','p')) as tabellen,
           count(*) filter (where c.relkind in ('v','m')) as views,
           count(*) filter (where c.relkind = 'S') as sequenzen
    from pg_namespace n
    left join pg_class c on c.relnamespace = n.oid
    where n.nspname not in ('pg_catalog','information_schema')
      and n.nspname not like 'pg_toast%' and n.nspname not like 'pg_temp%'
    group by n.nspname order by n.nspname`,

  tabellen: `
    select n.nspname as schema, c.relname as tabelle,
           case c.relkind when 'p' then 'partitioniert' else 'normal' end as art,
           c.reltuples::bigint as geschaetzte_zeilen,
           pg_total_relation_size(c.oid) as bytes_gesamt,
           c.relrowsecurity as rls_aktiv
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where c.relkind in ('r','p') and n.nspname = ${S}
    order by n.nspname, c.relname`,

  sequenzen: `
    select n.nspname as schema, s.relname as sequenz,
           t.relname as gehoert_zu_tabelle,
           a.attname as gehoert_zu_spalte,
           pg_sequence_last_value(s.oid) as letzter_wert
    from pg_class s
    join pg_namespace n on n.oid = s.relnamespace and n.nspname = ${S}
    left join pg_depend d on d.objid = s.oid and d.deptype = 'a' and d.classid = 'pg_class'::regclass
    left join pg_class t on t.oid = d.refobjid
    left join pg_attribute a on a.attrelid = t.oid and a.attnum = d.refobjsubid
    where s.relkind = 'S'
    order by n.nspname, s.relname`,

  constraints: `
    select tn.nspname as schema, con.conrelid::regclass::text as tabelle,
           con.conname as name, con.contype as typ,
           pg_get_constraintdef(con.oid) as definition,
           case when con.contype = 'f' then con.confrelid::regclass::text end as verweist_auf,
           case when con.contype = 'f' then fn.nspname end as verweist_auf_schema
    from pg_constraint con
    join pg_class tc on tc.oid = con.conrelid
    join pg_namespace tn on tn.oid = tc.relnamespace and tn.nspname = ${S}
    left join pg_class fc on fc.oid = con.confrelid
    left join pg_namespace fn on fn.oid = fc.relnamespace
    order by 1, 2, 3`,

  views: `
    select n.nspname as schema, c.relname as name,
           case c.relkind when 'v' then 'view' else 'materialized view' end as art,
           md5(pg_get_viewdef(c.oid)) as definition_md5,
           length(pg_get_viewdef(c.oid)) as definition_laenge
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = ${S} and c.relkind in ('v','m')
    order by n.nspname, c.relname`,

  funktionen: `
    select n.nspname as schema, p.proname as name,
           pg_get_function_identity_arguments(p.oid) as argumente,
           l.lanname as sprache,
           p.prosecdef as security_definer,
           md5(p.prosrc) as quelltext_md5
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace and n.nspname = ${S}
    join pg_language l on l.oid = p.prolang
    order by 1, 2, 3`,

  trigger: `
    select n.nspname as schema, c.relname as tabelle, t.tgname as name,
           p.proname as funktion, pg_get_triggerdef(t.oid) as definition
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = ${S}
    join pg_proc p on p.oid = t.tgfoid
    where not t.tgisinternal
    order by 1, 2, 3`,

  extensions: `
    select e.extname as name, e.extversion as version, n.nspname as schema
    from pg_extension e
    join pg_namespace n on n.oid = e.extnamespace
    order by e.extname`,

  // Grants ueber relacl — information_schema.table_privileges zeigte der
  // Management-API-Rolle NICHTS (gemessen 27.08.: 0 Zeilen bei real vollen ACLs).
  grants: `
    select n.nspname as schema, c.relname as objekt, c.relacl::text as acl
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = ${S} and c.relkind in ('r','p','v','m','S') and c.relacl is not null
    order by 1, 2`,

  rls_policies: `
    select schemaname as schema, tablename as tabelle, policyname as name,
           cmd as befehl, roles::text as rollen
    from pg_policies
    where schemaname = ${S}
    order by 1, 2, 3`,

  // Katalogtest Teil 1: pg_depend — Verbund-Relationen, die an Objekten
  // ausserhalb des Verbunds haengen (Systemschemata ausgenommen).
  fremdabhaengigkeiten: `
    select distinct dep_n.nspname as schema, dep_c.relname as objekt,
           ref_n.nspname as haengt_an_schema, ref_c.relname as haengt_an_objekt
    from pg_depend d
    join pg_class dep_c on dep_c.oid = d.objid
    join pg_namespace dep_n on dep_n.oid = dep_c.relnamespace
    join pg_class ref_c on ref_c.oid = d.refobjid
    join pg_namespace ref_n on ref_n.oid = ref_c.relnamespace
    where dep_n.nspname = ${S}
      and ref_n.nspname <> all(array['${VERBUND_SCHEMATA.join("','")}'])
      and ref_n.nspname not in ('pg_catalog','information_schema','pg_toast')
    order by 1, 2, 3, 4`,

  // Katalogtest Teil 2: Funktions-Quelltexte und View-Definitionen, die fremde
  // Schemata woertlich referenzieren (extensions.digest, auth.uid() u.ae.).
  fremdverweise_in_code: `
    select n.nspname as schema, 'funktion' as art, p.proname as name,
           substring(p.prosrc from '\\m(?:auth|storage|extensions|vault|graphql|realtime|supabase_functions|net|cron)\\.[a-zA-Z_]+') as beispiel
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace and n.nspname = ${S}
    where p.prosrc ~ '\\m(auth|storage|extensions|vault|graphql|realtime|supabase_functions|net|cron)\\.'
    union all
    select n.nspname, 'view', c.relname,
           substring(pg_get_viewdef(c.oid) from '\\m(?:auth|storage|extensions|vault|graphql|realtime|supabase_functions|net|cron)\\.[a-zA-Z_]+')
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = ${S}
    where c.relkind in ('v','m')
      and pg_get_viewdef(c.oid) ~ '\\m(auth|storage|extensions|vault|graphql|realtime|supabase_functions|net|cron)\\.'
    order by 1, 2, 3`,

  spalten_defaults_fremd: `
    select n.nspname as schema, c.relname as tabelle, a.attname as spalte,
           pg_get_expr(ad.adbin, ad.adrelid) as default_ausdruck
    from pg_attrdef ad
    join pg_class c on c.oid = ad.adrelid
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = ${S}
    join pg_attribute a on a.attrelid = ad.adrelid and a.attnum = ad.adnum
    where pg_get_expr(ad.adbin, ad.adrelid) ~ '\\m(auth|storage|extensions|vault|graphql|net|cron)\\.'
    order by 1, 2, 3`,
};

// cron laeuft in einem eigenen Schema und existiert evtl. nicht — getrennt und tolerant.
const CRON_ABFRAGE = `select jobid, jobname, schedule, command, active from cron.job order by jobid`;

async function sammle() {
  const manifest = {
    erzeugt: new Date().toISOString(),
    verbund_schemata: VERBUND_SCHEMATA,
    hinweis: 'Audit 13.5.1 — vor dem Testimport der Phase 5 FRISCH erzeugen. '
      + 'Die DB beherbergt mehrere Apps; die Objekt-Auswahl trifft Phase 5 gegen das Verbraucher-Inventar.',
    ergebnisse: {},
  };
  for (const [name, sql] of Object.entries(ABFRAGEN)) {
    manifest.ergebnisse[name] = await executeManagementQuery(sql);
  }
  try {
    manifest.ergebnisse.pg_cron_jobs = await executeManagementQuery(CRON_ABFRAGE);
  } catch (fehler) {
    manifest.ergebnisse.pg_cron_jobs = { nicht_lesbar: String(fehler.message).slice(0, 200) };
  }
  return manifest;
}

function zusammenfassung(manifest) {
  const e = manifest.ergebnisse;
  const anzahl = (liste) => (Array.isArray(liste) ? liste.length : '?');
  const fks = Array.isArray(e.constraints) ? e.constraints.filter((c) => c.typ === 'f') : [];
  const fkFremd = fks.filter((c) => c.verweist_auf_schema && !VERBUND_SCHEMATA.includes(c.verweist_auf_schema));
  const cronZeilen = Array.isArray(e.pg_cron_jobs)
    ? e.pg_cron_jobs.map((j) => `| ${j.jobid} | \`${j.schedule}\` | ${j.active} | \`${String(j.command).slice(0, 80)}\` |`)
    : [`| — | — | — | nicht lesbar: ${e.pg_cron_jobs && e.pg_cron_jobs.nicht_lesbar} |`];
  const inventarZeilen = (Array.isArray(e.schema_inventar) ? e.schema_inventar : [])
    .map((s) => `| \`${s.schema}\` | ${s.tabellen} | ${s.views} | ${s.sequenzen} | ${VERBUND_SCHEMATA.includes(s.schema) ? '**ja**' : 'nein'} |`);

  const problemZeilen = [];
  for (const z of Array.isArray(e.fremdabhaengigkeiten) ? e.fremdabhaengigkeiten : []) {
    problemZeilen.push(`- Katalog: \`${z.schema}.${z.objekt}\` haengt an \`${z.haengt_an_schema}.${z.haengt_an_objekt}\``);
  }
  for (const z of Array.isArray(e.fremdverweise_in_code) ? e.fremdverweise_in_code : []) {
    problemZeilen.push(`- Code: ${z.art} \`${z.schema}.${z.name}\` referenziert \`${z.beispiel}\``);
  }
  for (const z of Array.isArray(e.spalten_defaults_fremd) ? e.spalten_defaults_fremd : []) {
    problemZeilen.push(`- Default: \`${z.schema}.${z.tabelle}.${z.spalte}\` = \`${z.default_ausdruck}\``);
  }
  for (const c of fkFremd) {
    problemZeilen.push(`- FK: \`${c.tabelle}.${c.name}\` verweist auf \`${c.verweist_auf}\` (Schema \`${c.verweist_auf_schema}\`)`);
  }

  return `# Objektmanifest Datenbankumzug — Zusammenfassung

Erzeugt ${manifest.erzeugt} (maschinenlesbar: gleicher Dateiname mit \`.json\`).
Zweck: Audit 13.5.1 — der selektive Dump der Phase 5 beruht auf diesem Manifest,
nicht auf einer Tabellenliste. Verbund-Schemata: ${VERBUND_SCHEMATA.map((s) => `\`${s}\``).join(', ')}.

## Schema-Inventar der gesamten Datenbank

Die Supabase beherbergt mehrere Apps. \`marathon\`/\`marathon_backup\` gehoeren der
Fitapp und ziehen NICHT mit dem Quiz um; auch \`public\` selbst ist gemischt (u.a.
HBA-Objekte) — die Objekt-Auswahl trifft Phase 5 gegen das Verbraucher-Inventar.

| Schema | Tabellen | Views | Sequenzen | im Verbund |
| --- | --- | --- | --- | --- |
${inventarZeilen.join('\n')}

## Verbund-Objekte (Details im JSON)

| Objektart | Anzahl |
| --- | --- |
| Tabellen | ${anzahl(e.tabellen)} |
| Sequenzen | ${anzahl(e.sequenzen)} |
| Constraints (davon FK) | ${anzahl(e.constraints)} (${fks.length}) |
| Views/Materialized Views | ${anzahl(e.views)} |
| Funktionen | ${anzahl(e.funktionen)} |
| Trigger | ${anzahl(e.trigger)} |
| Extensions (ganze DB) | ${anzahl(e.extensions)} |
| RLS-Policies | ${anzahl(e.rls_policies)} |
| Objekte mit Grants (relacl) | ${anzahl(e.grants)} |

## pg_cron-Jobs (fuer die Schreibbarriere 13.5.2)

| Job | Zeitplan | aktiv | Kommando (gekuerzt) |
| --- | --- | --- | --- |
${cronZeilen.join('\n')}

## Katalogtest: Abhaengigkeiten ausserhalb des Verbunds

${problemZeilen.length === 0
    ? 'Keine gefunden — kein Verbund-Objekt haengt an einem nicht migrierten Objekt.'
    : `**${problemZeilen.length} Fundstellen — jede einzelne vor dem Testimport klaeren:**\n\n${problemZeilen.join('\n')}`}
`;
}

async function main() {
  const manifest = await sammle();
  if (process.argv.includes('--stdout')) {
    process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
    return;
  }
  const datum = manifest.erzeugt.slice(0, 10);
  const ordner = path.join(__dirname, '..', 'docs', 'audits', 'cutover-vorbereitung', 'objektmanifest');
  fs.mkdirSync(ordner, { recursive: true });
  const basis = path.join(ordner, `manifest-${datum}`);
  fs.writeFileSync(`${basis}.json`, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  fs.writeFileSync(`${basis}.md`, zusammenfassung(manifest), 'utf8');
  process.stdout.write(`Geschrieben: ${basis}.json und .md\n`);
}

if (require.main === module) {
  main().catch((fehler) => {
    process.stderr.write(`${fehler.message}\n`);
    process.exit(1);
  });
}

module.exports = { ABFRAGEN, VERBUND_SCHEMATA, sammle, zusammenfassung };
