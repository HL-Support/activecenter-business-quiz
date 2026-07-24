# Business Leads Quiz: Mautic-Nurture-Audit

Stand: 21.07.2026, 12:30 Uhr, Europe/Berlin
Prüfzeitraum: 30.06.2026, 00:00 Uhr bis 21.07.2026, 12:30 Uhr

## Ergebnis

Die Nurture-Mails liefen im Prüfzeitraum nicht vollständig nach Plan.

Mautic erfasste 230 erste Erinnerungen. Keine davon ist als fehlgeschlagen markiert. Die vier vorgesehenen zweiten Erinnerungen A3, B2, C2 und D2 wurden jedoch kein einziges Mal versendet.

Der Grund liegt im aktiven n8n-Workflow. Er wählt eine zweite Erinnerung nur aus, wenn er die erste Erinnerung als `nurture_sent` in Supabase findet. Seit dem 23.06.2026 schreibt der Workflow keine solchen Erfolgsereignisse mehr. Damit fehlt ihm bei jedem späteren Lauf die Grundlage für A3, B2, C2 oder D2.

Das Ergebnis ist klar: Leads bekamen die erste Nurture-Mail. Die vorgesehene zweite Mail nach 48 Stunden blieb aus.

## Geprüfte Systeme

- Business Leads Quiz und Lead-System-v2-Dokumentation
- aktiver n8n-Workflow `RqKSRTgFv8mv04H2`, „AC - Quiz Nurture Email Sender“
- n8n-Ausführungshistorie in PostgreSQL
- Mautic 7.1.1 mit MySQL-Versandstatistik
- Supabase `lead_events`
- Mautic-Kontaktfelder, DNC-Status und Template-Konfiguration
- Container-, Prozess- und Laufzeitstatus auf dem Produktionsserver

Die Prüfung war rein lesend. Es wurden keine Workflows, Kontakte, E-Mails oder Daten geändert.

## Vorgesehener Versandplan

| Phase | Voraussetzung | Erste Mail | Zweite Mail |
| --- | --- | --- | --- |
| Kein Video gestartet | Rank 0, kein CTA | A2 nach 12 Stunden | A3 nach weiteren 48 Stunden |
| Video 1 abgeschlossen | Rank 1, kein CTA | B1 nach 24 Stunden | B2 nach weiteren 48 Stunden |
| Video 2 abgeschlossen | Rank 2, kein CTA | C1 nach 24 Stunden | C2 nach weiteren 48 Stunden |
| Alle Videos abgeschlossen | Rank 3, kein positiver CTA | D1 nach 12 Stunden | D2 nach weiteren 48 Stunden |

Der Workflow läuft alle zwei Stunden. Zweite Erinnerungen dürfen nur zwischen 06:00 und 18:00 Uhr Berliner Zeit starten.

Er gruppiert mehrere Sessions anhand der normalisierten E-Mail-Adresse. Der höchste erreichte Video-Rank gewinnt. Ein CTA in einer beliebigen Session stoppt das Video-Nurture für diese Person.

## Aktive E-Mail-Liste

Der Workflow enthält 96 verwendbare Varianten:

- acht Phasen: A2, A3, B1, B2, C1, C2, D1 und D2
- drei Sprachen: Deutsch, Italienisch und Englisch
- vier Varianten je Phase und Sprache, abhängig von Ziel, Profil oder Barriere

Die im Code noch vorhandenen Phasen A4 und A5 sind nicht aktiv.

Französisch, Russisch und Ungarisch werden vom Nurture-Workflow nicht unterstützt. Leads in diesen Sprachen werden bewusst übersprungen, obwohl das Quiz selbst diese Sprachen anbietet.

## Tatsächlicher Versand im Prüfzeitraum

| Phase | Deutsch | Italienisch | Englisch | Gesamt | Mautic-Fehler |
| --- | ---: | ---: | ---: | ---: | ---: |
| A2 | 126 | 1 | 4 | 131 | 0 |
| B1 | 63 | 3 | 1 | 67 | 0 |
| C1 | 15 | 1 | 1 | 17 | 0 |
| D1 | 14 | 1 | 0 | 15 | 0 |
| A3 | 0 | 0 | 0 | 0 | 0 |
| B2 | 0 | 0 | 0 | 0 | 0 |
| C2 | 0 | 0 | 0 | 0 | 0 |
| D2 | 0 | 0 | 0 | 0 | 0 |
| **Gesamt** | **218** | **6** | **6** | **230** | **0** |

Die 230 Zeilen sind 230 eindeutige Kontakt-Phasen. Es gibt keine doppelten Erstsendungen für denselben Kontakt und dieselbe Phase.

## Hauptfehler: Erfolgsprotokollierung abgebrochen

Der letzte vorhandene `nurture_sent`-Eintrag stammt vom 23.06.2026 um 10:05 Uhr Berliner Zeit. Im gesamten Prüfzeitraum gibt es exakt null `nurture_sent`-Einträge.

Gleichzeitig belegt Mautic 230 erfolgreiche API-Sendungen. Der eigentliche Versandknoten läuft also. Der nachgelagerte Supabase-Logschritt tut es nicht.

Die Phasenermittlung liest nur diese Supabase-Ereignisse:

```text
A2 vorhanden + 48 Stunden vergangen -> A3
B1 vorhanden + 48 Stunden vergangen -> B2
C1 vorhanden + 48 Stunden vergangen -> C2
D1 vorhanden + 48 Stunden vergangen -> D2
```

Fehlt das Ereignis, nimmt der Workflow an, die erste Mail sei noch nie gesendet worden. Später verhindert zwar das Mautic-Feld `ac_nurture_sent_phases` eine doppelte Erstsendung. Dieses Feld hilft aber nicht bei der Auswahl der zweiten Mail. Die Logik endet dadurch in einer Sackgasse.

## Größe des Rückstands

216 Erstsendungen lagen zum Prüfzeitpunkt mindestens 48 Stunden zurück:

| Pfad | Erstsendungen älter als 48 Stunden | Nach Mautic-Grundfiltern weiter mögliche Kandidaten | Tatsächliche zweite Mails |
| --- | ---: | ---: | ---: |
| A2 -> A3 | 122 | 113 | 0 |
| B1 -> B2 | 62 | 54 | 0 |
| C1 -> C2 | 17 | 15 | 0 |
| D1 -> D2 | 15 | 15 | 0 |
| **Gesamt** | **216** | **197** | **0** |

Die 197 sind eine belastbare Mautic-seitige Kandidatenobergrenze nach Abmeldung, Nurture-Stopp, CTA-Feld und fehlenden Coach-Daten. Der aktuelle Supabase-Fortschritt kann einzelne Kontakte zusätzlich berechtigt ausschließen. Eine rückwirkende Nachsendung darf deshalb nicht pauschal an alle 197 Kontakte gehen. Vor einem Backfill muss jeder Kontakt nochmals gegen Rank, CTA, Teststatus und aktuelle Sprache geprüft werden.

## Weitere Auffälligkeiten

### Viele wiederholte Skip-Ereignisse

Supabase enthält im Prüfzeitraum 8.159 `nurture_skipped`-Ereignisse. Das sind keine 8.159 verschiedene Leads. Derselbe ungelöste Kontakt wird bei jedem Zwei-Stunden-Lauf erneut protokolliert.

In der ersten Stichprobe von 1.000 Ereignissen waren die häufigsten Gründe:

- DNC oder Abmeldung: 405 Ereignisse
- fehlende Variantenzuordnung, zum Beispiel `no_email_id:a2/de/`: 166
- Mautic-Kontakt nicht gefunden: 164
- Ungarisch nicht unterstützt: 82
- fehlende A3-Zuordnung für Italienisch: 60
- Russisch nicht unterstützt: 42
- fehlende B1-Zuordnung Deutsch: 41
- ungültiges Resume-Ziel: 20
- fehlende A3-Zuordnung Deutsch: 20

DNC-Skips sind korrekt. Leere Variantenschlüssel, fehlende Mautic-Kontakte und Resume-Zielabweichungen sind technische Daten- oder Mappingfehler. Sie können auch die erste Erinnerung verhindern.

### Uneinheitlicher Template-Status

- Deutsche erste und zweite Erinnerungen sind veröffentlicht.
- Italienische erste und zweite Erinnerungen stehen in Mautic auf „nicht veröffentlicht“.
- Englische erste Erinnerungen sind veröffentlicht. Die zweiten Erinnerungen stehen auf „nicht veröffentlicht“.

Die Mautic-API konnte italienische erste Erinnerungen trotzdem direkt senden. Der Status erklärt daher nicht den Totalausfall der zweiten Welle. Er bleibt ein Betriebsrisiko und sollte vereinheitlicht werden.

### Begrenzte n8n-Historie

Die gespeicherte n8n-Ausführungshistorie reicht aktuell nur bis 17./18.07.2026 zurück. In diesem Ausschnitt lief der Nurture-Workflow erfolgreich. Für den vollständigen 21-Tage-Nachweis waren deshalb Mautics `email_stats` und Supabase `lead_events` maßgeblich.

### Versand ist nicht gleich Postfachzustellung

Mautic markiert alle 230 Versuche als nicht fehlgeschlagen. Das belegt die erfolgreiche Verarbeitung durch Mautic und seinen Mailtransport. Es beweist keine Zustellung bis in jedes Empfängerpostfach. Dafür müssten zusätzlich Provider-Ereignisse wie Delivered, Bounce, Spam Complaint und Suppression abgeglichen werden. Diese Ereignisse lagen in den geprüften Mautic-Tabellen nicht als vollständige Zustellkette vor.

### Geheimnis direkt im Workflow gespeichert

Der aktive Workflow enthält einen Supabase-Service-Role-Token direkt in mehreren Node-Parametern. Solche Schlüssel gehören in n8n Credentials. Der Token sollte nach der Umstellung rotiert werden.

## Empfohlene Reihenfolge

1. Den Knoten `Supabase - Log Sent` reparieren und mit einem klar markierten Testkontakt prüfen.
2. Die Phasenermittlung zusätzlich gegen `ac_nurture_sent_phases` oder eine kanonische Versandtabelle absichern. Ein einzelner defekter Logknoten darf die gesamte zweite Welle nicht stoppen.
3. Für erfolgreiche Sendungen einen stabilen, eindeutigen Schlüssel speichern: Lead, Phase und Sendungszeitpunkt.
4. Die 197 Mautic-Kandidaten gegen den aktuellen Supabase-Rank, CTA, Teststatus, DNC und Sprache neu berechnen.
5. Erst danach die tatsächlich überfälligen zweiten Erinnerungen kontrolliert nachsenden. Pro Lead und Phase braucht es eine Dedupe-Sperre.
6. Leere Variantenschlüssel, fehlende Mautic-Kontakte und Resume-Zielabweichungen einzeln bereinigen.
7. Zweite IT- und EN-Templates veröffentlichen und den Status aller 96 aktiven Varianten vereinheitlichen.
8. FR, RU und HU entweder mit echten Templates unterstützen oder im Quiz klar aus dem E-Mail-Nurture ausnehmen.
9. Einen täglichen Soll-Ist-Check einführen: fällige Phasen, gesendete Phasen, berechtigte Skips und überfällige Phasen.
10. Provider-Zustellereignisse in den Audit aufnehmen, damit „gesendet“ und „zugestellt“ getrennt messbar sind.

## Schlussbewertung

Die erste Nurture-Welle funktioniert technisch. Mautic erfasste 230 Sendungen ohne internen Fehler. Die zweite Welle ist seit Beginn des Prüfzeitraums vollständig ausgefallen. Zusätzlich blockieren Daten- und Mappingfehler einzelne Leads schon vor der ersten Mail.

Damit ist die Frage, ob alle berechtigten Leads regelmäßig alle vorgesehenen Nurture-Mails bekamen, klar zu beantworten: nein.

## Recovery-Nachtrag vom 22.07.2026

Der defekte Supabase-Erfolgslogger wurde am 21.07. repariert und 299 fehlende historische `nurture_sent`-Ereignisse wurden aus Mautics Versandstatistik idempotent rekonstruiert. Der Backfill selbst versendete keine E-Mails.

Bei der Kontrolle am 22.07. zeigte sich eine zweite, nur durch die temporäre Recovery-Bremse verursachte Blockade: 155 A3- und 90 B2-Kandidaten waren vor den nachgelagerten Schutzprüfungen fällig. Das Limit wurde jedoch bereits bei der Vorauswahl gezählt. Dadurch verbrauchten DNC-, Kontakt-, Template- oder Resume-Link-Ausschlüsse die fünf Plätze, obwohl keine Mail gesendet wurde.

Die Bremse wurde deshalb hinter Kontakt-, DNC-, Template-, Coach- und Resume-Link-Prüfung verschoben. Das Limit selbst blieb unverändert bei maximal fünf tatsächlich validierten zweiten Erinnerungen je Phase und Lauf.

Der erste reguläre Lauf mit dieser Korrektur, n8n-Ausführung `294634`, endete erfolgreich. Er erzeugte exakt:

- 5 A3
- 5 B2
- 5 C2
- 5 D2
- 1 reguläre D1

Alle 21 Mautic-Sends hatten Fehlerflag `0`. Supabase enthielt anschließend genau 21 neue eindeutige `nurture_sent`-Ereignisse mit identischer Phasenverteilung. Der abschließende Backfill-Dry-Run fand bei 984 vorhandenen Events und 338 geprüften Mautic-Zeilen keinen offenen Kandidaten.

Die zweite Welle funktioniert damit wieder kontrolliert. Die Aufarbeitung des verbleibenden berechtigten Rückstands erfolgt weiterhin gedrosselt über die regulären Zwei-Stunden-Läufe.

### Freigegebene Beschleunigung am 22.07.2026

Nach dem erfolgreichen 5er-Verifikationslauf wurde das Limit auf ausdrückliche Freigabe auf maximal 20 tatsächlich validierte A3/B2/C2/D2 je Phase und Lauf erhöht. Es gilt bewusst kein Altersfilter. Alle fachlichen Ausschlüsse und Dedupe-Regeln bleiben unverändert vor dem Cap aktiv.

Aktive Workflow-Version: `9c4ec7a1-2bc1-4cdb-911f-4ff8979c954b`. Der vorherige Stand liegt unter `/root/n8n/backups/RqKSRTgFv8mv04H2-before-cap-20-20260722T122304+0200.json`; SHA-256: `29fccaa1b76cb271f85e857ce9653789a0aefeaa1a28219b3f30fe43513f2cdb`.

### DNS-Teilabbruch und Logger-Härtung

Der erste Cap-20-Lauf `294884` wurde nach 38 erfolgreichen Mautic-Sends durch einen transienten DNS-Fehler bei `Supabase - Get Resume Session` beendet. Bis dahin waren 20 A3 und 18 B2 erfolgreich versendet und in Mautics Sent-Phase gespeichert, der nachgelagerte Supabase-Erfolgslogger war wegen der bisherigen Branch-Reihenfolge jedoch noch nicht ausgeführt worden.

Die exakt 38 fehlenden Events wurden anhand von Mautics `email_stats` idempotent rekonstruiert. Der Kontrolllauf zeigte anschließend 1.022 vorhandene Events und null offene Kandidaten.

Für die dauerhafte Härtung läuft `Supabase - Log Sent` nun unmittelbar nach jedem erfolgreichen Send und vor dem nächsten Schleifendurchlauf. `Supabase - Get Resume Session` versucht transiente Fehler bis zu dreimal mit 2.000 Millisekunden Abstand. Nach drei Fehlschlägen bleibt der Workflow absichtlich hart fehlerhaft und alarmiert weiterhin.

Aktive Workflow-Version: `4190c93b-1730-4a84-b616-5b7f6ea4b959`. Backup vor der Härtung: `/root/n8n/backups/RqKSRTgFv8mv04H2-before-dns-resilience-20260722T144516+0200.json`, SHA-256 `61f32ce082a7e8d2b0b4e325b903d88149c262549673bc3591a01b873ebc2bd7`.

### Datenreparatur und kanonischer Fallback am 23.07.2026

Die nach der Recovery verbliebenen Ausnahmen wurden einzeln gegen Supabase, MySQL, Mautic und die n8n-Ausführungsdaten geprüft.

- Fünf echte Kontakte fehlten vollständig in Mautic. Sie wurden ohne Löschung aus dem kanonischen Supabase-Zustand angelegt, dem deutschen Business-Quiz-Segment zugeordnet und ihre neuen Mautic-IDs in `lead_state` zurückgeschrieben.
- Eine der fünf Adressen endete fehlerhaft mit einem Punkt. Der Punkt wurde in `lead_state` und der zugehörigen `tracking_sessions`-Kopie entfernt, bevor der Mautic-Kontakt angelegt wurde.
- Bei fünf bestehenden Mautic-Kontakten fehlte nur das für die Nurture-Variante benötigte Profil- oder Barrierefeld. Die Werte waren in Supabase vollständig vorhanden und wurden gezielt nach Mautic übernommen.
- Vier weitere Datensätze hatten weder Quiz- noch Videoereignisse und keinen MySQL-Survey. Ihre einzigen Events waren wiederholte historische `nurture_skipped`-Logs. Sie wurden als unvollständige Teil-/Importdatensätze klassifiziert und nicht mit erfundenen Quizwerten versendet.

Der aktive Nurture-Workflow liest für die Variantenwahl weiterhin zuerst die Mautic-Felder. Nur wenn Sprache, Profil, Ziel oder Barriere dort leer sind, darf er jetzt auf die kanonischen Werte des ausgewählten Supabase-Leads zurückgreifen. Kontaktpflicht, DNC/Abmeldung, `ac_nurture_stopped`, bereits versendete Phasen, Coach-Daten, Template-Mapping, Resume-Link-Prüfung und Versand-Cap bleiben unverändert vorgeschaltet beziehungsweise aktiv.

Aktive Workflow-Version: `7dfb95e3-1fab-4683-8513-17bc13f18dca`. Backup vor dem Fallback: `/root/n8n/backups/RqKSRTgFv8mv04H2-before-supabase-fallback-20260723.json`.

### Health-Monitor-Härtung am 24.07.2026

Mehrere neue Health-Meldungen waren keine getrennten Systemdefekte. Einzelne der 13 parallel gestarteten Supabase-Messungen überschritten das bisherige Zwei-Sekunden-Limit. Zusätzlich enthielt die Incident-Signatur die schwankende Anzahl fehlgeschlagener Messungen. Derselbe Erreichbarkeitsfehler wurde dadurch bei einem Wechsel von 1 auf 13 und zurück auf 1 als jeweils neuer Vorfall behandelt.

Der Health-Endpunkt wurde deshalb wie folgt gehärtet:

- fünf Sekunden statt zwei Sekunden Lesezeit pro Versuch,
- drei Versuche auch für Probes und begrenzte Counts,
- exponentieller Retry-Abstand,
- höchstens drei parallele Supabase-Messungen statt eines 13er-Bursts,
- stabile Incident-Signatur für Konfigurations- und Mess-Erreichbarkeitsfehler,
- vier Stunden Erinnerungsabstand für denselben unveränderten Vorfall,
- ein einzelner ausgefallener nichtkritischer Messwert wird als Warnung ausgewiesen, nicht als Systemausfall.

Die drei kanonischen Verfügbarkeitsprobes für `lead_state`, `lead_video_progress` und `lead_events` bleiben kritisch. Mehrere gleichzeitig fehlende Messwerte bleiben ebenfalls ein echter Health-Fehler. Der n8n-Monitor behandelt den bereits durch den Endpunkt gemeldeten HTTP-503-Zustand künftig als reguläre Ausgabe, damit nicht zusätzlich eine generische n8n-Fehlermail für denselben Vorfall entsteht.

Der produktive Resume-Smoke wurde ebenfalls gegen nachgewiesene, vorübergehende Vercel-Gateway-Timeouts gehärtet. Ausschließlich Netzwerkfehler sowie HTTP 502, 503 und 504 werden bis zu zweimal wiederholt. Fachliche 4xx-Antworten und dauerhaft fehlschlagende Aufrufe bleiben harte CI-Fehler.
