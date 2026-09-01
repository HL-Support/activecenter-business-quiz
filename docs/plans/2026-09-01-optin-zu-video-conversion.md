# Optin → Video: Conversion-Plan (Stand 01.09.2026)

Ziel: Mehr Optins auf Video 1 und tiefer in Video 2 bringen, **ohne den Filter
aufzuweichen** — der Funnel soll weiterhin aussortieren, aber informiert statt
durch Reibung und Zufall. Dieser Plan enthält den vollständigen Kontext; er ist
so geschrieben, dass ein Agent ohne Vorwissen damit arbeiten kann.

Auftraggeber: Markus Oberhofer. Entscheidungen unten in §3 sind von ihm am
01.09.2026 getroffen worden (Gespräch im Meta-Ads-Engine-Projekt).

---

## 1. Ausgangslage — gemessene Zahlen

Quelle: Postgres `hl_support`, Schema `leads` (Rolle `leads_cockpit`, nur lesen),
ausgewertet am 01.09.2026 über das Ads-Cockpit (`Meta_Ads_Engine/07_Ads_Cockpit`).
Segment „Anzeigen“ = `utm_medium in ('paid_social','paid') or utm_source in
('fb','ig','facebook','meta','an','th')`; „Organik“ = der Rest (Berater, Direkt).

**Gesamte Laufzeit, Anzeigen-Traffic:**

| Stufe | Anzahl | Quote zur Stufe davor |
|---|---|---|
| Optins | 685 | — |
| keine Zeile in `lead_video_progress` (Video 1 nie geöffnet) | **171 (25 %)** | — |
| Video 1 gestartet (Fortschritt > 0) | 514 | 75 % |
| Video 1 zu Ende (≥ 95 % unique) | 291 | 57 % |
| Video 2 gestartet | 254 | 87 % |
| Video 2 zu Ende | 86 | **34 %** |
| Video 3 gestartet | 70 | 81 % |
| Video 3 zu Ende (= Hot Lead) | 51 | 73 % |

**Abbruchtiefen Video 2, Anzeigen:** 92 von 254 Startern (36 %) brechen vor der
25-%-Marke ab; Abbrecher sehen im Schnitt 27 %. **Organik zum Vergleich: nur 7 %
Frühabbruch, 81 % Durchschauquote — beim selben Video.**

**Organik verliert vor Video 1 fast gleich viel (131 von 613 = 21 %)** →
das Leck Optin → Video 1 ist **systemisch** (Seitenmechanik), nicht
zielgruppenbedingt.

**Echte Videolängen** (Median `unique_watched_seconds` der Durchschauer):
Video 1 = **3:17**, Video 2 = **9:18**, Video 3 = **4:29**.

**Inhaltlicher Befund** (Transkripte in `nurture/quellen/video_*_transcript.txt`):
Video 1 qualifiziert nur („wen wir suchen“), nennt weder Firma noch Modell.
Video 2 nennt in den ersten ~30 Sekunden Active Center + Herbalife und kurz
darauf den Dreistufenplan (Duplikation, indirektes Einkommen). Der 36-%-
Frühabbruch bei Anzeigen ist der Erkennungs-Reflex auf diesen Reveal; die
Organik kennt das vorher schon. Diese Abbrecher haben Video 1 komplett gesehen
und aktiv Play gedrückt — sie waren gefiltert und offen.

---

## 2. Verifizierte Code-Befunde (mit Fundstellen)

Frontend-Fluss ist ein SPA-State-Wechsel ohne Navigation: Optin absenden →
`t('result')` (`src/app/App.jsx:2457`, ausgelöst von `:526`) → Ergebnisseite
(= der Erfolgscode-Screen mit Profil, Snapshot, Stärken, blindem Fleck) →
Button „Teil 1 starten →“ **ganz unten** (`App.jsx:2341-2358`) → `t('videos')`.

1. **Kein Scroll-Reset bei Step-Wechseln.** Die Übergangsfunktion `v`
   (`App.jsx:1651-1656`) toggelt nur Opacity/Transform; im gesamten `src/`-Baum
   existiert kein `scrollTo`/`scrollIntoView`. Folge A: Nach dem Optin-Absenden
   (Formular liegt unten) rendert die Ergebnisseite mit altem Scroll-Offset —
   der Nutzer landet mitten im Text statt oben bei seinem Ergebnis. Folge B:
   Nach Klick auf „Teil 1 starten“ (hoher `scrollY`) klemmt der Browser den
   Offset auf die kürzere Videoseite — der Nutzer landet **unterhalb des
   Players** am gesperrten „Weiter“-Button. Erklärt `video_viewed` ohne
   `video_started`. → Vor dem Fix per Test belegen (AP1 enthält den Test).
2. **Autoplay-Konfiguration wirkungslos:** `autoplay=true&muted=false`
   (`App.jsx:1040`) wird von Chrome/Safari/iOS blockiert; iframe zusätzlich
   `loading: 'lazy'`. **Entscheidung §3: Autoplay NICHT erzwingen** — der
   bewusste Play-Klick bleibt (saubere `video_started`-Statistik). Der Fix ist
   der Viewport (Scroll-Reset), nicht Autoplay.
3. **Ergebnisseite feuert kein Event** (kein `result_viewed`): zwischen
   `form_submitted` (`src/lib/core.js:1599-1632`) und `result_cta_click`
   (`App.jsx:2345`) ist die Messung blind. Die 25 % sind darum heute nicht
   trennbar in „Seite nie gerendert“ vs. „gerendert, nicht geklickt“.
4. **Freischaltung:** „Weiter“ erst ab ≥ 95 % unique gesehen
   (`App.jsx:262-274`, Anti-Seek `:311-321`). So lassen — das ist der Filter.
5. **Resume-Links:** `…/<slug>?r=<key>&target=videos` springt direkt auf
   Video 1 inkl. Wiedereinstieg an der letzten Stelle (`api/bridge.js:302-312`,
   `:827-834`; Client `src/app/bootstrap.js:286-311`, `App.jsx:1619-1629`).
   Ohne `&target=videos` entscheidet `api/bridge.js:764-765`: ohne
   `result_cta_click`/Videofortschritt → zurück auf die Ergebnisseite.
6. **Toter Pfad:** Resume mit `resumeTarget='result'` und leerem `profileCode`
   fällt bis `App.jsx:2494` durch und zeigt **Quizfrage 1**. Jeder Optin hat
   normal einen Profilcode (Profil wird vor dem Optin berechnet); der Pfad
   trifft nur kaputte/alte Datensätze. Billiger Guard lohnt trotzdem (AP6).
7. **E-Mail-Korrekturdialog** (`App.jsx:465-485`): Das ist der selbst gehostete
   E-Mail-Checker (`getEmailReputationDecision` → `reject_invalid` /
   `request_correction` mit Vorschlag). **Kein Bug, gewollt.** Merkposten: Die
   Form-Validierung läuft damit bereits clientseitig vor dem Submit.

**Mail-Strecke** (n8n-Export 28.08.2026, `n8n/export-2026-08-28/`):

8. Die Zugangsmail „Dein Erfolgs-Code und dein Zugang“ kommt aus n8n
   `AC - Lead Post Processor` (Cron **alle 5 Min**), effektiv 2–6 Min nach dem
   Optin. Der Videolink darin ist ein Resume-Link, der `resumeTarget:'videos'`
   anfordert — **laut Code landet er also bereits direkt auf Video 1.** Das
   gehört live nachgetestet (AP3, Test T2), Markus vermutet Gegenteiliges.
9. **Mail-Gewichtung:** Betreff verkauft den Code, nicht das Video; der einzige
   Video-Button steht an Position 9 von 12 (nach der kompletten Typanalyse);
   CTA-Label „Ja, ich will mehr erfahren“; `resumeIntro` („…wo du zuletzt
   aufgehört hast“) ist bei Erstversand sachlich falsch (Nurture-Text).
10. **12-Stunden-Loch:** Nach der Zugangsmail kommt bis `a2` (12 h, Cron 2 h →
    real 12–14 h) nichts. `a2` unterscheidet nicht zwischen „nie geöffnet“ und
    „94 % gesehen“ (`completed_rank` ist rein ≥95-%-basiert,
    `supabase-lead-system-v2.sql:305-311`). `video_started` wird erfasst
    (`api/lead-track.js:70`), aber nirgends für Mails genutzt. Der
    Inaktivitäts-Workflow liegt tot (`ac-quiz-video-inactivity-checker-tot.json`,
    `active:false`) und deckte den Fall „registriert, kein Video“ nie ab.
11. **Ungenutzte Strecken:** `a4`/`a5` nicht in `ACTIVE_PHASES`
    (`docs/NURTURE_BETRIEB.md:116-118`); `D3`, `E1`, `EV1–EV12` als fertige
    Texte ohne Sender (`nurture/vorlagen/nurture-email-templates-de.md:873-1230`).
12. **Versandweg-Ausfälle:** Resume-Token-Fehler → Job failed, **gar keine Mail**
    (auch nicht an den Berater). ZeroBounce-Gate in n8n kann Mails verwerfen —
    redundant, seit der eigene Checker im Formular prüft (Befund 7).
13. **Kartei-Modus:** `wirksamerModus(process.env)` (`api/bridge.js:4314`),
    Standard `aus` (alter Weg über contacts-Webhook). Ob Produktion auf `an`
    (Outbox, 1-Min-Takt) steht: **live prüfen** (AP3, T1).

---

## 3. Entscheidungen (Markus, 01.09.2026)

- **Kein Autoplay.** Play-Klick bleibt bewusst (Statistik + Ernsthaftigkeit).
- **Button-Text ändern:** „Teil 1 starten“ sagt nicht, warum man klicken soll.
  Neuer Text muss den nächsten Schritt attraktiv machen (Vorschläge in AP2).
- **Sticky-Dock-CTA auf der Ergebnisseite:** Von Anfang an sichtbarer Sticky-
  Footer-Button; scrollt man ans Seitenende, „dockt“ er an seiner natürlichen
  Position in der Seite an (hört auf zu schweben). Das Ergebnis bleibt
  vollständig sichtbar, der Weg zum Video ist trotzdem ab Sekunde 1 präsent.
- **Mail-Link muss immer auf die Videoseite führen**, auch wenn der Lead den
  Ergebnis-CTA nie geklickt hat. (Laut Code schon so — live verifizieren, sonst
  fixen.)
- **Scroll-Reset:** erst per Test belegen, dann auf allen Step-Wechseln fixen.
- **Zugangsmail umbauen statt zweiter Sofort-Mail:** Es bleibt EINE Mail mit
  Erfolgscode, aber Video-CTA nach oben. (Zwei Mails im Minutenabstand →
  Zustellbarkeits-/Aufmerksamkeitsrisiko. Der zweite Touch ist die
  Erinnerung aus AP5.)
- **Sofort senden statt 2–6 Min später ist okay:** Der Resume-Link löst den
  Zustand serverseitig **beim Klick** auf (bridge liest den aktuellen
  Fortschritt), er passt sich also automatisch an, auch wenn der Lead nach dem
  Optin weiterschaut.
- **ZeroBounce-Gate entschärfen:** Formular validiert bereits über den eigenen
  Checker; nur noch harte Fälle blocken bzw. auf Log-only stellen.
- **Erinnerung bei „kein Videostart“:** ja, umsetzen (Timing in AP5).
- **Weitere Nurture-Strecken (a4/a5, D3, E1, EV*) aktivieren:** dringend, aber
  eigenes Arbeitspaket (AP8), nicht Teil der ersten Welle.
- **WhatsApp:** Phase 2, siehe §6 — hängt an der Telefonnummer (A/B-Zweig
  `experiment/optin-phone-ab`, Schalter aus).

---

## 4. Arbeitspakete

Reihenfolge = Priorität. AP1–AP4 sind die erste Welle.

### AP1 — Scroll-Verhalten: Test, dann Fix
1. **Test zuerst** (Playwright, Viewport 390×844 mobil + Desktop): Quiz bis zum
   Optin durchklicken, absenden, `window.scrollY` auf der Ergebnisseite messen;
   dann unten „Teil 1 starten“ klicken und messen, ob der Player im Viewport
   liegt (`getBoundingClientRect` des iframe). Erwartung laut Code-Analyse:
   Offset bleibt erhalten. Ergebnis dokumentieren.
2. **Fix:** Bei jedem Step-Wechsel (`v`/`t` in `App.jsx:1651-1656`) nach dem
   Rendern `window.scrollTo({top: 0})` (ohne Smooth, sofort). Gilt für ALLE
   Übergänge (Quiz→Optin, Optin→Ergebnis, Ergebnis→Videos, Video n→n+1).
3. Akzeptanz: Nach jedem Übergang steht der Viewport oben; auf der Videoseite
   ist der Player ohne Scrollen sichtbar. Bestehende E2E-Tests grün.

### AP2 — Ergebnisseite: CTA-Text + Sticky-Dock
1. Button-Text ersetzen (`translations.js`, Schlüssel des Ergebnis-CTA; alle
   6 Sprachen). Textrichtung — nutzenorientiert, neugierig machend, ohne
   „Teil 1“: z. B. DE:
   - „Was steckt hinter deinem Code? → Video ansehen (3 Min)“
   - „Dein Ergebnis erklärt in 3 Minuten → Video ansehen“
   - „Video ansehen: Was dein Erfolgscode bedeutet (3 Min)“
   Finale Formulierung mit Markus abstimmen; Minutenangabe („3 Min“) beibehalten.
2. Sticky-Dock-CTA: Der CTA ist ab Laden der Ergebnisseite als Sticky-Footer
   sichtbar (safe-area beachten, iOS). Erreicht der Nutzer die natürliche
   Button-Position am Seitenende, dockt der Button dort an (kein Schweben mehr,
   kein Doppel-Button). Umsetzung z. B. via IntersectionObserver auf dem
   Dock-Anker + CSS `position: fixed` ↔ `static`; sanfter Übergang.
3. Der Sticky darf das Ergebnis nicht verdecken (max. Höhe ~64 px, Seiteninhalt
   bekommt entsprechendes `padding-bottom`).
4. Akzeptanz: Screenshot-Tests mobil/desktop; Klick auf Sticky und auf
   angedockten Button feuern beide `result_cta_click` und wechseln zu Videos.

### AP3 — Verifikationen am Livesystem (vor weiteren Mail-Umbauten)
- **T1 Kartei-Modus:** Auf dem Coolify-App-Server (`167.233.251.217`, SSH 22)
  die Env des business-leads-Containers prüfen: steht der contacts-Quiz-Modus
  auf `an`? Ergebnis in diesem Plan nachtragen.
  **✅ Ergebnis 01.09.2026 (Coolify-API, App `yhoacszoiofuq6dg4mykyr7b`):
  `CONTACTS_QUIZ_MODUS=schatten` — der neue Weg sendet NICHT, der Versand läuft
  weiter über den alten contacts-Webhook + n8n-Cron (5 Min). `CONTACTS_QUIZ_URL`
  und `CONTACTS_QUIZ_WEBHOOK_SECRET` sind gesetzt; Umschalten auf `an` wäre rein
  konfigurativ möglich → Cutover-Entscheidung von Markus, nicht Teil dieses
  Plans. Für AP4.4 gilt damit der „Sonst“-Zweig (Post-Processor-Cron/Trigger
  prüfen).**
- **T2 Mail-Link-Ziel:** Mit einem Test-Optin (eigene Adresse) die Zugangsmail
  auslösen, Link klicken **ohne** vorher den Ergebnis-CTA zu klicken. Erwartung:
  Landung direkt auf Video 1. Falls Ergebnisseite: Fehler liegt im n8n-Node
  `HTTP - Generate Resume Token` (Payload `resumeTarget`) oder in der
  Short-Link-Auflösung — fixen, bis T2 grün ist.
  **✅ Ergebnis 01.09.2026: GRÜN.** Test-Optin `markus+t2video@global-sce.com`
  (`?test=1`, Slug markus) → Post-Processor-Execution 588266 (18:50 UTC)
  erzeugte `…/markus?r=6H6jEsbbF&target=videos`; der Link landet im frischen
  Browser ohne vorherigen CTA-Klick direkt auf Video 1 (Player + „Teil 1:
  Einführung“). Live-Export bestätigt zudem `resumeTarget: 'videos'` im Node.
  Kein Fix nötig.
- **T3 Scroll-Test** aus AP1.1.
  **✅ Ergebnis 01.09.2026: Befund belegt und gefixt.** Vor dem Fix startete
  die Ergebnisseite mobil bei 182 px Scroll-Offset (Messwert aus
  `scripts/e2e/scroll-reset.e2e.js`); Desktop wurde nur durch das Klemmen der
  kurzen Videoseite „gerettet“. Fix: Scroll-Reset auf allen Step-Wechseln,
  E2E-Suite als Regression-Wache.

### AP4 — Zugangsmail umbauen (n8n `AC - Lead Post Processor`)
Node `Code - Apply Resume Link` (dort liegen `LEAD_EMAIL_I18N` und
`buildPremiumLeadEmailHtml`), alle Sprachen:
1. **Betreff:** Code UND Video, z. B. DE „Dein Erfolgs-Code ist da — und Video 1
   (3 Min) wartet“. Preheader passend.
2. **Struktur:** Gruß → Intro (1–2 Sätze) → **Video-Button** → danach die
   Typanalyse (Snapshot/Stärken/Schatten/Narrativ) → zweiter, identischer
   Button am Ende. CTA-Label konkret: „Video 1 ansehen (3 Min)“.
3. **`resumeIntro` für Erstversand korrigieren:** kein „wo du zuletzt aufgehört
   hast“; stattdessen „Dein persönlicher Zugang zu den 3 Videos — Video 1 dauert
   3 Minuten.“ (Der Nurture-Wiedereinstiegstext bleibt für spätere Mails.)
4. **Versandzeitpunkt:** so früh wie möglich. Wenn T1 = Modus `an`: Outbox-Takt
   1 Min reicht. Sonst prüfen, ob der Post-Processor-Cron enger geht oder ein
   Webhook-Trigger möglich ist. (Resume-Link passt sich beim Klick an, §3.)
5. **Ausfallsicherheit:** Resume-Token-Fehler darf den Versand nicht mehr
   komplett stoppen: Retry (3×, Backoff); wenn weiter fehlerhaft → Mail
   trotzdem senden mit Standard-Link auf `https://business.activecenter.info/
   <slug>` + Job zur manuellen Nacharbeit markieren; Berater-Mail unabhängig
   davon senden.
6. **ZeroBounce-Gate:** auf Log-only stellen oder nur `invalid` hart blocken
   (Formular validiert bereits, §2.7).
7. Akzeptanz: Testmail in DE + 1 weiterer Sprache; Links per T2 verifiziert;
   Postmark-Tags unverändert (`lead_access`).

**✅ Umgesetzt und live seit 01.09.2026 ~21:05 (Workflow 9RZdrLxfA8IRhd55,
versionId 6cc5bb81…, Vorher-Stand in
`n8n/backups/ac-lead-post-processor-2026-09-01-vor-ap4.json`):**
- Betreff/Preheader/Intro/CTA in allen 6 Sprachen neu (Sandbox-Validierung je
  Sprache: 2 Buttons, erster VOR der Typanalyse; `d:/tmp/validate-ap4-mail.js`).
- Struktur: Gruß → Intro → Zugangszeile → **Video-Button** → Typanalyse →
  zweiter identischer Button. `resumeIntro` spricht nicht mehr vom
  Wiedereinstieg.
- AP4.4: Post-Processor-Cron 5 → **1 Minute** (T1 ergab `schatten`, alter Weg
  bleibt Versandweg). Live gemessen: Zugangsmail ~1–2 Min nach Optin.
- AP4.5: Token-Node mit Retry 3×/2 s; scheitert auch das, geht die Mail mit
  Standard-Link `…/<slug>` trotzdem raus, Job wird via
  `last_error='resume_link_fallback_manual_followup'` zur Nacharbeit markiert,
  Berater-Mail läuft weiter.
- AP4.6: Gate blockt nur noch `status=invalid` (Node heißt historisch
  „ZeroBounce“, ruft längst den eigenen Checker `/api/validate-email`).
- Live-Abnahme mit Test-Optin `markus+ap4mail@global-sce.com` (Execution
  588387): Betreff neu, Button vor Analyse, Postmark OK, Tag `lead_access`
  unverändert, Job processed.

### AP5 — Erinnerung „kein Videostart“ (n8n, neue Phase)
- **Zielgruppe:** `completed_rank = 0` UND kein `video_started`-Ereignis UND
  kein `cta_type` UND nicht abgemeldet. (Das Startsignal muss in die
  Auswahlabfrage — heute liest `Supabase - Get Eligible Leads` nur
  `completed_rank`/`videoN_completed_at`/`cta_type`.)
- **Timing:** 2–3 h nach `form_submitted_at`, aber nur im Fenster 08–21 Uhr
  Europe/Berlin; Optins nach ~18:30 Uhr bekommen die Erinnerung am Folgetag
  09:00. Einmalig; `a2` (12 h) bleibt dahinter bestehen und wird auf die neuen
  Zustände abgestimmt (AP8).
- **Inhalt:** kurz, ein CTA: „Dein Video 1 wartet (3 Min) — dein Erfolgs-Code
  wird darin eingeordnet.“ Resume-Link mit `target=videos`.
- **Differenzierung nie geöffnet vs. fast durch** (Markus: ja): zweite Variante
  für `video_started` vorhanden, aber `max_unique_watched_percent < 95`:
  „Du warst fast durch — die letzten x Minuten warten.“ Diese Variante kann in
  `a2`/b-Phasen einfließen statt einer eigenen Sofortmail.
- Akzeptanz: Trockenlauf im n8n gegen Testleads; keine Doppelversände
  (Phase-Marker analog `a2SentAt`).

**✅ Umgesetzt und live seit 01.09.2026 ~21:40 (Sender RqKSRTgFv8mv04H2,
versionId cc063a21…, Vorher-Stand in
`n8n/backups/ac-quiz-nurture-email-sender-2026-09-01-vor-a1.json`):**
- Neue Phase `a1`: 2–24 h nach `form_submitted_at`, kein `video_started`, kein
  CTA, Fenster 08–21 Uhr Berlin, einmalig (Dedupe doppelt: `nurture_sent`-Event
  + Mautic `ac_nurture_sent_phases`). `a2` (12 h) bleibt unverändert dahinter.
  Die 24-h-Obergrenze verhindert beim Scharfschalten den Altlead-Schwall; der
  Send-Cap (25/Phase, 60/Lauf) greift auch für `a1`.
- 6 Mautic-Vorlagen 186–191 (`AC Nurture - A1 - <LANG> - generisch`), EINE
  generische Fassung je Sprache, Knopf `target=videos` via Resume-Link-Feld.
  Texte: `nurture/vorlagen/a1-kein-videostart.js`, Lesefassungen
  `nurture/vorlagen/nurture-a1-<lang>.md` (fr/ru/hu noch nicht muttersprachlich
  gegengelesen — gleiche Lage wie generische Strecke).
- Trockenlauf: 11 Szenarien gegen die gepatchte Phasenlogik
  (`scripts/n8n-validate-ap5-phase.js`) — Fenster, Altersgrenzen, video_started,
  CTA, Testlead-Ausschluss, a2-Vorrang, Bestandsphasen unberührt: alle grün.
- Deploy nach agent-core-Protokoll (API-PUT + Container-Neustart). Erste echte
  Kandidaten frühestens beim 08:00-Berlin-Lauf am 02.09. — **Nachkontrolle:
  ersten Morgenlauf im n8n prüfen (Phase a1 im Lauf, keine Fehler).**
- „Fast durch“-Variante bewusst NICHT hier: fließt in `a2`/b-Phasen (AP8).

### AP6 — Kleine Robustheit + Messbarkeit (Frontend)
1. `result_viewed`-Event beim Mount der Ergebnisseite (analog `optin_viewed`,
   `App.jsx:534-543`) — macht das 25-%-Leck trennbar.
2. Guard für den toten Pfad: Resume mit Ziel `result` ohne `profileCode` →
   auf `videos` umleiten statt ins Quiz (`App.jsx:1590-1640`).
3. Optional: `loading="lazy"` am Player-iframe entfernen (Player ist nach AP1
   im Viewport, lazy bringt dann nur noch Verzögerung).

### AP7 — Video 2 (Video-Arbeit, kein Code)
Befund §1: Reveal in Sekunde ~30, 36 % Frühabbruch (Anzeigen) vs. 7 % (Organik),
9:18 Länge. Empfehlung in dieser Reihenfolge:
1. **Einwandbehandlung direkt nach dem Reveal einschneiden** (20–30 s): den
   Herbalife-/Network-Reflex benennen und ein konkretes Versprechen geben,
   was in den nächsten Minuten beantwortet wird — dann entscheiden lassen.
2. **Straffen:** generischen Marktteil („Informationsflut“) kürzen; „Was ist
   für dich drin“ deutlich nach vorn; Ziel ≤ 6–7 Min.
3. Größerer Umbau (nur falls 1+2 nicht reichen): Reveal ans Ende von Video 1.
Erfolgskriterium: Frühabbruch (< 25 %) bei Anzeigen von 36 % Richtung < 20 %;
Messung über das Cockpit-Videomodal (dort liegen die Quoten je Video).

### AP8 — Nurture-Strecke aktivieren/abstimmen (eigenes Paket, „dringend“)
`a4`/`a5` in `ACTIVE_PHASES` aufnehmen, `D3`/`E1`/`EV1–EV12` Sender bauen,
Vorlagen-Doku (Tag 2) mit Code (12 h) versöhnen, neue AP5-Phase einsortieren.
Vorher Bestandsaufnahme gegen das LIVE-n8n (Export ist vom 28.08., §7).

---

## 5. Messplan (Erfolg nachweisen)

Vorher-Basis (gesamte Laufzeit, Anzeigen): Optin → Video-1-Start 75 %,
→ Video-1-fertig 57 % der Starter, Video-2-Frühabbruch 36 %.
Nach AP1/2/4/5 wöchentlich im Ads-Cockpit (https://ads.hl-support.biz,
Hot-Leads-Kachel → Videomodal) prüfen:
- Optin → „Video 1 gestartet“ soll Richtung 85–90 % gehen (Lücke war Mechanik).
- `result_viewed` (neu) erlaubt: Optin → Ergebnis gesehen → CTA geklickt sauber
  zu trennen.
- Kosten je Hot Lead im Cockpit beobachten (Ziel: < 80 €, Env
  `ZIEL_KOSTEN_HOTLEAD`).

## 6. WhatsApp (Phase 2 — nur Konzept, nichts bauen)

Ausgehende WhatsApp-Automation existiert nicht (nur statische `wa.me`-Links).
Voraussetzung wäre die Telefonnummer im Optin — dafür liegt der A/B-Zweig
`experiment/optin-phone-ab` bereit (Schalter aus). Wenn Telefon + Einwilligung
vorhanden: WhatsApp Business Cloud API mit freigegebener Template-Message
(„Dein Erfolgs-Code + Video-Link“), getriggert wie die Zugangsmail; Kontext
liegt in `Meta_Ads_Engine/WHATSAPP_LEAD_AUTOMATION_CONTEXT.md` und im Projekt
`WhatsApp_Engine` (`04_Consumer_Connectors/BUSINESS_LEADS_QUIZ_INTEGRATION.md`).
Entscheidung dazu erst nach dem Phone-A/B.

## 7. Grenzen dieses Plans

- n8n-Aussagen basieren auf dem Repo-Export vom 28.08.2026; das Live-n8n kann
  abweichen (Sprachen hu/fr/ru kamen 31.08. dazu). Vor n8n-Umbauten frischen
  Export ziehen.
- Die Scroll-Hypothese (§2.1) ist Code-Analyse; T3 belegt sie erst.
- Alle Zahlen §1 sind Stichtag 01.09.2026; die SQL-Definitionen stehen im
  Cockpit-Sammler (`Meta_Ads_Engine/07_Ads_Cockpit/app/sammler.py`,
  `SQL_ZEITRAUM`).
