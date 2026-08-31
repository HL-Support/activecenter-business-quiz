# Nurture-Strecke: Standortbestimmung am 31.08.2026

**Alles am laufenden System gemessen**, nicht aus früheren Notizen übernommen. Anlass war
die Frage „wie siehts eigentlich mit unserem Nurturing aus?" — und die Dauerwarnung des
Wächters (W2: „9 fällige Erstempfänger ohne Mail").

**Kurzfassung: Der Versand ist gesund. Die neun Warnfälle sind vollständig erklärt und
technisch kein Ausfall — bis auf eine echte Lücke, die eine Entscheidung braucht.**

---

## 1. Läuft der Versand?

| Prüfung | Messung |
| --- | --- |
| Workflow | `AC - Quiz Nurture Email Sender` (`RqKSRTgFv8mv04H2`), **aktiv**, Takt alle 2 h |
| Letzte acht Läufe | **alle `success`** |
| Letzte Sendung | 31.08. 16:01 MESZ — 4 h vor der Messung |
| Heute versandt | 9 Mails an 9 Menschen |
| Leerläufe erkennbar | 16:00- und 18:00-Lauf dauerten 12 s statt ~70 s ⇒ nichts zu tun |

**Reichweite insgesamt:** 1118 Menschen in der Strecke, davon **914 mit mindestens einer**
Nurture-Mail. 819 haben zwei bis vier bekommen.

---

## 2. Die Kurve zeigt den Augustvorfall — und die Heilung

| Zeitraum | Mails/Tag |
| --- | --- |
| 22.–23.07. | 137, 121 (Nachholspitzen) |
| 24.07.–07.08. | 12–34, stetig |
| 08.–19.08. | 2–7, **mit Lücktagen** |
| **20.–25.08.** | **null. Sechs Tage Totalstillstand** |
| 26.08. | **137** — der Nachholstoß nach der Reparatur |
| 27.–31.08. | 7 · 18 · **125** · 18 · 9 |

Der Einbruch ab dem 08.08. und der Stillstand vom 20.–25.08. sind der dokumentierte
Zeilengrenzen-Vorfall ([2026-08-26-nurture-zeilengrenze-vorfall.md](2026-08-26-nurture-zeilengrenze-vorfall.md)).
Die 137 Mails am 26.08. sind seine Abarbeitung.

🔴 **Die 125 am 29.08. sind kein zweiter Vorfall.** Der Workflow wurde am 29.08. um 20:11
geändert: Die zweiten Erinnerungen (`a3`, `b2`, `c2`, `d2`) wurden vollständig aktiviert.
Der aufgestaute Bestand ging in einem Zug hinaus. Seither liegt die Rate bei 9–18 am Tag,
was zu rund 9 Opt-ins täglich passt.

---

## 3. Die neun Warnfälle des Wächters — vier Ursachen, alle protokolliert

Der Sender schreibt jeden Abbruch als `nurture_skipped` mit Grund. Nachgesehen statt
vermutet:

| Ursache | Menschen | Was es heisst |
| --- | --- | --- |
| `unsupported_language` | **4** (hu ×2, ru, fr) | 🔴 es gibt keine Vorlage in dieser Sprache |
| `nurture_stopped` | **4** | im Mautic-Feld `ac_nurture_stopped` angehalten |
| `contact_not_found` | **1** | kein Mautic-Kontakt zu dieser Adresse |

Zwei Dinge, die ich zuerst vermutet hatte und die **nicht** zutreffen — beide nachgemessen:

- **Nicht in der Kartei gelöscht.** Alle geprüften Fälle tragen `deleted_at = NULL`.
- **Nicht am fehlenden Mautic-Kontakt.** 8 von 9 haben einen, ohne Sperre. Nur einer nicht.

`nurture_stopped` erscheint erst seit dem 29.08. — nicht weil jemand neu angehalten wurde,
sondern weil die Prüfung bis dahin nie griff (Kommentar im Knoten: „…hat nie jemanden
angehalten. Gemessen am 29.08.2026: `ac_nurture_stopped` kam als number 1"). Die vier waren
also längst angehalten; jetzt wird es endlich beachtet. **Das ist eine Reparatur, kein
Verlust.**

---

## 4. Die einzige echte Lücke: Sprachen — ✅ noch am selben Abend geschlossen (§5a)

`SUPPORTED_LANGS = ['de', 'it', 'en']` (`Code - Select Email ID`). Die Vorlagen im Repo
bestätigen das: `nurture/vorlagen/nurture-email-templates-{de,en,it}.md`.

| Sprache | Menschen | mit Nurture-Mail | ohne |
| --- | --- | --- | --- |
| de | 1018 | 855 | 163 |
| it | 69 | 38 | 31 |
| en | 24 | 21 | 3 |
| **hu** | **5** | 1 | **4** |
| **fr** | **1** | 0 | **1** |
| **ru** | **1** | 0 | **1** |

**Sieben Menschen in hu/fr/ru, davon sechs ohne eine einzige Nurture-Mail** — und das wird
sich nie von selbst ändern. Sie bekommen die beiden Post-Processor-Mails und danach nichts.

⚠️ Das ist keine Panne, sondern eine **offene Entscheidung**: Vorlagen in diesen Sprachen
anlegen, oder bewusst dabei bleiben und die Fälle in die Wächter-Baseline aufnehmen, damit
die Warnung nicht dauerhaft gelb bleibt. **Eine Dauerwarnung erzieht zum Wegsehen** — genau
davor warnt NURTURE_BETRIEB §4 bei W3.

Am 31.08. wurde für Mail 1 und Mail 2 die ungarische Zuordnung repariert (M2a, PR #129).
Die **Nurture-Strecke** ist davon nicht berührt.

---

## 5. Was sonst noch im Abbruchprotokoll steht

| Grundart | Einträge | Menschen | zuletzt |
| --- | --- | --- | --- |
| `dnc_unsubscribed` | 11.777 | 72 | 31.08. | 
| `no_email_id` | 3.229 | 30 | **26.08.** |
| `unsupported_language` | 1.777 | 11 | 26.08. |
| `contact_not_found` | 1.746 | 8 | 26.08. |
| `nurture_stopped` | 4 | 4 | 29.08. |
| `resume_target_mismatch` | 182 | 1 | 23.07. |

- `dnc_unsubscribed` ist **richtig so**: 72 Menschen haben sich abgemeldet oder sind
  hart gebounct. Die hohe Eintragszahl entsteht, weil jeder Lauf erneut protokolliert.
- `no_email_id` traf **30 Menschen** — zuletzt am 26.08., seither nicht mehr. Der Schlüssel
  sah so aus: `a2/de/` mit leerem dritten Teil (der Variante). Offenbar mit dem Umbau vom
  26./29.08. behoben; **wer es prüfen will, achtet auf ein Wiederauftauchen dieses Grundes**.

---

## 5a. ✅ Die Sprachlücke ist geschlossen (31.08.2026, abends)

**Entscheidung Markus: „Version A" — eine generische Vorlage je Phase und Sprache.**

| | |
| --- | --- |
| Angelegt | **24 Mautic-Vorlagen**, Kennungen **162–185** (hu 162–169, fr 170–177, ru 178–185) |
| Texte | `nurture/vorlagen/generisch-hu-fr-ru.js` — deutsche Referenz + hu/fr/ru |
| Erzeuger | `scripts/nurture-vorlagen-anlegen.js` (Trockenlauf ist Standard) |
| Workflow | `SUPPORTED_LANGS = ['de','it','en','hu','fr','ru']`, `EMAIL_MAP` ergänzt, Rückfall auf `_single` |
| Sicherung | `n8n/backups/quiz-nurture-sender-2026-08-31-vor-sprachen.json` |
| Geprüft | am laufenden Workflow gegengelesen: `{"de":37,"it":37,"en":37,"hu":8,"fr":8,"ru":8}` |

**Wie der Rückfall funktioniert:**

```js
const emailId = EMAIL_MAP[phase]?.[lang]?.[variantKey]
  ?? EMAIL_MAP[phase]?.[lang]?.['_single'];
```

Deutsch, Italienisch und Englisch behalten ihre vier Varianten je Phase — für sie ändert
sich **nichts**. hu/fr/ru laufen über `_single`.

### ⚠️ Vermerk für spätere Optimierung

Das ist bewusst die vereinfachte Fassung. Zwei Dinge gehören nachgeholt, sobald es sich
lohnt:

1. **Variantentiefe.** Bekommt eine dieser Sprachen nennenswert Volumen, gehört sie auf
   dieselbe Tiefe wie Deutsch — vier Varianten je Phase nach Hauptziel, Profil bzw.
   Barriere. Der Rückfall macht das **schrittweise** möglich: Wer eine einzelne Variante
   nachträgt, überschreibt damit genau diese Kombination. Es braucht dafür keine
   Umstellung, keinen Deploy und keine Änderung am Sender.
2. **`a4` und `a5`.** Sie stehen in keiner Sprache aktiv (`ACTIVE_PHASES` kennt sie nicht)
   — auch in Deutsch nicht. Wer die Strecke verlängern will, aktiviert sie zuerst dort.

### 🔴 Was noch offen ist

**Die Übersetzungen sind nicht muttersprachlich gegengelesen.** Bei Code fängt ein Test den
Fehler, bei Verkaufstext niemand. Die betroffenen Berater sind aber selbst
Muttersprachler — die ungarischen Leads hängen an `wellnesskurs`, der russische an `fit`.
Dort gehört es hin.

Ein Test (`scripts/tests/nurture-vorlagen-generisch.test.js`) bewacht das, was prüfbar
**ist**: dass kein Mautic-Platzhalter beim Übersetzen zerbrochen ist, dass jede Sprache
dieselben Platzhalter trägt wie die deutsche Referenz, und dass der Rahmen
(Beraterkasten, Abmeldelink, Impressum) nirgends deutsch geblieben ist. Genau das war beim
ersten Entwurf passiert.

**Rückweg:** die Sprache aus `SUPPORTED_LANGS` nehmen. Die Vorlagen bleiben stehen und
lassen sich jederzeit wieder zuschalten.

---

## 6. Was daraus folgt

1. **Kein Handlungsbedarf am Versandweg.** Er läuft, meldet sauber und hat den Augustvorfall
   nachweislich abgearbeitet.
2. ✅ **Die Sprachlücke ist geschlossen** (§5a) — 24 generische Vorlagen für hu/fr/ru,
   Rückfall auf `_single`. Von den neun Warnfällen werden damit **vier** erreichbar. Die
   übrigen fünf bleiben zu Recht draußen: vier sind im Mautic angehalten, einer hat keinen
   Mautic-Kontakt. Sie gehören in die Wächter-Baseline, sonst bleibt W2 dauerhaft gelb.
   🔴 Offen: muttersprachliche Gegenlese durch die Berater `wellnesskurs` (hu) und `fit` (ru).
3. **Ein Beobachtungspunkt:** `no_email_id` darf nicht zurückkommen. Er hat 30 Menschen
   ihre Strecke gekostet, bevor er auffiel.

*Belege: n8n-API (Workflow `RqKSRTgFv8mv04H2`, Läufe und Knotencode), Plattform-DB
`leads.lead_events`/`leads.v_lead_state_full`, Kontaktkartei `prod_contacts_activesupport`,
Mautic-API.*
