# Meta-Tracking Live-Analyse

Stand: 19.06.2026

## Kurzfazit

Die fremde Analyse war an einem entscheidenden Punkt falsch: Live verwirft `init_lead` die Meta- und UTM-Felder nicht. Die Produktion hat bereits die neue RPC-Signatur und schreibt `utm_content`, `fbclid`, `fbc`, `fbp` und `event_source_url` in `lead_state`.

Das echte Problem liegt aktuell woanders:

1. `v_lead_state_full` gibt diese neuen Attribution-Felder noch nicht aus.
2. Das Analytics-Dashboard kann deshalb echte Anzeigenleistung noch nicht sauber pro Anzeige darstellen.
3. Meta sendet derzeit Namen in `utm_content`, aber noch keine stabilen Kampagnen-, Adset- und Anzeigen-IDs.
4. Die lokale Datei `supabase-lead-system-v2.sql` war veraltet und wurde auf den bestätigten Live-Stand nachgezogen.

## Live-Stand Supabase

### `init_lead`

Live-Signatur:

```text
init_lead(
  p_client_seed uuid,
  p_lead_hash text,
  p_member_id text,
  p_organisation_id text,
  p_ref_id text,
  p_ref_type text,
  p_berater_slug text,
  p_source_app text,
  p_funnel_key text,
  p_lang text,
  p_country text,
  p_utm_source text,
  p_utm_medium text,
  p_utm_campaign text,
  p_utm_content text,
  p_fbclid text,
  p_fbc text,
  p_fbp text,
  p_event_source_url text
)
```

Live-Funktion schreibt diese Felder in `lead_state`:

```text
utm_source
utm_medium
utm_campaign
utm_content
fbclid
fbc
fbp
event_source_url
```

Bei erneutem Init werden bestehende Werte nicht überschrieben, sondern nur leere Felder ergänzt.

### Feature-Flags

Live:

```text
new_lead_writer_enabled = true
new_lead_writer_percent = 100
legacy_writer_enabled = false
outbox_worker_enabled = true
```

Damit ist der neue Lead-Writer für Produktion vollständig aktiv.

### `lead_state`

Live enthält die wichtigen Attribution-Felder:

```text
utm_source
utm_medium
utm_campaign
utm_content
fbclid
fbc
fbp
event_source_url
```

### `v_lead_state_full`

Live enthält aktuell nur:

```text
utm_source
utm_medium
utm_campaign
```

Es fehlen:

```text
utm_content
fbclid
fbc
fbp
event_source_url
```

Das ist der Hauptgrund, warum die Analytics-Seite die Anzeigenleistung noch nicht sauber pro Anzeige auswerten kann.

## Datenqualität

### Meta-/Paid-Social-Opt-ins

| Zeitraum | Opt-ins | mit Kampagne | mit Anzeigeninhalt | mit fbclid | fbclid ohne Medium |
|---|---:|---:|---:|---:|---:|
| 7 Tage | 63 | 61 | 61 | 63 | 0 |
| 30 Tage | 168 | 159 | 143 | 149 | 0 |
| 90 Tage | 169 | 160 | 143 | 149 | 0 |

Bewertung:

- Die aktuelle Tracking-Qualität ist deutlich besser als die fremde Analyse behauptet.
- In den letzten 7 Tagen sind fast alle Meta-Opt-ins sauber attribuiert.
- Es gibt keine aktuellen Fälle mit `fbclid`, aber fehlendem `utm_medium`.

### Meta-/Paid-Social-Sessions inklusive Abbrecher

| Zeitraum | Sessions | Opt-ins | ohne Opt-in | mit Anzeigeninhalt | mit fbclid | fbclid ohne Medium |
|---|---:|---:|---:|---:|---:|---:|
| 7 Tage | 376 | 60 | 316 | 361 | 358 | 0 |
| 30 Tage | 959 | 168 | 791 | 833 | 834 | 0 |
| 90 Tage | 960 | 169 | 791 | 833 | 834 | 0 |

Bewertung:

- Auch Abbrecher haben überwiegend Attribution in `lead_state`.
- Die Aussage, Abbrecher hätten durch `init_lead` keine UTM-Verbindung, ist live nicht korrekt.

## Live-Stand Meta

Die aktiven Hauptanzeigen haben aktuell URL-Parameter:

```text
utm_source={{site_source_name}}
utm_medium=paid_social
utm_campaign={{campaign.name}}
utm_content={{adset.name}}__{{ad.name}}
```

Das funktioniert grundsätzlich, ist aber für langfristige Auswertung nicht ideal.

Problem:

- Namen können sich ändern.
- Sonderzeichen und Encoding erzeugen doppelte Schreibweisen.
- Kopien und Varianten lassen sich schwer sauber zusammenführen.
- Ein stabiler Join zur Meta API ist mit Namen fehleranfällig.

Empfohlene Erweiterung:

```text
utm_source={{site_source_name}}
utm_medium=paid_social
utm_campaign={{campaign.name}}
utm_content={{adset.name}}__{{ad.name}}
utm_campaign_id={{campaign.id}}
utm_adset_id={{adset.id}}
utm_ad_id={{ad.id}}
```

Alternativ oder zusätzlich:

```text
utm_term={{ad.id}}
```

## Bewertung der fremden Analyse

### Richtig

- Backfill-Fehler bei bestehenden Leads werden aktuell zu leise behandelt.
- Sprachwechsel mit Reload kann in Browsern ohne `localStorage` Attribution verlieren.
- Legacy-Pfade wären für Attribution ungeeignet, falls der neue Writer deaktiviert wäre.
- Für echte Anzeigenanalyse fehlen noch saubere stabile IDs.

### Falsch oder veraltet

- `init_lead` verwirft live nicht die neuen Attribution-Felder.
- Abbrecher verlieren live nicht grundsätzlich ihre UTM-Daten.
- `shouldUseNewWriter=false` ist live nicht aktiv; der neue Writer läuft zu 100%.
- Die lokale SQL-Datei war nicht der Live-Stand.
- Die behaupteten 37% UTM-Abdeckung passen nicht zur aktuellen Live-Datenqualität.

## Konkreter Maßnahmenplan

### 1. `v_lead_state_full` erweitern

Ziel:

Die vorhandenen Felder aus `lead_state` müssen in der View sichtbar werden:

```text
utm_content
fbclid
fbc
fbp
event_source_url
```

Warum:

Das ist der direkte Hebel, damit Analytics pro Anzeige wirklich mit Supabase-Daten arbeiten kann.

Priorität: sehr hoch

### 2. Ads-Dashboard auf echte Supabase-Conversions pro Anzeige erweitern

Aktuell:

- Meta API liefert pro Anzeige Spend, Klicks, Impressionen, Meta-Leads.
- Supabase liefert echte Leads, Hotleads und CTA nur gesamt.

Ziel:

Pro Anzeige anzeigen:

```text
Spend
Impressions
Clicks
Meta-Leads
Supabase-Opt-ins
Video 1 erreicht
Video 2 erreicht
Video 3 erreicht / Hotlead
CTA positiv
Kosten pro Supabase-Opt-in
Kosten pro Hotlead
Kosten pro CTA
```

Priorität: sehr hoch

### 3. Stabile Meta-IDs in URL-Parametern ergänzen

Ziel:

Neue Klicks sollen neben Namen auch IDs speichern:

```text
utm_campaign_id
utm_adset_id
utm_ad_id
```

Dafür braucht `lead_state` zusätzliche Spalten oder Speicherung im Event-Payload.

Empfohlen:

```text
lead_state.utm_campaign_id text
lead_state.utm_adset_id text
lead_state.utm_ad_id text
```

Warum:

Damit ist der Join zur Meta API stabil und unabhängig von Namen.

Priorität: hoch

### 4. Frontend-Attribution um neue ID-Parameter erweitern

`getLeadAttribution()` soll zusätzlich lesen und persistieren:

```text
utm_campaign_id
utm_adset_id
utm_ad_id
utm_term
```

Priorität: hoch

### 5. `init_lead` und `lead-track` um ID-Felder erweitern

Wenn neue ID-Spalten eingeführt werden, müssen beide Schreibpfade sie übernehmen:

```text
/api/lead/init
/api/lead-track form_submitted
```

Regel:

Erst-Attribution nicht überschreiben. Nur leere Felder ergänzen.

Priorität: hoch

### 6. Backfill-Logik härten

Der bestehende Backfill bei bereits existierenden Leads sollte nicht nur als stille Warnung laufen.

Verbesserung:

- Fehler in `lead_events` oder einem kleinen Monitoring-Log speichern.
- Kein Leadverlust riskieren.
- Init darf nicht scheitern, aber der Fehler muss sichtbar werden.

Priorität: mittel

### 7. Sprachwechsel gegen Attribution-Verlust absichern

Problemfall:

Browser ohne funktionierendes `localStorage` + Sprachwechsel + Reload.

Lösung:

- vor Reload aktuelle Attribution in `sessionStorage` sichern, wenn verfügbar
- oder UTM/Facebook-Parameter in der URL erhalten

Priorität: mittel

### 8. Historische Daten nicht blind überschreiben

Kein aggressiver Backfill über Namen.

Empfehlung:

- Bestehende Daten mit Namen auswerten.
- Für neue Daten IDs sauber erfassen.
- Optional später Mapping-Tabelle bauen:

```text
utm_content_name -> meta_ad_id
```

Nur für klare, eindeutige Fälle.

Priorität: niedrig bis mittel

## Reihenfolge

1. View `v_lead_state_full` um vorhandene Attribution-Felder erweitern.
2. Analytics-Dashboard pro Anzeige mit `utm_content` aus Supabase anbinden.
3. Meta-URL-Parameter um stabile IDs ergänzen.
4. Datenmodell und Code um ID-Felder erweitern.
5. Reload-/Sprachwechsel-Schutz einbauen.
6. Backfill/Monitoring verbessern.

## Umgesetzt am 19.06.2026

Live in Supabase erledigt:

- `lead_state` enthält jetzt zusätzlich `utm_campaign_id`, `utm_adset_id`, `utm_ad_id` und `utm_term`.
- `v_lead_state_full` gibt jetzt `utm_content`, `fbclid`, `fbc`, `fbp`, `event_source_url` sowie die neuen Meta-ID-Felder aus.
- `init_lead` nimmt die neuen Felder entgegen und schreibt sie beim Lead-Start mit.
- Indexe für spätere Anzeigen-Auswertung wurden ergänzt: `utm_ad_id` und `utm_content`.
- REST-Test gegen `/rest/v1/rpc/init_lead` bestätigt: Die Funktion ist über die Supabase-API erreichbar.

Lokal vorbereitet:

- Business Quiz sendet die neuen Meta-Felder an `lead-init`, `lead-track` und den Typeform-Adapter mit.
- Analytics ordnet Anzeigen zuerst über `utm_ad_id` zu und nutzt für bestehende Anzeigen `utm_campaign + utm_content` als Rückfall.
- Analytics zeigt pro Anzeige Opt-ins, Video 1, Video 2, Hot Leads und positive CTA-Signale.

Nicht verändert:

- Aktive Meta-Anzeigen wurden nicht angefasst.
- Bestehende URL-Tags in Meta bleiben unverändert, damit laufende Anzeigen nicht gestört werden.

Offener Schritt:

- Deployment ist erst sinnvoll, wenn der Git-Safety-Guard grün ist. Aktuell sind `business_leads_quiz` und `analytics` dirty; im Business-Quiz-Projekt liegen zusätzlich ältere Änderungen, die nicht zu diesem Tracking-Fix gehören.

## Wichtige Regel

Keine Änderung darf den Lead-Flow blockieren. Tracking muss immer nachrangig sein:

```text
Lead speichern > Tracking vollständig > Analytics perfekt
```

Wenn Tracking fehlschlägt, darf der Lead nicht verloren gehen.
