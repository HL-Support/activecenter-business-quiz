# Leads Quiz Nurture System

Alles zum automatisierten E-Mail-Nurture-System für das Business Quiz.

**Master-Dokumentation:** `C:\Users\Markus\.claude\projects\d--OneDrive-Antigravity-Laptop-activecenter-web\memory\nurture_master_documentation.md`  
**Review App (live):** https://ac-email-review.vercel.app/  
**Mautic:** https://mautic.hl-support.biz (admin)  
**Status:** 81 DE-Templates deployed, Kampagnen unpublished (ready to activate)

## Ordnerstruktur

```
Leads_quiz_Nurture/
├── email-content/          ← Humanisierte Master-Texte (Quelldateien für Mautic)
│   ├── humanized_phase_a.txt   (Phase A, 18 Emails)
│   ├── humanized_phase_b.txt   (Phase B, 18 Emails)
│   ├── humanized_phase_c.txt   (Phase C, 15 Emails)
│   ├── humanized_phase_d.txt   (Phase D, 15 Emails)
│   └── humanized_evergreen.txt (Evergreen + Reactivation, 15 Emails)
│
├── email-templates/        ← Markdown-Vorlagen (Rohtexte vor Humanisierung)
│   ├── nurture-email-templates-de.md
│   ├── nurture-email-templates-en.md
│   └── nurture-email-templates-it.md
│
├── scripts/
│   ├── upload_humanized.py         ← Alle 81 Templates in Mautic hochladen
│   └── update_emails_v1_legacy.py  ← Alte Version (nur zur Referenz)
│
├── workflows/              ← n8n Workflow-JSONs (deployen via n8n API)
│   ├── quiz-video-inactivity-checker.workflow.json
│   ├── quiz-evergreen-scheduler.workflow.json
│   ├── quiz-reactivation-trigger.workflow.json
│   └── quiz-nightly-data-sync.workflow.json
│
├── mautic-setup/           ← Einmaliges Setup: Custom Fields, Segmente, Kampagnen
│   ├── setup-mautic-business-leads-quiz.js
│   └── mautic-business-leads-quiz-setup.md
│
└── review-app/             ← Next.js App (deployed: ac-email-review.vercel.app)
    ├── app/
    └── package.json
```

## Wichtigste Regeln

- **ID 48 (E1) niemals anfassen** — permanent deaktiviert
- **Email 0** bleibt in n8n/Postmark — nicht hier
- **Aktiver Nurture-Versand:** `AC - Quiz Nurture Email Sender` (`RqKSRTgFv8mv04H2`) sendet direkt. Der alte segmentbasierte `Quiz Video Inactivity Checker` ist Archiv und darf nicht aktiviert werden.
- **Profil-Labels in Texten:** Macher / Netzwerker / Anker / Architekt (nicht Feuer/Wind/Wasser/Fels)
- **Re-Upload nach Content-Änderung:** `python scripts/upload_humanized.py`

## 🔴 Betrieb

**Die Betriebsregeln stehen versioniert im Quiz-Repo:**
`business_leads_quiz/docs/NURTURE_BETRIEB.md`

Dieses Verzeichnis ist **kein Git-Repository** — was hier steht, ueberlebt kein Versehen.
Deshalb liegt die kanonische Fassung dort.

Kurz, damit man es hier nicht uebersieht:

- `nurture_runs.sent_count` steht **strukturell auf 0** und ist unbrauchbar. Echte Zahlen:
  Sicht `public.v_nurture_runs_wahr`.
- PostgREST deckelt Leseabfragen bei **1000 Zeilen**; `limit=` und `Range` sind Wuensche,
  keine Zusagen. Beide Abfragen des Versands blaettern deshalb.
- Der Versand ist **fail-closed** an die MySQL-Kontaktkartei gebunden: Ist sie nicht
  erreichbar, wird nicht versendet.
- Ein **Waechter** laeuft stuendlich auf `167.233.251.217` und misst das Ergebnis, nicht
  den Vorgang.

Anlass: Am 26.08.2026 kam heraus, dass der Versand drei Wochen lang keinen neuen Kontakt
angeschrieben hatte - 186 Menschen -, waehrend der Workflow zwoelfmal taeglich `success`
meldete.
