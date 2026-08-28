# Browserweg — der Kettentest mit echten Daten

**Werkzeug:** [`scripts/cutover-browserweg.js`](../scripts/cutover-browserweg.js)
**Erstmals vollständig grün:** 28.08.2026, 08:10 MESZ, gegen die Plattform-DB (15/15)

Dieses Dokument beschreibt, **was der Test abdeckt und was nicht**. Der zweite Teil
ist der wichtigere: Ein Test, dessen Grenzen niemand kennt, wird für mehr gehalten,
als er ist.

---

## Wozu

Der Test fährt den **echten** Funnel auf der **Produktionsseite** in einem **echten
Browser** — kein Nachbau, keine selbst gebastelte Nutzlast, kein lokaler Server —
und weist danach in der Datenbank nach, dass jedes Glied der Kette angekommen ist.

Er wurde für den Datenbank-Cutover gebaut (Nachweis für Schritt 5) und ist danach
das Abnahmewerkzeug für jede Änderung, die den Lead-Weg berührt: derselbe Weg,
wahlweise gegen die alte oder die neue Datenbank befragt.

```bash
node --env-file=.env.prod scripts/cutover-browserweg.js probe --quelle=plattform
node --env-file=.env.prod scripts/cutover-browserweg.js pruefen <lead_hash> --quelle=plattform
node --env-file=.env.prod scripts/cutover-browserweg.js aufraeumen <lead_hash> --quelle=plattform [--wirklich]
```

`--quelle=supabase` fragt stattdessen die alte Datenbank über die Management-API ab,
`--quelle=plattform` die neue über `psql` auf dem DB-Server. **Der Browserweg selbst
ist in beiden Fällen identisch** — nur die befragte Datenbank wechselt. Genau das
machte ihn beim Cutover zum Vorher-Nachher-Vergleich.

Mit `BROWSERWEG_SICHTBAR=1` läuft der Browser sichtbar statt headless.

---

## Die Kette, Glied für Glied

Was der Test tatsächlich anfasst — links die Handlung im Browser, rechts, wo sie
landen muss:

| # | Handlung im Browser | Ereignis | Landet in |
| --- | --- | --- | --- |
| 1 | Funnelseite `/<slug>?test=1` öffnen | `page_view` | `lead_events` |
| 2 | „Meinen Code entdecken" | `quiz_started` | `lead_events` |
| 3 | sechs Fragen ansehen | `question_viewed` ×6 | `lead_events` |
| 4 | sechs Antworten wählen | `quiz_answer` ×6 | `lead_events`, `lead_answers_current` |
| 5 | Zwischenseite „… ist dein Kernantrieb" | `aspiration_confirmed` | `lead_events` |
| 6 | Auswertung wird berechnet | `quiz_result` | `lead_events`, `lead_state.profile_code` |
| 7 | Formular erscheint | `optin_viewed` | `lead_events` |
| 8 | Vorname + echte E-Mail eintragen | (ZeroBounce-Prüfung) | — |
| 9 | „Meine Auswertung anzeigen" | `form_submit`, `form_submitted` | `lead_events`, `lead_state`, `lead_sync_outbox` |
| 10 | Ergebnisseite („Der Macher") | — | `lead_state.lifecycle_stage` |
| 11 | „Teil 1 starten →" | `result_cta_click` | `lead_events` |
| 12 | Videoteil, Bunny-Spieler lädt | `video_viewed`, `video_started` | `lead_events` |
| 13 | Video läuft ~30 s | `video_progress` | `lead_events`, `lead_video_progress` |
| 14 | n8n-Outbox-Worker (jede Minute) | — | `lead_sync_outbox.status = done` → MySQL-CRM |
| 15 | Resume-Link im **frischen** Browser | `page_view` | Lead wird wiedererkannt, landet im Videoteil |

### Die fünfzehn Nachweise

1. `lead_state` trägt genau eine Zeile zum `lead_hash`
2. E-Mail gespeichert
3. Vorname gespeichert
4. `form_submitted_at` gesetzt
5. Profilcode berechnet
6. Berater zugeordnet
7. **sechs** Antworten in `lead_answers_current`
8. Ereignisse geschrieben
9. Outbox-Auftrag erzeugt
10. als interner Verkehr markiert (`payload.is_internal_traffic`)
11. Video-Fortschritt in `lead_video_progress`
12. **alle 13 Ereignisarten** liegen in der Datenbank — nicht nur im Browser gefeuert
13. Outbox-Auftrag auf `done` gelaufen
14. `lead_state.sync_status` meldet den CRM-Abgleich
15. Resume-Link führt in einem frischen Browser zurück in den Funnel

Jeder Lauf legt einen Beleg unter
`docs/audits/cutover-vorbereitung/cutover-belege/browserweg-<quelle>-<hash>.json` ab:
Schritte, Ereignisse, API-Aufrufe, alle Befunde.

---

## 🔴 Was der Test NICHT abdeckt

Das ist keine Restliste, sondern eine Warnung: Wer diese Punkte für geprüft hält,
irrt.

### Der finale CTA und alles dahinter

`lead_state.cta_clicked_at` bleibt **leer**. Das Feld gehört nicht zum
„Teil 1 starten"-Klick, sondern zum **finalen** CTA nach den Videos — Ereignis
`cta_clicked` mit `cta_type` `whatsapp` oder `spaeter`.

Gemessen am 28.08.2026 auf der Plattform-DB:

| | |
| --- | --- |
| Leads gesamt | 6.185 |
| mit `result_cta_click` | 1.121 |
| mit `cta_clicked_at` | 221 |
| `cta_type = whatsapp` | 122 |
| `cta_type = spaeter` | 98 |

Diese Stufe setzt drei durchgesehene Videos voraus. Der Test bleibt bewusst davor
stehen: Die Videos liegen in einem fremden `iframe`
(`player.mediadelivery.net`), lassen sich von der Seite aus nicht vorspulen, und die
Abkürzung über die Bridge-Aktion `notify_all_videos_completed` wäre eine
**synthetische Probe gegen eine schreibende Aktion** — genau das, was nach dem
Vorfall vom 27.08. nicht mehr gemacht wird.

**Folge:** Der Weg vom Videoende bis zum Kontaktwunsch ist **nicht automatisiert
geprüft**. Er braucht einen Menschen, der einmal durchklickt.

### Weiteres, das offen bleibt

- **Nur Deutsch.** Die Startseite bietet DE/IT/FR/RU/EN/HU. Der Test fährt `de-DE`.
- **Nur ein Berater** (`markus`). Andere Slugs, andere Zuordnungswege — ungeprüft.
- **Nur Mobilformat** (480×900). Desktop-Layout ungeprüft.
- **Nur markierter Verkehr** (`?test=1` → `is_internal_traffic`). Ein echter Besucher
  läuft ohne diese Marke; die Schreibpfade sind dieselben, aber bewiesen ist das hier
  nicht.
- **Das Skript schaut nicht selbst ins MySQL-CRM.** Nachweis 14 ist die Meldung der
  *Anwendung* (`sync_status = mysql_final_synced`) plus der Outbox-Status.
  ⚠️ **Korrektur vom 28.08.:** Hier stand, ein lesender Weg ins CRM existiere nicht.
  Das war falsch — er existiert, er ist nur nicht im Skript. Von Hand:

  ```bash
  "C:/Windows/System32/OpenSSH/ssh.exe" -i C:/Users/Markus/.ssh/id_rsa root@91.99.76.104 \
    "sudo -u forge mysql --defaults-file=/home/forge/.my.cnf prod_contacts_activesupport \
     -e \"select * from contacts where id = <mysql_contact_id>\\G\""
  ```

  `leads.lead_state` trägt dafür `mysql_contact_id` und `mysql_survey_id`; die Umfrage
  liegt in `prod_contacts_activesupport.typeform_surveys` und enthält im Feld
  `form_response` **alle Antworten im Klartext** — damit lässt sich Postgres gegen
  MySQL Antwort für Antwort vergleichen.

- **Das Skript wartet nicht auf eine zugestellte E-Mail.**
  ⚠️ **Ebenfalls korrigiert:** Nachprüfbar ist der Versand trotzdem, über Postmark:

  ```bash
  node --env-file=.env.prod -e "fetch('https://api.postmarkapp.com/messages/outbound?count=25', \
    {headers:{'X-Postmark-Server-Token':process.env.POSTMARK_SERVER_TOKEN}}) \
    .then(r=>r.json()).then(d=>d.Messages.forEach(m=>console.log(m.ReceivedAt,m.Status,m.Recipients,m.Subject)))"
  ```

  Ein vollständiger Lauf erzeugt **drei** Mails: „Dein Erfolgs-Code und dein Zugang"
  an den Lead, „Neuer Erfolgs-Code von: …" an den Coach, und nach dem dritten Video
  „Hot Lead: … hat alle 3 Videos angesehen".

- **Jeder Lauf hinterlässt einen Kontakt im MySQL-CRM**, den `aufraeumen` **nicht**
  entfernt (es fasst nur Postgres an). Am 28.08. blieben so `markus+cutover@…` (6
  Umfragen) und `markus+kette@…` (2 Umfragen) stehen.
- **Kein Fehlerfall.** Netzausfall, Reload-Nachlieferung und transiente 500er deckt
  die getrennte Suite `scripts/e2e/queue-failure.e2e.js` ab (CI-Gate `e2e-queue`).

---

## Aufräumen — die Regel

Jeder Lauf erzeugt einen **echten** Lead mit einer **echten**, zustellbaren Adresse
(`markus+cutover@global-sce.com`, von ZeroBounce als gültig bestätigt; eine
Phantasieadresse wird abgelehnt und der Absendeknopf bleibt grau).

```bash
node --env-file=.env.prod scripts/cutover-browserweg.js aufraeumen <lead_hash> --quelle=plattform --wirklich
```

Ohne `--wirklich` ist es ein **Trockenlauf** und zeigt nur, was es anfassen würde.
Es fasst ausschließlich den einen `lead_hash` an, den derselbe Lauf vorher selbst
angelegt hat.

🔴 **Der `CASCADE` von `lead_state` reicht nicht.** Er deckt nur vier Tabellen ab —
`lead_answers_current`, `lead_events`, `lead_sync_outbox`, `lead_video_progress`.
`tracking_sessions`, `tracking_events`, `tracking_video_progress`, `lead_profiles`,
`lead_contact_crm` und `nurture_subject_states` hängen **ohne Fremdschlüssel** dran
und blieben als Waisen zurück. Das Skript fasst deshalb alle Tabellen einzeln an und
überspringt die, die es in der befragten Datenbank nicht gibt — `system_alerts` ist
nicht mitumgezogen, und ohne diesen Filter bricht die ganze Löschtransaktion daran ab.

🔴 **Was das Aufräumen NICHT rückgängig macht:** Der Lauf hat über die Outbox einen
Kontakt im **MySQL-CRM** angelegt. Der bleibt.

---

## Vier Fallen, die beim Bauen aufliefen

Alle vier hätten stille Fehlbefunde erzeugt.

1. **Sechs Fragen, nicht sieben.** Schritt 5 des Funnels ist eine Zwischenseite
   („Freiheit ist dein Kernantrieb"), keine Frage. Gegengemessen über alle 1.922 Leads
   der Quelle: Höchstwert ist 6. Eine Erwartung von 7 meldet jeden gesunden Lauf rot.

2. **`tracking_sessions` entsteht verzögert.** 15 s nach dem Absenden: 0 Zeilen. Rund
   20 min später: 1. Der Test *meldet* den Wert, **wertet ihn aber nicht** — eine
   Bedingung darauf wäre ein Zufallsgenerator.

3. **Der `session_hash` steht nicht in den `/api/`-Nutzlasten**, sondern im
   Browserspeicher (`acQuizTrackingSession_v1`, Format `ac_<hex>`). Dort wurde er
   zuerst vergeblich gesucht, und der Resume-Test fiel deshalb ohne echten Grund aus.

4. **`generate_resume_token` braucht `email` im Kern der Nutzlast**, nicht nur
   `leadHash`/`sessionHash`. Sonst: `400 Missing resume contact context`. Vorlage ist
   [`scripts/smoke-resume-link.js`](../scripts/smoke-resume-link.js).

---

## Ein Muster, das wie ein Datenverlust aussieht — und keiner ist

Bei einem Handlauf am 28.08. begann die Ereigniskette des fertigen Leads erst bei
`form_submitted`. `page_view`, `quiz_started`, `question_viewed` und `quiz_answer`
fehlten — sie lagen unter einem **anderen** `lead_hash`.

**Ursache:** Im Browser lag noch der Lead eines früheren Tests
(`markus+stufe3@…`, 25.08.). Das Quiz lief darunter. Beim Absenden mit einer
**anderen** E-Mail-Adresse legte die Anwendung korrekt einen frischen Lead an — die
vorher gefeuerten Ereignisse blieben beim alten.

**Was dabei NICHT verloren geht:** Die sechs Antworten liegen unter dem neuen Hash,
weil `submit_lead_complete` sie mitträgt. Auch Profil, Video-Fortschritt und der
CRM-Abgleich sind vollständig.

**Was fehlt:** die Trichter-Ereignisse *vor* dem Absenden. Für diesen Lead beginnt
die Auswertung bei `form_submitted`.

**Wie häufig:** Von den letzten 200 abgeschlossenen Leads tragen **15 (7,5 %)** keine
eigenen Quiz-Ereignisse. Gemessen am 28.08.2026 auf der Plattform-DB. Das Muster ist
**älter als der Cutover** — es entsteht immer dann, wenn derselbe Browser einen
gespeicherten Lead mitbringt und dann eine andere Adresse einträgt.

🔴 Wer diesen Lead einzeln ansieht, hält ihn für einen Datenverlust. Er ist keiner —
aber die Trichterquote für solche Leads ist zu niedrig.

---

## Verwandt

- [CUTOVER-CHECKLISTE](audits/cutover-vorbereitung/CUTOVER-CHECKLISTE.md) — Protokoll des Umzugs vom 28.08.2026
- [STAND-UND-FORTSETZUNG](STAND-UND-FORTSETZUNG.md) — Einstieg für neue Sitzungen
- `scripts/e2e/queue-failure.e2e.js` — Fehlerfälle der Event-Queue (CI-Gate)
- `scripts/smoke-resume-link.js` — Vertragsprüfung des Resume-Links ohne Browser
