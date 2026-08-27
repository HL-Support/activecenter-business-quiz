# Werbe-Besucher konvertierten nicht mehr — HTTP/3 nach dem Cutover

Stand 27.08.2026 vormittags · Alle Zahlen gemessen · Zeiten lokal (MESZ)

## Meldung

Markus, 27.08. früh: „Seit der Umstellung habe ich keinen einzigen Lead mehr bekommen."

## Befund

Die Meldung war korrekt — und die Ursache lag **nicht** in der Pipeline:

| Ebene | Zustand |
| --- | --- |
| Opt-in-Pipeline | gesund: 17 echte Opt-ins seit dem Cutover, alle in der Kartei, Hot-Lead-Mails mit Postmark-Belegen |
| Funnel im normalen Browser | gesund: zwei vollständige Live-E2E am 27.08. früh, auch mit IG-Browserkennung und Anzeigen-Parametern |
| **Anzeigen-Besucher (IG/FB-In-App)** | **0 von 49 konvertierten am 26.08.** — Quiz komplett gespielt, Formular gesehen, aber kein einziger Klick erreichte je den Server (Container-Logs: null Bridge-/Validierungsaufrufe in den Zeitfenstern) |
| Meta-Auslieferung | 26.08. noch normal (808 Impressionen, 69 Klicks), **27.08. eingebrochen auf 64** — Folge der fehlenden Lead-Signale, nicht Ursache |

Slug-genau: `markus` (= Werbetraffic) hatte vor dem Cutover täglich 3–9 Opt-ins, danach
null; andere Slugs (geteilte Links, normale Browser) konvertierten weiter.

## Ursachenanalyse

Einziger Netz-Unterschied zwischen Vercel und Coolify in den Antwort-Kopfzeilen:

```
Alt-Svc: h3=":443"; ma=2592000        ← nur Coolify
```

Der neue Proxy bewarb **HTTP/3 (QUIC)**. Das trifft exakt das gemessene Muster:

1. Seite lädt, Quiz läuft — alles über die bestehende TCP-Verbindung (Ereignisse fließen).
2. Am Formular tippt die Person 30–60 Sekunden — Verbindungspause.
3. iOS/WebKit (der Instagram-In-App-Browser) wechselt nach gelerntem `Alt-Svc` auf QUIC —
   und der Absende-Klick hängt, wenn QUIC auf dem Einzelserver nicht sauber funktioniert.
4. Kein Fehler sichtbar: Das `form_submit`-Ereignis liegt in der Client-Warteschlange und
   stirbt mit dem geschlossenen In-App-Browser.

Chromium (Playwright) nutzt ohne Flags kein QUIC — deshalb liefen alle E2E-Tests durch.
UDP 443 war offen und Traefik lauschte; ob der QUIC-Handshake extern wirklich fehlschlug,
liess sich ohne iOS-Testgerät nicht direkt messen — der Beweis kam über den Eingriff.

## Eingriff und Beweis

**07:13 — HTTP/3 am Proxy abgeschaltet** (`--entrypoints.https.http3` entfernt; Sicherung:
`/data/coolify/proxy/backups/docker-compose.yml.vor-h3-aus-20260827`). 12 Sekunden
Neustart-Blip, alle Apps danach grün, `Alt-Svc` weg.

**07:32 — Beweis am echten Gerät:** Markus klickte seine eigene Instagram-Anzeige am
Handy und trug sich ein. Ergebnis:

```
Markus+handytest@global-sce.com · Slug markus · Profil feuer · Ziel impact
Barriere community · 6 Antworten · mysql_final_synced · Kontakt 3684127
25 Ereignis-Aufrufe, alle HTTP 200
```

Exakt der Klick, der seit dem 25.08. abends bei jedem Anzeigen-Besucher verschwand, lief
durch die komplette Pipeline.

Ehrlicher Vorbehalt: Es gibt keinen Vorher-Fehlversuch vom selben Gerät; die endgültige
Bestätigung liefern die organischen Werbe-Konversionen der nächsten Tage. Der Wächter
misst genau das (W4).

## Dauerhafte Konsequenzen

1. **W4 im Nurture-Wächter:** Werbe-Besucher da (≥15 in 24 h), aber kein einziges Opt-in
   daraus → ALARM mit Hinweis auf die Kopfzeilen-Prüfung. Ein Verhältnis, kein Absolutwert
   — bei pausierter Kampagne schweigt die Prüfung.
2. **HTTP/3 bleibt aus**, bis es auf echten iOS-/IG-Geräten getestet ist. Es war
   ungetestete Zierde: kein Nutzer braucht es, aber der teuerste Klick des Funnels hing
   daran. Wer es wieder aktiviert, testet vorher den Formular-Submit im echten
   Instagram-Browser nach einer Tipp-Pause.
3. **Kopfzeilen-Vergleich gehört in jede Hosting-Migration:** Der Unterschied stand von
   Anfang an in einer Zeile `curl -sI`-Diff. Erst der Abgleich Vercel↔Coolify machte ihn
   sichtbar.
4. Meta-Erholung: Auslieferung normalisiert sich erst, wenn wieder Lead-Signale fliessen —
   erfahrungsgemäss Stunden bis ein Tag nach den ersten Konversionen.

## Aufräumliste (gezielt, nur diese Adressen)

Testkontakte aus der Diagnose, später per gezielter E-Mail-Löschung entfernen:
`markus+livecheck2708@global-sce.com` · `markus+adclick2708@global-sce.com` ·
`Markus+handytest@global-sce.com` (Kontakt 3684127).
