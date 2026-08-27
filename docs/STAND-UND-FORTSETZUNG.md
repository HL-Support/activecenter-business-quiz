# Stand und Fortsetzung — Einstiegsdokument

**Letzte Aktualisierung: 27.08.2026, spät abends (nach Schritt 1, Schema-Abbildung).** Dieses Dokument ist der Einstieg für jede
neue Sitzung: Es beschreibt, wo das System steht, was zuletzt passiert ist, welche
Entscheidungen gelten, welche Fallen bekannt sind — und wie es konkret weitergeht.
Zeiten sind MESZ, sofern nicht anders angegeben.

> Regeln zuerst: `AGENTS.md` (dieses Repo) und die globale Governance in
> `D:\OneDrive\Antigravity Laptop\agent-core\governance\GOVERNANCE_RULES.json`.
> 🔴 R0 gilt immer: keine Eile, alles prüfen, nie gegen echte Daten testen.

---

## 1. Was dieses Projekt ist

Das **Business-Leads-Quiz** ist ein Funnel: Anzeige → Quiz (6 Fragen) → Profil und Ziel →
Opt-in mit Kontaktdaten → drei Videos → Abschluss-CTA. Daraus entstehen Leads, die per
Nurture-Mails weiterbetreut werden.

Es ist eines von mehreren Projekten, die schrittweise von fremden Plattformen (Vercel,
Supabase) auf **eigene Server** ziehen. Die anderen: Fit-App (mit Marathon), Analysen,
Events, Kontakte, Support.

---

## 2. Systemlandschaft (Stand heute)

### Anwendung

| | |
| --- | --- |
| Läuft auf | **Coolify**, Server `167.233.251.217` (cx33), App `business-leads-prod`, UUID `yhoacszoiofuq6dg4mykyr7b` |
| Domains | `quiz.activecenter.info`, `business.activecenter.info`, `business.eaglesfit.ch` |
| Laufzeit | Docker, `server/app-server.js` liefert `dist/` + `api/` + `/health/live` + `/health/ready` |
| Aktueller Stand | Commit `48469a6` (Stufe A) |
| Vercel | nur noch **Rückweg** bis zum Abbau; vierter Eingang `businessleadsquiz.vercel.app` lebt DNS-unabhängig |

### Deploy (seit 27.08., Stufe 1 der Pipeline)

Der CI-Job `deploy` in `.github/workflows/activecenter-safety.yml` deployt **automatisch**,
aber nur: bei Push auf `main`, **nach** grünen Jobs `safety` und `e2e-queue`, und nur wenn
Runtime-Pfade betroffen sind (`api/`, `server/`, `src/`, `fonts/`, `Dockerfile`,
`index.html`, `berater-info.html`, `translations.js`, `video-config.js`, `ac-track.js`,
`build.js`, `package.json`, `pnpm-lock.yaml`). Reine `docs/`- oder `scripts/`-Merges
deployen **nicht**. Der Job **beweist** den Deploy: `/health/live` muss binnen 10 Minuten
den gemergten Commit tragen, sonst ist der Lauf rot.

Der rohe Git-Webhook bleibt bewusst aus. Fallback von Hand:

```bash
curl -X POST -H "Authorization: Bearer <coolify.apiToken>" \
  "https://coolify.hl-support.biz/api/v1/deploy?uuid=yhoacszoiofuq6dg4mykyr7b"
curl -s https://quiz.activecenter.info/health/live   # mehrfach über Zeit prüfen
```

🔴 GitHub-Secret `COOLIFY_API_TOKEN` trägt derzeit den **vollen** Coolify-Token — bei
Gelegenheit durch einen nur-Deploy-berechtigten ersetzen.

### Datenbanken

| Rolle | Wo | Details |
| --- | --- | --- |
| **Quelle (noch produktiv)** | Supabase `xlpiisbozpgmemxhtivj` | PostgreSQL **17.6**. Alle Lead-Daten liegen hier. |
| **Ziel (Plattform)** | `10.0.1.3` / `91.99.76.104`, Datenbank **`hl_support`** | PostgreSQL **18.6**, cx22 (2 Kerne, 4 GB), ICU en-US/UTF8, `data-checksums` an |
| **Testartefakt** | `business_leads_testimport` auf demselben Server | enthält **echte Kopien** der Quiz-Daten, seit dem Abbildungslauf (27.08. spät) in den **Plattform-Schemata** `leads`/`leads_analytics`. Kein Spielplatz. Rückweg: `dropdb business_leads_testimport` |
| **Legacy-Kartei** | MySQL auf **derselben** Maschine `10.0.1.3` | `prod_contacts_activesupport` (813 MB) u. a., zusammen ~1,5 GB |

Namenshierarchie der Plattform (Entscheidung Markus, 27.08.):

```text
Datenbank  hl_support        ← das Gesamtsystem
   ├── Schema fitapp         ← Projekt Fit-App (Marathon ist ein Bereich davon)
   ├── Schema leads          ← Projekt Business-Leads-Quiz      (angelegt, noch leer)
   ├── Schema leads_analytics←   dessen Auswertungsteil          (angelegt, noch leer)
   ├── Schema kontakte / support / events / analysen   ← folgen später
   └── Schema marathon       ← bestehend; Empfehlung: beim FitApp-Umzug nach `fitapp`
```

### Wächter (Überwachung)

`scripts/waechter-nurture.js`, läuft **stündlich zur Minute 37** als Dateikopie auf
`167.233.251.217:/opt/waechter-nurture/` (bewusst nicht auf der n8n-Box). Herzschlag
umgekehrt: sauberer Lauf pingt Better Stack, ein Befund pingt **nicht** — damit alarmiert
sowohl eine Störung als auch ein ausgefallener Wächter.

| | Prüft |
| --- | --- |
| **W1** | Kappungsnähe an der PostgREST-Zeilengrenze (1000) |
| **W2** | Fällige Empfänger ohne Mail + stehender Versand |
| **W3** | strukturell Unerreichbare (kein Ziel / keine Absendezeit) |
| **W4** | Werbe-Besucher ohne ein einziges Opt-in (Anzeigen-Konversion) |
| **W5** | **neu 27.08.**: Opt-ins mit weniger als 6 Antwortzeilen (Teilverluste) |

🔴 Der Wächter läuft **nicht** aus dem Repo. Nach jeder Änderung an
`waechter-nurture.js`, der Baseline oder `stats-logs-baseline.js` muss die Serverkopie
nachgezogen werden — Ablauf in [NURTURE_BETRIEB.md](NURTURE_BETRIEB.md) §4.

---

## 3. Was am 27.08.2026 passiert ist (13 Commits, PRs #89–#101)

### Vormittag: ein aktiver Datenverlust

Ein Agent auf hl-support-Analytics meldete 7× `SyntaxError: Unexpected end of JSON input`.
Ursache: `upsert_answer_current` ist `RETURNS void`, PostgREST antwortet mit **leerem
Body**, und die Bridge-Kopie von `supabaseRpc` parste ihn trotzdem als JSON. Der erste
Wurf riss die Antwort-Schleife nach der **ersten** Antwort ab.

- **PR #91** — Guard gegen leere Antworten + 4 Regressionstests. Deployt.
- **PR #92** — Wächter **W5**; Serverkopie aktualisiert.
- **Geheilt**: 6 Leads (der akute Fall + 5 unsichtbare Teilverluste aus Mai–August), je
  einzeln verifiziert. Aufarbeitung: [void-rpc-teilverluste](audits/2026-08-27-void-rpc-teilverluste.md).
- 🔴 **Wichtigste Lehre**: Der „Beweis am echten Verkehr" vom 26.08. war eine
  Fehldeutung — der parallele Ereignisstrom hatte den kaputten Rettungspfad verdeckt.
  **Der Beweis eines Pfads muss den Pfad isoliert messen.** Korrektur steht als §5c in
  der [Antwortverlust-Analyse](audits/2026-08-26-antwortverlust-analyse-und-zielbild.md).

### Mittag: Doku, Konsolidierung, Pipeline

- **PR #93** — gesamte Doku auf die Coolify-Realität gebracht.
- **PR #94** — die doppelten Supabase-Helfer konsolidiert (bridge.js delegiert an
  `server/lead-system.js`) **und** Deploy-Pipeline Stufe 1 gebaut.
- **PR #95** — Phase-4-Design und Phase-5-Objektauswahl.

### Nachmittag: Stufe A und der Phase-5-Beweis

- **PR #96** — **Stufe A**: `submit_lead_complete` schreibt Kontakt **und** alle sechs
  Antworten in **einer** Transaktion (vorher 7 Einzel-Calls). Live.
- **PR #97** — **Testimport**: selektiver Katalog-Export → `business_leads_testimport` auf
  PG18. Parität 356/356 Spalten, 65/65 Constraints, 86/86 Indexe, 6/6 Views, 20/20
  Funktionen, 5/5 Trigger. Plus Funktionsbeweis.
- **PR #98** — **Datenprobe**: 171.260 echte Zeilen; 6/6 Inhalts-Prüfsummen identisch
  (inkl. Umlaut- und JSON-Probe).
- **PR #99** — **pg_dump-Generalprobe**: der echte Weg dauert **24 Sekunden**
  (10,2 s Dump/124 MB + 14,1 s Restore).

### Abend: Plattform-Architektur

- **PR #100** — **Rollenmodell** für alle Projekte + **Schreibbarriere**.
- **PR #101** — Datenbank `fitapp` → **`hl_support`** umbenannt, Serverfrage beantwortet.

---

## 4. Geltende Entscheidungen (alle von Markus, 27.08.)

| # | Entscheidung | Konsequenz |
| --- | --- | --- |
| 1 | `tracking_*` zieht mit; **landing-page wird komplett abgehängt** (statische Seite, alles Weitere wird neu gebaut) | kein Fremdschreiber mehr auf `tracking_*` |
| 2 | **Business_Kalkulator** wird mit umgestellt und zieht später auf Coolify | `lead_contact_crm` zieht mit |
| 3 | **Webhook-Verbund bleibt draußen**; Legacy-MySQL künftig über **eine** Schnittstelle nach dem Muster des Analysen-Projekts (bündeln → eine Schnittstelle → `typeform_surveys`) | die Outbox ist genau dieser Übergabepunkt |
| 4 | `lead_access_permissions` **entfällt** (nie beschrieben, `auth.users`-FK) | auch aus `supabase-lead-system-v2.sql` streichen |
| 5 | `archive`-Schema bleibt zurück | gemessen: alle 4 Tabellen **0 Zeilen** |
| 6 | `rls_auto_enable` entfällt (Supabase-Instanzhygiene), `close_webhook_delivery_job` folgt dem Webhook-Verbund | — |
| 7 | Legacy-Objekte (`quiz_sessions`, `lead_migration_unresolved`) ziehen mit | Abbau später (Audit P2) |
| 8 | **`activecenter-analytics` wird nicht übernommen** — Statistiken bei Bedarf neu | ✅ Schreibzugriff beendet am 27.08. (beide Pfade, live als `637b71a`) |
| 9 | **Stufe A** des Phase-4-Designs freigegeben | umgesetzt, live |
| 10 | **Marathon ist tabu** — läuft weiter auf Supabase, nicht anfassen | meine Grants haben nur `SELECT` auf Quiz-Objekte ergänzt |
| 11 | Datenbank heißt **`hl_support`** (Gesamtsystem); FitApp ist ein **Projekt darin** | umbenannt und verifiziert |
| 12 | Alter Eingang „Landing Page Business" (Tierprofil-Quiz) bleibt vorerst bestehen, Abbau später | erzeugt praktisch keine Einträge mehr |

---

## 5. Migrationsstand: was bewiesen ist und was nicht

| Phase | Stand |
| --- | --- |
| **1–3 Hosting-Cutover** | ✅ abgeschlossen (25.08., alle 3 Domains auf Coolify) |
| **13.5.1 Objektmanifest** | ✅ Skript `scripts/objektmanifest-supabase.js`; **vor dem echten Umzug frisch erzeugen** |
| **Phase-5-Objektauswahl** | ✅ 107 Verbund-Objekte klassifiziert: **57 migrieren, 47 bleiben, 3 entfallen** |
| **Phase-5-Schema-Testimport** | ✅ bestanden, definitionsgleich |
| **Phase-5-Datenprobe** | ✅ bestanden, inhaltsgleich |
| **pg_dump-Generalprobe** | ✅ bestanden, 24 Sekunden |
| **Plattform-Rollenmodell** | ✅ entworfen, ausgerollt, **Grenzen bewiesen** (4 Negativtests) |
| **Schreibbarriere 13.5.2** | ✅ als Ablaufplan; **noch nicht geprobt** |
| **Phase 4 Stufe A** | ✅ live (`submit_lead_complete`) |
| **Phase 4 Stufe B** (direkter Treiber) | ❌ offen — erst nach Vercel-Abbau (Vercel erreicht die private DB nicht) |
| **Schema-Abbildung `public`→`leads`** | ✅ bestanden (27.08. spät): Parität ohne Abweichung, `public` leer, alles gehört `leads_owner`, Funktionsbeweis grün, Datenprobe 171.708 Zeilen + 3/3 Prüfsummen — Protokoll im [Testimport-Protokoll](audits/cutover-vorbereitung/phase5-testimport/testimport-protokoll-2026-08-27.md) |
| **Vercel-Abbau** | ⏳ technisch alles erfüllt; es fehlen die Datums-Tore (**ab 02.09.**), zwei Handprüfungen und Markus' Freigabe |
| **Echter Cutover** | ❌ offen |

---

## 6. Zugänge und Werkzeuge

Alle Zugangsdaten liegen in `C:\Users\Markus\.agent-secrets\agent-secrets.json` —
**nie ins Repo**.

| Zweck | Schlüssel / Weg |
| --- | --- |
| Supabase lesen/schreiben (App) | `.env.prod` im Repo: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` |
| Supabase SQL (Management-API) | `.env.prod`: `SUPABASE_ACCESS_TOKEN`; Helfer `scripts/stats-logs-baseline.js` → `executeManagementQuery(sql)`; nur mit curl-artigem User-Agent (Cloudflare blockt python-urllib) |
| Supabase **Edge-Logs** (wer greift zu) | derselbe `SUPABASE_ACCESS_TOKEN` gegen `analytics/endpoints/logs.all`; **`iso_timestamp_start`/`_end` sind Pflicht** — ohne sie liefert die API nur die letzte Minute. Beispiel: `scripts/fremdschreiber-messen.js` |
| Supabase **pg_dump** | Secrets `marathon_supabase_app` (Rolle `marathon_app`, Pooler, **BYPASSRLS**). 🔴 BYPASSRLS ist Pflicht — sonst liefert der Dump bei aktiver RLS **still weniger Zeilen**. Leserechte auf die Quiz-Objekte: `supabase-export-rechte.sql` (Rückweg im Kopf) |
| Ziel-DB `hl_support` | Secrets `leads_pg` (`leads_app`, `leads_migrate`). Zugang nur von `10.0.1.5` laut `pg_hba` |
| DB-Server SSH | `root@91.99.76.104`, Key `id_rsa` — **hat eine Passphrase** (Secrets `cw_forge_server.sshKeyPassphrase`); ohne Agent+Askpass scheitert er still als „Permission denied" |
| Coolify-API | Secrets `coolify` (`apiBase`, `apiToken`) |
| Wächter-Host | `root@167.233.251.217`, `/opt/waechter-nurture/` |

### Werkzeuge im Repo

| Skript | Zweck |
| --- | --- |
| `scripts/objektmanifest-supabase.js` | Katalog-Inventar der Quelle (13.5.1) |
| `scripts/phase5-schema-export.js` | selektive Schema-DDL der Migrieren-Liste aus dem **Live-Katalog**, seit 27.08. spät **abgebildet** auf `leads`/`leads_analytics` (beginnt mit `SET LOCAL ROLE leads_owner`) |
| `scripts/phase5-schema-abbildung.js` | die **eine** Abbildung `public`→`leads`, `analytics_internal`→`leads_analytics` (mit Restkontrolle); Export, Vergleich und Datenprobe nutzen dasselbe Modul |
| `scripts/phase5-testimport-vergleich.js` | Paritätsvergleich Quelle ↔ Testimport |
| `scripts/phase5-datenprobe.js` | echte Daten in die Test-DB pumpen + Zählparität |
| `scripts/vercel-abbau-vorbedingungen.js` | misst die Abbau-Tore |
| `scripts/fremdschreiber-messen.js` | wer schreibt außer der App in den Leadkern — Datenseite (Signatur) **und** Transportseite (Edge-Logs); Vorbereitung und Abnahme der Schreibbarriere |
| `scripts/backfill-antworten.js` | heilt fehlende Antwortzeilen aus dem MySQL-JSON |
| `scripts/waechter-nurture.js` | W1–W5 (`--selbsttest` läuft ohne Datenbank) |
| `scripts/abgleich-videorang.js` | täglicher Lese-Abgleich Videorang ↔ `points_result` |
| `plattform-rollen-leads.sql` | Rollen und Schemata (idempotent, Rückweg im Kopf) |
| `supabase-submit-lead-complete.sql` | Stufe A |
| `supabase-export-rechte.sql` | Leserechte für den Export |

---

## 7. Bekannte Fallen (jede hat Zeit oder Daten gekostet)

1. **Doppelte Helfer driften.** `api/bridge.js` hielt eigene Kopien der Supabase-Helfer;
   der 204-Guard fehlte dort. Seit PR #94 delegiert die Bridge — **eine** Implementierung.
2. **void-RPCs antworten mit leerem Body** *nach* erfolgreicher Verbuchung. Jeder
   RPC-Aufrufer braucht den Leere-Antwort-Guard.
3. **Identity-Spalten sind für `pg_attrdef` unsichtbar.** Ein Schema-Vergleich ohne
   `attidentity` meldet **falsches Grün**; der Fehler zeigt sich erst beim ersten INSERT.
4. **PostgREST deckelt hart bei 1000 Zeilen** und liefert `analytics_internal` gar nicht
   aus (`PGRST106`, nur `public`/`graphql_public`/`marathon`).
5. **Der DB-Server sperrt schnelle SSH-Folgen** (~20 Verbindungen → Timeout für Minuten).
   Fernbefehle in **einer** Sitzung ketten.
6. **`.pgpass` gehört dem Nutzer, der das Werkzeug startet** — `pg_dump` als `root`
   laufen lassen, nicht `sudo -u postgres` (sonst „password authentication failed").
7. **Redundanz verdeckt Fehler.** Zwei Wege, die dasselbe tun, lassen einen kaputten Weg
   „bewiesen" aussehen. Pfade isoliert messen.
8. **Eine Messung ist kein Beweis** — Live-Drift sieht aus wie ein Transportfehler
   (`quiz_sessions` wich ab; begrenzt auf `id <= 1750` war sie identisch).
9. **Merge ≠ Deploy war gestern**; heute deployt die CI — aber nur Runtime-Pfade. Ein
   alter Stand in Produktion kann völlig korrekt sein.
10. **Windows-Shell**: Umlaute nie inline per curl; `--data-binary @datei` und HEX prüfen.
11. **`source_app` verrät den Schreiber nicht.** `activecenter-analytics` kopiert den Wert
    aus `lead_state` und schreibt damit unter `business_leads_quiz` — wie die Anwendung
    selbst. Fremdschreiber nur über konstante Merkmale erkennen (`payload->>'source'`).
12. **Herkunfts-IPs sind bei Cloud-Diensten kein Schlüssel**: n8n und Vercel rufen aus
    wechselnden AWS-Bereichen (gemessen 59 IPs in 24 h). Nach **Zielpfad** gruppieren.
13. **Prüfsummen über DB-Grenzen** brauchen beidseitig fixierte Zeitzone und
    `COLLATE "C"` — ICU-Ziel und Supabase-Quelle sortieren sonst anders und melden
    einen Transportfehler, den es nicht gibt.

---

## 8. Fortsetzungsplan

### Schritt 1 — Schema-Abbildung `public` → `leads` — ✅ erledigt (27.08. spät)

Alle vier Punkte umgesetzt und bewiesen (Details im
[Testimport-Protokoll](audits/cutover-vorbereitung/phase5-testimport/testimport-protokoll-2026-08-27.md),
Abschnitt „Schema-Abbildung"): eine Abbildung in `scripts/phase5-schema-abbildung.js`
mit erzwungener Restkontrolle; Import unter `SET LOCAL ROLE leads_owner`; frische
Test-DB; Parität 356/356/65/65/86/86/6/6/20/20/5/5 ohne Abweichung; `public` leer;
alles gehört `leads_owner`; Funktionsbeweis grün (inkl. 6 Antwortzeilen und
Outbox-Identity); Datenprobe 171.708 Zeilen mit 3/3 Inhalts-Prüfsummen.

🔴 Für den echten Cutover heißt das: Schema **immer** über den abbildenden Export
erzeugen — ein roher `pg_dump --schema-only` würde wieder `public` anlegen. Beim
Prüfsummenvergleich Quelle↔Ziel Zeitzone fixieren und Text mit `COLLATE "C"`
sortieren, sonst erzeugt die ICU-Sortierung des Ziels falsche Rot-Befunde.

### Schritt 2 — `activecenter-analytics` vom Schreiben trennen — ✅ erledigt (27.08.)

Gemessen mit `scripts/fremdschreiber-messen.js`, dann geschlossen und live
(`activecenter-analytics` PR #2, Commit `637b71a`).

- Die Annahme „sie schreibt heute `lead_events`" stimmte **nicht mehr**: letztes
  Ereignis mit ihrer Signatur am **08.06.2026**. Kein Dauerstrom, der versiegen musste.
- Es waren **zwei** Pfade, nicht einer: der Dashboard-Knopf (jetzt 410 Gone) **und**
  ein Wartungsskript mit `PATCH lead_state` (jetzt Riegel mit Schlüssel). Der zweite
  stand in keiner Planungsnotiz.
- Die Signatur ist **nicht** über `source_app` messbar (der Wert wird aus `lead_state`
  geerbt), sondern nur über `payload->>'source' = 'analytics_dashboard_v2'`.
- 🔴 **Die CI des Analytics-Repos läuft nicht** („Actions budget is preventing further
  use"). Der Nachweis kam aus lokalem Gate-Lauf plus Prüfung am ausgelieferten
  Artefakt. Das Budget gehört nachgesehen.

### Schritt 3 — Vercel-Abbau (ab 02.09., nach Freigabe) — jetzt an der Reihe

`node --env-file=.env.prod scripts/vercel-abbau-vorbedingungen.js` erneut laufen lassen,
die zwei Handprüfungen machen (GlitchTip ohne offene Hosting-Vorfälle,
Wächter-Protokolle ohne neuen ALARM), dann Markus' ausdrückliche Freigabe einholen —
**der Abbau gibt den Hosting-Rückweg auf**.
Reihenfolge in [vercel-abbau-checkliste.md](audits/cutover-vorbereitung/vercel-abbau-checkliste.md).

**Stand der Tore am 27.08. abends** (gemessen): 12 von 14 erfüllt — alle drei Domains
erreichbar, ohne Alt-Svc, Zertifikate 87 Tage Rest; Nurture frisch und erfolgreich;
Werbe-Besucher konvertieren (58 Besucher, 5 Opt-ins in 48 h). Offen sind nur:

1. die beiden **Datums-Tore** (frühestens 01.09. bzw. 02.09.),
2. das Tor **„n8n Quiz-Workflows ohne Fehl-Läufe (7 Tage)"**.

🔴 Zu Punkt 2 — **kein Defekt, kein Handlungsbedarf**: Der eine Fehllauf
(Workflow `Update "Result" by hash`, 27.08. 13:09 MESZ) ist ein **korrekt abgewiesener
Fremdaufruf**. Der Node heißt `Code - Require Update Secret` und meldete
`unauthorized_update_result`; der Schutz hat also funktioniert. Der Aufruf kam aus einem
echten Chrome-Browser von `https://www.global-sce.com` mit einem **`ac_`-Hash** — er
gehört damit **nicht** zum Business-Leads-Quiz (dessen Hashes beginnen mit `qz_`).
Die regulären Aufrufe dieses Workflows kommen vom Outbox-Worker (`user-agent: node`,
kein Origin, `qz_`-Hash, mit `job_id`); von 63 Läufen waren **62 erfolgreich**.

Das Tor löst sich **von selbst**: Es prüft ein 7-Tage-Fenster, der Einzelfall fällt am
**03.09.** heraus — also praktisch zeitgleich mit den Datums-Toren. Das Tor deshalb
**nicht** aufweichen; ein Tor, das man bei Unbequemlichkeit lockert, ist wertlos.

Nebenbefund für ein **anderes** Projekt: Falls auf `global-sce.com` ein Frontend diesen
Webhook noch ohne Secret aufruft, geht dort jedes Ergebnis verloren. Einzelfall in der
n8n-Historie (die nur bis 26.08. zurückreicht) — beobachten, nicht hier lösen.

### Schritt 4 — Trockenlauf der Schreibbarriere

[schreibbarriere-13.5.2.md](audits/cutover-vorbereitung/schreibbarriere-13.5.2.md)
einmal **ohne** echten Cutover proben: Rechte entziehen, Schreibversuch muss scheitern,
Stillstand zweimal messen, Rechte zurückgeben. Damit ist der Ablauf am Umzugstag Routine
statt Premiere.

### Schritt 5 — Phase 4 Stufe B (direkter Treiber)

Nach dem Vercel-Abbau: Der Container spricht `hl_support` mit direktem Treiber (`pg`) als
`leads_app`, `search_path = leads, leads_analytics`. `submit_lead_complete` bleibt
unverändert — dieselbe Funktion, anderer Transportweg. PostgREST verlässt damit den
kritischen Pfad; die Outbox wird der **einzige** Übergabepunkt zur Legacy-MySQL
(Entscheidung 3).

### Schritt 6 — Echter Cutover

Manifest und Export frisch erzeugen → Schreibbarriere → `pg_dump`/Restore (24 s) →
Nachweise (Zeilen, Prüfsummen, 0 Waisen, Sequenzen, Funktionsbeweis) → umschalten.
**Danach nicht vergessen:** pg_cron-Job `refresh_event_daily` auf dem Ziel anlegen,
n8n-Workflows umstellen, und 🔴 **die Wächter auf die neue Quelle umstellen** — sonst
bewachen sie weiter die alte Datenbank und melden „alles ruhig".

### Schritt 7 — Nachlauf

- Verbindungspooler (PgBouncer), sobald das **dritte** Projekt kommt.
- Server `cx22 → cx32` **vor** der Kontakte-Migration (813 MB + 466 MB MySQL).
- `supabase-lead-system-v2.sql` bereinigen (`lead_access_permissions` streichen).
- Empfehlung ans FitApp-Projekt: Schema `marathon` → `fitapp`.
- Alter Eingang „Landing Page Business" abbauen (Entscheidung 12: später).

---

## 9. Offene Entscheidungen für Markus

1. **Vercel-Abbau freigeben** (ab 02.09.) — gibt den Hosting-Rückweg endgültig auf.
2. **Zeitfenster für den Cutover** — Erfahrung: 02:00–05:00 MESZ ist praktisch verkehrsfrei.
3. **Server-Upgrade cx32** — nicht jetzt, aber vor der Kontakte-Migration.
4. **GitHub-Secret** `COOLIFY_API_TOKEN` auf einen nur-Deploy-Token verkleinern.

---

## 10. Dokumentenkarte

| Thema | Dokument |
| --- | --- |
| **Gesamtstatus der Migration** | [audits/STATUS-migrationsvorbereitung-2026-08-25.md](audits/STATUS-migrationsvorbereitung-2026-08-25.md) |
| Plattform-Rollenmodell, Serverfrage | [audits/plattform-rollenmodell-2026-08-27.md](audits/plattform-rollenmodell-2026-08-27.md) |
| Objektauswahl + alle 7 Entscheidungen | [audits/cutover-vorbereitung/phase5-objektauswahl-2026-08-27.md](audits/cutover-vorbereitung/phase5-objektauswahl-2026-08-27.md) |
| Testimport, Datenprobe, pg_dump-Probe | [audits/cutover-vorbereitung/phase5-testimport/testimport-protokoll-2026-08-27.md](audits/cutover-vorbereitung/phase5-testimport/testimport-protokoll-2026-08-27.md) |
| Schreibbarriere | [audits/cutover-vorbereitung/schreibbarriere-13.5.2.md](audits/cutover-vorbereitung/schreibbarriere-13.5.2.md) |
| Phase-4-Design (ein Aufruf, eine Transaktion) | [audits/2026-08-27-phase4-design-lead-submit.md](audits/2026-08-27-phase4-design-lead-submit.md) |
| Vorfall void-RPC / Teilverluste | [audits/2026-08-27-void-rpc-teilverluste.md](audits/2026-08-27-void-rpc-teilverluste.md) |
| Vorfall Anzeigen-Konversion (HTTP/3) | [audits/2026-08-27-anzeigenkonversion-http3.md](audits/2026-08-27-anzeigenkonversion-http3.md) |
| Vorfall Nurture-Zeilengrenze | [audits/2026-08-26-nurture-zeilengrenze-vorfall.md](audits/2026-08-26-nurture-zeilengrenze-vorfall.md) |
| Antwortverlust + Zielbild (mit Korrektur §5c) | [audits/2026-08-26-antwortverlust-analyse-und-zielbild.md](audits/2026-08-26-antwortverlust-analyse-und-zielbild.md) |
| Nurture-Betrieb und Wächter | [NURTURE_BETRIEB.md](NURTURE_BETRIEB.md) |
| Verbraucher-Inventar (wer nutzt welche Tabelle) | [audits/verbraucher-inventar/INVENTAR.md](audits/verbraucher-inventar/INVENTAR.md) |
| Technisches Audit (Ursprung der Phasen) | [audits/2026-08-23-business-leads-coolify-technical-audit.md](audits/2026-08-23-business-leads-coolify-technical-audit.md) |
| Deploy-Ablauf | [../DEPLOYMENT_WORKFLOW.md](../DEPLOYMENT_WORKFLOW.md) |
| Lead-System-Runbook | [../LEAD_SYSTEM_RUNBOOK.md](../LEAD_SYSTEM_RUNBOOK.md) |
| Bridge-Verträge / Abhängigkeitskarte | [BRIDGE_CONTRACTS.md](BRIDGE_CONTRACTS.md) · [DEPENDENCY_MAP.md](DEPENDENCY_MAP.md) |
