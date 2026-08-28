# Nurture — die zweite Hälfte desselben Systems

**Hierher gezogen am 28.08.2026** aus `activecenter-web/Leads_quiz_Nurture`. Dieses
Verzeichnis war **kein Git-Repository** — 137 Dateien ohne jede Versionierung, darunter die
Quelltexte von 81 E-Mails. Seine eigene README sagte es: *„was hier steht, überlebt kein
Versehen."* Jetzt überlebt es.

## Warum das hier liegt und nicht daneben

Es ist **ein** System, keine zwei: Leads erzeugen und Leads betreuen, auf denselben Daten.
Die Trennung war eine Ordner-Entscheidung, und sie war schon vorher gebrochen —

- die kanonischen Betriebsregeln liegen längst hier (`docs/NURTURE_BETRIEB.md`),
- der Wächter, der den Nurture-Versand überwacht, liegt hier (`scripts/waechter-nurture.js`),
- der Nurture-Sender liest `leads.lead_events` und `leads.record_nurture_sent` — **das
  Schema dieses Projekts**.

## Was wo liegt

| Ordner | Inhalt |
| --- | --- |
| `inhalte/` | die humanisierten Master-Texte (Phasen A–D, Evergreen, EN, IT) — **Quelle** für Mautic |
| `vorlagen/` | Rohtexte vor der Humanisierung (DE/EN/IT) |
| `mautic-setup/` | einmaliges Setup: Custom Fields, Segmente, Kampagnen |
| `workflows/` | n8n-JSONs, wie sie im alten Ordner lagen (Stand unklar — siehe `../n8n/`) |
| `quellen/` | die drei Video-Transkripte, aus denen die Texte entstanden |
| `skripte/` | `upload_humanized.py` lädt alle Templates nach Mautic |
| `docs/` | Workflow-Beschreibung, Impact-Tracking-Plan, die alten AGENTS-/master_prompt-Dateien |
| `review-app/` | Next.js-App zur Textdurchsicht — lief auf Vercel, **Ziel: Coolify** |

🔴 **Aktuelle n8n-Definitionen stehen in [`../n8n/export-2026-08-28/`](../n8n/export-2026-08-28/)** —
frisch aus der laufenden Instanz gezogen. Die JSONs in `workflows/` sind älter und nicht
verifiziert; im Zweifel gilt der Export.

## Betrieb

🔴 **Die Betriebsregeln stehen in [`../docs/NURTURE_BETRIEB.md`](../docs/NURTURE_BETRIEB.md)**,
der Mailweg in [`../docs/MAILWEGE.md`](../docs/MAILWEGE.md). Kurz, damit man es hier nicht
übersieht:

- `nurture_runs.sent_count` steht **strukturell auf 0** und ist unbrauchbar. Echte Zahlen:
  Sicht `v_nurture_runs_wahr`, Spalte `gesendet_wahr`.
- Der Versand ist **fail-closed** an die MySQL-Kontaktkartei gebunden: nicht erreichbar =
  kein Versand.
- **ID 48 (E1) niemals anfassen** — permanent deaktiviert.
- **Email 0 bleibt in n8n/Postmark** — nicht hier.
- Aktiver Versand: `AC - Quiz Nurture Email Sender` (`RqKSRTgFv8mv04H2`), Cron alle 2 h.
  Der alte segmentbasierte `Quiz Video Inactivity Checker` ist **Archiv** und darf nicht
  aktiviert werden.
- Profil-Labels in den Texten: **Macher / Netzwerker / Anker / Architekt** (nicht
  Feuer/Wind/Wasser/Fels).
- Nach Änderungen an `inhalte/`: `python skripte/upload_humanized.py`.

**Wo es läuft** (alles auf eigener Hetzner-Infrastruktur, gemessen 28.08.2026):

| | |
| --- | --- |
| Versand-Workflow | n8n, `46.224.76.193` — liest die **Plattform-DB** `hl_support`, Schema `leads` |
| Mailversand | Mautic, `46.224.76.193` → Postmark-Server **`Leadgen`**, Stream `broadcast` |
| Wächter | `167.233.251.217`, stündlich zur Minute 37 |

## 🔴 Offene Punkte aus dem Zusammenzug

1. **Drei OneDrive-Konfliktkopien** liegen unaufgelöst in `review-app/_konflikte-onedrive/`.
   Sie sind **nicht einheitlich** — bei einer Datei ist die normale Fassung neuer, bei einer
   anderen die Konfliktkopie:

   | Datei | normale Fassung | Konfliktkopie |
   | --- | --- | --- |
   | `app/page.js` | 23.06. 11:14 · 23.680 B | 18.06. 17:45 · 21.039 B |
   | `app/info/page.js` | 15.05. 16:22 · 16.990 B | **29.05. 15:14** · 17.117 B ← neuer |
   | `skripte/upload_humanized.py` | 23.06. 11:10 · 13.700 B | 18.06. 17:26 · 12.432 B |

   Übernommen wurde jeweils die normal benannte Datei. **Vor dem Neudeploy der Review-App
   muss `app/info/page.js` geprüft werden** — dort ist womöglich die falsche Fassung aktiv.
   Die Wahrheit steht bis dahin in der laufenden Vercel-Auslieferung.

2. **Die `.vercel`-Projektbindung der Review-App ist bewusst NICHT mitgekommen**
   (`prj_msoMYiNrOSKSp5WJmIcJ0sGQBJ9y`, Projekt `ac-email-review`). Ein `vercel deploy`
   aus einer Arbeitskopie hätte sonst wieder eine Produktion überschreiben können.
   `scripts/tests/removed-runtime-surface.test.js` prüft das jetzt im **gesamten** Baum,
   nicht mehr nur in der Wurzel.

3. **Die Review-App läuft noch auf Vercel** (`ac-email-review.vercel.app`) und ist damit
   die letzte Vercel-Abhängigkeit des Nurture-Systems. Umzug auf Coolify steht aus.

4. 🔴 **SICHERHEITSBEFUND vom 28.08.2026 — die Review-App ist ungeschützt schreibfähig.**

   `app/api/email/[id]/route.js` bietet **GET und PATCH** auf die Mautic-Vorlagen, mit
   dem Mautic-**admin**-Konto (`Basic admin:$MAUTIC_PASS`). Es gibt **keine**
   Zugangsprüfung: keine `middleware.js`, kein Session-Check, kein Token — nachgemessen
   im gesamten `app/`-Verzeichnis.

   Am Live-Stand belegt (nur **lesend** geprüft, kein Schreibversuch):

   ```
   GET https://ac-email-review.vercel.app/api/email/48  ->  HTTP 200 + Inhalt der Vorlage
   Startseite: kein Login, kein SSO
   ```

   Damit kann **jeder, der die URL kennt, die laufenden Nurture-Vorlagen überschreiben** —
   `PATCH` liegt in derselben Datei und ist genauso ungeschützt. Ausgerechnet ID 48 ist
   die Vorlage, die laut Betriebsregel „niemals angefasst" werden darf.

   🔴 **Diese App darf NICHT unverändert auf Coolify ausgerollt werden.** Vorher:
   Zugangsschutz einbauen (mindestens Basic-Auth über eine `middleware.js`, besser eine
   nicht öffentlich geratene Adresse plus Schutz), und `MAUTIC_PASS` gehört rotiert,
   sobald der Weg zu ist. Bis dahin ist das Sinnvollste, die Vercel-Auslieferung zu
   **pausieren** — das kostet nichts und ist umkehrbar.

## Was NICHT mitgezogen ist

- `node_modules/` und `.next/` der Review-App (285 MB Bauschutt gegen 667 KB Inhalt)
- **Mautic selbst.** Es bleibt ein eigenes System auf `46.224.76.193`. Zur Laufzeit leben
  die 81 Templates **dort**; dieses Verzeichnis hält die Quelltexte.
