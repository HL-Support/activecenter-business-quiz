# Nurture Impact Tracking - Implementationsplan

## Ziel

Wir wollen messen, ob die Mautic-/n8n-Nurture-Mails Menschen wieder in den Business-Leads-Quiz-Funnel zurueckbringen und ob sie danach weitergehen.

Wichtig: Meta Ads bleiben die Akquisequelle. Nurture darf die bestehenden UTM-Felder nicht ueberschreiben.

## Grundprinzip

Meta nutzt weiterhin die normalen Tracking-Felder:

- `utm_source`
- `utm_medium`
- `utm_campaign`
- `utm_content`
- `fbclid`
- `fbc`
- `fbp`

Nurture nutzt eigene Parameter mit Prefix `acn_`:

- `acn_phase`
- `acn_email`
- `acn_run`
- optional spaeter: `acn_variant`

`acn` steht fuer `Activecenter Nurture`.

Beispiel:

```text
https://business.activecenter.info/markus?r=abc123&target=videos&acn_phase=A2&acn_email=13&acn_run=20260603_1000
```

## Nichtziele

- Keine `utm_*`-Werte fuer Nurture setzen.
- Keine `last_utm_*`-Felder durch Nurture ueberschreiben.
- Kein Wechsel der Lead-Quelle von Meta zu Nurture.
- Keine neue Wahrheit neben Supabase erzeugen.
- Keine Workarounds in Mautic, wenn die Website/Supabase sauber tracken kann.

## Phase 1: Link-Erweiterung im Nurture-Sender

### Aufgabe

Der n8n-/Mautic-Nurture-Sender haengt an jeden Resume-Link die passenden `acn_*`-Parameter an.

### Parameter

| Parameter | Beispiel | Bedeutung |
| --- | --- | --- |
| `acn_phase` | `A2` | Nurture-Phase, aus der der Klick kommt |
| `acn_email` | `13` | Mautic Email-ID oder interne Email-ID |
| `acn_run` | `20260603_1000` | Lauf-ID des Cron-/Versandlaufs |
| `acn_variant` | `de_feuer_freedom_vehicle` | Optional, erst spaeter falls noetig |

### Regeln

- Bestehende Query-Parameter duerfen nicht kaputtgehen.
- Wenn der Link bereits `?r=...&target=videos` hat, werden `&acn_phase=...` usw. angehaengt.
- Werte muessen URL-encoded werden.
- `lead_hash` wird nicht als URL-Parameter benoetigt, weil der Resume-Key serverseitig zum Lead aufgeloest wird.

## Phase 2: Website erkennt Nurture-Parameter

### Aufgabe

Die Business-Quiz-Seite liest beim Laden:

- `acn_phase`
- `acn_email`
- `acn_run`
- optional `acn_variant`

Die Website nutzt diese Werte nur fuer Event-Tracking. Sie darf damit keine UTM-Felder und keine Lead-Quelle veraendern.

### Timing

Das Event soll erst geschrieben werden, wenn der Resume-Key erfolgreich aufgeloest wurde und der Lead/Hash bekannt ist.

Nicht direkt beim statischen Seitenaufruf loggen, weil sonst ungueltige oder abgebrochene Resume-Links falsche Nurture-Klicks erzeugen.

## Phase 3: Supabase Event schreiben

### Event

```text
event_name = nurture_resume_opened
```

### Ziel-Tabelle

Bestehende Tabelle:

```text
lead_events
```

### Pflichtfelder

- `event_name = nurture_resume_opened`
- `lead_hash`
- `session_hash`, falls verfuegbar
- `event_at`
- `payload`

### Payload

```json
{
  "phase": "A2",
  "email_id": "13",
  "run": "20260603_1000",
  "variant": "",
  "source": "mautic",
  "resume_target": "videos"
}
```

### Dedupe-Regel

Minimal fuer Phase 1:

- Pro `lead_hash + acn_phase + acn_email + acn_run` nur einmal als `nurture_resume_opened` zaehlen.

Technisch kann das entweder beim Schreiben verhindert werden oder spaeter in Analytics per `distinct`.

Empfehlung fuer den Start: Event immer schreiben, aber Analytics zaehlt distinct. Dadurch verlieren wir keine Debug-Informationen.

## Phase 4: Folgeaktionen auswerten

Nach `nurture_resume_opened` werden bestehende Events genutzt.

Keine neuen Events fuer Dinge bauen, die bereits sauber existieren.

Relevante bestehende Signale:

- Video gestartet
- Video fortgesetzt
- Video abgeschlossen
- `cta_type = whatsapp`
- `cta_type = spaeter`
- bestehende CTA-/Lead-Events

### Auswertungsfenster

Startempfehlung:

- Folgeaktion innerhalb von 7 Tagen nach `nurture_resume_opened`

Spaeter optional:

- 24 Stunden
- 72 Stunden
- 7 Tage
- 14 Tage

## Phase 5: /analytics Anzeige

### Neuer Bereich

```text
Nurture Wirkung
```

### Minimal-KPIs

Pro Phase:

- gesendet
- ueber Resume-Link zurueckgekommen
- danach weitergemacht
- CTA geklickt

### Beispiel

```text
A2 gesendet: 100
A2 zurueckgekommen: 28
A2 danach Video 1 gestartet/abgeschlossen: 14
CTA nach Nurture: 3
```

### Datenquellen

| KPI | Quelle |
| --- | --- |
| gesendet | `lead_events.event_name = nurture_sent` |
| zurueckgekommen | `lead_events.event_name = nurture_resume_opened` |
| danach weitergemacht | bestehende Video-/Progress-Events nach `nurture_resume_opened` |
| CTA nach Nurture | bestehende CTA-Events oder `cta_type` nach `nurture_resume_opened` |

### Filter

Die Anzeige soll filterbar sein nach:

- Phase: `A2`, `B1`, `C1`, `D1`
- Zeitraum
- Coach
- Sprache, optional

## Phase 6: Qualitaetsregeln

### Meta sauber halten

Wenn ein Lead aus Meta Ads kommt und spaeter durch Nurture zurueckkehrt:

- `utm_source = facebook` oder der urspruengliche Meta-Wert bleibt erhalten.
- `utm_medium = paid_social` bleibt erhalten.
- `fbc/fbp` bleiben erhalten.
- Nurture wird nur als Rueckkehr-/Reaktivierungsereignis gemessen.

### Kein Statuswechsel nur durch Oeffnung

`nurture_resume_opened` darf keinen Funnel-Fortschritt setzen.

Funnel-Fortschritt entsteht nur durch echte Aktionen:

- Video gestartet/angesehen
- Formular/CTA geklickt
- finale Entscheidung

### Testkontakte ausschliessen

In Analytics muessen Testkontakte ausgefiltert werden, analog zu den bestehenden Regeln.

Nurture-Events fuer Testkontakte duerfen existieren, sollen aber nicht in den echten KPIs zaehlen.

## Phase 7: Umsetzung in kleinen Paketen

### Paket 1: Nurture-Link-Parameter

- n8n/Mautic-Linkbuilder erweitert Resume-Links um `acn_phase`, `acn_email`, `acn_run`.
- Keine Website-Aenderung.
- Test: generierter Link enthaelt bestehende Resume-Parameter plus `acn_*`.

### Paket 2: Website Event Tracking

- Business-Quiz liest `acn_*`.
- Nach erfolgreichem Resume-Resolve wird `nurture_resume_opened` in Supabase geschrieben.
- Keine UTM-Felder werden veraendert.
- Test: echter Resume-Link mit `acn_*` erzeugt genau ein nachvollziehbares Event.

### Paket 3: Analytics Query

- /analytics liest `nurture_sent` und `nurture_resume_opened`.
- Erste KPI-Box fuer Nurture Wirkung.
- Testkontakte werden ausgeschlossen.

### Paket 4: Folgeaktions-Logik

- /analytics verbindet `nurture_resume_opened` mit danach folgenden Video-/CTA-Events.
- Zeitfenster: 7 Tage.
- Ausgabe pro Phase.

### Paket 5: Feinschliff

- Phase-/Coach-/Zeitraumfilter.
- Optional Variantenvergleich.
- Optional Export fuer Kampagnenanalyse.

## Akzeptanzkriterien

- Ein normaler Meta-Ad-Lead behaelt seine Meta-UTMs unveraendert.
- Ein Nurture-Klick erzeugt `nurture_resume_opened`.
- Ein Nurture-Klick ohne gueltigen Resume-Key erzeugt keinen echten Lead-Erfolg.
- /analytics zeigt pro Phase gesendet, zurueckgekommen, weitergemacht und CTA.
- Mautic muss fuer diese Auswertung keine UTM-Felder zweckentfremden.
- Andere Systeme koennen weiterhin Supabase als zentrale Wahrheit nutzen.

## Offene Entscheidungen

- Soll `acn_run` pro Cron-Lauf oder pro Kontakt eindeutig sein?
- Soll `acn_email` die Mautic Email-ID oder unsere interne Email-Variant-ID sein?
- Sollen spaeter Oeffnungen der Mail selbst gemessen werden oder nur Resume-Klicks?
- Soll die D1-Mail nach dem Frontend-Fix direkt auf die finale CTA-Seite fuehren und ebenfalls `acn_*` tragen?

## Empfehlung

Phase 1 bewusst schlank halten:

1. Nurture haengt `acn_phase` und `acn_email` an Resume-Links.
2. Business-Quiz schreibt `nurture_resume_opened` nach erfolgreichem Resume-Resolve.
3. /analytics zeigt zuerst nur einfache Phase-KPIs.
4. Erst danach werden Folgeaktionen und Varianten tiefer ausgewertet.

Damit bleiben Meta Ads sauber die Akquisequelle, waehrend Nurture als Rueckkehr- und Reaktivierungswirkung messbar wird.

## Umsetzungsstatus

Stand: 2026-06-03

### Implementiert

- Business-Quiz erkennt `acn_phase`, `acn_email`, optional `acn_run` und `acn_variant`.
- Das Event `nurture_resume_opened` wird erst nach erfolgreichem Resume-Resolve geschrieben.
- Das Event wird ueber den bestehenden `/api/lead-track`-Pfad in `lead_events` gespeichert.
- Es werden keine `utm_*`-Felder geaendert.
- /analytics zeigt `Nurture Wirkung` mit:
  - gesendet
  - Resume-Rueckkehr
  - Video danach
  - CTA danach
- /analytics wertet zusaetzlich Tier-0 aus: bestehende Folgeevents innerhalb von 7 Tagen nach `nurture_sent`.

### Link-Anleitung fuer den Mail-Agenten

Jeder Nurture-Button, der zur Quiz-/Video-/Final-Seite zurueckfuehrt, muss die bestehenden Resume-Parameter behalten und am Ende diese Parameter bekommen:

```text
acn_phase=<PHASE>&acn_email=<MAUTIC_EMAIL_ID>
```

Beispiele:

```text
https://business.activecenter.info/markus?r=abc123&target=videos&acn_phase=A2&acn_email=13
```

```text
https://business.activecenter.info/lisa?r=xyz789&target=videos&acn_phase=D1&acn_email=42
```

Regeln:

- `acn_phase` ist die Nurture-Phase: `A2`, `B1`, `C1`, `D1`.
- `acn_email` ist die Mautic Email-ID, identisch zu `nurture_sent.payload.email_id`.
- Wenn der Link schon Query-Parameter hat, mit `&acn_phase=...` anhaengen.
- Wenn der Link noch keine Query-Parameter haette, mit `?acn_phase=...` starten.
- Keine `utm_source`, `utm_medium`, `utm_campaign` oder `utm_content` fuer Nurture setzen.
- Keine Meta-Parameter veraendern.
- `lead_hash` nicht in die URL schreiben.
- `acn_run` und `acn_variant` fuer v1 weglassen, ausser sie werden spaeter bewusst eingefuehrt.

### Erwartetes Supabase-Event

Nach erfolgreichem Klick auf einen gueltigen Resume-Link schreibt die Website:

```text
event_name = nurture_resume_opened
```

Payload-Beispiel:

```json
{
  "acn_phase": "A2",
  "acn_email": "13",
  "source": "mautic",
  "resume_target": "videos",
  "last_video_step": 1
}
```

Die Event-ID ist stabil pro `lead_hash + phase + email_id`, damit Mehrfachklicks derselben Mail nicht mehrfach als Rueckkehrer gezaehlt werden.

---

## Umsetzungsstatus

### Paket 1: Nurture-Link-Parameter — ✅ ERLEDIGT (2026-06-04)

An alle 32 aktiven Nurture-Templates (A2/B1/C1/D1, DE+IT) wurde an den Resume-Link
`&acn_phase=<A2|B1|C1|D1>&acn_email=<mautic_email_id>` angehängt.

- Vorgehen: **direkt die Live-Templates gepatcht** (GET live -> nur den Token erweitert -> PATCH),
  NICHT aus lokalen Dateien neu gebaut -> keine Gefahr, neuere Live-Stände zu überschreiben.
- Pro Template beide Button-Vorkommen (VML + non-mso), je `{contactfield=ac_last_video_access_url}`
  -> `{contactfield=ac_last_video_access_url}&acn_phase=...&acn_email=...`. Sonst byte-identisch (verifiziert).
- Lokale Content-Dateien synchron gehalten (CTA-Zeilen), Reconciliation 32/32 MATCH.
- Betroffene IDs: A2 13-16/98-101 · B1 26-29/102-105 · C1 34,95,96,97/106-109 · D1 39-42/110-113.

**Verifikation — ✅ ERLEDIGT (durch Produktionsdaten, festgestellt 2026-08-18):** Die `acn_`-Parameter
überleben den kompletten Klickweg. Beweis: In `lead_events` liegen 95 `nurture_resume_opened`-Events
mit intakten `acn_phase`/`acn_email`-Werten (zuletzt 10.08.2026, Phase A2). Auch Follow-up-Phasen
senden die Parameter (A3-Event vom 08.08.2026 mit `acn_email=18` nachgewiesen).

Hinweis zur Variante: `acn_variant`/`acn_run` bleiben in den Template-Links bewusst leer. Die
Copy-Variante ist trotzdem vollständig herleitbar, weil jede Mautic-Template-ID genau einer
Kombination aus Phase, Sprache und Variante entspricht (Mapping: Sender-Node `Code - Select Email ID`
bzw. `business_leads_quiz/scripts/backfill-nurture-sent-events.py` `PHASE_IDS`).

### Paket 2: Website-Event `nurture_resume_opened` — ✅ ERLEDIGT
`bootstrap.js` liest `acn_*` nach erfolgreichem Resume-Resolve und schreibt 1 Event in `lead_events`
(stabile Event-ID `nurture_resume_opened_<lead_hash>_<PHASE>_<email_id>`, live seit Juni 2026).

### Paket 0 (Empfehlung): Analytics-Korrelation auf bestehenden Daten — ✅ ÜBERHOLT
Ersetzt durch die zentrale Nurture-Zentrale in HL-Support Analytics (seit 06.08.2026):
Personen-Funnel (Empfänger → Rückkehrer → Fortsetzer) über die geschützten `nurture-*`-APIs.
Betrieb und Diagnose: `HL-Support_Analytics/docs/runbooks/nurture-monitoring.md`.
