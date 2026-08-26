# Stille Zeilengrenze im Nurture-Versand — Vorfall, Ursache, Lösungsvorschlag

Stand: 26.08.2026 · Alle Zeiten in lokaler Zeit (MESZ, UTC+02:00) · Alle Zahlen gemessen,
nicht geschätzt · Erhebung rein lesend, Eingriffe ausdrücklich markiert

---

## 1. Kurzfassung

Der Nurture-Versand des Business-Leads-Quiz hat **drei Wochen lang keinen einzigen neuen
Kontakt angeschrieben**. 186 Menschen sind durch den Funnel gegangen, haben ihre Adresse
hinterlassen und nie etwas gehört.

Die Ursache ist kein Fehler im engeren Sinn, sondern das Zusammentreffen von zwei
unauffälligen Entscheidungen:

1. Die Auswahlabfrage liest über PostgREST und bekommt **hart 1000 Zeilen**, egal was sie
   anfordert (sie fordert 5000 an und sendet sogar `Range: 0-4999`).
2. Sie sortiert **`first_seen_at.asc`** — die ältesten zuerst.

Solange weniger als 1000 Leads die Bedingungen erfüllten, war beides folgenlos. Am
**06.08.2026** wurde die Grenze überschritten. Seither fällt jeder neue Kontakt hinten aus
der Liste: nie geprüft, nie übersprungen, nie protokolliert.

**Es gab keine Fehlermeldung.** Der Workflow meldete zwölfmal täglich `success`.

---

## 2. Was passiert ist

### 2.1 Der Kipppunkt, auf den Tag genau

Sichtbarkeit neuer Kontakte in der Auswahlabfrage (gemessen 26.08.):

| Tag | Kontakte mit Adresse | davon für den Versand sichtbar |
| --- | ---: | ---: |
| 05.08. | 13 | **13** |
| **06.08.** | 9 | **2** ← Grenze reißt |
| 07.08. | 7 | **0** |
| 08.08. | 14 | 0 |
| … | … | 0 |
| 24.08. | 10 | 0 |
| 25.08. | 28 | **0** |
| 26.08. | 1 | 0 |

### 2.2 Die Folge

| Größe | Wert |
| --- | ---: |
| Neue echte Kontakte seit 06.08. | 193 |
| Davon mit Nurture-Mail | **7** (alle am 06.08.) |
| Letzte Nurture-Mail überhaupt | 19.08., an eine Altkohorte |
| Leads, die die Auswahlbedingungen erfüllen | 1207 |
| Davon sichtbar | 1000 |
| **Unsichtbar** | **207** |

### 2.3 Was der Betrieb stattdessen sah

| Anzeige | Wert | Wahrheit |
| --- | --- | --- |
| Workflow-Status | 12 × täglich `success` | die Läufe liefen wirklich durch |
| `nurture_runs.candidates_checked` | ~4120 pro Tag | immer dieselben Alten |
| `nurture_runs.sent_count` | **0 an jedem Tag** | auch an Tagen mit nachweislichem Versand |
| Übersprung-Protokoll | 1 Eintrag in 10 Tagen | wer nicht in der Liste steht, wird nicht übersprungen — er fehlt |

---

## 3. Ursache

```
GET /rest/v1/v_lead_state_full
    ?source_app=eq.business_leads_quiz
    &funnel_key=eq.business
    &email_normalized=not.is.null
    &first_name=not.is.null
    &order=first_seen_at.asc     ← die Ältesten zuerst
    &limit=5000                  ← wirkungslos
Header: Range: 0-4999            ← ebenfalls wirkungslos
```

PostgREST begrenzt serverseitig über `db-max-rows` (Supabase-Standard: 1000). **Die
Server-Obergrenze sticht jeden Wunsch des Aufrufers.** Die Antwort enthält keinen Hinweis
darauf, dass abgeschnitten wurde — sie ist einfach kürzer.

Weil aufsteigend nach Erstkontakt sortiert wird, schneidet die Grenze am **jungen** Ende ab.
Genau dort stehen die Menschen, die eine Mail brauchen.

---

## 4. Warum es drei Wochen unsichtbar blieb

Drei Anzeigen, die alle grün waren:

1. **Der Workflow meldet Erfolg.** Er tut ja auch, was er soll — nur mit unvollständiger
   Eingabe.
2. **Das Übersprung-Protokoll bleibt leer.** Übersprungen wird nur, wer geprüft wurde. Wer
   gar nicht in der Liste steht, hinterlässt keine Spur.
3. **`nurture_runs.sent_count` ist immer 0** — auch am 12. bis 19.08., als nachweislich
   Mails rausgingen (16, 20, 12, 7, 3, 2, 3, 2, 2, 3 laut `lead_events`). Der Zähler wird
   nie befüllt. Diese Überwachung kann einen Totalausfall nicht von Normalbetrieb
   unterscheiden, weil sie in beiden Fällen dieselbe Zahl zeigt.

**Die Fehlerklasse:** Eine stille Obergrenze plus eine Sortierung, die das Wichtige ans Ende
legt — und eine Überwachung, die nur den Vorgang misst, nicht das Ergebnis.

---

## 5. Sofortmaßnahme (bereits umgesetzt, 26.08.)

Zwei Eingriffe am Workflow `RqKSRTgFv8mv04H2`, beide über die API deployt (neue
`versionId`), n8n danach neu gestartet:

| Änderung | Wirkung |
| --- | --- |
| `order` → `first_seen_at.desc` | Trifft die Grenze wieder zu, fallen die **Ältesten** raus — die haben ihre Phasen längst durchlaufen |
| Versandbremse gilt für **alle** Phasen (25 Erstmails, 20 Zweitmails je Lauf) | Ohne das wären beim ersten reparierten Lauf ~186 Mails auf einen Schlag rausgegangen |

**Trockenprobe vor dem Deploy:** 207 Leads werden sichtbar (Zeitraum 06.–26.08.), 207 fallen
weg — deren letzter Besuch war am **29.05.**, keiner in den letzten 14 Tagen aktiv.

### 5.1 Warum das kein vollständiger Fix ist

Die Sortierung zu drehen **verlagert den Schnitt**, sie beseitigt ihn nicht. Bei weiterem
Wachstum reißt dieselbe Grenze erneut — nur an anderer Stelle. Und ein zweiter Befund zeigt,
dass die Verlagerung nicht folgenlos ist:

> **31 der weggefallenen Leads haben noch nie eine Mail bekommen**, obwohl sie die ganze
> Zeit sichtbar waren. Es gibt dort also einen zweiten, unabhängigen Grund — ungeklärt.

---

## 5.2 🔴 Nachtrag aus der Zweitmeinung: Es waren ZWEI gekappte Abfragen

Eine unabhängige Prüfung am selben Tag hat den entscheidenden Punkt gefunden, den diese
Analyse übersehen hatte: **`Supabase - Get Test Events` ist ebenfalls gekappt.** Sie liest
die Versand-Historie aus `lead_events` und bekommt 1000 von damals 1543 Zeilen. Die
ältesten `nurture_sent`-Ereignisse (15.05.–23.06.) sind für den Workflow unsichtbar.

Diese Kappung war die gefährlichere:

1. **213 Personen wurden alle zwei Stunden fälschlich erneut als Erstphase vorgeschlagen**,
   weil ihr Versand-Ereignis aus dem Fenster gefallen war. Das erklärt die konstanten ~340
   „Kandidaten" je Lauf und die auf zwölf Minuten gewachsene Laufzeit.
2. **Der einzige verbliebene Schutz gegen Doppelversand war ein Mautic-Feld**
   (`ac_nurture_sent_phases`). Es hat gehalten — für alle 213 in der Mautic-Datenbank
   geprüft, keine Dubletten. Aber es war eine einzige Schicht: ein fehlgeschlagenes
   Nachtragen, und die Person bekommt die Mail bei jedem Lauf erneut.
3. **12 Personen waren in der Zweitphase dauerhaft eingefroren:** Erstmail-Ereignis
   unsichtbar → Erstphase wird ewig vorgeschlagen → Übersprung `already_sent` → der Zweig
   „Zweitmail nach 48 Stunden" wird nie erreicht. Das erklärt auch die abfallende
   Versandkurve vom 06. bis 19.08.
4. **Sie verschärfte sich selbst.** Jede Sendung verdrängt ein älteres Ereignis. Gemessen:
   1543 → **1606** innerhalb weniger Stunden, allein durch die 63 Mails des ersten
   reparierten Laufs.

### Weitere Korrekturen aus der Zweitmeinung

| Aussage oben | Richtigstellung |
| --- | --- |
| „Höchstens 25 Erstmails je Lauf" | Die Bremse zählt **je Phase**: 4 × 25 + 4 × 20 = bis 180. Gemessen im ersten Lauf: 63, davon `a2` und `b1` mit exakt 25 an ihrer Phasengrenze |
| „Das Übersprung-Protokoll bleibt leer" | Fehldeutung: `nurture_subject_states` ist eine **Zustands**tabelle, kein Protokoll. Real werden alle zwei Stunden ~60 übersprungen |
| „31 Leads ohne je eine Mail" | Zahl nicht reproduzierbar. Aufgeklärt: 46 haben den Abschluss geklickt (absichtlich ausgeschlossen), 6 sind Testleads, **eine** echte Anomalie: ein Lead ohne `form_submitted_at`, der still und dauerhaft durchfällt |
| „Die Weggefallenen haben ihre Phasen durchlaufen" | **16 hatten eine offene Zweitmail.** Entscheidung Markus: nachsenden |
| „Weg C ist zu riskant" | Trifft nur zeilenweises Filtern. Die 1000er-Fensterung zerreisst Personengruppen **bereits jetzt** — 11 Fälle gemessen, bei 4 davon ist der sichtbare Rang niedriger als der echte |
| „Ohne Testinstanz nicht verantwortbar" | Zu pessimistisch; ein Wegwerf-Workflow mit reinem GET beweist es gefahrlos. n8n läuft in **2.32.7**, nicht 1.x |
| Zahlenreihe „12.–19.08." | Datumszuordnung um einen Tag verschoben |

### Mechanik hinter `sent_count = 0` gefunden

`Supabase - Log Run` zählt über `$('Supabase - Log Sent').all()` — **Querverweise in fremde
Schleifenzweige**. Ein `try/catch` im Ausdruck schluckt jeden Fehlschlag zu `[]` und damit
zu 0. `candidates_checked` funktioniert, weil dessen Quelle ein echter Vorgänger ist.
Konsequenz: **nicht in n8n zählen, sondern in SQL.**

---

## 5.3 Umgesetzte Reparatur (26.08., zweiter Deploy)

Nach der Zweitmeinung wurde der eigentliche Fix gebaut — **Blätterung statt Sortierumkehr**:

| Änderung | Wirkung |
| --- | --- |
| **Beide** Abfragen blättern (Seitengröße 1000, Abbruch bei kürzerer Seite, Reissleine 20 Seiten) | Die Grenze kann nichts mehr verschlucken |
| Eindeutiger Zweitschlüssel in der Sortierung (`lead_hash`, `event_uid`) | Ohne ihn erscheinen bei gleichen Zeitstempeln Zeilen über Seitengrenzen doppelt oder gar nicht |
| Seite-1-Falle im Phasenknoten geschlossen | Die alte Zeile las `items[0].json` — eine Blätterung ohne diesen Fix hätte **nur Seite 1** verarbeitet und nichts verbessert |
| `Range`-Header entfernt | Waren wirkungslos und konkurrierten mit dem Versatz |
| Globale Bremse: 60 Mails je Lauf | Die Zählung je Phase allein liess bis 180 zu |

**Vorher an echten Daten bewiesen:** Leads 1000 + 207 + 0 = 1207 Zeilen, alle verschieden,
exakt der SQL-Sollwert. Ereignisse 1000 + 606 + 0 = 1606, ebenso.

**Vorabsimulation des gepatchten Codes** gegen den vollständigen Bestand: 145 vorgeschlagene
Empfänger statt 334 im gekappten Zustand — der gekappte Zustand schlug **mehr als doppelt so
viele** vor, weil er dieselben Leute immer wieder anbot. Zweitmails steigen von 38 auf 66:
die eingefrorenen tauen auf, die 16 nachzusendenden sind dabei.

---

## 6. Lösungsvorschläge

### A — Seitenweise lesen (Pagination im HTTP-Knoten)

Der Knoten holt Seite für Seite, bis eine Seite kürzer als die Seitengröße ist.

- **Für:** Beseitigt die Grenze wirklich. Kein Datenverlust, unabhängig von der Menge.
- **Gegen:** n8n kann das (`updateAParameterInEachRequest`), aber die offizielle
  Dokumentation gibt die exakte Konfiguration für Offset-Paginierung **nicht** her. Blind
  konfigurieren heisst: an einem laufenden Versand raten. Ohne Testinstanz nicht
  verantwortbar.
- **Aufwand:** mittel · **Risiko:** mittel bis hoch ohne Testmöglichkeit

### B — Server-Obergrenze anheben (`db-max-rows`)

Supabase-Projekteinstellung von 1000 auf z. B. 10000.

- **Für:** Eine Einstellung, sofort wirksam, kein Code.
- **Gegen:** Verschiebt die Wand nur weiter nach hinten. Wirkt auf **alle** 14
  PostgREST-Verbraucher, nicht nur auf diesen Workflow. Und sie verschwindet ohnehin mit
  Phase 4.
- **Aufwand:** minimal · **Risiko:** niedrig, aber Wirkung projektweit

### C — Ergebnismenge an der Quelle klein halten

Nur Leads liefern, bei denen überhaupt noch eine Phase feuern kann.

- **Für:** Die Menge bliebe dauerhaft weit unter jeder Grenze, und die Abfrage würde
  ausdrücken, was sie meint.
- **Gegen:** 🔴 **Ändert die Semantik.** Die Phasenlogik gruppiert je E-Mail über **alle**
  Sitzungen dieser Person und bestimmt daraus den höchsten Rang. Wird serverseitig
  gefiltert, verschwinden einzelne Sitzungen aus der Gruppe — jemand mit einer alten
  Sitzung (Rang 3) und einer neuen (Rang 0) würde plötzlich als Rang 0 gelten und die
  Erstmail **erneut** bekommen. Ein Filter auf `cta_type` hätte denselben Effekt: Wer den
  Abschluss geklickt hat, wäre über seine zweite Sitzung wieder versandfähig.
- **Aufwand:** mittel · **Risiko:** hoch, wenn nicht sehr sorgfältig gemacht

### D — Abschneiden erkennbar machen (Wächter)

Nicht die Grenze beseitigen, sondern ihr Zuschlagen **laut** machen: Wenn die Antwort genau
so viele Zeilen hat wie die Obergrenze, ist garantiert etwas abgeschnitten worden.

- **Für:** Fängt die **Fehlerklasse**, nicht nur diesen Fall — auch an jeder anderen Stelle,
  wo über PostgREST gelesen wird. Unabhängig von n8n, kann also von einem n8n-Fehler nicht
  mitgerissen werden.
- **Gegen:** Verhindert den Ausfall nicht, verkürzt ihn nur von Wochen auf Stunden.
- **Aufwand:** niedrig · **Risiko:** sehr niedrig

### E — Direkter Treiber (Phase 4)

Nach der Ablösung von PostgREST durch Kysely/`pg` existiert **keine implizite
Zeilengrenze** mehr. Der Treiber liefert, was die Abfrage ergibt.

- **Für:** Beseitigt die Fehlerklasse strukturell.
- **Gegen:** Kommt erst mit Phase 4; die neue Grenze heisst dann Arbeitsspeicher statt
  Zeilenzahl, was eigene Sorgfalt braucht (`LIMIT` bewusst setzen, Ergebnisse streamen).
- **Aufwand:** ohnehin geplant · **Risiko:** Teil der Migration

---

## 7. Empfehlung

**Kurzfristig: D sofort, zusätzlich zur bereits umgesetzten Sofortmaßnahme.**

Ein externer Wächter, der zwei Dinge misst:

1. **Berührt eine Ergebnismenge die Obergrenze?** Dann ist garantiert abgeschnitten worden.
   Diese Prüfung gilt für jede PostgREST-Abfrage, nicht nur für diese.
2. **Werden Kandidaten geprüft, aber über Stunden nichts gesendet?** Genau diese Lücke war
   drei Wochen offen.

Bewusst **ausserhalb** von n8n, damit ihn ein n8n-Fehler nicht mitreißt — dieselbe
Überlegung wie beim Domain-Sweep, der bewusst nicht auf der Box läuft, die er überwacht.

**Mittelfristig: A, sobald eine Testinstanz zur Verfügung steht.** Ein Staging-n8n oder ein
Wegwerf-Workflow, an dem die Paginierung erprobt wird, bevor sie den Versand berührt.

**B ausdrücklich nicht**, weil es projektweit wirkt und das Problem nur vertagt.

**C ausdrücklich nicht**, solange die Gruppierung je Person nicht umgebaut ist — das Risiko,
jemanden doppelt anzuschreiben, wiegt schwerer als die Ersparnis.

**E als Abnahmekriterium in Phase 4 festschreiben**, damit die Freiheit von der
Zeilengrenze nicht zufällig entsteht, sondern geprüft wird.

---

## 8. Offene Punkte

1. 🔴 **31 Leads ohne je eine Mail**, obwohl sichtbar. Zweiter, unabhängiger Grund —
   ungeklärt. Verdacht: Übersprung wegen fehlendem Mautic-Kontakt, fehlenden Beraterdaten
   oder nicht unterstützter Sprache. Die Übersprung-Gründe existieren im Code
   (`contact_not_found`, `no_coach_data`, `unsupported_language:…`, `no_email_id:…`), werden
   aber nur bei „log worthy" protokolliert.
2. 🔴 **`nurture_runs.sent_count` wird nie befüllt.** Die Tabelle hat die richtigen Spalten
   (`candidates_checked`, `sent_count`, `skipped_count`, `failed_count`), aber nur die erste
   trägt Werte. Solange das so ist, ist jede Auswertung dieser Tabelle irreführend.
3. **186 übergangene Kontakte.** Freigabe liegt vor, dass sie Mails bekommen dürfen. Mit der
   Bremse von 25 je Lauf ist der Rückstand in etwa einem Tag abgearbeitet.
4. **Keine Nachweiskette für Kontaktlöschungen** (getrennter Befund, siehe
   Cutover-Protokoll): Die Anwendung auditiert nur Berater, nicht Kontakte.

---

## 9. Fragen für die zweite Meinung

1. Gibt es einen Weg, die Paginierung im n8n-HTTP-Knoten **verlässlich** zu konfigurieren,
   ohne ihn an einem produktiven Versand zu erproben? Welche Feldnamen sind in n8n 1.x
   tatsächlich gültig?
2. Ist die Sortierumkehr als Zwischenlösung fachlich sauber, oder gibt es einen Fall, in dem
   das junge Ende die Grenze berührt und dann doch jemanden verschluckt?
3. Wie liesse sich Vorschlag C sicher bauen — also die Menge an der Quelle verkleinern,
   **ohne** die Gruppierung je Person zu verletzen? (Denkbar: eine Datenbanksicht, die
   bereits je Person aggregiert liefert, statt je Sitzung.)
4. Welche weiteren Stellen im Verbund lesen über PostgREST und könnten dieselbe stille
   Grenze treffen? (14 Verbraucher teilen die Instanz.)
5. Wie sollte der Wächter genau messen, damit er weder blind noch geschwätzig ist?
