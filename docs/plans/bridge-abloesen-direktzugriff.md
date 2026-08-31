# Die Bridge im Quiz ablösen — Direktzugriff statt Fremdaufruf

**Aufgestellt am 31.08.2026** auf Anweisung von Markus: *„business leads quiz sollte alle
Infos direkt aus MySQL holen. Da es jetzt ja auf Coolify ist, hat es direkten Zugriff."*

> **Abgrenzung:** Die **landing-page behält die Bridge** — sie ist nicht migriert. Dieses
> Dokument betrifft ausschliesslich `business_leads_quiz`. `db-bridge.php` selbst wird nicht
> angefasst; der Endpunkt bleibt für andere Aufrufer bestehen.

Alle Angaben unten sind am 31.08.2026 am Quelltext und am laufenden System **gemessen**,
nicht übernommen.

---

## 1. Inventur — wofür das Quiz die Bridge heute noch benutzt

Der Bridge-Vertrag (`scripts/lib/bridge-contracts.js`) führt **14 Aktionen**. Tatsächlich
an die Legacy-Bridge weitergereicht werden davon nur noch **zwei**, an insgesamt
**sechs Aufrufstellen**:

| # | Aktion | Aufrufstelle | Wann | Was es wirklich tut |
| --- | --- | --- | --- | --- |
| 1 | `lookup_subdomain` | `api/bridge.js:429` in `resolveConsultantLookup` | bei **jedem Seitenaufruf** des Funnels (Browser → `src/lib/core.js:829` → `/api/bridge`) | MySQL-**Lesen**: `users` ⋈ `organizations` |
| 2 | `lookup_subdomain` | `api/bridge.js:2237` in `ensureBusinessSubmissionIdentity` | beim Absenden, wenn die `member_id` fehlt | dasselbe Lesen |
| 3 | `lookup_subdomain` | `api/bridge.js:3100` in `loadCompletionNotificationContext` | bei `notify_all_videos_completed` | dasselbe Lesen |
| 4 | `lookup_subdomain` | `api/lead-outbox-worker.js:683` in `lookupCoachUeberBridge` | bei jeder Hot-Lead-Mail | dasselbe Lesen — **bereits in Ablösung** (B-Reihe) |
| 5 | `forward_webhook` | `api/bridge.js:4094` in `forward_typeform_adapter` | beim Opt-in | 🔴 **kein MySQL** — HTTP-Weiterleitung |
| 6 | `forward_webhook` | `api/bridge.js:4199` (eigene Aktion) | beim Opt-in | 🔴 **kein MySQL** — HTTP-Weiterleitung |

**Das ist die ganze Liste.** Vier Lesestellen für **dieselbe** Information (die
Berateridentität) und zwei Weiterleitungen, die mit MySQL nichts zu tun haben.

### Was schon lange nicht mehr über die Bridge läuft

- **Die anderen zwölf Vertragsaktionen** (`track_event`, `write_analytics`,
  `write_analytics_batch`, `notify_all_videos_completed`, `update_points_result`,
  `generate_resume_token`, `resolve_resume_token`, `resolve_resume_key`, die drei
  `get_*_metrics`) werden in `api/bridge.js` **lokal** beantwortet und schreiben bzw. lesen
  über `writeToSupabaseAsync` → `writeTrackingEvent`/`upsertLeadProfile` gegen die
  **Plattform-Postgres** (`LEADS_DB_MODUS=direkt`). Der Name ist ein Altlast-Name, das Ziel
  ist Postgres.
- **`readMysqlTable()`** (`api/bridge.js:385`) ist in Produktion **toter Code**: sie kehrt
  sofort zurück, wenn `HBA_READ_BRIDGE_URL` fehlt — und diese Variable ist im Container
  **nicht gesetzt** (Env am 31.08. über die Coolify-API ausgelesen).

### 🔴 Das Quiz schreibt **nichts** nach MySQL

Alle sechs Stellen sind Lesen oder Weiterleiten. Für die Ablösung wird darum **nur ein
Lesezugang** gebraucht — kein Schreibrecht, keine Transaktionen, keine Migration von Daten.

---

## 2. Prämissen geprüft

| Prämisse | Befund am 31.08.2026 |
| --- | --- |
| Der Container erreicht MySQL direkt | 🟢 **Ja, belegt.** `bioniq_hl_support.allowedSource` ist `10.0.1.5` — der Coolify-App-Server. Die App `bioniq-hl-support` läuft dort `running:healthy` **auf demselben Host** wie `business-leads-prod` und liest so bereits `prod_activesupport`. |
| Der Container hat MySQL-Zugangsdaten | 🔴 **Nein.** Im Env stehen nur `BRIDGE_*` und `LEADS_DB_*` (Postgres). Es gibt keine MySQL-Variablen. |
| Die Anwendung hat einen MySQL-Treiber | 🔴 **Nein.** Laufzeitabhängigkeiten sind `jsonwebtoken`, `postgres`, `react`, `react-dom`. |
| Es sind Schreibrechte nötig | 🟢 **Nein** — siehe oben, reines Lesen. |
| Zielspalten sind bekannt | 🟢 **Ja.** `db-bridge.php` `lookup_subdomain` selektiert `users` ⋈ `organizations` mit `o.org_name AS organisation_name`; das Land steht nur in `address.country`. Am 31.08. an der echten Bridge gegengeprüft. |

**Die Prämisse „hat direkten Zugriff" stimmt auf der Netzebene.** Was fehlt, ist ein
Treiber und ein Zugang — beides beschaffbar.

---

## 3. 🔴 Eine Sache geht nicht „direkt aus MySQL": `forward_webhook`

`forward_webhook` liest keine Datenbank. Der PHP-Handler (`db-bridge.php:1875`) tut genau
drei Dinge:

1. **SSRF-Schutz** — der vom Aufrufer gewünschte `target` wird ignoriert und gegen eine
   Weissliste ersetzt; die enthält genau einen Eintrag:
   `https://contacts.hl-support.biz/webhook/typeform`.
2. **`curl`** auf dieses Ziel mit dem Payload.
3. **Ein Zeilenprotokoll** in eine Datei (`wh_append_log`).

Für diese zwei Stellen heisst „Bridge ablösen" also **nicht** „direkt aus MySQL", sondern
**„direkt an `contacts.hl-support.biz` senden"**. Das Quiz kennt das Ziel bereits als
Konstante (`api/bridge.js:69`, `TYPEFORM_TARGET`) und prüft es an beiden Stellen schon
selbst — die Weissliste existiert im Quiz also doppelt.

**Was dabei verloren ginge:** das Dateiprotokoll der Bridge. Wenn es als Beleg gebraucht
wird, muss der Ersatz es mitliefern (eine Zeile in `lead_events` wäre der naheliegende Ort).

---

## 4. Die Entscheidung, die vor dem Bauen fällt

Für die Berateridentität gibt es zwei Formen von „direkt", und sie schliessen sich nicht
aus:

| | **V1 — direkt aus MySQL** | **V2 — aus dem Verzeichnis** (`leads.berater`) |
| --- | --- | --- |
| Weg | Container → `10.0.1.3:3306` | Container → Plattform-Postgres (schon offen) |
| Aktualität | **sofort** | bis zu **15 Minuten** alt |
| Neuer Treiber | 🔴 ja (`mysql2`) | 🟢 nein |
| Neue Abhängigkeit im Sendeweg | 🔴 ja — die Legacy-MySQL | 🟢 nein |
| Zustand | zu bauen | **fertig, gemessen** (B1/B2, 255 Zeilen, Stichprobe 12/12 deckungsgleich) |
| Richtung | koppelt **enger** an das System, von dem wir weg wollen | entkoppelt |

🔴 **Ein früherer Beschluss steht dem entgegen** (§4b des Benachrichtigungsplans): Die
Anwendung hat *bewusst* keinen MySQL-Treiber, weil „ein zweiter Treiber ein neuer
Ausfallweg im teuersten Vorgang des Funnels wäre". Wer V1 wählt, hebt diesen Beschluss auf —
das ist zulässig, sollte aber bewusst geschehen.

### Empfehlung

**Beides bauen, aber getrennt einsetzen — und die Quelle zu einem Schalter machen.**

- **Der eigentliche Gewinn liegt woanders:** Heute fragen **vier** Stellen dasselbe auf
  **vier** verschiedenen Wegen. Der teure Teil der Arbeit ist, sie auf **einen Auflöser**
  zusammenzuziehen. Ist das getan, ist die Datenquelle nur noch eine Variable — genau wie
  `COACH_LOOKUP_SOURCE` es für den Mailweg schon vormacht.
- **Für den Mailweg** (Aufrufstelle 4) bleibt **V2** richtig: dort ist der Ausfall am
  teuersten, und der Weg ist bereits gebaut und belegt.
- **Für den Funnelweg** (Stellen 1–3) ist **V1** die stärkere Wahl: dort ist Aktualität
  sichtbar (ein frisch angelegter Berater soll seine Seite sofort ausliefern können), und
  ein synchroner Aufruf findet ohnehin statt — er geht heute nur den Umweg über PHP.
- **Fällt eine Quelle aus, greift die andere.** Verzeichnis-Treffer fehlt → MySQL fragen;
  MySQL nicht erreichbar → Verzeichnis nehmen. Das ist mit einem Auflöser trivial und heute
  unmöglich.

🔴 **Folge, die mitentschieden wird:** Geht der Mailweg später auch auf V1, werden
`leads.berater` und der 15-Minuten-Spiegel überflüssig. Die Arbeit aus B1/B2 wäre trotzdem
nicht umsonst — der Auflöser und das Schattenverfahren tragen weiter —, aber der Spiegel
würde stillgelegt. Das sollte eine Entscheidung sein, kein Nebeneffekt.

---

## 5. Der Plan

Jeder Schritt hat einen Beweis, der **vor** dem nächsten erbracht wird. Reihenfolge nicht
verhandelbar: erst messen, dann bauen, dann umschalten.

| # | Schritt | Beweis, bevor es weitergeht |
| --- | --- | --- |
| **BR0** | **Netzweg und Zugang beweisen.** Einen Lesebenutzer für das Quiz auf `prod_activesupport` anlegen (Rechte: `SELECT` auf `users` und `organizations`, sonst nichts), freigeschaltet für `10.0.1.5`. Aus dem **laufenden Container** eine Verbindung öffnen und `select 1` sowie einen Slug lesen. | Der Container liest einen bekannten Berater aus MySQL. 🔴 Ohne diesen Beweis wird nichts gebaut — `allowedSource` ist dokumentiert, aber für **diesen** Benutzer noch nicht gemessen. |
| **BR1** | **Einen Auflöser bauen.** `server/berater-aufloesen.js` nach dem Vorbild von `berater-verzeichnis.js`: eine Funktion, drei Quellen (`bridge` \| `verzeichnis` \| `mysql`), eine Antwortform. Noch **nirgends** eingehängt. | Eigene Tests, Gesamtlauf grün. Kein Verhalten geändert. |
| **BR2** | **MySQL-Quelle ergänzen** (`mysql2`, Pool mit kleinem Limit, Zeitlimit, sprechender Fehler). SQL **zeichengleich** zu `db-bridge.php`: `users` ⋈ `organizations`, `o.org_name AS organisation_name`, Land verschachtelt. | Test gegen die gemessene Antwortform. Treiber ist im Bild, aber unbenutzt. |
| **BR3** | **Die vier Lesestellen auf den Auflöser umhängen**, Standardquelle `bridge` → **Verhalten unverändert**. | Ein Deploy, bei dem sich nichts ändert: Funnel lädt, Opt-in geht durch, Hot-Lead-Mail kommt. Gegenprobe wie bei B1. |
| **BR4** | **Schattenvergleich für den Funnelweg** — Quelle `beide`, die Bridge entscheidet weiter, Abweichungen werden protokolliert. 🔴 Diesmal **haltbar** schreiben, nicht nur `console.warn` (Lehre aus B2a). | Über mehrere Tage **0** Abweichungen, über echte Seitenaufrufe gemessen — nicht über eine Stichprobe. |
| **BR5** | **Funnelweg auf `mysql` stellen.** | Seitenaufruf liefert denselben Berater; **kein** Aufruf mehr an `ac-reconnect.com` im Funnelpfad (im Protokoll gegengezählt). |
| **BR6** | **`forward_webhook` direkt senden** — eigener Aufruf an `TYPEFORM_TARGET`, Weissliste bleibt, plus Ersatz für das Bridge-Protokoll. 🔴 **Getrennt von BR1–BR5 ausliefern**: das ist der Opt-in-Weg, der teuerste Pfad überhaupt. | Ein echtes Opt-in landet in `contacts.hl-support.biz` — einmal, nicht doppelt. Gegenprobe im Zielsystem. |
| **BR7** | **`BRIDGE_URL`/`BRIDGE_KEY` aus dem Quiz entfernen**, toten Code (`readMysqlTable`, `HBA_READ_BRIDGE_URL`) mit ausbauen. | `grep` findet keinen Aufruf mehr; ein Deploy ohne die Variablen läuft. |

**Verhältnis zur B-Reihe:** BR3 löst B3/B4 ab — dieselben Aufrufstellen, nur breiter
gefasst. Solange BR3 nicht steht, gilt die B-Reihe unverändert weiter. **Nicht beide
gleichzeitig laufen lassen.**

---

## 6. Risiken und Rückweg

| Risiko | Warum es zählt | Gegenmittel |
| --- | --- | --- |
| 🔴 **Doppelter Versand** bei BR6 | Wenn alter und neuer Weg gleichzeitig senden, bekommt jeder Lead alles doppelt | BR6 allein ausliefern, nie zusammen mit BR1–BR5; vorher am Zielsystem zählen |
| 🔴 **MySQL als neuer Ausfallweg** | Der Funnel hinge synchron an der Legacy-DB | Zeitlimit + Rückfall auf das Verzeichnis; Quelle ist ein Schalter, Rückweg ist eine Env-Änderung |
| Treiberpflege (`mysql2`) | Zweite Datenbankbibliothek im Bild | Kleiner Pool, nur Lesen, eigener Benutzer mit `SELECT` auf zwei Tabellen |
| Stiller Feldunterschied | Genau das ist am 31.08. passiert (`o.name` statt `o.org_name`) | Schattenvergleich in BR4 gegen die **effektiven** Werte — `vergleiche()` ist dafür bereits korrigiert |
| Verlust des Bridge-Protokolls | Beleg für Weiterleitungen fehlt | Ersatzzeile in `lead_events`, Teil von BR6 |

**Rückweg über den ganzen Umbau:** Bis BR7 bleibt die Bridge vollständig erreichbar. Jeder
Schritt bis BR6 ist eine Env-Änderung zurück (`bridge`), BR6 ein Deploy zurück.

---

## 7. Was dieser Plan ausdrücklich **nicht** tut

- Er fasst **`db-bridge.php` nicht an** — die landing-page benutzt sie weiter.
- Er migriert **keine Daten**. Das Quiz liest nur.
- Er löst **die Legacy-MySQL nicht ab**. `prod_activesupport` bleibt die Stammdatenhaltung
  der Berater; nur der Umweg über PHP verschwindet.
- Er entscheidet **nicht** über die Zukunft von `leads.berater` und dem Spiegel — siehe §4.
