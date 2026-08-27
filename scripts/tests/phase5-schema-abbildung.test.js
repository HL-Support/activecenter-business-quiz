const test = require('node:test');
const assert = require('node:assert/strict');

const {
  bildeSchemaAb, bildeDefinitionAb, pruefeRestfrei,
} = require('../phase5-schema-abbildung.js');

// Die Abbildung ist Cutover-Infrastruktur: sie entscheidet, ob die Plattform-DB das
// Projekt in `leads` traegt oder faelschlich in `public`. Ein stiller Fehler hier
// wuerde erst beim ersten Aufruf der migrierten Funktion sichtbar.

test('Schemanamen werden auf die Plattform abgebildet, fremde bleiben', () => {
  assert.equal(bildeSchemaAb('public'), 'leads');
  assert.equal(bildeSchemaAb('analytics_internal'), 'leads_analytics');
  assert.equal(bildeSchemaAb('marathon'), 'marathon');
  assert.equal(bildeSchemaAb('graphql_public'), 'graphql_public');
});

test('qualifizierte Verweise werden ersetzt - auch in Funktionsruempfen', () => {
  assert.equal(bildeDefinitionAb('INSERT INTO public.lead_state'), 'INSERT INTO leads.lead_state');
  assert.equal(bildeDefinitionAb('PERFORM public.upsert_answer_current(x)'),
    'PERFORM leads.upsert_answer_current(x)');
  assert.equal(bildeDefinitionAb('delete from analytics_internal.event_daily'),
    'delete from leads_analytics.event_daily');
  // Dynamisches SQL: der Verweis steckt in einem String-Literal (submit_lead_complete).
  assert.equal(bildeDefinitionAb("'SELECT %s FROM jsonb_populate_record(NULL::public.lead_state, $1)'"),
    "'SELECT %s FROM jsonb_populate_record(NULL::leads.lead_state, $1)'");
});

test('search_path-Literale und information_schema-Filter werden ersetzt', () => {
  assert.equal(bildeDefinitionAb("SET search_path TO 'public', 'pg_temp'"),
    "SET search_path TO 'leads', 'pg_temp'");
  assert.equal(bildeDefinitionAb("WHERE c.table_schema = 'public' AND c.table_name = 'lead_state'"),
    "WHERE c.table_schema = 'leads' AND c.table_name = 'lead_state'");
  // Advisory-Lock-Name: nur ein String, aber er muss mitziehen, sonst kollidieren
  // Quelle und Ziel waehrend eines Parallelbetriebs auf demselben Lock.
  assert.equal(bildeDefinitionAb("hashtext('analytics_internal.refresh_event_daily')"),
    "hashtext('leads_analytics.refresh_event_daily')");
});

test('Namen, die "public" nur enthalten, bleiben unberuehrt', () => {
  // graphql_public ist ein echtes Supabase-Schema - eine blinde Ersetzung wuerde es
  // zu graphql_leads verstuemmeln.
  assert.equal(bildeDefinitionAb('graphql_public.resolve'), 'graphql_public.resolve');
  assert.equal(bildeDefinitionAb("'is_publication'"), "'is_publication'");
  assert.equal(bildeDefinitionAb('republic.tabelle'), 'republic.tabelle');
});

test('die Abbildung ist folgenlos, wenn sie zweimal laeuft', () => {
  // Der Vergleich wendet sie auf beide Seiten an - auf der bereits abgebildeten
  // Testseite darf sie nichts mehr veraendern.
  const einmal = bildeDefinitionAb("SET search_path TO 'public', 'pg_temp' -- public.lead_state");
  assert.equal(bildeDefinitionAb(einmal), einmal);
});

test('leere Eingaben ergeben leeren Text statt "null"', () => {
  assert.equal(bildeDefinitionAb(null), '');
  assert.equal(bildeDefinitionAb(undefined), '');
});

test('Restkontrolle schlaegt an, wenn ein Quellschema-Token ueberlebt', () => {
  assert.throws(
    () => pruefeRestfrei('CREATE SCHEMA IF NOT EXISTS analytics_internal;', 'test'),
    /Abbildung unvollstaendig \(test\)/
  );
  assert.throws(
    () => pruefeRestfrei('GRANT USAGE ON SCHEMA public TO leads_app;', 'test'),
    /Quellschema-Token/
  );
});

test('Restkontrolle laesst Kommentarzeilen und sauberes SQL durch', () => {
  // Der Generator schreibt "Quelle public -> leads" in den Kopfkommentar.
  assert.doesNotThrow(() => pruefeRestfrei(
    '-- Quelle public -> leads, analytics_internal -> leads_analytics\n'
    + 'CREATE TABLE leads.lead_state (lead_hash text);\n'
    + "CREATE OR REPLACE FUNCTION leads.f() ... SET search_path TO 'leads', 'pg_temp'\n",
    'test'
  ));
});
