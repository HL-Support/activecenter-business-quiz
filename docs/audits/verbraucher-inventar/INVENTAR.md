# Supabase-Verbraucher-Inventar `Stats_Logs`

Stand: 24.08.2026 · Erhebung rein lesend · Auftrag: Audit vom 23.08.2026, Kapitel 12 Punkt 3
(„Vollständige Supabase-/Verbraucherlandkarte als maschinenprüfbares Inventar erzeugen")

Dieses Dokument ist die lesbare Fassung. Kanonisch und maschinenprüfbar ist
`scripts/inventory/supabase-consumers.json`; das Gate
`scripts/inventory/check-consumers.js` hält beide gegen einen frischen Workspace-Scan ehrlich.

---

## 1. Ergebnis in einem Satz

Die Instanz `Stats_Logs` (`xlpiisbozpgmemxhtivj`) hat **14 aktive Laufzeit-Verbraucher, davon 13
schreibend** — nicht neun; die Zahl neun stammt aus einer Vorerhebung, die vier heute
nachweislich schreibende Apps noch als „später zu klassifizieren" führte und den Zugriff aus der
Datenbank selbst gar nicht kannte.

---

## 2. Was erhoben wurde und wie

| Achse | Methode | Ergebnis |
| --- | --- | --- |
| Code im Workspace | ripgrep über `activecenter-web/`, ohne `node_modules`, `vendor`, `dist`, Build-Caches, Backups | 177 Dateien mit Supabase-Signal |
| n8n | `GET /api/v1/workflows` gegen `n8n.hl-support.biz`, nur lesend | 85 Workflows, davon 4 mit echtem Supabase-Zugriff |
| Vercel | `GET /v9/projects/{id}/env`, **nur Schlüsselnamen**, keine Werte | 25 Projekte, 11 mit `SUPABASE_*`-Env |
| Datenbank | Supabase-Management-API, ausschließlich `SELECT` auf Katalog- und Statistiksichten | Schemas, Objekte, letzte Schreibzeitpunkte, `cron.job`, Storage |

Es wurde nichts verändert: keine Migration, kein Workflow-Update, kein Deploy, keine
Env-Änderung. Alle DB-Abfragen waren reine Lesevorgänge gegen Kataloge.

### Warum die Datenbankabfrage nötig war

Ein reiner Codescan hätte zwei Verbraucher nie gefunden:

- den **pg_cron-Job in der Datenbank selbst** (`analytics_internal.refresh_event_daily`, alle 15
  Minuten schreibend) — er steht in keinem Repository und in keiner Env-Liste;
- die **tatsächliche Schreibaktivität** je Tabelle. Erst `pg_stat_user_tables` plus
  `max(created_at)` je Relation zeigt, welche Objekte heute noch benutzt werden und welche seit
  Monaten stillstehen.

---

## 3. Verbrauchertabelle

`R` = liest, `W` = schreibt. Zugriffsweg: `REST` = PostgREST `/rest/v1/<tabelle>`,
`RPC` = `/rest/v1/rpc/<funktion>`, `direkt` = PostgreSQL-Protokoll, `Mgmt` = Management-API.

### 3.1 Aktive Anwendungen (10)

| Verbraucher | Zugriffsweg | Objekte | R/W | Migrationsrelevanz | Abschalt-Gate |
| --- | --- | --- | --- | --- | --- |
| **business-leads-quiz** (Vercel, `business.activecenter.info`) | REST + RPC | `lead_state`, `lead_events`, `lead_video_progress`, `lead_answers_current`, `lead_sync_outbox`, `lead_profiles`, `lead_migration_unresolved`, `app_config`, `quiz_sessions`, `tracking_*`, `v_lead_state_full`, `v_funnel_analysis`, `v_resume_metrics`, `v_completion_metrics`, 7 RPCs | **W** (kanonisch) | kritisch | Phase 4: alle REST-/RPC-Aufrufe auf Kysely; **beide** Clients (`server/lead-system.js` *und* `api/bridge.js`) |
| **activecenter-analytics** (Vercel) | REST | `v_lead_state_full`, `lead_state`, `lead_events`, `lead_answers_current`, `lead_video_progress`, `lead_sync_outbox`, `system_alerts`, `webhook_deliveries` | **W** | kritisch | Schreibt `lead_events`. Kein isolierter Quiz-Cutover möglich (Phase 6 Punkt 2) |
| **herbalife-erfolgs-berechner** (Vercel) | REST | `v_lead_state_full`, `lead_events`, `lead_video_progress`, `lead_sync_outbox`, `lead_contact_crm`, `sso_token_consumptions` | **W** | kritisch | Einziger Schreiber von `lead_contact_crm` — und ein fremdes Projekt. Eigentümerfrage vor Phase 5 |
| **herbalife-business-analyse** (Vercel) | REST + RPC | `hba_*` (7 Tabellen), `lead_state`, `lead_events`, `v_lead_state_full`, 2 RPCs | **W** (nur `hba_*`), R auf Leadkern | hoch | Hartkodierten URL-Fallback entfernen, sonst schreibt HBA nach dem Umzug in die Altinstanz |
| **hl-support-analytics** (Vercel) | REST + RPC | `cron_runs`, `webhook_connector_heartbeats`, `webhook_delivery_*`, `webhook_source_events`, `form_webhook_deliveries`, `lead_sync_outbox`, 8 RPCs | **W** | hoch | Die `nurture_*`-RPCs lesen `lead_events`/`lead_sync_outbox`; sie müssen im Ziel existieren oder durch APIs ersetzt sein |
| **fitapp-marathon** (Vercel + Coolify) | **direkt** (Kysely/`pg` über Supavisor-Pooler) + REST + Storage | `marathon.*` (~40 Tabellen), `marathon_backup.*`, `cron_runs`, `sso_token_consumptions`, Bucket `images` | **W** | kritisch | Siehe Risiko 1 — hält als Einziger eine direkte PostgreSQL-Verbindung in dieselbe Instanz |
| **landing-page** (Vercel, `global-sce.com`) | REST | `tracking_sessions`, `tracking_events`, `tracking_video_progress`, `form_webhook_deliveries`, `landing_page` | **W** | hoch | Zweiter aktiver Schreiber auf den `tracking_*`-Tabellen; muss in die Schreibbarriere (13.5.2) |
| **activecenter-hautanalyse** (Vercel) | REST + RPC | `form_webhook_deliveries`, `webhook_delivery_jobs`, 4 RPCs | **W** | mittel | Eigentümerentscheidung `form_webhook_deliveries` |
| **wellness-check** (Vercel) | REST | `form_webhook_deliveries` | **W** | mittel | Eigentümerentscheidung `form_webhook_deliveries` |
| **activecenter-surveys** (Vercel, `lifestylesurvey.info`) | REST | `form_webhook_deliveries` | **W** | mittel | Eigentümerentscheidung `form_webhook_deliveries` |

### 3.2 n8n-Workflows (4)

Alle vier nutzen dieselbe Credential `Supabase Stats_Logs (service role)` über `httpRequest`-Nodes.
Es gibt **keinen** Postgres- und keinen nativen Supabase-Node in der gesamten Instanz.

| Verbraucher | Zugriffsweg | Objekte | R/W | Migrationsrelevanz | Abschalt-Gate |
| --- | --- | --- | --- | --- | --- |
| **AC - Quiz Nurture Email Sender** (`RqKSRTgFv8mv04H2`, aktiv) | REST + RPC | `v_lead_state_full`, `lead_events`, `tracking_sessions`, `rpc/record_nurture_sent`, `rpc/record_nurture_skip`, `rpc/record_nurture_run` | **W** | kritisch | Im Cutover-Fenster pausieren (Phase 6 Punkt 6); Ziel: fachliche API statt PostgREST |
| **AC - Error Alert (Postmark)** (`vSpXIyOUK9WIlvxi`, aktiv) | RPC | `rpc/record_nurture_failure`, `nurture_runs` | **W** | hoch | Gemeinsam mit dem Sender umstellen — sonst fehlen nach dem Cutover genau die Fehlermeldungen, die ihn bewerten |
| **Supabase Keep-Alive** (`CODeVYeZ_63C-DoT4Z8SN`, aktiv) | REST | PostgREST-Wurzel, keine Tabelle | R | niedrig | Muss abgeschaltet sein, bevor „keine Zugriffe mehr" gemessen wird — sonst hält der Ping die Instanz aktiv |
| **AC - Quiz Video Inactivity Checker** (`ie2WEc1RmFhN5LQf`, **inaktiv**) | REST | `lead_profiles` | R | niedrig | Entscheiden: löschen oder mitmigrieren. Unverändert reaktiviert liest er die Altinstanz |

Nicht zu verwechseln: `AC - Lead Post Processor`, `AC - Lead Sync Outbox Worker` und
`AC - Lead System Health Monitor` sind **aktiv, aber keine Supabase-Verbraucher** — sie rufen
`quiz.activecenter.info/api/*` bzw. `business.activecenter.info/api/bridge` auf und erreichen
Supabase nur mittelbar über die App. Für den Cutover sind sie trotzdem relevant, weil sie im
Fenster mit pausieren müssen.

### 3.3 In der Datenbank (1)

| Verbraucher | Zugriffsweg | Objekte | R/W | Migrationsrelevanz | Abschalt-Gate |
| --- | --- | --- | --- | --- | --- |
| **pg_cron `stats-logs-analytics-v2-current-day`** (jobid 1, alle 15 Min.) | in-database | `analytics_internal.event_daily`, `analytics_internal.refresh_runs`, liest `lead_events` | **W** | hoch | Im Cutover-Fenster deaktivieren und auf der Zielseite neu anlegen. Läuft er weiter, unterläuft er den Schreibruhe-Nachweis aus 13.5.2 |

Ebenfalls vorhanden: jobid 2 `pgss-monatsreset` (`pg_stat_statements_reset()`, monatlich) —
Diagnosehygiene, kein Datenverbraucher.

### 3.4 Werkzeuge und Zugänge ohne Deployment (5)

Diese laufen nicht dauerhaft, können aber jederzeit mit produktiven Rechten gegen die Instanz
gestartet werden. Für den Schreibruhe-Nachweis sind sie deshalb genauso relevant wie ein Dienst.

| Verbraucher | Zugriffsweg | Objekte | R/W | Migrationsrelevanz | Abschalt-Gate |
| --- | --- | --- | --- | --- | --- |
| **business-leads-quiz Ops-Skripte** (`scripts/`) | REST + RPC + **Mgmt** | Management-API `database/query` (beliebiges SQL), `rpc/sql_execute`, `lead_events`, `lead_state` | **W**, inkl. DDL | hoch | Management-API steht ausdrücklich im Restgate (Phase 4 Punkt 7); vor Phase 4 durch den Migration Runner (13.5.3) ersetzen |
| **n8n-Deploy-/Backfill-Skripte** (`n8n/`) | REST | `lead_events` (PATCH), `lead_profiles`, `lead_sync_outbox` | **W** | mittel | Hartkodierte Instanz-URL entfernen, sonst schreibt ein späterer Backfill in die Altinstanz |
| **analytics Wartungsskripte** (`analytics/scripts/`) | REST | `lead_state` (PATCH), `lead_events` | **W** | mittel | In die Schreibbarriere aufnehmen — ein Mensch, der das Skript im Cutover-Fenster startet, bricht die Schreibruhe |
| **Ad-hoc-Skripte mit hartkodiertem `service_role`** (`create-quiz-sessions-table.js`, `scratch/`) | REST | `quiz_sessions` (DDL), `lead_state`, `tracking_sessions` | **W** | hoch | Siehe Risiko 3 — vor der Schlüsselrotation **löschen**, nicht anpassen |
| **Loses `.env.local` auf Workspace-Ebene** | REST + **Mgmt** | Management-API `database/query` | R (Zugang) | hoch | Siehe Risiko 3 |

### 3.5 Legacy, fremd, kein Verbraucher (6)

| Eintrag | Einordnung | Konsequenz |
| --- | --- | --- |
| `api/` (Workspace-Wurzel) | verwaister Klon von `landing-page/api/bridge.js`, kein `package.json`/`vercel.json`/`.vercel` | Vor Phase 6 löschen, damit der Restscan in Phase 7 sauber 0 liefern kann |
| `zzz_Bioniq_Admin` | Deployment abgeschaltet (`zzz_vercel_disabled`), Code intakt; schreibt `advisor_bionic_links`, `sso_token_consumptions` | Mitbesitzer von `sso_token_consumptions` — siehe Risiko 4 |
| `zzz_Bioniq_Links` | Deployment abgeschaltet; `advisor_bionic_links` | Gehört nicht nach `business_leads` |
| `wellness-check-release-06d9ca7` | Release-Schnappschuss, **dieselbe** Vercel-`projectId` wie `wellness-check` | Kein zweiter Verbraucher. Löschkandidat |
| `Future Online Support` | spricht **eine andere** Supabase-Instanz (`gtvgbvtqmzrcvhumoxog`) | Nicht Teil dieser Migration. Bewusst inventarisiert, damit der Restscan es nicht als offenen Verbraucher zählt |
| Deploy-Guards und Dokumentation (`bioniq-go`, `bioniq_hl-support`, `analysen`, `Coolify`, `FitApp-Bot`, `archive`, `tmp`) | kein Laufzeitzugriff | `bioniq-go` und `bioniq_hl-support` prüfen sogar aktiv, dass `SUPABASE_URL` **nicht** ins Bundle gelangt |

---

## 4. Abgleich mit der Besitzmatrix (Audit §6)

Die Matrix war ausdrücklich vorläufig und „vor der Publication durch einen Verbraucher-Scan zu
bestätigen". Ergebnis:

### 4.1 Bestätigt

- `lead_state`, `lead_events`, `lead_video_progress`, `lead_answers_current`,
  `lead_sync_outbox`, `lead_profiles`, `lead_migration_unresolved`, `app_config`,
  `quiz_sessions`, `tracking_video_progress` — gehören zum Business-Leads-Produkt.
- `hba_*`, `sso_token_consumptions`, `landing_page*`, `coach_access` gehören **nicht** in die
  Produktdatenbank. Bestätigt: `hba_*` wird ausschließlich von HBA geschrieben,
  `landing_page*`/`coach_access` sind seit Bestehen leer bzw. tot (`landing_page_events`:
  0 Zeilen, `coach_access` und `lead_access_permissions`: nie beschrieben).
- Der geteilte `cron_runs`-Altbestand ist tatsächlich geteilt: **`fitapp-marathon` schreibt,
  `hl-support-analytics` liest** — das Business-Leads-Produkt benutzt ihn gar nicht.
- „n8n soll fachliche APIs aufrufen und keinen direkten Datenbankzugang erhalten": n8n hat
  heute **keinen** direkten Zugang. Alle Zugriffe laufen über PostgREST-`httpRequest`-Nodes;
  es existiert kein Postgres-Node in der gesamten Instanz. Die Freigaben für `10.0.1.4`
  werden nach heutigem Stand nicht gebraucht.

### 4.2 Widersprüche und Präzisierungen

1. **`lead_contact_crm` ist unter „Sicher in `business_leads`" gelistet, hat aber einen fremden
   Eigentümer.** Geschrieben wird die Tabelle ausschließlich von
   `Business_Kalkulator/api/contacts.js`; das Quiz liest sie nicht einmal. „Sicher" ist die
   Zuordnung nur, wenn der Kalkulator im selben Zug auf den neuen Zugriffsweg umgestellt wird.

2. **`tracking_sessions`/`tracking_events` haben zwei aktive Schreiber.** Die Matrix ordnet sie
   dem Business-Leads-Produkt zu; `landing-page` schreibt aber unabhängig hinein. Eine
   Publication nur für „die dem Produkt gehörenden Tabellen" (Phase 6 Punkt 3) würde einen
   laufenden Fremdschreiber einschließen.

3. **`form_webhook_deliveries` hat vier Schreiber** (`hautanalyse`, `wellness-check`,
   `activecenter-surveys`, `landing-page`) und einen Leser (`hl-support-analytics`) — aber
   keinen davon im Business-Leads-Produkt. Die Einordnung „Lead-Verbund, Eigentümer noch
   bestätigen" ist damit beantwortet: Die Tabelle gehört dem Webhook-Verbund, nicht dem Quiz,
   und sollte **nicht** nach `business_leads`.

4. **`system_alerts` und `webhook_deliveries` werden vom Quiz nicht benutzt**, sondern von
   `activecenter-analytics`. Auch hier: Lead-Verbund-Zuordnung nicht bestätigt.

5. **Die Matrix kennt das Schema `marathon` nicht.** Es liegt in derselben Instanz, umfasst rund
   40 aktiv beschriebene Tabellen und ist mit Abstand der größte Objektbestand des Projekts.
   Es gehört in keine der drei Spalten und braucht eine eigene Zeile „fremdes Produkt, eigener
   Umzug".

6. **`analytics_internal` fehlt als eigenes Schema in der Matrix** (nur als `analytics_internal.*`
   unter „Eigentümer noch bestätigen"). Es wird nicht von einer App, sondern von einem
   pg_cron-Job befüllt — der Eigentümer ist die Datenbank selbst.

7. **Storage fehlt in der Matrix.** Ein öffentlicher Bucket `images` mit 14 Objekten existiert
   und gehört `fitapp-marathon`. Phase 7 Punkt 4 verlangt migrierte Storage-Inhalte vor der
   Kündigung — der Bucket ist damit ein Gate, das bisher niemandem zugeordnet war.

---

## 5. Woher die Zahl „neun" kam

Die Angabe stammt aus `docs/audits/coolify-migration-work/findings.md:200` und geht auf
`FitApp-Bot/docs/audits/stats-logs-consumer-inventory.md` vom 21.07.2026 zurück. Dort stehen acht
Zeilen unter „Confirmed production consumers"; zählt man Bioniq Admin und Bioniq Links einzeln,
ergibt das neun.

Dieselbe Vorerhebung hat vier Einträge ausdrücklich als **noch nicht klassifiziert** geführt:
„`hautanalyse`, `wellness-check`, `landing-page`, and `Umfragen` webhook-monitor paths". Sie sind
jetzt klassifiziert — alle vier sind **live deployte, schreibende** Verbraucher.

Die Abweichung im Einzelnen:

| Änderung | Zahl |
| --- | --- |
| Vorerhebung 21.07.2026 (Bioniq einzeln gezählt) | 9 |
| − Bioniq Admin/Links: Deployment inzwischen abgeschaltet | −2 |
| − n8n war eine Sammelzeile, ist aber kein einzelner Verbraucher | −1 |
| + n8n einzeln: 3 aktive Workflows (Nurture Sender, Error Alert, Keep-Alive) | +3 |
| + `hautanalyse`, `wellness-check`, `landing-page`, `activecenter-surveys` (vorher „zu klassifizieren") | +4 |
| + pg_cron-Job in der Datenbank (in keiner Erhebung enthalten) | +1 |
| **Aktive Laufzeit-Verbraucher, Stand 24.08.2026** | **14** |

Dazu kommen, ohne Dauerbetrieb: 1 inaktiver n8n-Workflow, 4 Skriptfamilien mit Schreibrechten,
1 loser Zugangsspeicher und 4 Legacy-Einträge.

**Konsequenz für Phase 7 Punkt 4:** Die Formulierung „wenn alle neun Verbraucher weg sind" ist
als Abnahmekriterium nicht mehr brauchbar. An ihre Stelle tritt ein grüner Lauf von
`scripts/inventory/check-consumers.js` bei geleertem Inventar plus ein organisationsweiter
Restscan mit 0 Treffern.

---

## 6. Die vier größten Migrationsrisiken

### Risiko 1 — `fitapp-marathon` hält bereits eine direkte PostgreSQL-Verbindung in dieselbe Instanz

`fitapp-marathon` ist mitten im eigenen Umzug nach `10.0.1.3` und verbindet sich währenddessen
per Kysely/`pg` über den Supavisor-Pooler direkt auf die Supabase-Datenbank
(`fitapp-marathon/lib/db.ts:11-17`). Genau denselben Schritt plant Phase 4 für das Quiz.

Damit greifen zwei unabhängige Projekte gleichzeitig auf dasselbe Connection-Budget zu, während
beide von PostgREST auf direkte Verbindungen umstellen. Das Audit begründet die Reihenfolge
„erst Coolify, dann Kysely" ausdrücklich mit der Connection-Budget-Falle — diese Falle ist
bereits zur Hälfte zugeschnappt, nur von einem anderen Projekt aus. Beide Umzüge gehören
terminlich koordiniert und das Budget vor **und** nach jeder Gruppe gemessen (Phase 4 Punkt 6),
und zwar über beide Projekte hinweg.

### Risiko 2 — Vier fremde Projekte schreiben in Objekte, die die Besitzmatrix dem Quiz zuordnet

`activecenter-analytics` schreibt `lead_events`, `herbalife-erfolgs-berechner` schreibt
`lead_contact_crm`, `landing-page` schreibt `tracking_*`, und die n8n-Nurture-RPCs schreiben in
den Leadkern. Phase 6 Punkt 2 verlangt: „Keine isolierte Quiz-Umschaltung bei weiterlaufenden
Supabase-Schreibern." Nach heutigem Stand hieße das, **vier weitere Projekte** vor dem
Datenbank-Cutover umzubauen — ein Aufwand, der in Phase 4 bisher nicht eingeplant ist.

Die Alternative wäre, diese vier auf fachliche HTTP-Endpunkte des Quiz zu heben, statt jedes
Projekt einzeln auf Kysely umzustellen. Das ist eine Architekturentscheidung, die **vor** Phase 4
fallen muss, weil sie den Umfang von Phase 4 bestimmt.

### Risiko 3 — Der `service_role`-Schlüssel liegt dreifach im OneDrive-synchronisierten Workspace

- `create-quiz-sessions-table.js:6-7` — Instanz-URL plus vollständiger `service_role`-JWT im Klartext
- `scratch/find_and_fix_lisa.js:4-5` — derselbe JWT im Klartext
- `.env.local` auf Workspace-Ebene — `SUPABASE_SERVICE_KEY` **und** `SUPABASE_ACCESS_TOKEN`
  (Management-API, beliebiges SQL) sowie `BRIDGE_KEY`, `LEAD_OUTBOX_WORKER_SECRET`, `N8N_API_KEY`

Audit 13.3.6 macht den Plattformwechsel zum Rotationszeitpunkt. Zwei der drei Fundstellen lesen
keine Env, sondern tragen den Schlüssel im Code — eine Rotation bricht sie stillschweigend. Sie
gehören vor der Rotation gelöscht, nicht angepasst.

Nebenbefund aus der Methodik: Dieser Befund wäre fast durchgerutscht. `ripgrep` respektiert
standardmäßig `.gitignore` und überspringt damit ausgerechnet `.env.local`. Das Gate setzt
deshalb zwingend `--no-ignore-vcs --hidden`.

### Risiko 4 — Schreiber, die kein Codescan findet

Zwei aktive Schreiber tauchen in keinem Repository auf:

- der **pg_cron-Job** in der Datenbank (alle 15 Minuten);
- die **n8n-Workflows**, deren Definitionen auf dem Hetzner-Server liegen.

Der Schreibruhe-Nachweis aus 13.5.2 („fünf Minuten belegen, dass Tabellenzähler, maximale
Event-ID und `updated_at` unverändert bleiben") schlägt fehl, solange der pg_cron-Job läuft — und
zwar auf eine Weise, die wie ein unbekannter Fremdschreiber aussieht. Die Reihenfolge im
Cutover-Fenster muss deshalb lauten: Web read-only, Worker drainen, n8n deaktivieren,
**pg_cron-Job deaktivieren**, alte Keys sperren, erst dann messen.

Ergänzend: `sso_token_consumptions` wird von drei Projekten geschrieben
(`fitapp-marathon`, `Business_Kalkulator`, `zzz_Bioniq_Admin`). Die Begründung in
`fitapp-marathon/lib/central-db.ts:5-9`, diese Tabelle zentral zu halten, stützt sich auf Bioniq —
das inzwischen abgeschaltet ist. Ob die Begründung noch trägt, ist vor Phase 5 zu **bestätigen**,
nicht anzunehmen.

---

## 7. Das Gate benutzen

```bash
node scripts/inventory/check-consumers.js                 # gegen ../  (Workspace-Wurzel)
node scripts/inventory/check-consumers.js --root <pfad>   # anderer Root
node scripts/inventory/check-consumers.js --json          # maschinenlesbar
```

Exit 0 = jeder gefundene Supabase-Zugriff gehört zu einem inventarisierten Verbraucher.
Exit 1 = mindestens eine Datei greift zu, ohne im Inventar zu stehen.
Exit 2 = Aufruf- oder Umgebungsfehler.

Das Skript ist rein lesend: kein Netzzugriff, keine Datenbankverbindung, keine Secrets. Es nutzt
`ripgrep`, wenn vorhanden, und fällt sonst auf einen eingebauten Node-Scanner zurück. Beide Wege
wurden am 24.08.2026 gegeneinander gemessen und lieferten dieselben 177 Dateien.

**Wo das Gate vollständig läuft:** nur dort, wo der ganze Workspace liegt (Arbeitsstation). In der
CI ist nur dieses Repository ausgecheckt; dort prüft es das Schema des Inventars und die eigenen
Pfade und meldet die übrigen Muster als Warnung, nicht als Fehler.

**Pflege:** Neuer Verbraucher → Eintrag in `supabase-consumers.json` **und** Zeile in diesem
Dokument. Verbraucher abgelöst → Eintrag entfernen; das Gate meldet dann verwaiste Muster als
Warnung und macht die Ablösung sichtbar.

---

## 8. Offene Entscheidungen

Diese Punkte sind mit einem Inventar allein nicht zu klären; sie brauchen eine Festlegung, bevor
Phase 5 (Objektmanifest) und Phase 6 (Publication) beginnen:

1. Wohin gehören `form_webhook_deliveries`, `webhook_*`, `system_alerts` und
   `webhook_connector_heartbeats` — eigenes Webhook-Produkt oder `business_leads`?
2. Werden die vier fremden Leadkern-Zugreifer auf fachliche APIs gehoben oder einzeln auf
   direkten DB-Zugriff umgebaut?
3. Wer besitzt `cron_runs` und `sso_token_consumptions` nach dem Umzug — bleibt eine zentrale
   Instanz, oder werden sie je Produkt getrennt?
4. Ziehen `marathon` und `business_leads` auf denselben Cluster (`10.0.1.3`) um, und in welcher
   Reihenfolge?
5. Werden Bioniq Admin/Links endgültig abgeschaltet — mit der Folge, dass die zentrale Haltung
   von `sso_token_consumptions` ihre Begründung verliert?
