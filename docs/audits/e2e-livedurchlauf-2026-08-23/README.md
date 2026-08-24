# E2E-Livedurchlauf 23.08.2026 — kompletter Funnel bis WhatsApp-CTA

Browser-Durchlauf (Playwright/Chromium headless) gegen die Produktion
`business.activecenter.info/markus`, als markierter Testlead (`?test=1` →
`is_internal_traffic=true`), echter Kontakt `markus@global-sce.com`.
Die drei Videos wurden real abgespielt, nur mit 5-facher Geschwindigkeit —
die 95%-Unique-Seconds-Messung und der Anti-Seek-Schutz (delta > 8s = Seek)
blieben dabei vollständig aktiv.

## Ergebnis: bestanden

Lead: `qz_b20385808cd24c85a2f89b3b8dca4a21` (18:43:48–18:47:46 UTC, ~4 Min.)

| Prüfpunkt | Ergebnis |
| --- | --- |
| Coach-Lookup, Lead-Init (v2, 100%) | 200, `enabled:true`, `legacy_writer_enabled:false` |
| 6 Quizfragen + Aspiration + Opt-in + Result | vollständig, Profil FEUER / freedom / vehicle |
| API-Zuverlässigkeit | 100 Calls, alle HTTP 200, alle `success:true`, 0 Fehler |
| Video 1 (196s) | real abgespielt, Unlock nach 40s (5x), Server-Ack |
| Video 2 (558s) | real abgespielt, Unlock nach 111s, Server-Ack |
| Video 3 (268s) | real abgespielt, Unlock nach 55s, Server-Ack |
| Kanonischer DB-Stand | `lastVideoStep:3`, `resumeTarget:final` — UI und DB synchron |
| Outbox Rang 1/2/3 | je 1 `mysql_rank_update`, alle `done` in 1 Versuch |
| Hot-Lead-Mail | genau 1 `coach_hot_lead_email` (Job 2250), erzeugt 18:47:42, `done` 18:48:14 |
| WhatsApp-CTA | Popup mit korrekter Coach-Nummer + Prefill; `cta_clicked` mit 200 bestätigt |
| Testlead-Hygiene | 4 Leads (Hauptlauf + 3 abgebrochene Anläufe) per `test_lead_marked` markiert |

Die Fehlerklasse aus Audit 4.1 (UI läuft weiter, DB bleibt zurück) trat in diesem
Happy-Path-Lauf nicht auf. Der Lauf ersetzt keine Fehlerfall-Tests (P0-6): 4.1/4.2
bleiben als Race-Risiko bei Netzfehlern bestehen.

## Echte Befunde aus dem Lauf

1. **Browser-Direktcall an Mautic scheitert an CORS.** `submitMauticLead` in
   `src/lib/core.js` postet direkt an `mautic.hl-support.biz/api/contacts/new` und wird
   von der CORS-Policy geblockt (Konsolenfehler bei jeder Submission). Funktional
   unkritisch, weil der Serverpfad (contacts-Webhook) die Daten trägt — aber toter,
   fehlschlagender Code. Beim Bridge-Umbau (P2) entfernen oder serverseitig verlagern.
2. **Health-Monitoring zählt geparkten Altjob dauerhaft als `pending`.** Outbox-Job 117
   (19.05.2026, `mysql_initial_rank`, `next_attempt_at=2099-01-01`, Legacy
   `matchedRows:0`) hält `outbox_pending` permanent auf ≥1. Vorschlag: Health sollte
   bewusst geparkte Jobs (`next_attempt_at` weit in der Zukunft) getrennt ausweisen,
   sonst maskiert das Grundrauschen echte Staus.
3. Bunny-RUM-Beacons (`rum-metrics.bunny.net`, `edgezone-*.bunnyinfra.net`) schlagen im
   Headless-Browser fehl — reines Rauschen, kein Funnel-Einfluss; unterstreicht aber
   Audit 4.9 (fremde Browser-Supply-Chain).

## Artefakte

- `evidence.json` — alle 100 API-Requests/Antworten, Konsolenfehler, Video-Timing,
  Browser-Lead-State
- `server-verify.json` — Resume-Kontrakt (generate/resolve, JWT geschwärzt),
  Health-Snapshot, Testlead-Markierungen
- `04-result.png`, `06-final.png` — Ergebnis- und Finalscreen
- Vollständige Screenshots aller Stufen im Session-Scratchpad (temporär)

Skripte: `e2e-funnel-run.js` / `e2e-verify-server.js` (Session-Scratchpad; Basis für
die P0-6-Playwright-Suite).
