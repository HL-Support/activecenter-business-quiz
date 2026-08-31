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

## 0. Stand am 31.08.2026, 12:10 MESZ — was live ist

| Schritt | Stand | Beweis |
| --- | --- | --- |
| **A1** — View, Benutzer, Rechte in MySQL | ✅ **erledigt** | `prod_quiz.quiz_berater`: **255 Zeilen**. `SHOW GRANTS` für `quiz@10.0.1.5`: genau `USAGE` + `SELECT` auf die eine View. Definition und Rückweg: [`sql/legacy-views.sql`](../../sql/legacy-views.sql) |
| **A2** — `server/legacy/`, Treiber, Grenzzaun | ✅ **live** (PR #124) | **25 zufällige Berater Feld für Feld gegen die echte Bridge: 25 zeichengleich, 0 Abweichungen** |
| **`vergleiche()`-Korrektur** | ✅ **live** (PR #124) | Der `country`-Fehlalarm ist aus der Produktion raus |
| **A3** — vier Stellen auf **einen** Auflöser | ✅ **live** (PR #125) | Produktion `e7aa22a`, dreimal über Zeit; Funnel antwortet unverändert (`found=true`, `source=user`) |
| **A4** — Schattenlauf gegen MySQL | 🟡 **läuft seit 31.08. 12:05** | `COACH_LOOKUP_SCHATTEN=mysql`, MySQL-Zugang gesetzt. Erste vier Vergleiche in Produktion: **alle `abweichungen: []`** |
| **A5** | 🔴 offen | braucht A4-Belege über Tage |
| **B, M** | 🔴 offen | siehe §2e |

### Der Schattenlauf, wie er gerade in Produktion steht

```
[berater-vergleich] {"slug":"markus","stelle":"funnel","quelle":"bridge","schatten":"mysql","abweichungen":[]}
[berater-vergleich] {"slug":"trix24","stelle":"funnel","quelle":"bridge","schatten":"mysql","abweichungen":[]}
[berater-vergleich] {"slug":"ingeunterthiner",…,"abweichungen":[]}
[berater-vergleich] {"slug":"default",…,"abweichungen":[]}
```

🔴 **Die Bridge entscheidet weiterhin.** MySQL wird nur mitgemessen. Ablesen über die
Coolify-API (nicht SSH — die gibt es auf der Box nicht):

```bash
curl -s -H "Authorization: Bearer <coolify.apiToken>"   "https://coolify.hl-support.biz/api/v1/applications/yhoacszoiofuq6dg4mykyr7b/logs?lines=200000"   | grep berater-vergleich
```

🟡 **Eine Falle beim Nachmessen:** Ein Deploy ersetzt den Container. Direkt danach sind im
Protokoll **null** Zeilen — nicht weil der Schatten schweigt, sondern weil der neue
Container noch keinen Verkehr gesehen hat. Genau darauf bin ich am 31.08. einmal
hereingefallen. Erst Verkehr erzeugen, dann lesen.

### 🔴 Wann A5 — das Umschalten — kommt

**Die Belege für A5 entstehen nur zwischen zwei Deploys.** Ein Deploy ersetzt den
Container, und mit ihm ist das Protokoll leer. Am 31.08. ist das zweimal passiert: nach
dem A4-Start standen null Zeilen da, nach dem Tags-Deploy wieder nur eine. **Das ist kein
Fehler — es ist die Eigenschaft, an der sich das Sammeln bricht.**

Daraus folgt ein klares Tor, statt eines Datums:

| Bedingung | Warum |
| --- | --- |
| **Mindestens 48 Stunden ohne Deploy** | sonst faengt das Sammeln immer wieder bei null an |
| **≥ 300 Vergleiche der Stelle `funnel`** mit `abweichungen: []` | der Funnel erzeugt bei **jedem** Seitenaufruf einen Vergleich — das ist in ein bis zwei Tagen erreicht |
| **≥ 5 Vergleiche der Stelle `mail`** mit `abweichungen: []` | bei rund zwei Hot-Leads am Tag also etwa drei Tage |
| **0 Zeilen mit `mysql_fehler`** | ein einziger Ausfall der Quelle verschiebt das Umschalten |

**Reihenfolge des Umschaltens — riskanteste Stelle zuletzt, je eine Env-Änderung:**

1. `COACH_LOOKUP_SOURCE_ABSCHLUSS=mysql` — seltenster Pfad
2. `COACH_LOOKUP_SOURCE_SUBMIT=mysql`
3. `COACH_LOOKUP_SOURCE_FUNNEL=mysql` — häufigster, aber am besten belegt
4. `COACH_LOOKUP_SOURCE_MAIL=mysql` — **zuletzt**, weil dort ein Fehler am teuersten ist

Zwischen den Schritten jeweils **einen Tag** beobachten. Erst wenn alle vier stehen, wird
`COACH_LOOKUP_SOURCE=mysql` gesetzt und die Übersteuerungen werden entfernt.

🟡 **Das Umschalten selbst ist kein Deploy**, sondern eine Env-Änderung — und damit in
Sekunden zurücknehmbar. Genau dafür wurde der Schalter gebaut.

---

## 1. Reihenfolge und Tore

```text
A0 ─ messen ──► A1 ─🔴 braucht Markus ─► A2 ─► A3 ─► A4 ─► A5
                                                            │
B1 ─ Vertrag ─► B2 ─ Contacts zuerst ─► B3 ─► B4 ───────────┤
                                                            ▼
                                              M1 … M8  (erst wenn B4 ruhig läuft)
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
