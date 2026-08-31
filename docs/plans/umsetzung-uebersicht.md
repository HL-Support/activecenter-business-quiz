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

## 3. Was Markus persönlich tun muss

| # | Was | Warum es nicht automatisiert geht |
| --- | --- | --- |
| 1 | **A1**: Schema, View und Benutzer in MySQL anlegen | Kein SSH auf `91.99.76.104` (Schlüssel passphrasengeschützt, nicht-interaktiv unbrauchbar) und kein SSH auf `167.233.251.217`; das `dbmasteruser`-Passwort liegt auf dem Server, nicht in `agent-secrets`. Einzelheiten im Kasten in [Plan A §9](umsetzung-a-berateridentitaet.md) |
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
