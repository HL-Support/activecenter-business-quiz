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

- Tracking-Sessions sind slug- und coach-spezifisch zu behandeln.
- `session_hash`/`tracking_hash` ist die Attribution-ID und beginnt mit `ac_`.
- `lead_hash` ist die finale Submission-ID und beginnt mit `qz_`; diese ID wird in `form_response.hidden.hash` an HL-Support gesendet.
- `form_response.token` ist der stabile Dedupe-/Retry-Key fuer denselben Submit-Versuch.
- Keine globalen oder alten `acQuizHash`-Reuses ueber verschiedene Coach-Slugs hinweg.
- Session-Reuse darf nur fuer denselben Coach-Slug erfolgen.

## Workflow

- `npm install`
- `npm run build`
- `npm run verify`
- `vercel deploy --prod --yes`

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
