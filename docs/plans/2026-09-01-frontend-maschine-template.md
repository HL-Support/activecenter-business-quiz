# Plan: Maschine/Template-Trennung — das austauschbare Frontend

Stand: 01.09.2026, abends. Auftraggeber: Markus. Freigegeben ist **Schritt 1**
(Herauslösung ohne sichtbare Änderung). Dieses Dokument ist der vollständige,
kontrollierte Plan dafür — jede Aussage über den Ist-Zustand ist am 01.09.2026
im Quelltext nachgelesen worden, nicht vermutet. Fundstellen stehen dabei.

**Entscheidungen von Markus (01.09.):**

1. Umbau **im bestehenden Repo**, kein neues Projekt. Der Neubau entsteht als
   neue Ordnerstruktur unter laufendem Beweis; ein Zweitrepo wäre eine
   institutionalisierte Alt-Kopie (Governance-Fehlerklasse, s. CLAUDE.md R6).
2. Ziel ist **nicht** nur Umfärben: dieselbe Funnel-Maschine soll später
   radikal verschiedene Oberflächen tragen können (anderes Layout, andere
   Texte, andere Formatierung).
3. Template 2 wird **Petrol** nach dem Vorbild des alten Business-Flows
   (`landing-page/business-personality.html`, `--hl-blue #0d7e9e` bzw.
   Business-Token `#2c6370` aus `agent-core/skills/landingpage-style-guardian`).
   Template 2 ist **Schritt 2** und NICHT Teil dieses Plans — der Plan endet
   damit, dass Schritt 2 rein additiv möglich ist.

---

## §1 Kontrolliertes Inventar — was das Frontend heute wirklich ist

Basis der Kontrolle: Arbeitszweig `nurture-auf-plattform-db` @ `6066281`
(enthält `origin/main` @ `de6f1be` inkl. A/B `optin_phone_v1` sowie die
Conversion-Commits `ff004b0` Scroll-Reset und `6066281` Sticky-Dock-CTA +
`result_viewed`).

### 1.1 Dateien und Verantwortungen

| Datei | Zeilen | Rolle heute |
| --- | ---: | --- |
| `index.html` | 229 | Shell: Meta-Pixel (PageView), playerjs-CDN, lädt `/video-config.js` + `/translations.js`, Resume-Loader, Sprach-Bootstrap, Legal-Modal-DOM, wartet auf `window.TRANSLATIONS` und lädt dann `/assets/app.js` |
| `src/app.entry.js` | 19 | Entry: importiert **Wurzel**-`ac-track.js` (Side-Effect) + `bootstrapQuiz()`; meldet Bootstrap-Fehler über `window.__AC_BOOTSTRAP_STATUS__` |
| `src/app/bootstrap.js` | 420 | Resume-Kette (`?r=` Key / `?resume=` Token → `/api/bridge resolve_resume_*` → localStorage-Saat inkl. `adoptResumeLeadRun`), Nurture-Attribution (`acn_*` → `nurture_resume_opened`), Missing-Coach-Seite (eigenes Inline-HTML-Design!), Popstate-Guard, StrictMode-Mount |
| `src/app/App.jsx` | 2910 | ALLES Sichtbare: 8 Screens, Video-Tracking-Engine `qp()`, Event-Aufrufe, 178 Inline-Style-Objekte (121 farbtragende Zeilen), Sticky-Dock-CTA, Legal-Modal-Binding |
| `src/lib/core.js` | 1830 | Maschine-Kern (Lead-Run, Attribution, Submission, Events, Fragen/Profile) **plus** 7 Style-Helfer (Z. 1751–1830) und die Profil-Akzentfarben (Z. 1064–1183) — die Datei ist selbst gemischt |
| `src/lib/lead-event-queue.js` | 318 | Persistente Event-Queue → `/api/lead-track` (Backoff, Dead-Letter) |
| `src/lib/attribution-shadow.js` | 90 | Schatten-Vergleich zweier Attribution-Bauweisen (Diagnose) |
| `ac-track.js` (Wurzel) | 511 | **Legacy-Seitentracker**: `window.acTrack*`, `track_event` an die Bridge, eigene Session (`acTrackingSession`, Cookie `acTrackingSlug`) — Fallback, wenn v2 inaktiv |
| `src/ac-track.js` | 183 | **Zweite, andere Datei**: Legacy-Analytics-Batcher (`write_analytics_batch`), dynamisch importiert von `trackQuizAnalytics` im Nicht-v2-Fall (`core.js:1209`) |
| `translations.js` | 2869 | 271 Keys × 6 Sprachen (de/it/fr/ru/en/hu); Gruppen: q1–q6 je 11, profile 72, optin 30, video 26, result 20, final 12, intro 11, aspconf 11, analyzing 7, quiz/barrier/asp 12, Rest 8 |
| `video-config.js` | 40 | `window.AC_VIDEO_CONFIG`: 3 Videos × 6 Sprachen (Bunny-CDN lib 242544) |
| `build.js` | 199 | esbuild ESM-Bundle → `dist/assets/app.js`; Kopien translations/video-config/fonts; zweites Ziel berater-info; toter Legacy-Babel-Zweig |
| `src/berater-info/*` | — | Vollständig getrennt (eigene Übersetzungen, kein core-Import) — **wird nicht angefasst** |

### 1.2 Die Schrittfolge (QuizFlow-State `e`, App.jsx:1627 ff.)

```
intro ──quiz_started──► quiz(n=0..2, Phase 1 · gold)
  quiz(n=3)=Frage 4 ──answer──► aspiration-confirm ──aspiration_confirmed──► quiz(n=4)
  quiz(n=5)=Frage 6 ──answer──► analyzing (5 Schritte × 620 ms + 500 ms) ──quiz_result──► optin
  optin ──submit──► result ──result_cta_click──► videos(c=1..3) ──► final
Restart (final) ──► resetLeadRun + intro
Resume (bootstrap): target videos → videos(c=N, resumeStartPercent) · final → final
  · result+profileCode → result · result OHNE profileCode → videos(1)  [Guard AP6.2]
```

Übergangsmechanik `v()` (App.jsx:1776): 350 ms Opacity/Transform-Blende +
`answerLockRef`-Doppelklickschutz; Scroll-Reset auf **jedem** Wechsel von
`e`/`n`/`c` (App.jsx:1730–1735, Commit `ff004b0`). Phase-2-Fragen (4–6) färben
Fortschritt/Auswahl **blau `#74B9FF`** statt gold (App.jsx:2648).

### 1.3 Ereignis-Matrix — wer feuert heute was (kritischste Tabelle)

Weg A = `trackQuizAnalytics` („Dt") → v2: Queue → `/api/lead-track`; nicht-v2:
dyn. Import `src/ac-track.js` → `write_analytics_batch`. Weg B = direkt in core.

| Ereignis | Auslöser heute | Fundstelle |
| --- | --- | --- |
| `page_view` | initializeQuizEnvironment | core.js:923 |
| `quiz_started` | Intro-CTA | App.jsx:1921 |
| `question_viewed` | Effect bei quiz+n | App.jsx:1720 |
| `question_answered`→`quiz_answer` | Antwort-Klick | App.jsx:1785 |
| `aspiration_confirmed` | Bestätigen-CTA | App.jsx:2575 |
| `quiz_result` | Ende analyzing | App.jsx:1828 |
| `optin_viewed` (+`experiment_*` wenn Messung) | Effect Optin-Mount | App.jsx:555 |
| `form_submit` (+`experiment_*`) | Submit-Klick, VOR dem Netz | App.jsx:491 |
| `form_submitted` (+phone/experiment) | **core**, nach 2xx des Adapters | core.js:1668 |
| `email_correction_pending` | **core**, direkter fetchWithTimeout | core.js:1374 |
| `result_viewed` | Effect result-Mount (NEU 6066281) | App.jsx:1740 |
| `result_cta_click` | Ergebnis-CTA (Dock ODER Sticky) | App.jsx:2105 |
| `video_viewed` | Effect VideoStep-Mount | App.jsx:993 |
| `video_started` / `video_progress` (5-%-Buckets, unique-Sekunden) / `video_seeked` / `video_resume_seek` / `video_unlocked` (≥95 % unique) / `video_completed` / `video_ended_low_watch` / `video_health` | Player-Engine `qp()` | App.jsx:152–431 |
| `video_recovery` | Reload-Knopf Fehlerbox | App.jsx:981 |
| `video_continue_click` | Weiter-CTA | App.jsx:2629 |
| `final_viewed` | Effect Final-Mount | App.jsx:1318 |
| `cta_click`→`cta_clicked` | WhatsApp/Später | App.jsx:1452, 1476 |
| `nurture_resume_opened` | bootstrap nach Resume | bootstrap.js:268 |
| Meta-Pixel: `PageView` (Shell), `Lead` mit `eventID=capi_<hash>` (Optin), Quality-Events Video1/2/3 + FinalCTA (`sendMetaBrowserQualityEvent`) | | index.html:21, App.jsx:519, core.js:721–791 |

Serverseitige Anreicherung jedes Queue-Events (core.js:697–711): lead_hash,
client_seed, visitor_id, member_id, ref_id, berater_slug, source_app,
funnel_key, lang, event_at, is_internal_traffic, is_resume.

### 1.4 API-Aufrufe aus dem Frontend

| Endpunkt/Action | Aufrufer |
| --- | --- |
| `/api/bridge lookup_subdomain` | core lookupCoach (Init + memberId-Recovery) |
| `/api/bridge forward_typeform_adapter` | core performQuizSubmission (DER Submit; meta.phone/experiment nur bei A/B) |
| `/api/bridge update_points_result` | core:1546 (initial) + App.jsx:85 (Video) — **nur nicht-v2** |
| `/api/bridge notify_all_videos_completed` | App.jsx:123 (queued-Ack → localStorage-Merker) |
| `/api/bridge resolve_resume_token/_key` | bootstrap |
| `/api/bridge track_event` / `write_analytics_batch` | die zwei Legacy-Tracker |
| `/api/lead/init` | core initializeLeadSystemV2 |
| `/api/lead-track` | Queue + `email_correction_pending` |
| `/api/validate-email`, `/api/confirm-email-correction` | E-Mail-Reputation (Optin) |

### 1.5 Speicher-Schlüssel (localStorage; Cookies kursiv)

acCoach · acMemberId · acBeraterSlug · acQuizTrackingSession_v1 ·
acTrackingSession (Legacy) · acTrackingAttribution · acVisitorId ·
acInternalTraffic · acLeadRun:&lt;slug&gt; · acLeadSystemV2:&lt;slug&gt; ·
preferredLang:&lt;slug&gt; · acBizLead · acSessionIsResume · acResumeFromLink /
-VideoStep / -Target / -StartPercent / -ProfileCode / -Aspiration / -Barrier
(einmalig, werden beim Verbrauch gelöscht, App.jsx:1662–1678) ·
acVideoProgress_ / acVideoFullCompletion_ / acVideoCompletionCoachNotify_ /
acVideoPointsCompletion_&lt;slug&gt;_&lt;lead&gt; · acLeadEventQueue_v1 ·
acLeadEventDead_v1 · acEventBatch (Legacy) · acQuizHash(+ :slug) (wird aktiv
entfernt, core.js:884) · *acTrackingHash* · *acTrackingSlug* · *acVisitorId* ·
*acInternalTraffic* · *_fbc* · *_fbp*

### 1.6 Wo das Design heute wohnt (die Umbaufläche)

1. `core.js:1751–1830`: pageLayout, panelStyle, titleStyle, badgeStyle,
   primaryButtonStyle, secondaryButtonStyle, inputStyle.
2. `App.jsx`: 178 Inline-Style-Objekte, 121 farbtragende Zeilen; Gold `#C9A84C`
   29× im Projekt; 73 verschiedene Farbwerte gesamt.
3. **Profil-Akzente in den DATEN**: getProfiles (core.js:1064 ff.) trägt je
   Profil `accentColor`/`accentSoft` (R `#FF6B6B`, Y `#FFD166`, G `#6ECB8A`,
   B `#74B9FF`) — Optin/Result/Videos/Final färben damit. 🔴 DESIGN.md:122
   behauptet fälschlich, `accentColor` käme vom **Coach** — sie kommt vom
   **Quiz-Profil**. Wird in E6 korrigiert.
4. Phase-2-Blau `#74B9FF` für Fragen 4–6 (App.jsx:2648).
5. `index.html`: App-Loader (Resume) + Legal-Modal (bewusst hell) + Grundfonts.
6. `bootstrap.js:324–402`: Missing-Coach-Seite als Inline-HTML mit hart
   verdrahtetem Gold-Schwarz — vierter Style-Ort, leicht zu vergessen.
7. `DESIGN.md`: YAML-Token-Katalog existiert bereits (Frontmatter) — er wird
   die Quelle des Klassik-Themes, war bisher aber reine Doku ohne Code-Bindung.
8. Fonts: selbst gehostet `fonts/fonts.css` (Cormorant Garamond + DM Sans),
   nachgeladen in App.jsx:1653–1660.

### 1.7 Die Wächter, die den Umbau überleben müssen

| Wächter | Was er hält | Umbau-Relevanz |
| --- | --- | --- |
| `scripts/verify.js` → `verifyHashFlow()` | **wörtliche** Quelltext-Verträge gegen core.js/App.jsx (z. B. `core.includes("lead_hash: hash")`, `!core.includes("fetch('/api/lead-track'")`, `app.includes("e('fr', 'FR')")`) | 🔴 Jede Verschiebung muss die Verträge MITZIEHEN — Eigenschaft behalten, Fundort ändern. Pro Etappe explizit gelistet. |
| `scripts/lint-grenze.js` | Grenzzaun um `server/legacy/` (Muster + benannte Ausnahmen), läuft in `pnpm run lint` | Vorbild und Träger der NEUEN Grenzen (E5) |
| 34 Testdateien (319 Tests grün, Stand 01.09.) | u. a. business-rules (lädt core via esbuild), optin-phone-experiment (12, inkl. Payload-Reinheit), contacts-quiz-uebergabe (Feldparität des Submits), lead-event-queue | laufen unverändert weiter — sie SIND der Beweis |
| E2E-Harness `scripts/e2e/lib.js` | frischer dist/-Build gegen die ECHTE Produktions-API, Fehlerinjektion im Proxy, `?test=1`-Leads; scroll-reset + result-cta + queue-failure | Abnahme jeder Etappe; wird um Golden-Payload + Screenshot erweitert (E1) |
| CI `safety` + `e2e-queue` + Deploy-Beweis `/health/live` | Branch Protection auf main | unverändert |

### 1.8 Parallelarbeit und Sperren (Stand 01.09. abends)

1. **B4-Schattenlauf misst den Opt-in-Sendeweg** (CONTACTS_QUIZ_MODUS=schatten;
   B5-Tor: ≥3 ruhige Werktage, Umschalten = Env-Änderung). §9b: nie zwei
   Änderungen auf demselben Versandweg. → **Kein Merge/Deploy dieses Umbaus vor
   B5 + Ruhefenster.** Bauen auf dem Zweig ist frei.
2. **Conversion-Strang** (docs/plans/2026-09-01-optin-zu-video-conversion.md):
   AP1/AP2/AP6.1 sind in `ff004b0`/`6066281` bereits im Code (Basis dieses
   Plans); AP4/AP5/AP8 sind n8n-Arbeit (kein Konflikt), AP7 ist Videoschnitt.
   Der Nurture-Zweig (75 Commits vor main) muss **vor** Etappenbeginn nach main
   — dieser Umbau setzt auf dem Merge-Ergebnis auf, nicht auf `de6f1be`.
3. **A/B `optin_phone_v1`** schläft (Schalter aus). Sein Code (core.js:1444–1499,
   OptinStep) wandert in E2/E4 MIT und bleibt von den 12 Vertragstests bewacht.
   🔴 Aktivierung des Telefon-Tests friert den Funnel-Code 6–8 Wochen ein —
   **erst Umbau, dann Test** (Entscheidung Markus 01.09., Architekturgespräch).
4. Wer zuerst mergt, gewinnt die Basis: Sollte während der Etappen ein anderer
   Strang App.jsx anfassen, wird DIESER Zweig rebased — nie umgekehrt.

---

## §2 Zielarchitektur

### 2.1 Ordnerbild (Endzustand Schritt 1)

```
src/
  maschine/                      ← weiß NICHTS von Optik
    ablauf.js                    Schrittfolge, Übergänge, Resume-Abbildung, Restart
    ereignisse.js                DER Ereignis-Katalog: Übergang → Event + Pflicht-Payload
    auswertung.js                Profilrechnung (R/Y/G/B), Aspiration, Barriere (aus core übernommen)
    inhalte.js                   getQuestions/getProfiles/getAnalyzingSteps/getVideoConfig (Daten, OHNE accentColor*)
    index.js                     Fassade: erzeugt {zustand, aktionen} für Templates
  templates/
    klassik/
      theme.js                   Tokens 1:1 aus DESIGN.md-Frontmatter + Profil-Akzente
      schritte/                  Intro.jsx, Frage.jsx, AspirationConfirm.jsx, Analyzing.jsx,
                                 Optin.jsx, Ergebnis.jsx, Video.jsx, Final.jsx
      bausteine/                 Panel, Badge, Buttons, Input, Fortschritt, Sprachschalter,
                                 QuickWhatsApp, MissingCoach
      index.js                   Template-Manifest: { schritte, theme, missingCoach }
    registry.js                  Template-Auswahl + 🔴 Rückfall PRO SCHRITT auf klassik
  app/
    App.jsx                      schrumpft zum Monteur: maschine × template
    bootstrap.js                 unverändert bis E4 (MissingCoach zieht ins Template)
  lib/                           core.js bleibt Heimat der Lead-/Netz-Schicht
```

*(Profil-Akzentfarben ziehen von den Profil-DATEN ins Theme: `accentColor` ist
Optik, nicht Auswertung. `theme.profilAkzent(profileCode)` liefert sie; die
Maschine kennt nur noch R/Y/G/B.)*

### 2.2 Der Vertrag Maschine → Template (die harte Grenze)

Pro Schritt liefert die Maschine ein reines Datenobjekt, z. B.:

```js
// zustand für Schritt "frage"
{ schritt: 'frage', frageIndex: 2, frage: {text, sub, phase, phaseLabel, optionen:[{label,desc}]},
  fortschritt: {aktuell: 3, gesamt: 6}, gewaehlt: null|index, sichtbar: true }
// aktionen (einzige Rückkanäle; Templates kennen KEINE fetch/Storage/Event-APIs)
{ waehle(index), weiter(), zurueck(), starteQuiz(), bestaetigeAspiration(),
  sendeOptin({vorname, email, telefon?}), starteVideos(), naechstesVideo(), restart(),
  waehleSprache(code), oeffneRecht() }
```

**Ereignis-Hoheit:** Templates melden nur Absicht über `aktionen`; die
**Maschine** feuert daraus die Ereignisse aus §1.3 — vollständig, in derselben
Reihenfolge, mit denselben Payload-Feldern. Ein Template KANN die Messung nicht
mehr beschädigen. Mount-Ereignisse (`optin_viewed`, `result_viewed`,
`video_viewed`, `final_viewed`, `question_viewed`) feuert die Maschine beim
Übergang, nicht mehr ein React-Effect — beweisbar identisch, weil Übergang und
Mount heute 1:1 gekoppelt sind (v() rendert genau einen Schritt).

**Sonderfall Video-Engine:** `qp()` (Player-Bindung, unique-Sekunden, Anti-Seek,
95-%-Freischaltung) ist Maschine — sie zieht als `maschine/video-engine.js` um,
UNVERÄNDERT. Das Template liefert nur die iframe-ID und rendert Zustände
(`loading/ready/tracking/unlocked/error/stalled`).

**A/B-Experimente** sind Maschine: `zustand.optin.variante` ('a'|'b') und die
Kennzeichnung kommen von dort; das Template rendert nur, was der Zustand sagt
(Feld zeigen/verstecken). Vorschau (`?optin_vorschau=`) bleibt exakt wie gebaut.

### 2.3 Neue Grenzen im Grenz-Lint (E5, Erweiterung von scripts/lint-grenze.js)

| Regel | Muster |
| --- | --- |
| Maschine trägt keine Optik | in `src/maschine/**` verboten: `#RRGGBB`-Literale, `rgba(`, `fontFamily`, `style:` |
| Templates sprechen kein Netz | in `src/templates/**` verboten: `fetch(`, `/api/`, `localStorage`, `storage.`, Import aus `lib/core.js` außer Typ-/Theme-Hilfen |
| Templates kennzeichnen nicht | in `src/templates/**` verboten: `trackQuizAnalytics`, `experiment_name`, `fbq(` |
| Eine Ereignisquelle | `Dt(`/`trackQuizAnalytics(` außerhalb `src/maschine/` nur noch als benannte, begründete Ausnahme (Ziel: null) |

### 2.4 Was ausdrücklich NICHT angefasst wird

`api/**`, `server/**`, `supabase-*.sql`, `scripts/waechter-*`, n8n, die
contacts-Übergabe, `src/berater-info/**`, beide Legacy-Tracker (bleiben hinter
der Maschine, Abbau gehört zu Strang A/B, nicht hierher), `translations.js`
(Keys unverändert; Template 2 bekommt SPÄTER einen Overlay-Mechanismus, nicht
jetzt), `video-config.js`, Resume-Vertrag der Bridge.

---

## §3 Etappen — jede einzeln gebaut, bewiesen, mergebar

Jede Etappe ist ein eigener kleiner PR mit: 319+ Tests grün · `verify` grün
(inkl. nachgezogener Wortlaut-Verträge) · `lint` grün · E2E-Suite grün ·
**Golden-Payload-Vergleich** grün · Etappen-Notiz im PR. Nichts davon ist
verhandelbar (R0).

### E0 — Beweisgeschirr zuerst (kein Produktcode)

1. **Golden-Payload-Harness**: neuer Test `scripts/tests/frontend-parität.test.js`
   nach dem Muster von optin-phone-experiment.test.js (esbuild-Bundle, fetch-
   Capture): fährt deterministisch Intro→…→Optin-Submit→Result→Video-Events
   durch die exportierten Funktionen und friert die Request-Rümpfe an
   `/api/bridge` + `/api/lead-track` als **Golden Master** ein (normalisiert um
   Zeitstempel/IDs/Hashes). Ab E1 beweist er: Payloads byte-gleich.
2. **Ereignis-Matrix-Test**: kodiert Tabelle §1.3 (Name → Pflichtfelder →
   Auslöser) als Daten; zählt im Harness-Lauf JEDES erwartete Ereignis genau
   einmal. Fehlt eines nach einer Verschiebung, wird es rot — das ist der
   Wächter gegen die „Template vergisst Messung"-Fehlerklasse.
3. **Style-Schnappschuss**: Werkzeug rendert jeden Schritt via
   `react-dom/server` (mit denselben Stubs wie business-rules.test.js) und
   hasht die style-Props je Element-Pfad → `scripts/tests/style-parität.test.js`.
   Vor E3/E4 eingefroren, danach Beweis der Pixel-Gleichheit auf Style-Ebene.
4. E2E-Screenshots als Referenz sichern (scroll-/result-Suite erzeugt sie
   schon nach `e2e-artifacts/`).
   Abnahme E0: alle neuen Wächter laufen GRÜN gegen den unveränderten Code.

### E1 — Ablauf-Maschine herauslösen

`src/maschine/ablauf.js`: Schrittfolge + Übergangsregeln aus QuizFlow
(App.jsx:1627–1846) als purer Automat (Zustand rein/raus, keine React-Hooks);
Resume-Abbildung (App.jsx:1661–1719) und Restart inklusive; die 350-ms-Blende
bleibt Template-Sache (Animationszeit ist Optik), der Automat liefert nur
`sichtbar`. App.jsx nutzt den Automaten, rendert unverändert.
Verify-Anpassung: keine (verifyHashFlow zielt auf core.js/App.jsx-Strings, die
hier nicht wandern). Beweis: E0-Geschirr + `e2e:scroll` + `e2e:result`.

### E2 — Ereignis-Hoheit in die Maschine

`src/maschine/ereignisse.js`: alle `Dt(...)`-Aufrufe aus App.jsx (Tabelle §1.3)
wandern in Übergangs-Hooks des Automaten; `qp()` zieht als
`maschine/video-engine.js` um (identischer Code, nur Ort). A/B-Kennzeichnung
(`messung`/`vorschau`-Trennung) zieht aus OptinStep in die Maschine.
Verify-Anpassung: `app.includes('data.queued === true …')` und
`isLeadSystemV2Active`-Vertrag zeigen dann auf Maschine-Dateien → in
verify.js die Fundorte nachziehen (Eigenschaft identisch).
Test-Anpassung: optin-phone-experiment.test.js Quelltext-Vertrag
(`experiment_variant: messung` in App.jsx) zieht auf die neue Fundstelle um.
Beweis: Ereignis-Matrix-Test (kein Event fehlt, keins doppelt) + Golden-Payload.

### E3 — Theme-Schicht (Klassik als erstes Theme)

`src/templates/klassik/theme.js` entsteht aus dem DESIGN.md-Frontmatter; die 7
Helfer aus core.js:1751–1830 ziehen dorthin (core.js verliert seine letzte
Optik); `accentColor`/`accentSoft` ziehen aus getProfiles in
`theme.profilAkzent()`; Phase-2-Blau wird `theme.phasenAkzent(2)`. App.jsx
ersetzt Farb-/Style-Literale durch Theme-Zugriffe — mechanisch, Screen für
Screen, OHNE Werte zu ändern. Auch: Missing-Coach-Seite (bootstrap) und der
App-Loader (index.html) beziehen ihre Werte aus demselben Katalog (Loader als
Build-Zeit-Injektion, da er vor dem Bundle lebt).
Verify-Anpassung: keine inhaltliche; Beweis: **Style-Schnappschuss identisch**
+ E2E-Screenshots deckungsgleich + Bundle baut.

### E4 — Screen-Zerlegung ins Template

App.jsx (dann nur noch Struktur) zerfällt in `templates/klassik/schritte/*` +
`bausteine/*`; jeder Schritt erhält `(zustand, aktionen, theme, t)`. Der
Sticky-Dock-CTA und der QuickWhatsApp-Footer (die sich gegenseitig verdrängen,
App.jsx:1749–1775 — leicht zu zerreißen!) ziehen ZUSAMMEN als ein Baustein um.
Legal-Modal-Binding bleibt Shell-nah (bindLegalModal), wird vom Template nur
aufgerufen. `de`-Minifizierungs-Namen (a, Dt, Qp, ct, In …) sterben dabei aus.
Verify-Anpassung: `app.includes("e('fr', 'FR')")` u. Ä. zeigen auf die neuen
Dateien. Beweis: Style-Schnappschuss + Golden-Payload + volle E2E-Suite +
Sichtprüfung Markus (Vorschau-Links aller Schritte, beide A/B-Ansichten via
`?optin_vorschau=`).

### E5 — Registry, Rückfall, Grenzzaun

`templates/registry.js` (Auswahl heute: immer klassik; Mechanik: pro Schritt
`template.schritte[x] || klassik.schritte[x]`), Grenz-Lint-Regeln aus §2.3
in scripts/lint-grenze.js, plus Vertragstest „Template-API vollständig"
(jeder klassik-Schritt implementiert den Vertrag; Rückfall greift nachweislich,
Test mit absichtlich leerem Dummy-Template).
Beweis: lint rot bei absichtlichem Grenzverstoß (Negativprobe im Test).

### E6 — Abschlussbeweis + Doku (Definition „Schritt 1 fertig")

1. Deploy nach den Regeln aus §4; danach `scripts/cutover-browserweg.js`
   (Kettentest, echter Browser, 15 DB-Nachweise) gegen die Produktion.
2. Cockpit-Gegenmessung (ads.hl-support.biz) über 3–5 Tage: Optin→Video-Quoten
   im Band der Vorwochen — der Umbau darf in den Kurven UNSICHTBAR sein.
3. Doku: DESIGN.md → „Theme Klassik" restrukturiert (inkl. Korrektur
   Coach-vs.-Profil-Akzent, §1.6.3); AGENTS.md ergänzt (Maschine/Template-Regeln,
   neue kanonische Pfade); STAND-UND-FORTSETZUNG verweist hierauf; dieses
   Dokument erhält den Ergebnis-Anhang je Etappe.

### F1 — Gemeinsamer Fuß-Baustein „Weiter + WhatsApp" (nach E6, gemessen)

Auftrag Markus 01.09. (Nachtrag): Auf der Ergebnisseite konkurrieren heute
Sticky-CTA und WhatsApp-Footer um denselben Platz (Verdrängung über
`acQuickContact`, §5.4). Statt Verdrängung soll geprüft werden: **ein**
gemeinsamer Footer — primärer Weiter-CTA plus kompakter WhatsApp-Knopf daneben
(Alternativen: ersetzen oder stapeln). Vorgehen:

1. In der E4-Vorschau werden alle drei Varianten als Prototyp gezeigt
   (kostet dort fast nichts, weil der Fuß-Baustein ohnehin EIN Baustein ist).
   Markus entscheidet am Bild.
2. 🔴 F1 ist eine **Verhaltensänderung** (CTA-Präsentation → Conversion) und
   darum ausdrücklich NICHT Teil der pixelgleichen Etappen E1–E5. Eigener
   kleiner PR nach E6, Wirkung über `result_cta_click`, `cta_click(whatsapp)`
   und die Optin→Video-1-Quote im Cockpit gemessen (Vorher-Basis §5 des
   Conversion-Plans). Eine Änderung zur Zeit — F1 startet nicht, solange ein
   anderes Messfenster (Telefon-A/B) läuft.

### E7 — (Schritt 2, eigener Auftrag) Template „petrol"

Rein additiv: neuer Ordner, Tokens aus
`agent-core/.../design-tokens.json` (business: `#2c6370`/`#e7f0ee`) bzw.
`business-personality.html` (`#0d7e9e`-Familie), Struktur-Anleihen (Progress
`h-2 rounded-full`, Antwortkarten `border-2` + 4-px-Selected-Ring, feste
Inhaltshöhe) aus §2 des Landingpage-Befunds. Zuteilung/Umschaltung ist dann
eine Maschine-Entscheidung analog optin_phone_v1. **Nicht Teil von Schritt 1.**

---

## §3a Abrissliste — besser machen, nicht nur extrahieren

Auftrag Markus 01.09. (Nachtrag): Der Umbau soll Altlasten AKTIV loswerden
(„wir sind auf Hetzner, kein Vercel, keine Bridge, kein Supabase"), nicht nur
verschieben. Das ist richtig — und es braucht dieselbe Disziplin wie die
Extraktion, denn zwei der genannten Altlasten sind heute noch tragende Wege.

**Grundsatz:** Extraktion und Abriss NIE im selben PR. Jeder Abriss ist ein
eigener kleiner PR mit dem Beweis „niemand ruft es mehr" (Messung/Logs/Grep),
und die Etappen E1–E4 räumen dafür vor: Sie bündeln jeden Altweg auf GENAU
EINE Stelle hinter der Maschine-Fassade, sodass der spätere Abriss ein
Ein-Stellen-Eingriff ist.

| # | Altlast | Ist-Zustand (kontrolliert) | Tor, das den Abriss freigibt | Abriss |
| --- | --- | --- | --- | --- |
| A1 | Legacy-Seitentracker `ac-track.js` (Wurzel, 511 Z., `window.acTrack*`, `track_event`) inkl. Aufruf App.jsx:531 | feuert nur, wenn v2 inaktiv; v2 steht seit Monaten auf 100 % | 30-Tage-Messung „0 × `track_event` vom Funnel" (Bridge-Logs) + Entscheidung Markus | Entry-Import raus, verify-Vertrag (`tracker.includes('persistSession…')`) mitziehen |
| A2 | Legacy-Batcher `src/ac-track.js` (183 Z., `write_analytics_batch`) als Fallback von `trackQuizAnalytics` (core.js:1209) | greift nur ohne v2; das Analytics-Projekt ist stillgelegt (Entscheidung #8, 27.08.) | wie A1 — die v2-Queue puffert Init-Fehler ohnehin selbst | Fallback-Zweig raus; `trackQuizAnalytics` wird reine Queue |
| A3 | `update_points_result` (core.js:1546 + App.jsx:85) | nur nicht-v2 | fällt mit A1/A2 | zwei Aufrufstellen löschen |
| A4 | Opt-in über `forward_typeform_adapter` → alte contacts-Route | 🔴 DER produktive Sendeweg bis B5 (`CONTACTS_QUIZ_MODUS=schatten`) | **B5 vollzogen + Ruhefenster** (Übersichts-Plan §0) | E2 kapselt den Submit auf eine Maschine-Stelle; der Tausch auf den schlanken Weg ist danach ein eigener, kleiner, beweisbarer PR |
| A5 | `ac_`-`session_hash`/`tracking_hash` im Submit-Payload | vom contacts-Webhook-**Vertrag** heute verlangt (docs/contacts-quiz-webhook-vertrag.md); AGENTS: „nur Legacy-Kontext, nicht ausbauen" | Vertragsänderung im contacts-Projekt (Nachbarrepo) | nur vormerken — nicht unser Alleingang |
| A6 | Vercel-Reste: `vercel.json` + verify-Gate `verifyBeraterInfoRewriteOrder`, `.vercel.app`-Internal-Flag (core.js:397–407, ac-track.js), `deploy:preview`/`promote:prod` | Vercel pausiert, 4 Domains hängen noch; Abbau-Tore 12/14, Datums-Tore 01./03.09. | **Vercel-Abbau vollzogen** (eigener Strang, Freigabe liegt vor) | Kleinst-PR: Datei + drei Codestellen + verify-Gate |
| A7 | `acQuizHash`-Aufräumcode (core.js:884 f., Schlüssel §1.5) | reine Hygiene für Alt-Besucher | 90 Tage nach Cutover (≈ Ende Nov.) | Kleinst-PR |
| A8 | `api/bridge.js`-Monolith (~4300 Z.) serverseitig | trägt noch A/B-Strang-Wege; EIGENER Plan existiert: [bridge-abloesen-direktzugriff.md](bridge-abloesen-direktzugriff.md) | A5+B5 der Stränge | gehört NICHT zum Frontend-Umbau — Verweis genügt |
| A9 | „ungeschickte Mails" (Zugangsmail-Aufbau, 12-h-Loch, tote Strecken a4/a5/D3/E1/EV*) | läuft bereits als AP4/AP5/AP8 im [Conversion-Plan](2026-09-01-optin-zu-video-conversion.md) | dort | bewusst NICHT hier — Testdisziplin §4.3 |

Ergebnisbild nach A1–A7: das Frontend spricht mit GENAU vier Endpunkten
(`/api/lead/init`, `/api/lead-track`, `/api/validate-email`/`confirm-…`, einem
schlanken Submit), eine Ereignisquelle, ein Tracker, null Vercel, null
Supabase-Begriffe im Client — und jede dieser Aussagen ist dann per Grenz-Lint
zugehalten, nicht per Erinnerung.

---

## §4 Sequenzierung, Merge- und Deploy-Regeln

1. **Basis**: erst Nurture-Zweig → main (macht ein anderer Strang), dann
   Etappen-Zweig `frontend-maschine-template` von main ziehen. Bis dahin darf
   E0 (reine Testdateien + dieser Plan) gegen `de6f1be` gebaut werden.
2. **Bauen jederzeit — mergen/deployen erst nach B5 + Ruhefenster** (§1.8.1).
   Reihenfolge dann: pro Etappe ein PR, ein Deploy, ein Tagesfenster Abstand;
   nie zwei Etappen in einem Deploy (dieselbe Regel, die A2/A3 getrennt hat).
3. Während der Etappen KEINE anderen Frontend-Änderungen (Testdisziplin wie im
   A/B-Plan); n8n-/Mail-Arbeit (AP4/AP5/AP8) läuft unabhängig weiter.
4. Notbremse je Etappe: Revert des Etappen-PRs (klein, konfliktarm); die
   E0-Wächter bleiben dabei stehen, denn sie beschreiben den SOLL-Zustand.
5. Nach E6: Telefon-A/B aktivieren (Ein-Zeilen-Commit laut dessen Checkliste),
   erst danach Template-2-Entscheidung.

## §5 Bekannte Fallen dieses Umbaus (aus der Kontrolle, nicht aus Vermutung)

1. **verify.js prüft Wortlaut an Dateipfaden** — pro Etappe Verträge mitziehen,
   sonst falsches Rot (oder schlimmer: Vertrag löschen = stiller Wächterverlust).
2. **Zwei ac-track-Dateien** (Wurzel 511 ≠ src 183) — beim Verschieben von
   Importen exakt unterscheiden; app.entry lädt die Wurzel-Datei relativ
   (`'../ac-track.js'` von src/ aus), core dynamisch die src-Datei.
3. **StrictMode** doppelt Effects im Dev — Mount-Events sind heute idempotent
   GENUG (event_uid dedupliziert); die Maschine-Hoheit (E2) macht das Thema
   endgültig gegenstandslos. Bis dahin nichts „aufräumen".
4. **Sticky-CTA ↔ QuickWhatsApp-Footer** verdrängen sich über DOM-ID
   `acQuickContact` (App.jsx:1768–1775) — bei der Zerlegung als EIN Baustein
   behandeln, sonst fangen zwei fixe Footer gegenseitig Klicks.
5. **index.html-Shell-Kopplung**: build.js erkennt den Shell-Modus am String
   `loadAppModule`; die Shell wartet auf `window.TRANSLATIONS`. Loader-Werte
   nur per Build-Injektion themen, Mechanik nicht anfassen.
6. **Minifizierte Namen** in App.jsx laden zu „Aufräumen nebenbei" ein — in
   E1–E3 verboten, Umbenennung ausschließlich in E4 (dort beweist der
   Style-Schnappschuss die Gleichheit).
7. **Resume-Einmal-Schlüssel** (acResume*) werden beim Lesen GELÖSCHT — der
   Automat darf sie exakt einmal konsumieren, sonst bricht Wiedereinstieg.
8. **`profiles`-Objekt trägt heute Optik** (accentColor) und wird an Events
   NICHT mitgesendet — beim Herauslösen darauf achten, dass `quiz_result`-
   Payload (profile code/name) unverändert bleibt (Golden-Payload fängt es).
9. **Fremd-WIP im Haupt-Checkout** (n8n-Ordner, geänderter Conversion-Plan) —
   Etappen NIE im Haupt-Checkout bauen, solange dort ein anderer Strang
   uncommittete Arbeit hält; Worktree je Etappe, danach entfernen.

## §6 Was Markus entscheidet bzw. sieht

| Punkt | Wann |
| --- | --- |
| Sichtprüfung „sieht ALLES exakt gleich aus?" (Vorschau-Links) | Ende E4 |
| F1-Variante am Prototyp wählen: ersetzen / stapeln / EIN Footer (Weiter + WhatsApp) | Ende E4, Umsetzung nach E6 |
| Abriss-Freigaben A1–A3 (Legacy-Tracker) nach der 30-Tage-Messung | nach E6 |
| Freigabe Deploy-Fenster (nach B5, mit Blick auf B4-Tageszählung) | vor erstem Etappen-Merge |
| Telefon-A/B-Start nach E6 | nach E6 |
| Template 2 „petrol": Umfang (nur Farben/Formen oder auch Layout/Texte) | eigener Auftrag E7 |
