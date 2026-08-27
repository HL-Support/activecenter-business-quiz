# Rollen- und Schemamodell der Plattform-Datenbank

Stand: 27.08.2026 · Entwurf zur Umsetzung · Gilt über das Business-Leads-Quiz hinaus für
**alle** Projekte, die schrittweise auf den eigenen PostgreSQL ziehen: Fitmarathon,
Analysen, Events, Kontakte, Support, Business-Leads-Quiz.

Grundlage: gemessener Ist-Zustand des Ziel-Clusters (27.08.), das
[Verbraucher-Inventar](verbraucher-inventar/INVENTAR.md), die
[Phase-5-Objektauswahl](cutover-vorbereitung/phase5-objektauswahl-2026-08-27.md) und
öffentliche Best Practices (Quellen am Ende).

---

## 1. Ist-Zustand (gemessen, nicht angenommen)

| | |
| --- | --- |
| Server | `10.0.1.3` / `91.99.76.104`, **3 GB RAM, 2 Kerne** |
| PostgreSQL | 18.6, `data-checksums` an, SSL an, ICU en-US/UTF8 |
| Datenbanken | `fitapp` (11 MB — seit 27.08. `hl_support`), `postgres`, `business_leads_testimport` (Testartefakt) |
| Schemata darin | `marathon`, `public` (3 Relationen), `cron`, `watchdog_canary` |
| Rollen | `postgres` (super), `fitapp_app` (LOGIN, **BYPASSRLS**), `authenticator`→`anon`+`service_role` (Supabase-Muster), `watchdog_canary` |
| Verbindungen | `max_connections=40`, 3 für Superuser reserviert → **37 nutzbar**, aktuell 11 belegt |
| Netzzugang | `pg_hba`: nur `10.0.1.5/32` (Coolify-Host) per `scram-sha-256`; sonst lokal |

**Der Cluster ist praktisch Neuland** — die Plattform-Datenbank ist fast leer, Marathon
läuft weiterhin auf Supabase. Das ist der billigste Moment, das Modell richtig zu setzen;
jede Woche später kostet Verbindungsstrings, Migrationen und Abstimmung.

---

## 2. Grundsatzentscheidung: **eine Datenbank, ein Schema je Projekt**

Die naheliegende Alternative — eine eigene Datenbank je Projekt — wird **verworfen**, und
zwar aus einem harten technischen Grund: PostgreSQL kann **nicht über Datenbankgrenzen
hinweg abfragen**. Jeder projektübergreifende Zugriff bräuchte `postgres_fdw`/`dblink`,
und damit fallen Fremdschlüssel, ein sinnvoller Abfrageplan und einfache Joins weg.

Unsere Projekte sind aber **nicht unabhängig** — sie drehen sich alle um denselben
Menschen: Ein Lead aus dem Quiz wird ein Kontakt, der Kontakt nimmt an einem Event teil,
bekommt eine Analyse, stellt eine Support-Anfrage. Genau diese Verbindungen sind der
Grund für die Zusammenführung. Sie in getrennte Datenbanken zu sperren, würde das Ziel
sabotieren.

Isolation entsteht deshalb nicht über Datenbankgrenzen, sondern über **Rechte**: Jedes
Projekt bekommt ein eigenes Schema, und **kein Projekt darf standardmäßig in ein anderes
schauen**. Das ist von der Datenbank erzwungen, jederzeit prüfbar und widerrufbar.

Was wir dafür in Kauf nehmen und wie wir es abfedern:

| Nachteil | Gegenmaßnahme |
| --- | --- |
| Gemeinsame Ressourcen (ein lahmes Projekt bremst alle) | `statement_timeout`/`lock_timeout` **je Rolle**, Verbindungsobergrenzen je Rolle (§5) |
| Ein Ausfall trifft alle Projekte | tägliche Sicherung + pgBackRest (vorhanden); bei echtem Wachstum eines Projekts: eigener Cluster |
| Versehentlicher Querzugriff | Standard ist **kein** Zugriff; Querzugriffe nur einzeln, benannt und dokumentiert (§6) |

---

## 3. Die Namenshierarchie: System → Projekt → Bereich

**Korrektur vom 27.08. (Markus):** `fitapp` war **kein Alt-Erbe**, sondern ein echter
Produktname — nur auf der falschen Ebene. Die FitApp ist der **Überbegriff der
Fitness-App**, zu der der Marathon gehört und später die ganze App. Sie ist damit ein
**Projekt in** der Plattform, nicht die Plattform selbst.

Richtige Ebenen:

```text
Datenbank  hl_support        ← das Gesamtsystem
   ├── Schema fitapp         ← Projekt Fit-App (Marathon ist ein Bereich davon, später mehr)
   ├── Schema leads          ← Projekt Business-Leads-Quiz
   ├── Schema kontakte       ← Projekt Kontakte
   ├── Schema support        ← Projekt Support
   ├── Schema events         ← Projekt Events
   └── Schema analysen       ← Projekt Analysen
```

✅ **Umgesetzt am 27.08.:** `ALTER DATABASE fitapp RENAME TO hl_support`. Der Zeitpunkt war
der günstigste überhaupt — die Datenbank trug 11 MB, **keine einzige Anwendung** hing am
Namen (geprüft: Secrets, alle 23 Coolify-Anwendungen; die dortigen `FITAPP_*`-Variablen
sind App-Einstellungen, keine Verbindungsstrings), und nur der pg_cron-Zeitplaner war
verbunden.

Mitgezogen: `cron.database_name` in der Cluster-Konfiguration (Datei jetzt
`10-plattform.conf`, Vorversion gesichert unter `/root/10-fitapp.conf.bak-20260827`),
sowie die Einträge `marathon_pg.database` und `leads_pg.database` in den Secrets.
Danach nachgemessen: pg_cron-Job läuft, `leads_app` verbindet sich, WAL-Archivierung
arbeitet weiter. Die pgBackRest-**Stanza** heißt weiterhin `fitapp` — sie ist nur ein
Etikett für den Cluster und vom Datenbanknamen unabhängig; eine Umbenennung würde eine
neue Vollsicherung erzwingen und bringt nichts.

🔴 **Empfehlung an das FitApp-Projekt** (nicht von hier ausgeführt): Beim Marathon-Umzug
das Schema `marathon` in `fitapp` überführen — Marathon ist ein **Bereich** der FitApp,
kein gleichrangiges Projekt. Solange die Marathon-Daten auf Supabase liegen, kostet das
fast nichts.

---

## 4. Rollenmodell: vier Rollen je Projekt, klar getrennte Aufgaben

Namensmuster `<projekt>_owner | _migrate | _app | _read`. Für das Quiz also
`leads_owner`, `leads_migrate`, `leads_app`, `leads_read`.

| Rolle | Anmeldung | Aufgabe | Rechte |
| --- | --- | --- | --- |
| `<p>_owner` | **nein** | **Eigentümer** aller Objekte des Projekts | besitzt Schema und Objekte; niemand meldet sich damit an |
| `<p>_migrate` | ja | **Nur DDL** — Migrationen, Deploys | Mitglied von `<p>_owner`; jede Migration beginnt mit `SET ROLE <p>_owner;` |
| `<p>_app` | ja | **Nur DML** — die laufende Anwendung | `SELECT/INSERT/UPDATE/DELETE` im eigenen Schema, `USAGE`+`SELECT` auf Sequenzen, `EXECUTE` auf Funktionen. **Kein `CREATE`** |
| `<p>_read` | **nein** | Lesegruppe für Auswertungen | nur `SELECT`; wird an Auswertungs-/Analysezugänge vergeben |

**Warum ein eigener Eigentümer, der sich nicht anmelden kann:** Objekte gehören dann der
*Rolle*, nicht einer Person oder einem Schlüssel. Wird ein Zugang rotiert oder gelöscht,
bleiben Eigentum und Rechte unberührt — das klassische „`DROP ROLE` scheitert, weil ihm
noch 40 Tabellen gehören" kann nicht mehr passieren.

**Warum DDL und DML getrennt sind:** Der laufende Prozess kann keine Tabelle löschen,
keinen Index anlegen und kein Schema ändern — selbst wenn seine Zugangsdaten abhandenkommen
oder ein Fehler im Code eine unerwartete Anweisung baut. Migrationen laufen bewusst mit
einem anderen Zugang, der nur beim Deploy benutzt wird.

**`ALTER DEFAULT PRIVILEGES` ist Pflicht**, sonst ist jede neue Tabelle für die Anwendung
unsichtbar, bis jemand von Hand nachgreift — und genau dieses Nachgreifen wird vergessen.
Deshalb werden die Standardrechte **für den Eigentümer** gesetzt: Was `<p>_owner` künftig
anlegt, ist für `<p>_app` und `<p>_read` sofort nutzbar.

Plattformweit zusätzlich:

| Rolle | Zweck |
| --- | --- |
| `plattform_backup` | Sicherungen ohne Superuser: Mitglied von `pg_read_all_data` |
| `watchdog_canary` | existiert, bleibt (Überwachung) |
| `postgres` | ausschließlich Administration, **nie** für Anwendungen |

---

## 5. Was wir vom Supabase-Erbe **nicht** übernehmen

| Supabase-Muster | Entscheidung | Begründung |
| --- | --- | --- |
| `anon` / `authenticated` | **fällt weg** | Sie existieren, weil dort der **Browser** über PostgREST direkt mit der Datenbank spricht. Im Zielbild (Phase 4 Stufe B) redet nur noch unser Server mit der Datenbank — der Browser hat keinen Datenbankzugang mehr. |
| `service_role` (eine Rolle, die alles darf) | **fällt weg** | Ist das Gegenteil von geringstmöglichen Rechten. Ersetzt durch `<p>_app` je Projekt. |
| **RLS als Sicherheitsgrenze** (26 Policies) | **wird nicht kopiert** | RLS war nötig, weil der Client selbst Abfragen stellte. Fällt der direkte Clientzugang weg, verschiebt sich die Grenze in die Anwendung. Policies blind mitzunehmen erzeugt Scheinsicherheit und schwer auffindbare Fehler. 🔴 **Bedingung:** Sollte je ein Projekt wieder Clients direkt an die Datenbank lassen, wird RLS für dieses Projekt Pflicht. |
| `BYPASSRLS` auf Anwendungsrollen | **nicht vergeben** | Ohne RLS ist es wirkungslos, und es verdeckt später echte Policies. (Hinweis: `fitapp_app` trägt es aus der Supabase-Zeit — beim Marathon-Umzug prüfen. **In diesem Projekt nicht angefasst.**) |
| Projektobjekte im Schema `public` | **nein** | `public` bleibt leer; jedes Projekt hat sein Schema. Für Sicherungs- und Umzugsskripte ist „was gehört wem" damit ablesbar statt geraten. |

---

## 6. Projektübergreifende Zugriffe: Standard ist **nein**

Ein Projektschema ist für andere Projekte zunächst unsichtbar (`USAGE` nur für die
eigenen Rollen). Braucht ein Projekt Daten eines anderen, wird das **einzeln, schmal und
nachlesbar** erlaubt — nicht per Sammelrecht:

```sql
-- Beispiel (noch nicht nötig): das Quiz liest Stammdaten der Kontakte
GRANT USAGE  ON SCHEMA kontakte              TO leads_app;
GRANT SELECT ON kontakte.personen            TO leads_app;
```

Jede solche Erlaubnis gehört mit Datum und Grund in die Tabelle unten. Sie ist damit
auffindbar, prüfbar und widerrufbar — im Gegensatz zu heute, wo `service_role` überall
alles darf und niemand mehr sagen kann, wer was wirklich braucht.

| Von | Auf | Recht | Grund | seit |
| --- | --- | --- | --- | --- |
| _(keine)_ | | | Business-Leads ist eigenständig; Kontaktabgleich läuft über die Outbox nach MySQL | 27.08.2026 |

---

## 6b. Brauchen wir einen größeren Server? — gemessen, nicht geschätzt

Kurz: **Für die Verbindungen nein — das ist Architektur. Für die Zielgröße irgendwann ja
— aber nicht heute.**

Die Maschine ist ein **cx22 (2 Kerne, 4 GB RAM, 40 GB Platte)** — die kleinste der Flotte.
Auf ihr laufen **beide** Datenbanken: PostgreSQL *und* die MySQL-Bestände, die später
ebenfalls hierher wandern sollen.

| Messung (27.08.) | Wert | Bewertung |
| --- | --- | --- |
| Last (1/5/15 min) | 0,06 / 0,14 / 0,17 | die Maschine langweilt sich |
| Cache-Trefferquote PostgreSQL | **0,9998** | praktisch alles aus dem Speicher; RAM reicht heute deutlich |
| PostgreSQL-Daten gesamt | 251 MB | davon 233 MB die Testimport-Datenbank — echte Daten ~18 MB |
| MySQL-Daten (dieselbe Maschine) | **1.519 MB** | `prod_contacts` 813 MB, `prod_activesupport` 466 MB, `prod_customers` 161 MB |
| Speicherverbrauch | mysqld 1.387 MB · postgres ~540 MB | von 4 GB; 1,6 GB frei |

**Warum die Verbindungen kein Hardwareproblem sind:** Jede PostgreSQL-Verbindung ist ein
eigener Prozess und kostet Speicher — deshalb ist `max_connections=40` auf dieser Maschine
richtig gewählt und *nicht* das, was man hochdreht. Ein Verbindungspooler (PgBouncer,
Transaktionsmodus) lässt viele Anwendungssitzungen sich wenige echte Verbindungen teilen;
sechs Projekte kommen damit mit ~20 echten Verbindungen aus. Das löst das Problem
vollständig, ohne ein Byte mehr RAM.

**Wo es später wirklich eng wird:** in der **Übergangsphase**. Wandern die MySQL-Bestände
(1,5 GB) nach PostgreSQL, laufen beide Systeme eine Zeit lang nebeneinander — MySQL hält
seine Daten weiter im Speicher, PostgreSQL braucht zusätzlich Platz für dieselben Daten.
Das ist der Moment, in dem 4 GB knapp werden, nicht heute.

**Empfehlung:**

1. **Jetzt kein Upgrade.** Datenmenge und Last rechtfertigen es nicht.
2. **Vor der Kontakte-Migration upgraden** (`prod_contacts` 813 MB + `prod_activesupport`
   466 MB sind die schweren Brocken): `cx22 → cx32` verdoppelt auf 4 Kerne und 8 GB.
   Bei Hetzner ist ein RAM-/CPU-Upgrade ein Neustart und **reversibel** — nur eine
   Plattenvergrößerung ist endgültig.
3. **Messbare Auslöser statt Bauchgefühl**: Cache-Trefferquote unter **0,99**, Last
   dauerhaft über **1,5** (bei 2 Kernen), oder freier Speicher dauerhaft unter ~500 MB.
4. **Feintuning erst danach.** `shared_buffers` (256 MB) und `effective_cache_size`
   (768 MB) sind für 4 GB konservativ. Sie jetzt anzuheben, würde MySQL Speicher wegnehmen,
   das sich dieselbe Maschine teilt — also erst nachziehen, wenn MySQL schrumpft.

---

## 7. Verbindungen: die eigentliche Engstelle

37 nutzbare Verbindungen, 11 belegt. Sechs Projekte mit je einem Verbindungspool passen
da **nicht** hinein, und die Maschine (3 GB RAM, 2 Kerne) verträgt kein beliebiges
Hochdrehen von `max_connections` — jede Verbindung kostet Speicher, und mehr gleichzeitige
Abfragen als Kerne machen das System nicht schneller, sondern langsamer.

Deshalb wird pro Rolle eine Obergrenze gesetzt (`CONNECTION LIMIT`), damit ein Projekt die
anderen nicht aussperren kann:

| Rolle | Grenze | Überlegung |
| --- | --- | --- |
| `leads_app` | 8 | Anwendungspool; das Quiz ist ereignisarm |
| `leads_migrate` | 2 | nur beim Deploy |
| `leads_read` | 3 | Auswertungen |
| **Summe Leads** | **13** | zusammen mit heute 11 belegten: 24 von 37 |

🔴 **Auslöser für den nächsten Schritt:** Beim **dritten** Projekt ist die Grenze
erreicht. Dann kommt ein Verbindungspooler (PgBouncer, Transaktionsmodus) davor — nicht
ein höheres `max_connections`. Das ist auf dieser Maschine der richtige Hebel: Der Pooler
teilt wenige echte Verbindungen unter vielen Anwendungssitzungen auf, statt Speicher an
schlafende Verbindungen zu verschenken.

Ergänzend je Rolle gesetzt (wie bei `fitapp_app` bereits üblich):
`statement_timeout=8s`, `lock_timeout=8s` für Anwendungsrollen; `30s` für Lesezugänge
(Auswertungen dürfen länger); für `_migrate` nur `lock_timeout=8s`, damit eine Migration
nie unbemerkt die Produktion blockiert.

---

## 8. Umsetzung für das Business-Leads-Quiz

- Schemata: **`leads`** (heute `public`) und **`leads_analytics`** (heute
  `analytics_internal`) in der Datenbank `hl_support`. Damit verschwindet das Quiz aus
  `public`, und der generische Name `analytics_internal` blockiert nicht das künftige
  Projekt „Analysen".
- Rollen: `leads_owner`, `leads_migrate`, `leads_app`, `leads_read` nach §4.
- Der Export der Phase 5 bekommt eine **Schema-Abbildung** `public→leads`,
  `analytics_internal→leads_analytics`; betroffen sind auch Funktionsrümpfe
  (`SET search_path`, qualifizierte Verweise). Der Beweis ist derselbe wie bisher:
  Paritätsvergleich **und** Funktionsbeweis im Testimport.
- Die Anwendung (Stufe B) verbindet sich als `leads_app` mit
  `search_path = leads, leads_analytics` — kein `public` im Suchpfad, damit nichts
  versehentlich dort landet.

---

## 9. Quellen

- [PostgreSQL 18: Privileges](https://www.postgresql.org/docs/current/ddl-priv.html) und
  [ALTER DEFAULT PRIVILEGES](https://www.postgresql.org/docs/current/sql-alterdefaultprivileges.html)
- [Red Gate: Roles and Privileges — Best Practices](https://www.red-gate.com/simple-talk/databases/postgresql/postgresql-basics-roles-and-privileges/)
- [Red Gate: Object Ownership and Default Privileges](https://www.red-gate.com/simple-talk/featured/postgresql-basics-object-ownership-and-default-privileges/)
- [PlanetScale: One Postgres cluster, many apps](https://planetscale.com/blog/one-postgres-cluster-many-apps)
  (empfiehlt getrennte Datenbanken für **unabhängige** Anwendungen — unsere sind über den
  Menschen verbunden, deshalb hier bewusst anders entschieden)
- [Cybertec: ALTER DEFAULT PRIVILEGES erklärt](https://www.cybertec-postgresql.com/en/postgresql-alter-default-privileges-permissions-explained/)
- [AWS: Managing PostgreSQL users and roles](https://aws.amazon.com/blogs/database/managing-postgresql-users-and-roles)
