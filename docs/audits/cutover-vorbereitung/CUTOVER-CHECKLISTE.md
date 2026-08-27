# Cutover-Checkliste — Supabase → Plattform-Datenbank

**Stand: 27.08.2026, 22:00 MESZ · Ausführung geplant für ~03:00 MESZ.**

Dieses Dokument wird in der Cutover-Nacht von oben nach unten abgearbeitet. Es ist so
geschrieben, dass es **ohne Vorwissen** funktioniert — eine neue Sitzung fängt hier an
und braucht nichts weiter als dieses Dokument.

Jeder Schritt nennt seinen Nachweis und seinen Rückweg.

> 🔴 Regel für die ganze Nacht: **Kein Schritt ohne Nachweis.** Wenn eine Prüfung nicht
> grün ist, wird nicht weitergegangen — es wird zurückgerollt. Der Rückweg kostet das
> Fenster, nicht die Daten.
>
> 🔴 **Zeiten immer in MESZ prüfen.** Die Datenbank-Zeitstempel sind **UTC** (also zwei
> Stunden früher). Am 27.08. wurde 18:xx UTC einmal als Lokalzeit gelesen und der
> Cutover fast zur Hauptverkehrszeit gestartet. Vor dem Start gilt:
> `node --env-file=.env.prod scripts/cutover.js pruefen` **und** die Uhrzeit
> gegenprüfen. Gemessen über sieben Tage: 04 Uhr trägt **1** Ereignis, 19 Uhr **643**.

## Ablauf in einem Satz

`pruefen` → `cutover-n8n.js aus` → `barriere-an` → `stillstand` → `uebertragen` →
`nachweisen` → Coolify-Variable → Wächter → pg_cron → `cutover-n8n.js an`.
Alles liegt bereit; für keinen Schritt ist ein Handgriff im Supabase- oder
n8n-Dashboard nötig.

---

## Vor der Nacht — Stand der Vorbereitung

| | Stand |
| --- | --- |
| Ziel-Schema in `hl_support` | ✅ importiert, Parität 356/356 · 65/65 · 86/86 · 6/6 · 20/20 · 5/5 |
| Rechte `leads_app` | ✅ lesen, schreiben, Funktionen ausführen (Standardrechte griffen) |
| Direkter Treiber (Stufe B) | ✅ gebaut, 10/10 gegen Test-DB bewiesen, deployt — Standard noch PostgREST |
| Wächter | ✅ Dateien und Treiber liegen auf der Box, Sicherungen angelegt, läuft unverändert |
| Cutover-Skript | ✅ `scripts/cutover.js`, Vorbedingungen 6/6 grün |
| Schema-Umschreiber | ✅ `scripts/cutover-schema-umschreiben.py`, gegen Datenzeilen-Falle geprüft |
| pg_cron-SQL fürs Ziel | ✅ `plattform-cron-leads.sql` |
| Rechtestand der Quelle | ✅ gesichert in `cutover-belege/rechte-vor-dem-cutover.json` |
| n8n-Netzweg | ✅ Rolle `leads_n8n`, `pg_hba` + Firewall offen, vom n8n-Server bewiesen |
| n8n-Nurture-Sender | ⏸ bleibt beim Cutover **aus**, Umbau am Folgetag (Entscheidung 27.08.) |
| n8n-Werkzeug | ✅ `scripts/cutover-n8n.js` (`stand` / `aus` / `an`) — sichert den Ist-Zustand selbst |
| **Barriere** | ✅ **läuft automatisch** — `postgres`-Direktzugang beschafft, Trockenlauf bestanden |
| Coolify-Zugangsdaten | ✅ `LEADS_DB_*` gesetzt, **nur `LEADS_DB_MODUS` fehlt** |
| Wächter-Zugangsdaten | ✅ `LEADS_PG_*` in der `.env`, **nur `WAECHTER_QUELLE` fehlt** |

---

## n8n — Netzweg steht, Umbau folgt morgen

**Der Netzweg ist geöffnet** (27.08., 22:20). Die ursprüngliche Sorge war überzogen:
n8n durfte auf derselben Maschine **längst MySQL** (Port 3306 für `10.0.1.4` offen),
nur der Postgres-Port war zu. Und sicherheitlich ist der neue Weg ein **Gewinn**:
Heute trägt n8n den Supabase-`service_role`-Schlüssel — Vollzugriff auf alles unter
Umgehung sämtlicher Zeilenregeln. Die neue Rolle darf deutlich weniger.

| | |
| --- | --- |
| Rolle | `leads_n8n` — nur DML in `leads`/`leads_analytics`, kein DDL, kein BYPASSRLS, CONNECTION LIMIT 4, `statement_timeout` 30 s |
| `pg_hba` | `host hl_support leads_n8n 10.0.1.4/32 scram-sha-256` — eng: nur diese Datenbank, diese Rolle, diese Adresse |
| Firewall | `ufw allow from 10.0.1.4 to any port 5432` |
| SQL | `plattform-rolle-n8n.sql` (idempotent, Rückweg im Kopf) |

**Bewiesen vom n8n-Server aus:** Verbindung steht, `search_path` stimmt. Gegenproben:
Zugriff auf eine **andere Datenbank wird verweigert** (`no pg_hba.conf entry`), **DDL
wird verweigert** (`permission denied for schema leads`).

### Was heute Nacht gilt

Der **Nurture-Sender bleibt beim Cutover aus** — seine sechs Supabase-Nodes müssen von
HTTP auf Postgres umgebaut werden, und das ist Arbeit für einen wachen Kopf, nicht für
halb vier. **Reparatur am Folgetag** (Entscheidung Markus, 27.08.).

Der Umbau wird dabei eher *einfacher*: Die Blätterungslogik (`$pageCount * 1000`,
max. 20 Seiten) entfällt, weil ein direkter Treiber keine 1000-Zeilen-Grenze kennt —
genau die Fehlerklasse, die den Vorfall vom 26.08. verursacht hat, verschwindet
strukturell.

🔴 In der Zwischenzeit schlägt Wächter W2 korrekt an (fällige Empfänger + stehender
Versand). Das ist gewollt und muss dem Bereitschaftshabenden bekannt sein.

### Drei Verbraucher außerhalb der sieben

`Supabase Keep-Alive` (aktiv), **`AC - Error Alert (Postmark)`** (aktiv, RPC
`record_nurture_failure` — der Alarmkanal!), `AC - Quiz Video Inactivity Checker`
(inaktiv). Sie zeigen nach dem Cutover weiter auf die alte Instanz. 🔴 Besonders der
Error-Alert: Fällt er aus, verliert man Fehlermeldungen genau dann, wenn man sie
braucht. Gehört mit dem Nurture-Sender zusammen umgestellt.

---

## Ablauf in der Nacht

### 0 · Vorbedingungen (ca. 02:45)

```bash
node --env-file=.env.prod scripts/cutover.js pruefen
```
**Weiter nur bei 6/6.** Prüft Zielschema, Leere, Rechte, pg_cron, Quell-Cron-Job, `pg_dump`.

Zusätzlich von Hand: GlitchTip ohne offene Vorfälle, letzter Wächterlauf ohne ALARM.

### 1 · Barriere setzen (ca. 03:00)

```bash
node --env-file=.env.prod scripts/cutover.js barriere-an
```

Das Skript schaltet den Cron-Job ab und entzieht die Schreibrechte auf allen 18
Tabellen — beides selbst, kein Handgriff nötig. `SELECT` bleibt erhalten, der Dump muss
lesen können. Anschließend zeigt es die Rechte auf `lead_state` als Nachweis und meldet
einen Fehler, wenn `service_role` noch schreiben dürfte.

> ✅ **Läuft seit 27.08. automatisch.** Das Skript setzt die Barriere selbst — über
> einen Direktzugang als `postgres` (Eigentümerin der Tabellen).
>
> Vorgeschichte: Die Management-API ist **read-only** und kann weder `REVOKE`/`GRANT`
> noch `cron.schedule`. Das ursprüngliche `postgres`-Passwort war nie beschafft; es
> wurde an fünf Orten gesucht (Secrets samt sieben Sicherungen, alle `.env` im
> Workspace, Coolify-Box, n8n-Box) und nirgends gefunden. Zweimal gemessen: **null**
> aktive Verbindungen als `postgres`. Daraufhin über
> `PATCH /v1/projects/<ref>/database/password` **neu gesetzt** und in
> `agent-secrets.json` (`supabase.postgres*`) hinterlegt.
>
> 🔴 Zugang **nur über den Session-Pooler** (Port 5432) — `db.<ref>.supabase.co` ist
> IPv6-only und von den Containern nicht erreichbar.
>
> **Trockenlauf bestanden** (an einer selbst angelegten Testtabelle, nie an echten
> Daten): `arwdDxtm` → nach `REVOKE` → `rxtm` → nach `GRANT` zurück. Dabei ein Fehler
> im Rückweg gefunden: Das `GRANT` gab **TRUNCATE nicht zurück** (`arwdxtm` statt
> `arwdDxtm`) — das große `D` hätte dauerhaft gefehlt, ohne dass es jemand bemerkt.
> Korrigiert.

**Vorher** (Reihenfolge zählt — erst die Schreiber stoppen, dann die Rechte entziehen):

```bash
node scripts/cutover-n8n.js aus
```
Schaltet Outbox-Worker, Nurture-Sender, Post-Processor, Health-Monitor, Keep-Alive und
Error-Alert ab — und **sichert den Ist-Zustand vorher selbst** nach
`cutover-belege/n8n-stand-vor-cutover.json`. Meldet Exitcode 1, wenn einer noch läuft.

**Rückweg jederzeit:** `node … scripts/cutover.js barriere-aus` — gibt den
Rückweg-Block aus (GRANT **und** Cron-Job mit exakt dem ursprünglichen Namen
`stats-logs-analytics-v2-current-day`). 🔴 Der Ausgangszustand hatte **vier verschiedene
Rechte-Muster** (`cutover-belege/rechte-vor-dem-cutover.json`); das pauschale GRANT
stellt den Schreibzugriff her, ebnet aber Feinheiten ein — bei Bedarf abgleichen.

**Falls der Direktzugang klemmt:** Die Barriere wird weich — n8n aus, Stillstand
trotzdem zweimal messen, und nach dem Umschalten die alte Datenbank auf Zeilen prüfen,
die im Fenster entstanden sind. Schwächer als der Entzug, aber nicht wertlos: Gemessen
am 27.08. kamen **alle** Quiz-Schreibzugriffe von Coolify und n8n. Abweichung dann
**im Protokoll festhalten**.

### 2 · Stillstand beweisen (ca. 03:05, dauert 3 min)

```bash
node --env-file=.env.prod scripts/cutover.js stillstand
```
Misst **zweimal** im Abstand von drei Minuten. Nur wenn beide Messungen identisch sind,
ist die Quelle wirklich still. 🔴 Eine einzelne Messung beweist nichts.

### 3 · Übertragen (ca. 03:10, ~25 s)

```bash
node --env-file=.env.prod scripts/cutover.js uebertragen
```
`pg_dump --data-only` der 18 Tabellen → Schema-Umschreibung (`public`→`leads`,
zustandsbehaftet, fasst COPY-Daten nie an) → Restore mit ausgesetzter FK-Prüfung.
Räumt `.pgpass` und Zwischendateien selbst wieder ab.

### 4 · Nachweisen (ca. 03:12)

```bash
node --env-file=.env.prod scripts/cutover.js nachweisen
```
Zeilenzahlen je Tabelle · 5 Inhaltsprüfsummen (UTC + `COLLATE "C"` beidseitig) ·
0 echte Waisen in allen FK-Beziehungen (NULL zählt nicht) · Sequenzstände über dem
höchsten Wert.

🔴 **Bei einem einzigen Befund: nicht umschalten, sondern `barriere-aus`.**

### 5 · Anwendung umschalten (ca. 03:15)

✅ **Vorbereitet am 27.08.:** `LEADS_DB_HOST/PORT/NAME/BENUTZER/PASSWORT/SCHEMA` stehen
**bereits** in Coolify. Es fehlt **nur noch eine einzige Variable**:

```
LEADS_DB_MODUS=direkt
```

(Ohne sie gilt der Standard `postgrest` — deshalb ändert die Vorbereitung nichts am
laufenden Betrieb.)

> 🔴 **`SUPABASE_URL` und `SUPABASE_SERVICE_KEY` BLEIBEN GESETZT.** Sie zu entfernen
> liegt nahe („die alte Datenbank ist doch weg"), wäre aber ein stiller Teilausfall:
> `api/bridge.js` hatte an **vier** Stellen Guards, die ohne diese Variablen `null`
> zurückgeben, während die übrigen Routen über den Treiber weiterlaufen — betroffen war
> auch `supabaseRpc`, also der Pfad von `submit_lead_complete`.
>
> Im Audit vom 27.08. gefunden und behoben (die Guards kennen jetzt den direkten Modus,
> `scripts/tests/bridge-transport-guard.test.js` hält es zu). Trotzdem: **Variablen
> stehen lassen.** Sie kosten nichts und decken den Rückweg ab.

Dann Redeploy. **Nachweis:** `/health/live` trägt den Commit, `/health/ready` antwortet
200, und ein echter Funnel-Durchlauf erzeugt eine Zeile in `leads.lead_state`.

🔴 **Kein neuer Build nötig:** Nachgemessen am 27.08. — `postgres.js` und die
Stufe-B-Dateien liegen bereits im laufenden Image, und der Produktions-Container kann
sich als `leads_app` an `hl_support` anmelden. Der Redeploy setzt nur die Variablen.

**Rückweg:** `LEADS_DB_MODUS=postgrest` und Redeploy — die alte Datenbank ist
unverändert und vollständig, weil im Fenster niemand geschrieben hat.

### 6 · Wächter umstellen (ca. 03:25)

In `/opt/waechter-nurture/.env` ergänzen: `WAECHTER_QUELLE=plattform` plus die
`LEADS_PG_*`-Werte. Dateien und Treiber liegen bereits dort.

```bash
ssh root@167.233.251.217 "sh /opt/waechter-nurture/lauf.sh"
```
🔴 **Der Protokollkopf MUSS `Quelle: plattform` zeigen.** Sonst bewacht er weiter die
alte Datenbank und meldet zufrieden „alles ruhig".

**Vorbereitet am 27.08.:** Die `LEADS_PG_*`-Werte stehen bereits in der `.env`
(Sicherung: `.env.bak-vor-cutover-20260827`). Es fehlt **nur noch die eine Zeile**
`WAECHTER_QUELLE=plattform`.

🔴 **Erwartetes Verhalten direkt nach dem Umschalten — und ein nützliches Signal:**
Ein Probelauf gegen die noch leere Ziel-DB meldete `Letzte Sendung vor: nie`, `Fällige: 0`
und **„Baseline veraltet"** (die bekannten Ausnahme-Hashes fehlen dort). Nach dem
Datenumzug müssen diese Warnungen **verschwinden**. Tun sie es nicht, sind die Daten
unvollständig — der Wächter zeigt das also an, ohne dass man extra danach sucht.

### 7 · Nachlauf (ca. 03:30)

```bash
# pg_cron auf dem Ziel
scp plattform-cron-leads.sql root@91.99.76.104:/tmp/ && ssh … psql -d hl_support -f /tmp/…
```
```bash
node scripts/cutover-n8n.js an
```
Stellt **den gesicherten Zustand** wieder her, nicht pauschal alles auf aktiv — sonst
liefe ein Workflow los, der vorher bewusst aus war. Der **Nurture-Sender bleibt
bewusst aus** (Umbau am Folgetag); das Skript sagt das ausdrücklich.

**Vercel stilllegen** (Deployment pausieren) — verhindert, dass ein alter Link in die
tote Datenbank schreibt. Umkehrbar.

### 8 · Beobachten (bis ca. 04:00)

- `/health/ready` und ein echter Funnel-Durchlauf
- Outbox: laufen Jobs durch? (`leads.lead_sync_outbox`, Status `done`)
- Nach 15 min: pg_cron hat gelaufen (`leads_analytics.refresh_runs`)
- Wächterlauf zur Minute 37 grün, Quelle `plattform`
- `node --env-file=.env.prod scripts/fremdschreiber-messen.js` — schreibt noch jemand
  in die **alte** Datenbank?

---

## Rückweg im Ganzen

Bis Schritt 4 kostet ein Abbruch **nur das Fenster**: Die Quelle ist unverändert und
vollständig, weil im Fenster niemand geschrieben hat. Genau dafür ist die Barriere da.

Nach Schritt 5 ist der Rückweg `LEADS_DB_MODUS=postgrest` + Redeploy + `barriere-aus`
+ n8n reaktivieren. Was in der Zwischenzeit in die neue Datenbank geschrieben wurde,
müsste dann nachgezogen werden — deshalb: **Schritt 5 erst, wenn Schritt 4 grün ist.**

---

## Für eine Sitzung ohne Vorwissen — alles an einem Ort

**Zugänge** (alle in `agent-secrets.json` unter `C:/Users/Markus/.agent-secrets/`):

| Zweck | Eintrag |
| --- | --- |
| Quelle lesen (Management-API, **read-only**) | `.env.prod` → `SUPABASE_ACCESS_TOKEN` |
| Quelle **ändern** (Barriere) | `supabase.postgres*` — Session-Pooler, Port 5432 |
| Quelle dumpen (BYPASSRLS) | `marathon_supabase_app` |
| Ziel-DB, App-Rolle | `leads_pg.appUser` / `appPassword` |
| Ziel-DB, n8n-Rolle | `leads_pg.n8nUser` / `n8nPassword` |
| Coolify deployen | `coolify.deployToken` (nur Deploy) · `coolify.apiToken` (Wartung) |
| n8n | `n8n.apiKey` |
| SSH DB-Server | `root@91.99.76.104`, Key `id_rsa` |
| SSH App-/Wächter-Box | `root@167.233.251.217`, dieselbe Key-Datei |

**Die drei Fallen, die diesen Cutover kosten könnten:**

1. **Zeitzone.** Datenbank-Zeitstempel sind UTC, MESZ ist zwei Stunden später. Am 27.08.
   wurde das einmal verwechselt und der Cutover fast zur Hauptverkehrszeit gestartet.
   Vor dem Start die Lokalzeit gegenprüfen.
2. **`SUPABASE_*` in Coolify stehen lassen.** Sie zu entfernen liegt nahe, wäre aber ein
   stiller Teilausfall. Die Bridge-Guards sind seit dem Audit modusbewusst, aber die
   Variablen kosten nichts — also stehen lassen.
3. **Der Wächter muss `Quelle: plattform` melden.** Steht dort weiter `supabase`,
   bewacht er die alte Datenbank und meldet zufrieden „alles ruhig".

**Wenn etwas schiefgeht:** `scripts/cutover.js barriere-aus` · `scripts/cutover-n8n.js an` ·
`LEADS_DB_MODUS` in Coolify entfernen · Redeploy. Bis Schritt 4 kostet ein Abbruch **nur
das Fenster** — die Quelle ist unverändert, weil niemand hineinschreiben konnte.

**Was am Folgetag ansteht:** Nurture-Sender umbauen (6 Nodes auf `leads_n8n`),
`AC - Error Alert` mitnehmen, Test-DB löschen (`dropdb business_leads_testimport` —
enthält 1.236 echte E-Mail-Adressen), `pgss-monatsreset` reparieren. Vollständig in
[STAND-UND-FORTSETZUNG.md](../../STAND-UND-FORTSETZUNG.md) §8b.
