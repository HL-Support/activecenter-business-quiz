# A/B-Test `optin_phone_v1` — optionales Telefonfeld im Optin

Gebaut am 01.09.2026 auf Zweig `experiment/optin-phone-ab` (ab `origin/main`).
Zustand: **implementiert, Schalter aus** — bis zur Aktivierung sehen alle Besucher
das bekannte Optin, und kein Ereignis trägt eine Kennzeichnung.

## Was getestet wird

| | Variante A (bekannt) | Variante B |
|---|---|---|
| Formular | Vorname + E-Mail | Vorname + E-Mail + **Mobilnummer (optional)** |
| Unterzeile | `optin_form_subheading` | `optin_form_subheading_b` („… auf Wunsch zusätzlich direkt aufs Handy") |

Bewusste Entscheidung von Markus: Feld **und** Text zusammen in B. Ein gemessener
Unterschied ist damit der Kombination zuzuschreiben, nicht einer einzelnen Änderung.

## Wer teilnimmt

Nur Anzeigen-Traffic: `utm_medium ∈ {paid_social, paid}` oder
`utm_source ∈ {fb, ig, facebook, meta, an, th}` — dieselbe Regel wie im
Anzeigen-Cockpit. Organik sieht immer Variante A und wird nicht gekennzeichnet.

Zuweisung deterministisch aus dem `lead_hash` (Zeichensumme, Parität):
dieselbe Person bekommt bei Wiederkehr dieselbe Variante, ohne dass etwas
Neues gespeichert wird. Erwartete Aufteilung ~50/50.

## Schalter

`OPTIN_PHONE_EXPERIMENT.enabled` in `src/lib/core.js` — bewusst eine
Codekonstante statt eines app_config-Kanals: Aktivierung wie Abschaltung ist ein
Ein-Zeilen-Commit plus CI-Deploy (Minuten). Ein Not-Aus ohne Deploy ist für ein
optionales Feld nicht nötig, und jeder zusätzliche Konfigurationsweg wäre mehr
System für weniger Nutzen.

## Datenfluss (alles vorhandene Wege, kein Schema geändert)

* Kennzeichnung: `experiment_name` / `experiment_variant` (+ `phone_provided`
  beim Absenden) reiten im Payload der **bestehenden** Ereignisse `optin_viewed`
  und `form_submit`/`form_submitted` → `lead_events.payload` (JSONB). Die
  Ereignis-Positivliste bleibt unberührt.
* Telefonnummer: `form_submitted`-Payload `phone` → Ingest patcht nach
  `lead_state.phone` (api/lead-track.js, bereits vorhanden). Zusätzlich geht
  `phone` im `meta`-Block an den Contacts-Webhook (Bridge nimmt
  `submissionPayload.phone` an). Ohne Eingabe fehlt der Schlüssel komplett —
  Verhalten wie heute.

## Auswertung

```sql
select coalesce(e.payload->>'experiment_variant','?')            as variante,
       count(distinct e.lead_hash)                               as optin_gesehen,
       count(distinct e.lead_hash) filter
         (where s.form_submitted_at is not null)                 as optins,
       count(distinct e.lead_hash) filter
         (where s.phone is not null and s.mysql_contact_id is null) as nummer_aus_dem_feld
from leads.lead_events e
join leads.lead_state s using (lead_hash)
where e.event_name = 'optin_viewed'
  and e.payload->>'experiment_name' = 'optin_phone_v1'
group by 1;
```

`mysql_contact_id is null` trennt Feld-Eingaben von den Alt-Kontakt-Übernahmen
(Stand 01.09.2026 stammen alle 22 vorhandenen Nummern aus dem Alt-Abgleich,
keine aus dem Quiz — es gab nie ein Feld).

**Laufzeit realistisch:** ~230 Anzeigen-Leads/Monat erreichen den Optin-Screen,
also ~115 je Variante. Eintragquote in B auf ±5 Punkte: **6–8 Wochen**.
Schutzvergleich der Optin-Rate erkennt in dieser Zeit nur grobe Einbrüche
(≥ 10 Punkte). Früher abbrechen, wenn B sichtbar einbricht; nicht früher
feiern, wenn B vorn liegt.

## Aktivierung (nach Review der Vorschau)

1. `enabled: false` → `true` in `src/lib/core.js`, Commit, PR, CI-Deploy.
2. Startdatum hier nachtragen: ____
3. Cockpit (ads.hl-support.biz): Experiment-Kasten einschalten — Markus' Agent
   ergänzt ihn bei Aktivierung aus obiger SQL.

## Rückbau

Schalter auf `false` genügt betrieblich. Vollständiger Rückbau = diesen Zweig
revertieren; die Ereignis-Payloads vergangener Teilnehmer bleiben als
Messhistorie stehen.
