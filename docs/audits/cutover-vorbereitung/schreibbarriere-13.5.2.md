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
  → Messwerkzeug steht: `node --env-file=.env.prod scripts/fremdschreiber-messen.js`.
  Stand 27.08.: **ruhend seit 08.06.2026** (siehe unten), Pfad aber noch offen.
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

## Messung vom 27.08.2026 — wer schreibt heute wirklich

`scripts/fremdschreiber-messen.js` misst auf **zwei getrennten Wegen**, weil ein Weg
allein einen offenen Pfad „bewiesen" aussehen lässt (dieselbe Lehre wie beim void-RPC):

**A) Datenseite** — Ereignisse mit Fremdschreiber-Signatur in `lead_events`.
🔴 **Nicht über `source_app` messbar**: `activecenter-analytics` kopiert diesen Wert aus
`lead_state` und trägt im Regelfall `business_leads_quiz` — genau wie die Anwendung.
Trennscharf sind nur `payload->>'source' = 'analytics_dashboard_v2'` und das
`event_uid`-Präfix `test_lead_`.

**B) Transportseite** — schreibende HTTP-Zugriffe aus den Supabase-Edge-Logs
(Management-API, `analytics/endpoints/logs.all`, mit `iso_timestamp_start/end`).
🔴 **Nicht nach Herkunfts-IP gruppieren**: n8n-Cloud und Vercel rufen aus wechselnden
AWS-Bereichen — gemessen **59 IPs in 24 h** für eine Handvoll Dienste. Stabiler
Schlüssel ist der **Zielpfad**.

### Ergebnis

| Befund | Messung |
| --- | --- |
| **`activecenter-analytics` ist ruhend** | Letztes Ereignis mit ihrer Signatur: **08.06.2026** — 80 Tage her. 15 Zeilen insgesamt, alle aus Mai/Juni. |
| Andere `test_lead_marked`-Zeilen | stammen von E2E-, Smoke- und Cutover-Proben mit **eigener** `source_app` — nicht vom Dashboard. |
| Transportseite, 24 h | alle Schreibpfade in die Migrieren-Liste zugeordnet; kein unbekannter Schreiber. |
| Außerhalb der Auswahl | 6.880 Zugriffe auf `webhook_*`, `cron_runs`, `push_preprompt_health`, `sso_token_consumptions` — Verbünde, die bewusst zurückbleiben (Entscheidungen 3 und 8). |
| **Löschungen von Hand** | 2 DELETE (`lead_answers_current`, 91 ms später `lead_state`) von einem **Arbeitsplatz-Rechner**, nicht aus dem Repo — Testlead-Aufräumen. |

### Was das für die Trennung bedeutet

🔴 **Ruhend ist nicht geschlossen.** Der Codepfad lebt weiter
(`analytics/api/bridge.js:2148`, Action `set_test_contact`, ausgelöst vom
Dashboard-Knopf in `analytics/analytics.html:2854`). Ein einziger Klick schreibt wieder
— möglicherweise **mitten im Cutover-Fenster**. Die Messung belegt die Trennung, sie
ersetzt sie nicht.

Zugleich entschärft der Befund die Dringlichkeit: Es fließt **kein Dauerstrom**, der
erst versiegen müsste. Die Trennung ist ein einzelner, planbarer Eingriff — kein
Auslaufenlassen mit Wartezeit.

**Der Eingriff liegt in einem fremden Repo** (`activecenter-analytics`, eigenes
Vercel-Projekt) und kostet die Testlead-Markierung im Dashboard. Zwei Wege:

| Weg | Wirkung | Preis |
| --- | --- | --- |
| **`setTestLead` auf Fehler umstellen** (bzw. `set_test_contact` aus der Allowlist `bridge.js:46-56` nehmen) | schließt genau den einen Schreibpfad | Dashboard-Knopf meldet einen Fehler; Lesepfade und `webhook_deliveries` bleiben heil |
| `SUPABASE_SERVICE_KEY` aus der Vercel-Env ziehen | schließt alles auf einmal | bricht auch **alle Lesepfade** des Dashboards und `webhook_deliveries` — zu grob |

Empfehlung: der erste Weg, mit einem sprechenden Fehlertext („Testlead-Markierung
wurde zum Datenbank-Umzug abgeschaltet"), damit der Knopf nicht stumm scheitert.

Die Handarbeit vom Arbeitsplatz fängt die Barriere übrigens mit: das `REVOKE` trifft
`service_role`, also auch lokale Skripte mit dem Service-Key.

## Offene Punkte vor dem Umzugstag

1. `activecenter-analytics` tatsächlich vom Schreiben trennen — **gemessen ruhend seit
   08.06.**, Pfad aber noch offen; Eingriff im fremden Repo, Entscheidung siehe oben.
2. ~~Schema-Abbildung `public→leads` im Export bauen und im Testimport beweisen~~ —
   ✅ erledigt am 27.08. (PR #103), Beweise im
   [Testimport-Protokoll](phase5-testimport/testimport-protokoll-2026-08-27.md).
3. Wächter- und n8n-Umstellung vorbereiten, damit Schritt 5 nicht improvisiert wird.
