-- Eigene Rolle für n8n auf der Plattform-Datenbank.
--
-- Warum eine eigene und nicht leads_app: leads_app ist die laufende Anwendung mit
-- CONNECTION LIMIT 8. Teilte n8n sich diesen Topf, könnte ein hängender Workflow der
-- Anwendung die Verbindungen wegnehmen - und in den Logs wäre nicht zu unterscheiden,
-- wer was getan hat. Eigene Rolle, eigenes Limit, eigene Spur.
--
-- Warum überhaupt Direktzugang für n8n: Der Nurture-Sender spricht heute sechs
-- Supabase-Endpunkte direkt an. Nach dem Cutover gibt es dort kein PostgREST mehr.
--
-- 🔴 Sicherheitlich ist das ein GEWINN, kein Verlust: Heute trägt n8n den
-- Supabase-service_role-Schlüssel - Vollzugriff auf alles, unter Umgehung sämtlicher
-- Zeilenregeln. Diese Rolle hier darf ausschliesslich DML in leads/leads_analytics,
-- kein DDL, kein BYPASSRLS, und ist auf 4 Verbindungen begrenzt.
--
-- IDEMPOTENT. PASSWORT wird separat gesetzt (ALTER ROLE ... PASSWORD) und liegt in
-- agent-secrets.json.
--
-- RUECKWEG:
--   DROP ROLE leads_n8n;   -- danach pg_hba-Zeile und UFW-Regel für 10.0.1.4 zurücknehmen

\set ON_ERROR_STOP on
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'leads_n8n') THEN
    CREATE ROLE leads_n8n LOGIN CONNECTION LIMIT 4;
  END IF;
END $$;

-- Betriebsgrenzen: n8n-Abfragen dürfen länger laufen als die App (Nurture-Auswahl über
-- den ganzen Bestand), aber nie unbegrenzt.
ALTER ROLE leads_n8n SET statement_timeout = '30s';
ALTER ROLE leads_n8n SET lock_timeout      = '8s';
ALTER ROLE leads_n8n SET search_path       = leads, leads_analytics;

GRANT CONNECT ON DATABASE hl_support TO leads_n8n;
GRANT USAGE ON SCHEMA leads, leads_analytics TO leads_n8n;

-- Dieselben Datenrechte wie die Anwendung - der Nurture-Sender schreibt Ereignisse und
-- Zustände. Aber KEIN CREATE: n8n legt keine Objekte an.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES    IN SCHEMA leads, leads_analytics TO leads_n8n;
GRANT USAGE, SELECT                  ON ALL SEQUENCES IN SCHEMA leads, leads_analytics TO leads_n8n;
GRANT EXECUTE                        ON ALL FUNCTIONS IN SCHEMA leads, leads_analytics TO leads_n8n;

-- Damit künftig migrierte Objekte nicht von Hand nachgereicht werden müssen.
ALTER DEFAULT PRIVILEGES FOR ROLE leads_owner IN SCHEMA leads, leads_analytics
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO leads_n8n;
ALTER DEFAULT PRIVILEGES FOR ROLE leads_owner IN SCHEMA leads, leads_analytics
  GRANT USAGE, SELECT ON SEQUENCES TO leads_n8n;
ALTER DEFAULT PRIVILEGES FOR ROLE leads_owner IN SCHEMA leads, leads_analytics
  GRANT EXECUTE ON FUNCTIONS TO leads_n8n;

COMMIT;

-- ---------------------------------------------------------------------------
-- NETZWEG (ausserhalb dieser Datei, weil kein SQL):
--   1. pg_hba.conf:  host  hl_support  leads_n8n  10.0.1.4/32  scram-sha-256
--      🔴 Bewusst eng: nur DIESE Datenbank, nur DIESE Rolle, nur DIESE Adresse.
--         Die bestehende Zeile für 10.0.1.5 ist breiter (all/all) - das ist Altbestand
--         und gehört bei Gelegenheit ebenso verengt.
--   2. ufw allow from 10.0.1.4 to any port 5432
--      (Port 3306/MySQL ist für 10.0.1.4 bereits offen - dieselbe Maschine, gleiche
--       Vertrauensstellung.)
--   3. systemctl reload postgresql
-- ---------------------------------------------------------------------------
