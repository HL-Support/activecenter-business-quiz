# Event-Inventur für die lead-track-Allowlist (24.08.2026)

Vollständige Zählung über alle 103.038 Zeilen in `lead_events` (paginiert über
`event_uid`, read-only). Grundlage für die P0-3-Allowlist: Ein nur aus dem Code
geratener Katalog hätte legitime Events verworfen.

## Browser-Events (kommen über POST /api/lead-track — Allowlist-Kandidaten)

| Event | Anzahl | Anmerkung |
| --- | ---: | --- |
| video_progress | 26758 | |
| question_viewed | 11574 | |
| quiz_answer | 10016 | Server normalisiert auch `question_answered` (1012) hierauf |
| page_view | 7488 | |
| video_seeked | 4383 | Anti-Seek-Telemetrie |
| video_viewed | 3380 | |
| quiz_started | 2318 | |
| video_started | 1999 | |
| aspiration_confirmed | 1811 | |
| quiz_result | 1741 | |
| optin_viewed | 1724 | |
| video_completed | 1646 | |
| form_submitted | 1191 | |
| video_unlocked | 1180 | |
| result_cta_click | 1059 | |
| video_continue_click | 1055 | |
| form_submit | 1018 | |
| final_viewed | 255 | |
| video_health | 253 | Player-Fehlerpfad (trackHealth) |
| cta_clicked | 211 | Server normalisiert auch `cta_click` (1) hierauf |
| video_resume_seek | 100 | |
| nurture_resume_opened | 98 | Resume aus Nurture-Mail, getrackt im Browser (bootstrap) |
| quiz_form_submit | 87 | Altbestand, prüfen ob noch aktiv |
| video_recovery | 63 | |
| video_ended_low_watch | 53 | |
| test_lead_marked | 24 | Smoke/E2E-Markierung |

## Server-/Worker-/n8n-Events (NICHT über die HTTP-Route — von der Allowlist unberührt)

nurture_skipped (18693), nurture_sent (1515), hot_lead_coach_email_sent (201),
lifecycle_stage_changed (112), video_all_completed_coach_email_sent (7),
test_contact_marked (6), nurture_error (4), nurture_sent_wrong_email_archived (1),
initial_result_email_resent (1)

## Konsequenz für das Design

- Allowlist gilt ausschließlich an der HTTP-Grenze (`api/lead-track.js`), niemals
  für interne Writer (Worker/n8n schreiben direkt nach Supabase).
- Unbekannte Events → 400 `event_not_allowed`: Die P0-1-Queue behandelt 400 als
  permanent (Dead-Letter statt Retry-Sturm) — die Allowlist ist erst durch die
  Queue gefahrlos einführbar.
- Vor Aktivierung: Code-Scan (`trackQuizAnalytics`/`track(`-Aufrufstellen) mit
  dieser Liste vereinigen; `quiz_form_submit` und Legacy-Aliasse klären.
