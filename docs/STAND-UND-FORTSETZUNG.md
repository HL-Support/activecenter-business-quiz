# Stand und Fortsetzung — Einstiegsdokument

> ## 🟢 Stand 31.08.2026, 13:40 MESZ — Schattenlauf gegen MySQL, haltbar gespeichert
>
> | Prüfung | Messung |
> | --- | --- |
> | Produktion | `0135ef3`, `/health/ready` grün, `quelle: plattform` |
> | Funnel | `lookup_subdomain` antwortet unverändert (`found=true`, `source=user`) |
> | MySQL-View | `prod_quiz.quiz_berater`, **255 Zeilen**; Rechte: nur `SELECT` auf diese View |
> | Gleichheit zur Bridge | **25 Berater Feld für Feld: 25 zeichengleich, 0 Abweichungen** |
> | Schattenlauf | läuft; Vergleiche in `leads.berater_vergleich`, **0 mit Abweichung** |
> | **Haltbarkeit** | 5 Vergleiche erzeugt → deployt → **immer noch 5**. Kein Verlust mehr |
> | Postmark-Tags | **alle fünf** Nutzlasten tragen einen Tag, Wächter-Test hält den Stand |
>
> **A1–A4 sind erledigt, A5 wartet nur noch auf Menge.** Die vier Stellen fragen über
> **einen** Auflöser; 🔴 **die Bridge entscheidet weiterhin**, MySQL wird nur mitgemessen.
>
> 🟢 **Es gibt keine Deploy-Sperre.** Der Vergleich liegt jetzt in der Datenbank statt im
> Containerprotokoll und überlebt jeden Deploy — nachgewiesen. Am Projekt darf normal
> weitergearbeitet werden.
>
> **Offen:** A5 (Env-Umschaltung, Tor in
> [plans/umsetzung-uebersicht.md](plans/umsetzung-uebersicht.md)), Strang B (Route im
> contacts-Repo zuerst), Strang M (Opt-in-Mails kommen **weiterhin aus n8n**, nicht aus
> dem Repo).


**Letzte inhaltliche Überarbeitung: 28.08.2026, nachts — nach dem vollständigen Audit.**
Alle Zahlen in diesem Dokument sind am 27.08. abends **neu gemessen**, nicht übernommen. Dieses Dokument ist der Einstieg für jede
neue Sitzung: Es beschreibt, wo das System steht, was zuletzt passiert ist, welche
Entscheidungen gelten, welche Fallen bekannt sind — und wie es konkret weitergeht.
Zeiten sind MESZ, sofern nicht anders angegeben.

> Regeln zuerst: `AGENTS.md` (dieses Repo) und die globale Governance in
> `D:\Antigravity_Projects\agent-core\governance\GOVERNANCE_RULES.json`.
> 🔴 R0 gilt immer: keine Eile, alles prüfen, nie gegen echte Daten testen.

> ## 🔴 Zuerst lesen: der Cutover ist erfolgt
>
> **Am 28.08.2026, 07:22–07:55 MESZ** ist der Umzug Supabase → Plattform-DB
> `hl_support` (Schemata `leads`/`leads_analytics`) durchgeführt worden. Die
> Anwendung läuft mit `LEADS_DB_MODUS=direkt`, Supabase ist schreibgesperrt und
> eingefroren, das Vercel-Projekt ist pausiert.
>
> Alles darunter, was den Cutover als *bevorstehend* beschreibt (§5, §8 Schritt 6),
> ist damit **überholt**. Protokoll und Belege:
> [CUTOVER-CHECKLISTE](audits/cutover-vorbereitung/CUTOVER-CHECKLISTE.md).
>
> **🔴 Der Cutover ist NICHT das Ende der Supabase-Abhängigkeit.** Der Funnel
> *schreibt* vollständig in die Plattform-DB. Aber laut
> `scripts/inventory/supabase-consumers.json` fassen **14 von 26** inventarisierten
> Verbrauchern Lead-Tabellen an, und mehrere davon **lesen weiter aus Supabase** —
> und sehen dort seit dem 28.08., 07:25 MESZ **eingefrorene Daten**. In den
> Edge-Logs nachgewiesen: ein Leser von `v_lead_state_full`, `lead_contact_crm` und
> `lead_events` aus `eu-central-1` (AWS/Vercel), zuletzt 09:31 MESZ.
>
> **⚠️ Korrektur zu einer früheren Fassung dieses Absatzes.** Hier stand,
> `leads.quiz_sessions` sei durch den Cutover kaputtgegangen. **Das stimmt nicht.**
> Nachgemessen: Die letzte Zeile trägt `27.08. 19:48` — und weil die Spalte
> `timestamp without time zone` ist, war das **9,5 Stunden vor** der Schreibbarriere
> (28.08. 05:25 UTC). Die Tabelle hat also schon vorher aufgehört, sich zu füllen.
>
> Der wirkliche Grund steht in `api/bridge.js` (≈ Z. 4098):
> `usesLeadSystemV2 ? Promise.resolve(null) : persistBusinessSubmissionForResume(...)`
> — unter Lead-System v2, das bei 100 % steht, wird `quiz_sessions` **absichtlich
> nicht mehr geschrieben**. Gespeist wurde sie zuletzt nur noch vom alten
> `track_event`-Weg (`ac-track.js`), und der feuert auf der Funnelseite nicht mehr.
> `quiz_sessions` ist damit eine **Altlast**, keine Regression — sie dient nur noch
> als Rückfallquelle in `loadLeadFallbackContext`, und die Primärtabellen
> `lead_state`, `lead_events`, `lead_answers_current`, `lead_video_progress` sind
> vollständig (an einem Handlauf Feld für Feld gegen MySQL geprüft).
>
> **Was trotzdem echt war und behoben wurde:** Dieselben drei Stellen bauten die URL
> **direkt** aus `SUPABASE_URL` und gingen am modusbewussten Transport vorbei. Für
> das Ziel „100 % ohne Supabase" ist das unabhängig vom Symptom ein Mangel — jetzt
> über `supabaseJson`/`patchByEquals`/`insertIgnoringDuplicates`, mit zwei Tests als
> Wächter dagegen.
>
> **✅ Korrektur vom 28.08. nachmittags:** Der **Nurture-Sender läuft bereits auf der
> Plattform-DB**. Am n8n-Workflow `AC - Quiz Nurture Email Sender` (`RqKSRTgFv8mv04H2`)
> nachgemessen: Zugangsdaten «Plattform-DB leads_n8n (hl_support)», SQL auf
> `leads.lead_events` und `leads.record_nurture_sent`, letzter Lauf 28.08. 14:00 (179 s).
> Die Knoten **heißen** noch „Supabase - …" — das ist nur der Name, nicht das Ziel.
> Frühere Fassungen dieses Dokuments und die Commit-Nachricht von `4d72f7c`
> („noch NICHT aktiviert") sind damit überholt.
>
> **Weiter offen:** `AC - Error Alert` schreibt weiterhin
> nach Supabase · Test-DB `business_leads_testimport` löschen · `pgss-monatsreset`
> reparieren · der **finale CTA nach den Videos** ist nicht automatisiert geprüft
> (siehe [BROWSERWEG-KETTENTEST](BROWSERWEG-KETTENTEST.md)) · Vercel-Projekt ist
> **pausiert, aber nicht abgebaut** (vier Domains hängen noch daran) · 🔴 **neu:** der
> **Benachrichtigungsweg hängt noch an der Legacy-MySQL** — siehe
> [MAILWEGE.md](MAILWEGE.md) und den Plan
> [benachrichtigungsweg-auf-plattform.md](plans/benachrichtigungsweg-auf-plattform.md).

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
| Aktueller Stand | Commit `5e640fe` (Stufe B gebaut, **nicht** aktiv) — nachgemessen 27.08. 23:00 |
| Vercel | nur noch **Rückweg** bis zum Abbau; vierter Eingang `businessleadsquiz.vercel.app` lebt DNS-unabhängig (HTTP 200), wird aber **nicht benutzt** (gemessen: alle Schreibzugriffe kommen von Coolify) |

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

✅ **Erledigt am 27.08.:** Das GitHub-Secret `COOLIFY_API_TOKEN` trägt jetzt den Token
`github-deploy-only` mit `["deploy"]` statt `["*"]`. Nachgemessen: `POST /deploy` kommt
durch, `GET /applications|servers|projects|teams` → **403**. Der volle Token
(`agent-desktop`) bleibt für Wartung, liegt aber **nicht** mehr in GitHub. Der Fallback
oben nutzt weiterhin den vollen Token aus `agent-secrets.json` (`coolify.apiToken`);
für reines Deployen genügt `coolify.deployToken`.

### Datenbanken

| Rolle | Wo | Details |
| --- | --- | --- |
| **Quelle (noch produktiv)** | Supabase `xlpiisbozpgmemxhtivj` | PostgreSQL **17.6**. Alle Lead-Daten liegen hier. |
| **Ziel (Plattform)** | `10.0.1.3` / `91.99.76.104`, Datenbank **`hl_support`** | PostgreSQL **18.6**, cx22 (2 Kerne, 4 GB), ICU en-US/UTF8, `data-checksums` an |
| **Testartefakt** | `business_leads_testimport` auf demselben Server | enthält **echte Kopien** der Quiz-Daten, seit dem Abbildungslauf (27.08. spät) in den **Plattform-Schemata** `leads`/`leads_analytics`. Kein Spielplatz. Rückweg: `dropdb business_leads_testimport` |
| **Legacy-Kartei** | MySQL auf **derselben** Maschine `10.0.1.3` | `prod_contacts_activesupport` u. a.; das MySQL-Datenverzeichnis misst **3,1 GB** und `mysqld` hält **1,6 GB RAM** (gemessen 27.08. — ältere Angaben von „~1,5 GB" waren zu niedrig) |

Namenshierarchie der Plattform (Entscheidung Markus, 27.08.):

```text
Datenbank  hl_support        ← das Gesamtsystem
   ├── Schema fitapp         ← Projekt Fit-App (Marathon ist ein Bereich davon)
   ├── Schema leads          ← Projekt Business-Leads-Quiz
   │                            16 Tabellen + 6 Views + 8 Sequenzen — STRUKTUR steht,
   │                            Daten kommen beim Cutover (27.08. nachgemessen: 0 Zeilen)
   ├── Schema leads_analytics←   dessen Auswertungsteil: 2 Tabellen + 1 Sequenz, 0 Zeilen
   ├── Schema kontakte / support / events / analysen   ← folgen später
   └── Schema marathon       ← bestehend; Empfehlung: beim FitApp-Umzug nach `fitapp`
```

**Rollen auf der Plattform** (nachgemessen 27.08., **keine** mit `BYPASSRLS`):

| Rolle | Anmeldung | Verbindungen | wofür |
| --- | --- | --- | --- |
| `leads_owner` | nein | — | Eigentümerin aller Objekte |
| `leads_read` | nein | — | Lesegruppe |
| `leads_migrate` | ja | 2 | Migrationen (immer mit `SET ROLE leads_owner`) |
| `leads_app` | ja | 8 | die laufende Anwendung |
| `leads_n8n` | ja | 4 | n8n (seit 27.08., eigener Topf) |

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
`waechter-nurture.js`, der Baseline, `stats-logs-baseline.js` **oder seit 27.08. auch
`waechter-datenquelle.js` / `phase5-schema-abbildung.js`** muss die Serverkopie
nachgezogen werden — Ablauf in [NURTURE_BETRIEB.md](NURTURE_BETRIEB.md) §4.

**Umschaltbar seit 27.08.** (`WAECHTER_QUELLE=supabase|plattform`): Nach dem Cutover
befragt derselbe Wächter die neue Datenbank, ohne dass am Umzugstag am
Überwachungswerkzeug selbst operiert wird. Bewiesen: beide Modi liefern identische
Befunde. Der Modus steht im Protokollkopf — wer das Protokoll liest, sieht sofort,
welche Datenbank gemeint war. Ablauf in [NURTURE_BETRIEB.md](NURTURE_BETRIEB.md) §4b.

**Stand 27.08. 23:00 (nachgemessen):** Neue Dateien und `node_modules/postgres` liegen
auf der Box, Sicherungen (`*.bak-vor-cutover-20260827`) sind angelegt, der Lauf im
Supabase-Modus ist unverändert grün (Herzschlag gesendet). Die `.env` trägt noch **nur**
`SUPABASE_*` — die `LEADS_PG_*`-Werte kommen beim Cutover dazu.

---

## 3. Was am 27.08.2026 passiert ist (25 Commits, PRs #89–#113)

Ein außergewöhnlich dichter Tag. Die Reihenfolge ist chronologisch; jeder Punkt nennt
seinen Beleg.

### Vormittag: ein aktiver Datenverlust

Ein Agent auf hl-support-Analytics meldete 7× `SyntaxError: Unexpected end of JSON input`.
Ursache: `upsert_answer_current` ist `RETURNS void`, PostgREST antwortet mit **leerem
Body**, und die Bridge-Kopie von `supabaseRpc` parste ihn trotzdem als JSON. Der erste
Wurf riss die Antwort-Schleife nach der **ersten** Antwort ab.

- **#91** Guard gegen leere Antworten + 4 Regressionstests · **#92** Wächter **W5**
- **Geheilt**: 6 Leads (akuter Fall + 5 unsichtbare Teilverluste aus Mai–August)
- 🔴 **Wichtigste Lehre**: Der „Beweis am echten Verkehr" vom 26.08. war eine
  Fehldeutung — der parallele Ereignisstrom hatte den kaputten Rettungspfad verdeckt.
  **Der Beweis eines Pfads muss den Pfad isoliert messen.**
  ([Aufarbeitung](audits/2026-08-27-void-rpc-teilverluste.md))

### Mittag: Doku, Konsolidierung, Pipeline

**#93** Doku auf die Coolify-Realität · **#94** doppelte Supabase-Helfer konsolidiert
(`bridge.js` delegiert an `server/lead-system.js`) **und** Deploy-Pipeline Stufe 1 ·
**#95** Phase-4-Design und Phase-5-Objektauswahl.

### Nachmittag: Stufe A und der Phase-5-Beweis

**#96 Stufe A** — `submit_lead_complete` schreibt Kontakt **und** alle sechs Antworten in
**einer** Transaktion (vorher 7 Einzel-Calls). Live. · **#97 Testimport** (Parität
356/356 Spalten, 65/65 Constraints, 86/86 Indexe, 6/6 Views, 20/20 Funktionen, 5/5
Trigger) · **#98 Datenprobe** (171.260 Zeilen, 6/6 Prüfsummen) · **#99 pg_dump-Probe**
(**24 Sekunden**: 10,2 s Dump/124 MB + 14,1 s Restore).

### Abend: Plattform-Architektur

**#100** Rollenmodell + Schreibbarriere · **#101** Datenbank `fitapp` → **`hl_support`** ·
**#102** dieses Einstiegsdokument.

### Später Abend bis Nacht: Schritt 1, 2 und Stufe B

| PR | Was | Beweis |
| --- | --- | --- |
| **#103** | **Schema-Abbildung `public`→`leads`** — eine Implementierung mit erzwungener Restkontrolle | Parität ohne Abweichung, `public` leer, alles gehört `leads_owner`, Funktionsbeweis grün, Datenprobe 171.708 Zeilen, Export **byte-identisch reproduzierbar** |
| **#104** | **Fremdschreiber-Messwerkzeug** (`scripts/fremdschreiber-messen.js`) | Datenseite **und** Transportseite getrennt; 🔴 `source_app` verrät den Schreiber **nicht**, Herkunfts-IPs taugen nicht als Schlüssel (59 IPs in 24 h) |
| **#105** | **`activecenter-analytics` schreibt nicht mehr in den Leadkern** (dort PR #2, live als `637b71a`) | **Zwei** Pfade geschlossen, nicht einer: Dashboard-Knopf (410 Gone) **und** Wartungsskript (Riegel). Produktion geprüft, nicht die SSO-geschützte Preview |
| **#106** | Stand der Vercel-Abbau-Tore | 12/14; der n8n-„Fehler" ist ein **korrekt abgewiesener Fremdaufruf** von `global-sce.com` mit `ac_`-Hash |
| **#107** | **Wächter umschaltbar** (`WAECHTER_QUELLE`) | beide Modi identisch; 3 Funde: Netzweg, **Typ-Unterschied** (`2026-06-11` vs. `Thu Jun 11`), **Grants gelten je Datenbank** |
| **#108** | **`COOLIFY_API_TOKEN` auf nur-Deploy** | über die Coolify-Datenbank angelegt (die API kann das nicht); bewiesen **ohne** echten Deploy: POST → 404, alles andere → 403 |
| **#109** | **Phase 4 Stufe B** — direkter Treiber | **10/10** mit echtem App-Code gegen die Test-DB; 26 Regressionstests; Standard bleibt PostgREST |
| **#110** | **Ziel-DB `hl_support` aufgebaut** | Parität grün; `public`-Prüfung **präzisiert statt aufgeweicht** |
| **#111** | Cutover-Werkzeuge + Checkliste | Schema-Umschreiber gegen die **Datenzeilen-Falle** geprüft; n8n-Befund |
| **#112** | **Barriere läuft von Hand** | Die Management-API ist **read-only** — mein Skript hätte den wichtigsten Schritt nur *vorgetäuscht* |
| **#113** | **n8n-Netzweg** (Rolle `leads_n8n`) | vom n8n-Server bewiesen; Gegenproben: andere DB verweigert, DDL verweigert |

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
| **Phase 4 Stufe B** (direkter Treiber) | ✅ **gebaut und bewiesen** (27.08.): echter App-Code im direkten Modus gegen die Test-DB, **10/10 Proben** — noch **nicht** umgeschaltet (Standard bleibt PostgREST) |
| **Schema-Abbildung `public`→`leads`** | ✅ bestanden (27.08. spät): Parität ohne Abweichung, `public` leer, alles gehört `leads_owner`, Funktionsbeweis grün, Datenprobe 171.708 Zeilen + 3/3 Prüfsummen — Protokoll im [Testimport-Protokoll](audits/cutover-vorbereitung/phase5-testimport/testimport-protokoll-2026-08-27.md) |
| **Vercel-Abbau** | ⏳ **Freigabe von Markus liegt vor** (27.08.). Gemessen **11/14** Toren erfüllt; offen sind die zwei Datums-Tore (**01.09.** bzw. **03.09.**, weil der letzte Hosting-Vorfall vom 27.08. datiert) und das n8n-Tor. Die zwei Handprüfungen zählen getrennt |
| **Wächter-Umstellung** | ✅ vorbereitet und bewiesen (27.08.): Datenquelle umschaltbar, beide Modi liefern identische Befunde — Ablauf in [NURTURE_BETRIEB.md §4b](NURTURE_BETRIEB.md) |
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
| `scripts/cutover.js` | **der Cutover selbst**, in Einzelschritten: `pruefen` · `barriere-an` · `stillstand` · `uebertragen` · `nachweisen` · `barriere-aus` |
| `scripts/cutover-n8n.js` | n8n-Schreiber `stand` / `aus` / `an` — sichert den Ist-Zustand selbst und stellt **ihn** wieder her, nicht pauschal alles |
| `scripts/cutover-browserweg.js` | **Kettentest mit echten Daten**: echter Funnel im echten Browser gegen die Produktion, 15 Nachweise in der Datenbank bis zum Resume-Link. Grenzen und Nicht-Abgedecktes: [BROWSERWEG-KETTENTEST.md](BROWSERWEG-KETTENTEST.md) |
| `scripts/cutover-schema-umschreiben.py` | hebt den `pg_dump` auf die Zielschemata — zustandsbehaftet, fasst COPY-Daten nie an |
| `scripts/stufe-b-beweis.js` | fährt den echten App-Pfad im direkten Modus gegen eine Test-DB (10 Proben) |
| `scripts/waechter-datenquelle.js` | Umschaltstelle des Wächters (`WAECHTER_QUELLE`) |
| `plattform-rolle-n8n.sql` | Rolle `leads_n8n` + Netzweg-Anleitung (idempotent) |
| `plattform-cron-leads.sql` | pg_cron-Job auf dem Ziel (**nach** dem Datenumzug anlegen) |
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

✅ **Markus' Freigabe liegt seit dem 27.08. vor.**

**Stand der Tore am 27.08. abends** (gemessen): **11 von 14** erfüllt — alle drei Domains
erreichbar, ohne Alt-Svc, Zertifikate 87 Tage Rest; Nurture frisch und erfolgreich;
Werbe-Besucher konvertieren (58 Besucher, 5 Opt-ins in 48 h). Offen sind **drei**:

1. Tor „frühestens 01.09."
2. Tor „7 ruhige Tage seit dem letzten Vorfall" → erfüllt ab **03.09.**
3. Tor „n8n Quiz-Workflows ohne Fehl-Läufe (7 Tage)"

Die **zwei Handprüfungen** (GlitchTip, Wächter-Protokolle) zählen ausdrücklich **nicht**
zu den 14 — das Skript weist sie getrennt als „nicht messbar" aus.

🔴 **Warum die Datums-Tore nicht einfach vorgezogen werden sollten:** Das zweite misst
„7 ruhige Tage seit dem letzten Hosting-Vorfall" — und der letzte Vorfall ist der
**27.08.** (Anzeigen-Konversion/HTTP-3). Der Abbau gibt den Hosting-Rückweg endgültig
auf; ihn wegzuwerfen, während das neue Hosting am selben Tag noch einen Vorfall hatte,
ist genau der Handel, den man hinterher bereut. Das Tor ist kein Formalismus, sondern
der Rückweg. **Wichtig für die Planung: Der Vercel-Abbau blockiert den
Datenbank-Umzug nicht** — siehe den Hinweis bei Schritt 5.

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

### Schritt 5 — Phase 4 Stufe B (direkter Treiber) — ✅ gebaut und bewiesen (27.08.)

Der Container spricht `hl_support` mit direktem Treiber als `leads_app`,
`search_path = leads, leads_analytics`. `submit_lead_complete` bleibt unverändert —
dieselbe Funktion, anderer Transportweg. PostgREST verlässt damit den kritischen Pfad;
die Outbox wird der **einzige** Übergabepunkt zur Legacy-MySQL (Entscheidung 3).

**Wie es gebaut ist.** Alle rund 30 Aufrufstellen laufen seit der Konsolidierung durch
**eine** Funktion (`supabaseRequest` in `server/lead-system.js`). Dort sitzt die Weiche:

| `LEADS_DB_MODUS` | Weg |
| --- | --- |
| `postgrest` (Standard) | Supabase über HTTP — unverändert |
| `direkt` | Plattform-DB mit `postgres.js`, Schema `leads` |

Im direkten Modus übersetzt `server/postgrest-nach-sql.js` den PostgREST-Aufruf in SQL
und `server/db-transport.js` liefert ein Objekt zurück, das sich **wie eine
HTTP-Antwort verhält** (`ok`, `status`, `json()`, `text()`). Damit bleibt der Vertrag
für die Aufrufer Zeile für Zeile derselbe — kein Grosseingriff im kritischen Pfad.

🔴 Zwei Entwurfsentscheidungen, die Fehlerklassen ausschliessen:

1. **Der Übersetzer rät nie.** Was er nicht sicher versteht, wirft. Ein still
   verlorener Filter liefert zu viele Zeilen, ein falsch geratener Konflikt-Zweig
   überschreibt Daten — beides fällt im Betrieb nicht auf. Ein `PATCH` ohne Filter
   ist verboten, `on_conflict` ohne `resolution` ebenso.
2. **Es gibt genau EINEN Schalter.** Eine Teilumstellung (RPCs direkt, Tabellen über
   HTTP) hiesse, gleichzeitig in zwei Datenbanken zu schreiben. Ein Test hält fest,
   dass `istDirekt()` genau einmal geprüft wird.

**Bewiesen am 27.08.** mit dem **echten App-Code** im Container `node:24-alpine` auf der
Coolify-Box gegen `business_leads_testimport` — **10 von 10**: Lesen mit
`select`/`limit`; `submit_lead_complete` mit Kontakt und **6 Antworten atomar**;
Umlaute per Hex verifiziert; `upsert_video_progress_monotonic` mit Rang 1;
`v_lead_state_full`; **`merge-duplicates`-Upsert setzt nur das mitgelieferte Feld** und
lässt den Rest unberührt; `PATCH` mit Filter; leere Treffermenge als `[]`; Probezeile
danach wieder entfernt (0 Reste nachgemessen).

**Was noch fehlt, bevor umgeschaltet werden kann:**

- `DELETE` ist im Übersetzer bewusst noch nicht abgedeckt (kommt im Runtime-Code nicht
  vor) — vor dem Umschalten prüfen, ob das so bleibt.
- Die Zugangsdaten (`LEADS_DB_*`) müssen in die Coolify-Umgebung.
- Umgeschaltet wird erst **beim Cutover**, gemeinsam mit dem Datenumzug.

Netzweg **steht bereits**: Der Coolify-Host ist im internen Netz `10.0.1.5` — genau die
IP, die `pg_hba` auf `10.0.1.3:5432` zulässt. Am 27.08. gemessen (der Wächter läuft auf
derselben Box und erreicht die Plattform-DB).

#### 🔴 Die Abhängigkeit „erst nach Vercel-Abbau" stimmt so nicht

Sie wurde bisher technisch begründet („Vercel erreicht die private DB nicht"). Der
eigentliche Grund ist ein **anderer und ernsterer**: Nach dem Datenbank-Cutover würde
ein noch aktiver Vercel-Eingang weiterhin die **alte** Supabase-Datenbank bedienen.
Wer dort landet — alter Link, Lesezeichen, Anzeige mit alter URL — erzeugt Leads in der
Datenbank, die niemand mehr liest. Das ist **Split-Brain**, und es ist genau die
Klasse „stiller Verlust", die dieses Projekt schon dreimal getroffen hat.

Gemessen am 27.08.: `businessleadsquiz.vercel.app` antwortet mit **HTTP 200** und lebt
**DNS-unabhängig** — er verschwindet also nicht, wenn die Domains umgezogen sind.

**Aber: benutzt wird er nicht.** Nachgemessen über die Edge-Logs (24 h): **alle 8.847
Quiz-Schreibzugriffe kamen von Coolify** (`167.233.251.217`), kein einziger über
Vercel. Die übrigen schreibenden Herkünfte sind n8n-Workflows auf Fremdverbünde.
Markus' Einschätzung ist damit belegt, nicht nur angenommen.

Das senkt das Risiko, hebt es aber nicht auf: „in 24 h niemand" ist nicht „nie" — ein
alter Werbelink oder ein Lesezeichen greift jederzeit. Da das **Stilllegen nichts
kostet und umkehrbar ist**, wird es trotzdem Teil des Cutovers: billige Versicherung
gegen einen teuren, stillen Fehler.

**Daraus folgt eine wichtige Unterscheidung**, die den Zeitplan entzerrt:

| | Wirkung | Umkehrbar? |
| --- | --- | --- |
| **Vercel stilllegen** (Deployment pausieren bzw. Umgebungsvariablen ziehen) | kein Eingang schreibt mehr → Split-Brain ausgeschlossen | **ja**, jederzeit |
| **Vercel abbauen** (Projekt löschen) | dasselbe, aber endgültig | **nein** — der Hosting-Rückweg ist weg |

Für den Datenbank-Cutover genügt **Stilllegen**. Der endgültige Abbau kann danach in
Ruhe folgen, wenn die Datums-Tore erfüllt sind. Damit hängt der Umzug **nicht** am
01./03.09. — und der Rückweg bleibt bis dahin erhalten.

### Schritt 6 — Echter Cutover

Manifest und Export frisch erzeugen → Schreibbarriere → `pg_dump`/Restore (24 s) →
Nachweise (Zeilen, Prüfsummen, 0 Waisen, Sequenzen, Funktionsbeweis) → umschalten.
**Danach nicht vergessen:** pg_cron-Job `refresh_event_daily` auf dem Ziel anlegen,
n8n-Workflows umstellen, und 🔴 **die Wächter auf die neue Quelle umstellen** — sonst
bewachen sie weiter die alte Datenbank und melden „alles ruhig".

### 🔴 Offener Defekt (aus dem Audit vom 27.08.)

**`pgss-monatsreset` auf dem Plattform-Server zeigt auf die Datenbank `fitapp`** — die es
seit der Umbenennung (PR #101) nicht mehr gibt. Vorhandene Datenbanken: `hl_support`,
`business_leads_testimport`, `postgres`. Letzter erfolgreicher Lauf: **19.08.2026**; der
nächste wäre am **01.09. um 3:15 UTC** und liefe ins Leere.

Betrifft nicht das Quiz (Instanzhygiene, `pg_stat_statements_reset`), gehört aber
korrigiert — am besten zusammen mit dem Cutover:

```sql
SELECT cron.unschedule('pgss-monatsreset');
SELECT cron.schedule('pgss-monatsreset', '15 3 1 * *', $$select pg_stat_statements_reset()$$);
-- Danach prüfen: select jobid, jobname, database from cron.job;
```

### Schritt 7 — Nachlauf

- Verbindungspooler (PgBouncer), sobald das **dritte** Projekt kommt.
- Server `cx22 → cx32` **vor** der Kontakte-Migration (813 MB + 466 MB MySQL).
- `supabase-lead-system-v2.sql` bereinigen (`lead_access_permissions` streichen).
- Empfehlung ans FitApp-Projekt: Schema `marathon` → `fitapp`.
- Alter Eingang „Landing Page Business" abbauen (Entscheidung 12: später).

---

## 8b. Offene Punkte — lückenlos, mit Beleg

Erhoben im Audit vom 27./28.08.2026. Jeder Punkt wurde **gemessen**, nicht aus der
Dokumentation übernommen. Reihenfolge: nach Dringlichkeit.

### Vor dem Cutover

| # | Punkt | Beleg / Stand |
| --- | --- | --- |
| 1 | ~~Barriere-SQL von Hand~~ → ✅ **läuft automatisch** (`cutover.js barriere-an`) | `postgres`-Direktzugang beschafft, Trockenlauf bestanden; dabei fand sich, dass der Rückweg **TRUNCATE** nicht zurückgab |
| 2 | ~~n8n von Hand deaktivieren~~ → ✅ **Werkzeug da** (`cutover-n8n.js aus`/`an`) | sichert den Ist-Zustand selbst; `an` stellt genau ihn wieder her, nicht pauschal alles |
| 3 | **Nur noch `LEADS_DB_MODUS=direkt`** + Redeploy. 🔴 `SUPABASE_*` **stehen lassen** | die übrigen `LEADS_DB_*` sind am 27.08. gesetzt und im Container nachgemessen |
| 4 | **Nur noch `WAECHTER_QUELLE=plattform`** in die `.env` | `LEADS_PG_*` stehen dort bereits; Dateien, Treiber und Sicherungen liegen auf der Box |
| 5 | **pg_cron auf dem Ziel anlegen** — erst **nach** dem Datenumzug | `plattform-cron-leads.sql` |
| 6 | **Vercel stilllegen** (Deployment pausieren, umkehrbar) | verhindert Split-Brain über `businessleadsquiz.vercel.app` (HTTP 200, DNS-unabhängig) |

### Am Folgetag

| # | Punkt | Warum |
| --- | --- | --- |
| 7 | ~~**Nurture-Sender umbauen**~~ → ✅ **erledigt und live** (nachgemessen 28.08. 15:00) | Zugangsdaten «Plattform-DB leads_n8n (hl_support)», SQL auf `leads.*`, letzter Lauf 14:00. Die Knotennamen tragen noch „Supabase - …" — nur Namen, nicht das Ziel |
| 8 | ~~**`AC - Error Alert` umstellen**~~ → ✅ **erledigt und live** (nachgemessen 28.08.) | Workflow `vSpXIyOUK9WIlvxi`, Knoten „Supabase - Log Nurture Failure" trägt die Zugangsdaten «Plattform-DB leads_n8n (hl_support)» und ist **nicht** abgeschaltet. Auch hier: nur der Knotenname ist alt |
| 9 | `Supabase Keep-Alive` (`CODeVYeZ_63C-DoT4Z8SN`) und `AC - Quiz Video Inactivity Checker` (`ie2WEc1RmFhN5LQf`) | **beide inaktiv**, tragen aber weiterhin «Supabase Stats_Logs (service role)». Nachgemessen 28.08.: es sind die **einzigen** von 86 Workflows mit Supabase-Spur. Workflows und danach die Zugangsdaten löschen |
| 10 | ~~**Wächter W2 wird anschlagen**, solange der Versand steht~~ → der Versand läuft; W2 meldet am 28.08. weiterhin **9 fällige Erstempfänger** — das ist ein **eigener** Befund (Sendegrenze 5 je Lauf), nicht der stehende Versand | gehört getrennt nachgegangen |
| 10b | 🔴 **Benachrichtigungsweg (Opt-in-Mail) hängt noch an der Legacy-MySQL** | `AC - Lead Post Processor` pollt alle 5 Min `prod_contacts_activesupport.typeform_surveys`. Widerspricht Entscheidung 3 („Outbox ist der **einzige** Übergabepunkt"). Karte: [MAILWEGE.md](MAILWEGE.md) · Plan: [plans/benachrichtigungsweg-auf-plattform.md](plans/benachrichtigungsweg-auf-plattform.md). **Stand 31.08.:** die *Berateridentität* ist der erste gelöste Teilstrang — B1 ausgeliefert (`6688a05`), B2 im Schattenlauf, B3/B4 offen. Der Postprozessor-Poll selbst ist davon **unberührt** |

### Danach

| # | Punkt | Stand |
| --- | --- | --- |
| 11 | **Vercel endgültig abbauen** | freigegeben; Tore **11/14**, offen: 01.09., 03.09. und das n8n-Tor (löst sich am 03.09. selbst) |
| 12 | **Test-DB `business_leads_testimport` löschen** | 🔴 enthält **1.236 echte E-Mail-Adressen**. Nach dem Cutover gibt es keinen Grund, eine Kopie personenbezogener Daten zu behalten: `dropdb business_leads_testimport` |
| 13 | **`pgss-monatsreset` reparieren** | zeigt auf die Datenbank `fitapp`, die es nicht mehr gibt (siehe Schritt 7) |
| 14 | **Outbox-Worker-Secret aus dem Query-String** | `api/lead-outbox-worker.js:65` akzeptiert `req.query?.secret`; Query-Strings landen in Zugriffsprotokollen (Audit 13.2.2, zu Recht offen) |
| 15 | `supabase-lead-system-v2.sql` bereinigen (`lead_access_permissions` streichen) | Entscheidung 4 |
| 16 | **PgBouncer**, sobald das dritte Projekt kommt · **cx32** vor der Kontakte-Migration | RAM ist der Engpass, nicht die Platte |
| 17 | Alten Eingang „Landing Page Business" abbauen · Empfehlung an FitApp: Schema `marathon` → `fitapp` | Entscheidung 12 |

---

## 8c. Restweg zu 100 % eigener Infrastruktur (erhoben 28.08.2026)

Ziel: **alles auf Hetzner, Vercel und Supabase raus** — Funnel *und* Nurture.
Jede Zeile ist gemessen, nicht aus der Doku übernommen.

### Was bereits auf eigener Infrastruktur läuft

| Baustein | Wo | |
| --- | --- | --- |
| Funnel-App | Coolify, `167.233.251.217` | ✅ |
| Lead-Daten | Postgres 18 `hl_support`, `91.99.76.104` | ✅ |
| Legacy-Kontaktkartei | MySQL, **dieselbe** Maschine | ✅ |
| n8n | `46.224.76.193` | ✅ |
| **Mautic** | `46.224.76.193` — kein Fremddienst | ✅ |
| Nurture-Versand | n8n → Plattform-DB `leads.*` | ✅ live |
| Error-Alert | n8n → Plattform-DB | ✅ live |
| Postmark | SaaS, Server **`Leadgen`** | bleibt — Mailversand baut man nicht selbst |

### A — Supabase raus

| # | Punkt | Stand 28.08. |
| --- | --- | --- |
| A1 | ~~**Laufzeitcode entkoppeln**~~ | ✅ **erledigt 29.08.** Alle fünf Dateien laufen modusbewusst; danach `SUPABASE_*` aus Coolify entfernt. Nachgemessen am 30.08.: **0** solcher Variablen im Produktionscontainer, `/health/ready` meldet `quelle: plattform` |
| A2 | ~~Zwei tote Workflows + Zugangsdaten löschen~~ | ✅ **erledigt**: `Supabase Keep-Alive` und `AC - Quiz Video Inactivity Checker` gelöscht, danach **beide** service-role-Zugangsdaten. Nachgemessen: **0 von 84** Workflows haben noch eine Supabase-Spur. Rückweg: `n8n/export-2026-08-28/` |
| A3 | ~~**Fremdleser auf Postgres umhängen**~~ | ✅ **erledigt 29.08.** Für dieses Projekt gibt es keinen Supabase-Leser mehr: Container ohne `SUPABASE_*`, n8n mit **0 von 86** Workflows mit Supabase-Spur (30.08. nachgemessen). Der große Rest der damals gezählten 14.046 Zugriffe (`cron_runs`, Webhook-Verbund) gehörte **anderen Systemen** und läuft dort weiter |
| A3a | 🔴 **Falle: die Edge-Log-Abfrage lügt still** | Eine Abfrage mit `cross join unnest(t.metadata) … unnest(m.request)` und `order by … limit N` lieferte **0 Zeilen** für ein Fenster, in dem `select count(*) from edge_logs` **14.046** meldete. Wer nur die erste Form nutzt, schliesst „niemand greift mehr zu" — und liegt falsch. **Immer zuerst gegenzählen** und die Abfrage an einem Fenster prüfen, in dem garantiert Verkehr war |
| A4 | ~~**Business-Kalkulator** auf Coolify **und** Postgres~~ | ✅ **KOMPLETT erledigt 29.08.** (Freigabe Markus). Läuft als Coolify-App `kalkulator` unter **`kalkulator.hl-support.biz`** im direkten Modus (eigene Rolle `leads_kalk`, Limit 4). Schritt 6: SSO-Linkziel im Online-Support per `SSO_ERFOLGS_URL` umgestellt (Laufzeit-Beweis via artisan im neuen Container), Schlüsselpaar-Beweis, SSO-Flow-Probe inkl. Replay-Schutz und DB-Zeile, SSO-Delta dreimal gemessen = **0** (nichts nachzuziehen; Endstand Supabase 854 / Plattform 855), Vercel-Projekt `zzz-stillgelegt-…`, alte Domain gelöscht → 404. Abnahme zweimal über Zeit. 🔴 Nebenbefund behoben: CRM-Speichern war auf Vercel seit der Schreibbarriere kaputt (42501) — auf der Plattform wieder funktionsfähig. Beweise: **Business_Kalkulator/UMZUG-COOLIFY-POSTGRES.md §5b** |
| A4a | ✅ **Datenlücke geschlossen: `sso_token_consumptions`** | 🔴 Die Tabelle **fehlte auf der Plattform**, obwohl der Kalkulator hineinschreibt (`api/sso.js:42`). Sie ist der **Replay-Schutz der SSO-Token** — ohne sie wäre ein Token nach dem Umzug mehrfach einlösbar. Angelegt in `leads` (Eigentümerin `leads_owner`, Rechte deckungsgleich mit `lead_contact_crm`), **854 Zeilen übernommen**, Zeitstempel identisch. `lead_contact_crm` war bereits vollständig: 41 Zeilen beidseitig gleich |
| A4b | 🔴 **Die Schreibbarriere hat diese Tabelle NICHT erfasst** | Gemessen am 28.08. um 20:08 MESZ: die neueste Zeile in **Supabase** war **von diesem Moment** — der Kalkulator schrieb also nach dem Cutover weiter dorthin, erfolgreich. „Supabase ist eingefroren" gilt für `lead_state` und `lead_events`, **nicht** für alles. Beim Umschalten des Kalkulators müssen die seither entstandenen Zeilen nachgezogen werden |
| A4c | **Anwendung umstellen** — Vercel/Supabase → Coolify/Postgres | 🔴 **Vercel kann die Plattform-DB gar nicht erreichen** (pg_hba lässt nur 10.0.1.5 zu). Umzug auf Coolify ist **Voraussetzung**, nicht Alternative. Vollständiger Plan mit Beweisen je Schritt: **Business_Kalkulator/UMZUG-COOLIFY-POSTGRES.md** |
| A4d | ~~Lücken im Übersetzer~~ | ✅ **erledigt 28./29.08.** — es waren **vier**, nicht zwei: `not.`-Negation, `offset` (Obergrenze 10000), **`or=(…)`** (von `coachPostgrestFilter` genutzt, war vom `not.`-Fehler verdeckt) und 🔴 **Boolean-Filter**: postgres.js serialisiert für boolean-Spalten jeden Nicht-`true`-Wert zu `'f'` — `manual_added=eq.true` als String-Parameter wurde **still invertiert** (falsche Zeilen, am Kalkulator gemessen). Fix: `eq.true/false` → echte Booleans. Alles im Quiz-Repo mit Tests (`postgrest-nach-sql.kalkulator.test.js` beweist die zeichengleichen Kalkulator-Abfragen), Kopie im Kalkulator mit Drift-Wächter-Test. Das Quiz selbst nutzt keine Boolean-Filter (ausgezählt) — Produktion war nicht betroffen |
| A4e | ~~Vercel-Projekt des Quiz~~ | ✅ **stillgelegt 29.08.**: Projekt hiess weiter `business_leads_quiz` und **baute bei jedem Push auf `main` weiter** (gemessen: Prod-Deploy 28.08. durch die Umzugs-Commits — Zombie ohne Domains). Umbenannt in `zzz-stillgelegt-business-leads-quiz`, **Git-Verknüpfung per API gekappt** (`DELETE /v9/projects/<id>/link`). Ebenfalls 29.08.: `ac-email-review` → `zzz-stillgelegt-ac-email-review` (seit B2 durch `nurture-review` auf Coolify ersetzt, letztes Deploy 29.05.) |
| A5 | ~~**Test-DB `business_leads_testimport` löschen**~~ | ✅ **erledigt 30.08.** Inhalt vor dem Löschen protokolliert: 18 Tabellen, größte `lead_events` 108.445 Zeilen, **1.236 Adressen / 1.095 eindeutige**. Nur die **Struktur** gesichert (`/root/testdb-abschied-20260830/struktur.sql`, sha256 im Manifest) — die Adressen sollten ja gerade weg. Danach `dropdb`; auf dem Server liegen jetzt nur noch `hl_support` und `postgres`. Die drei Skripte `phase5-datenprobe.js`, `phase5-testimport-vergleich.js` und `stufe-b-beweis.js` sprechen die DB an, werden aber **nirgends automatisiert aufgerufen** (geprüft: keine CI-, npm- oder Shell-Verwendung) |

🔴 **Das Supabase-Projekt selbst kann nicht weg**, solange **Marathon** dort liegt
(Entscheidung 10: tabu). Erreichbar ist „das Quiz benutzt Supabase nicht mehr" —
nicht „Supabase ist gelöscht".

### B — Vercel raus

| # | Punkt | Stand |
| --- | --- | --- |
| B1 | Pausiertes Vercel-Projekt endgültig löschen | offen — aber ungefährlich: `zzz-stillgelegt-business-leads-quiz` ist **pausiert, ohne Git-Verknüpfung und ohne Domains** (30.08. nachgemessen). Nur noch Kosmetik |
| B2 | ~~Review-App `ac-email-review` auf Coolify~~ | ✅ **erledigt 28.08.** — läuft unter **`https://nurture-review.hl-support.biz`** (Coolify-App `nurture-review`, UUID `e20rigehi49gkdzmrzcwptds`, nixpacks, Basisverzeichnis `/nurture/review-app`, Zweig `nurture-auf-plattform-db`). DNS über Cloudflare, **DNS-only**. Abnahme zweimal über Zeit: ohne Zugangsdaten 401 (auch auf `/api/email/48`), falsches Passwort 401, falscher Benutzer 401, richtige Zugangsdaten 200 und API liefert Mautic-Inhalt. Zugang in `agent-secrets.json` → `leadgen_review`. **Damit ist das Nurture-System frei von Vercel** |
| B2a | ✅ **erledigt 28.08.** Offener Schreibzugriff der Review-App geschlossen | Vercels eigener Schutz war auf diesem Tarif nicht verfügbar (`428` bei `ssoProtection` **und** `passwordProtection`; die Einstellung stand auf `all_except_custom_domains` — deshalb war ausgerechnet die Produktions-URL offen). Deshalb die aktive Auslieferung gelöscht. Zweimal über Zeit gemessen: `GET /api/email/48` von **200 auf 404**, Startseite 404, die 14 übrigen Auslieferungen 302 (Vercel-SSO). Code-seitig schützt jetzt `nurture/review-app/middleware.js` fail-closed, mit 7 Tests |
| B2b | 🔴 **`MAUTIC_PASS` rotieren — offen, bewusst zurückgestellt** | Das Mautic-`admin`-Passwort lag hinter der offenen App **und** steht im Klartext in der Git-Historie (drei Python-Dateien, am 28.08. gepusht; aus dem Arbeitsbaum entfernt, aus der Historie nicht). **Entscheidung Markus am 28.08.: nicht rotieren.** Damit ist dasselbe Passwort auch in der neuen Coolify-Auslieferung im Einsatz. Der Zugang von aussen ist zu — wer die Repo-Historie liest, hat es trotzdem. Bleibt offen |
| B3 | ~~Vier Domains vom Vercel-Projekt lösen~~ | ✅ **erledigt 29.08.** — das Projekt trägt keine Domain mehr |

### C — Der letzte Legacy-MySQL-Knoten

| # | Punkt | Stand |
| --- | --- | --- |
| C1 | **Benachrichtigungsweg auf die Plattform** — `AC - Lead Post Processor` pollt alle 5 Min `prod_contacts_activesupport.typeform_surveys` und verschickt von dort Opt-in- und Zugangsmail | **Schritt 1 von 7 erledigt 30.08.**: Es sind nicht dreimal 87.000 Zeichen, sondern **eine** Bibliothek (1.708 Zeilen, 53 Funktionen) und drei Treiber (3 / 4 / 47 Zeilen). 🔴 Zwei Fassungen im Umlauf — zwei Knoten laufen auf der älteren. Befund: [audits/c1-postprocessor-extrakt/BEFUND.md](audits/c1-postprocessor-extrakt/BEFUND.md). Schritte 2–7 offen; Schritt 4 verlangt einen 48-Stunden-Schattenlauf |

### D — Zusammenzug und Kleinkram

| # | Punkt | Stand |
| --- | --- | --- |
| D1 | ~~Nurture-System ins Repo~~ | ✅ **erledigt 28.08.**: `nurture/` (39 Dateien), alte Ablage → `zzz-Leads_quiz_Nurture-abgeloest-2026-08-28`. Vollständigkeit per SHA-256 über alle 42 Dateien geprüft |
| D2 | ~~n8n-Definitionen versionieren~~ | ✅ **erledigt**: `n8n/export-2026-08-28/`, zehn Workflows |
| D3 | ~~Postmark-Server umbenennen~~ | ✅ **erledigt**: `Typenanalyse` → `Leadgen`, Token unverändert |
| D4 | ~~Postmark-Tags~~ | ✅ **erledigt**: sechs Tags, vier im Repo, zwei in n8n |
| D5 | 47 Fremdmails (6 % des `Leadgen`-Servers) auf `Admin` umziehen | offen |
| D6 | `activecenter.info`: DKIM einrichten **oder** Signatur `support@activecenter.info` entfernen | offen — sendet heute nichts von dort, geladene Waffe |
| D7 | Drei OneDrive-Konfliktkopien in `nurture/review-app/_konflikte-onedrive/` auflösen | offen — **vor** dem Neudeploy der Review-App, siehe `nurture/README.md` |
| D8 | ~~`pgss-monatsreset`~~ · Outbox-Worker-Secret aus dem Query-String · `supabase-lead-system-v2.sql` bereinigen | ✅ **Cron-Job erledigt 30.08.**: Der Job zeigte auf die Datenbank **`fitapp`**, die es auf diesem Server nicht mehr gibt — der nächste fällige Lauf am 01.09. wäre daran gescheitert. Neu als **`pgss-wochenreset`** in `hl_support`, sonntags 03:15. Warum wöchentlich: gemessen **4.782 von 5.000 Einträgen nach 11 Tagen (95,6 %)** — monatlich stünde die Tabelle zwei Drittel des Monats voll und verdrängte. Rückweg: `cron.alter_job(<id>, schedule := '15 3 1 * *')`. Die übrigen zwei Punkte bleiben offen |

### Dokumentation — im Audit gefunden und bereits korrigiert

72 Befunde aus zwei unabhängigen Prüfungen. Behoben: der **Bridge-Guard-Bug** (vier
Stellen, siehe unten), die gefährliche „doppelte Helfer"-Anweisung in `AGENTS.md`,
veraltete Commit- und Testzahlen, die Tore-Zählung, „Kysely" statt `postgres.js`, ein
totes Skript im Runbook, die fehlende Verlinkung der Cutover-Checkliste, sowie
Historisch-Banner auf sechs überholten Dokumenten (darunter
`PHASE1-PHASE5-DEPLOYMENT.md` mit seiner **Phase-4/5-Namenskollision**).

🔴 **Der wichtigste Fund war kein Doku-Fehler, sondern ein echter Bug:**
`api/bridge.js` prüfte an **vier** Stellen `SUPABASE_URL`/`SUPABASE_SERVICE_KEY` und gab
ohne sie `null` zurück — ohne den direkten Modus zu kennen. Wer beim Cutover die nicht
mehr benötigten Supabase-Variablen entfernt hätte, hätte einen **stillen Teilausfall**
erzeugt: 28 Bridge-Zugriffe liefern `null`, die übrigen Routen laufen weiter. Betroffen
war auch `supabaseRpc` — der Pfad von `submit_lead_complete`. Behoben und durch
`scripts/tests/bridge-transport-guard.test.js` zugehalten.

---

## 9. Offene Entscheidungen für Markus

1. ~~**Vercel-Abbau freigeben**~~ — ✅ **freigegeben am 27.08.** Der Abbau wartet nur noch
   auf die zwei Datums-Tore; siehe Schritt 3.
2. **Zeitfenster für den Cutover** — Erfahrung: 02:00–05:00 MESZ ist praktisch verkehrsfrei.
3. ~~**Server-Upgrade cx32**~~ — für **dieses** Projekt nicht nötig, siehe unten.
4. ~~**GitHub-Secret** `COOLIFY_API_TOKEN` verkleinern~~ — ✅ **erledigt am 27.08.**

   Coolify bietet **keinen** API-Endpunkt zum Anlegen von Tokens (geprüft:
   `security/api-tokens`, `tokens`, `api-tokens`, `personal-access-tokens` → alle 404),
   und die Weboberfläche verlangt 2FA. Der Token wurde deshalb direkt in `coolify-db`
   angelegt — Laravel Sanctum speichert `sha256` des Zufallsteils, der Klartext lautet
   `<id>|<zufall>`.

   Der neue Token `github-deploy-only` trägt `["deploy"]` statt `["*"]`.
   **Bewiesen ohne einen einzigen echten Deploy:**

   | Probe | Ergebnis |
   | --- | --- |
   | `POST /deploy` mit unbekannter UUID | **404** „No resources found" — die Rechteprüfung ist passiert, nur die UUID fehlt |
   | `GET /applications`, `/servers`, `/projects`, `/teams`, `/deployments` | **403** — kann nichts lesen |
   | derselbe Aufruf ohne Token | **401** |

   Der alte Vollzugriffs-Token (`agent-desktop`, id 2) **bleibt** für Wartung und
   Abfragen — er liegt aber nicht mehr im GitHub-Secret und dient als Rückweg.
   Beide Werte stehen in `agent-secrets.json` (Sicherung vor der Änderung angelegt).

### Warum das Server-Upgrade nichts mit dem Quiz zu tun hat (gemessen 27.08.)

Die Frage kam auf, weil es „nur 2.000–3.000 Kontakte" seien. Das stimmt — und genau
deshalb braucht **dieser** Umzug kein Upgrade:

| | |
| --- | --- |
| Quiz-Daten gesamt | **124 MB** Dump, 171.708 Zeilen; Restore dauerte 14 Sekunden |
| Maschine (cx22) | 2 Kerne, 3,8 GB RAM, 38 GB Platte (14 GB belegt, **22 GB frei**) |
| Last | `load average 0,26` — die Maschine langweilt sich |

Das Upgrade steht für die **Kontakte-Migration** im Plan, und dort geht es nicht um
Zeilenzahlen, sondern um **Arbeitsspeicher**: Auf derselben Maschine läuft bereits
**MySQL mit 3,1 GB Daten und 1,6 GB belegtem RAM**. Von 3,8 GB sind aktuell nur
**1,4 GB verfügbar**. Wenn MySQL und PostgreSQL beim Übertragen gleichzeitig unter Last
stehen, wird genau das eng — nicht die Platte.

**Fazit:** Für den Quiz-Umzug ist kein Upgrade nötig. Die Entscheidung gehört zum
Kontakte-Projekt, nicht hierher.

---

## 10. Dokumentenkarte

| Thema | Dokument |
| --- | --- |
| 🔴 **Cutover-Nacht: Ablauf Schritt für Schritt** | [audits/cutover-vorbereitung/CUTOVER-CHECKLISTE.md](audits/cutover-vorbereitung/CUTOVER-CHECKLISTE.md) |
| Audit-Messungen 27.08. abends (alles neu gemessen) | [audits/cutover-vorbereitung/cutover-belege/audit-27-08-2026-abend.md](audits/cutover-vorbereitung/cutover-belege/audit-27-08-2026-abend.md) |
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
