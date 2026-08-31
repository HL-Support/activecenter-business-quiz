# Übergabe an das contacts-Projekt: `meta` gehört nach `form_response.hidden`

**Erhoben am 31.08.2026 am laufenden System.** Betrifft `contacts-activecenter-legacy`,
ausgelieferter Stand `f7882db`, Route `POST /webhook/quiz`.

> **Kurzfassung:** Die Route ist gebaut und nimmt an. Aber sie legt die mitgesendeten
> `meta`-Felder nicht in `form_response.hidden` ab — und genau von dort holt sich der n8n-
> Post-Processor Profil, Ziel, Barriere und Berater-Slug. Würde das Quiz heute umgeschaltet,
> gingen Mail 1 und Mail 2 weiter raus, aber mit **„Unbekannt"** statt Profil und Ziel.
> Kein Fehler, keine Meldung. **Das blockiert B5 (Umschalten) im Quiz-Projekt, sonst nichts.**

---

## 1. Was fehlt, genau

`LegacySurveyResponse::build` (`app/Services/Survey/LegacySurveyResponse.php:42-53`)
schreibt in `hidden` acht Felder:

```
member_id  ref_id  survey_id  hash  lang  language  submission_id  gender_code
```

Der Workflow `AC - Lead Post Processor - Business Leads Quiz` (`9RZdrLxfA8IRhd55`,
`updatedAt` 31.08.2026 12:31, über die n8n-API gelesen) liest **19**:

```
barrier_slug  berater_slug  funnel  funnel_key  hash  lang  lead_barrier  lead_hash
main_aspiration  main_aspiration_label  main_aspiration_slug  member_id  profile_label
profile_slug  profile_summary  ref_id  session_hash  slug  tracking_hash
```

Zusätzlich bekommen die Antworten in `LegacySurveyResponse` den eigenen Namensraum
`a_<key>` (Z. 98). Der Post Processor sucht seinen Rückfall unter den `ref`s
`lead_profile_result` und `lead_main_aspiration` — er greift damit ebenfalls nicht.

**Beides zusammen heisst: für Profil, Ziel und Barriere gibt es keinen einzigen Weg mehr.**

## 2. Die Wirkung, Kette für Kette

Aus dem Knoten `Code - Build Lead Model`:

| Wert | Kette im Workflow | Ergebnis ohne Spiegel |
| --- | --- | --- |
| `profile_label` | `vars.profile_label` → Antwort `lead_profile_result` → `hidden.profile_label` → `points.*` | 🔴 **„Unbekannt"** (Z. 252-260) |
| `profile_slug` | analog | 🔴 **„unknown"** (Z. 262-270) |
| `main_aspiration_label` | analog | 🔴 **„Unbekannt"** (Z. 281-288) |
| `main_aspiration` | `vars` → `hidden.main_aspiration` → … | leer (Z. 290-298) |
| `barrier_slug` | `vars.barrier_slug` → `vars.lead_barrier` → `hidden.barrier_slug` → `hidden.lead_barrier` | leer (Z. 1647) |
| `profile_summary` | `vars` → `hidden.profile_summary` | leer (Z. 274-279) |
| `berater_slug` / `slug` | nur `hidden` | Berater-Rückfall im Kandidaten-SELECT (`u_slug`-JOIN) und die Coach-Quiz-Adresse fallen aus |
| `session_hash` / `tracking_hash` | `row.session_hash` → `hidden.*` | leer; der Wiederaufnahme-Link überlebt, weil derselbe Knoten `leadHash` mitsendet |
| `funnel` / `funnel_key` | nur `hidden` | Standardwerte (Z. 351-352) |

Es ist dieselbe Fehlerklasse, die das Quiz-Projekt am 31.08. als M2a behoben hat: Die Mails
liefen weiter, sie waren nur inhaltlich falsch.

## 3. Was zu bauen ist

Die `meta`-Felder, die der Absender ohnehin schickt (Vertrag:
`business_leads_quiz/docs/contacts-quiz-webhook-vertrag.md` §1), nach `hidden` durchreichen.
Vorschlag — eine deterministische Abbildung, kein Raten:

| `hidden`-Schlüssel | Quelle im Vertrag |
| --- | --- |
| `lead_hash` | `meta.hash` (zusätzlich zum vorhandenen `hash`) |
| `session_hash`, `tracking_hash` | `meta.sessionHash` |
| `berater_slug`, `slug` | `meta.slug` |
| `profile_slug` | `meta.profileCode` |
| `profile_label` | `meta.profileLabel` |
| `main_aspiration`, `main_aspiration_slug` | `meta.mainAspiration` |
| `main_aspiration_label` | `meta.mainAspirationLabel` |
| `barrier_slug`, `lead_barrier` | `meta.barrier` |
| `funnel`, `funnel_key` | fest `business` — der Post Processor bedient nur diesen Funnel |
| die `attribution`-Felder 1:1 | `attribution.*` (`utm_*`, `fbclid`, `fbc`, `fbp`, `event_source_url`) |

Leere Werte fallen wie bisher über `array_filter` heraus.

**Wo das hingehört, ist eure Entscheidung.** Zwei gangbare Wege:

1. `SurveyPayload` um die optionalen Felder erweitern und `LegacySurveyResponse` sie
   ausgeben lassen — sie sind für Umfragen schlicht leer.
2. Ein durchgereichter, geprüfter `meta.hidden`-Beutel (Allowlist von Schlüsseln), den
   `LegacySurveyResponse` an `hidden` anfügt. Das hält den Umfragen-Pfad völlig unberührt.

🔴 **Was in beiden Fällen gilt:** Keine dieser Angaben darf fachlich etwas entscheiden.
`hidden` ist Anzeige- und Weitergabedatum. Die Zuordnung des Kontakts bleibt, wo sie ist —
in `SurveyIntake`, über `meta.memberId`. Eine Regel, ein Ort.

## 4. Der Beweis, den wir brauchen

Eine Probezeile über `/webhook/quiz` mit Slug `markus` und vollständigem `meta` ⇒ der Post
Processor nimmt sie im nächsten 5-Minuten-Lauf auf ⇒ Mail 1 und Mail 2 an
`info@global-sce.com` tragen **das richtige Profil und das richtige Ziel**, nicht
„Unbekannt". Danach die Probespuren weich löschen.

Das ist derselbe Nachweis, der als Plan-B-Schritt „B2-Beweis 3" ohnehin vorgesehen war —
er prüft jetzt zusätzlich genau diesen Punkt.

## 5. Was NICHT geändert werden soll

- **Der Kartei-Token** (`SurveyPayload::token()`, `sv…`). Nachgeprüft: `typeform_surveys.token`
  wird vom Post Processor nur mitgeführt, der Wiederaufnahme-Link entsteht über
  `generate_resume_token` mit `leadHash`. Kein Handlungsbedarf.
- **`meta.survey` als Schlüsselname.** Der Quiz-Absender ist darauf eingestellt; der Plan
  hatte `meta.quiz` vorgesehen, das ist als Korrektur K1 im Vertrag festgehalten. Eine
  Umbenennung jetzt wäre eine zweite Änderung auf demselben Weg.
- **Die Registry-Kennungen** `form_id 'hC2yTcU8'` und `public_id '12'`. Sie sind am Bestand
  gemessen und tragen den Anschluss an 678 vorhandene Zeilen.

---

*Absender dieser Übergabe:* Business-Leads-Quiz, Strang B (Plan
`docs/plans/umsetzung-b-lead-uebergabe.md`). *Vorgänger:*
[2026-08-31-contacts-signaturpruefung.md](2026-08-31-contacts-signaturpruefung.md).
