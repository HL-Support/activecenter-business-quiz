# Business Leads Quiz

## Aktueller Lieferzustand

- Dieses Unterprojekt ist ein separates Vercel-Projekt.
- Production wird aus `dist/` ausgeliefert.
- `vercel.json` verwendet `"outputDirectory": "dist"`.
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
- `npm run deploy:preview`
- Teste die Preview-URL mit realem Coach-Slug, bevor Production geaendert wird.
- Committe alle beabsichtigten Aenderungen.
- Pushe `main` zu `origin/main`.
- Production wird ausschliesslich durch Promote einer getesteten Preview live geschaltet: `npm run promote:prod -- <preview-url>`.
- `npm run deploy:prod -- <preview-url>` ist nur ein Alias fuer denselben Promote-Flow.
- Nie direkt `npx vercel deploy --prod` ausfuehren.
- Der Promote-Guard muss vor Production gruen sein: sauberer Working Tree, Branch `main`, `HEAD == origin/main`.

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
