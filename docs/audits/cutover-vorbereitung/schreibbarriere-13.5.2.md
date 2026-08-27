# Schreibbarriere für den Datenbank-Cutover (Audit 13.5.2)

Stand: 27.08.2026 · Ablaufplan zur Ausführung am Umzugstag · Voraussetzung: Phase-5-Test
bestanden ([Protokoll](phase5-testimport/testimport-protokoll-2026-08-27.md))

## Wozu

Ein Dump ist nur dann vollständig, wenn nach ihm **niemand mehr** in die Quelle schreibt.
Sonst liegen Zeilen in der alten Datenbank, die in der neuen fehlen — und niemand merkt
es, weil nichts kaputtgeht. Genau diese Klasse „stiller Verlust" hat dieses Projekt
schon zweimal getroffen (Zeilengrenze im Nurture, void-RPC bei den Antworten).

Deshalb wird hier nicht gebeten, sondern **erzwungen**: Schreibrechte werden entzogen,
der Stillstand wird **gemessen**, und erst dann läuft der Dump.

## Wer schreibt heute in die 18 Tabellen

| Schreiber | Behandlung | Stand |
| --- | --- | --- |
| **business_leads_quiz** (die Anwendung selbst) | schreibt bis zum Umschalten; im Fenster schlägt nur der PostgreSQL-Teil fehl — siehe „Warum das Fenster ungefährlich ist" | Hauptschreiber |
| **pg_cron-Job** `refresh_event_daily` (alle 15 min → `leads_analytics`) | **vor** dem Dump abschalten, auf dem Ziel neu anlegen | aktiv |
| **n8n-Workflows** (Outbox-Worker, Health-Monitor, Nurture-Sender, Post-Processor) | im Fenster deaktivieren, danach auf die neue Datenbank zeigen | aktiv |
| **activecenter-analytics** (schreibt `lead_events`) | wird **nicht übernommen** (Entscheidung 27.08.) → Schreibzugriff endet dauerhaft **vor** dem Cutover | zu beenden |
| **landing-page** (`track_event` → `tracking_*`) | **erledigt**: Seite ist statisch, Tracking abgehängt (Entscheidung Markus, 27.08.). Gemessen: 1 Ereignis in 7 Tagen, letztes am 20.08. | kein Schreiber mehr |
| **hl-support-analytics** | liest nur (Nurture-RPCs) — blockiert die Barriere nicht, muss aber nach dem Umzug umgestellt werden | Leser |

## Warum das Fenster ungefährlich ist

Das Opt-in läuft über **zwei** Wege: die PHP-Bridge nach MySQL **und** die Persistenz
nach PostgreSQL. Fällt der PostgreSQL-Teil aus, meldet der Aufrufer das (GlitchTip), das
Opt-in selbst gelingt weiterhin, und die Daten liegen vollständig im MySQL-JSON. Sie
lassen sich danach mit dem vorhandenen `scripts/backfill-antworten.js` in die **neue**
Datenbank heilen — dieselbe Mechanik, die am 27.08. sechs Altfälle geheilt hat.

Ein Lead geht im Fenster also nicht verloren. Trotzdem gilt: Fenster kurz halten und in
eine verkehrsarme Zeit legen (Erfahrung: nachts zwischen 02:00 und 05:00 MESZ praktisch
kein Verkehr).

## Ablauf

### 0. Vorbereitung (Tage vorher)

- `activecenter-analytics` dauerhaft vom Schreiben trennen und **messen**, dass keine
  neuen `lead_events` mit ihrer Signatur mehr ankommen.
- Frisches Objektmanifest und frischen Schema-Export erzeugen
  (`scripts/objektmanifest-supabase.js`, `scripts/phase5-schema-export.js`).
- Zieldatenbank vorbereiten: Rollen und Schemata stehen bereits
  (`plattform-rollen-leads.sql`, ausgerollt 27.08.).

### 1. Barriere setzen (Beginn des Fensters)

```sql
-- pg_cron zuerst: er schreibt alle 15 Minuten und wuerde sonst mitten in den Dump laufen.
SELECT cron.unschedule('stats-logs-analytics-v2-current-day');

-- Schreibrechte entziehen. Danach schlaegt JEDER Schreibversuch laut fehl, statt still
-- in der alten Datenbank zu landen. SELECT bleibt erhalten, damit der Dump lesen kann.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON
  public.lead_state, public.lead_events, public.lead_video_progress,
  public.lead_answers_current, public.lead_sync_outbox, public.lead_profiles,
  public.app_config, public.nurture_sequences, public.nurture_runs,
  public.nurture_subject_states, public.tracking_sessions, public.tracking_events,
  public.tracking_video_progress, public.quiz_sessions,
  public.lead_migration_unresolved, public.lead_contact_crm,
  analytics_internal.event_daily, analytics_internal.refresh_runs
FROM anon, authenticated, service_role;
```

n8n-Workflows in derselben Minute deaktivieren (API, nicht per SQL — siehe Skill
`n8n-workflow-update`).

### 2. Barriere beweisen — zwei Messungen, nicht eine

```sql
-- (a) Ein Schreibversuch MUSS scheitern:
--     als service_role: INSERT INTO public.lead_events ... -> "permission denied"
-- (b) Stillstand ueber Zeit: zweimal im Abstand von 3 Minuten messen, Werte identisch.
SELECT 'lead_events' t, count(*) n, max(event_id) hoechste, max(event_at) letzte FROM public.lead_events
UNION ALL SELECT 'lead_state', count(*), NULL, max(last_event_at) FROM public.lead_state
UNION ALL SELECT 'lead_answers_current', count(*), NULL, max(updated_at) FROM public.lead_answers_current
UNION ALL SELECT 'lead_sync_outbox', count(*), max(id), max(updated_at) FROM public.lead_sync_outbox
UNION ALL SELECT 'tracking_events', count(*), max(id), max(event_at) FROM public.tracking_events;
```

🔴 Erst wenn **beide** Messungen gleich sind, ist die Quelle wirklich still. Eine einzelne
Messung beweist nichts (Verzögerungen, Caches, mehrere Knoten).

### 3. Übertragen (gemessen: ≈ 24 Sekunden)

```bash
# Zugangsdatei aus den Secrets erzeugen (marathon_supabase_app), chmod 600, danach loeschen.
pg_dump "$QUELLE" --data-only --no-owner --no-privileges -t public.lead_state … -f /tmp/bl-daten.sql
psql -d <ziel> -v ON_ERROR_STOP=1 -f /tmp/bl-daten.sql   # mit SET session_replication_role = replica
```

Schema kommt aus dem selektiven Export (mit Schema-Abbildung `public→leads`,
`analytics_internal→leads_analytics`); die Sequenz-Stände bringt `pg_dump` mit.

### 4. Nachweisen (dieselben Zahlen, andere Datenbank)

- Zeilenzahlen je Tabelle Quelle == Ziel.
- Inhaltsprüfsummen wie im Testimport (inkl. Umlaut- und JSON-Probe).
- **0 echte Waisen** in allen 7 Fremdschlüsselbeziehungen.
- Identity-/Sequenzstände über dem höchsten Wert.
- Funktionsbeweis: `submit_lead_complete`, `upsert_video_progress_monotonic`,
  `v_lead_state_full`, `init_lead` gegen den vollen Bestand.

### 5. Umschalten und öffnen

- Anwendung auf `leads_app` und die neue Datenbank umstellen (Phase 4 Stufe B).
- pg_cron-Job auf dem **Ziel** anlegen.
- n8n-Workflows auf die neue Datenbank zeigen und wieder aktivieren.
- Wächter (W1–W5) auf die neue Quelle umstellen — 🔴 sonst bewachen sie weiter die alte
  Datenbank und melden triumphierend „alles ruhig".

### 6. Rückweg (falls Schritt 4 einen Befund liefert)

```sql
-- Rechte zurueckgeben, Cron wieder einplanen: die Quelle ist unveraendert und vollstaendig,
-- weil im Fenster niemand geschrieben hat. Genau dafuer ist die Barriere da.
GRANT INSERT, UPDATE, DELETE ON  … TO anon, authenticated, service_role;
SELECT cron.schedule('stats-logs-analytics-v2-current-day', '*/15 * * * *', $$…$$);
```

Die Anwendung bleibt bis Schritt 5 auf der alten Datenbank — ein Rückweg kostet damit
nur das Fenster, keine Daten.

## Offene Punkte vor dem Umzugstag

1. `activecenter-analytics` tatsächlich vom Schreiben trennen (Entscheidung steht, die
   Ausführung nicht).
2. Schema-Abbildung `public→leads` im Export bauen und im Testimport beweisen
   (Funktionsrümpfe tragen `search_path` und qualifizierte Verweise).
3. Wächter- und n8n-Umstellung vorbereiten, damit Schritt 5 nicht improvisiert wird.
