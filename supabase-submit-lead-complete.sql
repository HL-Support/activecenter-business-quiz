-- Stufe A des Phase-4-Designs (27.08.2026, docs/audits/2026-08-27-phase4-design-lead-submit.md):
-- Der kanonische Lead-Submit schreibt lead_state UND alle Antworten in EINER Transaktion.
-- Vorher waren es 7 Einzel-Calls (1x Upsert + 6x void-RPC) - ein Abbruch mittendrin
-- hinterliess Teilzustaende (Vorfall 27.08., Waechter W5). Die Funktion lebt in Stufe B
-- (direkter Treiber nach dem Hetzner-Umzug) unveraendert weiter.
--
-- Bewusst NUR die heutigen Schreibvorgaenge (kein lead_event, kein Outbox-Enqueue):
-- Stufe A darf das Systemverhalten (Mails, Sync) nicht veraendern, nur atomar machen.
--
-- Anwenden: einmalig gegen die Produktions-DB (Management-API); Rollback:
--   DROP FUNCTION public.submit_lead_complete(jsonb,jsonb,text,timestamptz);

BEGIN;

CREATE OR REPLACE FUNCTION public.submit_lead_complete(
  p_state jsonb,
  p_answers jsonb DEFAULT '[]'::jsonb,
  p_lang text DEFAULT NULL,
  p_answered_at timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_lead_hash text := p_state->>'lead_hash';
  v_unknown text[];
  v_insert_cols text;
  v_select_cols text;
  v_update_set text;
  v_answer jsonb;
  v_written int := 0;
BEGIN
  IF v_lead_hash IS NULL OR v_lead_hash !~ '^qz_[a-zA-Z0-9_]+$' THEN
    RAISE EXCEPTION 'lead_hash_required';
  END IF;

  -- Unbekannte Schluessel sind ein LAUTER Fehler - exakt wie beim bisherigen
  -- PostgREST-Upsert. Stilles Verwerfen wuerde Drift zwischen Code und Schema verstecken.
  SELECT array_agg(t.k) INTO v_unknown
  FROM jsonb_object_keys(p_state) AS t(k)
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.table_name = 'lead_state' AND c.column_name = t.k
  );
  IF v_unknown IS NOT NULL THEN
    RAISE EXCEPTION 'unknown_lead_state_columns: %', array_to_string(v_unknown, ', ');
  END IF;

  -- merge-duplicates-Semantik wie bisher: genau die MITGELIEFERTEN Schluessel schreiben
  -- (auch ein mitgeliefertes null ueberschreibt), alle anderen Spalten bleiben unberuehrt.
  SELECT
    string_agg(format('%I', c.column_name), ', ' ORDER BY c.ordinal_position),
    string_agg(format('r.%I', c.column_name), ', ' ORDER BY c.ordinal_position),
    string_agg(format('%I = EXCLUDED.%I', c.column_name, c.column_name), ', '
      ORDER BY c.ordinal_position) FILTER (WHERE c.column_name <> 'lead_hash')
  INTO v_insert_cols, v_select_cols, v_update_set
  FROM information_schema.columns c
  WHERE c.table_schema = 'public' AND c.table_name = 'lead_state'
    AND p_state ? c.column_name;

  EXECUTE format(
    'INSERT INTO public.lead_state (%s) '
    || 'SELECT %s FROM jsonb_populate_record(NULL::public.lead_state, $1) AS r '
    || 'ON CONFLICT (lead_hash) DO UPDATE SET %s',
    v_insert_cols, v_select_cols, coalesce(v_update_set, 'lead_hash = EXCLUDED.lead_hash')
  ) USING p_state;

  -- Antworten ueber die bestehende, idempotente Fassung (Unique lead_hash+question_ref) -
  -- ein zweiter Schreibweg waere eine zweite Wahrheit. Alles im selben Transaktionsklammer:
  -- scheitert eine Antwort, wird auch der lead_state-Upsert zurueckgerollt.
  FOR v_answer IN SELECT value FROM jsonb_array_elements(coalesce(p_answers, '[]'::jsonb)) LOOP
    PERFORM public.upsert_answer_current(
      v_lead_hash,
      v_answer->>'question_ref',
      NULLIF(v_answer->>'question_index', '')::int,
      NULL,
      v_answer->>'answer_ref',
      v_answer->>'answer_text',
      v_answer->>'answer_value',
      '{}'::jsonb,
      p_lang,
      p_answered_at
    );
    v_written := v_written + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'persisted', true,
    'lead_hash', v_lead_hash,
    'answers_written', v_written
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_lead_complete(jsonb,jsonb,text,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_lead_complete(jsonb,jsonb,text,timestamptz) TO service_role;

COMMIT;
