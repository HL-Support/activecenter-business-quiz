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

## 5. Zielbild für das Quiz

```text
Berateridentität   Quiz → eigene View in MySQL (10.0.1.3), SELECT-only, host-gebunden
                   statt: Quiz → db-bridge.php → users ⋈ organizations

Lead-Übergabe      Quiz → Outbox → POST /webhook/quiz (HMAC, submissionId, Paar-Format)
                   statt: Quiz → db-bridge.php → /webhook/typeform → typeform_surveys
                          → n8n-Poller alle 5 Min
```

**Ein Unterschied zu den Vorbildern, bewusst:** `analysen` und `Umfragen` haben **keinen**
serverseitigen Wiederholungsweg — sie verlassen sich auf eine „Sendewache" im Frontend plus
Idempotenz. Das Quiz hat mit `api/lead-outbox-worker.js` bereits eine **Outbox**. Die zu
opfern wäre ein Rückschritt. Richtig ist: **Outbox behalten, neue Route dahinter hängen** —
die Idempotenz per `submissionId` macht Wiederholungen dann gefahrlos.

---

## 6. Der Plan

Jeder Schritt hat einen Beweis, der **vor** dem nächsten erbracht wird.

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
