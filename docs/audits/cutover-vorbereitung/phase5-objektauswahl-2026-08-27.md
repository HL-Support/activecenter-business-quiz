# Phase-5-Objektauswahl: Quiz-Verbund für die Migration nach Hetzner-PostgreSQL

**Stand: 27.08.2026**

Zweck: Auswahlgrundlage für Phase 5 (Audit vom 23.08.2026, Abschnitt 8) — die Entscheidung, welche Datenbankobjekte der Supabase-Instanz `Stats_Logs` zum Business-Leads-Quiz-Verbund gehören und mitmigriert werden, welche fremd sind und bleiben, und welche eine Entscheidung brauchen. Geprüft gegen:

- Objektmanifest vom 27.08.2026, 06:11 UTC (`objektmanifest/manifest-2026-08-27.md` / `.json`)
- Verbraucher-Inventar vom 24.08.2026 (`docs/audits/verbraucher-inventar/INVENTAR.md`, 14 aktive Verbraucher)
- Besitzmatrix aus dem Audit vom 23.08.2026 (Abschnitt 6)
- kanonisches v2-Schema `supabase-lead-system-v2.sql` sowie `supabase-analytics-v2.sql`

🔴 **Vor dem Testimport das Manifest frisch erzeugen** (steht so im Manifest selbst: „Audit 13.5.1 — vor dem Testimport der Phase 5 FRISCH erzeugen"). Dieses Dokument ist eine Auswahl gegen den Stand vom 27.08., kein Ersatz für den frischen Katalogabzug.

Bezugsrahmen: Das Manifest erfasst als Verbund-Schemata `public` (40 Tabellen, 6 Views, 17 Sequenzen), `analytics_internal` (2 Tabellen, 1 Sequenz) und `archive` (4 Tabellen). Zusammen: **46 Tabellen, 6 Views, 31 Funktionen, 6 Trigger, 18 Sequenzen = 107 Objekte.** Jede Zeile unten ist einer dieser Quellen zugeordnet; was in keiner Quelle zugeordnet ist, steht ehrlich unter „Entscheidung nötig".

---

## 1. Quiz-Verbund — wird migriert

### 1.1 Tabellen (12)

| Objekt | Schema | Typ | Begründung |
| --- | --- | --- | --- |
| `lead_state` | public | Tabelle | Leadkern, v2-SQL; kanonischer Schreiber business-leads-quiz (Inventar 3.1, Besitz §4.1 bestätigt) |
| `lead_events` | public | Tabelle | Event-Rohdaten, v2-SQL; Quiz kanonisch (Achtung: Fremdschreiber `activecenter-analytics` und Nurture-RPCs, siehe Abschnitt 6) |
| `lead_video_progress` | public | Tabelle | Videofortschritt, v2-SQL; Quiz (Inventar §4.1) |
| `lead_answers_current` | public | Tabelle | Aktuelle Antworten, v2-SQL; Quiz (Inventar §4.1) |
| `lead_sync_outbox` | public | Tabelle | Outbox für Sync-Jobs, v2-SQL; Quiz + Outbox-Worker (Inventar §4.1) |
| `lead_profiles` | public | Tabelle | Quiz-Verbraucherobjekt (Inventar 3.1, §4.1 bestätigt); trägt u. a. die Resume-Session-Daten (`api/bridge.js` upsertet `lead_profiles` beim Erzeugen des kurzen Resume-Keys) |
| `app_config` | public | Tabelle | Feature-Flags des Lead-Systems, v2-SQL (u. a. `outbox_worker_enabled`) |
| `nurture_sequences` | public | Tabelle | Stammdaten des Nurture-Systems; FK-Ziel von `nurture_runs` und `nurture_subject_states` (Manifest-FKs) |
| `nurture_runs` | public | Tabelle | Nurture-Telemetrie; beschrieben von den n8n-Quiz-Workflows „Nurture Email Sender"/„Error Alert" (Inventar 3.2) |
| `nurture_subject_states` | public | Tabelle | Nurture-Zustand je Mensch; Teil des `nurture_*`-Verbunds (Manifest, FK auf `nurture_sequences`) |
| `event_daily` | analytics_internal | Tabelle | Quiz-Analytics-Aggregat, aufgebaut aus `public.lead_events`; definiert in `supabase-analytics-v2.sql` dieses Repos; befüllt vom pg_cron-Job 1 (Inventar 3.3) |
| `refresh_runs` | analytics_internal | Tabelle | Protokoll der Analytics-Refreshes, `supabase-analytics-v2.sql` |

### 1.2 Views (6)

| Objekt | Schema | Typ | Begründung |
| --- | --- | --- | --- |
| `v_lead_state_full` | public | View | Kernsicht, v2-SQL; gelesen von Quiz, Analytics, HBA, Kalkulator, n8n-Nurture (Inventar) |
| `v_sync_dead_jobs` | public | View | Dead-Letter-Sicht der Outbox, v2-SQL |
| `v_funnel_analysis` | public | View | Quiz-Verbraucherobjekt (Inventar 3.1, business-leads-quiz) |
| `v_resume_metrics` | public | View | Quiz-Verbraucherobjekt (Inventar 3.1); DB-seitiger Anteil des Resume-Umfelds |
| `v_completion_metrics` | public | View | Quiz-Verbraucherobjekt (Inventar 3.1) |
| `v_nurture_runs_wahr` | public | View | Wahrheitssicht auf die Nurture-Läufe; gehört zum `nurture_*`-Verbund (Manifest); Datenbasis des Nurture-Wächters |

### 1.3 Funktionen/RPCs (19)

| Objekt | Schema | Typ | Begründung |
| --- | --- | --- | --- |
| `init_lead` | public | RPC | v2-SQL; Quiz (Inventar: 7 RPCs des business-leads-quiz) |
| `upsert_answer_current` | public | RPC | v2-SQL; Quiz |
| `enqueue_lead_sync` | public | RPC | v2-SQL; Quiz |
| `upsert_video_progress_monotonic` | public | RPC | v2-SQL; Quiz (monotone Progression + Rank-Outbox) |
| `claim_outbox_jobs` | public | RPC | v2-SQL; Outbox-Worker (`FOR UPDATE SKIP LOCKED` — bleibt laut Audit §6 atomisch) |
| `mark_outbox_done` | public | RPC | v2-SQL; Outbox-Worker |
| `mark_outbox_failed` | public | RPC | v2-SQL; Outbox-Worker |
| `set_updated_at` | public | Trigger-Funktion | v2-SQL; von den fünf `trg_lead_*`-Triggern verwendet (und von `trg_system_alerts_updated_at`, siehe Abschnitt 3) |
| `record_nurture_sent` | public | RPC | Schreiber: n8n „AC - Quiz Nurture Email Sender" (Inventar 3.2) |
| `record_nurture_skip` | public | RPC | dito |
| `record_nurture_run` | public | RPC | dito |
| `record_nurture_failure` | public | RPC | Schreiber: n8n „AC - Error Alert (Postmark)" (Inventar 3.2) |
| `nurture_overview` | public | RPC | Nurture-Lesesicht; Aufrufer `hl-support-analytics`. Inventar-Gate: „müssen im Ziel existieren oder durch APIs ersetzt sein" — daher mitnehmen, Aufrufer umstellen |
| `nurture_people_page` | public | RPC | dito |
| `nurture_events_page` | public | RPC | dito |
| `nurture_health_signals` | public | RPC | dito |
| `analytics_dashboard_v2` | public | RPC | definiert in `supabase-analytics-v2.sql` dieses Repos; liest `lead_events`/`analytics_internal`; Aufrufer `analytics/api` (activecenter-analytics) |
| `analytics_events_page_v2` | public | RPC | dito |
| `refresh_event_daily` | analytics_internal | Funktion | `supabase-analytics-v2.sql`; wird vom pg_cron-Job 1 aufgerufen (Inventar 3.3) |

### 1.4 Trigger (5)

| Objekt | Tabelle | Begründung |
| --- | --- | --- |
| `trg_lead_state_updated_at` | `lead_state` | v2-SQL |
| `trg_lead_answers_current_updated_at` | `lead_answers_current` | v2-SQL |
| `trg_lead_sync_outbox_updated_at` | `lead_sync_outbox` | v2-SQL |
| `trg_lead_video_progress_updated_at` | `lead_video_progress` | v2-SQL |
| `trg_lead_migration_unresolved_updated_at` | `lead_migration_unresolved` | v2-SQL — zieht nur mit, wenn die Tabelle mitzieht (Abschnitt 3) |

### 1.5 Sequenzen (4) und pg_cron

Sequenzen folgen ihrer Tabelle: `lead_events_event_id_seq`, `lead_profiles_id_seq`, `lead_sync_outbox_id_seq` (public) und `refresh_runs_run_id_seq` (analytics_internal) ziehen mit. Beim Cutover werden sie laut Phase 6 Punkt 7 auf `max(id)+Puffer` gesetzt.

**pg_cron-Job 1** `stats-logs-analytics-v2-current-day` (`*/15 * * * *`, `analytics_internal.refresh_event_daily(...)`): gehört zum Quiz-Verbund und wird auf der Zielseite **neu angelegt** — im Cutover-Fenster vorher auf der Quelle deaktivieren (Inventar 3.3 und Risiko 4: sonst scheitert der Schreibruhe-Nachweis 13.5.2). Jobs können nicht „gedumpt" werden; der Job ist als versioniertes SQL anzulegen.

`generate_resume_token`-Umfeld: **DB-seitig existiert keine solche Funktion** (Manifest: 31 Funktionen, keine Resume-Funktion). Token-Erzeugung und -Auflösung (`generate_resume_token`, `resolve_resume_token`, `resolve_resume_key`) sind Bridge-Actions in `api/bridge.js` (JWT + kurzer Resume-Key); der DB-Anteil sind `lead_profiles` und `v_resume_metrics` — beide oben enthalten. Es ist hierfür nichts zusätzlich zu migrieren.

---

## 2. Fremd — bleibt in Supabase / gehört anderen

### 2.1 Objekte innerhalb der Verbund-Schemata (16 + 2 Funktionen + 4 Sequenzen)

| Objekt | Schema | Typ | Begründung |
| --- | --- | --- | --- |
| `hba_persons`, `hba_monthly_metrics`, `hba_lines_monthly_summary`, `hba_requalification_tracker`, `hba_special_recognitions`, `hba_recognition_runs`, `hba_recognition_entries`, `hba_supervisor_stage_achievements`, `hba_supervisor_stage_reviews`, `hba_data_source_status` (10) | public | Tabellen | Herbalife-Business-Analyse. Inventar §4.1: „`hba_*` wird ausschließlich von HBA geschrieben"; Besitzmatrix: „Nicht blind in diese Produktdatenbank übernehmen" |
| `decide_hba_supervisor_stage_review`, `set_hba_supervisor_stage_review_awt` (2) | public | Funktionen | Die 2 HBA-RPCs (Inventar 3.1). Enthalten die beiden `extensions.digest`-Katalogfunde (Abschnitt 4) |
| `sso_token_consumptions` | public | Tabelle | Schreiber: `fitapp-marathon`, `Business_Kalkulator`, `zzz_Bioniq_Admin` (Inventar Risiko 4) — das Quiz nutzt sie nicht; Besitzmatrix: explizit ausschließen. Langfristiger Eigentümer ist eine eigene Frage (Inventar §8 Punkt 3/5), aber keine Quiz-Frage |
| `landing_page` | public | Tabelle | Schreiber ist die `landing-page`-App (Inventar 3.1); Besitzmatrix: ausschließen |
| `landing_page_events` | public | Tabelle | 0 Zeilen seit Bestehen (Inventar §4.1); Besitzmatrix: ausschließen |
| `coach_access` | public | Tabelle | nie beschrieben (Inventar §4.1); Besitzmatrix: ausschließen |
| Sequenzen `hba_special_recognitions_id_seq`, `landing_page_id_seq`, `landing_page_events_id_seq`, `coach_access_id_seq` (4) | public | Sequenzen | folgen ihren fremden Tabellen |

### 2.2 Fremde Schemata (nicht im Verbund, zur Vollständigkeit)

| Schema | Begründung |
| --- | --- |
| `marathon` (39 Tabellen), `marathon_backup` (3) | Fitapp; „ziehen NICHT mit dem Quiz um" (Manifest); eigener Umzug (Inventar §4.2 Punkt 5) |
| `auth` (23), `storage` (8), `realtime`, `vault`, `supabase_migrations`, `pgbouncer`, `graphql*`, `extensions`, `cron` | Supabase-Plattform-Interna; im Manifest als „im Verbund: nein" geführt. Der Bucket `images` in `storage` gehört `fitapp-marathon` (Inventar §4.2 Punkt 7) |

**pg_cron-Job 2** `pgss-monatsreset` (`pg_stat_statements_reset()`, monatlich): Diagnosehygiene der Instanz, kein Datenverbraucher (Inventar 3.3) — zieht nicht mit dem Quiz.

---

## 3. Gemeinsam genutzt / Entscheidung nötig

| Objekt(e) | Wer nutzt es | Optionen | Empfehlung |
| --- | --- | --- | --- |
| `tracking_sessions`, `tracking_events`, `tracking_video_progress` (+ 3 Sequenzen) | **zwei aktive Schreiber**: business-leads-quiz und `landing-page` (Inventar §4.2 Punkt 2); zusätzlich liest n8n-Nurture `tracking_sessions` | (a) mitmigrieren und `landing-page` im selben Zug umstellen; (b) Schnitt: Quiz-Anteil migrieren, `landing-page` erhält eigene Ablage; (c) einfrieren/archivieren | Mitnehmen ist wegen der aktiven Quiz-Nutzung naheliegend, aber **erst nach Entscheidung über `landing-page`** — sonst schreibt sie nach dem Cutover in die Altinstanz weiter. `landing-page` gehört in jedem Fall in die Schreibbarriere 13.5.2 |
| `quiz_sessions` (+ Sequenz) | business-leads-quiz (Legacy-Pfad, Inventar 3.1; Besitz §4.1 bestätigt); Ad-hoc-Skript `create-quiz-sessions-table.js` mit hartkodiertem Key (Risiko 3 — vor Rotation löschen) | mitmigrieren als Legacy / einfrieren und nur Altbestand archivieren | Mitmigrieren, solange der Legacy-Pfad im Code lebt; Abbau gemäß Audit P2 („Legacy-Tabellen nach belegter Nichtnutzung entfernen") |
| `lead_migration_unresolved` (+ Sequenz, + Trigger) | v2-SQL-Objekt, Besitz Quiz bestätigt (Inventar §4.1); 40 Zeilen, Migrationsaltlast v1→v2 | mitmigrieren / als erledigte Altlast nur archivieren | Mitmigrieren (klein, im v2-Schema samt Trigger definiert); Entscheidung ist nur, ob der Altbestand als lebende Tabelle oder als Archiv mitkommt |
| `lead_contact_crm` | einziger Schreiber: `Business_Kalkulator/api/contacts.js` — ein fremdes Projekt; das Quiz liest sie nicht einmal (Inventar §4.2 Punkt 1) | (a) mitmigrieren und Kalkulator im selben Zug umstellen; (b) beim Kalkulator belassen | Inventar-Wortlaut: „Sicher ist die Zuordnung nur, wenn der Kalkulator im selben Zug umgestellt wird." Eigentümerfrage **vor Phase 5** klären (Inventar 3.1) |
| `lead_access_permissions` (+ Sequenz) | im v2-SQL definiert, aber **nie beschrieben** (Inventar §4.1); trägt den FK auf `auth.users` (Katalogfund, Abschnitt 4) | (a) nicht migrieren, im neuen Rollenmodell ersetzen; (b) ohne FK übernehmen | Nicht migrieren: leer, Supabase-Auth-gebunden; Audit §6 sagt ohnehin „RLS/`auth.jwt()` wird nicht blind kopiert". Bestätigung durch Markus nötig, weil das Objekt im kanonischen v2-SQL steht |
| `form_webhook_deliveries` | **vier Schreiber** (`hautanalyse`, `wellness-check`, `activecenter-surveys`, `landing-page`), ein Leser (`hl-support-analytics`) — keiner davon im Business-Leads-Produkt (Inventar §4.2 Punkt 3) | Webhook-Verbund / business_leads | Laut Inventar beantwortet: „gehört dem Webhook-Verbund, nicht dem Quiz, und sollte **nicht** nach `business_leads`". Formale Bestätigung + Zielort des Webhook-Verbunds offen (Inventar §8 Punkt 1) |
| `webhook_source_events`, `webhook_delivery_jobs`, `webhook_delivery_attempts`, `webhook_delivery_actions`, `webhook_deliveries`, `webhook_connector_heartbeats` (6, + 3 Sequenzen) | `hl-support-analytics` (R/W), `activecenter-hautanalyse` (W), `activecenter-analytics` schreibt `webhook_deliveries` (Inventar 3.1) | eigenes Webhook-Produkt / business_leads | Wie `form_webhook_deliveries`: Webhook-Verbund, nicht Quiz (Inventar §4.2 Punkt 4 und §8 Punkt 1). Empfehlung: nicht nach `business_leads` |
| Webhook-Funktionen: `enqueue_webhook_event`, `claim_webhook_delivery_jobs`, `mark_webhook_delivery_done`, `mark_webhook_delivery_failed`, `retry_webhook_delivery_job`, `record_webhook_connector_heartbeat`, `webhook_delivery_overview`, `webhook_delivery_health_signals`, `close_webhook_delivery_job` (9) | hautanalyse (4 RPCs), hl-support-analytics (4 RPCs); `close_webhook_delivery_job` ist **in keiner Inventar-Zeile zugeordnet** (Herkunft/Aufrufer unklar) | folgen der Tabellen-Entscheidung | Folgen dem Webhook-Verbund; `close_webhook_delivery_job` vor dem Export klären |
| `system_alerts` (+ Sequenz, + Trigger `trg_system_alerts_updated_at`) | Schreiber: `activecenter-analytics`, nicht das Quiz (Inventar §4.2 Punkt 4) | Analytics-/Webhook-Verbund / mitnehmen | Zuordnung „Lead-Verbund" ist **nicht bestätigt**; Entscheidung folgt dem ohnehin nötigen Umbau von `activecenter-analytics` (Risiko 2). Trigger nutzt `set_updated_at` — die Funktion zieht mit dem Quiz mit, der Trigger folgt der Tabelle |
| `cron_runs` | `fitapp-marathon` schreibt, `hl-support-analytics` liest; „das Business-Leads-Produkt benutzt ihn gar nicht" (Inventar §4.1) | zentral belassen / je Produkt trennen (Inventar §8 Punkt 3) | Nicht nach `business_leads` migrieren; Eigentümerfrage mit dem Marathon-Umzug klären |
| `archive.persons`, `archive.monthly_metrics`, `archive.lines_monthly_summary`, `archive.requalification_tracker` (4) | **in keiner Quelle einem Verbraucher zugeordnet** (Herkunft unklar). Laut Manifest strukturgleich mit den `hba_*`-Tabellen: identische Namen ohne Präfix und identische FK-Struktur auf `archive.persons` | HBA zuordnen und dortlassen / mitnehmen | Vermutlich HBA-Archiv — aber das ist ein Namensindiz, kein Beleg. Vor dem Testimport klären; bis dahin **nicht** in den Quiz-Export |
| `rls_auto_enable` (Funktion) | in keiner Quelle einem Verbraucher zugeordnet (Herkunft unklar); dem Namen nach RLS-Hygiene der Instanz | klären / weglassen | Klären; auf Hetzner gilt ohnehin ein anderes Rollenmodell (Audit §6), vermutlich entbehrlich |

---

## 4. Katalog-/Extension-Abhängigkeiten

Das Manifest meldet **3 Katalogfunde** außerhalb des Verbunds — alle drei sind vor dem Testimport zu klären, keiner blockiert den Quiz-Export, wenn die Auswahl oben gilt:

1. **`public.decide_hba_supervisor_stage_review` referenziert `extensions.digest`** (pgcrypto im Schema `extensions`).
2. **`public.set_hba_supervisor_stage_review_awt` referenziert `extensions.digest`.**
   → Beide Funktionen sind HBA und werden **nicht** migriert. Konsequenz für den Export: Der selektive Dump darf diese Funktionen nicht einschließen — ein pauschaler `public`-Dump würde auf dem Ziel scheitern oder ein `extensions`-Schema mit pgcrypto erzwingen. Die Objektauswahl ersetzt damit den Schema-Dump: exportiert wird die Liste aus Abschnitt 1, nicht „ganz public".
3. **FK `lead_access_permissions_user_id_fkey` → `auth.users`** (Schema `auth`).
   → `auth` zieht nicht mit; würde die Tabelle mitgenommen, ließe sich der FK auf dem Ziel nicht anlegen. Empfehlung aus Abschnitt 3: Tabelle gar nicht migrieren; dann verschwindet der Fund vollständig.

**Benötigte Extensions auf dem Ziel (PostgreSQL 18.6):**

- **`pgcrypto`** — das v2-SQL beginnt mit `CREATE EXTENSION IF NOT EXISTS pgcrypto` („Required for gen_random_uuid()"); `init_lead` nutzt `gen_random_uuid()`. Auf dem Ziel bereitstellen bzw. prüfen, ob die eingebaute `gen_random_uuid()` des modernen PostgreSQL genügt — das v2-SQL ist die Referenz.
- **`pg_cron`** — für den neu anzulegenden Job `refresh_event_daily` (alle 15 Minuten); `supabase-analytics-v2.sql` legt die Extension explizit an.
- Nicht benötigt für den Quiz-Verbund: `uuid-ossp` (kein Nachweis einer Quiz-Nutzung in den Quellen), `supabase_vault` (Supabase-intern), `pg_stat_statements` (Diagnose; auf dem Ziel optional, gehört nicht zur Objektauswahl).

---

## 5. Entscheidungen (Markus, 27.08.) und Klärungen — alle 7 Fragen beantwortet

1. **`tracking_*`: mitmigrieren.** Der zweite Schreiber verschwindet: Das eigene
   Business-Formular der `landing-page` wird **abgeschaltet**, die Landing Page verlinkt
   künftig direkt auf das Business-Leads-Quiz. 🔴 Vorbedingung vor dem Cutover: Umbau in
   der `landing-page` (Formular raus, Link rein) — sonst schreibt sie nach dem Umzug in
   die Altinstanz. Gehört zusätzlich in die Schreibbarriere 13.5.2 als Nachweis.
2. **`lead_contact_crm`: mitnehmen; `Business_Kalkulator` wird im selben Zug auf den
   neuen Zugriffsweg umgestellt** und zieht perspektivisch ebenfalls auf den
   Coolify-Server (genereller Kurs: alles Schritt für Schritt weg von Vercel und
   Supabase). Im Ziel-Postgres wird sauber getrennt und sortiert (je Produkt eigener
   Bereich), damit möglichst keine gemeinsam beschriebenen Objekte mehr existieren.
3. **Webhook-Verbund: fällt aus dem Quiz-Export** (`form_webhook_deliveries`,
   `webhook_*`-Tabellen und die 9 Webhook-Funktionen inkl.
   `close_webhook_delivery_job`). Zielbild (Markus): den Legacy-MySQL-Weg nach dem
   Muster des Analysenprojekts (Vital-Analyse) modernisieren — Daten erst **bündeln**,
   dann über **eine einzige Schnittstelle** in die Legacy-MySQL (`typeform_surveys`)
   schreiben, statt vieler Einzelverbindungen. Eigenes Vorhaben, nicht Teil des
   Quiz-DB-Umzugs; deckt sich mit dem Phase-4-Zielbild (MySQL nur noch über die Outbox
   → eine Schnittstelle).
4. **`lead_access_permissions`: entfällt ersatzlos** (nie beschrieben, `auth.users`-FK).
   Folgeaufgabe: auch aus `supabase-lead-system-v2.sql` streichen, damit der
   Phase-5-Export sie nicht wieder anlegt. Damit verschwindet Katalogfund 3 vollständig.
5. **`archive`-Schema: geklärt und erledigt** (27.08., rein lesend gemessen): alle vier
   Tabellen haben **0 Zeilen** — es gibt nichts zu sichern. Strukturgleich mit `hba_*`,
   bleibt als HBA-Altlast in der Quelle, kein Quiz-Export.
6. **Geklärt per Funktionsdefinition** (27.08.): `rls_auto_enable` ist
   Supabase-Instanz-Hygiene — der Event-Trigger `ensure_rls` schaltet RLS auf jeder neu
   angelegten `public`-Tabelle ein. Zieht **nicht** mit (auf Hetzner gilt ein eigenes
   Rollenmodell; Objekte entstehen dort aus versioniertem SQL).
   `close_webhook_delivery_job` ist die Admin-Funktion des Webhook-Verbunds (schließt
   failed/dead-Jobs mit Auditzeile in `webhook_delivery_actions`) — folgt dem
   Webhook-Verbund, nicht dem Quiz.
7. **`lead_migration_unresolved` und `quiz_sessions`: mitnehmen** (Empfehlung
   angenommen) — als lebende Legacy-Objekte, Abbau später gemäß Audit P2.

**Zusatzentscheidung `activecenter-analytics`:** Die alte Statistikseite wird **nicht
übernommen**. Statistiken/Quoten werden bei Bedarf neu gebaut (einfacher als der Umzug
der Altseite). Konsequenz für Phase 6: Ihr Schreibzugriff auf `lead_events` und
`webhook_deliveries`/`system_alerts` muss **vor dem Cutover enden** (Schreibbarriere) —
damit entfällt auch der wichtigste Fremdschreiber auf `lead_events`. Die beiden
Analytics-RPCs (`analytics_dashboard_v2`, `analytics_events_page_v2`) und
`analytics_internal` ziehen trotzdem mit: Sie sind im Quiz-Repo definiert und
unabhängig von der Altseite nutzbar; `system_alerts` bleibt dagegen zurück.

---

## 6. Zählung nach den Entscheidungen (Abgleich mit dem Manifest)

„Migrieren" heißt weiterhin nicht „isoliert umschaltbar" — aber mit dem Abschalten des
landing-page-Formulars und dem Nicht-Übernehmen von `activecenter-analytics` sind die
beiden kritischen Fremdschreiber terminierbar; übrig bleiben die Nurture-RPC-Schreiber
(ziehen mit) und die Umstellung der `hl-support-analytics`-Lesezugriffe.

| Objektart | Manifest gesamt | migrieren | fremd/bleibt | entfällt |
| --- | --- | --- | --- | --- |
| Tabellen (public 40 + analytics_internal 2 + archive 4) | 46 | 18 | 27 | 1 (`lead_access_permissions`) |
| Views (alle public) | 6 | 6 | 0 | 0 |
| Funktionen | 31 | 19 | 11 | 1 (`rls_auto_enable`) |
| Trigger | 6 | 5 | 1 | 0 |
| Sequenzen (public 17 + analytics_internal 1) | 18 | 9 | 8 | 1 |
| **Summe** | **107** | **57** | **47** | **3** |

Migrieren-Zugänge gegenüber Abschnitt 1: `tracking_sessions`, `tracking_events`,
`tracking_video_progress`, `quiz_sessions`, `lead_migration_unresolved`,
`lead_contact_crm` (+ zugehörige Sequenzen). Fremd/bleibt-Zugänge: `archive` (4),
Webhook-Verbund (7 Tabellen, 9 Funktionen, 3 Sequenzen), `system_alerts` (+ Trigger,
+ Sequenz), `cron_runs`. pg_cron: Job 1 wird auf dem Ziel neu angelegt, Job 2 zieht
nicht mit. Fremde Schemata (`marathon` 39/2, `marathon_backup` 3, `auth` 23/1,
`storage` 8, `cron` 2/2, `realtime` 3/1, `vault` 1, `supabase_migrations` 1,
`extensions` 0/2 Views) sind laut Manifest „im Verbund: nein" und hier nur zur
Abgrenzung genannt.

Hinweis: Mit Stufe A des Phase-4-Designs kommt eine weitere Verbund-Funktion
`submit_lead_complete` hinzu (im frischen Manifest vor dem Testimport dann 32
Funktionen, 20 davon migrieren).
