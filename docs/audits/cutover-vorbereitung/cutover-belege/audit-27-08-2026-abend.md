# Audit-Messungen vom 27.08.2026, ca. 23:00 MESZ

Alle Werte **neu gemessen**, nichts aus der Dokumentation übernommen.
Zweck: Vor dem Cutover jeden behaupteten Zustand gegen die Realität prüfen.

## Anwendung

| Prüfung | Messwert |
| --- | --- |
| Produktions-Commit (`/health/live`) | `5e640fe` = `main` ✅ |
| `quiz.activecenter.info` | HTTP 200 |
| `business.activecenter.info` | HTTP 200 |
| `business.eaglesfit.ch` | HTTP 200 |
| Repo gegen `origin/main` | 0 voraus, 0 zurück ✅ |

## Stufe B im laufenden Container

| Prüfung | Messwert |
| --- | --- |
| `postgres.js` im Image | `/app/node_modules/postgres` vorhanden, ladbar ✅ |
| `server/db-transport.js`, `server/postgrest-nach-sql.js` | im Image vorhanden ✅ |
| `LEADS_DB_MODUS` im Container | **nicht gesetzt** → PostgREST ✅ (Standard unverändert) |
| `LEADS_DB_*` in der Coolify-Umgebung | **keine** ✅ |
| TCP `10.0.1.3:5432` aus dem Container | erreichbar ✅ |
| **Anmeldung aus dem Container** | **`leads_app` auf `hl_support`, Leseprobe erfolgreich** ✅ |

🔴 Damit ist bewiesen: Der Cutover braucht **keinen neuen Build** — nur die
Umgebungsvariablen und einen Redeploy.

## Ziel-Datenbank `hl_support`

| Prüfung | Messwert |
| --- | --- |
| Tabellen | `leads` 16 + `leads_analytics` 2 = **18** ✅ |
| Views / Sequenzen / Indexe | 6 / 9 / 86 ✅ |
| Zeilen | **0** ✅ (Daten kommen erst beim Cutover) |
| Rollen | `leads_owner` (nologin), `leads_read` (nologin), `leads_migrate` (login, 2), `leads_app` (login, 8), `leads_n8n` (login, 4) — **keine mit BYPASSRLS** ✅ |
| `pg_hba` | `10.0.1.5/32` (all/all, Altbestand) · `hl_support leads_n8n 10.0.1.4/32` (eng) |
| Firewall 5432 | `10.0.1.5` und `10.0.1.4` ✅ |

## Quelle (Supabase)

| Prüfung | Messwert |
| --- | --- |
| `lead_state` | 6.150 Zeilen |
| `lead_events` | 109.144 Zeilen, letztes 27.08. 20:17 MESZ |
| pg_cron | 2 Jobs: `stats-logs-analytics-v2-current-day` (*/15, aktiv), `pgss-monatsreset` (aktiv) |
| Management-API | **read-only** — kein `REVOKE`, kein `cron.schedule` (zweifach gemessen) |

## Fremdschreiber

| Prüfung | Messwert |
| --- | --- |
| `activecenter-analytics` Produktion | alter Aufruf `set_test_contact`: **0×**, neuer Hinweistext: **1×** ✅ |
| Letztes Ereignis mit Dashboard-Signatur | 08.06.2026 (unverändert) |

## Betrieb

| Prüfung | Messwert |
| --- | --- |
| Wächter-Cron | `37 * * * *` aktiv, letzter Lauf: Herzschlag gesendet ✅ |
| Wächter-Dateien auf der Box | neue Fassung + `node_modules/postgres` + Sicherungen ✅ |
| Wächter-`.env` | trägt noch **nur** `SUPABASE_*` — `LEADS_PG_*` fehlen (kommen beim Cutover) |
| Coolify-Deploy-Token | `POST /deploy` → 404 (Recht ok), `GET /applications` → **403** ✅ |
| GitHub-Secret `COOLIFY_API_TOKEN` | aktualisiert 27.08. 18:39 MESZ ✅ |
| Testsuite | 208/208 grün, Lint grün |

## 🔴 Befund aus dem Audit

**`pgss-monatsreset` auf dem Plattform-Server zeigt auf die Datenbank `fitapp`** —
die es seit der Umbenennung (PR #101) **nicht mehr gibt**. Vorhandene Datenbanken:
`hl_support`, `business_leads_testimport`, `postgres`. Letzter erfolgreicher Lauf:
19.08.2026. Der nächste Lauf wäre am **01.09. um 3:15 UTC** und würde ins Leere greifen.

Betrifft nicht das Quiz (Instanzhygiene, `pg_stat_statements_reset`), gehört aber
korrigiert: `cron.unschedule('pgss-monatsreset')` und neu anlegen mit
`database => 'hl_support'`.
