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

## Vertragstests

`scripts/tests/optin-phone-experiment.test.js` bewacht seit dem 01.09.2026:

1. Der Schalter wird **aus** ausgeliefert; ohne Aktivierung keine Variante.
2. Nur Anzeigen-Traffic nimmt teil (Medium, Quelle, fbclid-Rückfall) — Organik nie.
3. Die Zuteilung (`optinExperimentVariantFromHash`, pur und getrennt exportiert)
   ist deterministisch und teilt einen realistischen Hash-Korpus 45–55 %.
4. Ohne Extras trägt **kein** Submit-Weg einen Experiment- oder Telefonschlüssel —
   der schlafende Zweig verändert nichts.
5. Mit Variante B reiten `phone`/`experiment_*`/`phone_provided` korrekt mit.

Die Schalter-Tests sind zustandsabhängig formuliert: Nach dem Aktivierungs-Commit
prüfen dieselben Tests die eingeschaltete Verdrahtung, statt rot zu werden.

## Vorschau (visuelle Abnahme, ohne Schalter und ohne Messung)

`?optin_vorschau=b` (bzw. `=a`) erzwingt die **Anzeige** der Variante —
unabhängig von Schalter, Traffic-Herkunft und Zuteilung. Eine erzwungene
Ansicht wird **nie** als Experiment gekennzeichnet: Vorschau-Proben tauchen
in der Auswertung nicht auf und verzerren nichts.

* **Sobald der Zweig deployt ist** (Merge mit Schalter aus genügt):
  `https://quiz.activecenter.info/<slug>?optin_vorschau=b`
* **Vorher lokal:** `npm run build && node server/app-server.js`, dann
  `http://localhost:3000/markus?optin_vorschau=b` — kein Editieren des
  Schalters mehr nötig.

⚠️ Ein **abgeschickter** Vorschau-Test ist ein echter Opt-in: Lead, Mails und
(falls eingegeben) Telefonnummer laufen den echten Weg — nur ohne
Experiment-Kennzeichnung. Für Proben gilt die übliche Probenhygiene
(aufräumen wie am 31.08.; die `lead_processing_jobs` der Probe stehen lassen).

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

### Wächter der Aufteilung (nach der ersten Woche prüfen)

`optin_gesehen` je Variante aus obiger SQL muss nahe 50/50 liegen. Liegt eine
Variante bei den dann erwartbaren ~25–30 Teilnehmern je Seite klar vorn
(gröber als 65/35), ist das kein Zufall zum Weitermessen, sondern ein
Zuweisungsfehler: **stoppen und die Zuteilung prüfen**, bevor Wochen in schiefe
Daten laufen. (Der Fachbegriff dafür ist Sample Ratio Mismatch.)

### Testdisziplin im Messfenster

Während der Laufzeit **keine anderen Änderungen** an Optin-Screen, Result-Seite
oder den Texten davor — die Phasen aus `CONVERSION_OPTIMIERUNG_PLAN.md` kommen
danach, nicht parallel. Eine Änderung zur Zeit, sonst ist unklar, was wirkt.

## Aktivierung (nach Review der Vorschau)

0. 🔴 **Voraussetzung — Entscheidung Markus:** erst nach der B5-Umschaltung
   (`CONTACTS_QUIZ_MODUS=an`) **und** einem ruhigen Fenster von einigen Tagen.
   Das Telefonfeld verändert den Opt-in-Payload Richtung contacts — genau den
   Weg, den der B4/B5-Schattenlauf vermisst. Plan B §9b: nie zwei Änderungen
   gleichzeitig auf demselben Versandweg.
1. `enabled: false` → `true` in `src/lib/core.js`, Commit, PR, CI-Deploy.
2. Startdatum hier nachtragen: ____
3. Cockpit (ads.hl-support.biz): Experiment-Kasten einschalten — Markus' Agent
   ergänzt ihn bei Aktivierung aus obiger SQL.

## Rückbau

Schalter auf `false` genügt betrieblich. Vollständiger Rückbau = diesen Zweig
revertieren; die Ereignis-Payloads vergangener Teilnehmer bleiben als
Messhistorie stehen.
