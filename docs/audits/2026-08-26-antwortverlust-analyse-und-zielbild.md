# Antwortverlust im Funnel — Befund, Heilung, Zielbild

Stand: 26.08.2026 · Alle Zahlen gemessen · Erhebung rein lesend

---

## 1. Der Befund in einem Satz

**Die Antworten sind nicht verloren — sie liegen fast vollständig in MySQL.** Verloren ist
nur der PostgreSQL-Ereignisstrom, und der war für die kritischen Daten nie die richtige
Transportschicht.

## 2. Was gemessen wurde

116 von 1.068 Menschen (10,9 %) haben ein Opt-in, aber keine einzige gespeicherte
Quiz-Antwort in PostgreSQL. Aufgeschlüsselt gegen die MySQL-Kontaktkartei:

| Lage | Anzahl | Bedeutung |
| --- | ---: | --- |
| **Volle Antworten in MySQL** | **105** | Unser Funnel, Opt-in trug alle Antworten — nur der PG-Ereignisstrom fehlt. **Heilbar.** |
| Fremd-Quiz (Tierprofile, z. B. „Wal") | 4 | Alte Eingänge „Landing Page Business" / „DE - Business Interest" — anderes Quiz, anderes Profilschema |
| Nicht in MySQL | 5 | Altdatenprobleme (u. a. der bekannte Kathrin-Fall) |
| Unklar | 2 | Einzelfälle, gesondert ansehen |

Zeitverlauf: große Häufung 11.–30. Mai (Fire-and-forget-Ära, vermutlich Störungsfenster),
seither vereinzelt, **seit dem Cutover auf Coolify: 0 von 56 Besuchern** mit Verlust.

Die drei August-Fälle im Detail:
- **05.08. / 25.08.**: unser Funnel, volle Antworten in MySQL, PG-Ereignisse fehlen.
  Der 25.08.-Fall lag **fünf Stunden vor** dem Cutover-Ausfallfenster — kein Zusammenhang.
- **17.08. (Can)**: alter Eingang „Landing Page Business" mit Tierprofil-Quiz. Dieser
  Eingang lebt noch und liefert vereinzelt Kontakte (7 seit Juni).

## 3. Warum das passieren konnte — der Konstruktionsfehler

Der Funnel hat heute **zwei Transportwege** für dieselbe Person:

```
Browser ──(je Ereignis)──> /api/lead-track ──> PostgreSQL   ← fragil, verlierbar
Browser ──(einmal, Opt-in)──> /api/bridge ──> MySQL          ← kommt praktisch immer an
```

Der Opt-in-Aufruf trägt **bereits heute alle zehn Antworten** in seinem Paket — sie landen
aber nur im MySQL-JSON. Der Rücklese-Pfad kopiert daraus nur die Kontaktfelder nach
PostgreSQL und **wirft die Antworten weg**. Profil und Ziel entstehen in PostgreSQL
ausschliesslich aus dem fragilen Ereignisstrom.

Fällt der Ereignisstrom aus (Fire-and-forget bis 23.08., offene Tabs mit altem Bundle,
Blocker, Netzabbrüche), gilt: **Kontakt da, Antworten „weg"** — obwohl sie im selben
Moment vollständig in MySQL ankamen.

Folgekette: kein Profil → kein Ziel → keine Mail-Variante → nie eine Nurture-Mail.
Der Wächter (W3) zeigt diese Menschen seit heute an.

## 4. Sofortige Heilung (aktuelles System, zwei Schritte)

### 4.1 Backfill der 105 aus MySQL

Die Antworten stehen im `form_response`-JSON. Ein Skript liest sie und schreibt sie über
die **vorhandenen** Wege nach PostgreSQL (`upsert_answer_current`, Profil/Ziel in
`lead_state`). Trockenlauf → ein Testfall → alle.

⚠️ Entscheidung dabei: Mit Profil und Ziel werden diese Menschen **nurture-fähig** — auch
Kontakte aus dem Mai bekämen dann ihre erste Mail. Die Versandbremse (60 je Lauf) verteilt
das über Tage. Empfehlung: ja, nachsenden — dieselbe Logik wie bei den zweien vom 23.07.
(„besser jetzt als gar nie"). Wer das nicht will, bekommt den Backfill mit Nurture-Sperre.

### 4.2 Opt-in schreibt selbst nach PostgreSQL

Eine Erweiterung im Bridge-Pfad: Der Aufruf, der nachweislich ankommt, persistiert die
mitgelieferten Antworten + Profil + Ziel **serverseitig** nach PostgreSQL — atomar,
idempotent über den `lead_hash`. Damit ist der kritische Datensatz ab dem Opt-in
vollständig, **egal was mit dem Ereignisstrom passiert**. Die Ereignisse bleiben als
Telemetrie (Videofortschritt, Ranking), sind aber nie mehr die einzige Quelle.

## 5. Zielbild für Coolify + PostgreSQL (Phase 4) — „ein Weg, ein Aufruf, eine Transaktion"

Deckt sich mit dem Branchenstandard (Recherche 26.08.): kritische Daten über **einen
atomaren, idempotenten Aufruf**; Wiederholungen sind sicher, weil ein Idempotenzschlüssel
Duplikate verhindert; Verbuchung und Idempotenzprüfung in **einer** Datenbanktransaktion;
Ereignisse sind Telemetrie, nie Wahrheit.

```
                    EIN kanonischer Aufruf beim Opt-in
Browser ────────────  POST /api/lead/submit  ───────────────────┐
                      Idempotenzschlüssel: lead_hash            │
                                                                ▼
                                              ┌─ EINE Postgres-Transaktion ─┐
                                              │  lead_state (Kontakt)       │
                                              │  lead_answers (alle 6+2)    │
                                              │  Profil + Ziel (serverseitig│
                                              │  aus den Antworten gerechnet│
                                              │  – deterministisch)         │
                                              │  Outbox-Eintrag für MySQL   │
                                              └─────────────────────────────┘
                                                                │
                       Outbox-Worker (existiert schon) ─────────┴──> MySQL-Kartei

Browser ──(Telemetrie: Video, Klicks)──> Ereignisse mit Warteschlange — nice to have,
                                          Verlust kostet nur Statistik, nie den Menschen
```

Grundsätze, jeweils mit dem Grund:

1. **Ein Aufruf trägt alles.** Der Opt-in-POST enthält Antworten, Profil-Eingaben, Sprache,
   Attribution. Kommt er an, ist der Mensch vollständig. Kommt er nicht an, sieht der
   Nutzer einen Fehler und drückt erneut — kein stiller Verlust möglich.
2. **Idempotent über den `lead_hash`** (клient-generiert, existiert bereits): Doppelklick,
   Retry, Timeout-Wiederholung erzeugen nie Duplikate. Prüfung über Unique-Constraint in
   derselben Transaktion, nicht über „erst prüfen, dann schreiben".
3. **Profil wird serverseitig gerechnet**, aus den gespeicherten Antworten. Der Client
   zeigt es nur an. Damit kann ein Client-Fehler nie mehr ein leeres Profil hinterlassen.
4. **Eine Wahrheit je Datenart** (Option C aus der Architekturentscheidung): PostgreSQL für
   Verhalten und Funnel-Zustand, MySQL-Kartei für die Person — verbunden über die Outbox,
   die es schon gibt.
5. **Kein PostgREST im kritischen Pfad** (Phase-4-Abnahmekriterium „keine stille
   Zeilengrenze" gilt weiter): direkter Treiber, `LIMIT` nur mit Begründung.
6. **Abgleich statt Hoffnung:** ein täglicher Lesevergleich MySQL-JSON ↔ PG-Antworten
   (Bauart wie der Videorang-Abgleich). Er hätte diesen Fund im Mai nach einem Tag gemeldet
   statt nach drei Monaten.

Was dabei **wegfällt** (Vereinfachung, kein Umbau-Zusatz): der Rücklese-Umweg
Bridge→MySQL→Readback→PG für Kontaktdaten, die Abhängigkeit des Profils vom
Ereignisstrom, und die Sonderbehandlung „Kontakt ohne Profil" im Nurture.

## 5b. Ergebnis der Umsetzung (26.08., Abend)

Beide Massnahmen aus Abschnitt 4 sind umgesetzt und am echten System bewiesen:

| Massnahme | Ergebnis |
| --- | --- |
| **Backfill** (PR #86, Skript `scripts/backfill-antworten.js`) | **343 Leads geheilt**: ohne Profil 116→8, ohne Ziel 9→8, ohne Barriere 51→8, ohne Antwortzeilen 343→11. Einzeltest mit Vorher/Nachher, dann voller Lauf. Nur NULL-Felder gefüllt, nie überschrieben. |
| **Opt-in-Persistenz** (derselbe PR) | Der Opt-in-Pfad schreibt Barriere und alle sechs Antworten selbst nach PostgreSQL — **ein Extraktor** für Live-Pfad, Backfill und Tests (8 neue Testfälle). |
| **Beweis am echten Verkehr** | Zwei Opt-ins am Abend des 26.08. (19:42, 18:27): beide **sofort** mit Profil, Ziel, Barriere und 6 Antworten. |

Die 8 verbleibenden Fälle sind Altdaten und Fremd-Quiz-Einsendungen ohne heilbare Quelle —
begründet je Hash in `scripts/waechter-nurture-baseline.json`; der Wächter (W3) meldet nur
noch **neue** Fälle dieser Klasse.

Zwei Fallen aus der Umsetzung, im Code dokumentiert: MySQLs `TO_BASE64` bricht alle
76 Zeichen um (ohne `REPLACE` scheitert der Transport **still** mit „0 heilbar"), und die
Kandidatensuche muss auch Leads erfassen, denen **nur** die Antwortzeilen fehlen.

Die Nurture-Freigabe für die Geheilten kam von Markus („besser jetzt als gar nie"); die
Versandbremse hat den Rückstand über den Tag sauber abgetragen (63→45→25→3→0 je Lauf).

---

## 6. Offene Nebenbefunde

1. **Alter Eingang „Landing Page Business" lebt** (7 Kontakte seit Juni, Tierprofil-Quiz,
   `ref_id` durchweg 25851739). Entscheidung: abschalten/umleiten oder bewusst behalten —
   dann brauchen seine Kontakte eine eigene Nurture-Behandlung, das Profilschema passt
   nicht zu unserem.
2. **Offene Tabs mit altem Bundle** können nach einem Deploy noch Stunden mit altem Code
   senden. Die Cache-Kopfzeilen sind korrekt (`must-revalidate` + ETag) — das Restrisiko
   sind nur bereits geladene Seiten. Mit 4.2 wird es bedeutungslos.
3. Kathrin-Fall (bekanntes Altdatenproblem, April/Mai) und die 4 Tierprofil-Kontakte:
   nach dem Backfill als bewusste Ausnahmen in die Wächter-Baseline.
