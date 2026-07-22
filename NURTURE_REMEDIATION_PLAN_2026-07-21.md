# Business Leads Quiz: Reparatur- und Optimierungsplan für das Nurture-System

Stand: 21.07.2026

## Was genau kaputtging

Der zweite Versandpfad hat am 19.06.2026 funktioniert. Das belegt mem0 mit 20 echten Pilot-Sendungen: je fünf A3, B2, C2 und D2.

Am 23.06.2026 verlor der n8n-Knoten `Supabase - Log Sent` bei einem späteren Workflow-Update seine gültige Expression-Hülle. Bis zum 22.06. begann der Body korrekt mit:

```text
={{ (() => { ... })() }}
```

Seit Version `a66a50ba...` beginnt er nur noch mit einem JavaScript-Block. n8n wertet diesen Block nicht als Expression aus. Deshalb schreibt der Knoten keine `nurture_sent`-Ereignisse mehr.

Der Versand läuft trotzdem weiter. Der Logger ist als nicht blockierender Side-Tap mit `onError: continueRegularOutput` konfiguriert. n8n meldet den Gesamtlauf daher als erfolgreich.

Das hat zwei Folgen:

1. A3, B2, C2 und D2 werden nie fällig. Ihre Zeitlogik sucht die vorherige Mail ausschließlich in `lead_events.nurture_sent`.
2. Die Analytics-Auswertung „Nurture Wirkung“ verliert ihre Versandbasis. Resume, Video und CTA lassen sich nicht mehr sauber einer gesendeten Mail zuordnen.

Mautic schützt gleichzeitig vor doppelten Erstsendungen. Das Feld `ac_nurture_sent_phases` enthält A2, B1, C1 oder D1 bereits. So entsteht eine Sackgasse: n8n hält die erste Mail für ungesendet, Mautic verhindert ihre Wiederholung, und die zweite Mail startet nie.

## Verbindliche Regeln aus der Dokumentation

Diese Regeln bleiben beim Fix unverändert:

- Supabase `v_lead_state_full` entscheidet über Phase und Fortschritt.
- `lead_hash` ist die kanonische Lead-ID.
- Mehrere Sessions werden über `email_normalized` zu einer Person zusammengeführt.
- Ein CTA in einer beliebigen Session stoppt das Video-Nurture vollständig.
- Testkontakte werden über den neuesten Markierungs-Event ausgeschlossen.
- Der höchste Video-Rank gewinnt. Bei Gleichstand gewinnt die zuletzt aktive Session.
- Mautic liefert nur Personalisierung, DNC und Versand.
- Native Mautic-DNC muss vor jedem Send explizit geprüft werden. Der transaktionale Endpoint blockiert DNC nicht zuverlässig.
- Jeder Send bekommt einen frischen Resume-Link aus `generate_resume_token`.
- A2, A3, B1, B2, C1 und C2 führen zu `videos` mit passendem Schritt.
- D1 und D2 führen zu `final`, Schritt 3.
- `ac_last_video_access_url` ist nur ein Versand-Cache.
- Nurture verändert keine UTM- oder Meta-Akquisefelder.
- Rückkehrlinks behalten `acn_phase` und `acn_email`.
- E1, Mautic-ID 48, bleibt dauerhaft deaktiviert.
- Der alte segmentbasierte Inactivity Checker bleibt Archiv. Er darf nicht parallel aktiviert werden.
- n8n-Änderungen laufen über API GET, lokalen Patch, API PUT, neue `versionId` und Container-Neustart. Kein direktes SQL-Update.

## Phase 1: Sofort absichern

Ziel: Keine unkontrollierte zweite Welle auslösen, während wir den Logger reparieren.

1. Aktuellen Workflow per n8n API exportieren und unverändert sichern.
2. Aktive Version, Nodes, Verbindungen, Settings und Credentials als Prüfsumme festhalten.
3. Vor dem Fix eine temporäre Recovery-Bremse für A3/B2/C2/D2 setzen:
   - nur tagsüber
   - kleine Menge pro Phase
   - älteste fällige Kontakte zuerst
4. A2/B1/C1/D1 weiterlaufen lassen, solange DNC-, CTA-, Test- und Resume-Gates intakt sind.
5. Keine alten Mautic-Kampagnen und keine archivierten n8n-Workflows aktivieren.

Warum die Bremse nötig ist: Nach dem historischen Backfill können viele zweite Erinnerungen gleichzeitig fällig werden.

## Phase 2: Logger korrekt reparieren

Der vorhandene Repository-Patch `n8n/patch-nurture-subject-logging.js` liefert die richtige Grundform. Der neue Body muss mindestens diese Felder schreiben:

```json
{
  "event_uid": "nurture_sent_<stable-key>",
  "lead_hash": "qz_...",
  "event_name": "nurture_sent",
  "source_app": "business_leads_quiz",
  "funnel_key": "business",
  "event_at": "<echte Versandzeit>",
  "payload": {
    "phase": "a2",
    "email_id": 13,
    "language": "de",
    "variant": "freedom",
    "subject": "...",
    "source": "mautic"
  }
}
```

Wichtige Änderungen:

- `payload` verwenden. Der Live-Body nutzt stellenweise `event_meta`, während Leser und Dokumentation `payload` erwarten.
- Einen stabilen `event_uid` verwenden. `Date.now()` allein ist kein sicherer Dedupe-Schlüssel.
- POST mit `on_conflict=event_uid` und `Prefer: resolution=ignore-duplicates,return=minimal` senden.
- Den Logger nicht mehr still übergehen lassen. Ein Fehler nach erfolgreichem Mautic-Send muss den Error-Workflow auslösen.
- Im Fehlertext müssen Lead-Hash, Phase, Mautic-Kontakt, Mautic-Mail-ID und Send-Zeit stehen.

Empfohlener Schlüssel für neue Sendungen:

```text
nurture_sent_<lead_hash>_<phase>
```

Pro Person und Phase ist nur eine Sendung erlaubt. Die Personenkonsolidierung muss vor der Schlüsselbildung abgeschlossen sein.

## Phase 3: Einzeltest vor echtem Versand

Der Testkontakt muss mit `test_lead_marked` gekennzeichnet sein.

Prüfreihenfolge:

1. Testlead auf eine fällige erste Phase setzen.
2. Workflow manuell mit genau diesem Lead ausführen.
3. Mautic-Send und `email_stats` prüfen.
4. Genau einen `nurture_sent`-Event mit korrektem `payload` prüfen.
5. `ac_nurture_sent_phases` prüfen.
6. Resume-Link auflösen und Ziel sowie Schritt prüfen.
7. Gleichen Lauf wiederholen. Es darf keine zweite Mail entstehen.
8. Testweise eine zweite Phase fällig machen.
9. Genau eine A3/B2/C2/D2-Mail prüfen.
10. Analytics kontrollieren: gesendet, Resume, Video danach und CTA danach.
11. DNC-Test wiederholen. Es darf keine Mail gesendet werden.
12. CTA- und Testmarkierungs-Gates separat prüfen.

Freigabekriterium: Alle zwölf Prüfungen bestehen. Ein grüner n8n-Lauf allein reicht nicht.

## Phase 4: Fehlende Versandereignisse rekonstruieren

Die 230 Erstsendungen seit dem 30.06. fehlen in Supabase. Der Logger-Fix stellt sie nicht rückwirkend her.

Backfill-Quelle:

- Mautic `email_stats.id`
- `lead_id`
- `email_id`
- `date_sent`
- `is_failed`

Vorgehen:

1. Nur die 48 IDs der aktiven ersten Phasen A2/B1/C1/D1 auswählen.
2. Nur `is_failed = 0` übernehmen.
3. Mautic-Kontakt über E-Mail und aktuelle Personen-Konsolidierung einem kanonischen `lead_hash` zuordnen.
4. Bei mehrdeutiger Zuordnung den dokumentierten Gewinner wählen: höchster Rank, dann jüngstes `last_seen_at`.
5. Originale `date_sent` als `event_at` erhalten.
6. Stabilen Backfill-Key verwenden:

```text
nurture_sent_mautic_stat_<email_stats.id>
```

7. `payload.backfill = true` und `payload.backfill_source = mautic.email_stats` setzen.
8. Vor dem Schreiben einen Dry-Run-Bericht erzeugen.
9. Erst nach Prüfung idempotent mit `on_conflict=event_uid` schreiben.
10. Danach Mautic-Zahl und Supabase-Zahl je Tag, Phase, Sprache und Mail-ID abgleichen.

Der Backfill versendet keine Mail. Er repariert nur die fehlende Versandhistorie.

## Phase 5: Überfällige zweite Erinnerungen sicher nachholen

Nach dem Backfill wird die echte Kandidatenliste neu berechnet. Die bisher gefundenen 197 Kontakte sind nur eine Obergrenze.

Jeder Kandidat braucht direkt vor dem Send diese Prüfung:

- weiterhin derselbe höchste Rank
- kein CTA in irgendeiner Session
- nicht als Test markiert
- kein Mautic-DNC
- `ac_nurture_stopped` nicht gesetzt
- unterstützte Sprache
- vollständige Variantenfelder
- Coach-E-Mail vorhanden
- zweite Phase weder in Supabase noch Mautic vorhanden
- gültiger frischer Resume-Link
- vorherige Phase liegt mindestens 48 Stunden zurück

Recovery-Versand:

- zuerst kleiner Testlauf mit fünf Kontakten pro Phase
- danach maximal zehn pro Phase und Lauf
- nur 06:00 bis 18:00 Uhr Europe/Berlin
- älteste fällige Kontakte zuerst
- nach jedem Lauf Mautic-Send, Supabase-Event, DNC und Fehler prüfen
- Cap erst entfernen, wenn mindestens zwei aufeinanderfolgende Läufe sauber sind

Kontakte, die inzwischen weitergegangen sind, erhalten die zum aktuellen Rank passende Phase. Eine alte A3 darf nicht versendet werden, wenn die Person inzwischen Video 1 oder mehr abgeschlossen hat.

## Phase 6: Monitoring so bauen, dass dieser Fehler auffällt

Der bestehende Error-Workflow erkennt nur harte n8n-Fehler. Der aktuelle Vorfall blieb deshalb unsichtbar.

Neue Kontrollen:

### Versandabgleich

Alle zwei Stunden vergleichen:

```text
Mautic erfolgreiche Nurture-Sends
gegen
Supabase nurture_sent
```

Abweichung größer null löst sofort einen Alarm aus.

### Zweite-Welle-Wächter

Täglich prüfen:

- Erstsendungen älter als 48 Stunden
- aktueller Rank unverändert
- kein CTA und kein DNC
- zweite Phase fehlt

Schon ein überfälliger Kontakt wird gemeldet.

### Skip-Bericht

Skips nach eindeutigen Leads zählen, nicht nur rohe Events. Wichtig sind:

- `no_email_id`
- `contact_not_found`
- `resume_target_mismatch`
- `no_coach_data`
- `unsupported_language`

DNC bleibt eine normale Schutzentscheidung. Wiederholte technische Skips brauchen ein Ticket oder einen Alert.

### Laufzeit und Historie

- n8n-Ausführungshistorie länger als vier Tage aufbewahren.
- Pro Lauf Kandidaten, gesendet, legitim übersprungen und technisch fehlgeschlagen speichern.
- Ein Lauf mit Kandidaten, aber null Sends und technischen Skips, gilt als fehlerhaft.

## Phase 7: Datenqualität an der Quelle verbessern

Die aktuelle Variantenlogik repariert alte und lokalisierte Werte beim Lesen. Das widerspricht der Projektregel.

Kanonische Werte:

- Profil: `feuer`, `wind`, `wasser`, `fels`
- Ziel: `freedom`, `impact`, `security`, `growth`
- Barriere: `vehicle`, `community`, `confidence`, `opportunity`
- Sprache: `de`, `it`, `en`, später bewusst weitere

Aufgaben:

1. `GOAL_SLUG_MAP` und `BARRIER_SLUG_MAP` im Lead Post Processor ergänzen.
2. Alle drei kopierten Shared-Library-Nodes identisch aktualisieren.
3. Bestehende Mautic-Kontakte kontrolliert backfillen.
4. Danach `no_email_id` erneut messen.
5. Read-time-Aliaslisten erst entfernen, wenn Altbestände sauber sind.

## Phase 8: Sprachen und Templates ordnen

Aktuell unterstützt das Quiz mehr Sprachen als das Nurture-System.

- DE, IT und EN sind im aktiven Mapping.
- FR, RU und HU werden übersprungen.
- IT-Templates und zweite EN-Templates haben in Mautic einen uneinheitlichen Veröffentlichungsstatus.

Aufgaben:

1. Status aller 96 aktiven Varianten vereinheitlichen.
2. Jede Variante auf Betreff, Body, CTA, Abmeldelink, Organisation, Reply-To und Resume-Link testen.
3. FR, RU und HU erst aktivieren, wenn echte Templates komplett vorliegen.
4. Keine deutsche Fallback-Mail an anderssprachige Leads senden.

## Phase 9: Alte und neue Nurture-Architektur sauber trennen

Die ältere Master-Dokumentation beschreibt 81 deutsche Mails, native Mautic-Kampagnen, Evergreen und Reactivation. Die aktuelle Produktion nutzt den direkten n8n-Sender mit acht Phasen.

Aktuell gilt:

- aktiv: A2/A3, B1/B2, C1/C2, D1/D2
- archiviert: segmentbasierter Inactivity Checker
- nicht aktiv: A4-A7, B3-B6, C3-C6, D3-D6
- nicht aktiv: Evergreen EV1-EV12
- nicht aktiv: REACT1-3
- dauerhaft gesperrt: E1, ID 48

Vor einem Ausbau braucht es eine eigene Freigabe. Zuerst muss der Acht-Phasen-Pfad stabil laufen und messbar sein. Danach kann die lange Sequenz als separates Produktpaket geplant werden.

## Phase 10: Sicherheit und Dokumentation

1. Supabase-Service-Role-Key aus den Node-Parametern in n8n Credentials verschieben.
2. Danach den offengelegten Key rotieren.
3. Workflow-Snapshots ohne Geheimnisse speichern.
4. `NURTURE_EMAIL_SENDER_WORKFLOW.md` auf den echten Produktionsstand bringen:
   - kein alter Pilot-Cap
   - korrektes Zeitfenster
   - aktuelle Sprachen
   - aktuelle Version
   - Logger-Vertrag und Recovery-Verfahren
5. Legacy-Master klar als historisch kennzeichnen.
6. Eine maschinenlesbare Template-Matrix als einzige Quelle für IDs, Phasen, Sprachen und Dimensionen pflegen.

## Empfohlene Reihenfolge

1. Live-Backup und Recovery-Cap
2. Logger-Patch
3. vollständiger Testkontakt-Durchlauf
4. historischer `nurture_sent`-Backfill
5. Dry-Run der echten überfälligen Kontakte
6. kontrollierte Nachsendung
7. Versandabgleich und Alerts
8. Writer-Normalisierung und Datenbackfill
9. Template- und Sprachbereinigung
10. erst danach Ausbau der langen Sequenz

## Abnahmekriterien

- Jeder erfolgreiche Mautic-Send hat genau einen Supabase-Event.
- Mautic und Supabase stimmen pro Tag, Phase und Mail-ID überein.
- Ein wiederholter Workflow-Lauf sendet keine Phase doppelt.
- DNC-, CTA- und Testkontakte erhalten keine Mail.
- Zweite Erinnerungen starten frühestens 48 Stunden nach der ersten.
- Der aktuelle Rank bestimmt die Mail beim tatsächlichen Versand.
- Alle Resume-Links landen am richtigen Ziel.
- Analytics zeigt Send, Rückkehr, Video und CTA korrekt.
- Technische Skips werden als eindeutige Leads sichtbar.
- Ein Logger-Ausfall löst einen Alarm aus.
- ID 48 bleibt deaktiviert.

## Umsetzungsstand 22.07.2026

- Logger repariert und unter normalem Scheduler verifiziert.
- 299 fehlende historische Erfolgsereignisse ohne Mailversand rekonstruiert.
- Backfill-Dedupe gegen wechselnden kanonischen Lead-Hash abgesichert.
- Temporären Recovery-Cap hinter alle fachlichen Versandprüfungen verschoben.
- Aktive n8n-Version: `06643474-a8e3-49f6-9b65-e2107c81ea47`.
- Erster korrigierter Lauf: `294634`, Status `success`, 21 Mautic-Sends und 21 Supabase-Events.
- Versandlimit eingehalten: je fünf A3/B2/C2/D2; zusätzlich eine reguläre D1.
- Abschließender Backfill-Dry-Run: null offene Kandidaten.

Offen bleibt nur der kontrollierte Abbau des berechtigten Rückstands über die regulären Läufe. Das Limit darf erst nach mehreren weiterhin exakt abgeglichenen Läufen entfernt werden.

### Cap-Erhöhung

Nach erfolgreicher 1:1-Verifikation wurde der Recovery-Cap am 22.07.2026 auf ausdrückliche Freigabe von 5 auf 20 validierte zweite Erinnerungen je Phase und Lauf erhöht. Die Erhöhung gilt für alle weiterhin berechtigten Kontakte unabhängig vom Alter der ersten Erinnerung. DNC, CTA, Teststatus, Sprache, Kontakt, Template, Coach-Daten, Mautic-Sent-Phase und Resume-Link werden weiterhin vor der Zählung geprüft.
