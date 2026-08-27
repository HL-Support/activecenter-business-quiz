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
| **n8n** | 🔴 **offene Entscheidung, siehe unten** |

---

## 🔴 Die eine offene Entscheidung: n8n

**Gemessen:** Der n8n-Server ist im internen Netz `10.0.1.4`. Die Plattform-Datenbank
lässt laut `pg_hba` nur `10.0.1.5` zu, und die Firewall blockt zusätzlich —
**n8n erreicht die neue Datenbank nicht.**

Von sieben Workflows brauchen **sechs gar nichts**: Sie sprechen entweder MySQL/Mautic
oder gehen über App-Endpunkte (`/api/bridge`, `/api/lead-outbox-worker`,
`/api/lead-system-health`) — dort wechselt die Datenbank app-seitig, die URL bleibt.

Betroffen ist **ein** Workflow: **AC - Quiz Nurture Email Sender** mit sechs direkten
Supabase-Aufrufen (`v_lead_state_full`, `lead_events`, `tracking_sessions` lesend;
`record_nurture_skip`, `record_nurture_sent`, `record_nurture_run` als RPC).

| Weg | Preis | Aufwand heute Nacht |
| --- | --- | --- |
| **A — Netzweg öffnen** (`pg_hba` + UFW für `10.0.1.4`) und die 6 Nodes auf Postgres-Nodes umstellen | zweite Maschine mit DB-Zugang; die 26-Node-Logik muss stimmen | hoch, riskant unter Zeitdruck |
| **B — Nurture-Sender nach dem Cutover aus lassen**, danach in Ruhe umbauen | **kein Nurture-Versand**, bis der Umbau steht (1–2 Tage) | keiner |
| **C — Cutover verschieben**, bis n8n umgebaut ist | Zeitplan | — |

**Empfehlung: B.** Der Versand ruht bewusst und überwacht statt still — genau der
Unterschied zum Vorfall vom 26.08., wo drei Wochen lang niemand etwas merkte. Wächter
W2 wird korrekt Alarm schlagen (fällige Empfänger + stehender Versand); das ist
gewollt und muss dem Bereitschaftshabenden bekannt sein.

**Drei weitere Supabase-Verbraucher außerhalb der sieben** (aus dem Instanz-Scan):
`Supabase Keep-Alive` (aktiv), **`AC - Error Alert (Postmark)`** (aktiv, RPC
`record_nurture_failure` — das ist der Alarmkanal!), `AC - Quiz Video Inactivity
Checker` (inaktiv). Sie zeigen nach dem Cutover weiter auf die alte Instanz.
🔴 Besonders der Error-Alert: Fällt er aus, verliert man Fehlermeldungen genau dann,
wenn man sie braucht. Vor dem Cutover entscheiden, ob er mit umzieht oder bewusst
auf der alten Instanz bleibt.

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
Schaltet den Quell-Cron-Job ab und entzieht Schreibrechte auf allen 18 Tabellen.
`SELECT` bleibt — der Dump muss lesen können.

**Direkt danach von Hand:** n8n-Workflows deaktivieren (mindestens
`AC - Lead Sync Outbox Worker`, `AC - Quiz Nurture Email Sender`,
`AC - Lead Post Processor`, `AC - Lead System Health Monitor`).

**Rückweg jederzeit:** `node … scripts/cutover.js barriere-aus`

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
