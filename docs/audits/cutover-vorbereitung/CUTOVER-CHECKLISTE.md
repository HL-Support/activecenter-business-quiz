# Cutover-Checkliste — Supabase → Plattform-Datenbank

**Stand: 27.08.2026, 20:45 MESZ.** Dieses Dokument wird in der Cutover-Nacht von oben
nach unten abgearbeitet. Jeder Schritt nennt seinen Nachweis und seinen Rückweg.

> 🔴 Regel für die ganze Nacht: **Kein Schritt ohne Nachweis.** Wenn eine Prüfung nicht
> grün ist, wird nicht weitergegangen — es wird zurückgerollt. Der Rückweg kostet das
> Fenster, nicht die Daten.

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

Das Skript schaltet den Quell-Cron-Job ab (das geht) und **gibt das REVOKE-SQL zum
Kopieren aus** (das geht nicht automatisch, siehe Kasten). `SELECT` bleibt erhalten —
der Dump muss lesen können.

> 🔴 **Warum die Barriere komplett von Hand läuft.** Gemessen am 27.08.: Die
> Supabase-Management-API arbeitet in einer **read-only-Transaktion** und kann
> **gar nichts** ändern — weder `REVOKE`/`GRANT` noch `cron.schedule`/`unschedule`
> (die schreiben intern in `cron.job`).
>
> Ein erster Test schien `cron.unschedule` zu erlauben — das war eine **Fehldeutung**:
> Der Testjob existierte nicht, der fachliche Fehler kam vor der read-only-Prüfung.
> Die zweite Messung mit einem echten Job war eindeutig blockiert. (Genau deshalb wird
> geprobt statt angenommen.)
>
> Die einzige Rolle mit direktem Zugang (`marathon_app`) ist nicht Eigentümerin der
> Tabellen und darf ebenfalls kein `REVOKE`; ein `postgres`-Passwort wurde nie
> beschafft.
>
> **Also: Der ausgegebene SQL-Block wird im Supabase-SQL-Editor eingefügt** (dort läuft
> die Sitzung als `postgres`). Er enthält **beides** — Cron-Abschaltung und
> Rechte-Entzug — und dauert zwei Minuten. Der Block liegt zusätzlich als
> `cutover-belege/barriere-an.sql`.
>
> Das ist bewusst ein sichtbarer Handgriff statt eines Skripts, das den wichtigsten
> Schritt still überspringt.

**Direkt danach von Hand:** n8n-Workflows deaktivieren (mindestens
`AC - Lead Sync Outbox Worker`, `AC - Quiz Nurture Email Sender`,
`AC - Lead Post Processor`, `AC - Lead System Health Monitor`).

**Rückweg jederzeit:** `node … scripts/cutover.js barriere-aus` — gibt den
Rückweg-Block aus (GRANT **und** Cron-Job mit exakt dem ursprünglichen Namen
`stats-logs-analytics-v2-current-day`). 🔴 Der Ausgangszustand hatte **vier verschiedene
Rechte-Muster** (`cutover-belege/rechte-vor-dem-cutover.json`); das pauschale GRANT
stellt den Schreibzugriff her, ebnet aber Feinheiten ein — bei Bedarf abgleichen.

**Falls der Handgriff nicht möglich ist** (kein Dashboard-Zugang zur Hand): Die Barriere
wird weich — App und n8n sind aus, der Stillstand wird trotzdem zweimal gemessen. Das
ist schwächer als der erzwungene Entzug, aber nicht wertlos: Gemessen am 27.08. kamen
**alle** Quiz-Schreibzugriffe von Coolify und n8n; ein dritter Schreiber ist nicht
bekannt. Diese Abweichung dann **im Protokoll festhalten**.

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

In Coolify die Umgebungsvariablen setzen (Werte aus Secrets `leads_pg`):

```
LEADS_DB_MODUS=direkt
LEADS_DB_SCHEMA=leads
LEADS_DB_HOST=10.0.1.3
LEADS_DB_PORT=5432
LEADS_DB_NAME=hl_support
LEADS_DB_BENUTZER=leads_app
LEADS_DB_PASSWORT=…
```

Dann Redeploy. **Nachweis:** `/health/live` trägt den Commit, `/health/ready` antwortet
200, und ein echter Funnel-Durchlauf erzeugt eine Zeile in `leads.lead_state`.

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

### 7 · Nachlauf (ca. 03:30)

```bash
# pg_cron auf dem Ziel
scp plattform-cron-leads.sql root@91.99.76.104:/tmp/ && ssh … psql -d hl_support -f /tmp/…
```
n8n-Workflows wieder aktivieren, die **keinen** direkten Supabase-Zugriff haben
(Outbox-Worker, Post-Processor, Health-Monitor). Der Nurture-Sender bleibt nach
Entscheidung B aus.

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
