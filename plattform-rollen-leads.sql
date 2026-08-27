-- Rollen und Schemata des Business-Leads-Quiz auf der Plattform-Datenbank.
-- Entwurf und Begruendung: docs/audits/plattform-rollenmodell-2026-08-27.md
--
-- ADDITIV: legt nur NEUE Rollen und NEUE Schemata an. Fasst weder `marathon` noch
-- `fitapp_app`, `authenticator`, `anon`, `service_role`, `watchdog_canary` noch das
-- Schema `public` inhaltlich an. Marathon laeuft weiter auf Supabase und bleibt hier
-- unberuehrt (Vorgabe Markus, 27.08.2026).
--
-- IDEMPOTENT: mehrfaches Ausfuehren ist folgenlos.
--
-- PASSWOERTER stehen bewusst NICHT in dieser Datei. Sie werden nach dem Anlegen einzeln
-- gesetzt (ALTER ROLE ... PASSWORD) und liegen in agent-secrets.json.
--
-- RUECKWEG:
--   DROP SCHEMA leads_analytics CASCADE; DROP SCHEMA leads CASCADE;
--   DROP ROLE leads_app; DROP ROLE leads_read; DROP ROLE leads_migrate; DROP ROLE leads_owner;

\set ON_ERROR_STOP on
BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Rollen
-- ---------------------------------------------------------------------------
-- _owner besitzt alles und kann sich NICHT anmelden: Eigentum haengt damit an der
-- Rolle, nicht an einem Zugang. Rotieren oder loeschen eines Zugangs laesst Eigentum
-- und Rechte unberuehrt.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'leads_owner') THEN
    CREATE ROLE leads_owner NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'leads_read') THEN
    CREATE ROLE leads_read NOLOGIN;
  END IF;
  -- _migrate darf DDL, aber nur ueber "SET ROLE leads_owner" (siehe Regel unten).
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'leads_migrate') THEN
    CREATE ROLE leads_migrate LOGIN CONNECTION LIMIT 2;
  END IF;
  -- _app ist die laufende Anwendung: NUR Daten, kein DDL, kein BYPASSRLS.
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'leads_app') THEN
    CREATE ROLE leads_app LOGIN CONNECTION LIMIT 8;
  END IF;
END $$;

GRANT leads_owner TO leads_migrate;

-- Betriebsgrenzen je Rolle: eine haengende Abfrage darf nie die ganze Maschine
-- blockieren (37 nutzbare Verbindungen, 2 Kerne).
ALTER ROLE leads_app     SET statement_timeout = '8s';
ALTER ROLE leads_app     SET lock_timeout      = '8s';
ALTER ROLE leads_read    SET statement_timeout = '30s';
ALTER ROLE leads_read    SET lock_timeout      = '8s';
ALTER ROLE leads_migrate SET lock_timeout      = '8s';

-- ---------------------------------------------------------------------------
-- 2. Schemata
-- ---------------------------------------------------------------------------
-- `leads` ersetzt das Supabase-`public`, `leads_analytics` das `analytics_internal`.
-- Der generische Name analytics_internal wuerde sonst den kuenftigen Projektnamen
-- "Analysen" blockieren.
CREATE SCHEMA IF NOT EXISTS leads           AUTHORIZATION leads_owner;
CREATE SCHEMA IF NOT EXISTS leads_analytics AUTHORIZATION leads_owner;

-- Verbinden duerfen nur benannte Rollen. (Das breitere REVOKE CONNECT ... FROM PUBLIC
-- fehlt hier bewusst: es wuerde fitapp_app treffen und gehoert in den FitApp-Umzug.)
GRANT CONNECT ON DATABASE hl_support TO leads_app, leads_migrate, leads_read;

GRANT USAGE ON SCHEMA leads, leads_analytics TO leads_app, leads_read;
-- Kein CREATE fuer _app: die laufende Anwendung kann keine Objekte anlegen oder loeschen.

-- ---------------------------------------------------------------------------
-- 3. Standardrechte fuer kuenftige Objekte
-- ---------------------------------------------------------------------------
-- Ohne diesen Block waere jede neu migrierte Tabelle fuer die Anwendung unsichtbar,
-- bis jemand von Hand nachgreift - und genau das wird vergessen.
ALTER DEFAULT PRIVILEGES FOR ROLE leads_owner IN SCHEMA leads, leads_analytics
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO leads_app;
ALTER DEFAULT PRIVILEGES FOR ROLE leads_owner IN SCHEMA leads, leads_analytics
  GRANT USAGE, SELECT ON SEQUENCES TO leads_app;
ALTER DEFAULT PRIVILEGES FOR ROLE leads_owner IN SCHEMA leads, leads_analytics
  GRANT EXECUTE ON FUNCTIONS TO leads_app;

ALTER DEFAULT PRIVILEGES FOR ROLE leads_owner IN SCHEMA leads, leads_analytics
  GRANT SELECT ON TABLES TO leads_read;
ALTER DEFAULT PRIVILEGES FOR ROLE leads_owner IN SCHEMA leads, leads_analytics
  GRANT SELECT ON SEQUENCES TO leads_read;

-- Bestehende Objekte (falls dieses Skript nach einem Import erneut laeuft).
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES    IN SCHEMA leads, leads_analytics TO leads_app;
GRANT USAGE, SELECT                  ON ALL SEQUENCES IN SCHEMA leads, leads_analytics TO leads_app;
GRANT EXECUTE                        ON ALL FUNCTIONS IN SCHEMA leads, leads_analytics TO leads_app;
GRANT SELECT                         ON ALL TABLES    IN SCHEMA leads, leads_analytics TO leads_read;
GRANT SELECT                         ON ALL SEQUENCES IN SCHEMA leads, leads_analytics TO leads_read;

COMMIT;

-- ---------------------------------------------------------------------------
-- REGEL FUER MIGRATIONEN (nicht automatisierbar, deshalb hier als Vertrag):
-- Jede Migration verbindet sich als leads_migrate und beginnt mit
--     SET ROLE leads_owner;
-- Ohne diese Zeile gehoeren neu angelegte Objekte dem Zugang statt der Eigentuemerrolle,
-- die Standardrechte oben greifen nicht, und die Anwendung sieht die neue Tabelle nicht.
-- ---------------------------------------------------------------------------
