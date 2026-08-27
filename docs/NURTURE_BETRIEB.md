# Nurture-Versand — Betriebsregeln

Stand 26.08.2026 · Kanonische Fassung. Das Verzeichnis `Leads_quiz_Nurture` ist **kein
Git-Repository**; die dortige `README.md` verweist hierher, damit diese Regeln versioniert
sind und einen Versehensfall überleben.

Vorgeschichte: `docs/audits/2026-08-26-nurture-zeilengrenze-vorfall.md`

---

## Warum es diese Seite gibt

Am 26.08.2026 kam heraus, dass der Versand **drei Wochen lang keinen neuen Kontakt
angeschrieben** hatte. 186 Menschen gingen durch den Funnel, hinterliessen ihre Adresse und
hörten nie etwas — während der Workflow zwölfmal täglich `success` meldete.

Nichts davon war ein Absturz. Jede Anzeige war grün. Genau das ist die Lehre.

---

## 1. Die Zahlen in `nurture_runs` sind nicht die Wahrheit

| Spalte | Realität |
| --- | --- |
| `sent_count` | steht **strukturell auf 0** — an jedem Tag, auch an Tagen mit nachweislichem Versand |
| `started_at` | Zeitpunkt der **Protokollierung**, nicht des Laufbeginns |
| `candidates_checked` | brauchbar |

**Warum `sent_count` nie stimmen kann:** Der Workflow schreibt den Laufeintrag, **bevor** die
Sendungen erfasst werden. Gemessen am 26.08.: Eintrag 10:12:00–03, Sendungen 10:12:05–16.
Die Zahl existiert zum Schreibzeitpunkt noch gar nicht. Jede Reparatur im Schreibpfad
ergäbe wieder 0, nur mit mehr Code.

**Echte Zahlen: `public.v_nurture_runs_wahr`**, Spalte `gesendet_wahr`. Die Sicht leitet den
Wert beim Lesen aus `lead_events` her — rückwirkend korrekt, ohne Eingriff in den
Schreibpfad.

> Beleg: In den 21 Tagen vor dem Vorfall meldete `nurture_runs` **0** Mails.
> Tatsächlich waren es **103**.

An den irreführenden Spalten stehen Warnkommentare in der Datenbank selbst
(`comment on column`), damit man beim Abfragen darüber stolpert.

---

## 2. Leseabfragen: die stille Zeilengrenze

PostgREST begrenzt serverseitig auf **1000 Zeilen** (`db-max-rows`). `limit=` und der
`Range`-Header sind **Wünsche des Aufrufers**, keine Zusagen. Die Antwort ist einfach
kürzer — kein Fehler, kein Statuscode, keine Warnung.

Genau daran ist der Versand gescheitert: Zwei Abfragen liefen in die Grenze, sortiert nach
den Ältesten zuerst. Als die Leadzahl am 06.08. über 1000 stieg, fiel jeder neue Kontakt
hinten aus der Liste.

**Beide Abfragen blättern jetzt.** Drei Dinge gehören zwingend dazu:

1. **Seitengrösse = Serverobergrenze** (1000). Bei `limit=5000` stimmt die Versatzrechnung
   nicht mehr.
2. **Eindeutiger Zweitschlüssel in der Sortierung** (`lead_hash`, `event_uid`). Ohne ihn
   erscheinen bei gleichen Zeitstempeln Zeilen über Seitengrenzen doppelt oder gar nicht.
3. **Alle Seiten verarbeiten.** `Code - Determine Phase` las früher nur `items[0].json` —
   eine Blätterung ohne diesen Fix hätte nur den Anschein einer Reparatur erzeugt.

🔴 **Wer eine neue Listenabfrage baut, trägt sie in `scripts/waechter-nurture.js` ein**
(Abschnitt `LISTENABFRAGEN`). Sonst schlägt dieselbe Falle an anderer Stelle erneut zu.

Erkennungsregel für jede PostgREST-Abfrage: **Kommen genau so viele Zeilen zurück wie die
Obergrenze, wurde garantiert abgeschnitten.** Das ist die einzige verlässliche Erkennung.

Mit Phase 4 (Kysely/`pg`) verschwindet diese Fehlerklasse strukturell — der direkte Treiber
kennt keine implizite Grenze. Als Abnahmekriterium festgehalten im Audit, Phase 4 Punkt 8.

---

## 3. Der Versand hängt an der MySQL-Kontaktkartei

Seit dem 26.08. fragt der Workflow vor jedem Lauf die Kartei (`91.99.76.104`, Schema
`prod_contacts_activesupport`) und schliesst dort gelöschte Kontakte aus.

**Anlass:** 12 Nurture-Mails gingen an 6 Menschen, **nachdem** sie in der Kartei gelöscht
waren. Einer meldete sich daraufhin selbst ab — aus einem stillen Datenfehler wurde ein
Mensch, der aktiv „lass mich in Ruhe" sagen musste. Die Auswahlabfrage kannte den
Löschzustand nicht, weil PostgreSQL ihn nicht führt.

🔴 **Der Knoten ist fail-closed.** Ist die Kartei nicht erreichbar, wird **nicht versendet**.
Das ist Absicht — lieber keine Mail als eine an jemanden, der gelöscht wurde. Es macht die
Kartei aber zur **harten Laufzeitabhängigkeit** des Versands. Fällt sie aus, steht der
Versand komplett; der Fehler muss im Alarm-Workflow ankommen.

⚠️ Löschungen in der Kartei werden **nirgends protokolliert**. Die Anwendung auditiert nur
Berater, nicht Kontakte, und es gibt keine Spalte, die festhält, wer gehandelt hat. Wer
wissen will, ob sich jemand selbst ausgetragen hat, muss Mautic als zweite Quelle
danebenlegen (`lead_donotcontact`).

---

## 4. Der Wächter

| | |
| --- | --- |
| Was | `scripts/waechter-nurture.js` |
| Wo | **`167.233.251.217`**, `/opt/waechter-nurture/` |
| Wann | stündlich zur Minute 37 |
| Womit | Node in einem Wegwerf-Container (`node:24-alpine`) — hängt an keiner Host-Laufzeit |
| Zugang | `/opt/waechter-nurture/.env`, Rechte 600, nur Lesezugriff |
| Meldeweg | Herzschlag `[NURTURE] Versand-Wächter (stündlich)`, Frist 90 min + 5 min Kulanz |

**Bewusst nicht auf `46.224.76.193`** — dort läuft n8n, also genau das System, das überwacht
wird. Ein Wächter auf derselben Maschine fällt mit ihr aus.

🔴 **Herzschlag bewusst herum:** Bei sauberem Lauf wird gepingt, bei einem Befund **nicht**.
Damit alarmiert Better Stack in beiden Fällen, die wehtun — Störung gefunden **oder** der
Wächter läuft nicht mehr. Damit wird auch der Wächter bewacht.

**Er misst das Ergebnis, nicht den Vorgang — und zwar in der Semantik des Versands:**

- **W1** — berührt eine Ergebnismenge die Zeilengrenze? Blätternde Abfragen werden
  ausdrücklich anders bewertet, sonst schriee er genau die Stellen an, die repariert sind.
- **W2** — warten fällige Empfänger, während der Versand steht? Gezählt wird je **Mensch**
  (E-Mail-Gruppe über alle Sitzungen), exakt wie der Workflow denkt. Die erste Fassung
  zählte je Datensatz und meldete 81 Fällige, wo real 9 warteten — 21 hatten ihre Mail
  unter einem anderen Hash derselben Person, 28 waren über Zweitsitzungen in höheren
  Rängen. Fällige allein sind nur eine **Warnung**; Alarm gibt es erst bei der
  **Kombination** aus fälligen Empfängern und stehendem Versand.
- **W3** — strukturell Unerreichbare (kein Ziel → keine Mail-Variante; keine Absendezeit →
  nie fällig). Gegen eine **Hash-Baseline** bekannter, begründeter Ausnahmen
  (`scripts/waechter-nurture-baseline.json`): gewarnt wird nur bei **neuen** Fällen,
  verschwundene Einträge werden zum Aufräumen gemeldet. Ohne Baseline wäre die Warnung
  wegen 8 unheilbarer Altdatenfälle für immer an — und Dauergelb erzieht zum Wegsehen.
- **W4** — konvertieren Werbe-Besucher? Kommen in 24 h ≥ 15 Besucher mit
  Werbe-Attribution (`fbclid`), aber **kein einziges** Opt-in daraus → ALARM. Ein
  Verhältnis, kein Absolutwert: bei pausierter Kampagne schweigt die Prüfung. Hintergrund
  ist der Vorfall vom 26./27.08. (0/49 Anzeigen-Konversionen nach dem Cutover, Ursache
  HTTP/3-Ankündigung des neuen Proxys —
  [Vorfallsdoku](audits/2026-08-27-anzeigenkonversion-http3.md)). Erste Prüfrichtung im
  Alarmfall: Antwort-Kopfzeilen (`Alt-Svc`/Protokolle) gegen den letzten guten Stand.
- **W5** — trägt jedes Opt-in seine 6 Antwortzeilen? Ein Opt-in mit weniger als 6 Zeilen
  in `lead_answers_current` ist ein Teilverlust — genau die Klasse, die am 27.08. drei
  Monate lang unsichtbar war (void-RPC-Abriss nach Antwort 1; fünf weitere Altfälle aus
  der Ereignisstrom-Ära). Gegen dieselbe Hash-Baseline (`antworten_unvollstaendig`);
  Einzelfall = WARNUNG (Sonderwege wie der alte Landing-Page-Eingang), ab drei NEUEN
  Fällen = ALARM, denn der Opt-in-Pfad schreibt seit PR #91 alle Antworten selbst.
  Heilweg: `node scripts/backfill-antworten.js` (Trockenlauf zeigt den Plan; füllt nur
  fehlende Refs, nie Vorhandenes).

Prüfen ohne Datenbankzugriff: `node scripts/waechter-nurture.js --selbsttest` — 8 Fälle,
darunter ausdrücklich „der echte Vorfall wäre erkannt worden".

🔴 **Der Wächter läuft als Dateikopie, nicht aus dem Repo.** Wer
`scripts/waechter-nurture.js`, die Baseline oder `scripts/stats-logs-baseline.js` ändert,
muss die Kopie auf dem Server nachziehen — sonst wacht in Produktion der alte Stand:

```bash
# 1. Sicherung der Server-Kopie (Rückweg)
ssh root@167.233.251.217 "cp /opt/waechter-nurture/waechter-nurture.js{,.bak-$(date +%Y%m%d)} \
  && cp /opt/waechter-nurture/waechter-nurture-baseline.json{,.bak-$(date +%Y%m%d)}"
# 2. Geänderte Dateien aus dem gemergten main-Stand kopieren
scp scripts/waechter-nurture.js scripts/waechter-nurture-baseline.json \
  root@167.233.251.217:/opt/waechter-nurture/
# 3. Manueller Lauf als Nachweis (Exit 0 pingt den Herzschlag)
ssh root@167.233.251.217 "/opt/waechter-nurture/lauf.sh"
```

Zugang: `id_rsa` (der Key hat eine Passphrase — Agent/Askpass nötig, sonst scheitert er
still als `Permission denied`). 🔴 Fehlversuche sparsam dosieren: fail2ban sperrt die IP
nach wenigen Versuchen für ~55 Minuten (`Connection refused`).

🔴 **Grundsatz aus der Kalibrierung am 26.08.:** Ein Wächter, der eine andere Semantik
misst als das System, das er bewacht, erzeugt Dauerwarnungen. Wer eine Prüfung ergänzt,
übernimmt die Sicht des Workflows (Gruppierung, Ausschlüsse), nicht die der Tabelle.

> Ein Wächter, den man nie hat anschlagen sehen, ist kein Wächter. Beide Wege wurden am
> 26.08. end-to-end nachgewiesen, auch der Alarmweg mit einem erzwungenen Ausfall.

---

## 5. Versandbremse

Höchstens **60 Mails je Lauf** insgesamt, dazu 25 je Erstphase (`a2`, `b1`, `c1`, `d1`) und
20 je Zweitphase (`a3`, `b2`, `c2`, `d2`).

Die Zählung je Phase allein liess theoretisch 4 × 25 + 4 × 20 = **180** Mails in einem Lauf
zu — genau der Schwall, den die Bremse verhindern sollte.

---

## 6. Zwei Dinge, die man beim Messen wissen muss

**Der Zeitplan ist ein Intervall, kein Termin** (`hoursInterval: 2`). Wer nach einem Deploy
auf eine bestimmte Uhrzeit wartet, kann danebenliegen.

**Änderungen am Workflow nur über die API**, nie per SQL: n8n hält die Definition im
Arbeitsspeicher, ein direktes `UPDATE` wird vom laufenden Prozess ignoriert. Danach
Container neu starten. Ablauf: Skill `n8n-workflow-update`.
