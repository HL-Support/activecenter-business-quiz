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

## 4. 🔴 Die einzige echte Lücke: Sprachen

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

## 6. Was daraus folgt

1. **Kein Handlungsbedarf am Versandweg.** Er läuft, meldet sauber und hat den Augustvorfall
   nachweislich abgearbeitet.
2. **Eine Entscheidung steht an:** Nurture-Vorlagen für hu/fr/ru — bauen oder bewusst
   verzichten. Bei Verzicht gehören die Fälle in die Baseline, sonst bleibt W2 dauerhaft
   gelb und wird mit der Zeit ignoriert.
3. **Ein Beobachtungspunkt:** `no_email_id` darf nicht zurückkommen. Er hat 30 Menschen
   ihre Strecke gekostet, bevor er auffiel.

*Belege: n8n-API (Workflow `RqKSRTgFv8mv04H2`, Läufe und Knotencode), Plattform-DB
`leads.lead_events`/`leads.v_lead_state_full`, Kontaktkartei `prod_contacts_activesupport`,
Mautic-API.*
