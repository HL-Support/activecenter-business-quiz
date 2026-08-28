# Plan: Benachrichtigungsweg von der Legacy-MySQL auf die Plattform holen

**Angelegt 28.08.2026.** Auslöser: Entscheidung Markus — „das mit der Bridge musst du
korrigieren und schauen, dass es wirklich in unser neues System geht, nach unseren klaren
Benachrichtigungswegen. Keine halben Lösungen."

Grundlage: [../MAILWEGE.md](../MAILWEGE.md) (die gemessene Karte). Alle Zahlen hier sind am
28.08.2026 gemessen.

---

## 1. Warum das weg muss

Der Opt-in-Weg läuft heute so:

```text
Submit → api/bridge.js (forward_webhook) → contacts.hl-support.biz/webhook/typeform
       → MySQL prod_contacts_activesupport.typeform_surveys
       → [5-Minuten-Poll] n8n "AC - Lead Post Processor" (9RZdrLxfA8IRhd55)
       → Mautic-Upsert · ZeroBounce · 2 Postmark-Mails · Job in MySQL abhaken
```

Vier Gründe, warum das nicht bleiben kann:

1. **Es widerspricht Entscheidung 3** aus [../STAND-UND-FORTSETZUNG.md](../STAND-UND-FORTSETZUNG.md):
   die Outbox sollte der **einzige** Übergabepunkt zur Legacy-Kartei sein. Hier ist ein
   zweiter, und er trägt den wichtigsten Vorgang des Funnels.
2. **Der Cutover hat ihn nicht erfasst.** Die Leads liegen in `hl_support`, die
   Benachrichtigung hängt an MySQL. Zwei Wahrheiten über denselben Vorgang.
3. **Er ist im Repo unsichtbar.** Am 28.08. hat die Frage „warum kommt keine Mail" über
   eine Stunde gedauert, weil der Weg nirgends stand. Zwei falsche Zwischenergebnisse
   entstanden dabei.
4. **5 Minuten Verzögerung** sind bei einem Werbeklick, der 3–5 € gekostet hat, kein
   Detail.

## 2. Zielbild

Genau das Muster, das für die **Hot-Lead-Mail schon funktioniert**: die Anwendung stellt
beim Opt-in einen Auftrag in `leads.lead_sync_outbox`, der Worker in
`api/lead-outbox-worker.js` arbeitet ihn ab und verschickt über Postmark.

| | heute | Ziel |
| --- | --- | --- |
| Auslöser | 5-Minuten-Poll auf MySQL | Outbox-Auftrag beim Opt-in |
| Quelle der Daten | `typeform_surveys` (MySQL) | `leads.lead_state` / `lead_answers_current` |
| Absendender Code | n8n-Knoten | `api/lead-outbox-worker.js` (versioniert, getestet) |
| Verzögerung | bis 5 Minuten | Sekunden (Worker läuft im Minutentakt) |
| Sichtbarkeit | keine | Tests, CI, Tags, `MAILWEGE.md` |

Neue Auftragsarten: `coach_optin_email` und `lead_access_email`, analog zum bestehenden
`coach_hot_lead_email` (`SUPPORTED_SYNC_TYPES` in `api/lead-outbox-worker.js:40`).

## 3. 🔴 Was daran NICHT klein ist — gemessen, nicht geschätzt

Das ist der Grund, warum dieser Umbau **nicht** in einem Zug erledigt wurde:

| Hindernis | Messung |
| --- | --- |
| **Die Mailtexte liegen in einer riesigen JS-Bibliothek** | **269.994 Zeichen** JS im Workflow, davon **je ~87.000 dreifach kopiert** in `Code - Normalize Candidate Rows`, `Code - Build Lead Model`, `Code - Apply Resume Link` |
| **Vier Sprachen** | `de`/`it`/`en`/`hu` in denselben Knoten verwoben (Betreff, HTML, Text, Profil- und Zielnamen) |
| **Die Berateridentität kommt aus der Legacy-Bridge** | `lookupCoach()` fragt `BRIDGE_URL` (`origin-reconnect.ac-reconnect.com/db-bridge.php`). Auch der „saubere" Weg bleibt davon abhängig, bis die Kontakte-Migration läuft |
| **Der Mautic-Teil ist Vorbedingung der Nurture-Strecke** | Der Post Processor legt den Mautic-Kontakt an und setzt das Segment. Wer nur die Mails herauslöst, muss den MySQL-Poll für Mautic stehen lassen |

**Konsequenz:** Der Umbau ist ein Port von rund 87.000 Zeichen Vorlagenlogik plus eine
Ablösung der Mautic-Anbindung. Das ist mehrere Arbeitssitzungen groß — und es ist der
Pfad, über den **jede** Lead-Mail läuft. Ein Schnellschuss darauf wäre genau die halbe
Lösung, die hier niemand will.

## 4. Schritte, jeder mit eigenem Beweis

| # | Schritt | Beweis, bevor es weitergeht |
| --- | --- | --- |
| 1 | **Bibliothek extrahieren**: die drei Kopien aus n8n ziehen, diffen, die *eine* echte Fassung feststellen | Die drei Kopien sind zeichengleich — oder die Abweichungen sind benannt |
| 2 | **Vorlagen ins Repo portieren** (`server/mail-vorlagen/`), vier Sprachen, mit Golden-Tests gegen die real versendeten Mails aus Postmark | Für je einen echten Lead je Sprache: erzeugte Mail == versendete Mail, Zeichen für Zeichen |
| 3 | **Outbox-Arten ergänzen** (`coach_optin_email`, `lead_access_email`), Versand **hinter einem Schalter** (`OPTIN_OUTBOX_EMAIL_ENABLED`, Standard aus) | Regressionstests grün; bei Schalter aus verhält sich das System exakt wie heute |
| 4 | **Schattenlauf**: Aufträge werden erzeugt und abgearbeitet, aber statt zu senden nur protokolliert | Über 48 h: für **jeden** Opt-in genau ein Auftrag je Art, kein Doppel, keine Lücke — gegen die tatsächlich versendeten Postmark-Mails abgeglichen |
| 5 | **Umschalten**: Schalter an, dieselbe Stunde die beiden Postmark-Knoten im Post Processor abschalten | Nächster echter Opt-in: Mail da, Tag `optin_coach`/`lead_access`, Inhalt identisch zur Vorwoche, Abstand jetzt Sekunden statt Minuten |
| 6 | **Mautic ablösen**: Kontakt-Upsert und Segment aus der Outbox heraus | Nurture-Strecke sendet für einen neuen Lead unverändert weiter |
| 7 | **Post Processor stilllegen**, MySQL-Poll entfällt | 7 Tage ohne Fehl-Lauf, dann Entscheidung-3-Konflikt geschlossen |

🔴 **Reihenfolge ist nicht verhandelbar.** Schritt 5 vor Schritt 4 hiesse, den teuersten
Vorgang des Funnels ohne Netz umzuhängen.

## 5. Rückweg

Bis Schritt 7 bleibt der alte Weg vollständig vorhanden. Rückweg ist immer:
`OPTIN_OUTBOX_EMAIL_ENABLED` auf 0 und die zwei Postmark-Knoten im Post Processor wieder
aktivieren. Sicherung der Workflow-Definition vor jeder Änderung ist Pflicht
(Verfahren: `agent-core/skills/n8n-workflow-update` — Definition sichern, **API-PUT**, nie
per SQL, `versionId` muss sich ändern).

**Doppelversand ist die einzige wirklich teure Fehlerwirkung** dieses Umbaus: Wenn beide
Wege gleichzeitig senden, bekommt jeder Lead alles doppelt. Deshalb ist Schritt 5 als
*eine* Handlung formuliert — Schalter an **und** Knoten aus in derselben Stunde.

## 6. Was am 28.08.2026 bereits erledigt ist

- Der Weg ist gemessen und aufgeschrieben: [../MAILWEGE.md](../MAILWEGE.md)
- Postmark-Server `Typenanalyse` → **`Leadgen`** umbenannt (Token, Reputation und
  Historie unverändert; ID 10526929)
- **Tags** gesetzt: `hot_lead`, `hot_lead_legacy`, `alert_missing_member_id`,
  `alert_points_result_failed` im Repo; `optin_coach` und `lead_access` in den beiden
  Postmark-Knoten des Post Processors (neue `versionId`, Workflow aktiv geblieben)
- Doku-Korrektur: der Nurture-Sender läuft **bereits** auf der Plattform-DB

## 7. Was ausdrücklich offen ist

- Schritte 1–7 dieses Plans
- Die 47 Fremdmails (6 % des Leadgen-Servers: Hetzner-Angebote, Paperless, Domain-Sweep,
  n8n-Fehleralarme) gehören auf den Server `Admin` — kostenlos, aber ein eigener Handgriff
- `activecenter.info` hat **kein** DKIM und **keinen** Return-Path. Es sendet heute nichts
  von dort, die bestätigte Signatur `support@activecenter.info` bleibt aber eine geladene
  Waffe. Entweder DKIM einrichten oder die Signatur entfernen
- Die Nurture-Strecke läuft über **Mautic** auf den Postmark-Server `Mautic`
  (Bounce 2,05 % — der höchste im Konto). Zusammenlegen auf `Leadgen` als
  `broadcast`-Stream ist eine **Mautic**-Einstellung, keine n8n-Änderung
