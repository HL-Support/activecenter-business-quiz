# Gesamtstatus Migrationsvorbereitung — kanonisches Statusdokument

Stand: 25.08.2026, nach Abschluss aller Vorbereitungsarbeiten für den Coolify-Umzug.
Zweck: Ein Dokument, das lückenlos zusammenführt, was seit dem Audit (23.08.) umgesetzt
wurde, mit welchen Beweisen, was außerhalb dieses Repos verändert wurde, und was mit
welchem Gate noch offen ist. Detailtiefe liegt in den verlinkten Einzeldokumenten.

## 1. Ausgangspunkt

[Technischer Audit 23.08.2026](2026-08-23-business-leads-coolify-technical-audit.md)
(Kap. 1–12 Erstaudit, Kap. 13 Zweit- und Drittprüfung, Kap. 14 Referenzen) mit
Arbeitsnotizen in [coolify-migration-work/](coolify-migration-work/). Kernbefunde:
fire-and-forget-Tracking (4.1), CTA-Verlust (4.2), offene API-Grenze (4.3), öffentliche
DB-Init-Route (4.4), unauthentisierte Resume-/Metrik-Actions (4.5), Bridge-Monolith (4.6),
falsche email_sent-Semantik (4.7), Vercel-Kopplung (4.8), Cache/Supply-Chain (4.9),
fehlende Beobachtbarkeit (4.10).

## 2. Chronologie aller Releases (dieses Repo)

Alle Merges auf main, jeweils mit grüner CI (safety: Tests/Lint/Build/Verify/Smokes;
ab #59 zusätzlich e2e-queue als Browser-Gate). Deploy = automatisch bei Merge
(Vercel-Git-Integration; Ausnahme 24.08. einmaliger Webhook-Ausfall → dokumentierter
Preview→Promote-Weg).

| PR | Commit | Datum | Inhalt | Beweis/Abnahme |
| --- | --- | --- | --- | --- |
| #55 | d59998b | 24.08. | Audit-Doku; `init-quiz-db` entfernt (4.4: Default-Secret + Host-Header-Bypass; INIT_DB_TOKEN war nirgends gesetzt — Route lief real mit Default-Secret); Health `outbox_parked`; toter Mautic-Browsercall entfernt | Marker-Test, verify-Gate, Prod-Smoke 403/404-übergangssicher; [E2E-Livedurchlauf](e2e-livedurchlauf-2026-08-23/) |
| #56 | 1c17ded | 24.08. | CI: strikter 404-Check `READONLY_SMOKE_STRICT_INIT_ROUTE=1` | Live-404 vor Scharfschaltung bewiesen |
| #57 | 917766c | 24.08. | **P0-1 Event-Queue**: synchrone Persistenz vor Netz, stabile `event_uid`, FIFO, Backoff, Dead-Letter, Drain bei Start/online/visibility | 12 Unit-Tests; [Browser-Replay-Beweis](p0-1-event-queue-abnahme/) (7 Events, Totalausfall→Reload→identische UIDs); Review-Fix: Queue-Init unconditional (Offline-Reload) |
| #58 | e11e07c | 24.08. | **P0-2**: ehrliche `queued:true/email_sent:false`-Semantik (4.7); CTA-Persistenz (4.2) via Queue erfüllt; dokumentierte Entscheidung gegen hartes Finalscreen-Gating | [Abnahme](p0-2-abnahme-2026-08-24.md); Live-Probe des Antwortvertrags |
| #59 | e3a0a05 | 24.08. | **P0-6 E2E-Fehlerfall-Suite** als CI-Gate (`scripts/e2e/`): Totalausfall, Reload-Nachlieferung, 500er-Retry; Debug-Artefakte bei CI-Fail | CI-Selbsttest fing 2 echte Fehler (en-Locale, Buffer-Import); playwright devDep + `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD` in 3 Vercel-Envs |
| #60 | 21720dc | 24.08. | **P0-3 Stufe 1**: Event-Allowlist (26 Events aus [103k-Inventur](p0-3-grundlagen/event-inventur-2026-08-24.md)∪Code-Scan), Session-Cookie Beobachtungsmodus (`_session_state`), notify-Guard gegen Lead-Materialisierung, CORS-Allowlist bridge | 17 Vertragstests; Live: Phantom-Probe 404 ohne DB-Spur, 94/94 `session_state:match` im E2E, CORS-Proben |
| #61 | — | 24.08. | **P0-4**: Service-Auth-Beobachtung für `generate_resume_token` + 3 Metrik-Actions (`auth_state`, `[bridge-auth-observe]`-Marker, Enforcement-Flag ungesetzt); CORS kanonisch in server/lead-system (letztes Wildcard weg, 5 lead-Routen) | 9 Tests; Live-Proben; Doppelmessung Smoke ±Header |
| #62 | ba97552 | 24.08. | **Phase 1: `/berater-info`-Integration** — Shared-Linkbuilder heilt D-1..D-7 ([Inventur](p1-schulung-grundlagen/inventur-2026-08-24.md)); eigene Shell+Bundle; **Ungarisch neu** (269 Keys, Anti-AI-Slop-Humanizer, Quiz-hu-Terminologie); 5 Bestandssprachen inhaltsgleich testgesichert | 24 Tests (96 Link-Kombis, D-Regressionen); Live: alle Alias-Deep-Links 200, hu im Bundle, Quiz unberührt |
| #63 | f5d6768 | 24.08. | Link-Cutover: Builder-Default → `business.activecenter.info/berater-info` (Env-Override bleibt); CRLF-fester Bestandstexte-Test | Builder-Output verifiziert |
| #65 | 0bb4b48 | 25.08. | **Verbraucher-Inventar**: [INVENTAR.md](verbraucher-inventar/) + maschinenprüfbares Gate (`scripts/inventory/`) — **14 aktive Verbraucher, nicht 9** | Doppelscan-Beleg; Gate-Fehlerpfad geprüft |
| #66 | 652e953 | 25.08. | **P0-5 Portable Runtime**: HTTP-Adapter (Rewrites zeichengleich, API-404-JSON, SIGTERM-Drain, Body-Limit/413), `/health/live|ready`, fail-closed Env-Gate, Dockerfile (3 Stages, non-root, HEALTHCHECK), [Container-Smoke-Ablauf](../../scripts/e2e/container-smoke.md) | 24 Adapter-Tests (121 gesamt); kompletter Host-Smoke mit Belegen |
| #64 | 92c5e56 | 25.08. | Key-Rotation im Repo-Teil: CI-Secret-Durchreichung für smoke:resume | CI grün = Secret-Pfad live bewiesen |
| #67 | adaac27 | 25.08. | n8n-Backup (zweiter Workflow) nachgezogen | Hash-identisch verifiziert |

Zusätzlich Node/pnpm-Pinnung (#57: `engines 24.x`, `packageManager pnpm@10.32.1` —
Vercel-Projekt läuft verifiziert auf 24.x).

## 3. Änderungen außerhalb dieses Repos

| System | Änderung | Beweis |
| --- | --- | --- |
| **n8n `9RZdrLxfA8IRhd55`** (Lead-Post-Processor, Initial-Mails) | 24.08.: Schulungs-Link → neue Domain (versionId 6835a931→4fae615f). 25.08.: `generate_resume_token`-Node auf Credential `Dwum7g63YfojD3q5` (→ed75a204) | Backups in n8n/backups/ (before-link-cutover, before-service-key-rotation-2026-08-25); je 3× Verifikations-GET; Restart in Execution-Lücke; **exec 527458: `auth_state=ok`, Resume-Link erzeugt, Job processed** |
| **n8n `RqKSRTgFv8mv04H2`** (Nurture) | 24./25.08.: Credential `httpHeaderAuth Dwum7g63YfojD3q5` (Header `x-bridge-service-key`), versionId 90b380d9→6451429e | Backup; kein Klartext im Workflow-JSON; API-Schema-Erkenntnis: n8n **merged** settings (belegt) |
| **Business_Kalkulator** (= „Herbalife Erfolgs-Berechner", CRM) | Schulungs-Link in `api/contacts.js:14` → neue Domain; PR #1, manuell prod-deployt (kein Auto-Deploy dort) | R6-Check, 5 Tests grün, frisches Production-Deployment verifiziert; `type=macher` als Alias abgedeckt |
| **zzz-business-schulung** (Alt-Projekt) | Stillgelegt: framework-nativer 308-Redirect (`next.config.js` — vercel.json-redirects greifen im Next-Build NICHT); GitHub-Repo + lokaler Ordner → `zzz-`-Präfix | Ende-zu-Ende: alte URL + Query → 200 auf `/berater-info?…`, Query erhalten. Vercel-Projekt lebt bewusst weiter (historische Mail-Links) |
| **Vercel-Env** | `BRIDGE_SERVICE_KEY` (sha8 1791ba5a) in 3 Envs, Typ encrypted (bewusst, bis Coolify); `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD` in 3 Envs | env ls + pull-Gegenprobe byte-identisch; Negativkontrollen ok/invalid/invalid/missing. Aufgeklärt: Alt-`BRIDGE_KEY` ist Typ `sensitive` → Pull leer ist Designverhalten |
| **GitHub** | Actions-Secret `BRIDGE_SERVICE_KEY`; Repo-Rename business-schulung→zzz- | CI grün; Redirect der Repo-URLs |
| **n8n-Dateiablage** | OneDrive-Konfliktkopie → `n8n/backups/zzz-veraltete-onedrive-konfliktkopie-2026-06-23-…` | Live-Snapshot `_live_workflow_….json` bewusst als Zeitdokument belassen |
| **Mautic** | Keine Änderung nötig | Per Markus bestätigt: nur Interessenten-Mails, kein Schulungslink |

Markierte Test-Artefakte in Produktion: E2E-Testleads (u. a. qz_b2038580, qz_3098387d,
qz_ea98bf93, qz_949de31b, qz_78e0ff73 + 3 abgebrochene Anläufe), alle per
`test_lead_marked` + `is_internal_traffic` gekennzeichnet. Phantom-Lead-Zwischenfall vom
24.08. (Probe materialisierte Lead + 4 Jobs): vollständig bereinigt (CASCADE, 4 Tabellen
leer verifiziert), Ursache seit #60 serverseitig unmöglich.

## 4. Aktive Schutzmechanismen (Stand heute)

- **CI je PR/Push**: safety (121 Tests, Lint, Build, Verify, 2 Prod-Smokes strikt) +
  e2e-queue (echter Browser gegen Prod-API, Fehlerfall-Szenarien, ~55 s) + Debug-Artefakte.
- **verify.js-Gates** (Auswahl): kein init-quiz-db/Mautic-Call/fire-and-forget; Queue-Init
  beim Start; queued-Semantik; ALLOWED_EVENTS; kein CORS-Wildcard in api/ und server/;
  Linkbuilder-Pflicht beider Erzeuger; berater-info-Rewrite vor Catch-all;
  service_auth_required-Literale. Mutations-Gegenproben dokumentiert.
- **Migrations-Gate**: `scripts/inventory/check-consumers.js` (neuer Supabase-Verbraucher
  → Exit 1); ripgrep dort bewusst mit `--no-ignore-vcs --hidden`.
- **Health**: `outbox_parked` trennt Grundrauschen (Altjob 117, next_attempt 2099) von
  echten Staus (ready/overdue).

## 5. Offene Punkte — vollständige Liste mit Gates

### A. Wartet auf Ereignis/Telemetrie (Code fertig)

| Punkt | Gate | Nächster Schritt |
| --- | --- | --- |
| `BRIDGE_SERVICE_AUTH_ENFORCE=1` | Empfehlung 3–5 Tage `[bridge-auth-observe]`-Marker leer für echte Aufrufer (bisher ~24 h; beide bekannte Aufrufer live bewiesen) | Flag in Vercel setzen + Redeploy; CI hat Secret bereits |
| `LEAD_SESSION_ENFORCE=1` (Session-Cookie) | `_session_state:mismatch` über Wochen ≈ 0 (Telemetrie läuft seit #60 in lead_events) | Auswertung, dann Flag |

### B. Wartet auf Infrastruktur/Umzug

| Punkt | Gate |
| --- | --- |
| ~~Container-Smoke~~ **ERLEDIGT 25.08. auf Hetzner**: Build Exit 0 (355 MB, non-root, healthy), alle Proben grün, /health/ready mit echtem Supabase-HEAD (147 ms), SIGTERM-Drain 0.2 s Exit 0, fail-closed Env-Gate Exit 1 | — |
| ~~Digest-Pin~~ **ERLEDIGT 25.08.**: node:24-slim@sha256:a9f5f7c9… (OCI-Index, alle 3 Stages) | — |
| Coolify-Deploy-Pipeline: ✅ **Stufe 1 seit 27.08.** (CI-Job `deploy`: nur nach grünen Gates, nur Runtime-Pfade, Deploy-Beweis über `/health/live`; roher Git-Webhook bleibt aus). Offen: Stufe 2 (13.5.6 Digest-Promotion, Preview-App) | Stufe 2 mit Hetzner-Zielpipeline |
| Vercel-Nachlauf: Projekt/Env/Domains erst nach bewusst aufgegebenem Rollback entfernen (Phase 7) | Cutover + Beobachtungsfrist |
| zzz-Vercel-Projekt endgültig löschen | Nachlauffrist (Empfehlung 6–12 Monate, Klickzahlen ~0) |

### C. Kleine offene Arbeiten (bewusst zurückgestellt)

| Punkt | Herkunft |
| --- | --- |
| `server/*.js` in die verify.js-Syntax-Dateiliste aufnehmen (2 Zeilen) | P0-5-Bericht |
| Latenter Bug `normalizeResumeProfileCode` (bridge-`safeString` gibt null → stiller Fallback auf resumeTarget result bei Leads ohne Profil/Quiz-Daten) | P0-4-Bericht; eigenes Ticket |
| `quiz_form_submit` (Altbestand) aus Allowlist prüfen/entfernen | P2-Bereinigung |
| ~~Auto-Deploy-Governance~~ **ENTSCHIEDEN (bestätigt 27.08.)**: Auto-Deploy/Git-Webhook auf Coolify ist **bewusst aus**, bis die Deploy-Pipeline steht (13.3.3/13.5.6: CI-Gates VOR dem Webhook). Deploys manuell per Coolify-API, Nachweis über `/health/live`-Commit. DEPLOYMENT_WORKFLOW.md entsprechend neu geschrieben (27.08.) | Memory/24.08.; Beleg: alle Deployments seit Cutover `webhook=false` |
| hu-Schulungstexte: fachliche Sichtprüfung durch Markus steht formal aus (3 Beispiele im Chat gezeigt) | Phase 1 |
| Outlook-Classic-Rendering der Result-Mail (Emoji/Badges; kosmetisch) | 24.08., mit P1-Mail-Arbeit bündeln |
| Dritte Domain `business.eaglesfit.ch` in Audit-§10-Domainliste ergänzen | Nebenbefund 24.08. |
| Audit-P1-Block: Asset-Fingerprinting+immutable, CSP report-only, private Source Maps, self-hosted/pinned Player.js (Bunny-Insights-Konsolenrauschen), eigene Brandingassets | Audit §7 P1 |
| Audit-P2-Block: Bridge-Zerlegung, Legacy-`ac_`-Writer + notify-Browseraufruf entfernen, Outbox als interner Worker, Legacy-Schema | Audit §7 P2 (nach Cutover) |

### D. Migrationsplan-Korrekturen aus dem Inventar (für Phase 4–6 einarbeiten)

1. **14 Verbraucher statt 9** — 4 zuvor unklassifizierte Apps sind live und schreibend.
2. **pg_cron-Job** `stats-logs-analytics-v2-current-day` (15-Min-Takt) muss in die
   Schreibbarriere (13.5.2) — sonst falscher „Fremdschreiber" im Cutover-Fenster.
3. **fitapp-marathon** hält bereits direkte PG-Verbindung (Supavisor) → Connection-Budget.
4. **4 fremde Projekte schreiben in Quiz-Objekte** (lead_events, lead_contact_crm,
   tracking_*) → Phase-4-Umfang; Besitzmatrix-Korrekturen: marathon-Schema (~40 Tabellen)
   + Storage-Bucket `images` fehlten; lead_contact_crm fremder Eigentümer;
   system_alerts/webhook_deliveries nutzt das Quiz nicht.
5. **n8n braucht keinen direkten DB-Zugang** (0 Postgres-Nodes in 85 Workflows) — die
   geplanten 10.0.1.4-Freigaben entfallen.
6. **2 hartkodierte service_role-Keys** in Workspace-Skripten → bei Supabase-Key-Rotation
   (13.3.6) explizit mitziehen.

### E. Coolify-Discovery Hetzner (25.08., read-only)

Coolify ist auf 46.224.76.193 **nicht installiert**. Server gesund (Ubuntu 24.04, Docker 29.6.1, 113G frei, 9.1Gi RAM frei, 11 Produktivcontainer alle auf 127.0.0.1 gebunden, UFW deny-incoming außer 80/443/2255). **Zwei Kollisionen für einen Install:** Port 8000 (Coolify-UI-Default) gehört mautic_app; 80/443 hält der Host-nginx — Coolifys Traefik will genau diese. Architekturentscheidung nötig (separater Coolify-Server vs. Koexistenz hinter nginx vs. Proxy-Umzug). Smoke-Image blq-smoke:2026-08-25 liegt auf dem Server bereit.


### F. Phase 3 Schritt 2 — Coolify-Staging (25.08., Befunde)

Staging: `business-leads-test.hl-support.biz` (App `business-leads-web`, UUID
liydqvexwattbkkhigpluc1q) auf der bestehenden Coolify-Box 167.233.251.217. **Kein Cutover.**

**🔴 Der teuerste Fund: JWT-Escaping hätte alle Resume-Links getötet.**
Der produktive `JWT_SECRET` endet auf ein *literales* `
` (Backslash+n, altes
Paste-Artefakt in Vercel) — mit genau diesem Wert sind alle bestehenden Resume-Tokens und
Kurzlink-Signaturen erzeugt. Coolify escapt beim Schreiben seiner `.env` Backslashes,
daraus wurde `\n` und damit ein anderer Schlüssel. Folge wäre gewesen: **jeder Link aus
jeder Nurture-Mail** (90 Tage Laufzeit) hätte nach dem Cutover einen Fehler geliefert — bei
gesunder App, grünem Healthcheck und leerem Fehlerlog. Lösung: Coolifys `is_literal`-Flag
(byte-genaue Übernahme). **Regel daraus: Sicherheitsrelevante Env-Werte werden am laufenden
Container gehasht (`docker exec … sha256sum`) und gegen die Produktion verglichen — das
Verwaltungsformular zeigte die ganze Zeit den richtigen Wert an.**

**Beweis der Linkkontinuität:** Drei echte Leads (April), Link jeweils von der PRODUKTION
erzeugt, von Coolify aufgelöst — Kurzlink und JWT-Form, identische Zielwerte (step/target/
email) wie in der Produktion.

**Selbst korrigierte Konfiguration** (unabhängig von Nachbarprojekten geprüft):
- Container-Healthcheck `/health/ready` → **`/health/live`**: Der Ready-Pfad fasst Supabase
  an; eine Supabase-Störung hätte Container-Neustarts ausgelöst (Störung eskaliert statt
  toleriert). Start-Period 5 s → 10 s.
- Ressourcengrenzen gesetzt (768 MB / 1 CPU) — vorher unbegrenzt auf einer Box mit 14
  produktiven Anwendungen.
- **HSTS** (`max-age=63072000; includeSubDomains`) im Adapter ergänzt: Vercel liefert ihn
  heute, ohne ihn wäre der Wechsel ein stiller Sicherheitsrückschritt. Nur auf
  verschlüsselten Anfragen (X-Forwarded-Proto), damit ein lokaler http-Start sich nicht
  selbst aussperrt.
- Beim Anlegen war `inject_build_args_to_dockerfile` auf `true` (Coolify-Default für
  Neuanlagen) — vor dem Setzen der Envs korrigiert, sonst wären Secrets ins Image gelangt.

**Vollständiger Browsertest gegen Staging** (eigene Durchführung, echte Eingaben): Funnel
komplett, 3 Videos real entsperrt, 97 API-Calls ohne Fehler, 94/94 `session_state: match`,
Queue leer/0 Dead-Letters, WhatsApp-CTA, echter Produktions-Resume-Link landet korrekt auf
Video 1, `/berater-info` in hu/en/it inkl. `goal`-ohne-`type`, HSTS im Browser bestätigt,
0 `http://`-Links, Konsole sauber, serverseitig alle 5 Outbox-Jobs `done`.

**Offen vor dem Cutover:** Better-Stack-/GlitchTip-Anbindung, `GIT_COMMIT_SHA` ins Image,
Prüfung der externen Rückrufpfade gegen die neue Adresse, DNS-Plan mit Rollback.

### G. Testdaten-Bereinigung (25.08.)

Aus `typeform_surveys` (Legacy-MySQL, Quelle der Erfolgs-Code-Zählung) wurden Testeinträge
**soft-gelöscht** (`deleted_at`, wiederherstellbar), ausschließlich adressgenau:

| Schritt | Zeilen | Zählung |
| --- | ---: | --- |
| Eigene E2E-Läufe 23.–25.08. | 11 | 1266 → 1255 |
| Testadressen Gruppe 1+2 (markus+NN@, codex-test-*, audit/langtest/bridgetest+*, admin@, info@, contact@, konrad.rungger@, wisa92+business-…) | 86 | 1255 → **1169** |

Bewusst **behalten**: `peter@global-sce.com` (Entscheidung Markus) und
`fliegendeweinprobe@gmail.com` (Fehltreffer des Suchmusters „probe" — echter Lead).
Sicherungen: `/root/backup-typeform-tests-*.json` und `/root/backup-testreinigung-*.json`
auf 167.233.251.217, zusätzlich lokal. Vor jeder Löschung lief eine Einzelprüfung je ID
(Adresse + Hash), echte Leads wurden stichprobenweise als aktiv verifiziert.

**Lehre:** Die E-Mail steht nicht in einer Spalte, sondern im JSON (`answers[].email`). Ein
Löschen „aller qz_-Zeilen der letzten Tage" hätte echte Leads getroffen — im selben
Zeitfenster kamen mehrere herein.


### H. Fehlermeldung, Monitoring und ein geschlossener Vorfall (25.08., Nachmittag)

**P1 „Fehlerdienst" umgesetzt** (PR #76): `server/fehlermeldung.js` meldet Serverfehler an
GlitchTip (`errors.hl-support.biz`, Projekt `business-leads`, das zehnte der Flotte) — ohne
SDK, nach dem kanonischen Muster aus `analysen/api/_fehlermeldung.js`. Drei Eigenschaften
sind bindend und getestet: nie werfen, nie warten, nie fluten (gleicher Fehler 1×/min,
global 20/min).

Zwei Entwurfsentscheidungen, die den Unterschied machen:

- **Zwei Meldewege.** Ein `catch` sieht nur geworfene Fehler; ein Handler, der selbst mit
  500 antwortet, käme nie an. Zusätzlich meldet ein `close`-Listener jede 5xx-Antwort
  (Doppelmeldung per WeakSet ausgeschlossen).
- **Redigierung vor der Drosselung.** Fehlertexte kommen aus Node/Supabase und enthalten
  Hashes und Adressen. Ohne Normalisierung wäre jede Meldung eines Massenfehlers einzigartig
  und das Minutenbudget in Sekunden verbraucht. Datenschutz und Drosselung fallen zusammen.

Der Melder kennt das Request-Objekt strukturell nicht (kein `req`/`.headers`/`.body` im
File, per Gate geprüft); Kontext ist eine feste Allowlist (bereich, route ohne Slug/Query,
request_id, status, level). Nicht gemeldet: 4xx (sonst meldet jeder Bot-Scan) und die
geplante 503 beim Herunterfahren (sonst verbraucht jedes Deploy das Budget).

**Zustellweg Ende-zu-Ende bewiesen:** Probemeldung durch die echte Kette geschickt, im
Projekt sichtbar, danach entfernt (Projekt startet mit 0 Meldungen). `GLITCHTIP_DSN` ist in
der Staging-Umgebung gesetzt; Staging läuft auf dem aktuellen Commit
(`commit_source: SOURCE_COMMIT`, Funnel und `/berater-info` unverändert 200).

**Monitoring:** Kein neuer Better-Stack-Monitor (Kontingent 10/10). Der Flottenweg ist die
Sammelliste `SITES` in HL-Support_Analytics, abgedeckt vom Monitor
`[SITES] Coolify-Anwendungen`. Unser Eintrag liegt dort als PR #1 **mit Merge-Sperre bis
nach dem Cutover** (auf Vercel liefert `/health/live` heute 404). Geprüft wird bewusst
`/health/live`: `/` wäre auch bei totem Prozess 200, `/health/ready` würde eine
Supabase-Störung als unseren Ausfall melden.

**Vorfall `[WEBHOOK] Zentrale Zustellungen` (fremdes Projekt) geschlossen.** Signal
`legacy_form_failed=1` → eine echte Umfrage-Einsendung vom 25.08. 10:44 UTC stand auf
`failed` (Timeout). Belegt: Die Daten **waren angekommen** (contacts 3684031,
typeform_surveys 42950, 10:44:41 UTC) — nur die Antwort kam nach dem Timeout des Senders.
Datensatz nach Beleg korrigiert (mit Begründung im Feld), Signale sauber, Monitor 12:39 UTC
wieder `up`. **Ursache bleibt offen und liegt außerhalb dieses Projekts:** zu knapper
Sende-Timeout gegenüber der Antwortzeit des Empfängers — kann jederzeit erneut einen
Fehlalarm erzeugen.

## 6. Fahrplan ab hier (Audit §8, aktualisiert)

1. **Phase 3 — Coolify-Hosting** (Startsignal Markus): Docker/Container-Smoke →
   Coolify-Preview (gleiche Supabase-Pfade, markierte Testleads, Proben n8n/Resume/
   Schulung/Postmark/Meta) → Pipeline-Entscheid → DNS-TTL senken → Domains umstellen →
   Vercel 7–14 Tage Rollback. **3 Domains beachten** (inkl. business.eaglesfit.ch).
2. **Phase 4** Kysely-Umbau im Container gegen Supabase — Scope neu: alle Schreiber aus §5D.
3. **Phase 5–6** Hetzner-DB, Objektmanifest (13.5.1), Schreibbarriere inkl. pg_cron
   (13.5.2+§5D), Dump/Restore als Primärweg (13.3.2) mit Sequenz-Abnahme (13.5.4),
   Cutover mit Rollback-Drill (13.5.7).
4. **Phase 7** Nachlauf, dann P2-Block.

## 7. Sitzungsübergreifendes Gedächtnis (Projekt-Memory, außerhalb Repo)

Themen: Collation/n8n-Risiko · UTF-8-Replays · Bunny-Shadow-DOM/5x-Grenze · CI-Smoke
gegen Prod (übergangssichere Asserts) · outbox_parked/Altjob 117 · Vercel-Autodeploy +
SSO-Previews + Webhook-Ausfall · Bridge-notify materialisierte Leads (keine „harmlosen"
Proben; Bundle-Marker als Deploy-Detektor) · Test-Exitcodes nie pipen (+OneDrive-Locks)
· Worktree-Isolation für parallele Agents · Service-Key-Klärung (gelöst, Gates).

---

## 8. Nachtrag 25.–26.08.: Cutover vollzogen, zwei Vorfälle gelöst, Datenpfad gehärtet

### Phase 3 ist abgeschlossen

Alle drei Domains laufen seit dem 25.08. abends auf Coolify (`167.233.251.217`), Vercel
bleibt 7–14 Tage als Rückweg stehen. Der erste Umstellversuch der Werbedomain scheiterte
(17 Minuten ohne gültiges Zertifikat, 0 Leads verloren); der zweite lief ohne
Ausfallsekunde, weil das Zertifikat vorab über die DNS-Prüfung beschafft wurde.
Vollständig: [cutover-protokoll-2026-08-25.md](cutover-vorbereitung/cutover-protokoll-2026-08-25.md),
Rückrolldaten mit Record-ids in [cutover-vorbereitung/rueckrolldaten/](cutover-vorbereitung/rueckrolldaten/).

Seither dazugekommen: **ZERT**-Prüfung im stündlichen Domain-Sweep (Zertifikats-Restlaufzeit,
Schwelle 21 Tage) und der Hilfs-Router wieder aufgelöst — der App-Router holt sein
Zertifikat selbst über den DNS-Prüfweg (`custom_labels`, überlebt Deploys nachweislich).

### Vorfall Nurture-Stillstand (gelöst, PRs #83–#87)

Der Versand hatte seit dem 06.08. **drei Wochen lang keinen neuen Kontakt angeschrieben**
— 186 Menschen —, während der Workflow zwölfmal täglich `success` meldete. Zwei stille
PostgREST-Zeilengrenzen (1000) plus aufsteigende Sortierung; eine unabhängige Zweitmeinung
fand die zweite, gefährlichere Kappung (Versand-Historie → Geisterkandidaten, eingefrorene
Zweitmails, Doppelversand-Schutz auf einer einzigen Schicht). Beide Abfragen blättern
jetzt (eindeutiger Zweitschlüssel! Seite-1-Falle im Folgeknoten!), Bremse global 60/Lauf.
Aufarbeitung: [2026-08-26-nurture-zeilengrenze-vorfall.md](2026-08-26-nurture-zeilengrenze-vorfall.md).

Dazu ein **Nurture-Wächter** (stündlich :37 auf der App-Box, bewusst nicht auf der
n8n-Box; Herzschlag umgekehrt wie beim Domain-Sweep; misst je **Mensch**, nicht je
Datensatz; Hash-Baseline für bekannte Ausnahmen). `nurture_runs.sent_count` ist
strukturell 0 (Lauf wird protokolliert, **bevor** Sendungen erfasst werden) — echte Zahlen
liefert die Lese-Sicht `v_nurture_runs_wahr`. Betriebsregeln: [../NURTURE_BETRIEB.md](../NURTURE_BETRIEB.md).

Ausserdem: Löschfilter — in der MySQL-Kartei gelöschte Kontakte bekommen keine Mails mehr
(fail-closed; Anlass: 12 Mails an 6 Gelöschte, eine Selbstabmeldung als Folge).

### Antwortverlust (gelöst, PR #86 + Backfill)

116 Menschen hatten Opt-in ohne Quizdaten in PG — die Daten lagen aber vollständig im
MySQL-JSON des Opt-in-Pakets. **Backfill: 343 Leads geheilt** (ohne Profil 116→8, ohne
Barriere 51→8, ohne Antwortzeilen 343→11; Rest = Altdaten/Fremd-Quiz, begründet in
`scripts/waechter-nurture-baseline.json`). Der Opt-in-Pfad persistiert seither Barriere
und alle sechs Antworten selbst — **ein Extraktor** für Live-Pfad, Backfill und Tests. Am
echten Verkehr bewiesen (zwei Opt-ins am Abend, beide sofort vollständig). Analyse und
Phase-4-Zielbild („ein Aufruf, eine Transaktion, idempotent, Profil serverseitig"):
[2026-08-26-antwortverlust-analyse-und-zielbild.md](2026-08-26-antwortverlust-analyse-und-zielbild.md).

### Architekturentscheidung Datenhaltung (Markus, 26.08.)

**Option C:** MySQL-Kartei = Wahrheit über die Person, PostgreSQL = Wahrheit über das
Verhalten; Verbund über `lead_hash` (gemessen stabil, 1238/1239 eindeutig);
PG-Kontaktfelder sind ein deklarierter **Opt-in-Schnappschuss**, keine gepflegte Kopie.
Ausfallkopplung ist kein Kriterium (beide DBs auf `10.0.1.3`, gemessen). Der einzige
Doppel-Schreibkanal (Videorang → `points_result`) hat einen täglichen Lese-Abgleich
(`scripts/abgleich-videorang.js` mit Baseline).

### Fahrplan-Ergänzungen für Phase 4–6

- 🔴 Abnahmekriterium **„keine stille Zeilengrenze"** steht im Audit (Phase 4 Punkt 8) —
  gilt auch für RPCs mit `SETOF`-Rückgabe, solange irgendein Verbraucher PostgREST spricht.
- ✅ `lead_state.mysql_contact_id` (26.08. abends): Spalte angelegt, Readback persistiert
  den Wert, Bestand über `mysql_survey_id` befüllt — **1156 Leads** tragen den direkten
  Kartei-Verweis.
- ✅ Numerische Rangspalte `points_rank` in `typeform_surveys` (26.08. abends): Spalte
  angelegt (Sicherung 1248 Zeilen vorher), Bestand aus dem Text abgeleitet, der
  n8n-Workflow schreibt seither **beide** Formen im selben UPDATE, und der Rang-Abgleich
  nutzt die Zahl als Primärquelle plus eine neue Drift-Prüfung Zahl↔Text. Rang 4 =
  Interessensfrage beantwortet (zählt im PG-Vergleich wie 3).
- ✅ Direktverbindungs-/IPv6-Test `10.0.1.3` → Supabase (26.08., gemessen): IPv6 global
  vorhanden, Direkthost über 5432 verbunden, Pooler als IPv4-Rückfallebene auf 5432 und
  6543 erreichbar. Details im Beiblatt der
  [Vercel-Abbau-Checkliste](cutover-vorbereitung/vercel-abbau-checkliste.md).
- Vercel-Abbau: Checkliste liegt bereit (frühestens 01.09., empfohlen 08.09.). Markus hat
  am 27.08. **bedingt freigegeben** („wenn alles getestet und richtig ist") — die
  Vorbedingungen misst jetzt `scripts/vercel-abbau-vorbedingungen.js` (27.08.: alles
  erfüllt außer den zwei Datums-Toren; wegen des h3-Vorfalls frühestens **02.09.**).
  GlitchTip und Wächter-Protokolle bleiben Handprüfungen.
- ✅ Objektmanifest 13.5.1 (27.08., `scripts/objektmanifest-supabase.js`, Ablage
  `cutover-vorbereitung/objektmanifest/`): Verbund = `public` + `analytics_internal` +
  `archive`; die DB trägt daneben fremde Apps (u.a. `marathon` mit 39 Tabellen), auch
  `public` selbst ist gemischt (HBA-Objekte) — Auswahl in Phase 5 gegen das
  Verbraucher-Inventar. Katalogtest: 3 Fundstellen (2× `extensions.digest`/pgcrypto in
  HBA-Funktionen, 1× FK auf `auth.users`). pg_cron-Job `analytics_internal.
  refresh_event_daily` alle 15 min → gehört in die Schreibbarriere 13.5.2.
  **Vor dem Testimport frisch erzeugen.**
- Kein Kysely-Merge, solange Vercel der Rückweg ist (Weg 1, Entscheidung Markus 25.08.) —
  Vercel kann die private DB nicht erreichen.
- ✅ **Phase-4-Design** (27.08.): kanonischer Lead-Submit „ein Aufruf, eine Transaktion",
  zweistufig (Stufe A `submit_lead_complete` als PG-Funktion sofort möglich, Stufe B
  direkter Treiber nach dem Umzug), Abnahmekriterien aus den Vorfällen (isolierter
  Pfadbeweis!): [2026-08-27-phase4-design-lead-submit.md](2026-08-27-phase4-design-lead-submit.md).
- ✅ **Phase-5-Objektauswahl** (27.08., gegen Manifest + Verbraucher-Inventar): 107 Objekte
  im Verbund → 46 migrieren, 20 fremd, 41 offen mit konkreten Entscheidungsfragen
  (tracking_*/landing-page, lead_contact_crm/Kalkulator, Webhook-Verbund,
  lead_access_permissions, archive-Schema):
  [cutover-vorbereitung/phase5-objektauswahl-2026-08-27.md](cutover-vorbereitung/phase5-objektauswahl-2026-08-27.md).
  **Vor dem Testimport Manifest frisch erzeugen.**
- ✅ **Alle 7 Phase-5-Fragen entschieden** (Markus + Klärungen, 27.08. nachmittags —
  Details in der Objektauswahl §5): tracking_* zieht mit, das landing-page-Formular wird
  **abgeschaltet** (Landing Page verlinkt direkt aufs Quiz; 🔴 Umbau vor dem Cutover
  nötig); Business_Kalkulator wird mit umgestellt und zieht später auf Coolify;
  Webhook-Verbund bleibt draußen, Legacy-MySQL künftig über **eine** Schnittstelle
  (Analysen-Muster); `lead_access_permissions` und `rls_auto_enable` entfallen;
  `archive` ist leer (0 Zeilen, nichts zu sichern); Legacy-Objekte ziehen mit.
  **`activecenter-analytics` wird nicht übernommen** — Statistiken bei Bedarf neu; ihr
  Schreibzugriff auf `lead_events`/`system_alerts` endet vor dem Cutover
  (Schreibbarriere). **Stufe A des Phase-4-Designs: freigegeben.**
- ✅ **Stufe A umgesetzt und live** (27.08. abends, PR #96): `submit_lead_complete`
  schreibt Kontakt + 6 Antworten atomar/idempotent; isoliert am echten System bewiesen.
- ✅ **landing-page-Formular abgeschaltet** (Commit `e8a32b2` dort; Live-Seite ohne
  `<form>`, verlinkt aufs Quiz) — die tracking_*-Vorbedingung ist erfüllt.
- ✅ **Phase-5-TESTIMPORT BESTANDEN** (27.08. nachmittags): selektiver Katalog-Export
  (18 Tabellen, 6 Views, 20 Funktionen, 5 Trigger) in `business_leads_testimport` auf
  dem Flotten-PG 18.6 importiert; Parität 356/356 Spalten · 65/65 Constraints · 86/86
  Indexe · 6/6 Views · 20/20 Funktionen · 5/5 Trigger; Funktionsbeweis am echten Pfad
  (Submit, Video-Rank, Outbox, init_lead). Zwei Funde behoben (FK-Reihenfolge nach
  falscher 0-Messung; Identity-Spalten unsichtbar für pg_attrdef — falsches Grün, erst
  der Funktionsbeweis fand es). Protokoll:
  [cutover-vorbereitung/phase5-testimport/testimport-protokoll-2026-08-27.md](cutover-vorbereitung/phase5-testimport/testimport-protokoll-2026-08-27.md).

### Nachtrag 27.08.: Vorfall Anzeigen-Konversion (gelöst) — HTTP/3 am Proxy aus

Werbe-Besucher (IG/FB-In-App-Browser) konvertierten seit dem Cutover nicht mehr —
**0 von 49** am 26.08., Formular-Klicks erreichten den Server nie; normale Browser und
alle E2E liefen durch. Einziger Netz-Unterschied zu Vercel: der neue Proxy bewarb
HTTP/3 (`Alt-Svc: h3`). **07:13 abgeschaltet** (Sicherung
`/data/coolify/proxy/backups/docker-compose.yml.vor-h3-aus-20260827`); **07:32** Beweis am
echten Gerät: Markus' eigener Anzeigen-Klick lief komplett durch die Pipeline.
Meta-Auslieferung brach als **Folge** der fehlenden Lead-Signale ein (808 → 64
Impressionen) und braucht nach Wiedereinsetzen der Konversionen Stunden bis einen Tag.
Dauerhaft: Wächter-Prüfung **W4** (Werbe-Besucher ohne ein einziges Opt-in → ALARM);
HTTP/3 bleibt aus, bis es am echten iOS-/IG-Gerät getestet ist. Vollständige Kette:
[2026-08-27-anzeigenkonversion-http3.md](2026-08-27-anzeigenkonversion-http3.md).

### Nachtrag 27.08. (2): Vorfall void-RPC-Teilverluste (gelöst, PRs #91/#92)

Die Opt-in-Persistenz aus PR #86 riss bei jedem Opt-in nach der **ersten** Antwort ab
(leerer Body der void-RPC `upsert_answer_current` wurde als JSON geparst; die Bridge-Kopie
von `supabaseRpc` hatte den 204-Guard nicht, die Fassung in `server/lead-system.js` schon
— **duplizierte Helfer driften**). 11 von 12 Opt-ins rettete der parallele Ereignisstrom;
1 Lead verlor real die Antworten 2–6. Die Breitenmessung fand zusätzlich 5 bis dahin
unsichtbare Alt-Teilverluste (Mai–August). **Fix deployt (PR #91), 6 Leads aus MySQL
geheilt, Backfill erkennt jetzt Teilverluste, Wächter W5 prüft jedes Opt-in auf 6
Antwortzeilen (PR #92, Serverkopie live).** Der Abnahme-„Beweis" vom 26.08. abends war
eine Fehldeutung — die Redundanz verdeckte den kaputten Pfad; Korrektur in
[2026-08-26-antwortverlust-analyse-und-zielbild.md](2026-08-26-antwortverlust-analyse-und-zielbild.md) §5c.
Aufarbeitung samt Migrationspunkten (Helfer-Konsolidierung, isolierte Pfad-Beweise, „kein
PostgREST im kritischen Pfad" bestätigt):
[2026-08-27-void-rpc-teilverluste.md](2026-08-27-void-rpc-teilverluste.md).

### Entscheidung 27.08. (Markus): Alter Eingang „Landing Page Business" bleibt vorerst

Der Nebeneingang (Tierprofil-Quiz, `ref_id` 25851739) wird **bewusst behalten** und erst
später abgebaut — keine Priorität. Erwartung: Er sollte praktisch keine Einträge mehr
erzeugen; neue Kontakte daraus fallen weiter als Einzelfälle in W3/W5 auf (Baseline je
Hash) und sind damit sichtbar, ohne Daueralarm.
