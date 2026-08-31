# Plan: Benachrichtigungsweg von der Legacy-MySQL auf die Plattform holen

**Angelegt 28.08.2026.** Auslöser: Entscheidung Markus — „das mit der Bridge musst du
korrigieren und schauen, dass es wirklich in unser neues System geht, nach unseren klaren
Benachrichtigungswegen. Keine halben Lösungen."

Grundlage: [../MAILWEGE.md](../MAILWEGE.md) (die gemessene Karte). Alle Zahlen hier sind am
28.08.2026 gemessen.

---

## 1. Warum das weg muss

Der Opt-in-Weg läuft heute so:

```text
Submit → api/bridge.js (forward_webhook) → contacts.hl-support.biz/webhook/typeform
       → MySQL prod_contacts_activesupport.typeform_surveys
       → [5-Minuten-Poll] n8n "AC - Lead Post Processor" (9RZdrLxfA8IRhd55)
       → Mautic-Upsert · ZeroBounce · 2 Postmark-Mails · Job in MySQL abhaken
```

Vier Gründe, warum das nicht bleiben kann:

1. **Es widerspricht Entscheidung 3** aus [../STAND-UND-FORTSETZUNG.md](../STAND-UND-FORTSETZUNG.md):
   die Outbox sollte der **einzige** Übergabepunkt zur Legacy-Kartei sein. Hier ist ein
   zweiter, und er trägt den wichtigsten Vorgang des Funnels.
2. **Der Cutover hat ihn nicht erfasst.** Die Leads liegen in `hl_support`, die
   Benachrichtigung hängt an MySQL. Zwei Wahrheiten über denselben Vorgang.
3. **Er ist im Repo unsichtbar.** Am 28.08. hat die Frage „warum kommt keine Mail" über
   eine Stunde gedauert, weil der Weg nirgends stand. Zwei falsche Zwischenergebnisse
   entstanden dabei.
4. **5 Minuten Verzögerung** sind bei einem Werbeklick, der 3–5 € gekostet hat, kein
   Detail.

## 2. Zielbild

Genau das Muster, das für die **Hot-Lead-Mail schon funktioniert**: die Anwendung stellt
beim Opt-in einen Auftrag in `leads.lead_sync_outbox`, der Worker in
`api/lead-outbox-worker.js` arbeitet ihn ab und verschickt über Postmark.

| | heute | Ziel |
| --- | --- | --- |
| Auslöser | 5-Minuten-Poll auf MySQL | Outbox-Auftrag beim Opt-in |
| Quelle der Daten | `typeform_surveys` (MySQL) | `leads.lead_state` / `lead_answers_current` |
| Absendender Code | n8n-Knoten | `api/lead-outbox-worker.js` (versioniert, getestet) |
| Verzögerung | bis 5 Minuten | Sekunden (Worker läuft im Minutentakt) |
| Sichtbarkeit | keine | Tests, CI, Tags, `MAILWEGE.md` |

Neue Auftragsarten: `coach_optin_email` und `lead_access_email`, analog zum bestehenden
`coach_hot_lead_email` (`SUPPORTED_SYNC_TYPES` in `api/lead-outbox-worker.js:40`).

## 3. 🔴 Was daran NICHT klein ist — gemessen, nicht geschätzt

Das ist der Grund, warum dieser Umbau **nicht** in einem Zug erledigt wurde:

| Hindernis | Messung |
| --- | --- |
| **Die Mailtexte liegen in einer riesigen JS-Bibliothek** | **269.994 Zeichen** JS im Workflow, davon **je ~87.000 dreifach kopiert** in `Code - Normalize Candidate Rows`, `Code - Build Lead Model`, `Code - Apply Resume Link` |
| **Vier Sprachen** | `de`/`it`/`en`/`hu` in denselben Knoten verwoben (Betreff, HTML, Text, Profil- und Zielnamen) |
| **Die Berateridentität kommt aus der Legacy-Bridge** | `lookupCoach()` fragt `BRIDGE_URL` (`origin-reconnect.ac-reconnect.com/db-bridge.php`). Auch der „saubere" Weg bleibt davon abhängig, bis die Kontakte-Migration läuft |
| **Der Mautic-Teil ist Vorbedingung der Nurture-Strecke** | Der Post Processor legt den Mautic-Kontakt an und setzt das Segment. Wer nur die Mails herauslöst, muss den MySQL-Poll für Mautic stehen lassen |

**Konsequenz:** Der Umbau ist ein Port von rund 87.000 Zeichen Vorlagenlogik plus eine
Ablösung der Mautic-Anbindung. Das ist mehrere Arbeitssitzungen groß — und es ist der
Pfad, über den **jede** Lead-Mail läuft. Ein Schnellschuss darauf wäre genau die halbe
Lösung, die hier niemand will.

## 3a. 🟢 Korrektur nach der Messung vom 30.08.2026

Abschnitt 3 schätzte den Umfang, bevor er gemessen war. Die Messung fällt günstiger aus:

| | Annahme 28.08. | gemessen 30.08. |
| --- | --- | --- |
| Vorlagenlogik | „rund 87.000 Zeichen“ **dreifach kopiert** | **eine** Bibliothek, 1.708 Zeilen, 53 Funktionen |
| Knotenspezifischer Teil | unklar | **3 / 4 / 47 Zeilen**, einzeln benannt |
| Fassungsstand | unklar | **zwei** Fassungen im Umlauf — die maßgebliche ist die aus `Code - Build Lead Model` |

🔴 **Neuer Befund, der in den Port gehört:** `Code - Normalize Candidate Rows` und
`Code - Apply Resume Link` laufen auf der **älteren** Fassung; ihnen fehlen
`ac_berater_display_name` und `getOrganisationName`. Heute folgenlos — der erste Knoten
benutzt vom gebauten Modell nur 17 skalare Felder für die Auftragszeile, der dritte erbt die
Mautic-Felder aus dem zweiten. Die **versendete Mail** entsteht aber in der alten Fassung.
Die nächste Textkorrektur träfe zwangsläufig nur eine der beiden Hälften.

🔴 **Zweiter Befund:** `Normalize Candidate Rows` baut je Kandidat das vollständige
Modell samt vier Sprachfassungen von Betreff, HTML und Text — und schreibt danach 17 Felder
in eine Auftragszeile. Dieser Aufruf braucht im Zielbild **keine** Vorlagenbibliothek.

Vollständiger Befund: [../audits/c1-postprocessor-extrakt/BEFUND.md](../audits/c1-postprocessor-extrakt/BEFUND.md)

## 4. Schritte, jeder mit eigenem Beweis

| # | Schritt | Beweis, bevor es weitergeht |
| --- | --- | --- |
| 1 | ~~**Bibliothek extrahieren**~~ | ✅ **erledigt 30.08.** Es sind **eine** Bibliothek (1.708 Zeilen, 53 Funktionen) und drei Treiber (3 / 4 / 47 Zeilen), nicht dreimal 87.000 Zeichen. Zwei Fassungen gefunden — und **am selben Tag angeglichen**: alle drei Knoten tragen jetzt `883c5aa78cec941e`, dieselbe Prüfsumme wie der Extrakt im Repo. Erster Lauf danach um 17:25:59 erfolgreich. Befund: [../audits/c1-postprocessor-extrakt/BEFUND.md](../audits/c1-postprocessor-extrakt/BEFUND.md) |
| 2 | **Vorlagen ins Repo portieren** (`server/mail-vorlagen/`), vier Sprachen, mit Golden-Tests gegen die real versendeten Mails aus Postmark | Für je einen echten Lead je Sprache: erzeugte Mail == versendete Mail, Zeichen für Zeichen |
| 3 | **Outbox-Arten ergänzen** (`coach_optin_email`, `lead_access_email`), Versand **hinter einem Schalter** (`OPTIN_OUTBOX_EMAIL_ENABLED`, Standard aus) | Regressionstests grün; bei Schalter aus verhält sich das System exakt wie heute |
| 4 | **Schattenlauf**: Aufträge werden erzeugt und abgearbeitet, aber statt zu senden nur protokolliert | Über 48 h: für **jeden** Opt-in genau ein Auftrag je Art, kein Doppel, keine Lücke — gegen die tatsächlich versendeten Postmark-Mails abgeglichen |
| 5 | **Umschalten**: Schalter an, dieselbe Stunde die beiden Postmark-Knoten im Post Processor abschalten | Nächster echter Opt-in: Mail da, Tag `optin_coach`/`lead_access`, Inhalt identisch zur Vorwoche, Abstand jetzt Sekunden statt Minuten |
| 6 | **Mautic ablösen**: Kontakt-Upsert und Segment aus der Outbox heraus | Nurture-Strecke sendet für einen neuen Lead unverändert weiter |
| 7 | **Post Processor stilllegen**, MySQL-Poll entfällt | 7 Tage ohne Fehl-Lauf, dann Entscheidung-3-Konflikt geschlossen |

## 4a. Schritt 2 im Einzelnen (aufgestellt 30.08.2026, nach der Messung)

| # | Teilschritt | Beweis |
| --- | --- | --- |
| 2a | **Bedarf eingrenzen.** Von den 53 Funktionen sind **12** mailbezogen: `buildBrandedEmailShell`, `getLeadEmailPresentation`, `getLeadEmailCopy`, `getLocalizedLeadEmailPresentation`, `buildLeadProfileIconHtml`, `getLeadEmailValue`, `getLeadEmailMapValue`, `buildPremiumLeadEmailHtml`, `buildPremiumLeadEmailText`, `buildCoachEmailHtml`, `buildCoachEmailText`, `escapeHtml`. Der Rest baut das Modell | Aufrufgraph ab den vier Einstiegspunkten; keine Funktion ausserhalb der Hülle bleibt übrig |
| 2b | **Goldene Vorlagen ziehen**: je Sprache eine **echt versendete** Mail aus Postmark (Server `Leadgen`, Tags `optin_coach` und `lead_access`) samt zugehörigem Lead | Vier Sprachen belegt — oder benannt, für welche es keinen echten Fall gibt |
| 2c | 🔴 **Feldabbildung nachweisen.** Der Post Processor baut sein Modell aus `MySQL - Re-Read Final Lead Context`; die Coach-Felder (`coach_id`, `coach_first_name`, `coach_last_name`, `coach_full_name`, `coach_email`, `coach_herbalife_id`, `coach_sub_domain`, `coach_organisation_name`) kommen per JOIN aus `prod_activesupport.users` | Feld für Feld: dieselbe Menge aus `leads.lead_state` / `lead_answers_current` — oder benannt, was nur in MySQL steht |
| 2d | **Portieren** nach `server/mail-vorlagen/`, ohne n8n-Abhängigkeit (`$input`, `$()` kommen in der Bibliothek nicht vor — nur in den Treibern). **Dabei fällt der zweite Befund weg:** `Code - Normalize Candidate Rows` baut heute je Kandidat vier Sprachfassungen von Betreff, HTML und Text, um daraus **17 skalare Felder** in eine Auftragszeile zu schreiben. Im Zielbild ersetzt ein schlanker Feldauszug diesen Aufruf — die Vorlagenbibliothek wird dort **gar nicht** gebraucht | Modul lädt und läuft im Node-Testlauf; die Auftragszeile enthält zeichengleich dieselben 17 Felder wie heute |
| 2e | **Golden-Tests**: erzeugte Mail == versendete Mail, zeichengleich, je Sprache | Vier grüne Vergleiche gegen echte Postmark-Inhalte |

🔴 **Die harte Stelle ist 2c, nicht der Port.** Die Berateridentität liegt in
`prod_activesupport.users` — in der Legacy-MySQL, nicht in der Plattform-DB. Das ist
dasselbe Hindernis wie Abschnitt 3 Zeile 3, nur von der anderen Seite gesehen: Der heutige
Weg holt den Coach per **SQL-JOIN**, der Zielweg (`api/lead-outbox-worker.js:669`,
`lookupCoach`) holt ihn per **HTTP** von `ac-reconnect.com/db-bridge.php`.

## 4b. Der Berater kommt per SQL statt per Fremdaufruf (Entscheidung Markus, 30.08.2026)

> ### 🔴 Grundsatzfrage: „Wir sind doch auf Coolify — wozu noch eine Bridge?"
>
> Beantwortet am 31.08.2026 am Quelltext und an der laufenden Bridge gemessen.
>
> **Weil die Bridge nichts mit dem Hosting zu tun hat.** Der Umzug hat zwei Dinge bewegt:
> die *Anwendung* (Vercel → Coolify) und die *Leaddaten* (Supabase → Plattform-DB). Die
> Bridge liest aber ein **drittes System**: `prod_activesupport` — die MySQL der
> ActiveSupport-/Herbalife-Mitgliederverwaltung. **Dort liegt die Berater-Stammdatenhaltung,
> und dieses System war nie Teil des Umzugs.** Es gehört uns nicht in dem Sinne, dass wir es
> mitnehmen könnten.
>
> **Was B3/B4 also wirklich erreichen:** Sie entfernen den **synchronen Fremdaufruf im
> Sendemoment** — nicht die Abhängigkeit von der Legacy-MySQL. Die bleibt, sie wandert nur
> vom Sendeweg in den Spiegel: n8n liest alle 15 Minuten `prod_activesupport.users` und
> schreibt nach `leads.berater`. Aus „bei jeder Mail einen fremden Server fragen" wird „alle
> 15 Minuten einmal nachführen, im Sendemoment nur noch die eigene DB lesen".
>
> Das ist der eigentliche Gewinn: **der teuerste Vorgang des Funnels hängt nicht mehr an der
> Verfügbarkeit eines fremden PHP-Endpunkts.** Fällt die Bridge aus, verzögert sich nur die
> Aktualität des Verzeichnisses; heute fiele der Mailversand aus.
>
> **Und deshalb kann `BRIDGE_URL` nicht einfach weg.** Der Vertrag
> (`scripts/lib/bridge-contracts.js`) führt **14 Aktionen**; `lookup_subdomain` ist eine
> davon. Weiterhin über dieselbe Bridge laufen unter anderem `forward_webhook` (die
> Lead-Übergabe an `contacts.hl-support.biz`), `track_event`, `write_analytics*`,
> `resolve_resume_token`/`resolve_resume_key` und `update_points_result`.
> 🔴 Ausserdem gibt es einen **zweiten Berater-Abruf im Funnelweg**: `src/lib/core.js:829`
> fragt aus dem Browser `/api/bridge` → `lookup_subdomain`, also bei **jedem Seitenaufruf**.
> B4 räumt ausdrücklich nur den **Coach-Pfad des Mailwegs** ab.
>
> **Was „die Bridge ganz weg" bedeuten würde:** die Kontakte-/Mitgliedermigration selbst —
> ein eigenes Vorhaben, kein Schritt in diesem Plan.
>
> 🔴 **Nachtrag 31.08.2026, Entscheidung Markus:** Das Quiz soll die Berateridentität
> **direkt aus MySQL** holen, statt über die Bridge — der Container erreicht `10.0.1.3:3306`
> vom Coolify-Host aus (belegt). Die Inventur aller verbliebenen Bridge-Verwendungen und der
> Umstellungsplan stehen in **[bridge-abloesen-direktzugriff.md](bridge-abloesen-direktzugriff.md)**.
> Dessen Schritt **BR3 löst B3/B4 ab** — bis dahin gilt die B-Reihe unten unverändert
> weiter. **Nicht beide gleichzeitig laufen lassen.**

**Ausgangslage.** `api/lead-outbox-worker.js:669` holte die Berateridentität per HTTP von
`ac-reconnect.com/db-bridge.php` — der letzte Fremdaufruf im Benachrichtigungsweg.

**Warum ein Spiegel und nicht ein direkter MySQL-Zugriff:** Die Anwendung hat bewusst
**keinen** MySQL-Treiber (Abhängigkeiten: `jsonwebtoken`, `postgres`, `react`, `react-dom`).
Ein zweiter Treiber wäre ein neuer Ausfallweg im teuersten Vorgang des Funnels.

### Vorher gemessen, nicht angenommen

| Frage | Messung 30.08. |
| --- | --- |
| Stimmt `berater_slug` == `users.sub_domain`? | **95 von 96** Quiz-Slugs gefunden |
| Was fehlt? | nur **`default`** — dazu gibt es in `users` gar keinen Satz |
| Wie oft war `default` betroffen? | 171 Leads, aber **0 von 245** Hot-Lead-Aufträgen |
| Gab es je `coach_email_missing`? | **0** — alle 245 Aufträge `done` |
| Doppelte `sub_domain`? | **0** — der Primärschlüssel trägt |
| Berater ohne Adresse? | **0** von 255 |
| Welche Coach-Felder braucht die Mail? | `email`, `first_name`, `organisation_name`, `country` und die Sprachfelder — alle in `users` vorhanden |

### ✅ Gebaut am 30.08.

| | Was | Beweis |
| --- | --- | --- |
| 1 | **`leads.berater`** — Verzeichnis auf der Plattform, Eigentümerin `leads_owner`, Rechte wie `lead_state` | Tabelle angelegt, Rechte gegengeprüft |
| 2 | **n8n «AC - Berater-Verzeichnis spiegeln»** (`IFOqAOYbUp8Zwnlk`), alle 15 Minuten `prod_activesupport.users` → `leads.berater`, mit Löschung verschwundener Slugs | 1. Lauf 255 geschrieben, 2. Lauf 255 geschrieben / **0 neu** → wiederholbar. Test-Webhook danach entfernt (404) |
| 3 | **`server/berater-verzeichnis.js`** — eigenes Modul nach dem Vorbild von `coach-insights-link.js`, damit der Weg testbar ist | **11 Tests**, Gesamtlauf 259 grün |
| 4 | **Schalter `COACH_LOOKUP_SOURCE`** im Worker | Standard `bridge` → ein Deploy ohne gesetzte Variable ändert **nichts** |

🔴 **Der Spiegel bricht laut ab**, wenn MySQL weniger als 50 Zeilen liefert oder doppelte
Slugs kommen. Eine leere Antwort sieht aus wie ein fehlgeschlagener Abruf — und würde
sonst das Verzeichnis leeren.

### Restweg, in dieser Reihenfolge

| # | Schritt | Beweis, bevor es weitergeht |
| --- | --- | --- |
| B1 | ~~**Deployen** mit `COACH_LOOKUP_SOURCE` ungesetzt~~ | ✅ **erledigt 30.08. 20:34.** Bewusst als **eigener, kleiner PR** (#123, drei Dateien) statt über den Arbeitszweig: der liegt 28 Commits vor `main` und hätte drei weitere, unabhängige Vorhaben mitgeliefert (E-Mail-Korrektur, Reputations-Pilot, Übersetzer-Erweiterungen) — zwei davon nutzersichtbar und nie in Produktion. Produktion trägt `6688a05`, `/health/ready` grün, `quelle: plattform`. Gegenprobe, dass wirklich nur der Schalter kam: `/api/confirm-email-correction` **weiterhin 404** |
| B2 | Auf **`beide`** stellen: beide Wege abfragen, die **Bridge entscheidet weiterhin**, Abweichungen landen als `[berater-vergleich]` im Containerprotokoll | ✅ **läuft seit 30.08. 20:39, erste Zahlen liegen vor.** `COACH_LOOKUP_SOURCE=beide` (is_literal) am 31.08. über die Coolify-API gegengeprüft, `/health/ready` grün, Outbox-Worker antwortet weiter mit 200. **Zwei Vergleichszeilen** (30.08. 20:51 `trix24`, 20:54 `ingeunterthiner`) — **beide mit Abweichung** in `organisation_name` und `country`. Auswertung unten |
| B3 | Auf **`verzeichnis`** stellen | 🟡 **Ursache behoben, Beweis steht aus.** Der Schattenlauf fand eine **echte** Abweichung in `organisation_name` (Markenname in jeder Hot-Lead-Mail) — Ursache am 31.08. gefunden und korrigiert (Spiegel nahm `o.name` statt `o.org_name`). Stichprobe von 12 Beratern jetzt deckungsgleich. Vor B3 fehlen: Deploy der Vergleichskorrektur und **frische** Vergleichszeilen. Siehe B2a |
| B4 | `BRIDGE_URL`/`BRIDGE_KEY` aus dem Coach-Pfad entfernen | Der Fremdaufruf ist aus dem Benachrichtigungsweg verschwunden |

#### 🔴 B2a — Auswertung des Schattenlaufs: B3 ist gesperrt

**Gemessen am 31.08.2026, 06:39–07:30 MESZ.** Zuerst der Rahmen:

| Prüfung | Messung |
| --- | --- |
| `/health/live` | `6688a05`, **dreimal über Zeit** gleich (R0: eine Messung ist kein Beweis) |
| `/health/ready` | `status: ready`, `quelle: plattform`, 35–40 ms |
| Abgrenzung | `/api/confirm-email-correction` → **404** (unverändert) |
| Containerstart | `uptime_s` 35.960 → Start **30.08. 20:40 MESZ**, deckt sich mit dem B2-Deploy |
| Schalter | `COACH_LOOKUP_SOURCE = beide` (`is_literal`), über die Coolify-API gelesen |
| Protokollfenster | 30.08. 18:39 UTC → 31.08. 05:05 UTC, 9.469 Zeilen, **2** Vergleichszeilen |

Beide Vergleiche fielen in einen erfolgreichen `/api/lead-outbox-worker`-Lauf (HTTP 200,
aufgerufen von `46.224.76.193`). **Der Versand lief unbeeinflusst weiter** — genau wie
gebaut. Und beide meldeten dieselben zwei Felder:

```
[berater-vergleich] {"slug":"trix24",          "bridge_gefunden":true,"verzeichnis_gefunden":true,"abweichungen":["organisation_name","country"]}
[berater-vergleich] {"slug":"ingeunterthiner", "bridge_gefunden":true,"verzeichnis_gefunden":true,"abweichungen":["organisation_name","country"]}
```

Beide Quellen wurden daraufhin **direkt** abgefragt — die Bridge mit demselben
`lookup_subdomain`, das der Worker benutzt, das Verzeichnis per `select` auf `leads.berater`:

| slug | Bridge | Verzeichnis | Urteil |
| --- | --- | --- | --- |
| `trix24` | `organisation_name` = **EaglesFit** | **EaglesFit-Support** | 🔴 **echte Abweichung** |
| `ingeunterthiner` | `organisation_name` = **Activecenter** | **Activecenter-Support** | 🔴 **echte Abweichung** |
| `trix24` | `address.country` = **CH**, flaches `country` fehlt | `country` = **CH** | 🟢 **Fehlalarm** |
| `ingeunterthiner` | `address.country` = **IT**, flaches `country` fehlt | `country` = **IT** | 🟢 **Fehlalarm** |

**Die zwei Abweichungen haben verschiedene Ursachen — und nur eine ist ein echtes Problem.**

**1. `country` ist ein Fehlalarm im Vergleich selbst, kein Datenunterschied.**
Die Bridge liefert das Land **verschachtelt** als `address.country`; ein flaches `country`
gibt es dort nicht. `vergleiche()` liest aber nur `ausBridge['country']` → `undefined` →
meldet Abweichung, obwohl beide Seiten `CH` bzw. `IT` tragen. Für das Verhalten ist es
folgenlos, weil der Verbraucher beide Formen kennt:
`api/lead-outbox-worker.js:444` liest `coach?.address?.country || coach?.country`.
🔴 **Der Vergleich misst hier am Verbraucher vorbei** und wird diesen Fehlalarm bei *jedem*
Berater melden — er würde B3 dauerhaft unsicher aussehen lassen. Das gehört korrigiert,
bevor weitere Zahlen gesammelt werden, sonst ertrinkt das echte Signal im Rauschen.

**2. `organisation_name` weicht wirklich ab — und ist nutzersichtbar.**
Das Feld wird zu `brandName` (`api/lead-outbox-worker.js:786`:
`coach?.organisation_name || coach?.org_name || coach?.company || 'Activecenter'`) und
steht damit **als Marken-/Absendername in jeder Hot-Lead-Mail**. Ein Umschalten auf `verzeichnis` würde aus „EaglesFit" **„EaglesFit-Support"**
machen — bei jedem betroffenen Berater, sofort und sichtbar.

**Ursache gefunden — es ist eine einzige Spalte.** Der Quelltext der Bridge liegt als
Spiegel im Nachbarrepo (`landing-page/_system/db-bridge.php`, dort noch unmigriert; die
Zeile ist am laufenden Endpunkt gegengeprüft). `lookup_subdomain` selektiert:

```sql
o.org_name AS organisation_name          -- Bridge
FROM users u LEFT JOIN organizations o ON u.organization_id = o.id
```

Der n8n-Spiegel nahm dagegen **`o.name`**. `organizations` führt beide Spalten:
`name` = „EaglesFit-Support", `org_name` = „EaglesFit". Kein Datenfehler, ein Abgriff auf
der falschen Spalte.

Ebenfalls aus dem Quelltext bestätigt: das Land steht in der Antwort **nur** im
`address`-Objekt (`'address' => ['street','postal','place','country']`), ein flaches
`country` gibt es dort nicht — genau die Form, an der sich der Vergleich verschluckt hat.

##### ✅ Beides korrigiert am 31.08.2026

| # | Korrektur | Beweis |
| --- | --- | --- |
| 1 | **Spiegel-SQL `o.name` → `o.org_name`** (n8n `IFOqAOYbUp8Zwnlk`) | Per API-PUT nach Verfahren `agent-core/skills/n8n-workflow-update`, **nie per SQL**. `versionId` `9aa90b0b…` → `641c9dea…`, Workflow weiter aktiv. Sicherung: `n8n/backups/berater-verzeichnis-spiegeln-2026-08-31-vor-org-name.json` |
| 2 | **`vergleiche()` liest die effektiven Werte** (`server/berater-verzeichnis.js`) | Neue Abbildung `EFFEKTIVER_WERT` spiegelt `detectCoachLanguage` und `buildHotLeadEmail`. Drei neue Tests mit der **echten** Bridge-Form; 262 Tests grün |

**Nachgemessen am laufenden System**, nicht angenommen:

- Nach dem Spiegellauf **05:30:13 UTC**: `trix24` → `EaglesFit`, `ingeunterthiner` →
  `Activecenter` — beide jetzt zeichengleich mit der Bridge.
- Das ganze Verzeichnis ist unbeschädigt: **255** Zeilen, **255** mit `organisation_name`,
  **0** noch auf `-Support`, 255 mit E-Mail und Land, 6 verschiedene Organisationen.
- **Gegenprobe über eine Zufallsstichprobe von 12 Beratern**: jeder einzeln gegen die
  **echte** Bridge abgefragt und durch die korrigierte `vergleiche()` geschickt →
  **12 deckungsgleich, 0 Abweichungen.**

🔴 **Der Testaufbau war mitschuldig.** Der bisherige Test baute die Bridge-Antwort *flach*
nach (`country: 'IT'`), also in einer Form, die es nie gab. Deshalb war der Fehlalarm im
Test unsichtbar. Die neuen Tests bilden die gemessene Form nach — verschachteltes
`address.country` und die Ausweichnamen, die die Mail liest.

##### Was jetzt noch fehlt

1. **Die Vergleichskorrektur ist noch nicht in Produktion.** Der Spiegel ist live, der Code
   liegt auf dem Arbeitszweig. Bis zum Deploy meldet der Schattenlauf weiterhin
   `["country"]` — **jetzt ein reiner Fehlalarm**, `organisation_name` ist raus. Ausliefern
   wie B1: kleiner, eigener PR gegen `main`, nicht über den Arbeitszweig.
2. **Danach frische Vergleichszeilen abwarten** (rund zwei Hot-Leads am Tag) — die zwei
   bisherigen sind mit dem alten Code und dem alten Spiegel entstanden und taugen nicht
   mehr als Beweis.
3. **Erst dann B3.**

##### 🟡 Nebenbefund: der Vergleich lebt nur im Containerprotokoll

Ein Deploy ersetzt den Container — die gesammelten `[berater-vergleich]`-Zeilen sind dann
**weg**. Das B2-Fenster überlebt keinen Zwischendeploy. Solange der Beweis für B3 an einem
flüchtigen Protokoll hängt, ist er zerbrechlich. **Empfehlung:** Abweichungen zusätzlich
haltbar schreiben (Zeile in `lead_events` oder eine kleine Tabelle `berater_vergleich`);
dann sind sie abfragbar, überleben Deploys und brauchen keinen Serverzugang.

##### 🔴 Zugangslage (für die nächste Sitzung wichtig)

- **Containerprotokoll und Env sind über die Coolify-API lesbar** — das ist der Weg, nicht SSH:
  ```bash
  # Token: agent-secrets → coolify.apiToken
  curl -s -H "Authorization: Bearer <apiToken>" \
    "https://coolify.hl-support.biz/api/v1/applications/yhoacszoiofuq6dg4mykyr7b/logs?lines=200000"
  curl -s -H "Authorization: Bearer <apiToken>" \
    "https://coolify.hl-support.biz/api/v1/applications/yhoacszoiofuq6dg4mykyr7b/envs"
  ```
- 🔴 **SSH auf `167.233.251.217` gibt es nicht** (mehr): `Permission denied (publickey)` mit
  allen vier vorhandenen Schlüsseln, während derselbe `id_rsa_server` auf `46.224.76.193`
  trägt. In `agent-secrets.json` ist zu dieser Box **nur ein UI-Login** hinterlegt, kein
  SSH-Schlüssel. Das widerspricht dem globalen Runtime-Hinweis „auf beiden Hosts am
  2026-08-28 verifiziert" — und **`docs/NURTURE_BETRIEB.md` setzt `ssh root@167.233.251.217`
  weiterhin voraus** (Wächter-Pflege). Das ist zu klären, bevor dort etwas ansteht.
- Die Plattform-DB ist von `10.0.1.4` (n8n) mit der Rolle `leads_n8n` lesbar
  (`docker exec n8n-postgres-1 psql -h 10.0.1.3 …`); `leads_app` ist dort **nicht**
  freigeschaltet (nur von `10.0.1.5`). Der `/api/v1/applications/…/execute`-Endpunkt
  existiert in dieser Coolify-Version **nicht** (404).

🔴 **Nicht angefasst:** `src/lib/core.js:829` hat einen **zweiten** `lookupCoach` — das ist
der Funnelweg, nicht der Mailweg. Er gehört in denselben Umbau, aber in einem eigenen
Schritt mit eigenem Beweis.

🟡 **`default` bleibt eine Lücke** — die gleiche wie heute: kein Verzeichniseintrag, also
kein Versand. Sie ist nie aufgetreten. Wer sie schliessen will, legt einen Satz mit
`slug = 'default'` an; der Spiegel würde ihn beim nächsten Lauf wieder löschen, weil er in
`users` fehlt — also besser dort anlegen.


🔴 **Reihenfolge ist nicht verhandelbar.** Schritt 5 vor Schritt 4 hiesse, den teuersten
Vorgang des Funnels ohne Netz umzuhängen.

## 5. Rückweg

Bis Schritt 7 bleibt der alte Weg vollständig vorhanden. Rückweg ist immer:
`OPTIN_OUTBOX_EMAIL_ENABLED` auf 0 und die zwei Postmark-Knoten im Post Processor wieder
aktivieren. Sicherung der Workflow-Definition vor jeder Änderung ist Pflicht
(Verfahren: `agent-core/skills/n8n-workflow-update` — Definition sichern, **API-PUT**, nie
per SQL, `versionId` muss sich ändern).

**Doppelversand ist die einzige wirklich teure Fehlerwirkung** dieses Umbaus: Wenn beide
Wege gleichzeitig senden, bekommt jeder Lead alles doppelt. Deshalb ist Schritt 5 als
*eine* Handlung formuliert — Schalter an **und** Knoten aus in derselben Stunde.

## 6. Was am 28.08.2026 bereits erledigt ist

- Der Weg ist gemessen und aufgeschrieben: [../MAILWEGE.md](../MAILWEGE.md)
- Postmark-Server `Typenanalyse` → **`Leadgen`** umbenannt (Token, Reputation und
  Historie unverändert; ID 10526929)
- **Tags** gesetzt: `hot_lead`, `hot_lead_legacy`, `alert_missing_member_id`,
  `alert_points_result_failed` im Repo; `optin_coach` und `lead_access` in den beiden
  Postmark-Knoten des Post Processors (neue `versionId`, Workflow aktiv geblieben)
- Doku-Korrektur: der Nurture-Sender läuft **bereits** auf der Plattform-DB

## 7. Was ausdrücklich offen ist

- Schritte 1–7 dieses Plans
- Die 47 Fremdmails (6 % des Leadgen-Servers: Hetzner-Angebote, Paperless, Domain-Sweep,
  n8n-Fehleralarme) gehören auf den Server `Admin` — kostenlos, aber ein eigener Handgriff
- `activecenter.info` hat **kein** DKIM und **keinen** Return-Path. Es sendet heute nichts
  von dort, die bestätigte Signatur `support@activecenter.info` bleibt aber eine geladene
  Waffe. Entweder DKIM einrichten oder die Signatur entfernen
- Die Nurture-Strecke läuft über **Mautic** auf den Postmark-Server `Mautic`
  (Bounce 2,05 % — der höchste im Konto). Zusammenlegen auf `Leadgen` als
  `broadcast`-Stream ist eine **Mautic**-Einstellung, keine n8n-Änderung
