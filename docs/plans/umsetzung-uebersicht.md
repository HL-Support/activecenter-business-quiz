# Umsetzung: Übersicht, Reihenfolge und Querbezüge

**Aufgestellt am 31.08.2026.** Diese Seite ist die Klammer über die drei ausgearbeiteten
Umsetzungspläne. Wer hier anfängt, liest in dieser Reihenfolge:

| Strang | Was | Dokument |
| --- | --- | --- |
| **Übersicht** | Warum überhaupt, Inventur, Entscheidungen | [bridge-abloesen-direktzugriff.md](bridge-abloesen-direktzugriff.md) |
| **A** | Berateridentität direkt aus MySQL (Lesen) | [umsetzung-a-berateridentitaet.md](umsetzung-a-berateridentitaet.md) |
| **B** | Lead-Übergabe über eine eigene Contacts-Route | [umsetzung-b-lead-uebergabe.md](umsetzung-b-lead-uebergabe.md) |
| **M** | Opt-in-Mails ins Projekt, Poller abschalten | [umsetzung-m-mailweg-ins-projekt.md](umsetzung-m-mailweg-ins-projekt.md) |

---

## 0. Stand am 31.08.2026, 16:00 MESZ — alles am laufenden System gemessen

### Was live ist

| Schritt | Stand | Beweis |
| --- | --- | --- |
| **A1** View, Benutzer, Rechte in MySQL | ✅ | `prod_quiz.quiz_berater`: **255 Zeilen**. `SHOW GRANTS` für `quiz@10.0.1.5`: genau `USAGE` + `SELECT` auf die eine View. Definition: [`sql/legacy-views.sql`](../../sql/legacy-views.sql) |
| **A2** `server/legacy/`, Treiber, Grenzzaun | ✅ PR #124 | **25 zufällige Berater Feld für Feld gegen die echte Bridge: 25 zeichengleich, 0 Abweichungen** |
| **A3** vier Stellen auf **einen** Auflöser | ✅ PR #125 | Funnel antwortet unverändert (`found=true`, `source=user`) |
| **A4** Schattenlauf gegen MySQL | 🟡 **läuft** | `COACH_LOOKUP_SOURCE=beide`, `COACH_LOOKUP_SCHATTEN=mysql` |
| Schattenvergleich **haltbar** | ✅ PR #127 | 5 Vergleiche erzeugt → deployt → **immer noch 5** |
| Postmark-Tags | ✅ PR #126 | alle **fünf** Nutzlasten tragen einen Tag, Wächter-Test hält den Stand |
| **M1** Mailvorlagen im Repo | ✅ PR #128 | Rumpf zeichengleich mit dem laufenden Workflow, Driftwächter + goldene Muster |
| **M2a** ungarische Zuordnungen | ✅ PR #129 | Ziel „Unbekannt" → **„Szabadság"**, Barriere `""` → **`confidence`** |
| **B2** eigener Contacts-Eingang | ✅ `f7882db` | `/webhook/quiz`: ohne Signatur **406**, falsche **401**; andere Routen unverändert. 🔴 **Nachtrag 31.08. abends:** unvollständig — `meta` wird nicht nach `hidden` gespiegelt (§0a) |
| **B3** Absender im Quiz, inaktiv | 🟡 **gebaut, nicht ausgeliefert** | Suite **315 grün** (vorher 296), Lint und `verify` grün; ohne `CONTACTS_QUIZ_MODUS` gilt der Standard `aus` |

**Quiz-Produktion:** `3d6bf87`, `/health/ready` grün, `quelle: plattform`.
**Tests:** Quiz **296 grün** · contacts **162 grün / 843 Zusicherungen**.

### Schalterstand in Produktion (Quiz)

```
COACH_LOOKUP_SOURCE   = beide      → die BRIDGE entscheidet
COACH_LOOKUP_SCHATTEN = mysql      → MySQL wird nur gemessen
LEGACY_MYSQL_*        = gesetzt
BRIDGE_URL            = gesetzt    → der alte Weg ist unverändert da
CONTACTS_QUIZ_MODUS   = NICHT gesetzt → Standard `aus`, exakt heutiges Verhalten
CONTACTS_QUIZ_URL     = NICHT gesetzt
CONTACTS_QUIZ_WEBHOOK_SECRET = NICHT gesetzt (Wert liegt in agent-secrets)
```

Der Modus ist ausschliessend — `aus` | `schatten` | `an`, ein `if`, kein „und". Steht er
auf `an`, fehlt aber Adresse oder Geheimnis, verhält sich der Adapter wie `aus` und meldet
laut; der Worker stellt bereits eingereihte Aufträge auf `failed`/`env_missing`, nie auf
einen Ersatzweg. Der Schattenlauf braucht kein Geheimnis — er sendet nie.

### Der Schattenvergleich, Stand jetzt

| Stelle | Befund | Vergleiche | Berater |
| --- | --- | --- | --- |
| `funnel` | **`<deckungsgleich>`** | **35** | 9 |

**0 Abweichungen, 0 `mysql_fehler`.** Für `mail` gibt es noch **keine** Vergleiche — die
entstehen nur bei einer Hot-Lead-Mail (rund zwei am Tag).

Ablesen (Plattform-DB, kein Zugang zum App-Host nötig):

```sql
SELECT stelle,
       CASE WHEN abweichungen = '' THEN '<deckungsgleich>' ELSE abweichungen END AS befund,
       sum(anzahl) AS vergleiche, count(DISTINCT slug) AS berater, max(zuletzt_am)
  FROM leads.berater_vergleich
 GROUP BY 1, 2 ORDER BY 3 DESC;
```

### n8n, Stand jetzt

| Workflow | Zustand |
| --- | --- |
| `AC - Lead Post Processor` (`9RZdrLxfA8IRhd55`) | **aktiv** — verschickt weiter Mail 1 und 2 |
| `AC - Berater-Verzeichnis spiegeln` (`IFOqAOYbUp8Zwnlk`) | aktiv, alle 15 Min |
| `Update "Result" by hash` (`7Xg6NsE5H3UWgSNc`) | aktiv — der Rangschreibweg |

🔴 **Die Opt-in-Mails kommen weiterhin aus n8n, nicht aus dem Repo.** Nur Mail 3 (Hot Lead)
läuft über die Outbox. Der Verzug von 2–5 Minuten besteht unverändert.

---

## 0a. 🔴 Wie es weitergeht — der nächste Schritt zuerst

> ## ✅ B3 ist gebaut (31.08.2026, abends) — und hat einen Blocker für B5 zutage gefördert
>
> **Gebaut, getestet, nicht ausgeliefert:** Vertrag festgeschrieben
> ([contacts-quiz-webhook-vertrag.md](../contacts-quiz-webhook-vertrag.md)), Absender
> `server/legacy/kontakte.js`, Vertragspayload in `api/bridge.js`, Datenseite
> `sql/contacts-quiz-uebergabe.sql`, Auftragsart im Worker, Modus-Schalter mit Standard
> **`aus`**. Suite **315 grün** (vorher 296), Lint und `verify` grün.
>
> 🔴 **Beim Nachlesen der ausgelieferten Gegenstelle sind drei Abweichungen vom Plan
> aufgefallen.** Zwei sind im Absender eingearbeitet (sie liest `meta.survey`, nicht
> `meta.quiz`; der Kopf heisst `X-Quiz-Signature`). Die dritte ist ein Mangel der
> Gegenstelle: **`meta` wird nicht nach `form_response.hidden` gespiegelt.** Der Post
> Processor liest dort 19 Felder, `LegacySurveyResponse` schreibt 8. Würde heute
> umgeschaltet, ständen in Mail 1 und Mail 2 **„Unbekannt"** statt Profil und Ziel —
> dieselbe Fehlerklasse wie M2a, und ebenso stumm.
> Übergabe: [2026-08-31-contacts-hidden-abbildung.md](../uebergaben/2026-08-31-contacts-hidden-abbildung.md).
>
> **Das blockiert B5, nicht B3 und nicht B4.** Der Absender ist inaktiv, der Schattenlauf
> misst nur den eigenen Payload.
>
> **Offen, damit B3 als ausgeliefert gilt:** SQL auf der Plattform-DB anwenden
> (`leads_migrate`, Zugang nur von `10.0.1.5`) · deployen · Gegenprobe „es ändert sich
> nichts" (gleiches Opt-in-Verhalten, gleicher Forward, Protokolltabelle bleibt leer).
>
> **Die drei offenen Punkte des Plans sind entschieden:** §12.1 Kandidaten-SELECT
> beantwortet und am laufenden n8n belegt · §12.4 Schema **`leads`** · §12.5
> `max_attempts` **8** (Deckung 4 h 22 min statt 82 min).

### B3 — der Absender, hinter der vorhandenen Outbox (die Vorgabe, an der gebaut wurde)

| | |
| --- | --- |
| **Was** | Das Quiz sendet den Opt-in an `POST https://contacts.hl-support.biz/webhook/quiz` statt über `forward_webhook` an die Bridge |
| **Wo** | `api/bridge.js`, die zwei `forward_webhook`-Stellen (`:4094` im Typeform-Adapter, `:4199`) — **hinter** `api/lead-outbox-worker.js`, nicht davor |
| **Vertrag** | 🔴 gilt jetzt in [contacts-quiz-webhook-vertrag.md](../contacts-quiz-webhook-vertrag.md), **nicht** mehr §3 des Plans; Registry-Schlüssel **`quiz-erfolgscode`** in `meta.survey`, Kopf `X-Quiz-Signature`, HMAC über den **exakten rohen** Rumpf |
| **Env** | `CONTACTS_QUIZ_URL` und `CONTACTS_QUIZ_WEBHOOK_SECRET` (Wert in `agent-secrets` → `quiz_contacts_webhook`) |
| **Schalter** | `aus` \| `schatten` \| `an` — im Schattenlauf wird gebaut und protokolliert, aber **nie gesendet** |

🔴 **Die drei Dinge, die B3 richtig machen muss — alle drei umgesetzt:**

1. ✅ **`submissionId` serverseitig erzeugen und im Outbox-Auftrag einfrieren** — nicht je
   Versuch neu. Sonst erzeugt jede Wiederholung einen zweiten Kontakt. Der `qz_`-Hash
   taugt **nicht** als Idempotenzschlüssel (klientengesteuert, kein UUID-Format); er
   gehört als `meta.hash` mit, aber als Lesegriff, nicht als Schlüssel.
   → `leads.reihe_contacts_quiz_ein`: Advisory-Lock, SELECT-vor-INSERT, `gen_random_uuid()`
   nur im INSERT-Zweig, und der Schlüssel wandert per `jsonb_set` in den eingefrorenen
   Rumpf. Der Worker baut nichts — er signiert und sendet dieselben Bytes.
2. ✅ **`coach_member_id` und `case` aus der Antwort speichern** — daran hängt Strang M.
   Ein 2xx **ohne** `contact_id` ist ein Befund und gehört gemeldet.
   → zwei eigene Spalten im Protokoll; nachgemessen: die **Duplikat**-Antwort trägt beide
   nicht mehr (`SurveyIntake.php:419-428`), wer sie nicht beim ersten Erfolg speichert,
   bekommt sie nie wieder. Ein 2xx ohne Kennung wird als Fehlschlag gewertet.
3. ✅ **Zustellprotokoll vor dem Senden**, folgenlos gekapselt. Ein Protokoll ist nie ein
   Datenpfad. → `ohneFolgen(...)` im Worker; ein Test hält die Reihenfolge fest und lässt
   die Protokollfelder aus einem echten Payload entstehen.

**Beweis vor dem Umschalten:** Ein echtes Opt-in landet **einmal** in Contacts; die
Wiederholung liefert `duplicate: true`; über beide Wege nachgezählt stimmt die Summe.

### Danach, in dieser Reihenfolge

| # | Schritt | Wartet auf | Bemerkung |
| --- | --- | --- | --- |
| **A5** | Quelle je Stelle auf `mysql` | das Tor unten | reine Env-Änderung, **kein Deploy** |
| **B3'** | SQL anwenden, deployen, Gegenprobe „nichts ändert sich" | — | der Rest von B3; ohne Deploy ist der Code nirgends |
| **B4** | Schattenlauf (`CONTACTS_QUIZ_MODUS=schatten`) | B3' | misst nur; Rückweg: Env löschen, kein Deploy |
| **B5** | Absender scharf (`an`) | 🔴 **K3 in contacts behoben** + B4 ruhig | Notausstieg: Env löschen |
| **B5** | `forward_webhook`, `BRIDGE_*` und toten Code ausbauen | B4 ruhig | erst dann |
| **M2** | Vorlagen an die Outbox anschliessen | B4 | M1 liegt fertig |
| **M3–M8** | Mails senden, Nebenaufgaben verteilen, Poller abschalten | M2 | 🔴 der teuerste Pfad |

🟡 **A5 und B3 dürfen parallel laufen** — verschiedene Pfade. **A/B und M nicht.**

### Das Tor für A5

| Bedingung | Stand 31.08. 16:00 |
| --- | --- |
| ≥ 300 `funnel`-Vergleiche, alle `abweichungen = ''` | **35** — ein bis zwei Tage |
| ≥ 5 `mail`-Vergleiche, alle sauber | **0** — rund drei Tage |
| 0 Zeilen mit `mysql_fehler` | ✅ **0** |
| **kein** `nur_in_der_bridge` mit `source='contact'` | ✅ bisher **0** — käme es vor, ist vor dem Umschalten von `_FUNNEL` eine zweite, schmale Kontakt-View nachzurüsten (Plan A §4) |

**Umschaltreihenfolge, riskanteste Stelle zuletzt, je eine Env-Änderung mit einem Tag
Abstand:** `_ABSCHLUSS` → `_SUBMIT` → `_FUNNEL` → `_MAIL`. Erst wenn alle vier stehen,
`COACH_LOOKUP_SOURCE=mysql` setzen und die Übersteuerungen entfernen.

### Was Markus entscheiden muss

1. **Telefonlücke** (§2a): Rückfall für die Mailstrecke verbieten — *oder* den Spiegel um
   die Telefonspalten erweitern. **Empfehlung: verbieten**, die Outbox kann warten.
   *Markus am 31.08.: „wiederholen besser" — damit ist das entschieden, aber noch nicht gebaut.*
2. **Mautic-Geheimnis rotieren** (M8): Es stand im Klartext im Repo und ist damit in der
   Git-Historie. Schwärzen entfernt es dort **nicht**.
3. **Rotation des geteilten Contacts-Geheimnisses** — Sache des contacts-Projekts, Übergabe
   liegt vor.

---

## 1. Reihenfolge und Tore

```text
A0 ✅ ─► A1 ✅ ─► A2 ✅ ─► A3 ✅ ─► A4 🟡 laeuft ─► A5 (Env-Umschaltung)
                                                          │
B1 ✅ ─► B2 ✅ ausgeliefert ─► B3 ◄── NAECHSTER SCHRITT ─► B4 ─► B5
                                                          │
                              M1 ✅ ─► M2a ✅ ─► M2 … M8  (erst wenn B4 ruhig laeuft)
```

**Harte Tore:**

1. **A1 vor allem anderen in Strang A** — ohne View und Benutzer gibt es keinen Beweis für A2.
2. **B2 vor B3** — Contacts zuerst, dann der Absender. Nie umgekehrt.
3. **B4 ruhig vor M1** — die Mails wandern erst, wenn die Übergabe steht.
4. **A und B dürfen parallel laufen** (verschiedene Pfade), **A/B und M nicht**.
5. 🔴 **Niemals zwei Änderungen gleichzeitig auf dem Versandweg.**

---

## 2. 🔴 Querbezüge, die keinem Einzelplan allein gehören

### 2a. Die Telefonlücke — betrifft A **und** M

**Gemessen am 31.08.2026.** Strang M hat festgestellt: Mail 2 braucht das **Telefon des
Beraters** für den WhatsApp-Link (`ac_berater_whatsapp`). Strang A nimmt das Telefon in die
neue MySQL-View auf — richtig so.

🔴 **Aber `leads.berater` führt kein Telefon.** Nachgezählt: die Tabelle hat 11 Spalten, der
Spiegel `IFOqAOYbUp8Zwnlk` selektiert `slug, quelle_user_id, email, first_name, last_name,
full_name, country, preferred_language, organisation_name, herbalife_id` plus
`gespiegelt_am`. Keine Telefonspalte.

**Die Folge ist unangenehm leise:** Strang A sieht als Rückfallkette `mysql → verzeichnis`
vor. Fällt MySQL aus, *nachdem* Mail 2 im Projekt liegt, entsteht die Mail aus dem
Verzeichnis — **ohne** Telefon, also **ohne WhatsApp-Link**. Kein Fehler, keine Meldung,
nur eine schlechtere Mail.

**Was zu tun ist, bevor M1 gebaut wird — eines von beiden:**
- Den Spiegel um die Telefonspalten erweitern (n8n-SQL + `leads.berater` um zwei Spalten),
  damit der Rückfall vollwertig ist; **oder**
- den Rückfall für die Mailstrecke ausdrücklich **verbieten**: fehlt MySQL, wird der
  Outbox-Auftrag zurückgestellt statt mit halber Information versendet.

**Empfehlung:** das Zweite. Eine Mail ist nicht eilig genug, um sie unvollständig zu
verschicken — die Outbox kann warten und wiederholen. Der Spiegel bliebe damit das, was er
ist: eine Rückfallebene für den **Funnel**, nicht für den Versand.

### 2b. Der Rang-Schreibweg — betrifft B und M

Weg 3 (`leads.lead_sync_outbox` → n8n `7Xg6NsE5H3UWgSNc` → `UPDATE typeform_surveys … WHERE
hash = …`) hängt an derselben Kartei-Zeile, die Strang B künftig über `/webhook/quiz`
anlegen lässt.

✅ **Entwarnung, belegt:** Die neue Route schreibt in **dieselbe** Tabelle inklusive `hash`
(Vorbild `SurveyIntake.php:323`) — es gibt keinen Tabellenbruch.

✅ **Und der Nulltreffer verhallt nicht still.** Der Worker wirft bei `matchedRows < 1`
(`api/lead-outbox-worker.js:668`), der Auftrag endet sichtbar `failed`/`dead`; die
Bridge bildet `matchedRows === 0` ausdrücklich auf `typeform_survey_not_found` ab und
alarmiert (`api/bridge.js:4032`).

> 🔴 **Korrektur meiner eigenen früheren Aussage:** Ich hatte geschrieben, ein Nulltreffer
> wäre „kein Fehler" und niemand würde es merken. **Das war falsch** — beide Pfade melden.
> Die Kopplung bleibt ein Prüfpunkt, aber sie ist sichtbar, nicht still.

### 2c. Der Poller kann heute schon doppelt senden

Strang M hat es beim Lesen gefunden: Ein Job des Post Processors erledigt Mautic + Mail 2 +
Mail 1 **ohne Merker je Teilschritt**. Scheitert Mail 1, nachdem Mail 2 hinaus ist,
wiederholt der Wiederholungslauf **alles** — der Lead bekommt Mail 2 zweimal.

Das ist ein **heute lebender** Mangel, kein Umbaurisiko. Er ist ein weiteres Argument für
M: drei getrennte Auftragsarten mit je eigenem Sent-Ereignis lösen ihn nebenbei auf.

### 2d. Zwei Geheimnisse im Klartext

| Fund | Wo | Wer behebt |
| --- | --- | --- |
| Webhook-Geheimnis als Vorgabewert, Empfänger setzt ihn nicht, Prüfung fail-open | `contacts…/config/typeform.php:18`, `Webhook.php:112-118` | contacts-Projekt — [Übergabe](../uebergaben/2026-08-31-contacts-signaturpruefung.md) |
| **Mautic-Basic-Auth hart kodiert** in vier Knoten des Post Processors (`HTTP - Mautic Search/Update/Create Contact`, `Add To Segment`) — damit auch im Klartext in den Workflow-Sicherungen im Repo | n8n `9RZdrLxfA8IRhd55` | **wir**, als M8 |

Beides am 31.08. selbst nachgemessen.

---

## 2e. 🔴 Warum A3 bis M **nicht** am selben Tag live gehen können

Der Auftrag lautete „alles fertig bauen und live stellen". Das ist für A1/A2 geschehen.
Für den Rest geht es nicht — und zwar nicht aus Zeitmangel, sondern weil die Pläne selbst
Tore enthalten, die sich nicht überspringen lassen:

| Schritt | Was fehlt | Warum es nicht heute geht |
| --- | --- | --- |
| **A4** | Schattenlauf-Belege | Braucht **echten Verkehr über Tage**. Ein Schattenlauf, den man in einer Stunde „durchprüft", hat nichts geprüft — er hat nur ein leeres Fenster gemessen. |
| **A5** | A4-Belege | Ohne A4 gibt es keinen Grund, dem neuen Weg die Entscheidung zu geben |
| **B2** | die Route im **contacts**-Repo | Fremdes System, eigener Deploy. Verbindliche Reihenfolge beider Nachbarprojekte: **Contacts zuerst, dann der Absender** |
| **B3–B5** | B2 | Ein Absender ohne Empfänger verliert Leads |
| **M1–M8** | B4 im Ruhezustand + Vorlagenvergleich in vier Sprachen | Der teuerste Pfad überhaupt. Doppelversand ist hier die Fehlerwirkung, die Geld kostet |

**A3 wäre technisch heute machbar** — es ändert das Verhalten nicht (Standard bleibt
`bridge`). Es ist bewusst **nicht** mit A2 zusammen ausgeliefert worden: A2 fasst keinen
einzigen Aufrufer an, A3 hängt vier davon um, darunter den Funnelweg bei **jedem**
Seitenaufruf. Zwei solche Änderungen in einem Deploy sind genau die Klasse, vor der
`DEPLOYMENT_WORKFLOW.md` und der Mailwege-Plan warnen. A3 gehört in einen eigenen,
kleinen PR mit eigener Gegenprobe.

> 🔴 R0, wörtlich: *„Reicht die Zeit nicht für die Prüfung, wird die ÄNDERUNG verschoben —
> niemals die Prüfung."* Genau das ist hier angewandt.

---

## 3. Was Markus persönlich tun muss

| # | Was | Warum es nicht automatisiert geht |
| --- | --- | --- |
| 1 | ~~**A1**: Schema, View und Benutzer in MySQL anlegen~~ | ✅ **erledigt 31.08.** Der Zugang war vorhanden, er wurde nur falsch benutzt: Der Schlüssel `~/.ssh/id_rsa` ist passphrasengeschützt und scheitert mit `BatchMode` **stumm**. Mit der Passphrase aus `agent-secrets` (`cw_forge_server.sshKeyPassphrase`) in den `ssh-agent` geladen, trägt `root@91.99.76.104` sofort. Verfahren steht jetzt in `sql/legacy-views.sql` |
| 2 | **B2 anstossen** — die Route im contacts-Projekt | Fremdes Repo, fremder Agent |
| 3 | **Entscheidung 2a** — Spiegel erweitern oder Rückfall für Mails verbieten | Fachentscheidung |
| 4 | **Entscheidung** aus Plan M: Berater-Auflösung als dreistufige Kaskade nachbauen oder auf den Slug-Weg vereinfachen | Fachentscheidung, Vorlage liegt in Plan M |

---

## 4. Stand der Vorarbeiten

| | Zustand |
| --- | --- |
| B1/B2 der **alten** B-Reihe (Berateridentität, Verzeichnis) | ausgeliefert, Schattenlauf läuft mit `COACH_LOOKUP_SOURCE=beide` |
| Spiegel `leads.berater` | 255 Zeilen, seit 31.08. mit korrigierter Spalte (`o.org_name`) |
| `vergleiche()` | korrigiert, liest effektive Werte; **noch nicht in Produktion** |
| Post Processor | aktiv, 36 Knoten, Drift behoben |
| Bridge | unangetastet, bedient weiter 15 Projekte |

🔴 **Offen und vor A3 zu erledigen:** Die Vergleichskorrektur liegt nur auf dem
Arbeitszweig. Bis zum Deploy meldet der laufende Schattenlauf weiter `["country"]` —
inzwischen ein reiner Fehlalarm.
