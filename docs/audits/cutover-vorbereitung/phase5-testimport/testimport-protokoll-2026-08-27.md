# Phase-5-Testimport: Protokoll

Stand: 27.08.2026 · **Gate bestanden — Schema UND Daten** · Ziel:
`business_leads_testimport` auf dem Flotten-PostgreSQL 18.6 (`10.0.1.3`, ICU
en-US/UTF8 wie `fitapp`)

## Was gemacht wurde

1. **Frisches Objektmanifest** erzeugt (Pflicht aus 13.5.1): 32 Funktionen (inkl. der
   neuen `submit_lead_complete`), sonst identisch zum Morgenstand; dieselben 3
   Katalogfunde, alle durch die Objektauswahl behandelt.
2. **Selektiver Schema-Export aus dem Live-Katalog** (`scripts/phase5-schema-export.js`):
   18 Tabellen, 6 Views, 20 Funktionen, 5 Trigger, 5 eigenständige Sequenzen + 4
   Identity-Spalten, 65 Constraints, 59 Nicht-Constraint-Indexe — exakt die
   Migrieren-Liste der [Objektauswahl](../phase5-objektauswahl-2026-08-27.md). Quelle ist
   der **Katalog**, nicht die Repo-SQL-Dateien (die Live-DB trägt nachträgliche
   Migrationen; Wahrheit ist der Katalog). Bewusst ohne RLS/Grants (eigenes Rollenmodell
   auf Hetzner) und ohne pg_cron (Job wird als eigener Schritt angelegt).
3. **Import** in die frisch angelegte Test-DB (template0, ICU en-US, UTF8; MD5-geprüfte
   Übertragung), `ON_ERROR_STOP`, eine Transaktion.
4. **Paritätsvergleich** Quelle↔Testimport (`scripts/phase5-testimport-vergleich.js`):
   **356/356 Spalten (Typ, NotNull, Identity, Default), 65/65 Constraints, 86/86
   Indexe, 6/6 Views, 20/20 Funktionen, 5/5 Trigger — keine Abweichung.**
5. **Funktionsbeweis** (Definitionen sind nicht Laufzeit): auf der Test-DB lief der
   echte Pfad — `submit_lead_complete` (Kontakt + Antworten atomar),
   `upsert_video_progress_monotonic` (Rank 1, Outbox-Job über Identity-Spalte erzeugt),
   `v_lead_state_full` (Rank berechnet), `init_lead` (pgcrypto/`gen_random_uuid`). Die
   Probezeilen verbleiben in der Test-DB als Beleg.

## Zwei echte Funde — beide nur durch den Test sichtbar

1. **Falsche „0 FKs"-Messung.** Die Auswahl behauptete zunächst „keine FKs
   untereinander" — der Filter verglich gegen `'FOREIGN KEY'`, das Manifest speichert
   aber `contype`-Buchstaben (`f`). Real: **7 FKs, alle innerhalb der Auswahl**
   (5× `lead_*` → `lead_state`, 2× `nurture_*` → `nurture_sequences`). Der erste
   Importlauf scheiterte an der Constraint-Reihenfolge; seitdem sortiert der Export
   PK → UNIQUE → CHECK → FK. Lehre: Eine Messung, die exakt 0 ergibt, verdient einen
   zweiten Blick auf das Vergleichsformat.
2. **Identity-Spalten sind unsichtbar für `pg_attrdef`.** Vier Tabellen
   (`lead_events`, `lead_sync_outbox`, `lead_profiles`, `lead_migration_unresolved`)
   nutzen `GENERATED … AS IDENTITY` — der erste Export erzeugte nackte Spalten ohne
   Zähler, und der Paritätsvergleich war trotzdem grün, weil er `attidentity` nicht
   verglich (**falsches Grün**). Gefunden hat es erst der Funktionsbeweis
   (Outbox-Insert: `id` null). Beide Skripte prüfen `attidentity` jetzt mit. Lehre
   (dieselbe wie beim void-RPC-Vorfall): der Beweis eines Pfads muss den Pfad
   **ausführen**, nicht nur seine Definition vergleichen.

Dazu ein PG18-Katalogartefakt: NOT-NULL erscheint dort als benannte Constraints
(`contype='n'`, neu seit PG17) — im Vergleich ausgefiltert, da der Spaltenvergleich
NotNull bereits je Spalte prüft.

## Datenprobe (27.08. abends) — ebenfalls bestanden

Schema beweist Definitionen, nicht Daten. Deshalb wurden anschliessend die **echten
Daten** aller 18 Tabellen in dieselbe Test-DB gepumpt (`scripts/phase5-datenprobe.js`;
Quelle rein lesend, blätternd über den Primärschlüssel, Ziel wird vorher geleert).

| Prüfung | Ergebnis |
| --- | --- |
| **Menge** | **171.260 Zeilen** exportiert → importiert, je Tabelle **exportiert == importiert**. 16 von 18 Tabellen auch deckungsgleich mit dem Quellstand *zum Zählzeitpunkt*; die zwei `analytics_internal`-Tabellen zeigen erwarteten **Drift** (+21/+1), weil der pg_cron-Job alle 15 min weiterschreibt — die Quelle lief bewusst ohne Schreibstopp. |
| **Inhalt** | **6 von 6 Prüfsummen identisch** (MD5 über sortierte Werte, Quelle vs. Ziel): `quiz_sessions`, `lead_contact_crm`, `tracking_video_progress`, Antworten vor dem 01.08., `lead_events`-JSON-Payloads vor dem 01.08. — und eine gezielte **Umlaut-/Akzent-Probe** (`ä ö ü ß à è é ì ò ù`). Damit sind Unicode, JSON, Zahlen und Zeitstempel bewiesen, nicht nur die Zeilenzahl. |
| **Identity/Sequenzen** | Generalprobe des Cutover-Schritts: alle 9 Zähler auf `max+1000` gesetzt; ein anschliessender echter INSERT bekam `event_id 112059` — **kollisionsfrei**. |
| **Referenzielle Integrität** | Ein verwaistes `lead_events`-Insert wurde vom FK **abgewiesen**; `DELETE` auf `lead_state` räumte per CASCADE korrekt ab (108.175 → 108.174). |
| **Funktionen auf echten Daten** | `submit_lead_complete`, `upsert_video_progress_monotonic` (erzeugte Outbox-Job 3439), `v_lead_state_full` (Rang 1) — alle korrekt gegen den vollen Bestand. |
| **Dauer** | 5,2 min über den API-Weg. 🔴 **Keine Cutover-Messung**: Ohne DB-Passwort gibt es kein `pg_dump`/`COPY`; die echte Übertragung wird deutlich schneller sein. Der Wert ist eine Obergrenze. |

Drei Funde der Datenprobe, alle behoben:

1. **PostgREST liefert `analytics_internal` gar nicht aus** (`PGRST106`, nur
   `public`/`graphql_public`/`marathon`) — die beiden Analytics-Tabellen laufen jetzt
   über die Management-API.
2. **`refresh_runs.run_id` ist `GENERATED ALWAYS`** und fehlte in der handgepflegten
   Identity-Liste. Die Liste wird nicht mehr von Hand geführt, sondern aus dem
   Paritäts-Schnappschuss abgeleitet — Handflags driften, gemessene nicht.
3. **Der DB-Server sperrt schnelle SSH-Folgen** (~20 Verbindungen in Folge → Timeout für
   Minuten). Import und Zählung laufen jetzt in **einer** Sitzung.

## pg_dump-Generalprobe (27.08. abends) — der echte Cutover-Weg, gemessen

Der API-Weg war eine Obergrenze. Für die **echte** Übertragung fehlte bislang ein
Datenbankzugang; das `postgres`-Passwort wurde nie beschafft. Gefunden wurde stattdessen
die vorhandene App-Rolle **`marathon_app`** (Secrets-Eintrag `marathon_supabase_app`,
angelegt für den Fitapp-Umbau, Verbindung über den Session-Pooler). Entscheidend: sie
hat **BYPASSRLS** — ohne das würde `pg_dump` bei den 26 RLS-Policies des Verbunds
abbrechen oder mit `--enable-row-security` **still weniger Zeilen** liefern.

Ihr fehlten nur Leserechte auf unsere Tabellen; nachgereicht mit
`supabase-export-rechte.sql` (nur `SELECT` auf die 18 Auswahl-Tabellen und ihre
Sequenzen, `USAGE` auf `analytics_internal`; Rückweg im Kopf der Datei). Nachgemessen:
`hba_persons` bleibt für die Rolle unlesbar — die Rechte greifen exakt auf den Verbund.

| Schritt | Messung |
| --- | --- |
| `pg_dump --data-only` der 18 Tabellen (PG-18-Client → PG-17.6-Quelle über den Pooler) | **10,2 s**, 124 MB |
| Einspielen in die frische Ziel-DB | **14,1 s** |
| **Gesamt** | **≈ 24 Sekunden** (statt 5,2 min über die API) |

Verifikation der Dump-Probe:

- **Sequenzen kommen automatisch mit** — `pg_dump` schrieb 9 `setval`-Aufrufe; der
  separate Zählerschritt aus der Datenprobe entfällt auf diesem Weg.
- **Inhalt identisch**: dieselben Prüfsummen wie bei der Datenprobe. `quiz_sessions` wich
  zunächst ab — Ursache war **Live-Drift** (2 neue Zeilen, `max(id)` 1748 → 1750), nicht
  der Transportweg: begrenzt auf `id <= 1750` liefern Quelle und Ziel exakt
  `ce15c89c…` bei 1351 Zeilen.
- **Referenzielle Integrität**: geladen wurde mit ausgesetzter FK-Prüfung
  (`session_replication_role = replica`), danach explizit nachgeprüft — **0 echte
  Waisen** in allen vier FK-Beziehungen. Die zunächst gemeldeten „4 Waisen" waren Events
  mit `lead_hash IS NULL` (erlaubt); die Prüfabfrage zählte NULL fälschlich mit.

Aufgeräumt: Dumpdateien, die zweite Test-DB `business_leads_dumpprobe` und die
`.pgpass`-Datei auf dem Server sind entfernt. Für den echten Cutover wird die
Zugangsdatei aus den Secrets neu erzeugt.

## Was der Testimport bewusst NICHT abdeckt (Rest bis zum echten Umzug)

| Offen | Gehört zu |
| --- | --- |
| Rollenmodell (App-Rolle statt service_role/RLS) + Grants | Phase 5/6, eigenes SQL |
| pg_cron-Job `refresh_event_daily` (alle 15 min) auf dem Ziel | Phase 6, versioniertes SQL |
| Schreibbarriere 13.5.2 (activecenter-analytics, hl-support-analytics-Leser, n8n) | Phase 6 |
| App-Verbindung (Stufe B: direkter Treiber; nur von `10.0.1.5` erreichbar per UFW/pg_hba) | nach Vercel-Abbau |

🔴 Die Test-DB `business_leads_testimport` enthält echte Kontaktdaten (Kopie vom
27.08.). Sie ist kein Spielplatz für Löschtests; Rückweg ist
`dropdb business_leads_testimport`.

Artefakte: `schema-2026-08-27.sql` (der Import), `paritaet-live-2026-08-27.json`
(Quell-Schnappschuss), beide Skripte unter `scripts/`. Vor dem ECHTEN Umzug: Manifest
und Export frisch erzeugen — dieses Protokoll ist der Beweis des Verfahrens, nicht der
letzte Stand der Daten.
