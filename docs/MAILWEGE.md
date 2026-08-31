# Mailwege — wer verschickt welche Mail, worüber, und woran man das prüft

**Stand 28.08.2026, nachmittags. Alle Zahlen an diesem Tag gemessen**, nicht aus
Dokumentation übernommen. Zeiten sind MESZ.

Diese Seite existiert, weil der Mailweg des Funnels **nirgends zusammenhängend
aufgeschrieben war**. Am 28.08. dauerte die Frage „warum kommt keine Lead-Mail mehr" über
eine Stunde — nicht weil etwas kaputt war, sondern weil niemand sagen konnte, welche Mail
von wo kommt. Zwei falsche Zwischenergebnisse entstanden dabei, beide durch Raten statt
Messen. Die Fallen dazu stehen unten in §5.

---

## 1. Die fünf Mails des Funnels

| # | Mail | Auslöser | Empfänger | **Wer sendet** | Postmark-Server / Stream |
| --- | --- | --- | --- | --- | --- |
| 1 | „Neuer Erfolgs-Code von: *Name*" | Opt-in | **Berater des Slugs** | n8n `AC - Lead Post Processor` | Leadgen / `outbound` |
| 2 | „Dein Erfolgs-Code und dein Zugang" | Opt-in | der Lead | n8n `AC - Lead Post Processor` | Leadgen / `outbound` |
| 3 | „Hot Lead: *Name* hat alle 3 Videos angesehen" | Rang 3 erreicht | **Berater des Slugs** | **dieses Repo**, `api/lead-outbox-worker.js` | Leadgen / `outbound` |
| 4 | Nurture-Strecke („der Mechanismus", „wer dabei ist", …) | Cron alle 2 h | der Lead | n8n `AC - Quiz Nurture Email Sender` → **Mautic** | **Mautic** / `broadcast` |
| 5 | Störungsmails („Member-ID fehlt", „Points Result Update fehlgeschlagen") | Fehler | `IDENTITY_ALERT_EMAIL` | **dieses Repo**, `api/bridge.js` | Leadgen / `outbound` |

🔴 **Mail 1 und 2 kommen NICHT aus diesem Repo** und nicht synchron beim Absenden des
Formulars. Der Weg ist:

```text
Quiz-Submit
  → api/bridge.js  (action: 'forward_webhook', Ziel TYPEFORM_TARGET, api/bridge.js:69/4093)
  → https://contacts.hl-support.biz/webhook/typeform
  → schreibt in die Legacy-Kartei  prod_contacts_activesupport.typeform_surveys
  → [bis zu 5 Minuten Wartezeit]
  → n8n "AC - Lead Post Processor" (Schedule Trigger, alle 5 Minuten)
       liest typeform_surveys, legt Jobs in lead_processing_jobs an,
       holt den Resume-Token über  https://business.activecenter.info/api/bridge,
       legt/aktualisiert den Mautic-Kontakt,
       prüft die Adresse über  /api/validate-email  (ZeroBounce),
       verschickt Mail 2 (Lead) und Mail 1 (Berater) über Postmark
  → markiert den Job in MySQL als processed
```

**Daraus folgt der Verzögerungsabstand von 2–5 Minuten** zwischen Opt-in und Mail. Er ist
normal und kein Störungszeichen. Gemessen am 28.08.: 08:42→08:46 · 09:49→09:51 ·
09:53→09:56 · 10:38→10:41 · 13:46→13:51 · 13:53→13:56 · 14:19→14:21.

🔴 **Der gesamte Benachrichtigungsweg hängt damit an der Legacy-MySQL-Kartei**, nicht an
`hl_support`. Das ist für die Migration wesentlich: Entscheidung 3 in
[STAND-UND-FORTSETZUNG](STAND-UND-FORTSETZUNG.md) sieht die Outbox als **einzigen**
Übergabepunkt zur Kartei vor — dieser zweite Pfad ist dort noch nicht abgebildet.

---

## 2. Wer landet bei wem

Beide Berater-Mails (1 und 3) gehen an den **Berater des Slugs**, nicht pauschal an Markus.
Nur `markus` und `default` landen bei `info@global-sce.com`.

Das ist die häufigste Fehldeutung: „Ich bekomme keine Leads" heißt fast immer „mein
Anteil war heute klein", nicht „die Pipeline steht". Beispiel 28.08., sieben Opt-ins:

| Opt-in | Slug | Werbung | Benachrichtigung ging an |
| --- | --- | --- | --- |
| 08:42 | karin | – | karinlukasser22@gmail.com |
| 09:49 | karinpatscheider | – | Karin.mall72@gmail.com |
| **09:53** | **markus** | **ja** | **info@global-sce.com** |
| 10:38 | team24hfree | – | claudia.hoffman1995@gmail.com |
| 13:46 | karin | – | karinlukasser22@gmail.com |
| 13:53 | karin | – | karinlukasser22@gmail.com |
| **14:19** | **markus** | **ja** | **info@global-sce.com** |

Sieben echte Leads, davon **zwei** im eigenen Postfach — die gefühlte Lücke war
4 h 25 min, die tatsächliche Opt-in-Lücke 3,1 h (in 14 Tagen gab es 37 Pausen ≥ 3 h).

**Vor jeder Aussage über Leadmengen deshalb beide Zahlen getrennt nennen:** Opt-ins gesamt
**und** Opt-ins mit Slug `markus`/`default`.

---

## 3. Postmark-Landschaft (gemessen 28.08.2026)

| Server | ID | 30 Tage gesendet | Bounce | Streams genutzt | Rolle heute |
| --- | --- | --- | --- | --- | --- |
| **Leadgen** (bis 28.08. „Typenanalyse") | 10526929 | **837** | 0,87 % | nur `outbound` | de facto der Leadgen-Server |
| **Mautic** | 18375164 | 342 | 2,05 % | `broadcast` | Nurture-Strecke |
| Admin | 20229066 | 163 | 0,61 % | `outbound` | System-/GlitchTip-Mails |

Zusammensetzung „Leadgen", 30 Tage, 837 Mails:

| Anteil | Was |
| --- | --- |
| 352 | Opt-in-Benachrichtigung an den Berater |
| 350 | Zugangsmail an den Lead |
| 88 | Hot-Lead an den Berater |
| **47 (6 %)** | **Fremdverkehr**: Hetzner-Box-Angebote, Paperless-Belegfehler, n8n-Fehleralarme, Domain-Sweep, Points-Result-Alarme |

**790 von 837 Mails (94 %) sind dieses Projekt.** Der Server heißt nur nach einem Produkt,
das er nicht mehr bedient.

**Absender:** alle Mails gehen von `mail@mail.hl-support.biz` (DKIM ✅, Return-Path ✅), der
Anzeigename wechselt je Berater und Marke („Karin Lukasser - Activecenter",
„Claudia Bürki - EaglesFit", „Monika Pomarolli - Wellnesspoint", …).

🔴 **Offenes Loch:** Die Domain `activecenter.info` hat im Postmark-Konto **weder DKIM noch
Return-Path**, und `support@activecenter.info` ist als Einzelabsender **bestätigt**. Heute
wird die Adresse nicht benutzt — wer sie künftig einsetzt, sendet ohne DKIM. Entweder
DKIM einrichten oder die Signatur entfernen.

---

## 4. Tags

Bis zum 28.08.2026 trug **keine einzige** der 837 Mails einen Postmark-Tag. Deshalb musste
jede Auswertung Betreffzeilen zurückrechnen.

> 🔴 **Korrektur am 31.08.2026.** Diese Tabelle führte vier Tags als „im Repo gesetzt" —
> tatsächlich war nur `hot_lead` in Produktion. Die drei übrigen lagen auf einem
> Arbeitszweig; die Seite beschrieb einen Zustand, den es nicht gab. Beim Nachzählen der
> Nutzlasten fiel ausserdem eine **fünfte** Versandstelle auf, die ganz ohne Tag sendete
> und in keiner Aufstellung stand. Alle fünf sind seit PR #126 live, und ein Wächter hält
> den Stand fest, statt ihn zu dokumentieren: `scripts/tests/postmark-tags.test.js`.

Im Repo gesetzt — **alle fünf Postmark-Nutzlasten**, seit 31.08.2026 live:

| Tag | Wo gesetzt |
| --- | --- |
| `hot_lead` | `api/lead-outbox-worker.js`, `buildHotLeadEmail` |
| `hot_lead_legacy` | `api/bridge.js`, `notify_all_videos_completed` (toter Pfad, siehe §5) |
| `alert_missing_member_id` | `api/bridge.js`, `sendIdentityAlertEmail` |
| `alert_points_result_failed` | `api/bridge.js`, `sendPointsResultAlertEmail` |
| `alert_lead_system_health` | `api/lead-system-health.js` — **war bis 31.08. ohne Tag** |

In n8n gesetzt am 28.08.2026, 15:17 (neue `versionId`, Workflow blieb aktiv):

| Tag | Knoten in `AC - Lead Post Processor` |
| --- | --- |
| `optin_coach` | *HTTP - Postmark Send Coach Email* |
| `lead_access` | *HTTP - Postmark Send Lead Email* |

🔴 **Verfahren für n8n-Änderungen** (`agent-core/skills/n8n-workflow-update`): Definition
vorher sichern, **API-PUT** (nie SQL — n8n hält die Definition im RAM-Cache), danach muss
sich die `versionId` geändert haben.

Zwei Eigenheiten der n8n-API, die dabei Zeit kosten:

- `PUT /workflows/{id}` nimmt nur `name`, `nodes`, `connections`, `settings` —
  und **`settings` wird streng geprüft**: `binaryMode` und `timeSavedMode` werden mit
  `400 must NOT have additional properties` abgelehnt, `executionOrder`,
  `saveManualExecutions`, `callerPolicy`, `timezone` und `availableInMCP` gehen durch.
- **n8n ergänzt `settings`, es ersetzt sie nicht.** Ein PUT mit einer Teilmenge lässt die
  übrigen Schlüssel stehen — am 31.08.2026 **erneut bestätigt**: Ein PUT ohne
  `availableInMCP`, `binaryMode` und `timeSavedMode` liess alle drei unverändert stehen
  (danach ausgelesen). Wer eine Teilmenge sendet, verliert also nichts. Ein abgelehnter PUT (400) schreibt gar nichts und ist
  deshalb als gefahrlose Tastprobe brauchbar.

---

## 5. Fallen (jede hat am 28.08. Zeit gekostet)

1. **Der Postmark-Token verrät den Server nicht.** Im Container steht nur
   `POSTMARK_SERVER_TOKEN=0b661b…`. Welcher der zehn Server das ist, sagt niemand — man
   muss die Kontoliste ziehen und Token vergleichen.
2. **`HOT_LEAD_OUTBOX_EMAIL_ENABLED=1` steht nur in der Coolify-Umgebung.** Im Repo sieht
   der Hot-Lead-Pfad deshalb aus wie abgeschaltet (`api/lead-outbox-worker.js:862`,
   Ablehngrund `hot_lead_outbox_email_disabled_primary_mail_active`). Er ist **aktiv**.
3. **Zwei Ereignisnamen, einer davon tot.** `hot_lead_coach_email_sent` ist der **lebende**
   Weg (228 Ereignisse, täglich). `video_all_completed_coach_email_sent` ist **tot seit
   10.05.2026** (7 Ereignisse) — steht aber prominent in `api/bridge.js:3933` und verleitet
   dazu, den falschen zu zählen.
4. **Die Opt-in-Mail hinterlässt kein Ereignis in der Datenbank.** Ob sie rausging, beweist
   **nur** Postmark. `lead_events` hilft hier nicht.
5. **Postmark-API:** `count` **und** `offset` sind bei `/servers` und
   `/messages/outbound` beide Pflicht — fehlt `offset`, kommt `422` mit `ErrorCode 600`.
   Zeitstempel liefert die API in **EDT (`-04:00`)**: MESZ = +6 Stunden.
6. **Nicht im Repo suchen.** Mail 1, 2 und 4 liegen ausschliesslich in n8n. Wer nur den
   Repo-Code liest, kommt zum falschen Schluss „die Mail kommt nicht von hier" — und
   übersieht dabei, dass Mail 3 und 5 sehr wohl von hier kommen.
7. **„Gesendet" in unserer Datenbank beweist keine Zustellung.** Postmark lehnt gesperrte
   Empfänger mit `406` ab; Mautic meldet den Aufruf trotzdem als Erfolg, und der Sender
   verbucht `nurture_sent` samt `ac_nurture_sent_phases`. Gemessen am 30.08.2026: **24
   Mails an 12 Adressen** so verbucht, keine einzige zugestellt — und weil die Phase als
   gesendet gilt, wird sie **nie wiederholt**. Gegenmittel siehe §8.

---

## 5a. Sperrliste: Postmark → Mautic (seit 30.08.2026)

Postmark führt je Server eine Sperrliste (Hardbounce, Spambeschwerde, manuelle Sperre).
Weder Mautic noch der Nurture-Sender kannten sie. Der Workflow
**`AC - Postmark-Sperren nach Mautic spiegeln`** (`HmLGMm2H7Brxl8CK`, täglich 05:15)
schliesst das: Er liest beide Ströme des Postmark-Servers `Mautic` (18375164) und setzt
für jeden passenden Mautic-Kontakt `DNC email, reason 2` mit dem Kommentar
`Postmark-Sperre (<Grund>, Strom <Strom>) automatisch gespiegelt`.

🔴 **Das Sicherheitsnetz im Knoten `Code - Entscheiden`:** gesperrt wird **nur**, wenn die
*aktuelle* Adresse des Kontakts genau die gesperrte ist. Wird ein Tippfehler später
korrigiert, greift die alte Sperre nicht mehr — genau dieser Fall wäre am 29.08. bei
Christine und am 30.08. bei drei weiteren Menschen eingetreten.

🔴 **Was er NICHT tut:** Er hebt keine Sperre wieder auf. Wird eine Adresse korrigiert oder
bei Postmark reaktiviert, muss der DNC-Eintrag **von Hand** entfernt werden
(`DELETE /api/contacts/<id>/dnc/email/delete`). Ein leerer Abruf gilt als Fehler und bricht
laut ab, statt still nichts zu tun.

Erster scharfer Lauf am 30.08.2026: 13 Sperren geprüft, 6 neu gesetzt, 3 bereits gesperrt,
4 ohne Mautic-Kontakt. Zweiter Lauf: 0 neu — der Spiegel arbeitet wiederholbar.

---

## 6. Beschlossenes Zielbild (Entscheidung Markus, 28.08.2026)

**Nicht neu bauen — umwidmen.** Ein neuer Postmark-Server hiesse frische Reputation und
Token-Wechsel an drei Stellen, ohne Gewinn gegenüber dem, was schon da ist.

| Schritt | Was | Wirkung |
| --- | --- | --- |
| 1 | ✅ **erledigt 28.08.** Server `Typenanalyse` → `Leadgen` umbenannt | Token, Reputation und Historie unverändert nachgemessen |
| 2 | Die 47 Fremdmails (6 %) auf den vorhandenen Server **`Admin`** umziehen | Leadgen-Statistik wird sauber |
| 3 | ✅ **erledigt 28.08.** Tags in den beiden n8n-Postmark-Knoten gesetzt (§4) | Mailtypen sind in Postmark direkt messbar |
| 4 | `activecenter.info`: DKIM/Return-Path einrichten **oder** Signatur entfernen | kein Weg ohne DKIM mehr offen |
| 5 | Nurture später als `broadcast`-Stream auf `Leadgen` holen | ein Server je System — Streams halten Transaktional und Broadcast getrennt |

🔴 **Reihenfolge:** Schritt 5 setzt voraus, dass die Nurture-Strecke ruhig läuft. Sie
sendet über **Mautic** (`mautic.hl-support.biz/api/emails/…/send`), nicht direkt über
n8n — der Serverwechsel ist dort also eine **Mautic**-Einstellung, keine n8n-Änderung.

Nicht am selben Tag wie andere Eingriffe in den Versandweg. Zwei Änderungen gleichzeitig
an einem Pfad ist die Fehlerklasse, die dieses Projekt schon dreimal getroffen hat.

---

## 7. Wie man den Mailweg prüft

**Ist eine Lead-Mail rausgegangen?** Nur Postmark beweist das:

```bash
# Server-Liste (count UND offset sind Pflicht)
curl -s -H "X-Postmark-Account-Token: <postmark.accountToken>" \
  "https://api.postmarkapp.com/servers?count=50&offset=0"

# Mails eines Servers (Zeiten in EDT, MESZ = +6 h)
curl -s -H "X-Postmark-Server-Token: <Token des Servers>" \
  "https://api.postmarkapp.com/messages/outbound?count=100&offset=0&fromdate=2026-08-28&todate=2026-08-29"
```

**Läuft der Post-Processor?** Er muss alle 5 Minuten `success` melden; ein Lauf mit Versand
dauert spürbar länger als die Leerläufe (7 s gegen 2–3 s):

```bash
curl -s -H "X-N8N-API-KEY: <n8n.apiKey>" \
  "https://n8n.hl-support.biz/api/v1/executions?workflowId=9RZdrLxfA8IRhd55&limit=12"
```

**Welche Workflows gehören dazu:**

| Workflow | ID | Takt |
| --- | --- | --- |
| AC - Lead Post Processor | `9RZdrLxfA8IRhd55` | alle 5 Minuten |
| AC - Lead Sync Outbox Worker | `ALLHYLRwkvujkuFJ` | jede Minute |
| AC - Quiz Nurture Email Sender | `RqKSRTgFv8mv04H2` | alle 2 Stunden |
| AC - Lead System Health Monitor | `m52uJBbSQUFUA2Dm` | alle 15 Minuten |
| AC - Quiz Reactivation Trigger | `XfefeLNF1DYJPGc8` | Webhook |

🔴 **Korrektur zur bisherigen Dokumentation:** `AC - Quiz Nurture Email Sender` läuft
**bereits auf der Plattform-DB**. Die Knoten heissen noch „Supabase - …", die
Zugangsdaten sind aber «Plattform-DB leads_n8n (hl_support)» und das SQL greift auf
`leads.lead_events` und `leads.record_nurture_sent`. Letzter Lauf am 28.08. um 14:00
(179 s). Commit `4d72f7c` und
[STAND-UND-FORTSETZUNG §8b Punkt 7](STAND-UND-FORTSETZUNG.md) sagen „umgebaut, noch NICHT
aktiviert" — das ist überholt.
