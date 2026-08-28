# AC - Quiz Nurture Email Sender — Vollständige Spezifikation

**n8n Workflow-ID:** `RqKSRTgFv8mv04H2`
**Status:** AKTIV (`A2/B1/C1/D1` normal in DE/IT/EN, `A3/B2/C2/D2` als 48h-Pilot mit 10 Sends pro Phase in DE/IT/EN)
**Letzte Aktualisierung:** 2026-06-23

---

## 1. Grundprinzip (NICHT verhandelbar)

> **Supabase entscheidet. Mautic personalisiert und sendet.**

- **Entscheidung** (welche Phase / welche Mail) → kommt IMMER aus Supabase `v_lead_state_full`
- **Mautic** liefert nur normalisierte Personalisierungs-Felder und versendet
- Mautic-Felder (`ac_v31_lifecycle_stage`, `quiz_cta_type`) sind nur Cache/Anzeige — sie dürfen die Mail-Entscheidung NIE beeinflussen

---

## 2. Die einzige Wahrheitsquelle: `v_lead_state_full`

Supabase View. Filter (robust, beide zusammen): **`source_app = business_leads_quiz` AND `funnel_key = business`**.
- `source_app` identifiziert die schreibende Quiz-Seite (entscheidend — die Landing-Page schreibt anderen source_app und bekommt später eigene Mails).
- `funnel_key = business` als zusätzliche Absicherung. Aktuell haben alle Quiz-Zeilen beide Werte; `source_app` allein reicht momentan, aber beide kombiniert sind zukunftssicher.

| Feld | Typ | Bedeutung |
|------|-----|-----------|
| `lead_hash` | text `qz_...` | Kanonische v2-Session-ID |
| `email_normalized` | text | Konsolidierungs-Schlüssel (eine Person = mehrere Sessions) |
| `first_name` | text | Pflicht für Versand |
| `mautic_contact_id` | int/null | Empfänger-Key (unzuverlässig, Fallback nötig) |
| `completed_rank` | 0/1/2/3 | Video-Status (aus `video1/2/3_max_pct >= 95`) |
| `cta_type` | null/whatsapp/spaeter | Finaler CTA-Status |
| `form_submitted_at` | datetime | Zeitbasis Phase A |
| `video1/2/3_completed_at` | datetime | Zeitbasis Phase B/C/D (24h-Inaktivität) |
| `last_seen_at` | datetime | Tiebreaker bei gleichem Rank |

### completed_rank
- `0` = kein Video vollständig
- `1` = Video 1 vollständig
- `2` = Video 1+2 vollständig
- `3` = alle 3 vollständig

### cta_type
- `null`/leer = kein finaler CTA
- `whatsapp` = Interesse/WhatsApp geklickt
- `spaeter` = "aktuell nicht/später" geklickt

---

## 3. Konsolidierung pro Person (Option A — KERN der Korrektheit)

**Problem:** Eine Person hat oft mehrere Sessions (mehrere `lead_hash`), z.B. neuer Re-Visit erzeugt frische rank-0-Session. 35 von 203 Personen betroffen. Ohne Konsolidierung bekäme jemand bei rank 3 fälschlich wieder A2.

**Regeln (pro `email_normalized` gruppieren):**

0. **Test-Lead-Ausschluss (zuerst):** Wenn der Lead als Test markiert ist → **nie senden**. Markierung liegt in Supabase-Tabelle `lead_events`: `event_name = test_lead_marked` (bzw. `test_lead_unmarked` zum Zurücksetzen). Es gilt der **neueste Event pro `lead_hash` UND pro `payload.email`**. Workflow lädt diese Events separat (Node "Supabase - Get Test Events") und schließt aus, wenn `email_normalized` ODER irgendein `lead_hash` der Person aktuell `test_lead_marked` ist. NICHT nur `lead_state` lesen — die Markierung ist ein Event, kein Feld.
1. **CTA schlägt alles:** Wenn IRGENDEINE Session `cta_type` = whatsapp ODER spaeter → **keine Video-Nurture**, Person komplett raus.
2. **Höchster Fortschritt gewinnt:** Sonst `completed_rank` = MAX über alle Sessions.
3. **Datum vom Gewinner:** Zeitlogik nutzt das Datum der Session, die den höchsten Rank erreicht hat (form_submitted_at bei rank 0, video{rank}_completed_at sonst).
4. **Gleichstand → neueste:** Mehrere Sessions gleich hoch → die mit jüngstem `last_seen_at`.
5. **Versand-Voraussetzung:** Nur wenn `first_name` + gültige Email + `lead_hash` + erreichbarer Mautic-Empfänger vorhanden.

**Beispiele:**
```
Session 1: rank 3, kein CTA  |  Session 2: rank 0 (neu)   → Person = rank 3, NICHT A2
Session 1: rank 1  |  Session 2: rank 0  |  Session 3: cta=spaeter  → keine Video-Nurture
```

---

## 4. Phasen-Zuordnung (nach Konsolidierung)

| Bedingung | Phase | Zeit-Trigger (Alter, nicht Datumsvergleich!) |
|-----------|-------|--------------|
| rank 0, kein CTA | **A2** | Alter von `form_submitted_at` >= 12h |
| rank 0, kein CTA, A2 bereits gesendet | **A3** | A2-Send >= 48h, A3 noch nicht gesendet, Pilot-Cap offen |
| rank 1, kein CTA | **B1** | Alter von `video1_completed_at` >= 24h |
| rank 1, kein CTA, B1 bereits gesendet | **B2** | B1-Send >= 48h, B2 noch nicht gesendet, Pilot-Cap offen |
| rank 2, kein CTA | **C1** | Alter von `video2_completed_at` >= 24h |
| rank 2, kein CTA, C1 bereits gesendet | **C2** | C1-Send >= 48h, C2 noch nicht gesendet, Pilot-Cap offen |
| rank 3, kein CTA | **D1** | Alter von `video3_completed_at` >= 12h |
| rank 3, kein CTA, D1 bereits gesendet | **D2** | D1-Send >= 48h, D2 noch nicht gesendet, Pilot-Cap offen |
| cta_type gesetzt | - | AUSGESCHLOSSEN (später eigener Track) |

**Wichtig:** Die Zeitbedingung ist immer ein **Alters-Vergleich** (`now - timestamp >= schwelle`), kein Vergleich des Datums gegen eine feste Zahl.

**`ACTIVE_PHASES`** im Code begrenzt was gesendet wird. Aktuell aktiv:
`['a2','b1','c1','d1','a3','b2','c2','d2']`.

**Pilot-Regel für A3/B2/C2/D2 (seit 2026-06-19):**
- 48 Stunden Abstand zur vorherigen Mail.
- Versand nur tagsüber im Berlin-Zeitfenster 08:00 bis 17:59.
- Maximal 10 erfolgreiche Sends pro Phase im Pilot-Batch `second_reminder_48h_cap10_20260619`.
- Cap wird über `lead_events.event_name='nurture_sent'` und `payload.pilot_batch` gezählt.
- Wer die jeweilige zweite Phase bereits als `nurture_sent` geloggt hat, wird nicht erneut angeschrieben.
- Aktive Sprachen für A2/B1/C1/D1 und A3/B2/C2/D2: Deutsch, Italienisch, Englisch.
- Französisch und Russisch bleiben geparkt, bis echte Templates existieren.
---

## 5. Empfänger-Auflösung (Mautic)

`mautic_contact_id` aus Supabase ist **unvollständig** (manche Kontakte existieren in Mautic, aber Link fehlt weil verlinkte Session anderen lead_hash hat).

**Auflösungs-Reihenfolge:**
1. `mautic_contact_id` aus Supabase (falls gesetzt) → GET `/contacts/{id}`
2. Sonst Fallback: Mautic-Suche per `email_normalized`
3. Kein Treffer → überspringen (kein Versand möglich)

---

## 5a. DNC / Abmelde-Gate (KANONISCH, vor jedem Versand)

**Regel:** Wer sich über den Email-Link abgemeldet hat (oder gebounced/manuell gesperrt ist), bekommt **niemals** eine Nurture-Mail.

**Warum eigener Gate nötig (empirisch verifiziert 2026-06-03):**
- Der Email-Abmelde-Link setzt Mautics **natives `doNotContact`** — NICHT das Custom-Field `ac_nurture_stopped`. Die `ac_nurture_stopped`-Prüfung allein fängt Abmeldungen also NICHT ab.
- Mautics transaktionaler Send-Endpoint `POST /api/emails/{id}/contact/{cid}/send` **respektiert DNC nicht** — Test mit DNC-Kontakt (`reason`, `channel:"email"`) lieferte `{"success": true}`, d.h. Mautic würde trotz Abmeldung senden. Man darf sich NICHT auf serverseitiges Blocken verlassen.

**Implementierung (Node "Code - Select Email ID", direkt nach `contact_not_found`-Check):**
```js
const dncList = Array.isArray(c.doNotContact) ? c.doNotContact : [];
if (dncList.some(d => (d.channel || 'email') === 'email')) {
  return { json: { skip: true, reason: 'dnc_unsubscribed', lead_hash: leadData.lead_hash } };
}
```
- Beide Get-Contact-Pfade (`/contacts/{id}` und `?search=email:`) liefern `doNotContact` → Gate greift unabhängig vom Auflösungs-Pfad.
- Greift VOR der `newSentPhases`-Berechnung → abgemeldete Leads werden auch nicht fälschlich als „gesendet" markiert.
- Rein schützend: kann nur Sends verhindern, nie zusätzliche auslösen.

**Skip-Reihenfolge im Gate:** `contact_not_found` → **`dnc_unsubscribed`** → `nurture_stopped` → `already_sent:<phase>` → `unsupported_language:<lang>` → `no_email_id` → **`no_coach_data`**.

**Coach-Daten-Guard (2026-06-03):** Wenn `ac_berater_email` leer ist → Skip `no_coach_data`. Verhindert, dass eine Mail mit leerem „Dein Ansprechpartner"-Block (Tokens `ac_berater_vorname/name/whatsapp/email`) rausgeht. Echte Leads haben die Felder über den Lead-Post-Processor befüllt; leer waren bisher nur interne Test-Adressen (`markus+XX@global-sce.com`), die zusätzlich als `test_lead_marked` ausgeschlossen wurden.

---

## 5b. Resume-Link-Vertrag (KANONISCH)

Für Video-/Nurture-Mails gilt ab 2026-06-01 ausschließlich dieser Link-Vertrag:

1. Video-Fortsetzen-Links kommen aus der Quiz-Bridge-Action `generate_resume_token`.
2. Der Nurture-Sender erzeugt vor JEDEM Versand einen frischen Link aus dem konsolidierten Gewinner-`lead_hash` aus Supabase.
3. Der Request an die Bridge MUSS `resumeTarget: "videos"` enthalten.
4. Der zu versendende Link ist `shortUrl` bzw. `resumeUrl` aus der Bridge-Antwort.
5. Dieser Link wird vor dem Versand in Mautic `ac_last_video_access_url` geschrieben; Mautic rendert danach erst die Email.
6. Mautic `ac_last_video_access_url` ist nur Cache/Versandfeld. Es darf nicht als Wahrheit für Video-Fortschritt verwendet werden.
7. Wenn Link-Erzeugung oder Zielprüfung fehlschlägt, wird NICHT gesendet, sondern `nurture_skipped` geloggt.
8. Gültige Video-Links haben das Format `...?r=<resumeKey>&target=videos` oder als Fallback `...?resume=<jwt>&target=videos`.
9. `resolve_resume_key` und `resolve_resume_token` müssen bei A2/B1/C1 `resumeTarget: "videos"` liefern.
10. Bei D1 muss trotz Request `resumeTarget: "videos"` die Bridge `resumeTarget: "final"` und `lastVideoStep = 3` liefern, weil alle drei Videos vollständig sind.
11. Für Rank-0-Leads startet der Link bei `lastVideoStep = 1`, nicht auf der Ergebnis-Seite.

Nicht mehr verwenden:
- Keine alten `/access/{leadHash}`-Links.
- Keine selbst gebauten Resume-URLs im Mailer.
- Keine Links ohne `target=videos` für Video-Nurture.
- Keine Entscheidung aus Mautic-Linkfeldern. Wenn ein Link fehlt/ungültig/falsch ist, frisch über `generate_resume_token` aus dem Supabase-Gewinner-Lead erzeugen.

**Resume-Guard seit 2026-06-04 (versionId `35b8c393-af46-4d46-9791-b1241358e779`):**
- `Code - Determine Phase` gibt zusätzlich `berater_slug` des Gewinner-Leads aus.
- `Code - Select Email ID` gibt `email` und `berater_slug` weiter.
- Send-Pfad: `Supabase - Get Resume Session` → `Code - Build Resume Request` → `Bridge - Generate Resume Link` → `Code - Validate Resume Link` → `Mautic - Update Resume Link` → `Mautic - Set Reply-To` → Send.
- Erwartete Zielprüfung:
  - A2/rank 0: `resumeTarget="videos"`, `lastVideoStep >= 1`
  - B1/rank 1: `resumeTarget="videos"`, `lastVideoStep >= 2`
  - C1/rank 2: `resumeTarget="videos"`, `lastVideoStep >= 3`
  - D1/rank 3: `resumeTarget="final"`, `lastVideoStep = 3`
- Skip-Gründe: `resume_session_not_found`, `resume_link_generation_failed`, `resume_target_mismatch`.

Aktueller Produktionsstand:
- Business-Quiz `main`: Commit `9833015` (`Fix resume links on current main` + `Guard resume lead state lifecycle`)
- n8n Lead-Post-Processor Workflow `9RZdrLxfA8IRhd55`: Node `HTTP - Generate Resume Token` sendet `resumeTarget: "videos"`.
- Bestehende Mautic-Felder `ac_last_video_access_url` wurden für echte Business-Kontakte mit gültigen `target=videos`-Links backfilled.

Regressionstest vor Aktivierung/Erweiterung:
- Live-Bridge `generate_resume_token` mit `resumeTarget: "videos"` aufrufen.
- Prüfen: `shortUrl` enthält `target=videos`.
- Danach `resolve_resume_key` mit dem Key und `resumeTarget: "videos"` aufrufen.
- Erwartung: `success=true`, `resumeTarget="videos"`, `lastVideoStep>=1`.

---

## 6. Varianten-Auswahl (Personalisierung — aus Mautic)

`profile_code` in Supabase ist chaotisch (Typ A/B, R/Y/G/B, feuer, Tipo A...). Deshalb kommt die Variante aus den **normalisierten Mautic-Feldern** (Lead-Processor hat sie bereinigt):

| Mautic-Feld | Werte | Verwendung |
|-------------|-------|------------|
| `ac_last_profile` | feuer/wind/wasser/fels | B1 (Profil-Variante) |
| `ac_last_main_goal` | freedom/impact/security/growth | A2/C1/D1 (Aspiration) |
| `ac_last_barrier` | vehicle/community/confidence/opportunity | (A3/D2 später) |
| `ac_last_form_language` | de/it/en/fr/ru | Sprach-Variante |

**Dies ist KEINE Mautic-Entscheidung über die Phase** — nur normalisierte stabile Attribute für die Variantenwahl. Die Phase steht schon fest (aus Supabase).

### Normalisierung lokalisierter/Alt-Werte (WICHTIG)

Die Mautic-Felder enthalten teils lokalisierte/veraltete Werte (IT/DE-Labels statt kanonischer Slugs). Der Workflow normalisiert beim Lesen (Lese-Zeit-Workaround in "Select Email ID"):

| Feld | Alt-/Lokalwert → Kanonisch |
|------|----------------------------|
| main_goal | wirkung/impatto → impact · freiheit/liberta → freedom · wachstum → growth · sicherheit/sicurezza → security · mehr-energie/energy → growth |
| profile | il-realizzatore → feuer · il-connettore → wind · tipo-a/b/c/d → feuer/wind/wasser/fels |
| barrier | fehlende-sicherheit/manca-sicurezza → confidence · fehlendes-umfeld/manca-l-ambiente → community · fehlende-moglichkeit → opportunity · manca-un-sistema → vehicle |

**Root-Cause-Fix (offen, Schreib-Zeit):** Der Lead-Post-Processor (`activecenter-lead-post-processor.helpers.js`, Workflow 9RZdrLxfA8IRhd55) hat `PROFILE_ALIAS_MAP`, aber für `main_goal` und `barrier` fehlt die Normalisierung beim Schreiben. Dauerhaft: dort `GOAL_SLUG_MAP` + `BARRIER_SLUG_MAP` ergänzen, Quiz-Frontend sollte kanonische Slugs schicken (nicht Anzeige-Labels), bestehende Mautic-Kontakte backfillen. Kanonische Listen sind die einzige Wahrheit: feuer/wind/wasser/fels · freedom/impact/security/growth · vehicle/community/confidence/opportunity · de/it/en/fr/ru.

---

## 7. Email-ID Mapping (EMAIL_MAP)

| Phase | Dimension | DE-IDs | IT-IDs | EN-IDs |
|-------|-----------|--------|--------|--------|
| a2 | main_goal | 13/14/15/16 | 98/99/100/101 | 146/147/148/149 |
| a3 | barrier | 17/18/19/20 | 114/115/116/117 | 130/131/132/133 |
| b1 | profile | 26/27/28/29 | 102/103/104/105 | 150/151/152/153 |
| b2 | profile | 30/31/32/33 | 118/119/120/121 | 134/135/136/137 |
| c1 | main_goal | 34/95/96/97 | 106/107/108/109 | 154/155/156/157 |
| c2 | profile | 35/36/37/38 | 122/123/124/125 | 138/139/140/141 |
| d1 | main_goal | 39/40/41/42 | 110/111/112/113 | 158/159/160/161 |
| d2 | barrier | 43/44/45/46 | 126/127/128/129 | 142/143/144/145 |
### Sprach-Gate (KANONISCH, 2026-06-03)

**Nur Sprachen mit ECHTEN Templates senden.** Deutsch, Italienisch und Englisch sind für alle aktiven Phasen erlaubt. FR/RU bleiben geparkt (Skip `unsupported_language:<lang>`). Wrong-Language-Versand ist verboten.

Implementierung in "Code - Select Email ID" (bei lang-Auflösung):
```js
const rawLang = (getField('ac_last_form_language') || 'de').toLowerCase().replace(/_.*/, '');
const SUPPORTED_LANGS = ['de', 'it', 'en'];
if (!SUPPORTED_LANGS.includes(rawLang)) {
  return { json: { skip: true, reason: 'unsupported_language:' + rawLang, lead_hash: leadData.lead_hash } };
}
const lang = rawLang;
```
- `|| 'de'` → leere/fehlende Sprache zählt als `de` (Heimmarkt-Default) und wird gesendet.
- EN-Einträge im EMAIL_MAP sind für `a2/a3/b1/b2/c1/c2/d1/d2` erreichbar. Es gibt keinen deutschen Fallback für englische Leads.
- **Beim Hinzufügen einer Sprache:** echte Templates bauen → IDs in EMAIL_MAP eintragen → Sprache in `SUPPORTED_LANGS` ergänzen → erst dann gehen die geparkten Leads raus.

**no_email_id (anderer Skip-Grund):** Lead fehlt das Personalisierungs-Feld der Phase (`ac_last_main_goal` für a2/c1/d1, `ac_last_profile` für b1) → keine Varianten-Wahl möglich → übersprungen. Ursache: Datenlücke beim Quiz/Lead-Processor. Fix = Daten nachtragen, nicht generische Mail senden.

---

## 7b. Monitoring & Alerting (2026-06-03)

**1. Fehler-Alert per E-Mail** — neuer Workflow **„AC - Error Alert (Postmark)"** (`vSpXIyOUK9WIlvxi`, aktiv): Error-Trigger → Postmark-Mail an `markus@global-sce.com`. Im Nurture-Workflow als `settings.errorWorkflow` gesetzt → bei JEDEM Crash kommt sofort eine Mail (Workflow, Fehler-Node, Meldung, Execution-Link). Postmark-Credential `KJgdnWx7t6eirqzo`, Absender `mail@mail.hl-support.biz`. End-to-end getestet (MessageID erhalten). Kann auch an anderen Workflows als errorWorkflow gesetzt werden.

**2. Skip/Sent-Logging in Supabase `lead_events`** — zwei additive Side-Taps im Nurture-Workflow (verändern die Batch-Schleife NICHT, `onError: continueRegularOutput` → können Versand nie brechen):
- `Code - Select Email ID` → `Filter - Log Worthy` → `Supabase - Log Skip`: loggt `event_name='nurture_skipped'` mit `payload.reason` (DNC, no_coach_data, no_email_id, unsupported_language, nurture_stopped, contact_not_found). **`already_sent` wird herausgefiltert** (Steady-State-Rauschen).
- `Mautic - Update Sent Phases` → `Supabase - Log Sent`: loggt `event_name='nurture_sent'` mit `payload.phase/email_id/language/variant/subject/email_subject` (bestätigter Versand).

**Abfragen (Supabase REST, gleicher service_role-Key):**
```
# Skips letzte 7 Tage:
GET /rest/v1/lead_events?event_name=eq.nurture_skipped&order=event_at.desc&select=event_at,lead_hash,payload
# Versendet:
GET /rest/v1/lead_events?event_name=eq.nurture_sent&order=event_at.desc&select=event_at,lead_hash,payload
```
Beginnt mit dem nächsten 2h-Cron-Lauf zu füllen. **Fehler** weiterhin in n8n Executions (rot) + jetzt zusätzlich per Alert-Mail.

---

## 8. Doppel-Versand-Schutz

Mautic-Feld `ac_nurture_sent_phases` (z.B. `"a2,b1"`). Vor Versand geprüft, nach Versand ergänzt. Plus: BatchSize=1, kein paralleler Lauf → kein Race Condition.

---

## 9. Email-Header (siehe auch mautic_email_sender_config Memory)

- **FROM email:** `mail@mail.hl-support.biz` (fix, Postmark-verifiziert)
- **FROM name:** `{contactfield=ac_berater_display_name}` (= "Vorname Nachname - Organisation", vom Nightly Sync befüllt)
- **Reply-To:** echte Coach-Email — pro Lead vor Versand per PATCH `/emails/{id}/edit` `replyToAddress` gesetzt (Node "Mautic - Set Reply-To"), kein Token (Mautic löst Token im reply_to nicht auf)

---

## 9b. Mehrsprachigkeit & dynamischer Organisationsname (Body)

**Signoff + Footer sind sprachabhängig** (erkannt am Template-NAME-Präfix "IT -"/"EN -"/"FR -"/"RU -", sonst DE):
- Signoff: DE "Dein Team {Org}" · IT "Il tuo team {Org}" · EN "Your team {Org}" · FR/RU analog
- Footer (Anmelde-Hinweis, Abmelden, Impressum) komplett pro Sprache übersetzt

**Org-Name dynamisch + Title-Case:** Feld `ac_berater_org_display` (kurzer Alias, max 25 Zeichen in Mautic!). Enthält die Organisation in Title-Case (jedes Wort erster Buchstabe groß: "ACTIVECENTER" → "Activecenter"). Genutzt in Signoff UND in `ac_berater_display_name` (FROM-Name). Befüllt vom Nightly Sync (titleCase-Helper) + Backfill.

Build im Upload-Script `upload_humanized.py`: `detect_lang(name)` + `SIGNOFF`/`FOOTER`-Dicts. Token `{contactfield=ac_berater_org_display}`.

## 10. Node-Kette

```
Cron (alle 2h)
  → Supabase GET lead_events (test_lead_marked/unmarked, event_at desc)  [Test-Exclusion-Quelle]
  → Supabase GET v_lead_state_full (source_app=business_leads_quiz AND funnel_key=business)
  → Code: Test-Exclusion + Konsolidieren + Phase bestimmen (Option A, ACTIVE_PHASES, MAX_SENDS)
  → Split In Batches (1)
  → Mautic: Kontakt holen (per mautic_contact_id, Fallback email)
  → Code: Email-ID wählen (Variante aus Mautic-Feldern + sent_phases-Check)
  → IF: needs email?
       true → Supabase GET tracking_sessions by winner lead_hash
            → Code: Resume-Request bauen
            → Bridge generate_resume_token
            → Code: Resume-Ziel gegen Phase prüfen
            → Mautic Update ac_last_video_access_url
            → Mautic Set Reply-To
            → Mautic Send
            → Mautic Update sent_phases
            → zurück zu Batch
       false → No-op
```

---

## 11. Trockenlauf-Momentaufnahme (NUR Beispiel, ändert sich laufend)

> Diese Zahlen sind eine **zeitpunktbezogene Momentaufnahme**, KEINE feste Referenz. Bei jedem Lauf neu berechnen.

**Stand 2026-06-01:**
- ~602 Supabase-Zeilen / 203 eindeutige E-Mail-Personen
- Konsolidiert verarbeitbar: A2≈67, B1≈30, C1≈12, D1≈23
- ~61 Personen per CTA ausgeschlossen
- Ohne erreichbaren Mautic-Empfänger: fast nur Markus-Test-Accounts + Coach-Selbsttests

**Beobachtung (nicht als Dauer-Garantie):** Im Trockenlauf vom 2026-06-01 wurden keine echten Kunden-Leads ohne erreichbaren Mautic-Empfänger gefunden. Das kann sich mit neuen Daten ändern — der email-Fallback + Skip-bei-fehlendem-Empfänger fängt es sauber ab.

---

## 12. Deploy-Protokoll (kanonisch — sonst RAM-Cache-Bug)

1. Workflow per API GET holen
2. Patch lokal in Python (nur erlaubte Top-Level-Keys: name, nodes, connections, settings, staticData, pinData)
3. API PUT → neue versionId muss erscheinen
4. **n8n Container restart** (`docker restart n8n-n8n-1`) — sonst läuft alter Code
5. Bei "published_version FK error": `workflow_published_version.publishedVersionId` auf aktuelle versionId in n8n-postgres-1 updaten
6. Aktivieren NUR per Container-Restart-Pfad (deactivate/activate-API verhindert Cron-Re-Registrierung)

**Credentials:**
- n8n API JWT, Supabase service key (voll!), Mautic Basic Auth (`Rt7PRC4IRSrjNt2L`), Supabase header cred (`Bx9Xi45nL1l9mnNf`)
- Supabase Key MUSS vollständig sein — abgeschnittener Key = 401 "Invalid API key" (war der ursprüngliche Crash)

---

## 12b. Bugs die beim End-to-End-Test gefunden + gefixt wurden (2026-06-01)

Diese Fehler traten NACHEINANDER auf (jeder blockierte den nächsten Node). Alle gefixt:

1. **Supabase-Key abgeschnitten** → 401 "Invalid API key". Key MUSS vollständig sein (219 Zeichen).
2. **Split In Batches v3 Output-Verdrahtung:** Output 0 = "done", Output 1 = "loop". Batch-Items kommen aus Output 1. Get Contact muss an Output 1 (loop), nicht 0.
3. **Select Email ID Modus `runOnceForEachItem` mit Array-Returns:** Per-Item-Modus erwartet `return { json: {...} }`, NICHT `return [{ json: {...} }]`. Sonst "A 'json' property isn't an object".
4. **Send-Node `$json.emailId`:** Nach zwischengeschaltetem Set-Reply-To ist `$json` die Reply-To-Response. Muss explizit `$('Code - Select Email ID').item.json.emailId` referenzieren.
5. **PATCH-Body wird ignoriert:** httpRequest v4.2 braucht `specifyBody: "json"` + `jsonBody`, NICHT `contentType: "json"` + `body`. Sonst leerer PATCH (Request erfolgreich, aber kein Feld geschrieben).
6. **Mautic-Feld per API nicht löschbar:** PATCH mit `null` oder `''` wird ignoriert. Zum echten Leeren direkt DB: `UPDATE leads SET ac_nurture_sent_phases = NULL WHERE id = X`.
7. **Split-In-Batches Loop-Back unvollständig:** JEDER Zweig (Send-Erfolg UND Skip/No-op) muss zurück zu "Split In Batches" verdrahtet sein. Wenn der No-op (Skip) NICHT zurückführt, bricht die Schleife beim ersten Skip ab — restliche Items werden nie verarbeitet. Beide Enden (Update Sent Phases → Split, No-op → Split) müssen verbunden sein.

**End-to-End verifiziert (Kontakt 177, Durchlauf 6):** sent_phases='a2' geschrieben, reply_to=coachEmail geschrieben, Email zugestellt, Dedup-Read überspringt korrekt bei bereits gesendet.

## 13. Implementierungs-Status

**Implementiert (versionId `35b8c393-af46-4d46-9791-b1241358e779`, 2026-06-04):**
- ✅ Determine-Phase-Node mit voller Konsolidierung (Option A, alle 5 Regeln)
- ✅ Empfänger-Auflösung mit email-Fallback (mautic_contact_id ODER Mautic-Suche per email)
- ✅ Supabase-Query auf v_lead_state_full + source_app=business_leads_quiz + voller Key
- ✅ Select Email ID robust für beide Response-Formen (/contacts/{id} und search)
- ✅ ACTIVE_PHASES=['a2','b1','c1'] für schrittweisen Rollout
- ✅ Reply-To pro Lead, From-Name dynamisch (Abschnitt 9)
- ✅ Resume-Link-Guard vor Versand: frisch aus Supabase-Gewinner-Lead generieren, validieren, in Mautic schreiben

**Verifiziert:**
- Trockenlauf gegen echte Daten: A2=59, B1=29, C1=12, D1=22; 10 Fehl-Mails verhindert, 61 per CTA ausgeschlossen, 0 echte Leads ohne Mautic
- Versand-Pfad per Direkt-Test an Kontakt 177 (Header/Rendering/Reply-To korrekt)
- Bridge-Live-Test 2026-06-04:
  - D1 Jasmin Gewinner-Lead → `resumeTarget=final`, `lastVideoStep=3`
  - C1 Kathrin Gewinner-Lead → `resumeTarget=videos`, `lastVideoStep=3`
  - B1 Karin Gewinner-Lead → `resumeTarget=videos`, `lastVideoStep=2`
  - n8n API PUT erfolgreich, Workflow aktiv, n8n-Container neu gestartet

**Noch offen:**
- ✅ End-to-end-Einzeltest der n8n-Kette (Kontakt 177, Durchlauf 6 erfolgreich) — ERLEDIGT
- Schrittweiser Rollout: +d1 aktivieren, sobald D1 freigegeben ist
- `spaeter`-Track als eigene Sequenz (Phase 2)
- Landing-Page-Seite (anderer source_app) eigene Mails
- FR/RU Übersetzungen für aktive Phasen
- A3/A4/A5/B2/C2/D2 etc. in EMAIL_MAP + ACTIVE_PHASES ergänzen


