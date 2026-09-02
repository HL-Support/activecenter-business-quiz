\set ON_ERROR_STOP on
\pset pager off
-- Beraterverzeichnis auf der Plattform.
-- Zweck: Der Outbox-Worker soll den Coach per SQL aufloesen statt per HTTP ueber
-- ac-reconnect.com/db-bridge.php. Quelle bleibt prod_activesupport.users auf DERSELBEN
-- Maschine; gespiegelt wird ueber n8n, weil die Anwendung bewusst keinen MySQL-Treiber hat
-- (Abhaengigkeiten: jsonwebtoken, postgres, react, react-dom).
-- Abbildung nachgemessen am 30.08.2026: berater_slug == users.sub_domain, 95 von 96 Slugs
-- des Quiz gefunden; der eine Rest ist 'default' - dafuer gibt es in users keinen Satz,
-- und fuer default-Leads wurde noch NIE ein Hot-Lead-Auftrag erzeugt (0 von 245).

create table if not exists leads.berater (
  slug                text        primary key,
  quelle_user_id      bigint      not null,
  email               text,
  first_name          text,
  last_name           text,
  full_name           text,
  country             text,
  preferred_language  text,
  organisation_name   text,
  herbalife_id        text,
  gespiegelt_am       timestamptz not null default now()
);

comment on table leads.berater is
  'Spiegel von prod_activesupport.users (sub_domain als slug). Geschrieben von n8n "AC - Berater-Verzeichnis spiegeln", gelesen vom Outbox-Worker statt des HTTP-Aufrufs an ac-reconnect.com. Nur Spiegel - Quelle bleibt MySQL.';

alter table leads.berater owner to leads_owner;
grant select on leads.berater to leads_read;
grant select, insert, update, delete on leads.berater to leads_app;
grant select, insert, update, delete on leads.berater to leads_n8n;

create index if not exists berater_email_idx on leads.berater (lower(email));

\echo '=== Angelegt ==='
select c.relname, pg_catalog.pg_get_userbyid(c.relowner) as eigentuemer,
       array_to_string(c.relacl, E'\n') as rechte
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='leads' and c.relname='berater';

\echo ''
\echo '=== Spalten ==='
select column_name, data_type, is_nullable from information_schema.columns
where table_schema='leads' and table_name='berater' order by ordinal_position;
