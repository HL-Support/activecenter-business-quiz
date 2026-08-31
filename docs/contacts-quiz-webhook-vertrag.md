# Der Vertrag für `POST https://contacts.hl-support.biz/webhook/quiz`

**Festgeschrieben am 31.08.2026** — Schritt B1 des Plans
[umsetzung-b-lead-uebergabe.md](plans/umsetzung-b-lead-uebergabe.md).

> 🔴 **Dieses Dokument gilt, nicht §3 des Plans.** §3 wurde geschrieben, *bevor* die
> Gegenstelle gebaut war. Beim Nachlesen des ausgelieferten Empfängers (Commit `f7882db`
> im Repo `contacts-activecenter-legacy`) sind **drei Abweichungen** aufgefallen. Sie
> stehen unten als Korrekturen K1–K3 mit Fundstelle. Wer nach §3 baut, baut an der
> Gegenstelle vorbei.

Alle Angaben sind am Quelltext des Empfängers und am **laufenden** n8n gemessen, nicht
übernommen.

---

## 0. Die drei Korrekturen gegenüber Plan §3

| # | Plan §3 sagt | Der ausgelieferte Empfänger tut | Fundstelle |
| --- | --- | --- | --- |
| **K1** | Registry-Schlüssel steht in `meta.quiz` | liest `meta.survey`; ein `meta.quiz` wird **ignoriert**, die Übermittlung endet mit `422 meta.survey is unknown` | `SurveyPayload.php:88-92`, `QuizWebhookController.php:47` |
| **K2** | Kopf `Typeform-Signature` | Kopf **`X-Quiz-Signature`** | `config/quiz.php` (`signature_header`), `QuizWebhookController.php:78-86` |
| **K3** | Contacts spiegelt `meta` nach `form_response.hidden`, „damit Verbraucher 2 und 3 weiter finden, was sie lesen" | **spiegelt nicht.** `hidden` trägt genau 8 Felder | `LegacySurveyResponse.php:42-53` |

K1 und K2 sind hier eingearbeitet — der Absender sendet, was der Empfänger liest.

🔴 **K3 ist nicht einarbeitbar. Es ist ein Mangel der Gegenstelle und die harte
Vorbedingung für B5 (Umschalten).** Ausgeschrieben in §5 und übergeben als
[2026-08-31-contacts-hidden-abbildung.md](uebergaben/2026-08-31-contacts-hidden-abbildung.md).

Die Namensraum-Trennung, die §3e mit `meta.quiz` erreichen wollte, ist trotzdem da — sie
sitzt nur woanders: `config/quiz.php` → `erlaubte_schluessel = ['quiz-erfolgscode']`, und
`SurveyWebhookController` weist denselben Schlüssel in der Gegenrichtung ab.

---

## 1. Anfrage

```
POST /webhook/quiz
Content-Type: application/json
X-Quiz-Signature: sha256=<base64 HMAC-SHA256 über den EXAKTEN rohen Rumpf>
```

```jsonc
{
  "meta": {
    "survey": "quiz-erfolgscode",             // K1. Unbekannt/nicht erlaubt ⇒ 422
    "submissionId": "3f2b6c9e-…",             // 🔴 PFLICHT, echte UUID — DIE Idempotenz.
                                              // Serverseitig beim ERSTEN Einreihen erzeugt
                                              // und im Outbox-Auftrag eingefroren (§3)
    "hash": "qz_a1b2c3…",                     // 🔴 PFLICHT — der Lesegriff der Zeile
    "sessionHash": "ac_…",                    // ⚠️ K3: kommt heute nicht in hidden an
    "token": "tf7m2…",                        // ⚠️ wird verworfen, siehe §2 Fussnote
    "memberId": "25851739",                   // Pflicht; unbekannt ⇒ 422 MemberId unknown
    "refId": "25851739",                      // optional, Standard = memberId
    "slug": "markus",                         // ⚠️ K3
    "language": "de",                         // de|it|en|fr|ru|hu
    "country": "AT",                          // ISO-2, optional
    "title": "DE - Erfolgscode Quiz",         // der übersetzte Titel, den der Teilnehmer sah
    // BEWUSST NICHT gesendet: projectVersion. `assessment_version` wird auch ohne sie
    // gefüllt (`umfrage-quiz-erfolgscode`) und bleibt damit das Unterscheidungsmerkmal
    // gegenüber der alten Route (§10 des Plans). Eine Fassungsangabe zu erfinden, nur um
    // ein Feld zu füllen, wäre geraten — das Quiz führt keine.
    "profileCode": "feuer",                   // ⚠️ K3 — der interne Profilcode …
    "profileLabel": "Der Macher",             // ⚠️ K3 — … und das angezeigte Label
    "mainAspiration": "freedom",              // ⚠️ K3
    "mainAspirationLabel": "Freiheit",        // ⚠️ K3
    "barrier": "confidence",                  // ⚠️ K3 — Begründung unten
    "startedAt":  "2026-08-31T09:00:00.000Z",
    "submittedAt":"2026-08-31T09:04:12.000Z"
  },
  "contact": {
    "firstName": "Anna",
    "email": "anna@example.com",
    "gender": "undisclosed"                   // das Quiz erhebt kein Geschlecht;
                                              // fehlt es, setzt der Empfänger denselben Wert
    // BEWUSST NICHT: lastName, phone — das Quiz erhebt sie nicht.
  },
  "attribution": { "utm_source": "…", "fbc": "…", "…": "…" },   // ⚠️ K3
  "answers": [
    { "key": "profile",         "question": "Dein Erfolgscode",
      "answer": "Der Macher",        "values": ["feuer"] },
    { "key": "main_aspiration", "question": "Was dir am wichtigsten ist",
      "answer": "Freiheit",          "values": ["freedom"] },
    { "key": "q1", "question": "<Frage 1, übersetzt>", "answer": "<Label>", "values": ["R"] },
    { "key": "q2", "…": "…", "values": ["G"] },
    { "key": "q3", "…": "…", "values": ["B"] },
    { "key": "q4", "…": "…", "values": ["freedom"] },
    { "key": "q5", "…": "…", "values": ["growth"] },
    { "key": "q6", "…": "…", "values": ["confidence"] }
  ]
}
```

**`meta.barrier` steht zusätzlich zu Plan §3a hier — und ist keine Erfindung.** Der Post
Processor liest `hidden.barrier_slug` bzw. `hidden.lead_barrier` (`Code - Build Lead Model`,
Z. 1647). Heute erreicht ihn die Barriere über die Antwort mit dem `ref`
`lead_q6_barrier`; unter der neuen Route heisst dieser `ref` `a_q6` (§5), der Rückfall
greift also nicht mehr. Der Wert selbst liegt im Quiz längst vor (`initial_barrier`).

Regeln:

1. **Paar-Format.** Frage und Antwort entstehen zusammen, aus **einer** Quelle. Der
   Index-Verrutsch-Defekt der alten Route ist damit strukturell ausgeschlossen.
2. **Kontaktfelder gehören nach `contact`**, nie in `answers`.
3. **`values` trägt Werte, `answer` das übersetzte Label** — `R|Y|G|B`, Aspirations- und
   Barriereschlüssel.
4. **Attribution ist unausgewertet** und reist nur mit, damit sie in `hidden` landen kann
   (K3).

---

## 2. Antwort

```jsonc
200 { "message": "Submitted", "duplicate": false,
      "case": "neu" | "eigener_kontakt" | "fremder_kontakt_neu" | "fremder_kontakt_bleibt",
      "contact_id": 123, "contact_uuid": "…", "survey_id": 456, "survey_uuid": "…",
      "coach_member_id": "25851739", "voucher": false, "voucher_image": null }

200 { "message": "Already submitted", "duplicate": true,
      "contact_id": 123, "survey_id": 456, "survey_uuid": "…" }   // dieselbe submissionId

422 { "message": "meta.survey is unknown" | "… is not allowed on this route" | … }
401 / 406   falsche / fehlende Signatur      503   kein Geheimnis konfiguriert
```

Belegt in `SurveyIntake.php:151-170` (Erfolg) und `:419-428` (Duplikat).

🔴 **Ein 2xx ohne `contact_id` ist ein Befund.** Der Absender wertet ihn als Fehlschlag und
wiederholt; dank `submissionId` ist die Wiederholung gefahrlos und liefert die Kennungen
im Duplikatsfall nach.

⚠️ **Die Duplikat-Antwort trägt kein `coach_member_id`.** Wer es braucht (Strang M), muss
es beim ersten Erfolg speichern — deshalb schreibt der Worker es sofort weg.

*Fussnote zu `meta.token`:* Der Empfänger rechnet den Kartei-Token selbst aus
(`SurveyPayload::token()`, `sv` + SHA-256 über die `submissionId`) und **verwirft den
mitgesendeten**. Nachgeprüft, ob das schadet: `typeform_surveys.token` wird vom Post
Processor nur mitgeführt, der Wiederaufnahme-Link entsteht über unsere eigene Route
`generate_resume_token` mit `leadHash` (Knoten `HTTP - Generate Resume Token`). Kein
Verlust — der Vertrag führt `meta.token` trotzdem, damit der Wert nicht verschwindet, falls
die Gegenstelle ihn eines Tages übernimmt.

---

## 3. Idempotenz

```text
Browser-Klick ──(lead_hash je Lead-Run)──► Adapter
Adapter ──(Einreihung dedupliziert je lead_hash)──► EIN Auftrag mit EINER submissionId
Worker ──(Auftrag trägt eingefrorenen Payload)──► identischer Rumpf bei jeder Wiederholung
Contacts ──(Unique-Index submission_id)──► genau EINE Kartei-Zeile, sonst duplicate:true
```

Warum der `qz_`-Hash **nicht** der Schlüssel sein darf: er entsteht im Browser
(`src/lib/core.js:479-484`), ist klientengesteuert und fälschbar, nutzt `Math.random`, und
im Bestand gibt es bereits eine Wiederholung (1270 verschiedene bei 1271 Zeilen). Er bleibt
Pflichtfeld als **Lesegriff** — Griff ≠ Idempotenz.

Der Empfänger prüft `submission_id` **vor** der Fallentscheidung
(`SurveyIntake.php:84-87`) und fängt den Wettlauf zusätzlich über den Fehler 1062 ab
(`:107-119`, Index `typeform_surveys_submission_id_unique`).

---

## 4. Was der Empfänger in die Kartei schreibt

`SurveyIntake::karteiZeile` (`:311-347`), Tabelle `typeform_surveys`:

| Spalte | Wert |
| --- | --- |
| `hash` | `meta.hash` (mitgebrachter Hash hat Vorrang) |
| `token` | selbst gerechnet, `sv…` (siehe Fussnote §2) |
| `form_id` | **`hC2yTcU8`** aus der Registry |
| `survey_id` | **`12`** aus der Registry |
| `ref_id` | `meta.refId ?? meta.memberId` |
| `locale` | `meta.language` |
| `submission_id` | `meta.submissionId` |
| `assessment_version` | `umfrage-quiz-erfolgscode` (ohne `projectVersion`), auf 50 Zeichen gekürzt — auf dem **alten** Weg ist die Spalte leer, daran sind die Wege in §10 auseinanderzuhalten |
| `submitted_at` | `meta.submittedAt`, in die Zeitzone der Anwendung gebracht |
| `form_response` | siehe §5 |

Dazu eine Zeile `typeform_connected_surveys` mit demselben `hash`.

---

## 5. 🔴 K3 — die Lücke, die B5 blockiert

**Gemessen am laufenden n8n (Workflow `9RZdrLxfA8IRhd55`, `updatedAt` 31.08.2026 12:31).**

Der Post Processor liest aus `form_response.hidden` **19** Felder:

```
barrier_slug  berater_slug  funnel  funnel_key  hash  lang  lead_barrier  lead_hash
main_aspiration  main_aspiration_label  main_aspiration_slug  member_id  profile_label
profile_slug  profile_summary  ref_id  session_hash  slug  tracking_hash
```

`LegacySurveyResponse::build` schreibt **8**: `member_id`, `ref_id`, `survey_id`, `hash`,
`lang`, `language`, `submission_id`, `gender_code`.

Und die Antworten bekommen dort einen eigenen Namensraum: aus `key: "profile"` wird der
`ref` **`a_profile`** (`LegacySurveyResponse.php:98`). Der Post Processor sucht aber nach
`lead_profile_result` / `lead_main_aspiration` — der Rückfall über die Antworten greift
also ebenfalls nicht.

**Was daraus folgt, wenn heute umgeschaltet würde** (Fundstellen aus
`Code - Build Lead Model`):

| Wert | Kette | Ergebnis |
| --- | --- | --- |
| `profile_label` | `vars` ✗ → Antwort `lead_profile_result` ✗ → `hidden.profile_label` ✗ | 🔴 **„Unbekannt"** (Z. 252-260) |
| `main_aspiration_label` | dieselbe Kette | 🔴 **„Unbekannt"** (Z. 281-288) |
| `main_aspiration` (Schlüssel) | ✗ | leer (Z. 290-298) |
| `barrier_slug` | ✗ | leer (Z. 1647) |
| `profile_summary` | ✗ | leer |
| `berater_slug` / `slug` | ✗ | Berater-Rückfall im Kandidaten-SELECT und die Coach-Quiz-Adresse fallen aus |
| `session_hash` | ✗ | leer — der Wiederaufnahme-Link überlebt, weil derselbe Knoten `leadHash` mitsendet |
| `funnel` / `funnel_key` | ✗ | Standardwerte |

Das ist **exakt die Fehlerklasse, die M2a am 31.08. behoben hat** („Ziel Unbekannt" →
„Szabadság"): Mail 1 und Mail 2 gingen weiter raus, nur mit falschem Inhalt. Kein Fehler,
keine Meldung.

🔴 **Deshalb: B3 darf gebaut und ausgeliefert werden (er ist inaktiv), B4 darf im Schatten
laufen — B5 nicht, bevor K3 in `contacts` behoben und an einer Probezeile bewiesen ist.**
Der Beweis dafür ist der ohnehin geplante Post-Processor-Nachweis (Plan §5): Probezeile über
die neue Route ⇒ Mail 1+2 mit **richtigem** Profil und Ziel, nicht „Unbekannt".

---

## 6. Warum der Post Processor die neue Zeile überhaupt findet

**§12.1 des Plans, jetzt beantwortet.** Der Kandidaten-SELECT (`MySQL - Select New
Candidate Surveys`), gelesen über die n8n-API am laufenden Workflow und gegen die
Repo-Sicherung geprüft — beide zeichengleich:

```sql
WHERE ts.form_id IN ('hC2yTcU8')
  AND ts.submitted_at >= '{{ $json.activation_time }}'
  AND lpj.id IS NULL
ORDER BY ts.submitted_at ASC
```

Drei Bedingungen, alle erfüllt:

1. `form_id = 'hC2yTcU8'` — die Registry liefert genau diesen Wert (in B2 korrigiert).
2. `submitted_at` — kommt aus `meta.submittedAt`, dem Absendezeitpunkt im Quiz. Der
   Outbox-Verzug von ~1 Minute verschiebt ihn **nicht**.
3. `lpj.id IS NULL` — neue Zeile, noch kein Auftrag.

Dazu ein **INNER JOIN** auf `contacts c_direct ON c_direct.id = ts.contact_id`: Ohne
Kontakt-Kennung wäre die Zeile unsichtbar. `SurveyIntake` legt Kontakt und Kartei-Zeile in
**einer** Transaktion an, die Spalte ist also nie leer.

Gelesene Spalten: `id`, `contact_id`, `form_id`, `hash`, `token`, `locale`,
`points_result`, `form_response`, `submitted_at` — alle aus §4.

---

## 7. Das Geheimnis

| | |
| --- | --- |
| Absender (Quiz-App `yhoacszoiofuq6dg4mykyr7b`) | `CONTACTS_QUIZ_URL`, `CONTACTS_QUIZ_WEBHOOK_SECRET` |
| Empfänger (contacts-App `ivvm0jpwozcczqokby0ty4yb`) | `QUIZ_WEBHOOK_SECRET`, ohne Vorgabewert |
| Wert | ≥32 Bytes Zufall, nur in den beiden Coolify-Umgebungen; Kopie in `agent-secrets` unter `quiz_contacts_webhook`. Nie im Repo, nie in der Doku, nie im Chat |
| Signatur | `sha256=` + Base64 des HMAC-SHA256 über den **exakten rohen** Rumpf |

Fail-closed an beiden Enden: der Empfänger antwortet ohne Geheimnis `503` (nicht wie die
Nachbarroute „ohne Geheimnis keine Prüfung"), der Absender stellt den Auftrag auf `failed`
mit `env_missing` und sendet **niemals** unsigniert oder ersatzweise woandershin.

---

## 8. Abgrenzung: was diese Route NICHT tut

- **Sie verschickt keine Mail.** Registry: `contact_email` und `coach_email` beide `false`.
  Stünde eines auf `true`, während der Post Processor läuft, ginge die Mail doppelt raus.
- **Sie erzeugt keinen Gutschein** (`voucher_type: null`) — das Quiz kennt keinen.
- **Sie fasst die alte Route nicht an.** `/webhook/typeform` bedient unverändert die
  übrigen Formulare.

---

*Bezug:* [Plan B](plans/umsetzung-b-lead-uebergabe.md) ·
[Übergabe K3](uebergaben/2026-08-31-contacts-hidden-abbildung.md) ·
Empfänger: `contacts-activecenter-legacy` `f7882db` (`QuizWebhookController.php`,
`SurveyPayload.php`, `SurveyIntake.php`, `LegacySurveyResponse.php`, `config/quiz.php`,
`config/surveys.php`).

---

## 9. Nachtrag 31.08.2026 — die dritte Mail

Beim ersten Probelauf kam heraus: Je Lead gingen **drei** Mails an den Berater, nicht zwei.

| Mail | Woher | Steuerbar über |
| --- | --- | --- |
| „Neuer Kontakteintrag" | `NotificationService::sendTypeformNotification` → ActiveCenter-Benachrichtigungsweg | 🔴 **bisher gar nichts** |
| „Neuer Kontakt aus: Business" | Post Processor, Mail 1 | n8n |
| Zugangsmail | Post Processor, Mail 2 | n8n |

Die erste hängt weder an `contact_email` noch an `coach_email`. Am Quelltext des **alten**
Weges nachgesehen: Dort steht derselbe Aufruf (`TypeformWebhookController.php:368`)
ebenfalls **außerhalb** jeder `noemail`-Prüfung — jene deckt nur `sendEmailToContact`
(`:432`) und `sendEmailToCoachOnNewContactCreated` (`:533`). Das Quiz bekam diese Mail
also auch bisher; es ist keine Regression des Umbaus, sondern eine verdeckte Kopplung.

**Behoben** (contacts `10e9251`): Registry-Schalter `kartei_benachrichtigung`, Standard
`true`, für `quiz-erfolgscode` auf `false`. Im ausgelieferten Container nachgemessen —
Quiz `false`, Umfragen unverändert `(nicht gesetzt ⇒ true)`.

⚠️ Der Test dazu prüft die **Einreihung**, nicht den HTTP-Aufruf: Die Benachrichtigung
geht über `dispatch(closure)`, und mit `Queue::fake()` wird die Closure nie ausgeführt —
ein `Http::assertNothingSent()` wäre immer grün gewesen und hätte nichts bewiesen.

### 9a. Welche Mail woher kommt — am 31.08.2026 an drei Proben ausgezählt

| Mail | Absender-Server | An | Wer verschickt sie | Steuerung |
| --- | --- | --- | --- | --- |
| „Neuer Erfolgs-Code von: …" | Postmark **Leadgen** | Berater | n8n Post Processor | n8n |
| „Dein Erfolgs-Code und dein Zugang" | Postmark **Leadgen** | Interessent | n8n Post Processor | n8n |
| „Neuer Kontakteintrag" | ActiveCenter | Berater | `NotificationService` | 🔴 **jetzt** `kartei_benachrichtigung` |
| „Neuer Kontakt aus: Business" | Postmark **HL-Support** | Berater | contacts `NewContactCreated` | `noemail` (alt) / `coach_email` (neu) |
| „Deine Anfrage zu unserer Geschäftsmöglichkeit" | ActiveCenter | Interessent | contacts `sendEmailToContact` | `noemail` (alt) / `contact_email` (neu) |

🔴 **Über `/webhook/quiz` verschickt contacts NULL Mails.** Alle drei Schalter der Registry
stehen auf `false` — im ausgelieferten Container nachgemessen. Die zwei Mails, die ein Lead
auslöst, kommen ausschliesslich aus n8n.

**Ein Zerrbild und seine Lehre:** Die letzten beiden Zeilen der Tabelle tauchten bei einer
Probe auf, die über `--ueber-adapter` durch den **alten** Weg lief. Ursache war nicht das
System, sondern die Probe: Sie schickte `variables` gar nicht mit, also auch kein
`noemail: 1` — und genau das blockt im alten Controller diese beiden Mails
(`:432` und `:533`). Der echte Browser sendet die Liste bei jedem Opt-in
(`src/lib/core.js:1573-1579`). Seither trägt die Probe sie ebenfalls, und ein Test hält
beide Seiten gegeneinander. **Eine Probe, die anders aussieht als der Ernstfall, misst den
Ernstfall nicht — sie erzeugt Gespenster, denen man hinterherläuft.**
