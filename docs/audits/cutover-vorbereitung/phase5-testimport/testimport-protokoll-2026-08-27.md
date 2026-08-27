# Phase-5-Testimport: Protokoll

Stand: 27.08.2026 nachmittags · **Gate bestanden** · Ziel: `business_leads_testimport`
auf dem Flotten-PostgreSQL 18.6 (`10.0.1.3`, ICU en-US/UTF8 wie `fitapp`)

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

## Was der Testimport bewusst NICHT abdeckt (Rest bis zum echten Umzug)

| Offen | Gehört zu |
| --- | --- |
| Datenimport + Sequenz-/Identity-Stände auf `max(id)+Puffer` | Phase 6 (Cutover) |
| Rollenmodell (App-Rolle statt service_role/RLS) + Grants | Phase 5/6, eigenes SQL |
| pg_cron-Job `refresh_event_daily` (alle 15 min) auf dem Ziel | Phase 6, versioniertes SQL |
| Schreibbarriere 13.5.2 (activecenter-analytics, hl-support-analytics-Leser, n8n) | Phase 6 |
| App-Verbindung (Stufe B: direkter Treiber; nur von `10.0.1.5` erreichbar per UFW/pg_hba) | nach Vercel-Abbau |

Artefakte: `schema-2026-08-27.sql` (der Import), `paritaet-live-2026-08-27.json`
(Quell-Schnappschuss), beide Skripte unter `scripts/`. Vor dem ECHTEN Umzug: Manifest
und Export frisch erzeugen — dieses Protokoll ist der Beweis des Verfahrens, nicht der
letzte Stand der Daten.
