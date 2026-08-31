-- =====================================================================================
-- Strang B, Schritt B3: die Datenseite der eigenen Lead-Uebergabe an contacts
--
-- Was hier entsteht:
--   1. leads.contacts_zustellprotokoll        — der BEWEIS je Uebermittlung
--   2. leads.reihe_contacts_quiz_ein(...)     — die Einreihung mit eingefrorenem Payload
--   3. leads.protokolliere_contacts_quiz_versuch(...)    — Zeile VOR dem Senden
--   4. leads.protokolliere_contacts_quiz_ergebnis(...)   — Zeile NACH der Antwort
--   5. leads.protokolliere_contacts_quiz_schatten(...)   — der Schattenlauf (B4)
--
-- 🔴 WARUM DIE submissionId HIER ENTSTEHT UND NICHT IM CODE
-- --------------------------------------------------------
-- Sie ist der Idempotenzschluessel der Gegenstelle (`typeform_surveys.submission_id`,
-- UNIQUE). Entstuende sie je Sendeversuch neu, erzeugte jede Wiederholung eines nur
-- scheinbar gescheiterten Aufrufs einen ZWEITEN Kontakt samt zweiter Mail. Sie muss also
-- genau einmal entstehen: beim ersten Einreihen. Und sie muss dort entstehen, wo auch die
-- Dedup-Entscheidung faellt — sonst gibt es zwischen "gibt es schon einen Auftrag?" und
-- "erzeuge einen Schluessel" ein Fenster. Deshalb: eine Funktion, ein Advisory-Lock,
-- SELECT-vor-INSERT, und der Schluessel wird im selben Zug in den eingefrorenen Payload
-- geschrieben.
--
-- 🔴 WARUM DER qz_-HASH NICHT DER SCHLUESSEL IST
-- Er entsteht im BROWSER (src/lib/core.js:479-484), ist klientengesteuert und faelschbar,
-- nutzt Math.random und ist im Bestand nachweislich nicht eindeutig (1270 verschiedene
-- bei 1271 Zeilen). Er reist als Lesegriff mit (`meta.hash`) — Griff ist nicht Schluessel.
-- Ausgeschrieben: docs/contacts-quiz-webhook-vertrag.md §3.
--
-- Anzuwenden mit der Rolle `leads_migrate`; die erste Zeile setzt bewusst die
-- Eigentuemerrolle, sonst gehoeren die Objekte dem Zugang statt `leads_owner`.
-- Vorbild fuer Schnitt und Rechte: sql/berater-vergleich.sql.
-- =====================================================================================

SET ROLE leads_owner;

-- -------------------------------------------------------------------------------------
-- 1. Das Zustellprotokoll
--
-- Abgrenzung zur Outbox: Die Outbox ist der ANTRIEB (auftragszentriert, wird irgendwann
-- aufgeraeumt). Dies ist der BEWEIS (uebermittlungszentriert, traegt die Kennungen der
-- Gegenstelle und ist die Grundlage des taeglichen Nachzaehlens).
--
-- Vorbild: analysen/legacy/zustellprotokoll.js — samt dessen teuer bezahlter Lehre: Dort
-- war das Protokoll einen Tag blind, weil es ein Feld las, das der Payload nicht mehr
-- trug. Deshalb kommen die Felder hier aus dem EINGEFRORENEN Payload des Auftrags, und
-- ein Test laesst aus einem echten Payload einen Eintrag entstehen.
-- -------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS leads.contacts_zustellprotokoll (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- Dieselbe Eindeutigkeit wie drueben. Ein Eintrag je UEBERMITTLUNG, nicht je Versuch.
  submission_id   uuid   NOT NULL UNIQUE,
  lead_hash       text   NOT NULL,
  outbox_job_id   bigint,
  route           text   NOT NULL DEFAULT 'webhook_quiz',
  target_url      text   NOT NULL,
  status          text   NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('schatten','pending','success','duplicate','failed')),
  http_status     int,

  -- 🔴 Ohne diese beiden ist ein 2xx KEIN Erfolg. Die leere Antwort der alten Route hat
  -- am 26.08.2026 bei den Nachbarn genau so einen stillen Fehler versteckt.
  contact_id      bigint,
  survey_id       bigint,

  -- 🔴 Daran haengt Strang M: Nach der Doppelvergabe-Kontrolle gehoert der Kontakt nicht
  -- zwingend dem Berater, der eingereicht hat. Die Mail geht an den AUFGELOESTEN.
  -- Die Duplikat-Antwort der Gegenstelle traegt beides NICHT — wer es nicht beim ersten
  -- Erfolg speichert, bekommt es nie wieder (SurveyIntake.php:419-428).
  coach_member_id text,
  fall            text,

  response_body   text,
  error_message   text,
  attempt_count   int    NOT NULL DEFAULT 1,
  member_id       text,
  first_name      text,
  email           text,
  -- Der exakt gesendete Rumpf. Im Schattenmodus: der Rumpf, der gesendet WORDEN WAERE.
  payload         jsonb  NOT NULL,
  last_attempt_at timestamptz,
  sent_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE leads.contacts_zustellprotokoll IS
  'Beweis je Uebermittlung an contacts /webhook/quiz. Ueberlebt Deploys und das '
  'Aufraeumen der Outbox. Grundlage des taeglichen Nachzaehlens (Plan B §10).';

CREATE INDEX IF NOT EXISTS idx_czp_created
  ON leads.contacts_zustellprotokoll (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_czp_status
  ON leads.contacts_zustellprotokoll (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_czp_lead
  ON leads.contacts_zustellprotokoll (lead_hash, created_at DESC);

-- -------------------------------------------------------------------------------------
-- 2. Die Einreihung
--
-- Nach dem vorhandenen Muster von enqueue_lead_sync fuer 'coach_hot_lead_email'
-- (supabase-lead-system-v2.sql:512-545): Advisory-Lock, dann SELECT-vor-INSERT.
--
-- Rueckgabe absichtlich mit `neu`: Der Aufrufer soll unterscheiden koennen, ob er gerade
-- eingereiht hat oder auf einen bestehenden Auftrag gestossen ist — ein Doppelklick ist
-- kein Fehler und darf nicht wie einer aussehen.
--
-- max_attempts = 8 statt der Vorgabe 5 (offener Punkt §12.5 des Plans, hier entschieden):
-- Der Backoff ist 2/5/15/60/60/… Minuten. Mit 5 Versuchen ist ein Auftrag nach 82 Minuten
-- tot, mit 8 nach 4 Stunden 22 Minuten. Ein contacts-Ausfall ueber einen Vormittag darf
-- keine Leads kosten; laenger als ein halber Tag soll ein Auftrag aber auch nicht still
-- weiterlaufen, sondern sichtbar sterben.
-- -------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION leads.reihe_contacts_quiz_ein(
  p_lead_hash    text,
  p_payload      jsonb,
  p_max_attempts int DEFAULT 8
)
RETURNS TABLE (job_id bigint, submission_id uuid, neu boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = leads, pg_temp
AS $$
DECLARE
  v_id      bigint;
  v_sub     uuid;
  v_payload jsonb;
BEGIN
  IF p_lead_hash IS NULL OR p_lead_hash = '' THEN
    RAISE EXCEPTION 'lead_hash_fehlt';
  END IF;
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'payload_fehlt';
  END IF;

  -- Zwei gleichzeitige Einreichungen desselben Laufs duerfen sich nicht ueberholen.
  PERFORM pg_advisory_xact_lock(hashtext('contacts_quiz_submission:' || p_lead_hash));

  SELECT o.id, (o.context_data ->> 'submission_id')::uuid
    INTO v_id, v_sub
    FROM leads.lead_sync_outbox o
   WHERE o.lead_hash = p_lead_hash
     AND o.sync_type = 'contacts_quiz_submission'
   ORDER BY o.created_at ASC
   LIMIT 1;

  IF v_id IS NOT NULL THEN
    -- 🔴 DERSELBE Auftrag, DIESELBE submissionId, DERSELBE eingefrorene Rumpf. Der neue
    -- Payload wird VERWORFEN, nicht eingemischt: Wuerde er den alten ersetzen, aenderte
    -- sich die Signatur zwischen zwei Versuchen derselben Uebermittlung.
    RETURN QUERY SELECT v_id, v_sub, false;
    RETURN;
  END IF;

  v_sub := gen_random_uuid();
  -- Der Schluessel wandert in den eingefrorenen Rumpf. Ab hier ist der Payload fertig;
  -- der Absender baut nichts mehr, er signiert und sendet nur noch.
  v_payload := jsonb_set(p_payload, '{meta,submissionId}', to_jsonb(v_sub::text), true);

  INSERT INTO leads.lead_sync_outbox (lead_hash, sync_type, context_data, max_attempts)
  VALUES (
    p_lead_hash,
    'contacts_quiz_submission',
    jsonb_build_object('submission_id', v_sub, 'payload', v_payload),
    GREATEST(1, COALESCE(p_max_attempts, 8))
  )
  RETURNING id INTO v_id;

  RETURN QUERY SELECT v_id, v_sub, true;
END;
$$;

-- -------------------------------------------------------------------------------------
-- 3. Protokollzeile VOR dem Senden
--
-- Grundsatz, woertlich vom Vorbild uebernommen: Zeile VOR dem Senden. Wer erst danach
-- protokolliert, hat von genau den Faellen keine Zeile, die ihn interessieren — die, bei
-- denen das Senden nicht zurueckkam.
--
-- Wiederholung zaehlt hoch statt zu ueberschreiben (Mechanik von zustellprotokoll.js:54-72).
-- Die Kennungen einer frueheren erfolgreichen Antwort bleiben stehen; sie sind ein Beweis
-- und werden von einem spaeteren Versuch nicht geloescht.
-- -------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION leads.protokolliere_contacts_quiz_versuch(
  p_submission_id uuid,
  p_lead_hash     text,
  p_outbox_job_id bigint,
  p_target_url    text,
  p_payload       jsonb,
  p_member_id     text DEFAULT NULL,
  p_first_name    text DEFAULT NULL,
  p_email         text DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = leads, pg_temp
AS $$
DECLARE
  v_id bigint;
BEGIN
  INSERT INTO leads.contacts_zustellprotokoll AS z
         (submission_id, lead_hash, outbox_job_id, target_url, status, payload,
          member_id, first_name, email, attempt_count, last_attempt_at)
  VALUES (p_submission_id, left(COALESCE(p_lead_hash, '?'), 96), p_outbox_job_id,
          left(COALESCE(p_target_url, '?'), 500), 'pending', p_payload,
          left(p_member_id, 120), left(p_first_name, 120), left(p_email, 190),
          1, now())
  ON CONFLICT (submission_id) DO UPDATE
     SET attempt_count   = z.attempt_count + 1,
         status          = 'pending',
         http_status     = NULL,
         error_message   = NULL,
         outbox_job_id   = COALESCE(EXCLUDED.outbox_job_id, z.outbox_job_id),
         target_url      = EXCLUDED.target_url,
         payload         = EXCLUDED.payload,
         last_attempt_at = now(),
         updated_at      = now()
  RETURNING z.id INTO v_id;

  RETURN v_id;
END;
$$;

-- -------------------------------------------------------------------------------------
-- 4. Protokollzeile NACH der Antwort
-- -------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION leads.protokolliere_contacts_quiz_ergebnis(
  p_submission_id   uuid,
  p_status          text,
  p_http_status     int  DEFAULT NULL,
  p_contact_id      bigint DEFAULT NULL,
  p_survey_id       bigint DEFAULT NULL,
  p_coach_member_id text DEFAULT NULL,
  p_fall            text DEFAULT NULL,
  p_response_body   text DEFAULT NULL,
  p_error_message   text DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = leads, pg_temp
AS $$
DECLARE
  v_id     bigint;
  v_status text := COALESCE(p_status, 'failed');
BEGIN
  IF v_status NOT IN ('success', 'duplicate', 'failed') THEN
    RAISE EXCEPTION 'unbekannter_status:%', v_status;
  END IF;

  UPDATE leads.contacts_zustellprotokoll
     SET status          = v_status,
         http_status     = p_http_status,
         -- COALESCE: eine Wiederholung, die im Duplikatsfall keine Kennung mehr
         -- mitbringt, darf den frueheren Beweis nicht ausradieren.
         contact_id      = COALESCE(p_contact_id, contact_id),
         survey_id       = COALESCE(p_survey_id, survey_id),
         coach_member_id = COALESCE(left(p_coach_member_id, 120), coach_member_id),
         fall            = COALESCE(left(p_fall, 60), fall),
         response_body   = left(p_response_body, 4000),
         error_message   = left(p_error_message, 1000),
         sent_at         = CASE WHEN v_status IN ('success','duplicate')
                                THEN COALESCE(sent_at, now()) ELSE sent_at END,
         updated_at      = now()
   WHERE submission_id = p_submission_id
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- -------------------------------------------------------------------------------------
-- 5. Der Schattenlauf (B4)
--
-- Im Schatten wird der Vertragspayload gebaut und HALTBAR abgelegt — gesendet wird NIE.
-- Es gibt hier keinen Outbox-Auftrag und damit keine serverseitige submissionId; die
-- Zeile braucht aber einen Schluessel. Er wird deterministisch aus dem lead_hash
-- abgeleitet, damit eine Client-Wiederholung desselben Laufs KEINE zweite Schattenzeile
-- erzeugt (sonst zaehlte der Schattenlauf mehr Uebermittlungen, als es gab, und der
-- Abgleich "Zeilenzahl schatten = Zahl der Opt-ins" waere wertlos).
--
-- Der abgeleitete Wert steht auch im Payload, damit die Schattenzeile denselben Rumpf
-- traegt, der im Ernstfall gesendet wuerde — bis auf den Schluessel selbst.
-- -------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION leads.protokolliere_contacts_quiz_schatten(
  p_lead_hash  text,
  p_target_url text,
  p_payload    jsonb,
  p_member_id  text DEFAULT NULL,
  p_first_name text DEFAULT NULL,
  p_email      text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = leads, pg_temp
AS $$
DECLARE
  v_sub     uuid;
  v_payload jsonb;
BEGIN
  IF p_lead_hash IS NULL OR p_lead_hash = '' THEN
    RAISE EXCEPTION 'lead_hash_fehlt';
  END IF;

  v_sub := md5('contacts_quiz_schatten:' || p_lead_hash)::uuid;
  v_payload := jsonb_set(
    COALESCE(p_payload, '{}'::jsonb), '{meta,submissionId}', to_jsonb(v_sub::text), true
  );

  INSERT INTO leads.contacts_zustellprotokoll AS z
         (submission_id, lead_hash, target_url, status, payload,
          member_id, first_name, email, attempt_count, last_attempt_at)
  VALUES (v_sub, left(p_lead_hash, 96), left(COALESCE(p_target_url, '-'), 500),
          'schatten', v_payload,
          left(p_member_id, 120), left(p_first_name, 120), left(p_email, 190), 1, now())
  ON CONFLICT (submission_id) DO UPDATE
     SET attempt_count   = z.attempt_count + 1,
         payload         = EXCLUDED.payload,
         last_attempt_at = now(),
         updated_at      = now();

  RETURN v_sub;
END;
$$;

-- -------------------------------------------------------------------------------------
-- Rechte. Die Anwendung darf einreihen und protokollieren — mehr nicht.
-- -------------------------------------------------------------------------------------

GRANT SELECT ON leads.contacts_zustellprotokoll TO leads_app, leads_n8n;

GRANT EXECUTE ON FUNCTION leads.reihe_contacts_quiz_ein(text, jsonb, int) TO leads_app;
GRANT EXECUTE ON FUNCTION leads.protokolliere_contacts_quiz_versuch(
  uuid, text, bigint, text, jsonb, text, text, text) TO leads_app;
GRANT EXECUTE ON FUNCTION leads.protokolliere_contacts_quiz_ergebnis(
  uuid, text, int, bigint, bigint, text, text, text, text) TO leads_app;
GRANT EXECUTE ON FUNCTION leads.protokolliere_contacts_quiz_schatten(
  text, text, jsonb, text, text, text) TO leads_app;

RESET ROLE;

-- =====================================================================================
-- ABLESEN (Plan B §10, Zaehler B):
--
--   SELECT date_trunc('day', created_at) AS tag, status, count(*),
--          count(*) FILTER (WHERE contact_id IS NOT NULL) AS mit_kennung
--     FROM leads.contacts_zustellprotokoll
--    GROUP BY 1, 2 ORDER BY 1 DESC, 2;
--
-- Offene Auftraege (gehoert zum Notausstieg):
--
--   SELECT status, count(*) FROM leads.lead_sync_outbox
--    WHERE sync_type = 'contacts_quiz_submission' GROUP BY 1;
--
-- RUECKWEG (in dieser Reihenfolge):
--   DROP FUNCTION leads.protokolliere_contacts_quiz_schatten(text, text, jsonb, text, text, text);
--   DROP FUNCTION leads.protokolliere_contacts_quiz_ergebnis(uuid, text, int, bigint, bigint, text, text, text, text);
--   DROP FUNCTION leads.protokolliere_contacts_quiz_versuch(uuid, text, bigint, text, jsonb, text, text, text);
--   DROP FUNCTION leads.reihe_contacts_quiz_ein(text, jsonb, int);
--   DROP TABLE leads.contacts_zustellprotokoll;
-- Offene Auftraege vorher ansehen — sie verschwinden mit dem DROP nicht.
-- =====================================================================================
