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
| Coolify-Deploy-Pipeline (13.3.3/13.5.6: Digest-Promotion, Preview-App, CI-Gates vor Webhook) | Phase-3-Design |
| Vercel-Nachlauf: Projekt/Env/Domains erst nach bewusst aufgegebenem Rollback entfernen (Phase 7) | Cutover + Beobachtungsfrist |
| zzz-Vercel-Projekt endgültig löschen | Nachlauffrist (Empfehlung 6–12 Monate, Klickzahlen ~0) |

### C. Kleine offene Arbeiten (bewusst zurückgestellt)

| Punkt | Herkunft |
| --- | --- |
| `server/*.js` in die verify.js-Syntax-Dateiliste aufnehmen (2 Zeilen) | P0-5-Bericht |
| Latenter Bug `normalizeResumeProfileCode` (bridge-`safeString` gibt null → stiller Fallback auf resumeTarget result bei Leads ohne Profil/Quiz-Daten) | P0-4-Bericht; eigenes Ticket |
| `quiz_form_submit` (Altbestand) aus Allowlist prüfen/entfernen | P2-Bereinigung |
| Auto-Deploy-Governance: Merge auf main = Prod-Deploy widerspricht DEPLOYMENT_WORKFLOW.md — entscheiden: Auto-Deploy aus oder Doku anpassen (entschärft sich mit Coolify) | Memory/24.08. |
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
