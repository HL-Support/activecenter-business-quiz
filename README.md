# Business Leads Quiz

## Status

Dieses Quiz ist ein eigenstaendiges Vercel-Projekt und laeuft unter `https://quiz.activecenter.info`.
Es gehoert nicht zum Haupt-Deploy von `activecenter-web`.

- Projekt: `business_leads_quiz`
- Domain: `https://quiz.activecenter.info`
- Vercel Projekt-ID: `prj_REvfRPD2XJO5nBgpKBqUnVFKpJur`

## Aktuelle Architektur

- `src/app.entry.js` ist der kanonische Frontend-Entry fuer das Quiz.
- `src/app/App.jsx`, `src/app/bootstrap.js` und `src/lib/core.js` bilden die modulare Frontend-Source.
- `index.html` ist die Shell-Datei im Projektroot.
- `index.html` laedt `/video-config.js` und `/translations.js`, bevor `/assets/app.js` dynamisch geladen wird.
- `npm run build` baut das Frontend aus `src/app.entry.js` nach `dist/assets/app.js`.
- `npm run build` kopiert ausserdem `index.html`, `translations.js` und `video-config.js` nach `dist/`.
- `npm run verify` prueft Syntax, Translation-Key-Konsistenz und die erwartete `dist/`-Outputstruktur.
- Vercel liefert nur noch `dist/` aus.
- `vercel.json` nutzt deshalb `"outputDirectory": "dist"`.
- `ac-track.js` enthaelt die lesbare Tracking-Source-Logik.

## Wichtige Regeln

- Nicht mehr direkt am ausgelieferten Bundle arbeiten. Die kanonische Frontend-Quelle ist `src/app.entry.js`.
- Production kommt aus `dist/`, nicht aus dem Projektroot.
- `translations.js` ist die einzige kanonische Uebersetzungsdatei fuer `de`, `it`, `fr`, `ru` und `en`.
- `video-config.js` ist die kanonische Datei fuer die drei Funnel-Videos pro Sprache.
- Das finale Typeform-kompatible Payload wird in `api/bridge.js` gebaut und ueber den stabilen PHP-Bridge-Pfad `forward_webhook` weitergeleitet.
- Die zentrale PHP-Bridge hat weiterhin denselben Adapter-Mirror (`forward_typeform_adapter`), damit andere Seiten spaeter dieselbe Struktur serverseitig nutzen koennen.
- Keine doppelten Translation-Dateien oder alten Frontend-Artefakte wieder einfuehren.

## Tracking und Session-Verhalten

- Zielarchitektur v2: Ein Lead hat genau eine kanonische ID: `lead_hash = qz_...`.
- `/api/lead/init` erzeugt oder findet diese ID idempotent ueber `client_seed`.
- `/api/lead-track` ist der neue Writer fuer `lead_events`, `lead_state`, `lead_answers_current`, `lead_video_progress` und `lead_sync_outbox`.
- `/api/lead-outbox-worker` ist der einzige Outbox-Zusteller. n8n oder Vercel Cron duerfen nur diesen Endpoint triggern; Statuswechsel passieren ueber Supabase-RPCs.
- Der neue Pfad wird ueber Supabase `app_config` gesteuert: `new_lead_writer_enabled`, `new_lead_writer_percent`, `legacy_writer_enabled`, `outbox_worker_enabled`.
- `session_hash`/`tracking_hash` mit `ac_` ist nur noch Legacy-/Fallback-Kontext waehrend des Cutovers.
- Im Typeform-kompatiblen Payload steht `lead_hash` weiterhin in `form_response.hidden.hash`, weil HL-Support diese Spalte fuer die finale Survey-Zuordnung nutzt.
- `form_response.token` ist der stabile Idempotency-/Dedupe-Key fuer denselben Submit-Versuch und darf nicht mit Tracking- oder Lead-Hash vermischt werden.
- Alte `acQuizHash`-Keys werden beim Start entfernt und nicht mehr als Tracking-Session wiederverwendet.
- Ungueltige oder leere Coach-Daten fuehren auf `https://www.global-sce.com/`.

## Supabase Tracking Layer

- Das neue Schema liegt in `supabase-lead-system-v2.sql`.
- Neue Wahrheit:
  - `lead_state`: Identitaet, Coach/Referral, Kontakt, Profil, Lifecycle.
  - `lead_video_progress`: einzige Video-Wahrheit, monotone Updates per RPC.
  - `lead_answers_current`: aktueller Antwortstand je Frage.
  - `lead_events`: append-only Eventlog.
  - `lead_sync_outbox`: einziger Sync-Kanal zu MySQL/n8n/Mautic/Postmark; Claiming, Done, Failed und Dead laufen atomar per RPC.
  - `v_lead_state_full`: berechnete Reporting-View mit Rank.
- Alte Tabellen wie `quiz_sessions`, `tracking_sessions`, `tracking_events`, `tracking_video_progress` bleiben waehrend des Cutovers Legacy-/Archivkontext und duerfen nicht als neue Wahrheit erweitert werden.
- `api/bridge.js` darf im v2-Pfad keine Legacy-Resume- oder initiale `points_result`-Writes ausloesen.
- Wichtige Events: `page_view`, `quiz_started`, `question_viewed`, `question_answered`, `aspiration_confirmed`, `quiz_result`, `result_cta_click`, `optin_viewed`, `form_submit`, `video_viewed`, `video_started`, `video_progress`, `video_seeked`, `video_unlocked`, `video_completed`, `video_continue_click`, `final_viewed`, `cta_click`.
- Video-Tracking misst eindeutig gesehene Sekunden. Progress-Events werden in 5-Prozent-Buckets gesendet; `lead_video_progress` speichert den maximalen `unique_watched_percent` und darf nur steigen.
- Vorspulen wird erkannt. Wenn ein Nutzer ueber den bereits real angeschauten Bereich hinausspringt, setzt der Player auf den letzten erlaubten Bereich zurueck. Der 75-Prozent-Weiterbutton wird nur durch echte Unique-Watch-Zeit freigeschaltet.
- `max_playhead_percent` bleibt als separates Feld erhalten, damit man spaeter erkennen kann, ob jemand stark gespult hat.
- `member_id` ist der zentrale Coach-Schluessel.
- `ref_id` ist Attribution; wenn kein echter Referral-Code vorhanden ist, gilt `ref_id = member_id`.

## Webhook-Format

- Der Browser schickt keine finale Typeform-Struktur mehr ab.
- Stattdessen sendet das Quiz nur noch normalisierte Adapter-Daten an `api/bridge.js`.
- `api/bridge.js` baut daraus das Typeform-aehnliche Payload und proxyt es ueber die zentrale PHP-Bridge (`https://ac-reconnect.com/db-bridge.php`) an `https://contacts.hl-support.biz/webhook/typeform`.
- Dieser lokale Builder ist absichtlich produktionskritisch: Er verhindert, dass das Quiz kaputtgeht, wenn die zentrale Bridge auf `ac-reconnect.com` noch nicht auf dem neuesten Adapterstand ist.
- Neben Vorname und E-Mail werden weiterhin das Ergebnisprofil, das berechnete Hauptziel (`main_aspiration` / `main_aspiration_label`) sowie alle 6 Quizfragen mit der jeweils gewaehlten Antwort in `form_response.definition.fields` und `form_response.answers` mitgesendet.
- Die uebermittelte Webhook-Sprache muss aus der aktiven Quizsprache (`preferredLang`) kommen, nicht nur aus `navigator.language`, damit manuell umgeschaltete DE/IT/FR/RU/EN/HU-Varianten auch im gespeicherten `form_response` die richtigen Frage- und Antworttexte erzeugen.
- Es gibt keinen zweiten n8n-Ergebniswebhook mehr. Profil, Hauptziel, Fragen, Antworten, Name und E-Mail werden ausschliesslich im Typeform-kompatiblen Hauptpayload an HL-Support/Global-SCE uebergeben.

## Bridge-Ablauf

1. Frontend sammelt Quizantworten, berechnet Profil und Hauptziel.
2. `src/lib/core.js` sendet normalisierte Adapterdaten an `POST /api/bridge` mit `action: "forward_typeform_adapter"`.
3. `api/bridge.js` validiert `adapter_key`, Ziel-URL und baut daraus das finale Typeform-kompatible Payload.
4. `api/bridge.js` leitet dieses Payload ueber `action: "forward_webhook"` an `https://ac-reconnect.com/db-bridge.php` weiter.
5. Die PHP-Bridge speichert/loggt den Forwarding-Versuch und sendet serverseitig an `https://contacts.hl-support.biz/webhook/typeform`.
6. HL-Support speichert das empfangene `form_response` in der Datenbankspalte `form_response` und liest daraus spaeter Fragen, Antworten, Profil und Hauptziel aus.

Wichtig: `landing-page/_system/db-bridge.php` enthaelt einen aktualisierten Mirror desselben Business-Leads-Adapters. Dieser Mirror sollte auf dem Server als `https://ac-reconnect.com/db-bridge.php` aktualisiert werden, damit auch andere Webseiten den zentralen Adapter nutzen koennen. Fuer `quiz.activecenter.info` ist das aber nicht mehr blockierend, weil die Vercel-API das Payload bereits korrekt baut.

## Form-Response-Kompatibilitaet

- Das HL-Support-System und nachgelagerte Support-/Ausleselogik lesen Fragen und Antworten aus der gespeicherten DB-Spalte `form_response`.
- Deshalb darf der Business-Leads-Webhook nicht nur Name/E-Mail oder eine flache Summary senden.
- Zwingend kompatibel bleiben muessen:
  - `form_response.definition.id`
  - `form_response.definition.title`
  - `form_response.definition.fields`
  - `form_response.answers`
  - `form_response.hidden`
  - `form_response.token`
  - `form_response.submitted_at`
- Jede Antwort muss Typeform-artig gespeichert werden, also mit korrektem `type` sowie passendem `field.id`, `field.type` und `field.ref`.
- Choice-Antworten muessen ihre `choice`-Daten behalten, damit Frage-/Antwort-Auslesung spaeter stabil bleibt.
- Das berechnete Hauptziel muss als eigenes Textfeld `lead_main_aspiration` in `form_response.definition.fields` und `form_response.answers` vorhanden sein, damit HL-Support es wie die anderen Antworten auslesen kann.
- Die aktuelle Produktion baut diese Struktur in `business_leads_quiz/api/bridge.js`; die zentrale PHP-Bridge hat den gleichen Adapter als Mirror.

## Live-Test-Kriterien

- `POST https://quiz.activecenter.info/api/bridge` mit `action: "forward_typeform_adapter"` muss `target_status: 200` liefern.
- `form_response.form_id` muss `hC2yTcU8` bleiben.
- `form_response.definition.fields` muss `lead_profile_result`, `lead_main_aspiration`, `lead_q1_drive` bis `lead_q6_barrier`, `first_name` und `email` enthalten.
- `form_response.answers` muss 10 Antworten enthalten: Profil, Hauptziel, 6 Quizantworten, Vorname, E-Mail.
- `lead_main_aspiration` muss den lokalisierten Zieltext enthalten, z. B. `Freiheit`, `Libertà` oder `Freedom`.
- Ein Live-Testkontakt unter `/markus` muss im Dashboard-Feed unter `shared_tracking.recent_sessions` mit `member_id`, `berater_slug`, `lead_hash`, `quiz_profile_name`, `main_aspiration_label`, `form_first_name`, `form_email`, `final_cta_type` und allen zugehoerigen `tracking_events` sichtbar sein.

## Deploy

```bash
cd business_leads_quiz
npm install
npm run build
npm run verify
npm run deploy:preview
```

`npm run deploy:preview` creates a Vercel Preview URL and does not overwrite `https://quiz.activecenter.info`.

After the Preview URL has been tested, commit and push `main`, then promote the exact tested deployment:

```bash
npm run promote:prod -- <preview-url>
```

Do not deploy directly with `npx vercel deploy --prod`. Production should only be updated by promoting a tested Preview deployment.

## Relevante Dateien

- `src/app.entry.js`: kanonische Frontend-Source
- `index.html`: Shell und Modal-Container
- `translations.js`: zentrale Sprachtexte
- `video-config.js`: zentrale Video-Konfiguration pro Sprache
- `dist/assets/app.js`: gebautes produktives Frontend-Bundle
- `ac-track.js`: Tracking-Source
- `api/bridge.js`: Coach-Lookup, Analytics und Proxy zur zentralen PHP-Bridge
- `api/validate-email.js`: E-Mail-Validierung
- `supabase-schema.sql`: SQL fuer alte `quiz_sessions` plus neue `tracking_*` Tabellen
- `vercel.json`: `dist`-Output und Slug-Rewrite
