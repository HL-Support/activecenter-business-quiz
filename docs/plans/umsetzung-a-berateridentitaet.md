# Umsetzungsplan Strang A — Berateridentität direkt aus MySQL

**Aufgestellt am 31.08.2026 (MESZ).** Arbeitet Strang A aus
[bridge-abloesen-direktzugriff.md](bridge-abloesen-direktzugriff.md) (§6) aus; Grundlage
ausserdem [benachrichtigungsweg-auf-plattform.md](benachrichtigungsweg-auf-plattform.md)
(B-Reihe, §4b, B2a).

> **Es ist nichts geändert worden. Dieses Dokument ist ausschliesslich Plan.**
> Alle Zeilennummern und Befunde sind am 31.08.2026 am Quelltext bzw. an den am selben Tag
> gemessenen Fakten der beiden Grundlagenpläne belegt. Was nur vermutet ist, steht als
> **offen** gekennzeichnet — mit dem Prüfweg.

**Harte Regeln, die überall in diesem Plan gelten:**

- 🔴 `db-bridge.php` wird nicht angefasst — sie bedient 15 weitere Projekte.
- 🔴 Niemals zwei Änderungen gleichzeitig auf demselben Pfad.
- 🔴 R0: keine Eile; eine einzelne Messung ist kein Beweis — mehrfach über Zeit messen;
  Zustände aus echten Daten herleiten, nicht behaupten.
- 🔴 A3 löst B3/B4 der B-Reihe ab; **nie beide gleichzeitig** (Übergabe in §7).

---

## 1. Ist-Zustand: die vier Lesestellen und ihre Verbraucher

Alle vier holen dieselbe Information über HTTP von `db-bridge.php`
(Aktion `lookup_subdomain`, liest `prod_activesupport.users` ⋈ `organizations`):

| # | Stelle | Datei:Zeile | Wann | Zeitbudget heute |
| --- | --- | --- | --- | --- |
| **S1** | Funnel-Lookup | `api/bridge.js:428` `resolveConsultantLookup` (Handler `:3734`; Browser `src/lib/core.js:829`) | **jeder Seitenaufruf** | 8 s + Retry 1,5 s + 8 s = bis ~17,5 s (`proxyToBridge`, `api/bridge.js:2197`) |
| **S2** | Submit-Identität | `api/bridge.js:2237` `ensureBusinessSubmissionIdentity` | nur Submit **ohne** `member_id` | dito |
| **S3** | Abschluss-Benachrichtigung (Legacy) | `api/bridge.js:3100` `loadCompletionNotificationContext` | `notify_all_videos_completed`, nur wenn **kein** kanonischer Lead (`canonical_outbox_handles_hot_lead`, `:3860-3868`) | dito |
| **S4** | Hot-Lead-Mail | `api/lead-outbox-worker.js:683` `lookupCoachUeberBridge` | jede Hot-Lead-Mail — **teuerster Vorgang** | kein eigenes Zeitlimit im Fetch |

S4 hat bereits den Schalter `COACH_LOOKUP_SOURCE` (`bridge`&nbsp;|&nbsp;`beide`&nbsp;|&nbsp;`verzeichnis`,
Standard `bridge`; `api/lead-outbox-worker.js:39-41, 696-732`) und das Verzeichnis-Modul
`server/berater-verzeichnis.js` mit `vergleiche()` und `EFFEKTIVER_WERT`. **Stand heute:
`COACH_LOOKUP_SOURCE=beide` läuft in Produktion** (B2-Schattenlauf, seit 30.08. 20:39 MESZ).

### 1a. Die Antwortform der Bridge (Referenzverhalten, nachzubauen)

Aus `landing-page/_system/db-bridge.php:1199-1443` (nur lesen, Spiegel des laufenden
Endpunkts — am 31.08. gegen den echten Endpunkt geprüft, siehe B2a):

- Selektiert `o.org_name AS organisation_name` (`:1237`) — **nicht** `o.name`.
- Land **ausschliesslich verschachtelt** als `address.country` (`:1431-1436`);
  ein flaches `country` gibt es in der Antwort nicht.
- Filter: `deleted_at IS NULL AND is_active = 1` (`:1252-1253`); **kein** Filter auf
  `organizations.deleted_at` (der LEFT JOIN `:1239` hat keine Bedingung dazu — Abweichung
  zum Umfragen-Vorbild, siehe §4).
- Slug-Treffer auf `u.sub_domain` **oder** — falls die Spalte existiert — `u.domain`
  (`:1242-1249`, dynamisch geprüft). 🟡 **Offen:** ob `users.domain` existiert und ob je
  ein Quiz-Slug nur darüber trifft (Prüfung in A0).
- **Kontakt-Rückfall** (`:1267-1301`): trifft der Slug keinen Benutzer, wird
  `contacts.id = slug` versucht und dessen Coach geliefert (`source: 'contact'`).
  Messung 30.08.: 95 von 96 Quiz-Slugs stehen in `users`, der Rest ist `default` (ohne
  Satz) — der Rückfall ist im Quiz **nie belegt**. A4 misst das scharf (§6, A4).
- `full_name`: fällt leer auf `first_name + ' ' + last_name` zurück (`:1400`).
- `phone`: aus `area_code` + `phone_number` **formatiert** zusammengesetzt
  (`:1354-1397`; `0049`→`+49`, führende 0 weg, länderspezifische Leerzeichen).
- Ausserdem geliefert: `marketing_status`/`level_*` (aus optionalen Spalten,
  `:1303-1352`), `organisation_id`, `id`, Avatare aus `u.meta`
  (`JSON_EXTRACT '$.avatars[1..3]'`, `:1234-1236`), `image`, `instagram`, `facebook`.

### 1b. Was die Verbraucher tatsächlich lesen (Herleitung der Spaltenliste)

| Feld (Bridge-Form) | Verbraucher, belegt |
| --- | --- |
| `herbalife_id` / `member_id` | S1-Gate `core.js:898`, `normalizeCoach` `core.js:860`, `recoverCoachMemberId` `core.js:844`; S2 `bridge.js:2250` (**einziges** Pflichtfeld von S2) |
| `email` | S3 `bridge.js:3046,3889,3939`; S4 `lead-outbox-worker.js:863,896,951,964`; S1 `core.js:865` |
| `first_name` (S4 auch `name`) | S3 `bridge.js:3013`; S4 `:784`; S1 `core.js:863`, WhatsApp `App.jsx:1244,1515` |
| `last_name`, `full_name` | S1 `core.js:862`; `full_name`-Rückfall baut die Bridge (`db-bridge.php:1400`) |
| `organisation_name` → `org_name` → `company` | S3 `bridge.js:3014`; S4 `:786` (**Markenname jeder Hot-Lead-Mail**); S1 `getBrandName` `core.js:801-805` |
| `address.country` → `country` | `detectCoachLanguage` — S3 `bridge.js:2790`, S4 `:444` |
| `preferred_newsletter_language` → `preferred_language` → `language`/`lang`/`locale` | S3 `bridge.js:2818-2823`; S4 `:462-466`; S1 `core.js:866-867` |
| `sub_domain` | `detectCoachLanguage` S3 `bridge.js:2798` (Slug-Override) |
| `phone` | S1: WhatsApp-Links `App.jsx:1243-1246, 1513-1517` — beide Leser **strippen Nicht-Ziffern** (`replace(/\D/g,'')`); wirksam sind allein die Ziffern samt Landesvorwahl |
| `avatar_300/600`, `address`, `instagram`, `facebook`, `image` | S1 `normalizeCoach` `core.js:868-872` — **gespeichert** (`acCoach`), aber kein weiterer Leser im Quelltext (grep über `src/` am 31.08.: keine Treffer ausserhalb `normalizeCoach`) |
| `marketing_status`, `level_*`, `organisation_id`, `match`, `ref_id`, `source` | **kein Leser** im Quiz (grep `src/` + `api/`-Verbraucherstellen am 31.08.); `member_id`/`ref_id`/`match` werden in `resolveConsultantLookup` `bridge.js:435-444` aus `herbalife_id` **berechnet** und lassen sich ohne Bridge reproduzieren |

**Folgerung:** Die View braucht die belegten Felder plus die Rohteile, aus denen der
Auflöser die Bridge-Form zusammensetzt (`area_code`+`phone_number` statt `phone`;
Adressteile statt `address`-Objekt). `marketing_*` und `organisation_id` werden **bewusst
nicht** nachgebaut (kein Leser). 🔴 **Keine `coach_uuid`** — das ist bei Umfragen ein
Gutschein-**Schlüssel** (`Umfragen/sql/views.sql:71-95`), den das Quiz nicht braucht;
wer die View später öffnet, darf diesen Fehler nicht erben.

### 1c. 🔴 Vollständige Inventur: der dritte Legacy-Weg (Rangschreibweg — NICHT Teil von Strang A)

Neben den vier Lesestellen und `forward_webhook` (Strang B) gibt es einen **dritten**
Legacy-Verkehr, der nicht über die Bridge läuft — vom Koordinator am 31.08.2026 am
laufenden System nachgemessen:

```text
Quiz → leads.lead_sync_outbox (Auftragsarten mysql_initial_rank / mysql_rank_update,
       api/lead-outbox-worker.js:50)
     → HTTP POST an N8N_UPDATE_RESULT_URL
       = https://n8n.hl-support.biz/webhook/update_result_by_hash
       (api/lead-outbox-worker.js:653)
     → n8n-Workflow 7Xg6NsE5H3UWgSNc «Update "Result" by hash» (AKTIV)
     → UPDATE typeform_surveys SET points_rank = …, points_result = … WHERE hash = …
```

Mengen (31.08., Outbox): `mysql_rank_update` 1.352 erledigt, `mysql_initial_rank` 909
erledigt (plus 1 seit 19.05. hängender Auftrag), `coach_hot_lead_email` 250 — alle mit
letztem Eintrag von heute. **Das Quiz schreibt also nicht direkt nach MySQL, aber es
verursacht Schreibvorgänge in der Legacy-Kartei — über n8n als Zwischenstück.**
Das deckt sich mit AGENTS.md: „MySQL `points_result` ist nur Kopie via Outbox".

Konsequenzen für diesen Plan:

1. Der Rechte-Entwurf in §4 bleibt **SELECT-only auf die eine View** — ausdrücklich
   **weil der Schreibweg bewusst nicht mitgezogen wird**. Er läuft unverändert über n8n
   weiter; Strang A ändert an ihm nichts.
2. **Ausblick (eigene Entscheidung, kein Anhängsel von A):** Soll der Rangschreibweg
   später direkt gehen (Quiz → MySQL statt Quiz → n8n → MySQL), bräuchte der Benutzer
   `quiz` zusätzlich `UPDATE` auf `prod_contacts_activesupport.typeform_surveys`. Das
   wäre das **erste Schreibrecht der App in die Legacy-Kartei**: Es entfiele ein
   Zwischenstück samt Webhook-Geheimnis, und die Outbox bliebe der Wiederholungsweg —
   dafür könnte ein Fehler der App erstmals fremde Daten verfälschen, und die heutige
   Idempotenz-/Prüf­logik des n8n-Workflows müsste nachweislich gleichwertig portiert
   werden. Eigener Strang mit eigenem Schattenlauf; hier keine Empfehlung.

---

> ### ✅ Stand 31.08.2026: A1 und A2 sind erledigt
>
> | Schritt | Beweis |
> | --- | --- |
> | **A1** | `prod_quiz.quiz_berater` angelegt, **255 Zeilen**. `SHOW GRANTS` fuer `quiz@10.0.1.5`: genau `USAGE` + `SELECT` auf die View. Der DDL-Zugang war vorhanden — der Schluessel ist passphrasengeschuetzt und scheitert mit `BatchMode` **stumm**; mit der Passphrase aus `agent-secrets` im `ssh-agent` traegt er sofort. Verfahren in `sql/legacy-views.sql` |
> | **A2** | PR **#124** gemergt, Produktion `707ab58` dreimal ueber Zeit geprueft, `/health/ready` gruen. **25 zufaellige Berater Feld fuer Feld gegen die echte Bridge: 25 zeichengleich, 0 Abweichungen** |
>
> Zwei Nachtraege gegenueber der urspruenglichen Planung:
> - `organisation_id` wird von der Bridge durchgereicht; die View wurde um
>   `u.organization_id` ergaenzt, damit die Feldmenge identisch bleibt.
> - Die laenderspezifische **Telefonformatierung** ist doch vollstaendig nachgebaut (nicht
>   nur die Ziffern-Normalisierung). Exakte Gleichheit war billiger als ein offener Punkt.
>
> Offene Punkte 1 und 3 aus §9 sind damit erledigt: Der DDL-Zugang ist geklaert, und
> `users.domain` **existiert nicht** — ein zweiter Slug-Treffer entfaellt.

## 2. Zielbild

> ### 🟢 Bestätigt am 31.08.2026 (Markus): Slug — und sonst nichts
>
> *„Es muss ja über den Slug gehen. Wenn jemand auf die Homepage kommt, übergibt er nur den
> Slug, nichts anderes. Der Slug sucht dann in der MySQL-Tabelle unter `sub_domain` bei
> `users` die Beraterdaten. Dann hat die Seite die Beraterdaten."*
>
> Die Auflösung in diesem Strang ist damit **bewusst einstufig**. Die dreistufige Kaskade
> des Post Processors (Kontakt-Historie → E-Mail-Treffer → Slug) wird hier **nicht**
> nachgebaut — sie gehört nicht in die Anzeige.
>
> 🔴 **Sie verschwindet aber nicht**, sondern zieht dorthin, wo sie hingehört: in die
> **Übergabe**. Beim Senden läuft weiterhin die volle Doppelvergabe-Kontrolle
> (beraterübergreifende Suche, drei Fälle, 4-Monats-Bestellfrist, Abo-Umleitung), und dabei
> **kann sich der Berater ändern**. Das ist gewollt und bleibt vollständig erhalten — siehe
> [umsetzung-b-lead-uebergabe.md §4a](umsetzung-b-lead-uebergabe.md).
>
> **Für Strang A folgt daraus nichts** ausser der Bestätigung, dass die schmale View
> genügt: Sie muss nur den Slug auflösen können, nicht Kontakte zuordnen.

```text
                       ┌──────────── server/berater-aufloeser.js ────────────┐
 S1 Funnel ──────────► │  EIN Auflöser, Quelle per Schalter:                 │
 S2 Submit ──────────► │   bridge (Standard) | verzeichnis | mysql           │
 S3 Abschluss ───────► │  + Schatten (asynchron, entscheidet nie):           │
 S4 Hot-Lead-Mail ───► │   aus | verzeichnis | mysql                        │
                       └───────┬──────────────┬──────────────┬──────────────┘
                               │ bridge       │ mysql        │ Rückfall
                               ▼              ▼              ▼
                        db-bridge.php   legacy/ ──► View    leads.berater
                        (bis A5)        prod_quiz.quiz_berater   (Spiegel, 15 min)
                                        auf 10.0.1.3:3306
                    Abweichungen des Schattens ──► leads.berater_vergleich (haltbar)
```

- **`legacy/` ist die einzige Tür nach draussen** (MySQL-Treiber, IP, Zugangsdaten);
  ein Grenz-Linter erzwingt das (§5, A2).
- Der Auflöser liefert an allen vier Stellen **die Bridge-Form** (verschachteltes
  `address`, `organisation_name`, berechnete `member_id`/`ref_id`/`match`), damit kein
  Verbraucher angefasst werden muss.
- Rückfallkette bei Quelle `mysql`: **mysql → verzeichnis** (Begründung §8).

---

## 3. Der Auflöser im Einzelnen

### 3.1 Schalter

| Variable | Werte | Bedeutung |
| --- | --- | --- |
| `COACH_LOOKUP_SOURCE` | `bridge` (Standard) \| `verzeichnis` \| `mysql` | **wer entscheidet** — global |
| `COACH_LOOKUP_SCHATTEN` | `aus` (Standard) \| `verzeichnis` \| `mysql` | wer **zusätzlich gemessen** wird; entscheidet nie |
| `COACH_LOOKUP_SOURCE_FUNNEL` / `_SUBMIT` / `_ABSCHLUSS` / `_MAIL` | wie `COACH_LOOKUP_SOURCE`, optional | Stellen-Übersteuerung — macht A5 je Stelle schaltbar, jede Umschaltung ist **eine** Änderung auf **einem** Pfad |

**Abwärtskompatibilität (Pflicht):** Der heute produktive Wert `beide` wird weiter
angenommen und intern als `SOURCE=bridge` + `SCHATTEN=verzeichnis` gedeutet — der
laufende B2-Schattenlauf bricht durch das Deploy von A3 nicht ab, und ein Deploy ohne
gesetzte Variablen ändert **nichts** (Standard `bridge`/`aus`, dieselbe Vorsicht wie
beim Bau des Worker-Schalters am 30.08.).

### 3.2 Die Lehre aus B2a: der Schatten schreibt haltbar

Der B2-Vergleich lebte nur im Containerprotokoll (`console.warn`) — **ein Deploy ersetzt
den Container und löscht das Protokoll**; das B2-Fenster überlebt keinen Zwischendeploy
(B2a, Nebenbefund). Deshalb schreibt der Schatten zusätzlich in eine Tabelle:

**`leads.berater_vergleich`** — aggregiert je Tag, nicht je Aufruf (S1 läuft bei jedem
Seitenaufruf; je-Aufruf-Zeilen wären unbegrenzt, das Aggregat ist durch
Slugs × Stellen × Tage begrenzt, Grössenordnung ≤ ein paar hundert Zeilen/Tag):

```sql
-- Plattform-Postgres (hl_support), Eigentümerin leads_owner — wie leads.berater.
CREATE TABLE IF NOT EXISTS leads.berater_vergleich (
  tag            date        NOT NULL,
  aufrufstelle   text        NOT NULL,  -- 'funnel' | 'submit' | 'abschluss' | 'mail'
  slug           text        NOT NULL,
  schatten       text        NOT NULL,  -- 'verzeichnis' | 'mysql'
  abweichungen   text        NOT NULL,  -- kommagetrennt, '' = deckungsgleich
  zaehler        integer     NOT NULL DEFAULT 1,
  zuerst_um      timestamptz NOT NULL DEFAULT now(),
  zuletzt_um     timestamptz NOT NULL DEFAULT now(),
  beispiel       jsonb,                 -- nur bei Abweichung: effektive Werte beider Seiten
  PRIMARY KEY (tag, aufrufstelle, slug, schatten, abweichungen)
);

CREATE OR REPLACE FUNCTION leads.berater_vergleich_zaehlen(
  p_aufrufstelle text, p_slug text, p_schatten text,
  p_abweichungen text, p_beispiel jsonb
) RETURNS void LANGUAGE sql AS $$
  INSERT INTO leads.berater_vergleich
    (tag, aufrufstelle, slug, schatten, abweichungen, beispiel)
  VALUES (current_date, p_aufrufstelle, p_slug, p_schatten, p_abweichungen, p_beispiel)
  ON CONFLICT (tag, aufrufstelle, slug, schatten, abweichungen) DO UPDATE
    SET zaehler   = leads.berater_vergleich.zaehler + 1,
        zuletzt_um = now(),
        beispiel   = COALESCE(EXCLUDED.beispiel, leads.berater_vergleich.beispiel);
$$;

GRANT SELECT, INSERT, UPDATE ON leads.berater_vergleich TO leads_app;
GRANT EXECUTE ON FUNCTION leads.berater_vergleich_zaehlen(text,text,text,text,jsonb) TO leads_app;
```

🟡 **Offen:** ob `ALTER DEFAULT PRIVILEGES` von `leads_owner` die GRANTs für `leads_app`
schon abdeckt (für `leads_n8n` ist es belegt, `plattform-rolle-n8n.sql:48-53`; für
`leads_app` per `\dp leads.berater_vergleich` nach dem Anlegen prüfen — die expliziten
GRANTs oben schaden auch dann nicht).

Regeln für den Schatten (aus dem B2-Bau übernommen und verschärft):

- Er läuft **asynchron neben der Antwort** (nicht `await` im Antwortpfad) und ist
  komplett in ein `try/catch` gekapselt — *ein Protokoll ist nie ein Datenpfad*.
- Aufruf über den vorhandenen `supabaseRpc`-Weg (`server/lead-system.js`), damit der
  `LEADS_DB_MODUS`-Transportschalter respektiert bleibt (AGENTS.md-Falle: Guards müssen
  `dbTransport.istDirekt()` berücksichtigen).
- Verglichen werden die **effektiven** Werte über `EFFEKTIVER_WERT`
  (`server/berater-verzeichnis.js:102-107`) — die Lehre aus dem `country`-Fehlalarm.
  Für `phone` kommt eine effektive Abbildung **dazu**: verglichen werden die Ziffern
  (`replace(/\D/g,'')`), denn nur die lesen die WhatsApp-Links (§1b) — die
  PHP-Leerzeichenformatierung wird bewusst nicht nachgebaut.
- Zusätzlich bleibt die `console.warn`-Zeile bestehen (schnelle Sicht im Log).

### 3.3 MySQL-Pool (in `legacy/datenbank.js`, portiert aus `analysen/legacy/datenbank.js`)

| Eckwert | Wert | Warum |
| --- | --- | --- |
| `connectionLimit` | 5, `maxIdle` 2, `idleTimeout` 60 s, KeepAlive | erprobte Werte beider Vorbilder; S1 ist zwar häufig, aber jede Abfrage ist ein Index-Punktzugriff |
| `connectTimeout` | 8000 ms | wie Vorbilder; heute wartet S1 auf die Bridge bis ~17,5 s — schlechter wird es nicht |
| Abfrage-Frist im Auflöser | **2500 ms** (S1–S3) / **5000 ms** (S4) via `Promise.race` | der Funnel darf nie an einer hängenden Legacy-DB kleben; nach Fristablauf greift der Rückfall (§8). S4 hat mehr Budget, weil die Outbox ohnehin wiederholt |
| `timezone` | `"Z"` | wie Vorbilder |
| **kein Standard-Schema** | vollqualifiziert `prod_quiz.quiz_berater` | Konvention der Vorbilder: im Code sichtbar, welches Schema gemeint ist; und falls je eine Kontakt-View (§6, A4) dazukommt, ändert sich nichts am Pool |
| `query()` statt `execute()` | wie Vorbilder | wenige, feste Abfrageformen |
| Konfiguration | `LEGACY_MYSQL_HOST/PORT/USER/PASSWORD`, **ohne Code-Defaults** | `configured() === false` ⇒ Modul inert; Tests und ein Deploy ohne Env verhalten sich exakt wie heute. Kein `10.0.1.3` im Quelltext (auch wegen der Lint-Grenze) |

Verhalten bei Ausfall: Pool-Fehler werfen im `legacy/`-Modul; der **Auflöser** fängt sie,
zählt sie (Vergleichstabelle, `abweichungen='mysql_fehler'`-Zeile bzw. Logzeile) und geht
in den Rückfall. Kein Fehler aus `legacy/` erreicht je einen Verbraucher.

### 3.4 Warum überhaupt ein MySQL-Treiber (Abwägung, ausgeschrieben)

§4b des Benachrichtigungsplans entschied am 30.08. bewusst **gegen** einen Treiber
(„ein zweiter Treiber wäre ein neuer Ausfallweg im teuersten Vorgang"). Die Entscheidung
Markus vom 31.08. (Direktzugriff) hebt das auf — aber die Sorge bleibt berechtigt und
wird dreifach beantwortet: (1) Frist + Rückfall auf das Verzeichnis, der Ausfallweg ist
also **kürzer** als heute (heute: Bridge weg ⇒ Mail fällt aus); (2) der Treiber lebt nur
in `legacy/`, per Linter erzwungen; (3) `mysql2` wird exakt gepinnt und über den
vorhandenen `--frozen-lockfile`-Bau geliefert. 🟡 **Offen:** transitive Abhängigkeiten
von `mysql2` beim Einbau nachzählen und im PR-Text ausweisen (Grössenordnung ~10; die
„vier Abhängigkeiten sind ein Vermögenswert"-Rechnung aus §7a ändert sich sichtbar).

### 3.5 Testbarkeit ohne echte Legacy-DB

Die 262 Tests laufen heute ohne jede externe DB — das bleibt so:

- `legacy/datenbank.js`: ohne `LEGACY_MYSQL_*`-Env ist `configured() === false`; kein
  Test braucht eine Verbindung (Muster `analysen/legacy/datenbank.js:22-46`).
- Der Auflöser bekommt seine Quellen **injiziert** (wie `beraterAusVerzeichnis(slug,
  leseJson)` heute schon, `server/berater-verzeichnis.js:68`): Tests reichen Fake-Zeilen
  hinein.
- **Vertragstests gegen die gemessene Bridge-Form**: Fixtures mit verschachteltem
  `address.country`, `org_name`-Ausweichnamen, formatiertem `phone` — die Lehre aus B2a
  („der Testaufbau war mitschuldig": der alte Test baute eine flache Form nach, die es
  nie gab; `scripts/tests/berater-verzeichnis.test.js:108-141` macht es seit dem
  31.08. richtig).
- **Golden-Fixture**: eine echte, datierte `lookup_subdomain`-Antwort (Slug `markus`)
  als Datei; Test: Auflöser(`mysql`-Zeile) ≙ Bridge-Antwort in allen effektiven Feldern.
- Grenz-Linter bekommt einen eigenen Test (Fixture-Verzeichnis mit absichtlicher
  Verletzung ⇒ muss anschlagen).

---

## 4. Die SQL-Artefakte (A1) — konkret ausgeschrieben

Datei im Repo: **`sql/legacy-views.sql`** (neu; dem Umfragen-Grundsatz folgend: die Datei
trägt immer den Stand, der auf dem Server laufen soll — „wer die View ändert, ändert
zuerst hier", `Umfragen/sql/views.sql:1-28`).

```sql
-- Lese-View des Quiz in einem EIGENEN Schema. SQL SECURITY DEFINER: läuft mit den
-- Rechten des Erstellers; der Benutzer `quiz` bekommt KEIN Recht auf
-- prod_activesupport.users (dort liegen Passwort-Hashes und Bankdaten).
--
-- Spaltenliste: hergeleitet aus den Verbrauchern, Beleg in
-- docs/plans/umsetzung-a-berateridentitaet.md §1b. 🔴 BEWUSST OHNE coach_uuid
-- (Gutschein-Schlüssel der Umfragen — das Quiz braucht ihn nicht) und ohne
-- marketing_*-Felder (kein Leser im Quiz).

CREATE DATABASE IF NOT EXISTS `prod_quiz`;

CREATE
  ALGORITHM = UNDEFINED
  DEFINER = `dbmasteruser`@`%`          -- 🟡 offen: tatsächlichen Admin-Benutzer in A0 belegen
  SQL SECURITY DEFINER
VIEW `prod_quiz`.`quiz_berater` AS
SELECT
    LOWER(`u`.`sub_domain`)                                 AS `slug`,
    `u`.`id`                                                AS `user_id`,
    `u`.`first_name`                                        AS `first_name`,
    `u`.`last_name`                                         AS `last_name`,
    `u`.`full_name`                                         AS `full_name`,
    `u`.`email`                                             AS `email`,
    `u`.`herbalife_id`                                      AS `herbalife_id`,
    `u`.`preferred_newsletter_language`                     AS `preferred_newsletter_language`,
    `o`.`org_name`                                          AS `organisation_name`,
    -- Rohteile des address-Objekts und der Telefonnummer: zusammengesetzt wird im
    -- Auflöser, nicht hier. Berechnete Strings in Views tragen die Collation ihres
    -- Ausdrucks (Umfragen/sql/views.sql:62-65) — Rohfelder haben das Problem nicht.
    `u`.`country`                                           AS `country`,
    `u`.`street_number`                                     AS `street`,
    `u`.`postal_code`                                       AS `postal`,
    `u`.`place`                                             AS `place`,
    `u`.`area_code`                                         AS `area_code`,
    `u`.`phone_number`                                      AS `phone_number`,
    `u`.`image`                                             AS `image`,
    JSON_UNQUOTE(JSON_EXTRACT(`u`.`meta`, '$.avatars[1]'))  AS `avatar_150`,
    JSON_UNQUOTE(JSON_EXTRACT(`u`.`meta`, '$.avatars[2]'))  AS `avatar_300`,
    JSON_UNQUOTE(JSON_EXTRACT(`u`.`meta`, '$.avatars[3]'))  AS `avatar_600`,
    `u`.`instagram`                                         AS `instagram`,
    `u`.`facebook`                                          AS `facebook`
FROM `prod_activesupport`.`users` `u`
LEFT JOIN `prod_activesupport`.`organizations` `o`
       ON `o`.`id` = `u`.`organization_id`
-- 🔴 BEWUSST wie die Bridge (db-bridge.php:1250-1254), nicht wie Umfragen:
--    kein Filter auf o.deleted_at — die Bridge hat keinen; ein zusätzlicher Filter
--    wäre eine stille Verhaltensänderung, die der Schattenlauf erst mühsam fände.
WHERE `u`.`deleted_at` IS NULL
  AND `u`.`is_active` = 1
  AND `u`.`sub_domain` IS NOT NULL
  AND `u`.`sub_domain` <> '';
```

Benutzer und Rechte (Passwort neu erzeugen, Ablage in `agent-secrets.json`,
Auslieferung als Coolify-Env `LEGACY_MYSQL_PASSWORD`, `is_literal`):

```sql
-- Host-gebunden: Container dieses Coolify-Hosts treten als 10.0.1.5 auf
-- (bewiesen über bioniq_hl_support.allowedSource = 10.0.1.5). KEIN '%'.
CREATE USER 'quiz'@'10.0.1.5' IDENTIFIED BY '<neu erzeugtes Geheimnis>';

GRANT SELECT ON `prod_quiz`.`quiz_berater` TO 'quiz'@'10.0.1.5';

-- Ausdrücklich NICHT erteilt — und warum:
--  * KEIN Recht auf prod_activesupport.* (Passwort-Hashes, Bankdaten; die View
--    mit SECURITY DEFINER macht es unnötig).
--  * KEIN UPDATE auf prod_contacts_activesupport.typeform_surveys: Der
--    Rangschreibweg (§1c) bleibt BEWUSST bei n8n. Reines Lesen genügt für Strang A;
--    ein Schreibrecht wäre eine eigene Entscheidung mit eigenem Plan.
--  * KEIN CREATE/DROP/DELETE irgendwo.
```

Nicht nachgebaute Bridge-Teile, als bewusste Entscheidungen:

| Bridge-Teil | Entscheidung | Beleg/Absicherung |
| --- | --- | --- |
| `marketing_status`/`level_*` (`:1303-1352`) | weglassen | kein Leser (grep §1b); Schatten vergleicht sie nicht (`VERGLEICHSFELDER` + effektive Felder) |
| Kontakt-Rückfall `source='contact'` (`:1267-1301`) | zunächst weglassen; A4 misst, ob er je vorkommt | Messung 30.08.: 95/96 Slugs in `users`, Rest `default`. Kommt im Schatten `nur_in_der_bridge` mit `source='contact'` vor, wird **vor** A5-S1 eine zweite schmale View (contacts ⋈ users) nachgerüstet — eigener Mini-Schritt mit eigenem Beweis |
| `domain`-Spalte als zweiter Slug-Treffer (`:1242-1249`) | in A0 klären | `SHOW COLUMNS FROM prod_activesupport.users LIKE 'domain'`; existiert sie, prüfen ob ein Quiz-Slug nur dort trifft — dann `OR LOWER(u.domain) = slug` in die View (als zweite Slug-Spalte, nicht als berechneter String) |
| Telefon-Leerzeichenformat (`:1368-1395`) | nur Ziffern-Normalisierung nachbauen (`0049`→`49…`, führende 0 weg) | einzige Leser strippen Nicht-Ziffern (§1b); Schatten vergleicht effektive Ziffern |

---

## 5. Der Grenzzaun: `legacy/` im Quiz und der Linter

### 5.1 Wo der Ordner liegt — 🔴 Dockerfile-Befund

Das Dockerfile kopiert **selektiv** (`Dockerfile:59-63`): `node_modules`, `dist/`,
`package.json`, `api/`, `server/` — sonst nichts. Ein `legacy/` auf Repo-Wurzel wäre
**nicht im Container** und liesse den Prozess beim ersten `require` sterben.

**Entscheidung: `server/legacy/`** (Abweichung vom Vorbild-Wurzelordner, begründet):

1. Fährt mit dem bestehenden `COPY server ./server` mit — kein zweiter Fehlerpunkt im
   Dockerfile, kein Deploy, der am fehlenden COPY scheitert.
2. `server/` ist bereits Runtime-Pfad der CI-Deploy-Regel (DEPLOYMENT_WORKFLOW.md) und
   von ESLint erfasst.
3. Die Grenze zieht der Linter über den **Pfad**, nicht über die Ordnertiefe — die
   Schutzwirkung ist identisch.

Module: `server/legacy/datenbank.js` (Pool, §3.3) und `server/legacy/berater.js`
(die eine Abfrage `SELECT … FROM prod_quiz.quiz_berater WHERE slug = ? LIMIT 1` plus
Umbau der Zeile in die Bridge-Form: `address`-Objekt, `phone`-Ziffern, `full_name`-
Rückfall, `member_id`/`ref_id`/`match`, `found`/`source:'user'`, `quelle:'mysql'`).

### 5.2 Der Grenz-Linter

Neu: `scripts/lint-grenze.js`, portiert aus `analysen/scripts/lint.js:22-50`
(Kommentarzeilen zählen nicht), angepasst:

- **Geprüfte Laufzeitpfade:** `api/`, `server/` (ausser `server/legacy/`), `src/`.
- **Muster:** `mysql2`, `10.0.1.`, `LEGACY_MYSQL_` — taucht eines ausserhalb von
  `server/legacy/` in Code auf, ist die Grenze umgangen ⇒ Exit 1.
- Einbindung in `package.json`:
  `"lint": "eslint . --ext .js,.jsx && node scripts/lint-grenze.js"` — damit läuft die
  Grenze automatisch im CI-Job `safety` (`activecenter-safety.yml:36` ruft
  `pnpm run lint`) und in jedem `npm run check`. Keine neue CI-Verdrahtung nötig.
- Eigener Test (`scripts/tests/lint-grenze.test.js`) mit Fixture-Verletzung.

---

## 6. Die Schritte — jeder mit Vorbedingung, Artefakten, Beweis, Rückweg, Fehlerbild

### A0 — Vorbedingungen messen (kein Eingriff)

| | |
| --- | --- |
| **Vorbedingung** | keine — reine Messungen |
| **Artefakte** | Messnotiz im Repo (`docs/audits/strang-a-vorbedingungen/`), keine Code-/DB-Änderung |
| **Zu messen** | **(1) DDL-Zugangsweg:** SSH auf `167.233.251.217` ist derzeit **nicht** möglich (B2a: `Permission denied` mit allen vier Schlüsseln; widerspricht dem globalen Runtime-Hinweis — klären). Alternative: das MySQL-Credential des n8n-Spiegel-Workflows per Wegwerf-Query `SELECT CURRENT_USER(); SHOW GRANTS;` prüfen (n8n-Änderungen strikt nach Skill `n8n-workflow-update`, danach entfernen). Erst wenn ein Weg **bewiesen** DDL kann, beginnt A1. **(2)** `SHOW COLUMNS FROM prod_activesupport.users LIKE 'domain'` (§4). **(3)** Funnel-Lookup-Volumen: `lookup_subdomain`-Aufrufe/Tag aus dem Containerprotokoll (Coolify-API `/logs`), an **mehreren** Tagen — dimensioniert A4-Fenster und bestätigt die Pool-Auslegung. **(4)** Name des Admin-Benutzers für `DEFINER` belegen (bisher nur `dbmasteruser` aus der Umfragen-Doku). |
| **Beweis** | jede Messung mit Datum/Uhrzeit (MESZ) und Rohausgabe in der Notiz |
| **Rückweg** | entfällt |
| **Was schiefgehen kann** | Man beginnt A1 ohne bewiesenen DDL-Weg und bleibt mitten im Anlegen stecken (View da, GRANTs nicht) — genau deshalb ist A0 ein eigener Schritt |

### A1 — Schema, View, Benutzer anlegen (nur DB-seitig, Quiz unberührt)

| | |
| --- | --- |
| **Vorbedingung** | A0 vollständig; `sql/legacy-views.sql` liegt als PR-Review **vor** der Ausführung im Repo (Umfragen-Grundsatz: erst die Datei, dann der Server) |
| **Artefakte** | `sql/legacy-views.sql` (§4), Benutzer `quiz`@`10.0.1.5`, Passwort in `agent-secrets.json` |
| **Ausführung** | Anweisung für Anweisung über den in A0 bewiesenen Weg; `CREATE VIEW` bewusst **ohne** `OR REPLACE` (es darf nichts Bestehendes ersetzt werden — gäbe es die View schon, wäre das ein Befund, kein Überschreibfall) |
| **Beweis** | (1) `SELECT * FROM prod_quiz.quiz_berater WHERE slug='markus'` über den Admin-Weg: Felder stimmen mit der Bridge-Antwort für denselben Slug überein (von Hand abgeglichen, insbesondere `organisation_name` = `org_name`-Wert — die B2a-Falle). (2) `SELECT COUNT(*)` ≈ 255 (Bestand der Spiegel-Messung vom 30.08.; grobe Plausibilität, kein Fixwert). (3) `SHOW GRANTS FOR 'quiz'@'10.0.1.5'` zeigt **genau eine** GRANT-Zeile plus USAGE. (4) **Negativbeweis Host-Bindung:** Verbindungsversuch als `quiz` von `10.0.1.4` (n8n-Host) **muss scheitern** (Access denied) — beweist, dass `'%'` nicht versehentlich vergeben wurde. 🔴 Der Positivbeweis „Zugang von 10.0.1.5 trägt" ist **erst in A2** möglich (der Container hat noch keinen Treiber; ohne SSH auf den Coolify-Host gibt es vorher keinen ehrlichen Prüfstand) — das ist so benannt und A2 ist deshalb der zweite Beweisteil von A1, kein Ersatz. |
| **Rückweg** | `DROP USER 'quiz'@'10.0.1.5'; DROP VIEW prod_quiz.quiz_berater; DROP DATABASE prod_quiz;` — Sekunden; berührt keinen laufenden Verkehr (noch nutzt nichts die View) |
| **Was schiefgehen kann** | *Falscher DEFINER* ⇒ View liefert `SECURITY DEFINER`-Fehler statt Zeilen — fällt beim Beweis (1) auf, bevor irgendetwas dranhängt. *Zu breite GRANTs* ⇒ fällt bei Beweis (3)/(4) auf. *Spalte fehlt/heisst anders* ⇒ `CREATE VIEW` schlägt fehl — deshalb Reihenfolge „erst View, dann Benutzer" |

### A2 — `server/legacy/` + Treiber + Lint-Grenze + Probe (Verhalten unverändert)

| | |
| --- | --- |
| **Vorbedingung** | A1-Beweise (1)–(4) liegen vor |
| **Artefakte** | `server/legacy/datenbank.js`, `server/legacy/berater.js` (§3.3, §5.1), `mysql2` exakt gepinnt in `package.json` + `pnpm-lock.yaml`, `scripts/lint-grenze.js` + Test (§5.2), Tests für die Bridge-Form-Abbildung (§3.5), **Probe**: Erweiterung des geschützten Diagnose-Endpunkts `/api/lead-system-health` um einen `legacy_mysql`-Block nach dem Muster von `analysen/legacy/datenbank.js:66-88` (`probe()` mit eigener 5-s-Frist, meldet ok/dauer/fehler statt zu werfen). 🔴 **Nicht** in `/health/ready`: der ist fail-closed (`server/http-adapter.js:457-460`) — ein MySQL-Ausfall würde den Container aus der Rotation nehmen und den ganzen Funnel abschalten, obwohl der Auflöser einen Rückfall hat. MySQL ist Diagnose, nie Bereitschaft. |
| **Auslieferung** | Kleiner, eigener PR gegen `main` (Muster B1: nicht über den Arbeitszweig, der weitere Vorhaben trägt). `LEGACY_MYSQL_*` ist dabei **nicht gesetzt** ⇒ `configured() === false`, Modul inert, Verhalten identisch. Danach — als **zweite, getrennte** Änderung — die vier Env-Werte per Coolify-API setzen (App-UUID `yhoacszoiofuq6dg4mykyr7b`) und Neustart über den Deploy-Endpunkt auslösen (`POST /api/v1/deploy?uuid=…`, DEPLOYMENT_WORKFLOW.md; 🟡 offen: ob es einen reinen Restart-Endpunkt gibt — der Deploy-Weg ist belegt und ausfallfrei) |
| **Beweis** | (1) CI grün, Deploy-Beweis `/health/live` = Merge-Commit, **mehrfach über Zeit**. (2) Gegenprobe „nichts geändert": bekannter Slug per `curl /api/bridge` (`lookup_subdomain`) vor/nach dem Deploy feldgleich. (3) Nach dem Env-Setzen: `/api/lead-system-health` zeigt `legacy_mysql.ok === true` mit Dauer — **an mehreren Zeitpunkten über mindestens einen Tag** (R0). Das ist der ausstehende A1-Positivbeweis der Host-Bindung. (4) Lint: absichtliche `mysql2`-Zeile in `api/` bricht `pnpm run lint` (lokal, nicht committet; zusätzlich der Fixture-Test). |
| **Rückweg** | Env löschen (Modul wieder inert) — Minuten; bzw. Revert-PR (der Code hat ohne Env keinerlei Wirkung) |
| **Was schiefgehen kann** | *Lockfile-/Bau-Bruch durch `mysql2`* ⇒ scheitert in CI, nie in Produktion. *Zugang von 10.0.1.5 trägt nicht* (falsche Host-Annahme) ⇒ Probe meldet `access denied`; Verkehr ist nicht betroffen (Quelle steht auf `bridge`), Korrektur rein DB-seitig. *Vergessener COPY* — durch die Entscheidung `server/legacy/` konstruktiv ausgeschlossen (§5.1) |

### A3 — die vier Stellen auf EINEN Auflöser umhängen (Standard `bridge`, Verhalten unverändert)

Neu: `server/berater-aufloeser.js` — kennt die drei Quellen und den Schatten (§3.1/3.2);
Bridge-Abruf wird je Stelle **injiziert** (S1–S3 nutzen `proxyToBridge` mit
Forwarded-Headern, S4 seinen eigenen Fetch — der Transport bleibt lokal, die Logik wird
eine). `server/berater-verzeichnis.js` bleibt und wird zur Verzeichnis-Quelle des
Auflösers; `vergleiche()`/`EFFEKTIVER_WERT` ziehen dorthin um oder werden importiert.

**Reihenfolge des Umhängens — vier kleine PRs, riskanteste Stelle zuletzt:**

| PR | Stelle | Warum an dieser Position |
| --- | --- | --- |
| A3.1 | Auflöser-Modul + Tests, **noch ohne Verbraucher** | reine Ergänzung, kein Pfad berührt |
| A3.2 | **S3** (`bridge.js:3100`) und **S2** (`bridge.js:2237`) | seltenste Pfade (S3 nur Legacy-Sessions ohne kanonischen Lead, S2 nur Submits ohne `member_id`); kleinste Wirkfläche, gleiche Datei |
| A3.3 | **S1** (`bridge.js:428`) | häufigster Pfad — erst wenn der Auflöser an S2/S3 unauffällig läuft |
| A3.4 | **S4** (`lead-outbox-worker.js:702` `lookupCoach` auf den Auflöser umstellen) | teuerster Vorgang **und** Träger des laufenden B2-Schattens — dieser PR ist der formale Übergabepunkt der B-Reihe (§7) |

| | |
| --- | --- |
| **Vorbedingung je PR** | vorheriger PR ist deployt und die Gegenprobe erbracht; `COACH_LOOKUP_SOURCE` steht unverändert (heute `beide`); für A3.4 zusätzlich: §7 gelesen und der Doku-Nachtrag im B-Plan liegt im selben PR |
| **Beweis je PR** | Tests grün (Bestand + neue); Deploy-Beweis wie A2 (2); Gegenprobe: bekannter Slug liefert vor/nach feldgleiche Antwort, `[berater-vergleich]`-Zeilen laufen bei A3.4 nahtlos weiter (gleiche Semantik von `beide`, §3.1) |
| **Rückweg je PR** | Revert des einen kleinen PRs (Standard `bridge` heisst: der Auflöser tut exakt, was die Stelle vorher tat) — ein CI-Deploy, ~15–20 Min |
| **Was schiefgehen kann** | *Formabweichung im Auflöser* (z. B. flaches `country` erzeugt) ⇒ fangen die Vertragstests mit der echten Bridge-Form (§3.5), bevor es deployt wird. *A3.4 unterbricht den B2-Schattenlauf* ⇒ per Kompatibilitätsregel (`beide` bleibt gültig) konstruktiv vermieden; Beweis: Vergleichszeilen auch nach dem Deploy |

### A4 — Schattenlauf `mysql` gegen die Bridge, haltbar geschrieben

| | |
| --- | --- |
| **Vorbedingung** | A3 vollständig; `leads.berater_vergleich` + RPC angelegt (§3.2; Anlegen als `leads_owner`, Prüfung `\dp`); A2-Probe seit mehreren Tagen `ok` |
| **Artefakte** | Env: `COACH_LOOKUP_SCHATTEN=mysql` (Quelle bleibt, was sie ist — heute effektiv `bridge`, denn `beide` deutet nur den Schatten um: wird `beide` durch `SOURCE=bridge` + `SCHATTEN=mysql` ersetzt, endet der Verzeichnis-Schatten der B-Reihe **dokumentiert**, nicht nebenbei — §7) |
| **Beweis (Tor nach A5)** | je Stelle: **0 unerklärte Abweichungen** über **mindestens 3 Tage** UND eine Mindestzahl echter Vergleiche — S1: ≥ 300 (Volumen aus A0), S4: ≥ 5 (~2 Hot-Leads/Tag ⇒ eher 7+ Tage), S2/S3: was in 7 Tagen anfällt; bleiben S2/S3 bei 0 Aufrufen, gilt die S1-Evidenz stellvertretend (gleiche Quelle, Feldmenge von S2/S3 ist Teilmenge von S1 — so begründet, nicht verschwiegen). Zusätzlich: **kein einziges** `nur_in_der_bridge` mit `source='contact'` (sonst Kontakt-View nachrüsten, §4, bevor S1 umschaltet). Abfrage des Tors: `SELECT aufrufstelle, abweichungen, SUM(zaehler) FROM leads.berater_vergleich WHERE tag >= … GROUP BY 1,2;` — abfragbar ohne Serverzugang, überlebt Deploys (die B2a-Lehre). |
| **Rückweg** | `COACH_LOOKUP_SCHATTEN=aus` — Minuten; der Schatten hat nie entschieden |
| **Was schiefgehen kann** | *Der Vergleich misst am Verbraucher vorbei* (B2a-Muster: `country`-Fehlalarm) ⇒ jede gemeldete Abweichung wird erst als „echt oder Vergleichsfehler" eingeordnet — ist es ein Vergleichsfehler, wird **zuerst der Vergleich korrigiert und dann frisch gemessen**; alte Zeilen taugen nicht mehr als Beweis (exakt der B2a-Ablauf). *Schatten belastet S1* ⇒ er läuft asynchron und entkoppelt (§3.2); die Antwortzeit von S1 wird vor/nach dem Einschalten am Protokoll verglichen. *Tabelle wächst unerwartet* ⇒ Aggregat-Schlüssel begrenzt sie; Kontrollabfrage `SELECT COUNT(*)` in der ersten Woche. |

### A5 — Umschalten auf `mysql`, je Stelle, riskanteste zuletzt

Jede Umschaltung ist **eine** Env-Änderung (Stellen-Übersteuerung, §3.1) + Neustart,
mit eigenem Beobachtungsfenster. Reihenfolge und Begründung:

| # | Stelle | Warum hier | Fenster vor der nächsten |
| --- | --- | --- | --- |
| 1 | **S3** `COACH_LOOKUP_SOURCE_ABSCHLUSS=mysql` | seltenster Pfad, nur Legacy-Mails; ein Fehler kostet eine nachholbare Benachrichtigung | ≥ 2 Tage ohne Befund |
| 2 | **S2** `COACH_LOOKUP_SOURCE_SUBMIT=mysql` | selten, braucht nur `herbalife_id`; Fehlerbild (422/`missing_member_id`) ist laut und hat den Alarm-Mailweg (`sendIdentityAlertEmail`) | ≥ 2 Tage, kein `coach_lookup_*`-Fehler, keine Identity-Alerts |
| 3 | **S1** `COACH_LOOKUP_SOURCE_FUNNEL=mysql` | hohes Volumen, aber beste Absicherung: Frist 2,5 s + Rückfall Verzeichnis (§8); liefert in Tagen die stärkste Produktionsevidenz für den letzten Schritt | ≥ 3 Tage; Antwortzeiten und `mysql_fehler`-Zählung unauffällig |
| 4 | **S4** `COACH_LOOKUP_SOURCE_MAIL=mysql` | **teuerster Vorgang zuletzt**, erst wenn MySQL tagelang den ganzen Funnel getragen hat | — |

Abschluss: die vier Übersteuerungen durch `COACH_LOOKUP_SOURCE=mysql` ersetzen,
Übersteuerungen löschen (eine Änderung, reine Vereinfachung), `COACH_LOOKUP_SCHATTEN=aus`.

| | |
| --- | --- |
| **Vorbedingung je Flip** | A4-Tor für diese Stelle; Vergleichstabelle am selben Tag noch einmal gelesen (nicht der Stand von vor einer Woche — R0) |
| **Beweis je Flip** | Env über die Coolify-API gegengelesen (`is_literal`); `/health/live` mehrfach; fachlich: S3 — nächste Legacy-Benachrichtigung kommt an (Tag `hot_lead_legacy` in Postmark) und im Containerprotokoll steht kein `lookup_subdomain`-Bridge-Aufruf dieser Stelle mehr; S2 — Submits ohne `member_id` bekommen weiterhin eine Identität (Outbox/`lead_state` zeigt `member_id` gefüllt); S1 — Stichprobe bekannter Slugs per `curl`: `found`, richtige `organisation_name`, `herbalife_id`; S4 — nächste Hot-Lead-Mails: Absender-/Markenname zeichengleich zur Vorwoche, `quelle:'mysql'` im Auftragskontext. Alles **mehrfach über Tage**, nicht einmalig. |
| **Rückweg je Flip** | Übersteuerung zurück auf `bridge` (oder löschen) + Neustart — **~2–3 Minuten**, kein Deploy. Solange nichts abgebaut ist (B5 des übergeordneten Plans), bleibt der Bridge-Weg vollständig funktionsfähig. |
| **Was schiefgehen kann** | *MySQL fällt nach dem Flip aus* ⇒ Rückfallkette greift (§8): S1–S3 lesen das Verzeichnis (15-Min-Frische), S4-Jobs wiederholen über die Outbox; sichtbar an `mysql_fehler`-Zählern und der A2-Probe — **bevor** ein Nutzer etwas merkt. *Stiller Feldunterschied trotz Schatten* (z. B. ein Slug, der im Fenster nie vorkam) ⇒ Wirkung wäre eine falsche Markenzeile in einer Mail, kein Datenverlust; Rückweg Minuten. *Beide Änderungen gleichzeitig* (Flip + irgendein Deploy) ⇒ verboten — vor jedem Flip prüfen, dass kein Deploy läuft/ansteht. |

---

## 7. Übergabe von der B-Reihe (B3/B4) an Strang A

Stand 31.08.: B1 ✅, **B2 läuft** (`COACH_LOOKUP_SOURCE=beide`), B3 ist durch B2a
gesperrt (Vergleichskorrektur noch nicht deployt, frische Vergleichszeilen fehlen),
B4 offen. Die Regel „nie beide gleichzeitig" wird so eingelöst:

1. **Bis zum Merge von A3.4** gilt die B-Reihe unverändert. Insbesondere wird die
   ausstehende Auslieferung der Vergleichskorrektur (B2a „Was jetzt noch fehlt", Punkt 1)
   **nicht** von Strang A überholt — sie ist ohnehin Bestandteil von A3.1/A3.4, weil der
   Auflöser die korrigierte `vergleiche()` benutzt.
2. **Der Merge von A3.4 ist der formale Übergabepunkt.** Ab da werden B3 („auf
   `verzeichnis` stellen") und B4 („`BRIDGE_URL` aus dem Coach-Pfad") **nicht mehr
   ausgeführt** — A4/A5 ersetzen sie mit dem weitergehenden Ziel `mysql`. Der PR A3.4
   trägt den Nachtrag im B-Plan (Restweg-Tabelle: „B3/B4 abgelöst durch
   umsetzung-a-berateridentitaet.md, Datum, Commit") — Doku und Code im selben Commit,
   damit es keinen Zeitraum mit zwei gültigen Anleitungen gibt.
3. **Es gibt genau einen Schalter-Eigentümer:** `COACH_LOOKUP_SOURCE*` wird nach der
   Übergabe nur noch nach diesem Plan verändert. Der Wert `beide` bleibt technisch
   gültig (Kompatibilität §3.1), wird aber nicht mehr neu gesetzt.
4. Sollte vor A3.4 doch B3 vollzogen werden (Entscheidung ausserhalb dieses Plans),
   übernimmt Strang A vom Zustand `verzeichnis` aus — die Schrittfolge ändert sich
   nicht, nur die „Verhalten unverändert"-Gegenproben vergleichen dann gegen das
   Verzeichnis statt gegen die Bridge.

---

## 8. Rückfallverhalten und die Zukunft von `leads.berater` + 15-Minuten-Spiegel

**Vorschlag: Kette `mysql → verzeichnis`, und der Spiegel bleibt als Rückfallebene.**

Begründung:

- **Warum nicht `mysql → bridge`:** Ziel des Strangs ist, dass kein Pfad mehr von der
  Verfügbarkeit des PHP-Endpunkts abhängt; eine Bridge in der Rückfallkette hielte
  `BRIDGE_*` am Leben und verdeckte Ausfälle der neuen Quelle.
- **Warum das Verzeichnis als Netz:** eigene DB, eigener Ausfallraum gegenüber
  `mysqld` (View gelöscht, GRANT zerschossen, mysqld down ⇒ Verzeichnis liefert
  weiter, höchstens 15 Min alt). Der Preis ist ein n8n-Workflow, der bereits läuft,
  laut abbricht (< 50 Zeilen / doppelte Slugs) und seit der `org_name`-Korrektur
  deckungsgleich misst. Ehrlich benannt: Plattform-Postgres und MySQL liegen beide
  hinter `10.0.1.3` — fällt die **Maschine**, fällt beides; dagegen hilft nur die
  letzte Stufe: S1–S3 verhalten sich wie heute bei Bridge-Ausfall (`coach: null`,
  Funnel läuft mit Vorgabemarke weiter, Submit meldet 503), S4-Jobs bleiben in der
  Outbox und werden nachgeholt — kein Verlust, nur Verzug.
- Bewusste Lücke des Netzes: das Verzeichnis führt **weniger Spalten** (kein `phone`,
  keine Avatare — `server/berater-verzeichnis.js:23-33`). Im Rückfall fehlt dem Funnel
  der WhatsApp-Link (Komponenten blenden ihn dann aus, `App.jsx:1514`) — vertretbar
  für einen Ausfallzustand; wer es schliessen will, erweitert den Spiegel um die
  Spalten (eigener kleiner n8n-Schritt, nicht Teil von A).
- **Stilllegung des Spiegels:** erst prüfen, wenn `mysql` **3 Monate** ohne
  Rückfall-Ereignis getragen hat (Zähler aus §3.2/A2-Probe als Beleg). Vorher
  stillzulegen hiesse, das Netz abzubauen, solange man es noch nie gebraucht hat —
  und der Gewinn wäre nur ein n8n-Workflow weniger.

---

## 9. Offen / unbelegt (vor dem jeweiligen Schritt zu klären)

| # | Punkt | Prüfweg | blockiert |
| --- | --- | --- | --- |
| 1 | **DDL-Zugang — eingegrenzt am 31.08.2026, siehe Kasten unten** | Markus interaktiv, oder Zugangsdaten ergänzen | **A1** |
| 2 | Admin-Benutzer für `DEFINER` (Annahme `dbmasteruser` aus Umfragen-Doku) | A0 (4) | A1 |
| 3 | `users.domain` als zweiter Slug-Treffer | A0 (2) | A1 (Spaltenliste) |
| 4 | Kontakt-Rückfall (`source='contact'`) je im Quiz gebraucht? | A4-Messung (`nur_in_der_bridge`) | A5-S1 |
| 5 | Funnel-Lookup-Volumen/Tag | A0 (3) | A4-Fenster |
| 6 | Default-Privileges für `leads_app` auf neue `leads.*`-Objekte | `\dp` nach Anlegen | A4 |
| 7 | Transitive Abhängigkeiten von `mysql2` (Anzahl, Pinnung) | beim A2-PR nachzählen | A2-Review |
| 8 | Reiner Restart-Endpunkt der Coolify-API (Deploy-Endpunkt ist belegt) | API-Doku/Versuch bei A2 | nichts (Deploy-Weg genügt) |
| 9 | Ob die formatierte Telefon-Anzeige je gebraucht wird (heute nur Ziffern-Leser) | bei künftigen UI-Änderungen beachten | nichts (dokumentiert §4) |
| 10 | `organizations.deleted_at`-Verhalten: Bridge filtert nicht — fachlich gewollt? | Frage an Markus, unabhängig von A (View bildet erst einmal die Bridge nach) | nichts |

> ### 🔴 Punkt 1 im Einzelnen: der DDL-Zugang fehlt — genau hier
>
> **Nachgemessen am 31.08.2026.** A1 (Schema, View, Benutzer anlegen) ist der einzige
> Schritt, der aus dieser Umgebung heraus **nicht** ausführbar ist. Der Netzweg ist nicht
> das Problem — die Zugangsdaten sind es:
>
> | Weg | Befund |
> | --- | --- |
> | Netz zu MySQL `10.0.1.3:3306` | 🟢 **erreichbar** von `10.0.1.4` (n8n-Host). Der frühere Fehlschlag war `Access denied` für `bioniq_public_reader`@`10.0.1.4` — also eine **Benutzer**-Bindung, kein Netzproblem. |
> | SSH auf den DB-Host `91.99.76.104` | 🔴 **nein.** Weder `root@` noch `forge@` mit den vier vorhandenen Schlüsseln. Der in `agent-secrets` hinterlegte Schlüssel (`db_forge_server.sshKeyPath` → `C:\Users\Markus\.ssh\id_rsa`) ist **passphrasengeschützt** (`sshKeyPassphraseRef`) und damit nicht-interaktiv nicht verwendbar. |
> | SSH auf den Coolify-Host `167.233.251.217` | 🔴 **nein** — `Permission denied (publickey)` mit allen Schlüsseln; in `agent-secrets` liegt zu der Box nur ein UI-Login. |
> | `dbmasteruser` direkt | 🟡 **wäre der richtige Weg** — die Bindung ist laut `db_forge_server.note` `dbmasteruser@%` (Wildcard), also von `10.0.1.4` aus nutzbar. Aber: Das Passwort steht laut Notiz in `/home/forge/.my.cnf` **auf dem Server** und liegt **nicht** in `agent-secrets`. |
>
> **Damit ist A1 der einzige Schritt, der Markus persönlich braucht** — entweder
> interaktiv mit der Passphrase, oder indem das `dbmasteruser`-Passwort in `agent-secrets`
> ergänzt wird. Danach läuft A2 bis A5 wieder vollständig automatisierbar.
>
> 🔴 **Das ist kein Grund, A1 zu überspringen oder zu improvisieren.** Ohne View und
> Benutzer gibt es keinen Beweis für A2 — und ohne den keinen für A3.

---

## 10. Was dieser Plan ausdrücklich nicht tut

- Er fasst `db-bridge.php` nicht an und ändert nichts an den `forward_webhook`-Wegen
  (Strang B des übergeordneten Plans).
- Er zieht den **Rangschreibweg** (§1c) nicht mit — der bleibt bei n8n; die App erhält
  kein Schreibrecht.
- Er baut die Bridge-Felder ohne Leser (`marketing_*`, `organisation_id`) nicht nach.
- Er legt den 15-Minuten-Spiegel nicht still (§8) und entfernt `BRIDGE_*` nicht aus
  der Env — das ist B5 des übergeordneten Plans, frühestens nach einem Ruhefenster
  hinter A5.
