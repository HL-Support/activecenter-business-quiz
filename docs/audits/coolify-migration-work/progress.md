# Progress Log

## Session: 2026-08-23

### Phase 1: Delivery and dependency discovery
- **Status:** in_progress
- **Started:** 2026-08-23
- Actions taken:
  - Read canonical governance, project instructions, relevant skills, and project memory.
  - Fetched `origin` and verified `main` is neither ahead nor behind.
  - Confirmed the only pre-existing working-tree item is the user's untracked workspace file.
  - Inventoried build, Vercel routing, HTML shell, API files, source files and core documentation.
  - Logged missing architecture documentation and initial module-size/platform-coupling risks.
  - Enumerated bridge actions, handler module styles, environment-variable references and hard-coded external hosts.
  - Inspected build behavior, test inventory and tracked/generated file policy.
  - Compared the two tracking implementations and catalogued swallowed-error/fire-and-forget paths.
  - Identified that canonical v2 event delivery has less retry durability than the legacy event batcher.
  - Audited public endpoint authentication/CORS, Supabase privilege boundaries and outbox worker claiming.
  - Identified client-forgeable video progression and insecure default bootstrap token as business-integrity risks.
- Files created/modified:
  - `docs/audits/coolify-migration-work/task_plan.md`
  - `docs/audits/coolify-migration-work/findings.md`
  - `docs/audits/coolify-migration-work/progress.md`

## Test Results
| Test | Input | Expected | Actual | Status |
|------|-------|----------|--------|--------|
| Repository path | Current working directory | Canonical D: workspace | Canonical D: workspace | Pass |
| Remote divergence | Git rev-list both directions | 0 behind, 0 ahead | 0 behind, 0 ahead | Pass |

## Error Log
| Timestamp | Error | Attempt | Resolution |
|-----------|-------|---------|------------|
| 2026-08-23 | None | 1 | N/A |
| 2026-08-23 | Referenced `LEAD_SYSTEM_V2_ARCHITECTURE.md` does not exist | 1 | Logged as documentation drift; continue from code and production evidence |
| 2026-08-23 | PowerShell parsed the first ripgrep action pattern incorrectly | 1 | Used single-quoted patterns on the next attempt |
| 2026-08-23 | Ripgrep treated `*.md` as an invalid Windows path | 1 | Use ripgrep glob flags or explicit paths on subsequent searches |

## 5-Question Reboot Check
| Question | Answer |
|----------|--------|
| Where am I? | Phase 1: delivery and dependency discovery |
| Where am I going? | Funnel audit, risk audit, Coolify design, migration report |
| What's the goal? | Evidence-backed technical audit and migration plan without production changes |
| What have I learned? | See `findings.md` |
| What have I done? | See above |
## 2026-08-23 – Plattformreferenzen geprüft

- Offizielle Coolify-Dokumentation zu Container-Builds, Dockerfile-Betrieb und Healthchecks geprüft.
- Offizielle Supabase-Dokumentation zu RLS, Grants, API-Exposition und Backend-Schlüsseln geprüft.
- Vorläufige Entscheidung: portables eigenes Dockerfile plus expliziter Node-Server; kein Vercel-spezifischer Funktionsadapter als dauerhafte Zielarchitektur.

## 2026-08-23 – Live-DNS und HTTP geprüft

- Beide produktiven Hostnamen zeigen aktuell auf Vercel und liefern denselben Stand.
- Sicherheitsheader und Cacheverhalten aufgenommen.
- Fehlende Asset-Fingerprints/Immutable-Caches sowie zu breites statisches CORS als Optimierungspunkte erfasst.

## 2026-08-23 – Qualitäts-Baseline ausgeführt

- 32 Tests, Lint, Verify und Produktionsbuild sind grün.
- Der Testumfang wurde gegen die reale Funnel-Kette abgegrenzt; durchgehende Browser-/Failure-E2E-Abdeckung fehlt.
- Build erzeugt unverändert das nicht fingerprintete 230-KB-Bundle.

## 2026-08-23 – API-Verträge und SQL-Grenzen geprüft

- RLS/Grants der v2-Tabellen und RPCs geprüft; Datenbankgrenze ist deutlich stärker als die öffentliche Browser-API.
- Ungeschützte Event-, Resume- und Metrikaktionen dokumentiert.
- Gefährliches Default-Secret der DB-Initialisierungsroute sowie falsche `email_sent`-Semantik dokumentiert.

## 2026-08-23 – Produktion und Zustandsmaschine geprüft

- Geschützten Health-Endpunkt ohne Benachrichtigung read-only geprüft: System aktuell gesund.
- Installierte RLS-Policies read-only gegen den SQL-Stand geprüft.
- Lokales Video-Unlock, asynchrones Tracking, Resume-Ziel und finalen WhatsApp-Link als vollständige Zustandskette analysiert.

## 2026-08-23 – Abhängigkeiten und Coolify-Betrieb geprüft

- Vercel-spezifische Code-, Deploy- und Runtime-Stellen inventarisiert.
- Externe Dienste und Browserressourcen getrennt von der reinen Hostingabhängigkeit bewertet.
- Offizielle Coolify-Regeln für Rolling Updates, Scheduled Tasks und Backups in die Zielarchitektur übernommen.

## 2026-08-23 – Runtime-Portabilität geprüft

- Lockfile-/Versionierungsstatus und gemischte Modulformate aufgenommen.
- Live-Methoden-, CORS- und Cacheverhalten der v2-Konfig-/Tracking-API read-only geprüft.
- npm-Audit als falsches Werkzeug für das vorhandene pnpm-Lockfile abgegrenzt.

## 2026-08-23 – Abhängigkeiten und Produktions-Smoke abgeschlossen

- `pnpm audit --prod`: keine bekannten produktiven Schwachstellen.
- Read-only Produktions-Smoke erfolgreich, ohne E-Mail-/Webhook-/Meta-Seiteneffekt.
- Abhängigkeitskarte und Bridge-Verträge gegen den aktuellen Code abgeglichen.

## 2026-08-23 – Audit abgeschlossen

- Priorisierten Detailbericht mit P0/P1/P2-Maßnahmen, Coolify-Zielarchitektur, Cutover, Rollback und Abnahmekriterien erstellt.
- Keine Produktivkonfiguration, Datenbank, Runtime-Logik oder Domain verändert.
- Bestehende ungetrackte Workspace-Datei unverändert belassen.

## 2026-08-23 – Planungsumfang erweitert

- Neues Ziel aufgenommen: separates Repository `business-schulung` vor dem Coolify-Cutover integrieren.
- Neues Ziel aufgenommen: Supabase vollständig durch den neuen PostgreSQL-Server auf Hetzner ersetzen.
- Audit wieder geöffnet; Produktionssysteme bleiben unverändert.

## 2026-08-23 – `business-schulung` inventarisiert

- Repository, Git-Stand, Laufzeit, Dateien, Übersetzungen und Deep-Link-Parameter geprüft.
- Vorläufige Integrationsentscheidung: statisches Featuremodul im Business-Leads-Produkt, keine zweite Runtime.
- Breite OneDrive-weite Referenzsuche wegen langsamer synchronisierter Verzeichnisse abgebrochen; Referenzen werden gezielt in relevanten Repositories/Dokumenten gesucht.

## 2026-08-23 – Supabase-Ersatzoberfläche inventarisiert

- Direkte PostgREST- und RPC-Aufrufe in Server, Bridge, Worker, Health und APIs erfasst.
- V2-Schemaobjekte sowie zusätzliche Legacy-/Metrikobjekte als vollständigen Migrationsscope markiert.
- Zielrichtung festgelegt: fachliche Node-Repositories mit direktem, gepooltem PostgreSQL-Zugriff statt selbst gehostetem PostgREST-Klon.

## 2026-08-23 – Flottenstandard und PostgreSQL-Regeln übernommen

- Bestehenden Zielcluster identifiziert: PostgreSQL 18.6 auf `10.0.1.3`, private Verbindung von Coolify `10.0.1.5`.
- Kysely/Direct-Driver und kein PostgREST als verbindliche Architekturentscheidung übernommen.
- Pooling, Least Privilege, `SKIP LOCKED`, Bulkimport und Index-/Constraint-Parität in die Planung aufgenommen.

## 2026-08-23 – Flottenarchitektur und Backuprealität geprüft

- Verbindliche Grundsätze G1–G5 gelesen: kein PostgREST-Gerüst, Kysely, eigene Produktdatenbank, Coolify als eine Plattform.
- Bestehende pgBackRest-/Dump-Kette und belegte PITR-Rückspielproben berücksichtigt.
- Geteiltes Supabase-Projekt mit neun Verbrauchern als migrationsentscheidende Verbundabhängigkeit aufgenommen.

## 2026-08-23 – Referenzmigration lokalisiert

- Das kanonische Anlegeskript `/root/pg-neues-projekt.sh` liegt nur auf dem DB-Server, nicht im lokalen Coolify-Repo.
- Das lokale Referenzprojekt `activecenter-web/fitapp-marathon` für den bereits laufenden Kysely-/PostgreSQL-Umbau lokalisiert; dessen bewährte Dual-Run-/Paritätsmuster werden für den Lead-Verbund ausgewertet.

## 2026-08-23 – Live-Datenumfang und Replikationsgrenzen geprüft

- Tabellen, Views, Sequenzen und Größen in `public`/`analytics_internal` read-only aus Supabase katalogisiert.
- PostgreSQL-18-Dokumentation zu Initial Copy, DDL-/Sequenzgrenzen, Subscription und Monitoring geprüft.
- DDL-Freeze, Sequenzkorrektur, Read-only-Subscriber und zweifache Paritätsmessung als Pflichtgates aufgenommen.

## 2026-08-23 – Schulungs-Build und Linkvertrag verifiziert

- Separater Next-Produktionsbuild erfolgreich; Seite ist vollständig statisch.
- Doppelte Link-/Aliaslogik in Bridge und Worker identifiziert.
- Bestehende E-Mail-Deep-Links als Nachlauf-/Redirect-Risiko in die Planung aufgenommen.

## 2026-08-23 – Erweiterte Planung abgeschlossen

- Zielarchitektur auf ein konsolidiertes Repository/eine Web-Application plus internen Worker und eigene Datenbank `business_leads` auf PostgreSQL 18.6 erweitert.
- Reihenfolge finalisiert: Schulung integrieren → Funnel stabilisieren → Hosting mit unverändertem Datenzugriff auf Coolify → Kysely auf Coolify → Hetzner-Datenbank → Lead-Verbund-Cutover.
- Besitzmatrix, logische Replikation, DDL-Freeze, Sequenzen, Rollen, Pooling, Backup/Restore und differenzierte Rollbacks im Hauptbericht ergänzt.
- Keine Runtime-, Datenbank-, Domain- oder Produktivänderung ausgeführt.
