# Business Leads Quiz: Abhaengigkeitskarte

Stand: 27.08.2026 (Hosting seit 25.08. auf Coolify; Endpunkte und Fluesse unveraendert)

## Hauptfluss

```text
Meta-Anzeige
  -> business.activecenter.info/{berater_slug}
  -> Browser: React-Quiz + ac-track.js
  -> /api/lead/init und /api/lead-track
  -> Supabase Lead-System v2
  -> /api/bridge forward_typeform_adapter
  -> zentrale Laravel/PHP-Bridge
  -> Contacts-System / Typeform-kompatibler Webhook
  -> n8n Lead Post Processor
  -> Mautic-Kontakt und sofortige Ergebnis-Mail
  -> n8n Nurture Email Sender
  -> /api/bridge generate_resume_token
  -> Mautic / Postmark
  -> Resume-Link zurueck zum Quiz
```

## Browser-Dateien

| Datei | Verantwortung | Externe Grenze |
| --- | --- | --- |
| `src/app.entry.js` | Startet die Anwendung und veroeffentlicht Bootstrap-Diagnosezustand. | Keine Netzwerkentscheidung. |
| `src/app/bootstrap.js` | Coach-Aufloesung, Resume-Aufloesung, initiales Rendering. | `/api/bridge` |
| `src/app/App.jsx` | Quiz, Opt-in, Video-Player, Freigaben, Abschluss. | Core-Funktionen und Bridge-Actions |
| `src/lib/core.js` | Lead-Identitaet, Sprache, Attribution, Submission, Tracking-Helfer. | Lead-APIs, `/api/bridge`, Mautic |
| `ac-track.js` | Legacy-/Seitentracking und Tracking-Session. | `/api/bridge` |
| `src/ac-track.js` | Nicht blockierender Event-Batcher. | `/api/bridge` |

## Projekt-APIs (`api/`, ausgeliefert vom Coolify-Container; auf dem Vercel-Rueckweg identisch)

| Endpoint | Aufgabe | Kritische Abhaengigkeit |
| --- | --- | --- |
| `/api/bridge` | Projekt-Bridge und oeffentlicher Vertrag. | Supabase, zentrale Bridge, n8n, Postmark, Meta CAPI |
| `/api/lead-init` | Initialisiert einen kanonischen Lead. | Supabase RPC `init_lead` |
| `/api/lead-track` | Monotone Video- und Eventfortschritte. | Supabase RPCs und Outbox |
| `/api/lead-outbox-worker` | Synchronisiert wartende Jobs. | Supabase, Downstream-Systeme |
| `/api/lead-system-health` | Ueberwacht Tabellen, Outbox und Migration. | Supabase, Alert-Mail |
| `/api/validate-email` | Unverbindliche E-Mail-Pruefung. | Fehler fuehren absichtlich nicht zum Leadverlust. |

## Externe Systeme

| System | Verwendung | Ausfallverhalten |
| --- | --- | --- |
| Supabase `Stats_Logs` | Lead-State, Video-Fortschritt, Events, Resume-Daten, Outbox. | Kritisch fuer kanonischen Fortschritt. |
| Laravel/MySQL-Bridge | Coach-Daten und Weiterleitung zum Contacts-System. | Coach-Aufloesung und Submission betroffen. |
| n8n | Lead-Nachbearbeitung, Nurture, Synchronisation. | E-Mails und Downstream-Sync betroffen. |
| Mautic | Kontaktfelder und Nurture-Mail-Templates. | Nurture-Versand betroffen. |
| Postmark | Transaktionale Zustellung. | Ergebnis-/Nurture-Zustellung betroffen. |
| Meta CAPI | Qualitaetssignale an Meta. | Nicht blockierend fuer den Opt-in. |
| Bunny/Player.js | Video-Wiedergabe und Fortschritt. | Player-Fallback muss den Nutzer informieren, nicht still freigeben. |

## Externe Aufrufer der Projekt-Bridge

- Aktiver n8n-Workflow `RqKSRTgFv8mv04H2`: `generate_resume_token`
- Browser des Quiz: alle in `scripts/lib/bridge-contracts.js` genannten Browser-Actions
- Produktions-Smoke: `generate_resume_token`, `resolve_resume_key`, `write_analytics`
- Analytics-Clients: die drei Metrics-Actions, soweit weiter verwendet

## Diagnose ohne Verhaltensaenderung

- `window.__AC_BOOTSTRAP_STATUS__` zeigt `ok: true` oder einen gekuerzten Startfehler.
- Browser-Event `ac:bootstrap-error` meldet einen Startfehler an lokale Diagnosewerkzeuge.
- `window.__AC_ATTRIBUTION_SHADOW__` vergleicht die aktuelle Zuordnung mit der verbesserten URL-zuerst-Regel.
- Nur Abweichungen werden fuer die laufende Browser-Sitzung in `sessionStorage.acAttributionShadowDiagnostics` gehalten.
- Diese Diagnose sendet nichts an Supabase, Meta, Mautic oder n8n und veraendert keine kanonische Attribution.

## Deploy-Reihenfolge

```text
npm test
npm run build
npm run verify
npm run lint
npm run smoke:readonly
npm run smoke:resume   # schreibt einen klar markierten Testkontakt
npm run guard:deploy
```

Build und Verify immer nacheinander ausfuehren. Der Build erstellt `dist/`; parallele Pruefungen koennen sonst unvollstaendige Dateien lesen.

Der eigentliche Produktions-Deploy (Coolify, manuell, `/health/live`-Nachweis) steht in
[../DEPLOYMENT_WORKFLOW.md](../DEPLOYMENT_WORKFLOW.md).
