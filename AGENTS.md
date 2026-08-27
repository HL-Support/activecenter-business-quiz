# Business Leads Quiz

## 🔴 ZUERST LESEN

**[docs/STAND-UND-FORTSETZUNG.md](docs/STAND-UND-FORTSETZUNG.md)** — Einstiegsdokument:
Systemlandschaft, aktueller Migrationsstand, geltende Entscheidungen, bekannte Fallen und
der Fortsetzungsplan. Wer hier weiterarbeitet, faengt dort an.

## Shared Operating Layer

- Read `D:\OneDrive\Antigravity Laptop\agent-core\governance\GOVERNANCE_RULES.json` before substantial work.
- Use direct brain helpers from `D:\OneDrive\Antigravity Laptop\agent-core\scripts\direct-api-helpers.ps1`.
- Session start:
  ```powershell
  . "D:\OneDrive\Antigravity Laptop\agent-core\scripts\direct-api-helpers.ps1"
  Read-Memory -Query "business leads quiz aktuelle entscheidungen status"
  ```
- Use `Query-KnowledgeBase` for AnythingLLM and `Save-Memory -Tier PROJECT` for durable project updates.
- Before commits, pushes, branch cleanup, worktree cleanup, or deploys follow `D:\OneDrive\Antigravity Laptop\activecenter-web\.agents\skills\git-deploy-safety\SKILL.md`.
- Safety project key: `business_leads_quiz`.
- Required root checks:
  ```bash
  npm run safety:status
  npm run safety:guard -- --project business_leads_quiz
  npm run safety:deploy -- --project business_leads_quiz
  ```
- GitHub CI: `Activecenter Safety` / jobs `safety` und `e2e-queue`; `main` hat Branch
  Protection, die beide verlangt.

## Aktueller Lieferzustand (seit Cutover 25.08.2026)

- Production laeuft auf **Coolify** (`167.233.251.217`, App `business-leads-prod`,
  Dockerfile-Build, `server/app-server.js` liefert `dist/` + `api/` + `/health/live`).
- Deploys macht der CI-Job `deploy` nach gruenen Gates (nur Runtime-Pfade, Nachweis ueber
  `/health/live`); der rohe Git-Webhook bleibt aus. docs/scripts-Merges deployen nicht.
  Details und manueller Fallback: [DEPLOYMENT_WORKFLOW.md](DEPLOYMENT_WORKFLOW.md).
- Vercel ist nur noch Hosting-Rueckweg bis zum Abbau (dort gilt weiter
  `"outputDirectory": "dist"` aus `vercel.json`).
- `index.html` ist die Shell und laedt `/video-config.js` und `/translations.js` vor `/assets/app.js`.

## Frontend-Regeln

- `translations.js` ist die einzige kanonische Uebersetzungsdatei.
- `video-config.js` ist die einzige kanonische Video-Config fuer sprachspezifische Funnel-Videos.
- `src/app.entry.js` ist der kanonische App-Entry.
- `src/app/App.jsx`, `src/app/bootstrap.js` und `src/lib/core.js` sind die kanonischen modularen Frontend-Quellen.
- `dist/assets/app.js` ist das gebaute und live ausgelieferte Bundle.
- Keine alten Artefakt-Dateien, keine doppelten Translation-Dateien, keine parallelen Bundle-Pfade.
- Nicht direkt am gebauten Bundle arbeiten, solange die Aenderung in `src/app.entry.js` oder den `src/app/*`- bzw. `src/lib/*`-Quellen vorgenommen werden kann.

## Tracking-Regeln

- Zielarchitektur v2: `lead_hash` ist die kanonische Lead-ID und beginnt mit `qz_`.
- Der neue aktive Writer-Pfad ist Frontend -> `/api/lead-track` -> Supabase `lead_*` Tabellen.
- `client_seed` macht `/api/lead/init` idempotent; gleiche Seed-Anfragen muessen denselben `lead_hash` liefern.
- `session_hash`/`tracking_hash` mit `ac_` ist nur noch Legacy-/Fallback-Kontext und darf nicht als neue Wahrheit ausgebaut werden.
- `lead_hash` wird in `form_response.hidden.hash` an HL-Support gesendet.
- `form_response.token` ist der stabile Dedupe-/Retry-Key fuer denselben Submit-Versuch.
- Keine globalen oder alten `acQuizHash`-Reuses.
- Video-Fortschritt in v2 darf nur in `lead_video_progress` steigen, niemals sinken.
- MySQL `points_result` ist nur Kopie via Outbox, nicht Source of Truth.
- n8n ist nur Sync-Worker fuer `lead_sync_outbox`, kein paralleler Writer. Es triggert `/api/lead-outbox-worker`; der Worker claimt Jobs atomar und markiert sie per Supabase-RPC als `done`, `failed` oder `dead`.

## Workflow

- `npm install`
- `npm run build`
- `npm run verify`
- `npm test` (163 Vertrags-/Verhaltenstests; CI verlangt sie ohnehin)
- Aenderungen per PR gegen `main`; Merge erst mit gruenen Checks (`safety`, `e2e-queue`).
- Nach dem Merge von Runtime-Code deployt der CI-Job `deploy` und beweist es ueber
  `/health/live` — den Job-Ausgang pruefen, nicht annehmen. Ablauf/Fallback in
  [DEPLOYMENT_WORKFLOW.md](DEPLOYMENT_WORKFLOW.md).
- Kopien nachziehen, wenn betroffen: Nurture-Waechter auf `167.233.251.217`
  (docs/NURTURE_BETRIEB.md §4), n8n-Workflows nur ueber die API (Skill
  `n8n-workflow-update`).
- Supabase-Zugriffe: `api/bridge.js` und `server/lead-system.js` halten (noch) doppelte
  Helfer — Aenderungen immer in BEIDEN Fassungen pruefen (Vorfall 27.08.,
  docs/audits/2026-08-27-void-rpc-teilverluste.md).
- Vercel-Preview/Promote (`deploy:preview`, `promote:prod`) ist nur noch der Rueckweg bis
  zum Vercel-Abbau; nie direkt `npx vercel deploy --prod`.

## Kritische Dateien

- [index.html](D:/OneDrive/Antigravity Laptop/activecenter-web/business_leads_quiz/index.html)
- [src/app.entry.js](D:/OneDrive/Antigravity Laptop/activecenter-web/business_leads_quiz/src/app.entry.js)
- [translations.js](D:/OneDrive/Antigravity Laptop/activecenter-web/business_leads_quiz/translations.js)
- [video-config.js](D:/OneDrive/Antigravity Laptop/activecenter-web/business_leads_quiz/video-config.js)
- [src/app/App.jsx](D:/OneDrive/Antigravity Laptop/activecenter-web/business_leads_quiz/src/app/App.jsx)
- [src/app/bootstrap.js](D:/OneDrive/Antigravity Laptop/activecenter-web/business_leads_quiz/src/app/bootstrap.js)
- [src/lib/core.js](D:/OneDrive/Antigravity Laptop/activecenter-web/business_leads_quiz/src/lib/core.js)
- [dist/assets/app.js](D:/OneDrive/Antigravity Laptop/activecenter-web/business_leads_quiz/dist/assets/app.js)
- [ac-track.js](D:/OneDrive/Antigravity Laptop/activecenter-web/business_leads_quiz/ac-track.js)
- [api/bridge.js](D:/OneDrive/Antigravity Laptop/activecenter-web/business_leads_quiz/api/bridge.js)
- [api/validate-email.js](D:/OneDrive/Antigravity Laptop/activecenter-web/business_leads_quiz/api/validate-email.js)
