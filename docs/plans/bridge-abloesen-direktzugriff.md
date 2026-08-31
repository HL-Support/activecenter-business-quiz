# Die Bridge im Quiz ablösen — nach dem Vorbild von `analysen` und `Umfragen`

**Aufgestellt am 31.08.2026** auf Anweisung von Markus, **überarbeitet am selben Tag** nach
der Detailanalyse der beiden Nachbarprojekte.

> **Abgrenzung:** Die **landing-page behält die Bridge** — sie ist nicht migriert.
> `db-bridge.php` wird nicht angefasst; sie bedient laut Quelltextkommentar **15 weitere
> Projekte**. Dieses Dokument betrifft ausschliesslich `business_leads_quiz`.
>
> **Es ist bisher nichts geändert worden.** Dieses Dokument ist Inventur und Plan.

Alle Angaben sind am 31.08.2026 am Quelltext und am laufenden System **gemessen**. Wo etwas
nur in Dokumentation behauptet und nicht im Quelltext belegt ist, steht es ausdrücklich dabei.

---

## 1. Inventur — wofür das Quiz die Bridge noch benutzt

Der Bridge-Vertrag (`scripts/lib/bridge-contracts.js`) führt **14 Aktionen**. Tatsächlich
an die Legacy-Bridge weitergereicht werden **zwei**, an **sechs Aufrufstellen**:

| # | Aktion | Aufrufstelle | Wann | Was es wirklich tut |
| --- | --- | --- | --- | --- |
| 1 | `lookup_subdomain` | `api/bridge.js:429` `resolveConsultantLookup` | **jeder Seitenaufruf** (Browser → `src/lib/core.js:829`) | MySQL-**Lesen**: `users` ⋈ `organizations` |
| 2 | `lookup_subdomain` | `api/bridge.js:2237` `ensureBusinessSubmissionIdentity` | Absenden ohne `member_id` | dasselbe Lesen |
| 3 | `lookup_subdomain` | `api/bridge.js:3100` `loadCompletionNotificationContext` | `notify_all_videos_completed` | dasselbe Lesen |
| 4 | `lookup_subdomain` | `api/lead-outbox-worker.js:683` | jede Hot-Lead-Mail | dasselbe Lesen — B-Reihe |
| 5 | `forward_webhook` | `api/bridge.js:4094` (im Typeform-Adapter) | Opt-in | 🔴 **kein MySQL** — HTTP-Weiterleitung |
| 6 | `forward_webhook` | `api/bridge.js:4199` | Opt-in | 🔴 **kein MySQL** — HTTP-Weiterleitung |

**Vier Lesestellen für dieselbe Information** und zwei Weiterleitungen, die mit MySQL
nichts zu tun haben.

**Was längst nicht mehr über die Bridge läuft:** die anderen zwölf Vertragsaktionen
(`track_event`, `write_analytics*`, Resume-Token, Metriken …) werden lokal beantwortet und
gehen über `writeToSupabaseAsync` → `writeTrackingEvent`/`upsertLeadProfile` gegen die
**Plattform-Postgres**. `readMysqlTable()` (`api/bridge.js:385`) ist **toter Code**:
`HBA_READ_BRIDGE_URL` ist im Container nicht gesetzt (Env am 31.08. ausgelesen).

🔴 **Das Quiz schreibt nichts nach MySQL.** Alle sechs Stellen sind Lesen oder Weiterleiten.
Es wird nur ein **Lesezugang** gebraucht.

---

## 2. Prämissen geprüft

| Prämisse | Befund |
| --- | --- |
| Der Container erreicht MySQL direkt | 🟢 **Ja.** `bioniq_hl_support.allowedSource` = `10.0.1.5`; die App `bioniq-hl-support` läuft `running:healthy` **auf demselben Coolify-Host** wie `business-leads-prod`. `analysen` und `Umfragen` lesen von dort bereits direkt. |
| Container hat MySQL-Zugangsdaten | 🔴 **Nein** — im Env nur `BRIDGE_*` und `LEADS_DB_*` (Postgres). |
| Anwendung hat einen MySQL-Treiber | 🔴 **Nein** — `jsonwebtoken`, `postgres`, `react`, `react-dom`. |
| Schreibrechte nötig | 🟢 **Nein.** |

**Die Prämisse „hat direkten Zugriff" stimmt.** Der Grund, warum es die Bridge je gab, ist
im Nachbarprojekt wörtlich festgehalten (`analysen/legacy/datenbank.js:8-12`):
*„Der Umweg ueber die Bridge gab es nur, weil Vercel keinen Zugang zum privaten Netz hatte.
Auf der Coolify-Box liegt die Datenbank unter 10.0.1.3 im selben Netz."*

---

## 3. Das Vorbild — wie `analysen` und `Umfragen` es gelöst haben

Beide haben **dasselbe Muster unabhängig zweimal implementiert** (`analysen/legacy/*.js` in
CommonJS, `Umfragen/src/legacy/*.ts` in TypeScript). Es gibt **kein geteiltes Paket** —
geteilt werden *Dienste*, nicht Bibliotheken. Für das Quiz ist die CommonJS-Fassung aus
`analysen` die passendere Vorlage.

### Die sieben tragenden Entscheidungen

| | Entscheidung | Beleg |
| --- | --- | --- |
| 1 | **`legacy/` ist die einzige Tür nach draussen** — und ein Linter erzwingt das. `mysql2`, `Typeform-Signature`, `contacts.hl-support.biz`, `10.0.1.` ausserhalb dieses Ordners = Fehlschlag | `analysen/scripts/lint.js:29-50`; `Umfragen/scripts/lint-grenze.js` |
| 2 | **Lesen über schmale Views, nie über Rohtabellen** — `SQL SECURITY DEFINER`, damit die App **kein Leserecht auf `users`** braucht | `analysen/legacy/berater.js:6-10` (View `advisor_organization`); `Umfragen/sql/views.sql:40-104` (`survey_referrer`) |
| 3 | **Der Webhook ist der einzige Schreibweg** ins Altsystem — nie direkt in die Contacts-DB, *„nur dort ist die richtige Verarbeitungsreihenfolge (Kontakt, Gutschein, E-Mail) sichergestellt"* | `analysen/legacy/kontakte.js:3-6` |
| 4 | **Eigene Route daneben, alte unangetastet** („abkuppeln statt umbauen"): `/webhook/assessment`, `/webhook/survey` | `contacts…/routes/webhook.php:18-28` |
| 5 | **HMAC-SHA256 über den exakten rohen Body**, Header `Typeform-Signature: sha256=<base64>` | `analysen/legacy/kontakte.js:25-28`; `Umfragen/src/server/signature.ts:3-6` |
| 6 | **Idempotenz per Client-UUID** `submissionId` + Unique-Index in Contacts; Antwort sagt `duplicate: true` | `Umfragen/src/legacy/kontakte.ts:68-75`; `AssessmentIntake.php:127-130` |
| 7 | **Zustellprotokoll vor dem Senden**, `ON DUPLICATE KEY UPDATE attempt_count+1`, gekapselt in `safely()` — *„Ein Protokoll ist nie ein Datenpfad"* | `analysen/legacy/zustellprotokoll.js:54-125`; `Umfragen/src/legacy/zustellprotokoll.ts:38-66` |

### Technische Eckwerte, die beide gleich gewählt haben

`mysql2`-Pool mit `connectionLimit: 5`, `connectTimeout: 8000`, `timezone: "Z"`, bewusst
**ohne Standard-Datenbank** (vollqualifizierte Tabellennamen), bewusst `query()` statt
`execute()`. Zeitlimits: 15 s Webhook, 10 s Postmark, 8 s DB-Connect. Host-gebundener
DB-Benutzer (`…@10.0.1.5`, nicht `%`) mit minimalen Rechten.
*(Rechte sind in beiden Repos nur als Kommentar/Doku belegt, nicht per GRANT-Dump.)*

### Warum das neue Nutzdatenformat besser ist

Frage und Antwort reisen **als Paar** (`{key, question, answer, values}`). Das alte
Typeform-Format schickte alle Fragen in `fields`, aber nur die beantworteten in `answers` —
die Kartei paarte über den **Index**, und ab der ersten übersprungenen Frage verrutschte die
Anzeige. Das ist ein **heute lebender Defekt** der alten Route. Ausserdem: Geschlecht als
Wert statt als übersetztes Wort, Kontaktfelder getrennt von den Antworten.

### Und der Unterschied in den Antworten

Die alte Route antwortet **leer** — auch beim Duplikat. Erfolg und Verwurf sind dort nicht
unterscheidbar; genau das war der stille Fehler vom 26.08.2026. Die neuen Routen liefern
`contact_id`, `survey_id`, `duplicate` — *„Ein 2xx ohne `contact_id` ist ein Befund"*.

---

## 4. 🔴 Der entscheidende Befund: das Quiz ist der grösste Nutzer der alten Route

Im Contacts-Quelltext steht wörtlich (`SurveyWebhookController.php:17-21`):

> *„An der alten Route haengen 13 FREMDE Formulare […] mit ueber 1400 Uebermittlungen in
> 60 Tagen; die zwei groessten sind das **Erfolgscode-Quiz (698)** und der Wellnesscheck (580)."*

**Das Erfolgscode-Quiz sind wir.** Beide Nachbarprojekte haben `/webhook/typeform`
ausdrücklich **in Ruhe gelassen — unseretwegen.** Zwei Folgerungen:

1. **Mein früherer Plan (BR6) war falsch gedacht.** Er sah vor, weiter an
   `/webhook/typeform` zu senden, nur ohne Bridge. Das erbt aber alle Mängel der alten
   Route: keine scharfe Signaturprüfung, leere Antwort, Index-Paarung. Richtig ist
   **abkuppeln**: eigene Route, eigener Vertrag.
2. Solange wir dort hängen, kann die alte Route **niemand** abräumen. Unser Umzug ist die
   Voraussetzung dafür, dass sie irgendwann stillgelegt werden kann.

**Verbindliche Reihenfolge, aus beiden Projekten:** **Contacts zuerst, dann der Absender**
(`CONTACTS-INTEGRATION.md:453-454`). Die neue Route muss existieren und getestet sein,
bevor das Quiz auch nur eine Zeile dorthin schickt.

---

## 5. Zielbild für das Quiz (Entscheidung Markus, 31.08.2026)

**Leitsatz:** *Nicht Altes umflicken, sondern im Repo ein sauberes System bauen — und mit
dem Altsystem nur noch das Nötigste austauschen.*

```text
        ┌──────────────────── business_leads_quiz ────────────────────┐
        │  Leadzustand, Outbox, ALLE Mails, Nurture-Auslöser          │
        │  eigene Postgres (leads.*)                                  │
        └───────────┬────────────────────────────────┬────────────────┘
                    │ liest (nur SELECT)             │ meldet (HMAC, idempotent)
                    ▼                                ▼
      MySQL-View auf 10.0.1.3                POST /webhook/quiz
      Berateridentität, sonst nichts         Kartei-Zeile — Mailschalter AUS
```

**Zwei bewusste Abweichungen von den Vorbildern:**

1. **Die Outbox bleibt.** `analysen` und `Umfragen` haben keinen serverseitigen
   Wiederholungsweg (Sendewache im Frontend + Idempotenz). Das Quiz hat mit
   `api/lead-outbox-worker.js` bereits eine Outbox — die zu opfern wäre ein Rückschritt.
   Richtig: **Outbox behalten, neue Route dahinter**. `submissionId` macht Wiederholungen
   gefahrlos.
2. 🔴 **Die Mails bleiben im Projekt.** Bei `Umfragen` verschickt Contacts die Berater-Mail
   selbst (`SurveyMailer.php`, drei Schalter). Für das Quiz gilt das **nicht**: Alles, was
   mit dem Lead zu tun hat — Zustand, Mails, Nurture — wird **im Repo verwaltet**. Contacts
   bekommt die Daten, weil die Kartei sie braucht, und **sonst nichts**: Bei der neuen Route
   werden die Mailschalter **abgeschaltet**. Das Quiz verschickt Mail 1 und Mail 2 künftig
   über die eigene Outbox, so wie es Mail 3 heute schon tut.

**Was damit an Legacy übrig bleibt — und nur das:**

| Richtung | Was | Warum es bleiben muss |
| --- | --- | --- |
| Lesen | Berateridentität aus einer MySQL-View | Die Stammdaten liegen in `prod_activesupport`; dieses System wandert nicht mit |
| Schreiben | eine Kartei-Zeile über `/webhook/quiz` | Der Berater sieht seine Leads im CRM von Contacts |

Kein Poller, keine Bridge, kein Rückruf ins Quiz, keine zweite Mailquelle.

### Das Geheimnis bekommt einen eigenen, sprechenden Namen

Nicht das geteilte `TYPEFORM_*` erben — der Name ist ohnehin ein Erbstück, mit Typeform hat
der Weg nichts mehr zu tun. Für die neue Route:

- Absender (Quiz): `CONTACTS_QUIZ_WEBHOOK_SECRET`, Ziel in `CONTACTS_QUIZ_URL`
- Empfänger (contacts): eigener Konfigwert je Route, **nicht** `typeform.webhook.secret`

🔴 Warum das nicht verhandelbar ist: Der heute geteilte Wert steht im Klartext im
contacts-Repo und ist in Produktion nicht überschrieben — siehe
[uebergaben/2026-08-31-contacts-signaturpruefung.md](../uebergaben/2026-08-31-contacts-signaturpruefung.md).
Diesen Wert zu erben hiesse, mit einem öffentlich bekannten Geheimnis zu starten.

---

## 6. Der Plan

Jeder Schritt hat einen Beweis, der **vor** dem nächsten erbracht wird.

> **Die drei Stränge sind einzeln ausgearbeitet.** Dieses Dokument ist die Übersicht; die
> Schritt-für-Schritt-Pläne mit Beweisen, Rückwegen und Frühwarnungen stehen in:
> **[umsetzung-a-berateridentitaet.md](umsetzung-a-berateridentitaet.md)** ·
> **[umsetzung-b-lead-uebergabe.md](umsetzung-b-lead-uebergabe.md)** ·
> **[umsetzung-m-mailweg-ins-projekt.md](umsetzung-m-mailweg-ins-projekt.md)**

### Strang A — Berateridentität (Lesen)

| # | Schritt | Beweis |
| --- | --- | --- |
| **A1** | **View + Benutzer anlegen.** Eigene schmale View nach Vorbild `advisor_organization`, `SQL SECURITY DEFINER`, **nur** die Felder, die die Mail und der Funnel brauchen (`email`, `first_name`, `last_name`, `full_name`, `organisation_name` aus `o.org_name`, `country`, `preferred_newsletter_language`, `herbalife_id`). 🔴 **Ohne** `coach_uuid` — das ist bei Umfragen ein Gutschein-**Schlüssel**, den das Quiz nicht braucht. Dazu ein Benutzer `quiz`@`10.0.1.5`, `SELECT` nur auf diese View. | Aus dem **laufenden Container** einen bekannten Slug lesen. Ohne diesen Beweis wird nichts gebaut. |
| **A2** | **`legacy/`-Ordner im Quiz anlegen** mit `datenbank.js` (Pool 5, 8 s, `timezone:"Z"`, vollqualifiziert) und `berater.js`, portiert aus `analysen/legacy/`. **Lint-Grenze** aus `analysen/scripts/lint.js:29-50` übernehmen. | Eigene Tests grün; Linter schlägt an, wenn `mysql2` ausserhalb `legacy/` auftaucht. |
| **A3** | **Die vier Lesestellen auf einen Auflöser umhängen**, Quelle per Schalter (`bridge` \| `verzeichnis` \| `mysql`), Standard `bridge` → **Verhalten unverändert**. | Ein Deploy, bei dem sich nichts ändert (Gegenprobe wie B1). |
| **A4** | **Schattenvergleich** über alle vier Stellen, Quelle `beide`. 🔴 Diesmal **haltbar** schreiben, nicht nur `console.warn` (Lehre aus B2a). | Über mehrere Tage **0** Abweichungen an echten Aufrufen. |
| **A5** | **Auf `mysql` stellen.** | Kein `lookup_subdomain` mehr im Protokoll. |

### Strang B — Lead-Übergabe (Senden)

| # | Schritt | Beweis |
| --- | --- | --- |
| **B1** | **Vertrag für `/webhook/quiz` schreiben** — Paar-Format, `submissionId`, Kontaktfelder getrennt. Vorlagen: `Umfragen/docs/contacts-survey-webhook.md`, `analysen/docs/assessment-webhook.md`. | Vertrag liegt schriftlich vor, bevor jemand baut. |
| **B2** | 🔴 **Contacts zuerst:** Route, Fachlogik, Tests in `contacts-activecenter-legacy` — nach dem Muster von `SurveyIntake`/`AssessmentIntake`, alte Route unangetastet. | Tests dort grün; Route nimmt eine Probe an und antwortet mit `contact_id`. |
| **B3** | **Absender im Quiz** — `legacy/kontakte.js` (HMAC über exakten Body), hinter der **vorhandenen Outbox**, plus Zustellprotokoll vor dem Senden. | Ein echtes Opt-in landet **einmal** in Contacts; Wiederholung liefert `duplicate: true`. |
| **B4** | **Umschalten per Env** (`CONTACTS_QUIZ_URL` gesetzt = neuer Weg, gelöscht = alter Weg) — Notausstieg ohne Deploy, wie bei den Vorbildern. | Nachzählen über beide Wege: Summe stimmt, nichts doppelt. |
| **B5** | **`forward_webhook` und `BRIDGE_*` ausbauen**, toten Code (`readMysqlTable`, `HBA_READ_BRIDGE_URL`) mit. | `grep` findet keinen Aufruf mehr. |

**Verhältnis zur B-Reihe des Mailwegs:** A3 löst B3/B4 des Benachrichtigungsplans ab.
Bis A3 steht, gilt jene Reihe unverändert — **nie beide gleichzeitig**.

---

### Strang M — die Mails ins Projekt holen, dann den Poller abschalten

Ergibt sich aus der Entscheidung „alles Lead-Bezogene im Repo". Erst anfangen, wenn B4
ruhig läuft.

> 🔴 **Warum M und nicht C:** „C1" ist in
> [benachrichtigungsweg-auf-plattform.md](benachrichtigungsweg-auf-plattform.md) bereits für
> den Postprozessor-Extrakt vergeben. Eine Doppelbelegung wäre genau die Art Falle, in die
> eine spätere Sitzung tritt.

| # | Schritt | Beweis |
| --- | --- | --- |
| **M1** | **Mail 1 (Berater) und Mail 2 (Lead) in die Outbox holen** — dieselben Vorlagen, dieselben Texte, als Auftragsart neben `coach_hot_lead_email`. Vorlagen aus der n8n-Bibliothek (1.708 Zeilen, 53 Funktionen; Extrakt in `audits/c1-postprocessor-extrakt/`). | Zeichengleiche Mail im Schattenlauf: gleicher Betreff, gleicher HTML-Rumpf — verglichen, nicht angenommen |
| **M2** | **Die Nebenaufgaben verteilen**, die der Post Processor miterledigt: Mautic-Kontakt, Adressprüfung (ZeroBounce), Resume-Token, Jobverwaltung. 🔴 Das ist der eigentliche Aufwand, nicht die Mails. | Jede Aufgabe hat nachweislich ein neues Zuhause |
| **M3** | **Poller deaktivieren** (`AC - Lead Post Processor`, 36 Knoten) — deaktivieren, nicht löschen. | Opt-in → Mail ohne die 2–5 Minuten Verzug; keine neue Zeile mehr in `lead_processing_jobs` |

Ausgearbeitet in **[umsetzung-m-mailweg-ins-projekt.md](umsetzung-m-mailweg-ins-projekt.md)**.

Danach ist der Verzug weg, die 1.708-Zeilen-Bibliothek in n8n ist weg, und der Lead nimmt
**einen** Weg statt zwei.

---

## 7. Was das für den Mailweg bedeutet

Heute kommen die beiden Opt-in-Mails **nicht** aus diesem Repo:

```text
Quiz → forward_webhook → /webhook/typeform → typeform_surveys (Legacy-MySQL)
     → [bis 5 Min nichts] → n8n "AC - Lead Post Processor" (36 Knoten, 1.708-Zeilen-
       Bibliothek) pollt, holt den Resume-Token per HTTP zurück ins Quiz,
       legt den Mautic-Kontakt an, prüft die Adresse, verschickt Mail 1 und 2
```

Daher der Verzug von 2–5 Minuten — konstruktionsbedingt, kein Fehler.

**Bei den Vorbildern verschickt Contacts die Mails selbst** (`SurveyMailer.php`: Coach-Mail,
Gutschein, Bestätigung — drei getrennte Schalter), synchron im Webhook. Mit einer eigenen
Quiz-Route entfiele also der Poller und mit ihm der Verzug.

🔴 **Aber nicht kostenlos.** Der Post Processor tut mehr als Mails: Mautic-Kontakt,
Adressprüfung über ZeroBounce, Resume-Token, Job-Verwaltung. Diese Aufgaben brauchen ein
neues Zuhause, bevor er abgeschaltet werden kann. **Das ist ein eigener Strang C**, kein
Nebeneffekt von Strang B — und er gehört erst angefasst, wenn B4 ruhig läuft. Der Plan
`benachrichtigungsweg-auf-plattform.md` führt ihn bereits als C1 (Schritt 1 von 7 erledigt).

---

## 7a. Frage: Node-Server behalten oder auf Next.js umbauen?

**Empfehlung: behalten. Nicht das Gerüst austauschen, sondern das Innere aufräumen.**

Gemessen am 31.08.2026:

| | Quiz heute |
| --- | --- |
| Laufzeitabhängigkeiten | **vier**: `jsonwebtoken`, `postgres`, `react`, `react-dom` |
| Bau | eigenes `build.js`, Docker, Coolify |
| Auslieferungsnachweis | CI beweist den Deploy über `/health/live` gegen `SOURCE_COMMIT` |
| Prüfungen | 262 Tests, Lint grün |
| 🔴 Grösste Datei | **`api/bridge.js` mit 4.544 Zeilen** (von ~10.000 in `api/` + `server/`) |

**Warum kein Next.js:**

1. **Das Problem ist kein Gerüstproblem.** Der Schmerz sitzt in einer 4.544-Zeilen-Datei mit
   14 Aktionen — Next.js würde die verschieben, nicht auflösen.
2. **Vier Abhängigkeiten sind ein Vermögenswert.** Kleine Angriffsfläche, schneller Bau,
   kein Gerüst-Aktualisierungszwang. Next.js brächte Hunderte.
3. **Nichts an Next.js löst hier ein echtes Problem.** Serverseitiges Rendern und SEO sind
   für einen Funnel hinter Berater-Slugs kein Thema; die Seite wird beworben, nicht
   gefunden.
4. **Was `Umfragen` gut macht, ist gerüstunabhängig:** `legacy/`-Grenze, Views, HMAC,
   Idempotenz, Zustellprotokoll, Lint-Grenze. Das lässt sich hier eins zu eins übernehmen —
   `analysen` beweist es, dort läuft dasselbe Muster in CommonJS ohne Next.js.
5. **Ein Gerüstwechsel ist der riskanteste Eingriff überhaupt** bei einer Anwendung, die mit
   Werbebudget läuft — und er hat für den Nutzer **keinen** sichtbaren Gewinn.

**Was stattdessen „neu und sauber" heisst — im Sinne des Leitsatzes:**

| Bleibt | Wird neu gebaut |
| --- | --- |
| Node-Server, `postgres`, React, Docker/Coolify | `legacy/` als einzige Tür nach draussen, mit Lint-Grenze |
| Die Outbox (`lead-outbox-worker.js`) | Der Auflöser für die Berateridentität |
| Der CI-Deploy-Nachweis über `/health/live` | Die eigene Contacts-Route samt Vertrag |
| Die 262 Tests | **`api/bridge.js` zerlegen** — je Aktion ein Modul mit eigenem Test |

🔴 **`api/bridge.js` ist das eigentliche „Alte", das nicht weiter umgeflickt werden
sollte.** Von seinen 14 Aktionen gehen nur noch zwei nach draussen; der Rest ist längst
lokale Postgres-Logik, die nur noch in dieser Datei wohnt. Beim Umbau der zwei
Aussenaktionen ist der natürliche Moment, die Datei aufzulösen — nicht in einem eigenen
Grossvorhaben, sondern Aktion für Aktion, jede mit dem Test, den sie heute nicht hat.

**Wann Next.js richtig wäre:** wenn pro Berater echte, indexierbare Landeseiten entstehen
sollen. Das ist eine Produktentscheidung, keine Aufräumentscheidung — und dann baut man sie
**daneben**, nicht als Umschreibung des Funnels.

---

## 8. Risiken und Rückweg

| Risiko | Warum es zählt | Gegenmittel |
| --- | --- | --- |
| 🔴 **Doppelter Versand** in Strang B | Beide Wege gleichzeitig = jeder Lead bekommt alles doppelt | `submissionId` + Unique-Index; Umschalten per Env; über beide Wege nachzählen statt 2xx glauben |
| 🔴 **Geteiltes Webhook-Geheimnis** | `TYPEFORM_WEBHOOK_SECRET` gilt laut Doku über mehrere Anwendungen; Rotation trifft alle gleichzeitig (offener Punkt 108 dort) | Für die neue Quiz-Route ein **eigenes** Geheimnis verlangen — nicht das geteilte erben |
| MySQL als neuer Ausfallweg im Funnel | Der Funnel hinge synchron an der Legacy-DB | Zeitlimit + Rückfall auf das Verzeichnis; Quelle bleibt ein Schalter |
| Stiller Feldunterschied | Genau das ist am 31.08. passiert (`o.name` statt `o.org_name`) | Schattenvergleich A4 gegen die **effektiven** Werte |
| Leserecht zu breit | In `users` liegen Passwort-Hashes und Bankdaten | View mit `SECURITY DEFINER`, App bekommt **kein** Recht auf `users` |

**Rückweg:** Strang A bis A5 ist eine Env-Änderung zurück. Strang B bis B4 ebenso
(`CONTACTS_QUIZ_URL` löschen). Erst B5 ist ein Deploy zurück.

---

## 9. Was dieser Plan ausdrücklich **nicht** tut

- **`db-bridge.php` bleibt unangetastet** — sie bedient 15 weitere Projekte, u. a. die
  landing-page.
- **`/webhook/typeform` bleibt unangetastet** — dort hängen 12 weitere Formulare. Wir
  koppeln uns ab, wir räumen nicht auf.
  🟡 **Zur Einordnung (Markus, 31.08.):** Der Wellnesscheck (580 Übermittlungen) ist die
  **alte Vitalanalyse** und wird in etwa zwei Monaten abgeschaltet; danach macht alles die
  neue Vitalanalyse. Zusammen mit unserer Abkopplung (698) verliert die alte Route damit
  **beide grössten Nutzer** — sie stillzulegen wird danach realistisch. Das ist Sache des
  contacts-Projekts, nicht unsere.
- Er migriert **keine Daten**. Das Quiz liest nur.
- Er löst **`prod_activesupport` nicht ab** — nur den Umweg über PHP.

## 10. Offen / unbelegt

- Die tatsächlichen MySQL-**GRANTs** der Nachbarprojekte sind nur als Kommentar belegt,
  nicht per Dump. Für A1 ist das ohnehin neu zu erstellen.
- Der **Contacts-seitige Quelltext** liegt in `contacts-activecenter-legacy` bzw. auf
  GitLab; B2 findet dort statt, nicht in diesem Repo.
- Ob Contacts für das Quiz **beide** Mails übernehmen soll oder nur die Berater-Mail, ist
  eine Fachentscheidung — bei Umfragen entsteht die Bestätigungsmail bewusst im Projekt,
  nicht in Contacts.
