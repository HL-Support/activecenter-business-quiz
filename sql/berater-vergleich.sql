-- =====================================================================================
-- Haltbarer Speicher fuer den Schattenvergleich der Berateridentitaet
--
-- 🔴 WARUM ES DIESE TABELLE GIBT
-- Der Schattenvergleich lebte bis zum 31.08.2026 nur im Containerprotokoll
-- (`console.warn`). Ein Deploy ersetzt den Container — und damit sind alle gesammelten
-- Vergleiche weg. Am 31.08. ist das binnen zwei Stunden ZWEIMAL passiert: nach dem Start
-- des Schattenlaufs standen null Zeilen da, nach dem naechsten Deploy wieder nur eine.
--
-- Die Folge waere gewesen, dass das Projekt bis zum Umschalten (A5) nicht mehr deployen
-- darf, weil sonst die Beweise verloren gehen. Das ist keine hinnehmbare Einschraenkung —
-- also wandert der Beweis dorthin, wo er einen Deploy ueberlebt.
--
-- Lehre aus B2a, jetzt umgesetzt: Messwerte gehoeren in die Datenbank, nicht ins Protokoll.
--
-- AGGREGIERT, NICHT JE AUFRUF: Die Stelle `funnel` laeuft bei JEDEM Seitenaufruf. Zeilen je
-- Aufruf waeren unbegrenzt; das Aggregat ist durch Slugs x Stellen x Tage begrenzt.
--
-- Anzuwenden mit der Rolle `leads_migrate`; die erste Zeile setzt bewusst die
-- Eigentuemerrolle, sonst gehoeren die Objekte dem Zugang statt `leads_owner`.
-- =====================================================================================

SET ROLE leads_owner;

CREATE TABLE IF NOT EXISTS leads.berater_vergleich (
  tag             date        NOT NULL,
  stelle          text        NOT NULL,
  slug            text        NOT NULL,
  quelle          text        NOT NULL,
  schatten        text        NOT NULL,
  -- Kanonisch sortiert und kommagetrennt. Leer heisst: deckungsgleich.
  -- Fehler der Nebenquelle stehen hier als 'mysql_fehler' bzw. 'verzeichnis_fehler'.
  abweichungen    text        NOT NULL,
  anzahl          bigint      NOT NULL DEFAULT 0,
  zuerst_am       timestamptz NOT NULL DEFAULT now(),
  zuletzt_am      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tag, stelle, slug, quelle, schatten, abweichungen)
);

COMMENT ON TABLE leads.berater_vergleich IS
  'Schattenvergleich Bridge gegen MySQL/Verzeichnis, aggregiert je Tag. Ueberlebt Deploys — '
  'das Containerprotokoll tut das nicht.';

-- Der Schreibweg der Anwendung. Sie ruft ihn ueber supabaseRpc auf; im direkten Modus
-- wird daraus SELECT * FROM leads.notiere_berater_vergleich(...).
CREATE OR REPLACE FUNCTION leads.notiere_berater_vergleich(
  p_stelle       text,
  p_slug         text,
  p_quelle       text,
  p_schatten     text,
  p_abweichungen text
) RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = leads, pg_temp
AS $$
  INSERT INTO leads.berater_vergleich AS v
         (tag, stelle, slug, quelle, schatten, abweichungen, anzahl)
  VALUES (current_date,
          left(coalesce(p_stelle, '?'), 40),
          left(coalesce(p_slug, '?'), 80),
          left(coalesce(p_quelle, '?'), 40),
          left(coalesce(p_schatten, '?'), 40),
          left(coalesce(p_abweichungen, ''), 400),
          1)
  ON CONFLICT (tag, stelle, slug, quelle, schatten, abweichungen) DO UPDATE
     SET anzahl = v.anzahl + 1,
         zuletzt_am = now()
  RETURNING anzahl;
$$;

GRANT EXECUTE ON FUNCTION leads.notiere_berater_vergleich(text, text, text, text, text)
  TO leads_app;
GRANT SELECT ON leads.berater_vergleich TO leads_app, leads_n8n;

RESET ROLE;

-- =====================================================================================
-- ABLESEN (das ist der Zweck des Ganzen):
--
--   SELECT stelle, abweichungen, sum(anzahl) AS anzahl,
--          count(DISTINCT slug) AS berater, min(zuerst_am), max(zuletzt_am)
--     FROM leads.berater_vergleich
--    WHERE tag >= current_date - 7
--    GROUP BY 1, 2
--    ORDER BY 3 DESC;
--
-- A5 darf gestellt werden, wenn fuer eine Stelle ausschliesslich Zeilen mit
-- abweichungen = '' stehen und die Mengen aus dem A5-Tor erreicht sind
-- (docs/plans/umsetzung-uebersicht.md).
--
-- RUECKWEG:
--   DROP FUNCTION leads.notiere_berater_vergleich(text, text, text, text, text);
--   DROP TABLE leads.berater_vergleich;
-- =====================================================================================
