# Strang B — Die Lead-Übergabe auf die eigene Route `/webhook/quiz` umstellen

**Aufgestellt am 31.08.2026 (MESZ)** als Ausarbeitung von Strang B aus
[bridge-abloesen-direktzugriff.md](bridge-abloesen-direktzugriff.md). Alle Fundstellen
unten sind am 31.08.2026 am Quelltext nachgesehen; wo etwas nicht belegt ist, steht es in
§12 als offen.

> **Dieses Dokument ändert nichts. Es plant.** Es ist geschrieben, damit während der
> Umstellung **kein Lead doppelt** und **kein Lead gar nicht** ankommt — der doppelte
> Versand ist die teuerste Fehlerwirkung dieses Systems.
>
> Harte Regeln, nicht verhandelbar:
> - 🔴 `db-bridge.php` und `/webhook/typeform` werden **nicht angefasst**. Wir koppeln ab.
> - 🔴 **Contacts zuerst, dann der Absender.** Niemals umgekehrt.
> - 🔴 R0: keine Eile, alles prüfen, **eine Messung ist kein Beweis**.
> - 🔴 Kein Eingriff in den Übermittlungsweg am selben Tag wie ein anderer
>   (dreimal belegte Fehlerklasse, [MAILWEGE §6](../MAILWEGE.md)).

---

## 1. Ausgangslage — der heutige Weg, gemessen

```text
Browser (src/lib/core.js:1516, action forward_typeform_adapter)
  → api/bridge.js:4057 (Adapter: Identität sichern, Typeform-Payload bauen)
      → :4093 proxyToBridge(action 'forward_webhook')          ← der Versand
      → ac-reconnect.com/db-bridge.php (PHP-Proxy, SSRF-Weissliste)
      → https://contacts.hl-support.biz/webhook/typeform
      → Zeile in prod_contacts_activesupport.typeform_surveys
```

- **Zwei Aufrufstellen** von `forward_webhook`: im Adapter (`api/bridge.js:4093-4103`)
  und als rohe Durchreich-Aktion (`api/bridge.js:4191-4210`). 🔴 Die rohe Aktion hat **im
  heutigen Bundle keinen Aufrufer** (Grep über `src/` und `scripts/` am 31.08.: Treffer nur
  in `api/bridge.js` selbst, `scripts/verify.js:309` prüft nur den String). Sie bleibt bis
  zum Rückbau B7 stehen — für alte, im Browser gecachte Bundles — und geht **immer** den
  alten Weg.
- Der Versand ist **synchron im Opt-in-Request**: Erst wenn der Forward 2xx liefert,
  persistiert der Adapter lokal (`persistBusinessSubmissionToLeadStateV2`, Gate an
  `result.status` in `api/bridge.js:4112`) und feuert Meta CAPI (`:4132`).
- `forward_webhook` ist **kein Datenbankzugriff** — reiner HTTP-Proxy.

### 1a. 🔴 Drei Verbraucher hängen an der Kartei-Zeile, die dabei entsteht

Wer die Übergabe umbaut, baut nicht „einen Webhook" um, sondern die Quelle für drei
nachgelagerte Wege. Alle drei müssen nach der Umstellung weiter funktionieren:

| # | Verbraucher | Was er mit der Zeile tut | Beleg |
| --- | --- | --- | --- |
| 1 | **Kontaktkartei** (contacts-CRM) | zeigt dem Berater den Lead samt Antworten | Zweck der Route |
| 2 | **n8n `AC - Lead Post Processor`** (alle 5 Min) | pollt `typeform_surveys`, legt Jobs an, holt Resume-Token, legt Mautic-Kontakt an, prüft Adresse, verschickt **Mail 1 (Berater) und Mail 2 (Lead)** | [MAILWEGE §1](../MAILWEGE.md); Bibliothek liest `row.form_response` → `hidden.hash/lead_hash/session_hash/member_id/ref_id/lang/main_aspiration*/profile_label`, `token`, `answers`, `variables` (`docs/audits/c1-postprocessor-extrakt/bibliothek.js:65-95,1537-1610`) |
| 3 | **Rang-Aktualisierer** (n8n `Update "Result" by hash`, `7Xg6NsE5H3UWgSNc`) | `UPDATE typeform_surveys SET points_rank/points_result WHERE hash = '<lead-hash>'` — gespeist aus zwei Richtungen: Outbox-Aufträge `mysql_initial_rank`/`mysql_rank_update` (`api/lead-outbox-worker.js:50,975-977`) und die Bridge-Aktion `update_points_result` (`api/bridge.js:4023`) | am 31.08. am laufenden System gemessen: 1.352 + 909 erledigte Aufträge, letzter von heute |

Verbraucher 2 und 3 werden in §5 und §6 einzeln abgesichert. **Solange Strang C nicht
umgesetzt ist, kommen Mail 1 und Mail 2 ausschliesslich über Verbraucher 2** — die neue
Route darf diesen Weg keinen Tag unterbrechen.

### 1b. Was das Quiz heute tatsächlich sendet (Quelle des Vertrags)

Der Browser schickt an den Adapter (`src/lib/core.js:1518-1594`):

- **Person:** `first_name`, `email` — mehr erhebt das Quiz nicht (kein Nachname, kein
  Telefon, kein Geschlecht).
- **Durchlauf:** `event_id`, `token`, `landed_at`, `submitted_at` (aus dem Lead-Run,
  `core.js:479-500`).
- **Inhalt:** `selected_answers` (6 Fragen), `profile` (Code/Name), `main_aspiration`
  (+Label), `calculated {score:0}`, `variables` (`contact_country`, `score`, `noemail`,
  `main_aspiration`, `main_aspiration_label`, `core.js:1573-1579`).
- **`hidden`** (`core.js:1541-1571`): `c` (Land), `hash`/`lead_hash` (`qz_…`),
  `session_hash`/`tracking_hash` (`ac_…`), `client_seed`, `lead_system_v2_enabled`,
  `visitor_id`, `schema_version`, `main_aspiration(_label)`, die zwölf
  Attributionsfelder (`utm_source/medium/campaign/content/campaign_id/adset_id/ad_id/term`,
  `fbclid`, `fbc`, `fbp`, `event_source_url`), `lang`, `berater_slug`, `slug`,
  `member_id`, `ref_id`, `survey_id: '12'`.

Der Adapter garantiert vor dem Versand die Berateridentität: `ensureBusinessSubmissionIdentity`
setzt `hidden.member_id`/`ref_id` verbindlich oder blockiert mit Alarmmail
(`api/bridge.js:2207-2263`). Der Server baut daraus die Typeform-Nachbildung
(`buildBusinessTypeformPayload`, `api/bridge.js:3527-3665`) mit dem Fragenkatalog
`BUSINESS_SCHEMA` (`:3370-3481`, `formId 'hC2yTcU8'`, Felder `profile`,
`main_aspiration`, `q1…q6`, `first_name`, `email`) und den Wertelisten aus
`questionDefinitions` (`:3495-3506`): q1–q3 → Typ `R|Y|G|B`, q4–q5 → Aspiration
`freedom|impact|security|growth`, q6 → Barriere `vehicle|community|confidence|opportunity`.

---

## 2. Zielbild

```text
Browser → api/bridge.js (Adapter)
  1. Identität sichern (unverändert)
  2. lokal persistieren: submit_lead_complete            ← neue Reihenfolge: erst die
  3. Outbox-Auftrag 'contacts_quiz_submission' einreihen    eigene Wahrheit, dann melden
  4. Meta CAPI (Gate: lokaler Persist statt Forward-2xx)
Outbox-Worker (n8n-getaktet, jede Minute)
  → Zustellprotokoll-Zeile VOR dem Senden
  → POST /webhook/quiz  (HMAC, eigenes Geheimnis, idempotent per submissionId)
  → Antwort-Kennungen (contact_id, survey_id) ins Protokoll und nach lead_state
```

- Die **Bridge fällt für diesen Zweck weg** (kein `proxyToBridge`, kein PHP, kein
  geteiltes `TYPEFORM_*`-Geheimnis).
- Die **Outbox bleibt davor** — bewusste Abweichung von den Vorbildern, die keinen
  serverseitigen Wiederholungsweg haben. Contacts-Ausfall blockiert damit **kein Opt-in
  mehr** (heute schlägt der Submit fehl, wenn contacts nicht antwortet).
- 🔴 **Mailschalter der neuen Route: AUS.** Alles Lead-Bezogene (Zustand, Outbox, alle
  Mails, Nurture) bleibt im Quiz-Repo (Entscheidung Markus, 31.08.2026). Contacts bekommt
  **nur die Kartei-Zeile**. Mail 1+2 laufen bis Strang C unverändert über den Post
  Processor (§5).
- Die Antwort-Kennungen der neuen Route **ersetzen den toten MySQL-Readback**
  (`loadFinalBusinessLeadContext` → `readMysqlTable`, `api/bridge.js:487-498`;
  `HBA_READ_BRIDGE_URL` ist nicht gesetzt): `contact_id`/`survey_id` aus der Antwort
  füllen `lead_state.mysql_contact_id`/`mysql_survey_id`, `sync_status='contacts_synced'`.
- Der **Browser-Vertrag bleibt unverändert**: Der Client nutzt aus der Antwort nur
  `response.ok`, `data.lead_hash`, `data.meta_event_id` (`src/lib/core.js:1599-1641`).

---

## 3. 🔴 Der Vertrag für `POST /webhook/quiz`

Vorbild ist der ausgeschriebene Umfragen-Vertrag
(`Umfragen/docs/contacts-survey-webhook.md`) — **übertragen, nicht abgeschrieben**; die
Abweichungen sind in §3e begründet. Jedes Feld unten ist aus §1b hergeleitet; kein Feld
ist erfunden.

### 3a. Anfrage

```jsonc
POST /webhook/quiz
Content-Type: application/json
Typeform-Signature: sha256=<base64 HMAC-SHA256 über den EXAKTEN rohen Body>
// Header-Name bleibt der der Nachbarrouten (analysen/legacy/kontakte.js:63) — die
// Bauart ist bewährt; NEU ist ausschliesslich das Geheimnis dahinter (§7).

{
  "meta": {
    "quiz": "erfolgscode",                    // Registry-Schlüssel (config/quiz.php);
                                              // unbekannt ⇒ 422, niemals stiller Reiter
    "submissionId": "3f2b6c9e-…",             // 🔴 PFLICHT, echte UUID — DIE Idempotenz.
                                              // Erzeugt vom Quiz-SERVER beim ersten
                                              // Einreihen (§4), stabil über jede
                                              // Wiederholung
    "hash": "qz_a1b2c3…",                     // 🔴 PFLICHT — der Lesegriff der Zeile.
                                              // Rang-Aktualisierer sucht WHERE hash=… (§6)
    "sessionHash": "ac_…",                    // optional (Post-Processor liest ihn,
                                              // bibliothek.js:1552)
    "token": "tf7m2…",                        // Pflicht — Kartei-Spalte token; heute
                                              // leadRun.token (core.js:486)
    "memberId": "25851739",                   // Pflicht — vom Adapter garantiert
                                              // (ensureBusinessSubmissionIdentity)
    "refId": "25851739",                      // optional, Standard = memberId
    "slug": "markus",                         // Berater-Slug (hidden.berater_slug)
    "language": "de",                         // de|it|en|fr|ru|hu (normalizeLang,
                                              // api/bridge.js:3118)
    "country": "AT",                          // hidden.c, ISO-2, optional
    "profileCode": "A",                       // A|B|C|D
    "profileLabel": "Typ A Der Macher",       // übersetztes Label
    "mainAspiration": "freedom",              // freedom|impact|security|growth — ein WERT
    "mainAspirationLabel": "Freiheit",        // nur Anzeige
    "projectVersion": "quiz-2026-08",         // optional → assessment_version
    "startedAt":  "2026-08-31T09:00:00.000Z", // landed_at
    "submittedAt":"2026-08-31T09:04:12.000Z"
  },
  "contact": {
    "firstName": "Anna",                      // Pflicht
    "email": "anna@example.com"               // Pflicht
    // BEWUSST NICHT: lastName, phone, gender — das Quiz erhebt sie nicht (§1b).
    // Wer sie später erhebt, ergänzt den Vertrag; er rät sie nicht.
  },
  "attribution": {                            // optional; unausgewertet — Contacts legt
    "utm_source": "…", "utm_medium": "…",     // sie 1:1 in form_response.hidden ab
    "utm_campaign": "…", "utm_content": "…",  // (Post-Processor/Mautic-Kompatibilität).
    "utm_campaign_id": "…", "utm_adset_id": "…",
    "utm_ad_id": "…", "utm_term": "…",
    "fbclid": "…", "fbc": "…", "fbp": "…",
    "event_source_url": "…"
  },
  "answers": [                                // Frage und Antwort reisen als PAAR
    { "key": "profile",         "question": "Dein Ergebnis",
      "answer": "Typ A Der Macher",           "values": ["A"] },
    { "key": "main_aspiration", "question": "Was dir am wichtigsten ist",
      "answer": "Freiheit",                   "values": ["freedom"] },
    { "key": "q1", "question": "<Frage 1, übersetzt>",
      "answer": "<gewähltes Label>",          "values": ["R"] },      // R|Y|G|B
    { "key": "q2", "…": "…",                  "values": ["G"] },
    { "key": "q3", "…": "…",                  "values": ["B"] },
    { "key": "q4", "…": "…",                  "values": ["freedom"] },  // Aspiration
    { "key": "q5", "…": "…",                  "values": ["growth"] },
    { "key": "q6", "…": "…",                  "values": ["vehicle"] }   // Barriere
  ]
}
```

Regeln:

1. **Paar-Format.** Beide Seiten jedes Paars entstehen im Quiz in **einer** Schleife aus
   `BUSINESS_SCHEMA` + `BUSINESS_COPY` — der Index-Verrutsch-Defekt der alten Route ist
   damit strukturell unmöglich (derselbe Grund wie bei Umfragen, Befund 8 dort).
2. **Kontaktfelder gehören nach `contact`**, nie in `answers`.
3. **Werte sind Werte**, keine übersetzten Wörter: `values` trägt die internen Schlüssel
   (`R|Y|G|B`, Aspirations-, Barriere-Schlüssel; Quelle `questionDefinitions`,
   `api/bridge.js:3495-3506`), `answer` das übersetzte Label für die Anzeige.
4. **`profileCode`/`mainAspiration` stehen doppelt** — in `meta` (maschinenlesbar, wird
   von Contacts in `form_response.hidden` gespiegelt, weil der Post Processor
   `hidden.profile_label`/`hidden.main_aspiration*` liest, `bibliothek.js:256-302`) und in
   `answers` (Kartei-Anzeige). Das spiegelt den heutigen Zustand (hidden **und**
   Antwortzeile, `api/bridge.js:3552-3601`) und ist Absicht.
5. **`variables`/`noemail` entfallen.** Die drei Schalter der Registry ersetzen `noemail`
   (so ausdrücklich in `contacts…/config/surveys.php:13-18`); `score` war konstant 0.
6. Contacts baut aus dem Vertrag die Typeform-Form der Kartei (`form_response`) **selbst**,
   in einer einzigen Übersetzungsklasse (`LegacyQuizResponse`, Vorbild
   `LegacySurveyResponse`) — inklusive `hidden` mit exakt den `meta`-/`attribution`-Feldern
   (deterministische Abbildung, damit Verbraucher 2 und 3 weiter finden, was sie lesen).

### 3b. Antwort — Kennungen statt leerem Body

```jsonc
200 { "message": "Submitted", "duplicate": false,
      "case": "neu" | "eigener_kontakt" | "fremder_kontakt_neu" | "fremder_kontakt_bleibt",
      "contact_id": 123, "contact_uuid": "…", "survey_id": 456, "survey_uuid": "…" }

200 { "message": "Already submitted", "duplicate": true,
      "contact_id": 123, "survey_id": 456, "survey_uuid": "…" }   // dieselbe submissionId

422 { "message": "meta.quiz is unknown" }     // Vertragsbruch, nichts geschrieben
401 / 406                                     // falsche / fehlende Signatur
503                                           // kein Geheimnis konfiguriert (fail-closed, §7)
```

🔴 **Ein 2xx ohne `contact_id` ist ein Befund** — die leere Antwort der alten Route war
der stille Fehler vom 26.08.2026. Der Absender behandelt 2xx-ohne-Kennung als
**Fehlschlag** und wiederholt; dank `submissionId` ist die Wiederholung gefahrlos und
liefert im Duplikatsfall die Kennungen nach.

### 3c. Idempotenz: warum `submissionId` eine Server-UUID ist — und der `qz_`-Hash es **nicht** sein darf

Geprüft am Quelltext, wie die Aufgabe verlangt:

| Eigenschaft des `qz_`-Hashes | Fundstelle | Folge für die Schlüsselfrage |
| --- | --- | --- |
| entsteht beim **Anlegen des Lead-Runs** im Browser, nicht beim Absenden | `src/lib/core.js:479-484` (`createLeadRun`, `generateId('qz', 24)`) | existiert vor der Übermittlung — dieselbe Klasse wie der Seiten-Hash, der bei Umfragen ausdrücklich ungeeignet war (432 Wiederholungen im Bestand, `contacts-survey-webhook.md`, Entscheidung 4) |
| `Math.random`, nicht kryptographisch | `src/lib/core.js` nutzt `generateId` → `api/bridge.js:3109-3116` (gleiche Bauart) | Kollisionen nicht erzwungen ausgeschlossen; im Kartei-Bestand gemessen **1270 verschiedene bei 1271 Zeilen** — es gibt bereits eine Wiederholung (`contacts-survey-webhook.md`, Entscheidung 4) |
| **klientengesteuert und fälschbar** | Live-Befund 24.08.2026: ein frei erfundener `qz_`-Hash erzeugte echte Datensätze (`api/bridge.js:3816-3818`) | ein Angreifer dürfte nicht bestimmen können, was als „Duplikat" verworfen wird |
| Server ersetzt/erzeugt ihn teils selbst | Fallback `api/bridge.js:3552`; Übernahme von Server-Hashes `src/lib/core.js:565-607` (`adoptResumeLeadRun`) | der Wert ist eine **Lead-Identität**, keine Durchlauf-Identität |
| Format `qz_`+24, nicht `char(36)` | `core.js:484` | passt nicht in die Semantik von `typeform_surveys.submission_id` (`char(36) UNIQUE`, belegt über `typeform_surveys_submission_id_unique` in `SurveyIntake.php:438`) |

**Entscheidung:** `submissionId` = `gen_random_uuid()` / `crypto.randomUUID()`, erzeugt
**serverseitig beim ersten Einreihen des Outbox-Auftrags** und im Auftrag gespeichert —
nie im Browser, nie pro Versuch neu (§4). Der `qz_`-Hash bleibt trotzdem **Pflichtfeld**
`meta.hash`: Er ist der Lesegriff der Zeile (Rang-Update §6, Resume, Kartei-Verknüpfung
`typeform_connected_surveys`, `SurveyIntake.php:341-345`) — nur eben nicht der Schlüssel
der Wiedererkennung. Genau diese Trennung (Griff ≠ Idempotenz) ist die Lehre der
Umfragen.

### 3d. Was Contacts mit dem Vertrag macht (Kurzfassung; Auftrag in §8/B2)

Drei Fälle wie bei den Umfragen (`SurveyIntake`), Doppelvergabe-Kontrolle **unverändert
vollständig** (coach-übergreifende Suche E-Mail **oder** Telefon, Bestellfrist aus der
Konfiguration); Kontakt + Kartei-Zeile in **einer** Transaktion; Duplikat über
`submission_id` **vor** der Fallentscheidung und zusätzlich als 1062-Fang im Wettlauf
(`SurveyIntake.php:84-119,435-439`). Kartei-Zeile: `hash` = `meta.hash` (Vorrang des
mitgebrachten Hashes wie `SurveyIntake.php:323`), `token`, `form_id 'hC2yTcU8'`,
`ref_id`, `survey_id` aus der Registry (`public_id '12'` — der Wert, den das Quiz heute
als `hidden.survey_id` sendet, `core.js:1570`), `locale`, `submission_id`,
`assessment_version`, `submitted_at`, `form_response`.

### 3e. Abweichungen vom Umfragen-Vertrag, begründet

| Abweichung | Begründung |
| --- | --- |
| kein `contact.lastName/phone*/gender*` | das Quiz erhebt sie nicht (§1b); Felder erfinden verbietet der Auftrag |
| `meta.quiz` statt `meta.survey` | eigene Registry `config/quiz.php`, eigener Namensraum — verhindert, dass ein Quiz-Absender in Umfragen-Reiter schreibt und umgekehrt |
| zusätzlich `meta.profileCode/Label`, `mainAspiration(+Label)`, `attribution`, `sessionHash`, `token` | Verbraucher 2 liest genau diese Werte aus `form_response.hidden`/`token` (`bibliothek.js:256-302,1544-1566`) — ohne sie brechen Mail 1+2, Mautic und Resume nach der Umstellung |
| `meta.hash` ist **Pflicht** (bei Umfragen optional mit `sv_`-Fallback) | Verbraucher 3 findet die Zeile nur über `hash` (§6); ein serverseitig erzeugter Fallback-Hash wäre ein anderer Wert als der, mit dem der Rang-Auftrag sucht |
| Mailschalter **alle aus**, `voucher_type: null` | Entscheidung Markus (Leitsatz „alles Lead-Bezogene im Repo"); bei Umfragen verschickt Contacts die Coach-Mail — hier nicht. Das Quiz kennt keinen Gutschein |
| `submissionId` entsteht **serverseitig im Quiz** (bei Umfragen im Next-Route-Handler) | die Outbox ist hier der Absender; der Schlüssel muss die Outbox-Wiederholung überleben und darf nicht je Versuch neu entstehen (§4) |

---

## 4. Idempotenz Ende zu Ende

Die Kette, Glied für Glied:

```text
Browser-Klick ──(lead_hash je Lead-Run)──► Adapter
Adapter ──(Einreihung dedupliziert je lead_hash)──► EIN Outbox-Auftrag mit EINER submissionId
Worker ──(Auftrag trägt eingefrorenen Payload)──► identischer Body bei jeder Wiederholung
Contacts ──(Unique-Index submission_id)──► genau EINE Kartei-Zeile, sonst duplicate:true
```

1. **Einreihung:** neue SQL-Funktion nach dem vorhandenen Muster von `enqueue_lead_sync`
   für `coach_hot_lead_email` (`supabase-lead-system-v2.sql:512-545`): Advisory-Lock über
   `('contacts_quiz_submission:'||lead_hash)`, dann `SELECT`-vor-`INSERT` — existiert schon
   ein Auftrag zu diesem `lead_hash`, wird **derselbe** zurückgegeben. Beim `INSERT` wird
   `context_data.submission_id := gen_random_uuid()` gesetzt und der **komplette
   Vertragspayload eingefroren** (`context_data.payload`). Damit gilt:
   - Doppelklick / Client-Wiederholung desselben Runs (gleicher `lead_hash`, Sendewache
     `quizSubmissionInFlight` in `core.js:1649-1658` hilft zusätzlich) → derselbe Auftrag,
     dieselbe `submissionId`.
   - Absichtliche zweite Teilnahme → neuer Run, neuer `lead_hash`
     (`getLeadRunForSubmission` legt nach `state='submitted'` neu an, `core.js:523-531`)
     → neue `submissionId` → **gewollt** neue Kartei-Zeile. Genau wie heute.
2. **Wiederholung:** Der Worker sendet bei jedem Versuch **denselben eingefrorenen Body**
   → dieselbe Signatur, dieselbe `submissionId`. Claim/Retry-Mechanik ist vorhanden:
   `claim_outbox_jobs` mit `FOR UPDATE SKIP LOCKED`, Backoff 2/5/15/60 Minuten,
   `max_attempts` (`supabase-lead-system-v2.sql:661-765`).
3. **Empfang:** Unique-Index `typeform_surveys_submission_id_unique` (existiert — Beleg
   `SurveyIntake.php:438`; B2 bestätigt ihn per `SHOW INDEX` in Produktion, **nur falls er
   dort fehlt** braucht es eine Migration). Wettlauf zweier Zustellungen → 1062-Fang →
   dieselbe Duplikat-Antwort statt 500.
4. **Antwort beim Duplikat:** `duplicate: true` **mit** Kennungen (§3b) — der Worker
   verbucht sie als Erfolg (`status='duplicate'` im Protokoll) und schreibt die Kennungen
   trotzdem nach `lead_state`.

| Störung | Schutzglied |
| --- | --- |
| Client sendet doppelt (Timeout, Doppelklick) | Enqueue-Dedup je `lead_hash` → eine `submissionId` |
| zwei Enqueues im Wettlauf | Advisory-Lock |
| Worker-Timeout nach erfolgreichem Empfang | Wiederholung mit derselben `submissionId` → `duplicate:true` |
| zwei Worker claimen gleichzeitig | `SKIP LOCKED`; zusätzlich contacts-seitiger 1062-Fang |
| 200 ohne `contact_id` (stiller Fehler) | Absender wertet als Fehlschlag; Wiederholung gefahrlos |
| Wiederholung Tage später (Replay nach Ausfall) | Unique-Index kennt kein Zeitfenster |

---

## 5. Kopplung 1: der Post Processor (Mail 1 + Mail 2) muss die neue Zeile finden

- Die neue Route schreibt in **dieselbe Tabelle** `typeform_surveys` (Model
  `TypeformSurvey`, wie `SurveyIntake.php:317`), mit `form_response` samt `hidden` in der
  Feldbelegung von §3a — der Post Processor liest genau daraus (§1a, Verbraucher 2).
- **Latenzänderung:** Die Zeile entsteht künftig ~1 Minute später (Outbox-Takt) — Mail 1+2
  damit bis ~6 statt ~5 Minuten nach Opt-in. Kein Störungszeichen; in
  [MAILWEGE](../MAILWEGE.md) nach dem Umschalten nachtragen.
- 🔴 **Offen und VOR dem Einfrieren des Vertrags zu klären** (§12.1): die exakte
  `WHERE`-Bedingung des Knotens `MySQL - Select New Candidate Surveys` (über die n8n-API
  **nur lesen**). Filtert er z. B. auf `form_id` oder `survey_id`, muss die Registry genau
  diese Werte liefern (`hC2yTcU8` / `12` sind dafür vorgesehen).
- **Beweis vor dem Umschalten (Teil von B2):** eine Probezeile über die neue Route mit
  Slug `markus` → der Post Processor muss sie im nächsten 5-Minuten-Lauf aufnehmen und
  Mail 1+2 an `info@global-sce.com` senden (Postmark-Tags `optin_coach`/`lead_access`).
  Danach Kartei-Zeile weich löschen (Verfahren wie beim Umfragen-Nachweis). Damit ist die
  Mailstrecke über den neuen Weg **vor** B5 einmal komplett bewiesen — an einer Zeile, die
  uns gehört.

---

## 6. Kopplung 2: der Rang-Aktualisierer (`WHERE hash = …`) — Nachtrag 31.08.2026

Der dritte Legacy-Weg (§1a, Verbraucher 3), am 31.08. am laufenden System gemessen. Er
aktualisiert genau die Zeile, deren Entstehung Strang B umbaut.

**Woher kommt der Such-`hash`?** Aus dem `qz_`-Lead-Hash, auf beiden Zubringern:

- Outbox-Weg: `api/lead-outbox-worker.js:621` (`leadHash = job.lead_hash`) → `:657`
  (`hash: leadHash` im POST an `update_result_by_hash`).
- Bridge-Weg: `api/bridge.js:4014-4017` (`n8nPayload = { hash: context.leadHash, … }`).

**Trifft er nach der Umstellung noch?** Ja, wenn zwei Bedingungen gelten — beide sind im
Vertrag festgeschrieben:

1. Die neue Route schreibt weiter nach `typeform_surveys` (belegt: `SurveyIntake` schreibt
   dorthin, die Quiz-Fassung übernimmt das; **kein** Tabellenwechsel — ein solcher wäre
   ein harter Bruch dieses Weges und findet nicht statt).
2. `typeform_surveys.hash` = `meta.hash` = **derselbe** `qz_`-Wert, den die Rang-Aufträge
   führen. Heute gilt das, weil `hidden.hash = lead_hash` (`core.js:1543`, Fallback
   `api/bridge.js:3552`) und die alte Route ihn ablegt — die 2.261 erledigten Aufträge
   beweisen die Treffer. Deshalb ist `meta.hash` **Pflichtfeld ohne serverseitigen
   Fallback-Ersatz** (§3e): ein von Contacts erfundener Ersatz-Hash wäre für den
   Rang-Aktualisierer unsichtbar.

**Fällt ein Leerlauf auf?** Ja — an beiden Zubringern, am Quelltext geprüft:

- Worker: `matchedRows < 1` **wirft** (`api/lead-outbox-worker.js:668-675`) →
  `mark_outbox_failed` → Wiederholungen 2/5/15/60 Min, danach `dead` mit `dead_at`
  (`supabase-lead-system-v2.sql:743-753`). Ein dauerhafter Leerlauf endet also als
  sichtbar toter Auftrag, nicht als stilles Nichts.
- Bridge: `shouldRetryPointsResult`/`pointsResultSucceeded` behandeln `matchedRows === 0`
  als Fehlschlag (`api/bridge.js:2542-2555`) → Wiederholung, dann **Alarmmail**
  `typeform_survey_not_found` (`:4032-4044`).

**Neues Zeitfenster durch die Outbox:** Die Kartei-Zeile entsteht künftig asynchron
(~1 Min). Ein `mysql_initial_rank`, der vorher feuert, läuft **einmal** ins Leere — der
2-Minuten-Backoff des zweiten Versuchs deckt das. Erwartbar sind also einzelne
`failed`-Zwischenstände, aber **kein einziger `dead`**.

**Absicherung, konkret:**

| Wann | Was | Beweis |
| --- | --- | --- |
| B2 (nach der Post-Processor-Probe, an derselben Probezeile) | Rang-Update gezielt auf den Probe-`hash` auslösen (Auftrag `mysql_rank_update` einreihen oder `update_result_by_hash` direkt mit dem Probe-Hash aufrufen) | Antwort trägt `matchedRows = 1`; `points_result` der Probezeile ist gesetzt |
| B4 (Schatten) | zählen: `dead`-Aufträge der Typen `mysql_*` | 0 — Referenzwert vor der Umstellung |
| B5/B6 (Umschaltwoche) | dieselbe Zählung **stündlich am Umschalttag, dann täglich**; plus Posteingang auf `alert_points_result_failed` | weiterhin 0 `dead`; einzelne `failed` mit anschliessendem `done` sind das erwartete Outbox-Zeitfenster |

**Umschaltreihenfolge:** Der `matchedRows=1`-Beweis an einer Zeile **aus der neuen Route**
ist Vorbedingung von B5 (§9). Es darf nie der Zustand entstehen „neue Route legt Zeilen
an, die der Rang-Aktualisierer nicht findet, während der alte Weg schon aus ist" — genau
dagegen stehen Pflichtfeld `meta.hash`, der B2-Beweis und die Zählwache.

---

## 7. Das Geheimniskonzept — die Schwäche der alten Route nicht erben

Die Lage der Gegenstelle ist erhoben und übergeben
([2026-08-31-contacts-signaturpruefung.md](../uebergaben/2026-08-31-contacts-signaturpruefung.md)):
Das geteilte `TYPEFORM_WEBHOOK_SECRET` steht im Klartext im contacts-Repo
(`config/typeform.php:18`) und ist in Produktion **nicht** überschrieben; zusätzlich ist
`Webhook::validatePayload` **fail-open** (`Webhook.php:112-118`: kein Geheimnis ⇒ keine
Prüfung). Beides zusammen heisst: Wer das Repo lesen kann, kann heute an jeder dieser
Routen gültig signieren.

Daraus die vier Festlegungen für `/webhook/quiz`:

1. **Eigener Wert, eigene Namen.** Absender: `CONTACTS_QUIZ_WEBHOOK_SECRET` und
   `CONTACTS_QUIZ_URL` (Quiz-App `yhoacszoiofuq6dg4mykyr7b`). Empfänger: eigener
   Konfigschlüssel `quiz.webhook_secret` aus `env('QUIZ_WEBHOOK_SECRET')` **ohne
   Vorgabewert** (contacts-App `ivvm0jpwozcczqokby0ty4yb`). Niemals
   `typeform.webhook.secret`, niemals `Webhook::validatePayload`. Der Wert: ≥32 Bytes aus
   einem kryptographischen Zufall, existiert **nur** in den beiden Coolify-Umgebungen
   (gesetzt über die Coolify-API) — nie im Repo, nie in Doku, nie im Chat.
2. **Fail-closed an beiden Enden.**
   - Contacts: fehlt `QUIZ_WEBHOOK_SECRET` → `503` + Fehlerprotokoll, **bevor** der Body
     angefasst wird. Fehlende Signatur → `406`, falsche → `401`; Vergleich zeitkonstant.
     (Die Haltung, die das Umfragen-Projekt an seinem Ende bereits hat.)
   - Quiz-Worker: fehlt `CONTACTS_QUIZ_WEBHOOK_SECRET` oder `CONTACTS_QUIZ_URL` bei
     Modus `an` → Auftrag `failed` mit `env_missing`, **laut**; es wird niemals
     unsigniert und niemals „ersatzweise irgendwohin" gesendet.
3. **Signatur:** HMAC-SHA256 über den **exakten rohen Body**, Header
   `Typeform-Signature: sha256=<base64>` — dieselbe Bauart wie die Nachbarn
   (`analysen/legacy/kontakte.js:25-28`, `Umfragen/src/server/signature.ts:3-6`), damit
   Werkzeuge und Tests übertragbar bleiben. Neu ist das Geheimnis, nicht die Mechanik.
4. **Rotationsweg** (ohne Deploy, ohne Lücke, nie am Tag anderer Eingriffe):
   contacts akzeptiert eine **Liste** von Werten (`quiz.webhook_secrets`, geprüft in
   Reihenfolge). Rotation = (1) neuen Wert bei contacts **zusätzlich** eintragen +
   Neustart + Probe mit altem Wert, (2) Quiz-Env auf den neuen Wert + Neustart + Probe,
   (3) alten Wert bei contacts entfernen + Gegenprobe (alter Wert ⇒ 401). Jede Stufe
   einzeln bewiesen. Der heute geteilte `TYPEFORM_*`-Wert bleibt von alledem unberührt —
   er gehört dem contacts-Projekt (Übergabedokument, „Punkt 108").

---

## 8. Das Zustellprotokoll im Quiz (Postgres)

Vorbild `analysen/legacy/zustellprotokoll.js` — mit dessen teuer bezahlter Lehre: dort
war das Protokoll einen Tag blind, weil es ein Feld las, das der Payload nicht mehr trug
(`zustellprotokoll.js:21-28`). Deshalb hier: Felder aus dem **eingefrorenen** Payload des
Auftrags, und ein Test, der aus einem echten Payload einen Eintrag entstehen lässt.

**Grundsätze** (wörtlich vom Vorbild übernommen): *Zeile VOR dem Senden. Ein Protokoll
ist nie ein Datenpfad* — jeder Protokollaufruf ist in `safely()` gekapselt; fällt das
Protokoll aus, läuft die Zustellung unverändert weiter und es wird nur gewarnt.

**Tabelle** (Migration neben `lead_sync_outbox`, im selben Schema und über denselben
Migrationsweg wie die Phase-5-Objekte):

```sql
CREATE TABLE IF NOT EXISTS contacts_zustellprotokoll (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  submission_id   uuid   NOT NULL UNIQUE,          -- dieselbe Eindeutigkeit wie drüben
  lead_hash       text   NOT NULL,                 -- qz_… (Lesegriff, Abgleich)
  outbox_job_id   bigint,                          -- Verweis auf lead_sync_outbox.id
  route           text   NOT NULL DEFAULT 'webhook_quiz',
  target_url      text   NOT NULL,
  status          text   NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('schatten','pending','success','duplicate','failed')),
  http_status     int,
  contact_id      bigint,                          -- 🔴 die Kennungen aus der Antwort:
  survey_id       bigint,                          --    ohne sie ist 2xx kein Erfolg
  response_body   text,                            -- gekürzt (4000)
  error_message   text,                            -- gekürzt (1000)
  attempt_count   int    NOT NULL DEFAULT 1,
  member_id       text, first_name text, email text,
  payload         jsonb  NOT NULL,                 -- der exakt gesendete Body
  last_attempt_at timestamptz, sent_at timestamptz,
  created_at      timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_czp_created ON contacts_zustellprotokoll (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_czp_status  ON contacts_zustellprotokoll (status, created_at DESC);
```

**Ablauf je Versuch:** `INSERT … ON CONFLICT (submission_id) DO UPDATE SET
attempt_count = attempt_count + 1, status = 'pending', http_status = NULL, …` (ein Eintrag
je Übermittlung, Wiederholung zählt hoch statt zu überschreiben — exakt die Mechanik von
`zustellprotokoll.js:54-72`). Nach der Antwort: `success`/`duplicate` mit `contact_id`,
`survey_id`, `sent_at`; sonst `failed` mit Fehlertext.

**Abgrenzung zur Outbox:** Die Outbox ist der **Antrieb** (auftragszentriert, wird
irgendwann aufgeräumt, `response_data` ist Betriebsdatum). Das Protokoll ist der
**Beweis** (übermittlungszentriert, trägt die Contacts-Kennungen, Grundlage des
Nachzählens in §10). Der Schattenmodus (§9/B4) schreibt ausschliesslich hierher
(`status='schatten'`), gesendet wird dabei nichts.

---

## 9. Die Schritte

Nummerierung B1–B7; sie verfeinert die B-Reihe des übergeordneten Plans (dessen B4
„Umschalten" wird hier B5, dessen B5 „Rückbau" wird B7). Jeder Schritt wird erst begonnen,
wenn der Beweis des vorigen **vorliegt** — Fristen verkürzen nie die Prüfung (R0).

### B1 — Vertrag einfrieren

| | |
| --- | --- |
| Vorbedingung | §12.1 geklärt (Kandidaten-SELECT des Post Processors gelesen; Vertrag deckt dessen Felder nachweislich) |
| Artefakte | dieser §3, festgeschrieben als `docs/contacts-quiz-webhook-vertrag.md` im Quiz-Repo; Kopie/Verweis an das contacts-Projekt |
| Beweis | Vertrag liegt schriftlich vor, **bevor** irgendjemand baut; Feld-für-Feld-Abgleich gegen §1b und gegen die Feldliste aus `bibliothek.js` ist im Dokument enthalten |
| Rückweg | keiner nötig — nur Papier |
| Was schiefgehen kann | Vertrag deckt ein Post-Processor-Feld nicht → fällt im Abgleich auf, nicht erst in Produktion |

### B2 — 🔴 Contacts zuerst (Auftrag an das contacts-Projekt, klar abgegrenzt)

**Was das contacts-Projekt baut** (Vorbild `/webhook/survey`, alte Route unangetastet):

| Artefakt | Inhalt |
| --- | --- |
| `routes/webhook.php` | `Route::post('quiz', QuizWebhookController)` — **daneben**, nicht statt |
| `QuizWebhookController` | eigene **fail-closed** Signaturprüfung gegen `config('quiz.webhook_secrets')` (§7) — ausdrücklich **nicht** `Webhook::validatePayload` |
| `QuizPayload` | prüft und normalisiert den Vertrag, entscheidet nichts; unbekanntes `meta.quiz` ⇒ 422 |
| `LegacyQuizResponse` | die **einzige** Stelle, an der Typeform-Form entsteht; `hidden` deterministisch aus `meta` + `attribution` (§3a Regel 6); beide Listen aus **einer** Schleife |
| `QuizIntake` | drei Fälle + Doppelvergabe-Kontrolle wie `SurveyIntake`; Duplikat vor Fallentscheidung + 1062-Fang; Kartei-Zeile nach §3d (`hash` = `meta.hash`) |
| `config/quiz.php` | Registry: `'erfolgscode' => [form_id 'hC2yTcU8', public_id '12', voucher_type null, contact_email false, coach_email false]` + Kommentar, **warum** die Schalter aus sind (Post Processor sendet; `true` hiesse Doppelversand) |
| Index | `SHOW INDEX` bestätigt `typeform_surveys_submission_id_unique` in Produktion; **nur falls er fehlt:** Migration, die ihn anlegt (Bestand vorher auf Dubletten prüfen) |
| Tests | nach dem Muster der 23 `SurveyWebhookTest`-Prüfungen: Signatur (fehlt/falsch/ohne Secret ⇒ 406/401/503), unbekannter Schlüssel, Idempotenz + Wettlauf, drei Fälle, `hash`-Vorrang, **Mailschalter-Wache** (kein Mailversand, egal was passiert) |
| Env | `QUIZ_WEBHOOK_SECRET` in der Coolify-App `contacts` **vor** dem Routen-Deploy setzen (ohne ihn antwortet die Route 503 — das ist ungefährlich, aber der Beweis braucht ihn) |
| Empfohlen | Übergangswache „Kreuz-Duplikat": existiert binnen 7 Tagen bereits eine Zeile mit demselben `hash`, antworte `duplicate:true` statt eine zweite anzulegen. Zweck: schliesst das Flip-Fenster-Restrisiko (§9/B5). Kaveat ehrlich benennen: `qz_`-Hashes sind zu 1270/1271 eindeutig — die Wache kann theoretisch eine echte Neuteilnahme in der 7-Tage-Frist verwerfen; deshalb Fenster klein und Protokolleintrag je Treffer |

**Beweis (alles am laufenden Dienst, nichts davon bleibt stehen):**
1. Drei Proben, die nichts schreiben: ohne Signatur ⇒ 406, falsche ⇒ 401, gültig mit
   unbekanntem `meta.quiz` ⇒ 422 (dasselbe Probenmuster wie beim Umfragen-Nachweis).
2. Eine schreibende Probe (Slug `markus`) ⇒ 200 mit `contact_id`; Wiederholung desselben
   Bodys ⇒ `duplicate:true` mit denselben Kennungen.
3. **Post-Processor-Beweis** (§5): Probezeile löst Mail 1+2 an `info@global-sce.com` aus.
4. **Rang-Beweis** (§6): Rang-Update auf den Probe-`hash` ⇒ `matchedRows = 1`.
5. Danach Probe-Spuren weich löschen; Mailschalter-Wache-Test bleibt grün.

**Rückweg:** Deploy des contacts-Repos zurückrollen — kein Absender nutzt die Route, die
alte Route ist unberührt. **Frühwarnung:** contacts-Testsuite; 503/401-Zähler im Log.

### B3 — Absender im Quiz bauen, **inaktiv** ausliefern

| | |
| --- | --- |
| Vorbedingung | B2 vollständig bewiesen |
| Artefakte | (a) `legacy/kontakte.js` (Ordner samt Lint-Grenze aus Strang A2 — existiert er noch nicht, legt B3 ihn an): Payload-Bau in **einer** Schleife aus `BUSINESS_SCHEMA`/`BUSINESS_COPY`, HMAC über den exakten Body, 15-s-Zeitfenster, liefert `{ok,status,body}`; (b) SQL-Migration: Enqueue-Funktion mit Dedup + `submission_id` (§4) und Protokolltabelle (§8); (c) Worker: neue Auftragsart `contacts_quiz_submission` in `SUPPORTED_SYNC_TYPES` mit Protokoll-vor-Versand, Antwort-Auswertung (2xx **mit** `contact_id` oder `duplicate` ⇒ done; sonst failed), Kennungen nach `lead_state` (`mysql_contact_id`/`mysql_survey_id`/`sync_status`); (d) Adapter-Umbau hinter Modus-Schalter (§9a), Standard **`aus`**; (e) Tests: Feldparität Vertragspayload ↔ heutiger `buildBusinessTypeformPayload`-Inhalt, Idempotenz der Einreihung, `env_missing`-Fail-closed, Protokolleintrag aus echtem Payload |
| Beweis | Testsuite grün; **ein Deploy, bei dem sich nichts ändert** (Gegenprobe wie bei A3/B1 des Mailweg-Plans: gleiche Opt-in-Verarbeitung, gleicher Forward, Protokolltabelle bleibt leer); CI-Nachweis über `/health/live` |
| Rückweg | Deploy zurück; da der Pfad inaktiv ist, ohne Betriebsfolge |
| Was schiefgehen kann | Schalter-Standard versehentlich nicht `aus` → der Paritäts-Deploy-Beweis fängt genau das; ein Test erzwingt `aus` bei fehlender Env |

### B4 — Schattenlauf (senden tut weiter NUR der alte Weg)

| | |
| --- | --- |
| Vorbedingung | B3 ausgeliefert und nachweislich wirkungslos |
| Artefakte | `CONTACTS_QUIZ_MODUS=schatten` (Coolify-Env, App-Neustart, kein Deploy). Je echtem Opt-in: alter Weg sendet unverändert; zusätzlich wird der neue Vertragspayload gebaut und als Protokollzeile `status='schatten'` **haltbar** abgelegt (Lehre aus B2a des Mailweg-Plans: nicht nur `console.warn`) — **gesendet wird im Schatten NIE** |
| Beweis | über **mehrere Tage** (R0): (1) Zeilenzahl `schatten` = Zahl der Opt-ins, täglich; (2) Feldvergleich je Zeile: Schattenpayload enthält alle Werte, die im real gesendeten Typeform-Payload stehen (`hash`, `member_id`, `token`, Antworten, Attribution) — **0 Abweichungen** an echten Aufrufen; (3) Referenzzählung `dead`-Aufträge `mysql_*` = 0 (§6) |
| Rückweg | `CONTACTS_QUIZ_MODUS` löschen — ohne Deploy |
| Was schiefgehen kann | Payload-Bau wirft und beschädigt den Sendepfad → deshalb ist der Schattenzweig komplett in `safely()` gekapselt (dieselbe Regel wie beim Protokoll: der Schatten ist nie ein Datenpfad). Frühwarnung: Fehlerzähler des Schattenzweigs im Log/GlitchTip |

### B5 — 🔴 Umschalten

**Vorbedingungen (Checkliste, jede einzeln abgehakt):** B2-Beweise 1–5 liegen vor ·
B4 lief ≥ 3 Werktage mit 0 Abweichungen · beide Geheimnisse gesetzt und per Probe geprüft ·
keine offenen `failed`/`dead`-Aufträge · **am selben Tag kein anderer Eingriff** in
Versand- oder Übermittlungswege · Umschaltzeit nachts/verkehrsarm (Opt-in-Pausen ≥ 3 h
sind häufig, [MAILWEGE §2](../MAILWEGE.md)) · Markus weiss Bescheid.

| | |
| --- | --- |
| Artefakt | `CONTACTS_QUIZ_MODUS=an` (Coolify-API, App-Neustart — **kein Deploy**) |
| Wirkung | Adapter reiht ein statt zu forwarden; ab jetzt entsteht die Kartei-Zeile über `/webhook/quiz`. Die rohe Aktion `forward_webhook` (alte gecachte Bundles) bleibt auf dem alten Weg — je Übermittlung gibt es weiterhin **genau einen** Weg |
| Sofortprobe (innerhalb 15 Min) | eigenes Test-Opt-in mit Slug `markus`: Protokoll `success` mit `contact_id` · Kartei-Zeile sichtbar · Mail 1+2 kommen (≤ ~7 Min) · Rang: zugehöriger `mysql_initial_rank` endet `done` |
| Beweis | §10-Nachzählen ab Tag 1, **mindestens 3 Tage** — eine Nacht ist keine Messreihe (R0) |
| Rückweg | §11-Notausstieg: Modus löschen, ohne Deploy |
| Was schiefgehen kann + Frühwarnung | siehe Tabelle §9b |

### B6 — Ruhephase und Nachweisführung

≥ 14 Tage Modus `an` mit täglichem §10-Abgleich, 0 unerklärten Abweichungen, 0 `dead`
(`contacts_quiz_submission` **und** `mysql_*`). Erst danach B7. In dieser Phase wird der
`AC - Lead System Health Monitor` (alle 15 Min) um zwei Zähler erweitert:
`failed`/`dead`-Contacts-Aufträge und Protokollzeilen `failed` älter als 2 h.

### B7 — Rückbau (der einzige Schritt, dessen Rückweg ein Deploy ist)

`forward_webhook`-Pfad (Adapterzweig `:4093` und rohe Aktion `:4191`), `proxyToBridge`
für diesen Zweck, `TYPEFORM_TARGET`, toten Readback (`readMysqlTable`,
`loadFinalBusinessLeadContext`, `HBA_READ_BRIDGE_URL`) ausbauen; `scripts/verify.js:309`
(prüft heute auf den String `action: 'forward_webhook'`) mitziehen; `BRIDGE_*`-Env erst
entfernen, wenn auch Strang A sie nicht mehr braucht. **Vorher:** Zugriffslog daraufhin
prüfen, dass die rohe Aktion seit ≥ 14 Tagen keinen Aufruf mehr hatte (gecachte Bundles,
§12.6). Beweis: `grep` findet keinen Aufruf; Deploy mit unverändertem Opt-in-Verhalten.
Rückweg: Git-Revert + Deploy.

### 9a. Der Modus-Schalter, präzise

| `CONTACTS_QUIZ_MODUS` | Verhalten |
| --- | --- |
| fehlt / `aus` | exakt heutiges Verhalten (Forward über die Bridge). **Standard.** |
| `schatten` | heutiges Verhalten **plus** Schattenprotokoll; es wird nie an die neue Route gesendet |
| `an` | Outbox → `/webhook/quiz`; kein Forward an die alte Route |

Vorrangregel (fail-safe in Richtung des alten, bewiesenen Weges): Ist der Modus `an`,
fehlt aber `CONTACTS_QUIZ_URL` oder das Geheimnis, verhält sich der **Adapter** wie `aus`
und meldet laut (Opt-ins gehen weiter den alten Weg); der **Worker** stellt bereits
eingereihte Contacts-Aufträge auf `failed`/`env_missing`, nie auf einen Ersatzweg.

### 9b. Was NICHT gleichzeitig laufen darf

| Verboten | Warum | Wache |
| --- | --- | --- |
| dieselbe Übermittlung über **beide** Routen | doppelte Kartei-Zeile ⇒ der Post Processor verschickt Mail 1+2 **doppelt** — die teuerste Fehlerwirkung | Modus ist exklusiv (ein `if`, kein „und"); Schatten sendet nie; Kreuz-Duplikat-Wache (B2); Nachzählen §10 |
| `coach_email`/`contact_email` der neuen Route auf `true`, solange der Post Processor läuft | Contacts UND n8n würden mailen | Registry-Werte `false` + contacts-Test „Mailschalter-Wache"; Änderung nur zusammen mit Strang C |
| Strang C beginnen, bevor B5 ruhig läuft (B6) | zwei gleichzeitige Eingriffe in denselben Mailweg | Reihenfolge im übergeordneten Plan; dieses Dokument |
| B5 am selben Tag wie irgendein anderer Eingriff in Versand-/Übermittlungswege (auch Secret-Rotation §7) | dreimal belegte Fehlerklasse | Checkliste B5 |
| Umschalten, solange `failed`/`dead`-Aufträge offen sind | Altlasten und neue Fehler werden ununterscheidbar | Checkliste B5 |

**Restrisiko Flip-Fenster, ehrlich benannt:** Ein Opt-in, dessen erster Versuch vor dem
Umschalten serverseitig ankam, dessen Antwort aber verloren ging, könnte vom Browser nach
dem Umschalten wiederholt werden — Versuch 1 alte Route, Versuch 2 neue, die neue kennt
die `submissionId` des alten Weges nicht. Fenster: Minuten, nachts, nur bei gleichzeitigem
Netzfehler. Gegenmittel: Umschaltzeit verkehrsarm, Kreuz-Duplikat-Wache über `hash` (B2),
und §10 erkennt jede E-Mail-Doppel-Zeile am Folgetag. Ganz ausschliessen kann das nur ein
beidseitiger Schlüssel — den Preis (geteilte Kennungsvergabe mit der alten Route, die wir
nicht anfassen) zahlen wir bewusst nicht.

---

## 10. Erfolg messen statt annehmen

Ein 2xx ist kein Beweis — die leere Antwort der alten Route hat am 26.08.2026 bei den
Nachbarn genau so einen stillen Fehler versteckt. Deshalb vier **unabhängige** Zähler,
täglich je Kalendertag (MESZ), ab B5 mindestens drei Tage, danach wöchentlich:

| Zähler | Quelle | Sollwert |
| --- | --- | --- |
| A: Opt-ins | Quiz-Postgres, `lead_state` mit `form_submitted_at` am Tag | Referenz |
| B: Zustellungen | `contacts_zustellprotokoll`: `success`+`duplicate` **mit** `contact_id` | = A (Differenz nur durch noch offene Wiederholungen, am Folgetag 0) |
| C: Mails | Postmark, Tags `optin_coach` + `lead_access` (🔴 Zeitstempel EDT, MESZ = +6 h — [MAILWEGE §5 Falle 5](../MAILWEGE.md)) | = 2 × A |
| D: Kartei (Auftrag an contacts, ein Lesescript) | `typeform_surveys` je Tag mit `form_id='hC2yTcU8'`: Zeilenzahl, doppelte `submission_id` (muss 0 sein), doppelte `hash` im 7-Tage-Fenster, doppelte `email` am Tag | = A; Dubletten 0 |

Dazu je Prüfung: `dead`-Aufträge beider Typfamilien = 0 (§6), `alert_*`-Postfach leer,
und **eine Stichprobe von Hand**: Markus öffnet einen frischen Lead in der Kartei und
sieht Name, Antworten paarweise, Berater korrekt. Während der Übergangswoche zählt D
zusätzlich getrennt, wie viele Zeilen je Weg entstanden (die alte Route ist an fehlender
`submission_id`/`assessment_version` erkennbar — dieselben Spalten, die auf dem alten Weg
tot sind, Beleg `contacts-survey-webhook.md` „Befund 5") — die **Summe** beider Wege muss
A ergeben, sonst ist ein Lead verloren oder doppelt.

Jede Abweichung ist ein Befund und stoppt den Weiterbetrieb des Schrittes, in dem sie
auftrat — nicht wegerklären, messen.

---

## 11. Rückwege

| Stand | Rückweg | Deploy nötig? |
| --- | --- | --- |
| nach B1 | keiner (Papier) | – |
| nach B2 | contacts-Deploy zurück; Route hat keinen Absender | contacts-seitig |
| nach B3 | Quiz-Deploy zurück; Pfad war ohnehin inaktiv | ja, folgenlos |
| nach B4 | `CONTACTS_QUIZ_MODUS` löschen | **nein** |
| nach B5/B6 | 🔴 **Notausstieg:** `CONTACTS_QUIZ_MODUS` löschen (Coolify-API + App-Neustart) ⇒ alle neuen Opt-ins sofort wieder alter Weg | **nein** |
| nach B7 | Git-Revert + Deploy (deshalb B7 erst nach B6-Ruhe) | ja |

**Nachlauf des Notausstiegs:** Bereits eingereihte, noch nicht zugestellte
Contacts-Aufträge laufen nach dem Löschen der Env auf `failed`/`env_missing` und bleiben
sichtbar liegen (kein stiller Verlust — der Lead selbst steht in `lead_state`). Abtropfen
nach Behebung der Ursache: Modus kurz wieder `an` bis 0 offene Aufträge, oder Einzelversand
per Skript mit demselben eingefrorenen Payload. Beides ist durch die `submissionId`
beliebig wiederholbar, ohne dass etwas doppelt ankommt. 🔴 Im Rückwegzustand entstehen
diese Kartei-Zeilen erst mit dem Abtropfen — solange bekommen Berater für diese Leads
keine Mail 1/2; deshalb gehört zum Notausstieg immer die Zählung „offene
`contacts_quiz_submission`-Aufträge" und ihre Abarbeitung.

**Risikoübersicht mit Frühwarnung:**

| Risiko | Wirkung | Frühwarnung / Wache |
| --- | --- | --- |
| 🔴 Doppelversand | Lead/Berater bekommen alles doppelt | §9b-Verbote; Unique-Index; Kreuz-Duplikat-Wache; Zähler C=2×A und D-Dubletten |
| Verlorener Lead (Kartei) | Berater sieht Lead nicht, Mail 1/2 fehlt | Protokollzeile bleibt `pending`/`failed`; Health-Monitor-Zähler; B=A-Abgleich; `dead`=0-Wache |
| Rang-Update trifft nicht mehr (§6) | `points_result` veraltet still | `matchedRows<1` wirft (Worker) / Alarmmail (Bridge); `dead`-Zählung `mysql_*` |
| Post Processor findet Zeile nicht (§5) | Mail 1+2 bleiben aus | B2-Beweis 3 vor dem Umschalten; C-Zähler bricht auf 0 ein — fällt am ersten Tag auf |
| Plattform-DB-Ausfall wird zum Opt-in-Ausfall | heute überlebt das Opt-in über den MySQL-Weg; im Modus `an` hängt alles an der eigenen Postgres | ehrlich benannt: gleiche Abhängigkeit wie `lead-track` heute; `/health/live`-CI, Health-Monitor; Notausstieg stellt den alten Weg in Minuten wieder her |
| Geheimnis-Panne (falsch gesetzt, rotiert am falschen Tag) | 401er, Aufträge stauen sich — kein Verlust, aber Verzug | fail-closed + Protokoll `failed` mit `http_status=401`; Rotationsregeln §7 |
| Schattenzweig stört den Sendepfad | Opt-in-Fehler in B4 | `safely()`-Kapselung; Fehlerzähler; B4 ist per Env sofort aus |

---

## 12. Offen / unbelegt (nicht raten — vor dem jeweiligen Schritt klären)

1. **Kandidaten-SELECT des Post Processors** (`MySQL - Select New Candidate Surveys`):
   exakte `WHERE`-Bedingung und welche Zeilen-Spalten der Job-Insert liest — über die
   n8n-API **nur lesen**, vor B1-Einfrierung. (Die Feldnutzung der Bibliothek ist belegt,
   die des SQL-Knotens noch nicht.)
2. **Dedup-Verhalten der alten Route** (Token?): bestimmt die Restgrösse des
   Flip-Fenster-Risikos (§9b). Am 440-Zeilen-Controller nachlesen, nichts ändern.
3. **Weitere Pflichtspalten von `typeform_surveys`** ohne Default: prüft contacts in B2
   am Schema, nicht wir am Vorbild.
4. **Schema-Ort der neuen Quiz-Objekte** (`public` im Repo-SQL, `leads` im
   Phase-5-Import): dem vorhandenen Migrationsweg folgen; vor B3 festlegen.
5. **`max_attempts` für `contacts_quiz_submission`**: Standard 5 ⇒ `dead` nach ~82 Min.
   Für einen längeren contacts-Ausfall vermutlich zu knapp — Vorschlag 8 Versuche
   (letzte Stufe 60 Min ⇒ ~5 h Deckung); vor B3 entscheiden.
6. **Aufrufer der rohen `forward_webhook`-Aktion**: im Bundle keiner (belegt, §1);
   Live-Traffic alter gecachter Bundles vor B7 am Zugriffslog messen.
7. **`markus`/`default`-Zustellung der Probemails** (B2-Beweis 3) setzt voraus, dass die
   Slug-Zuordnung zu `info@global-sce.com` unverändert gilt ([MAILWEGE §2](../MAILWEGE.md),
   Stand 28.08.) — am Probetag kurz mitprüfen.

---

*Bezugsdokumente:* [bridge-abloesen-direktzugriff.md](bridge-abloesen-direktzugriff.md) ·
[2026-08-31-contacts-signaturpruefung.md](../uebergaben/2026-08-31-contacts-signaturpruefung.md) ·
[MAILWEGE.md](../MAILWEGE.md) · `Umfragen/docs/contacts-survey-webhook.md` ·
`analysen/legacy/kontakte.js` + `zustellprotokoll.js` ·
`contacts-activecenter-legacy` (`routes/webhook.php`, `SurveyWebhookController.php`,
`SurveyIntake.php`, `config/surveys.php`).
