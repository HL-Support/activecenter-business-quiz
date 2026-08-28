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

1. ~~Drei OneDrive-Konfliktkopien~~ → ✅ **aufgelöst am 28.08.2026 — am laufenden System
   geprüft, nicht geraten.** Übernommen wurde in allen drei Fällen die normal benannte
   Datei; der Ordner `_konflikte-onedrive/` ist entfernt, sein Inhalt bleibt in der
   Git-Historie.

   | Datei | Befund am laufenden System | |
   | --- | --- | --- |
   | `app/info/page.js` | Die Live-Auslieferung trägt „82 Templates" und „Testimonial-Email" — **nicht** „84 Templates" und „95–97" der Konfliktkopie. Zählverhältnis sauber 1:2, weil Next.js den Inhalt zweimal einbettet (SSR-HTML + RSC-Nutzlast) | übernommene Fassung ist die ausgelieferte ✅ |
   | `app/page.js` | Die Konfliktkopie ist **zeichensatzkaputt** — `âœ‰` und `ðŸ”¥` statt `✉` und `🔥`, also UTF-8 als Latin-1 gelesen. Live steht die korrekte Fassung | übernommene Fassung richtig ✅ |
   | `skripte/upload_humanized.py` | Die Konfliktkopie ist älter und kennt die Aspiration-Akzente nicht | übernommene Fassung richtig ✅ |

   🔴 Die Lehre: Das **Dateidatum** hätte in einem der drei Fälle zur falschen Wahl
   geführt — die Konfliktkopie von `app/info/page.js` ist zwei Wochen **neuer** und war
   trotzdem nie ausgeliefert. Entschieden hat das laufende System, nicht der Zeitstempel.

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

   ✅ **Behoben im Code am 28.08.2026**: `middleware.js` schützt die App per Basic-Auth,
   `lib/zugang.js` enthält die Prüfung, `scripts/tests/review-app-zugang.test.js` hält sie
   fest (7 Tests). Zwei Entwurfsentscheidungen:

   - **Fail-closed.** Ohne gesetztes `REVIEW_PASS` ist **alles** zu (HTTP 503), nicht
     offen. Der übliche Fehler ist das Gegenteil — „kein Passwort gesetzt, also nicht
     prüfen" — und dann steht die Tür nach einem vergessenen Umgebungswert wieder offen,
     ohne dass es jemand merkt.
   - **Der Matcher schliesst `/api/` ausdrücklich ein.** Der Schaden lag nicht auf der
     Seite, sondern in der API-Route mit dem schreibenden `PATCH`. Ein Test prüft, dass
     `/api` nicht aus dem Matcher fällt, ein zweiter, dass die Middleware überhaupt noch
     existiert, solange die Route ein `PATCH` hat.

   🔴 **Der Code-Fix schützt die laufende Vercel-Auslieferung NICHT.** Die läuft aus dem
   alten Stand weiter; `GET /api/email/48` antwortet dort bis auf Weiteres mit HTTP 200.
   Zu ist das Loch erst, wenn die Auslieferung **pausiert** oder die App mit
   `REVIEW_PASS` neu ausgerollt wird. Danach gehört `MAUTIC_PASS` rotiert — es lag
   hinter einer offenen Tür.

   **Benötigte Umgebungswerte beim Ausrollen:**

   | Wert | Pflicht | Bedeutung |
   | --- | --- | --- |
   | `REVIEW_PASS` | **ja** — ohne ihn bleibt die App zu | Passwort für den Zugang |
   | `REVIEW_USER` | nein | Benutzername, Standard `review` |
   | `MAUTIC_PASS` | ja | Mautic-`admin`-Passwort für die API |
   | `MAUTIC_BASE` | nein | Standard `https://mautic.hl-support.biz` |

5. 🔴 **Klartext-Passwort beim Zusammenzug mitgekommen — Mautic-`admin` gehört rotiert.**

   In drei Python-Dateien stand das Mautic-`admin`-Passwort hartkodiert
   (`base64.b64encode(b'admin:…')`). Beim Verschieben ist es damit ins Repo und **nach
   GitHub** gelangt. Die n8n-Exporte waren auf Geheimnisse geprüft, der Nurture-Ordner
   nicht — das war ein Fehler in meiner Prüfreihenfolge.

   ✅ **Behoben:** `upload_humanized.py` und `update_emails_v1_legacy.py` lesen jetzt
   `MAUTIC_USER` und `MAUTIC_PASS` aus der Umgebung und brechen **fail-closed** ab, wenn
   `MAUTIC_PASS` fehlt. An der **Ausführung** geprüft, nicht nur am Text — und genau das
   war nötig: Der erste Versuch brach mit `NameError: name 'os' is not defined` ab, weil
   `import os` auf Zeile 220 statt am Dateikopf landete. Eine Textsuche hätte den Import
   gefunden und „passt" gemeldet.

   🔴 **Das Entfernen aus dem Arbeitsbaum nimmt es nicht aus der Historie.** Es ist
   dasselbe Passwort, das hinter der ungeschützten Review-App lag (Punkt 4) — es gehört
   aus **zwei** Gründen rotiert. Danach `MAUTIC_PASS` in Coolify und in
   `agent-secrets.json` nachziehen.

## Was NICHT mitgezogen ist

- `node_modules/` und `.next/` der Review-App (285 MB Bauschutt gegen 667 KB Inhalt)
- **Mautic selbst.** Es bleibt ein eigenes System auf `46.224.76.193`. Zur Laufzeit leben
  die 81 Templates **dort**; dieses Verzeichnis hält die Quelltexte.
