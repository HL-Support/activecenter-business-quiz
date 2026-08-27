> 🔴 **MESSSTAND 25.08.2026 — mehrere Werte sind heute das Gegenteil.**
>
> `/health/live` lieferte damals 404 und liefert heute **200 mit Commit**. Die DNS-Tabelle
> zeigt CNAMEs auf Vercel; seit dem Cutover stehen alle drei Domains als A-Record auf
> `167.233.251.217`. Die Nachlauffristen sind durch die Abbau-Freigabe überholt.
>
> Als Inventar der **Aufrufer** weiter gültig — als Zustandsbeschreibung nicht.

---

# Aufrufer-Inventar der drei Quiz-Domains — Cutover-Vorbereitung

Stand: 25.08.2026 · **Erhebung rein lesend** · Auftrag: Phase 3 Schritt 3
(Fahrplan in [STATUS-migrationsvorbereitung-2026-08-25.md](../STATUS-migrationsvorbereitung-2026-08-25.md), §6)

Grundlage: `Coolify/MIGRATIONS-FALLEN.md`, Abschnitte **A0b** (die halbe Aufruferschaft lebt
nicht auf der Box, sondern in n8n, Vercel-Projekten, Typebot und in den Webhook-Feldern der
Dienstleister), **C** (DNS/Cloudflare), **D2b/D2c** (Wildcards und geteilte CNAME-Ziele).

**Es wurde nichts geändert.** Keine DNS-Änderung, kein Workflow-Update, kein Deploy, keine
Env-Änderung, kein Schreibzugriff auf eine Datenbank. Alle Datenbankabfragen waren `SELECT`,
alle HTTP-Proben `GET`/`OPTIONS`/`HEAD` bzw. Konfigurations-Lesezugriffe der jeweiligen APIs.

Betroffene Namen: `business.activecenter.info`, `quiz.activecenter.info`, `business.eaglesfit.ch`.

---

## 1. Zusammenfassung

**9 Aufrufer mit Laufzeitbezug** in drei Klassen, dazu **0 Rückrufe von Dienstleistern** und
**1 zusätzlicher Eingang, der an keiner DNS-Änderung hängt**.

| Klasse | Anzahl | Aufrufer | Cutover-Wirkung |
| --- | ---: | --- | --- |
| **A — n8n, Server-zu-Server** | 4 | Lead Post Processor, Lead System Health Monitor, Lead Sync Outbox Worker, Quiz Nurture Email Sender | Kein DNS-Bruch (alles über Domainnamen). Risiko liegt bei **Auth-Headern und Env-Parität**, nicht bei DNS |
| **B — fremde Frontends, Weiterleitungen, Mail-Links** | 5 | `landing-page` (Vercel), `zzz-business-schulung` (Vercel), `Business_Kalkulator` (Vercel), `landingpages` (Coolify), Mautic (98 Mail-Vorlagen) | Bricht nicht — alle folgen dem Domainnamen |
| **C — eingehende Webhooks von Dienstleistern** | **0** | Postmark, Bunny, Meta, ZeroBounce, Mautic gemessen — keiner ruft eine unserer drei Domains zurück | Nichts umzustellen |
| **D — Eingang ohne DNS-Bezug** | 1 | `businessleadsquiz.vercel.app` (4. Hostname am selben Vercel-Projekt) | 🔴 Überlebt jeden DNS-Wechsel und liefert weiter den Vercel-Stand |

**Das Abnahmekriterium aus A0b#4 ist erfüllt:** In keinem der 85 n8n-Workflows, in keinem
fremden Projekt und in keiner Dienstleister-Konfiguration steht eine **feste IP** für eine
unserer drei Domains. Damit ist der Cutover ein DNS-Wechsel und kein Eingriff in fremde Systeme.

**Zwei Funde, die den Cutover-Plan verändern:**

1. 🔴 **`businessleadsquiz.vercel.app` ist ein vierter Eingang in dieselbe Anwendung**, der in
   keiner DNS-Zone steht. Nach dem DNS-Wechsel liefert er weiter den Vercel-Stand — ein
   Split-Brain gegen die Container-Version, das kein Domain-Sweep und kein `router_check.py`
   sichtbar macht. Er steht zusätzlich in der **eigenen CORS-Allowlist**
   (`server/lead-system.js:336`), ist also kein Zufallsartefakt.
2. 🔴 **`/health/live` liefert auf allen drei Produktivdomains heute HTTP 404** (gemessen).
   Der Endpunkt existiert nur im neuen Adapter, nicht im Vercel-Build. Er taugt deshalb **nicht**
   als Vorher/Nachher-Vergleich und **nicht** als Rollback-Auslöser — ein 404 dort beweist vor
   dem Cutover gar nichts und nach dem Cutover alles.

### Erhebungsumfang

| Achse | Methode | Ergebnis |
| --- | --- | --- |
| n8n | `GET /api/v1/workflows` + **jeder Workflow einzeln** über `/workflows/<id>` (A0b#1: die Liste enthält die Knoten nicht) | **85 Workflows, 60 aktiv** — 4 Treffer |
| Cloudflare | `GET /zones` + `dns_records` **aller 20 Zonen**, A-Records nach IP **und** CNAMEs nach Ziel (D2c) | 2 betroffene Zonen, 16 Vercel-Records kontoweit |
| Vercel | `GET /v9/projects` + `/domains` je Projekt, `GET /v5/domains/<d>/config` | 25 Projekte — alle drei Domains an **einem** Projekt |
| Workspace | ripgrep über `activecenter-web/` mit `--hidden --no-ignore-vcs`, ohne `node_modules`/`.next`/`dist`/`.git` | 5 fremde Projekte mit Laufzeitbezug |
| Coolify-Box | `grep` in allen laufenden App-Containern auf `167.233.251.217` (A0-Kategorie 5b) | 3 Container, davon 1 fremder Aufrufer |
| Dienstleister | Postmark (9 Server), Bunny (3 Libraries), Meta (Graph API), Mautic (`webhooks`-Tabelle), Typebot | 0 Rückrufe auf unsere Domains |

---

## 2. Aufrufer im Einzelnen

Legende Cutover-Relevanz: **bricht** = fällt beim DNS-Wechsel aus · **bricht nicht** = folgt
dem Domainnamen, keine Aktion nötig · **prüfen** = bricht nicht durch DNS, hängt aber an einer
Bedingung, die vor dem Cutover belegt sein muss.

### 2.1 Klasse A — n8n (4 Workflows, alle aktiv, alle zeitgesteuert)

Alle vier laufen heute fehlerfrei; die je sechs zuletzt abgefragten Ausführungen sind `success`
(Stichtag 25.08.2026, 10:37 UTC). Keiner enthält eine feste IP.

| # | Name / ID | Aktiv | Takt | Node | Exakte URL | Zweck | Relevanz |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A1 | **AC - Lead Post Processor - Business Leads Quiz** `9RZdrLxfA8IRhd55` | ja | alle **5 min** | `HTTP - Generate Resume Token` | `POST https://business.activecenter.info/api/bridge` (`action: generate_resume_token`) | Resume-Token/Kurzlink für die Erstmail | **prüfen** |
| A2 | dto. | ja | — | `HTTP - ZeroBounce Validate Lead Email` | `POST https://business.activecenter.info/api/validate-email` (**ohne Auth**) | E-Mail-Prüfung über unsere ZeroBounce-Brücke | **prüfen** |
| A3 | dto. | ja | — | `Set Config` (`cfg_video_base_url`) | `https://business.activecenter.info` | Basis-URL für Videolinks in Mails | bricht nicht |
| A4 | dto. | ja | — | `Code - Normalize Candidate Rows`, `Code - Build Lead Model`, `Code - Apply Resume Link` | Literale `https://business.activecenter.info` und `https://business.activecenter.info/berater-info` (u. a. Z. 222, 324/331/336, 1108, 1475–1498, 1697/1720) | Link- und Betreffbau (`Neuer Kontakt aus business.activecenter.info/<slug>`), Resume-Link-Fallback | bricht nicht |
| A5 | **AC - Lead System Health Monitor - Business Leads Quiz** `m52uJBbSQUFUA2Dm` | ja | alle **15 min** | `HTTP - Lead System Health` | `POST https://quiz.activecenter.info/api/lead-system-health`, Header `X-Bridge-Key`, Body `notify=true` | Gesundheitsüberwachung inkl. Alarmierung | **prüfen** |
| A6 | **AC - Lead Sync Outbox Worker - Business Leads Quiz** `ALLHYLRwkvujkuFJ` | ja | **jede Minute** | `HTTP - Call Lead Outbox Worker` | `POST https://quiz.activecenter.info/api/lead-outbox-worker`, Header `Content-Type` + `X-Bridge-Key`, Body `{batch_size:10, worker_id:"n8n-<execId>"}` | Outbox-Abarbeitung (Mailversand) | **prüfen** |
| A7 | **AC - Quiz Nurture Email Sender** `RqKSRTgFv8mv04H2` | ja | alle **2 h** | `Bridge - Generate Resume Link` | `POST https://business.activecenter.info/api/bridge` (`action: generate_resume_token`) | Resume-Link je Nurture-Mail | **prüfen** |

**Warum „prüfen" und nicht „bricht nicht":** Der DNS-Wechsel selbst trifft keinen dieser
Aufrufe. Alle vier tragen aber Anmeldedaten mit — A1/A7 über die n8n-Credential
`httpHeaderAuth` (`Dwum7g63YfojD3q5`, Header `x-bridge-service-key`), A5/A6 über einen
`X-Bridge-Key`-Header direkt im Node. Sie brechen genau dann, wenn im Container ein anderer
Schlüsselwert steht als in Vercel. Das ist dieselbe Klasse Fehler wie die
JWT-Escaping-Falle aus [STATUS §5F](../STATUS-migrationsvorbereitung-2026-08-25.md) — sichtbar
nur, wenn man die Werte **am laufenden Container hasht** und gegen die Produktion vergleicht.

**Zeitplan-Notiz (A0b#1):** Der langsamste Takt ist A7 mit 2 Stunden. Nach dem Cutover ist der
erste unbeobachtete Lauf spätestens 2 h später — er gehört in die Nachkontrolle, nicht in die
Hoffnung. A6 (jede Minute) ist umgekehrt der schnellste Frühwarnindikator.

**Abgrenzung — keine Treffer, obwohl der Name ähnlich klingt:** `marathon.activecenter.info`
(20 Workflows), `video.activecenter.info` (2), `www.activecenter.info` (1, inaktiv) sind andere
Subdomains und vom Cutover nicht betroffen. `business.eaglesfit.ch` kommt in **keinem einzigen**
n8n-Workflow vor.

### 2.2 Klasse B — fremde Frontends, Weiterleitungen, Mail-Links

| # | Name | Ort | Exakte URL / Fundstelle | Aktiv | Relevanz |
| --- | --- | --- | --- | --- | --- |
| B1 | **landing-page** (Vercel-Projekt, `global-sce.com`, `www.global-sce.com`) | `landing-page/business-info.html:756` und `:782` | Browser-`fetch` auf `https://quiz.activecenter.info/api/bridge`, `action: resolve_resume_token` bzw. `resolve_resume_key` | Seite **live** (`https://global-sce.com/markus/business-info` → 200, 53.310 B) | **bricht nicht** — aber siehe D5-Befund unten |
| B2 | **landing-page**, Rewrite-Regel | `landing-page/vercel.json:31,36` | `has: host = business.activecenter.info` → `/business.html` | tote Konfiguration | bricht nicht |
| B3 | **zzz-business-schulung** (Vercel-Projekt, bewusst weiterbetrieben) | `zzz-business-schulung/next.config.js:12`, `vercel.json:5` | 308-Weiterleitung → `https://business.activecenter.info/berater-info` | ja | bricht nicht |
| B4 | **Business_Kalkulator** / Vercel-Projekt `herbalife-erfolgs-berechner` | `Business_Kalkulator/api/contacts.js:14` | Schulungslink → `https://business.activecenter.info/berater-info` (in CRM-/Mailtext) | ja | bricht nicht |
| B5 | **landingpages** (Coolify-App `idiaser9nsxvgybeusth6rl7`, `w.activecenter.info` + 7 weitere Namen) | Im Container: `/var/www/html/index.php:95`, `/var/www/html/business.php:76,104,120,136` | `<a href="https://business.activecenter.info/<?php echo $herbalifeid; ?>">` | ja, `running:healthy` | bricht nicht |
| B6 | **Mautic** (`mautic.hl-support.biz`, Container `mautic_app` auf `46.224.76.193`) | Tabelle `emails`, Spalte `custom_html` | **97** veröffentlichte Vorlagen mit `business.activecenter.info`, **1** mit `quiz.activecenter.info` (`AC - Business Leads Quiz - Email 0`), **0** mit `business.eaglesfit.ch` | ja — letzter Versand `2026-08-19 12:04:53` | bricht nicht |

**B1 im Detail — ein vorbestehender Defekt, der nicht dem Cutover angelastet werden darf (D5).**
Die alte Business-Info-Seite im Projekt `landing-page` löst Resume-Token gegen unsere Bridge
auf. Gemessener CORS-Preflight gegen `https://quiz.activecenter.info/api/bridge`:

| Origin | Antwort | `Access-Control-Allow-Origin` |
| --- | --- | --- |
| `https://global-sce.com` | 204 | **fehlt** |
| `https://www.global-sce.com` | 204 | **fehlt** |
| `https://business.activecenter.info` | 204 | `https://business.activecenter.info` |
| `https://boese.example` (Negativkontrolle) | 204 | **fehlt** |

Der Browser blockt diese beiden Aufrufe also **schon heute** — seit der CORS-Allowlist aus
#60/#61 vom 24.08.2026, nicht erst durch den Umzug. `resolveResumePayload` fängt das mit einem
lokalen JWT-Decode ab (`decodeResumePayload`) und funktioniert weiter;
`resolveResumeKeyPayload` hat **keinen** Ersatzweg und gibt `null` zurück — Kurzschlüssel-Links
in diese Altseite sind seit dem 24.08. tot. **Für den Cutover heißt das zweierlei:** Der Zustand
ändert sich durch den DNS-Wechsel nicht, und wer ihn danach bemerkt, darf ihn nicht dem Cutover
zuschreiben. Ob die Altseite überhaupt noch Ziel eines Links sein soll, ist eine eigene
Entscheidung (eigener Punkt, siehe §5).

**Ohne Laufzeitbezug — ausdrücklich keine Aufrufer:**

| Fund | Einordnung |
| --- | --- |
| `cw` (Fit-App, Coolify `v1n8oagigossijqqzqvywptt`) | Im Container nur `/var/www/app/docs/app-link-host-policy.md` — Dokumentation, **kein** Laufzeitcode |
| `fitapp-marathon/tests/final-entry-flow.test.ts:53` | Testfixture, kein Produktionspfad |
| `.codex-worktrees/*` (`cw-app-link-fix`, `landingpages-app-link-fix`) | Arbeitskopien, nicht deployt |
| `.claude/settings.json` | Berechtigungsliste für curl-Proben |
| `n8n/`, `tmp/`, `Coolify/provisioning/`, `Leads_quiz_Nurture/`, Audit-Dokumente | Sicherungen, Vorlagen, Protokolle |

### 2.3 Klasse C — eingehende Webhooks von Dienstleistern: **keine**

| Dienst | Geprüft wie | Ergebnis |
| --- | --- | --- |
| **Postmark** | Account-Token → 9 Server aufgelistet, je Server `GET /webhooks` | **6 Webhooks insgesamt, 0 auf unsere Domains.** Ziele: 1× `contacts-activecenter.sharedwithexpose.com` (Dreamfactory), 4× Make.com/n8n (Typenanalyse), 1× n8n (Mautic). Die Server `HL-Support`, `Customerworld`, `Testing`, `Events-Hl-Support`, `Admin`, `Analysen`: **0 Webhooks** |
| **Bunny** | Account-API-Key → `GET /videolibrary` | **3 Libraries.** Nur `FitMarathon` (712936) hat einen Webhook → `https://feeds.hl-support.biz/api/webhooks/bunny/stream`. Die Quiz-Videos liegen in `HL-Support` (**242544**): `WebhookUrl = null`, `AllowedReferrers = []`, `AllowDirectPlay = true` → **keine Referrer-Bindung an unsere Domains** |
| **Meta** | Graph API v21: Pixel-Objekt, Berechtigungen, Business-Node | **Kein Rückruf-Kanal.** CAPI ist ausgehend. Pixel `1322007176552913` („Activecenter Business Quiz Pixel") lebt, `last_fired_time 2026-08-24T22:55:30+0000`. Domain-Bestätigung läuft über das **Meta-Tag** `facebook-domain-verification` in `index.html:8` — es ist Teil des Repos und damit des Images, gemessen live auf **allen drei** Domains identisch (`5kg7v90q4a6cabp7j11lo12vdfug0g`). Die Domainliste im Business Manager selbst ist mit diesem Token nicht lesbar → §3 |
| **ZeroBounce** | Codeprüfung `api/validate-email.js` | Reiner Anfrage/Antwort-Aufruf gegen `https://api.zerobounce.net/v2/validate` aus **unserem** Server heraus. Kein Webhook, kein Rückruf. Kontoseitige Einstellungen nicht prüfbar → §3 |
| **Mautic** | `SELECT id, name, webhook_url, is_published FROM webhooks` (lesend, über `mautic_db`) | **1 Webhook insgesamt**: `AC Nurture - Email Opened -> n8n Reactivation` → `https://n8n.hl-support.biz/webhook/mautic-evergreen-link-clicked`, veröffentlicht. **Kein Ziel auf unseren Domains** → nichts umzustellen |
| **Typebot** | `https://typebot.hl-support.biz/api/v1/*` und `/` | Alle Pfade **HTTP 403, Cloudflare-Fehlercode 1010** — auch die Wurzel ohne Token. Kein Auth-Problem, sondern ein gesperrter/toter Dienst (deckt sich mit dem hl-support-Befund vom 08.08.2026). Im Quiz-Repo existiert **keine** Typebot-Referenz → §3 |

### 2.4 Klasse D — der Eingang, den DNS nicht erfasst

| # | Name | Ort | URL | Relevanz |
| --- | --- | --- | --- | --- |
| D1 | **`businessleadsquiz.vercel.app`** | Vercel-Projekt `business_leads_quiz`, 4. Hostname neben den drei Domains | `https://businessleadsquiz.vercel.app` | 🔴 **bricht nicht — und genau das ist das Problem** |

Es ist **kein Cloudflare-Record** und wird von keinem DNS-Wechsel berührt. Kein externer
Aufrufer wurde gefunden (Treffer nur in der eigenen CORS-Allowlist
`server/lead-system.js:336`, im zugehörigen Test `scripts/tests/lead-api-hardening.test.js:301`
und in einer curl-Berechtigung in `.claude/settings.json`) — aber die Adresse ist öffentlich,
antwortet und schreibt in dieselbe Supabase-Instanz. Nach dem Cutover liefe darüber weiter die
**Vercel-Version** der Anwendung.

Zusätzlich erlaubt die Allowlist jeden Ursprung mit dem Suffix
`-markus-oberhofers-projects.vercel.app` (Preview-Deployments) — dieselbe Klasse Eingang,
nur nicht fest benannt.

---

## 3. Nicht prüfbar — manuell klären

Diese vier Punkte sind mit den vorhandenen Zugängen **nicht** lesbar. Sie werden hier bewusst
als offen geführt statt geraten.

| # | Punkt | Warum nicht prüfbar | Was zu tun ist |
| --- | --- | --- | --- |
| M1 | **Meta: Domainliste und Aggregated Event Measurement im Business Manager** | `GET /<business_id>/owned_domains` → `(#100) Tried accessing nonexisting field`; `verified_domains`/`claimed_domains` → `Unknown path components`. Mit **beiden** hinterlegten Token, obwohl `business_management` gewährt ist — der Node gibt die Kante schlicht nicht her | Im **Events Manager** manuell nachsehen, welche der drei Domains dort geführt sind und wie die AEM-Ereignisreihenfolge je Domain gesetzt ist. *Entlastend:* Die Bestätigung selbst hängt am Meta-Tag im Repo und zieht mit dem Image um (gemessen, §2.3) |
| M2 | **Typebot: gibt es Bots, die eine unserer Domains einbetten oder aufrufen?** | API und Startseite antworten mit **Cloudflare 1010** (Zugriff gesperrt), auch ohne Token. Kein Auth-, sondern ein Erreichbarkeitsproblem | Markus klärt: Läuft Typebot noch? Wenn ja, im Panel nach den drei Domains suchen (A0b#3 — eine Einbettung ist ein D8-Fall, den kein curl-Test zeigt). *Entlastend:* Im gesamten Quiz-Repo existiert keine Typebot-Referenz |
| M3 | **ZeroBounce: kontoseitige Webhook-/Callback-Einstellungen** | Für ZeroBounce liegt **kein Zugang** in `agent-secrets.json` | Im ZeroBounce-Konto nachsehen, ob ein Callback hinterlegt ist. *Entlastend:* Der Code (`api/validate-email.js`) nutzt ausschließlich den synchronen `/v2/validate`-Aufruf — ein Rückruf hätte in dieser Anwendung kein Ziel |
| M4 | **Historische Mail-Links außerhalb von Mautic und n8n** | Bereits zugestellte E-Mails sind nicht inventarisierbar. Belegt sind 98 Mautic-Vorlagen und die n8n-Erstmail; wie viele Postfächer noch ältere Links tragen, ist nicht messbar | Als Größenordnung dient die Nurture-Laufzeit: **90 Tage** ([STATUS §5F](../STATUS-migrationsvorbereitung-2026-08-25.md)). Das ist die Untergrenze für die Lebensdauer der Domainnamen, **nicht** für die Vercel-Nachlaufzeit |

Kein Punkt aus dieser Liste blockiert den Cutover: M1 und M3 betreffen Einstellungen, die vom
DNS-Wechsel nicht berührt werden; M2 ist entlastet durch die fehlende Referenz im Code; M4 ist
eine Frist, keine Prüfung.

---

## 4. DNS-Ist-Zustand (Cloudflare, nur gelesen)

### 4.1 Die drei Namen

| Name | Zone | Typ | Ziel | Proxied | TTL |
| --- | --- | --- | --- | --- | ---: |
| `business.activecenter.info` | `activecenter.info` (`0b43ccb0…`) | CNAME | `12b0f53f0226bb49.vercel-dns-017.com` | **nein** (DNS-only) | **600 s** |
| `quiz.activecenter.info` | `activecenter.info` | CNAME | `2940e78cbc83cdf4.vercel-dns-017.com` | **nein** | **600 s** |
| `business.eaglesfit.ch` | `eaglesfit.ch` (`05ad960f…`) | CNAME | `2940e78cbc83cdf4.vercel-dns-017.com` | **nein** | **300 s** |

Zonen-SSL-Modus **beide `full`** — die Falle C-neu2 (`strict` verhindert sein eigenes
Zertifikat) greift hier **nicht**. Gemessen, nicht angenommen.

Live-Baseline (25.08.2026): alle drei `HTTP/1.1 200`, `Server: Vercel`,
`Strict-Transport-Security: max-age=63072000` (**ohne** `includeSubDomains`),
`X-Vercel-Id: fra1::…`. `/health/live` → **404** auf allen drei.

Vercel-Sicht: alle drei Namen gehören **demselben** Projekt `business_leads_quiz`,
`misconfigured: false`. Vierter Hostname am Projekt: `businessleadsquiz.vercel.app` (§2.4).

### 4.2 D2b — Wildcards

**Keine Wildcard-Records** in `activecenter.info` (39 Records) und `eaglesfit.ch` (8 Records).
Jeder der drei Namen hat einen **eigenen** Record. Der hl-support-Fall („eine Domain, die nur
über den Wildcard ankommt") tritt hier nicht auf.

### 4.3 D2c — geteilte CNAME-Ziele: ein Fund, der eine falsche Schlussfolgerung verhindert

Der kontoweite Sweep über **alle 20 Zonen** (A-Records nach IP **und** CNAMEs nach Ziel) zeigt
16 Records mit Vercel-Ziel. Zwei Ziele werden geteilt:

| CNAME-Ziel | Wer zeigt darauf | Vercel-Projekt |
| --- | --- | --- |
| `2940e78cbc83cdf4.vercel-dns-017.com` | `quiz.activecenter.info`, `business.eaglesfit.ch` | beide `business_leads_quiz` |
| `12b0f53f0226bb49.vercel-dns-017.com` | `business.activecenter.info`, **`www.global-sce.com`** | `business_leads_quiz` **bzw. `landing-page`** |

🔴 **Daraus folgt eine Regel für den Cutover:** Aus einem gemeinsamen CNAME-Ziel darf **nicht**
auf dasselbe Projekt geschlossen werden. `business.activecenter.info` und `www.global-sce.com`
teilen ein Ziel und gehören zu **verschiedenen** Vercel-Projekten. Umgekehrt gilt: Weil das Ziel
Vercel gehört und nicht uns, wird beim Cutover **ausschließlich der eigene Record ersetzt** —
das Ziel selbst wird nie umgebogen. Genau das Umbiegen eines geteilten Ziels hat am 08.08.2026
elf Stunden Ausfall auf drei fremden Domains gekostet (D2c).

### 4.4 Weitere Vercel-Records im Konto (nicht Quiz, nur zur Abgrenzung)

`concept.` (ac-konzept-2026), `details.` (business-details), `facts.` (herbalifewissen),
`news.` (activecenter-blog), `trust.` (activecenter-trust), `ziel.` (activecenter-zielsetzung)
in `activecenter.info`; dazu `skin.`/`wc.hl-support.biz`, `lifestylesurvey.info` (+`www.`),
`global-sce.com` (+`www.`). **Keiner davon gehört zum Quiz** und keiner wird angefasst.

Ebenfalls in den Zonen und **nicht** betroffen: die `_vercel`-TXT-Bestätigungen (u. a. je eine
für `business.` und `quiz.activecenter.info`) — sie müssen für die Rollback-Fähigkeit
**stehenbleiben**, solange die Domains am Vercel-Projekt hängen.

### 4.5 Zielseite: was auf `167.233.251.217` schon steht

| Name | App | Belegt |
| --- | --- | --- |
| `eaglesfit.ch`, `www.eaglesfit.ch` | Coolify-App **`cw`** (Fit-App) | `https://eaglesfit.ch` → 200, Let's-Encrypt-Zertifikat gültig bis 07.11.2026 |
| `w.eaglesfit.ch`, `w.activecenter.info` u. a. | Coolify-App **`landingpages`** | `https://w.activecenter.info` → 302, Zertifikat bis 02.11.2026 |
| `business-leads-test.hl-support.biz` | Coolify-App **`business-leads-web`** (`liydqvexwattbkkhigpluc1q`), `running:healthy` | Zertifikat **ausgestellt am 25.08.2026, 07:39 UTC** |

🔴 **Konsequenz für das Cutover-Fenster:** Die Zone `eaglesfit.ch` ist bereits geteilt — Apex
und `www` bedient `cw` auf der Zielbox, `business.` liegt bei Vercel. Nach dem Umschalten
liegen zwei verschiedene Anwendungen derselben Zone auf **derselben** Box. Das ist genau die
Lage, in der ein Wildcard-Router ohne `priority` am 12.08.2026 vierzehn Apps überstimmt hat
(**B-neu11**) — `python scripts/router_check.py` gehört deshalb **nach** jedem der drei
Schritte gelaufen, nicht nur einmal am Ende.

**Zertifikat und Reihenfolge:** Alle drei Records sind heute `proxied = false`. Cloudflare
terminiert also nicht, der Origin muss selbst ein gültiges Zertifikat vorweisen. Die drei
Messungen oben belegen, dass Traefik/ACME das für DNS-only-Namen auf dieser Box zuverlässig
und schnell tut — aber **erst, nachdem der Name dorthin zeigt** (HTTP-01). Zwischen
DNS-Umstellung und ausgestelltem Zertifikat gibt es deshalb ein kurzes Fenster mit
TLS-Fehlern. Es wird klein gehalten, indem je Domain einzeln umgestellt und das Zertifikat
abgewartet wird — nicht, indem alle drei gleichzeitig fallen.

---

## 5. Was bei einem DNS-Wechsel NICHT bricht

Dieser Abschnitt entlastet den Cutover-Plan: alles Folgende erreicht seine Daten **an den drei
Domains vorbei** und ist von einem DNS-Wechsel per Konstruktion nicht betroffen.

### 5.1 Die Supabase-Verbraucher — 13 von 14 gehen direkt an die Datenbank

Grundlage: [Verbraucher-Inventar](../verbraucher-inventar/INVENTAR.md). Zugriffsweg ist
PostgREST (`/rest/v1/…`), RPC oder das PostgreSQL-Protokoll — **nie** eine unserer Domains.

| Verbraucher | Weg | Vom DNS-Wechsel betroffen? |
| --- | --- | --- |
| `activecenter-analytics` (Vercel) | REST | nein |
| `herbalife-erfolgs-berechner` (Vercel) | REST | nein (der Schulungs-**Link** aus B4 ist davon unabhängig) |
| `herbalife-business-analyse` (Vercel) | REST + RPC | nein |
| `hl-support-analytics` (Vercel) | REST + RPC | nein |
| `fitapp-marathon` (Vercel + Coolify) | **direkt** über Supavisor-Pooler | nein |
| `landing-page` (Vercel) | REST auf `tracking_*` | nein (der Browser-`fetch` aus B1 ist davon unabhängig) |
| `activecenter-hautanalyse`, `wellness-check`, `activecenter-surveys` | REST | nein |
| n8n `AC - Quiz Nurture Email Sender` (Supabase-Teil) | REST + RPC | nein — **nur** sein Bridge-Node (A7) läuft über unsere Domain |
| n8n `AC - Error Alert (Postmark)` | RPC | nein |
| n8n `Supabase Keep-Alive` | REST | nein |
| n8n `AC - Quiz Video Inactivity Checker` (inaktiv) | REST | nein |
| **pg_cron `stats-logs-analytics-v2-current-day`** (alle 15 min, in der Datenbank) | in-database | nein |

Der einzige der 14, der über die Domains geht, ist das Quiz selbst.

⚠️ **Nicht betroffen heißt nicht „irrelevant".** Genau weil diese Verbraucher weiterschreiben,
brauchen sie im **Datenbank**-Cutover (Phase 5/6) die Schreibbarriere — allen voran der
pg_cron-Job, der sonst wie ein unbekannter Fremdschreiber aussieht. Für den **DNS**-Cutover
sind sie schlicht kein Thema.

### 5.2 Weitere Pfade ohne Domainbezug

| Pfad | Warum unbetroffen |
| --- | --- |
| **Meta CAPI** (`server/lead-system.js` → Graph API) | Ausgehend von unserem Server zu Meta. Kein Rückruf. Die Domain-Bestätigung reist als Meta-Tag im Image mit (gemessen auf allen drei Domains) |
| **ZeroBounce** | Ausgehend, synchron, Anfrage/Antwort |
| **Postmark-Versand** | Ausgehend über API-Token, kein Domainbezug. 0 Webhooks auf unseren Servern |
| **Bunny-Videoauslieferung** (Library 242544, CDN `vz-ab5f5c7b-ae8.b-cdn.net`) | Kein Webhook, **leere** Referrer-Allowlist. Die Videos spielen unabhängig davon, welche IP hinter der Domain steht |
| **Mautic → n8n** (1 Webhook) | Ziel ist `n8n.hl-support.biz`, nicht wir |
| **Legacy-MySQL / PHP-Bridge** (`ac-reconnect.com/db-bridge.php`) | Von uns aus **ausgehend**; die Bridge ruft ihrerseits keine der drei Domains auf (n8n-Sweep und Workspace-Scan: kein Treffer in dieser Richtung) |
| **Coolify-App `cw`, App `landingpages` (Datenpfade)** | Beide sprechen ihre eigenen Datenbanken an. Der einzige Berührungspunkt ist der HTML-Link aus B5 — ein Browserklick, kein Serveraufruf |

---

## 6. Empfohlene Cutover-Reihenfolge und Rollback-Auslöser

Voraussetzung bleibt Regel 2 aus `Coolify/AGENTS.md`: **kein Cutover ohne Markus' ausdrückliche
Freigabe.** Die folgende Reihenfolge ist ein Vorschlag mit Begründung, keine Freigabe.

### 6.1 Vor dem Fenster

| Schritt | Warum |
| --- | --- |
| **V1** Alle drei Domains im Coolify-Projekt eintragen — **bevor** DNS umgestellt wird | Ohne Router antwortet Traefik mit 503 (D2c). Danach `python scripts/router_check.py`: antwortet für jeden der drei Namen der **richtige** Router, nicht ein Wildcard-Router einer Nachbar-App (B-neu11) |
| **V2** Env-Werte **am laufenden Container** hashen (`docker exec … sha256sum`) und gegen Vercel vergleichen: `JWT_SECRET`, `BRIDGE_SERVICE_KEY`, der `X-Bridge-Key`-Wert für A5/A6, `ZEROBOUNCE_API_KEY`, Postmark- und Meta-Token | Der einzige Weg, die JWT-Escaping-Klasse zu finden. Das Verwaltungsformular zeigt den richtigen Wert an, auch wenn der Container einen anderen hat ([STATUS §5F](../STATUS-migrationsvorbereitung-2026-08-25.md)) |
| **V3** Die vier n8n-Aufrufe **einmal gegen die Staging-Adresse** auslösen und je Antwort auf 200 **und** fachliches Ergebnis prüfen (A1: Token entsteht · A2: ZeroBounce-Urteil · A5: Health-JSON · A6: Job wird verarbeitet) | A0b-Abnahme: jede gefundene Verbindung mindestens einmal auslösen, nicht nur die Startseite öffnen |
| **V4** TTL aller drei Records auf **60 s** senken und **mindestens 600 s** warten (die aktuelle TTL, siehe §4.1) | Sonst wirkt die Senkung im Cutover-Fenster noch nicht. Bei `proxied = false` gilt die TTL wirklich beim Client |
| **V5** Ausgangszustand der DNS-Records als JSON sichern (Muster: `Coolify/scripts/dns_cw-appcore_rollback.json`) | Rückweg ohne Erinnerungsarbeit. R0: Sicherung vor jeder umkehrbaren Änderung |
| **V6** Entscheidung protokollieren: Wie wird mit `businessleadsquiz.vercel.app` verfahren? | §2.4. Empfehlung: **während** der Nachlauffrist bewusst behalten (er ist der Rollback-Pfad, der ohne DNS auskommt) und in Phase 7 gemeinsam mit dem Vercel-Projekt entfernen. Auf keinen Fall vergessen |

### 6.2 Das Fenster — eine Domain nach der anderen

Nicht alle drei gleichzeitig. Jede Stufe ist ein eigener Beweis; die Reihenfolge geht von der
kleinsten Last zur größten.

| Stufe | Domain | Warum in dieser Reihenfolge | Weiter, wenn |
| --- | --- | --- | --- |
| **1** | **`business.eaglesfit.ch`** | Kleinste Reichweite: **0** n8n-Aufrufe, **0** Mautic-Vorlagen, kein fremdes Projekt verweist darauf. Zugleich niedrigste TTL (300 s). Fällt hier etwas aus, trifft es keinen Lead-Pfad | Zertifikat ausgestellt, `https://business.eaglesfit.ch/` → 200, `/health/live` → 200, `router_check.py` sauber, Funnel im Browser durchlaufen |
| **2** | **`quiz.activecenter.info`** | Trägt die zwei **Maschinen**-Aufrufer mit dem schnellsten Takt (A6 jede Minute, A5 alle 15 min). Ein Fehler zeigt sich binnen 60 s an der Outbox — vor der Domain, an der die Kundenlinks hängen | A6 hat **mindestens 3** aufeinanderfolgende `success`-Läufe, A5 einen; `lead_system_health` meldet `outbox_ready`/`overdue` unauffällig (Grundrauschen `outbox_parked` ≥ 1 ist normal — Altjob 117) |
| **3** | **`business.activecenter.info`** | Die teuerste Domain: **97 Mautic-Vorlagen**, alle Resume- und Kurzlinks, `/berater-info`, A1/A2/A7 und vier fremde Projekte (B3, B4, B5, dazu die tote Regel B2) | A1 und A7 je **ein vollständiger** Lauf mit erzeugtem Resume-Link; ein **echter Bestands-Resume-Link** (Kurzlink **und** JWT-Form) löst auf dasselbe Ziel auf wie vorher |

**Zwischen den Stufen wird gemessen, nicht gewartet.** Mindestens ein voller Takt des
langsamsten betroffenen Aufrufers; für Stufe 3 heißt das bis zu **2 Stunden** (A7).

### 6.3 Nach jeder Stufe — die Pflichtproben

```bash
python scripts/router_check.py                 # antwortet der RICHTIGE Router? (B-neu11)
python scripts/verify.py --domain-sweep        # hat JEDER Name aller 20 Zonen ein Zuhause? (D2c)
```

Deutungshilfe aus D2c: **503** = Traefik hat keinen Router · **525/000** = kein Zertifikat am
Origin · **404** = die App antwortet und meint es so.

Dazu, je Stufe:

- `docker logs <container> --since 30m` → Pfadverteilung, Statuscodes, Anzahl verschiedener
  Client-IPs (A0b#5: der stärkste Beweis ist der echte Verkehr, nicht die Prüfung)
- n8n-Ausführungshistorie der vier Workflows: `GET /api/v1/executions?workflowId=<id>&limit=8`
- **CORS je Ursprung erneut messen** (D8) — die Allowlist muss im Container zeichengleich
  gelten. Insbesondere die Negativkontrolle: ein fremder Origin darf **keinen**
  `Access-Control-Allow-Origin` erhalten
- Ein **Browsertest**, kein curl-Test: Videos entsperren, Resume-Link öffnen, `/berater-info`
  in einer Nicht-Standardsprache. CORS und echtes Nachladen sieht nur ein Browser

⚠️ **`/health/live` taugt erst ab dem Cutover als Signal** — auf Vercel liefert es 404 (§1).
Der Vorher/Nachher-Vergleich muss deshalb über die fachlichen Pfade laufen, nicht über den
Healthcheck.

### 6.4 Rollback-Auslöser

Jede einzelne dieser Bedingungen löst den Rückweg aus — ohne Diskussion, ohne Ursachensuche
im laufenden Fenster:

| # | Auslöser | Warum genau dieser Wert |
| --- | --- | --- |
| **R1** | Ein Resume-Link aus einer Bestandsmail (Kurzlink **oder** JWT) löst nicht mehr auf dasselbe Ziel auf | Der teuerste bekannte Fehlerfall. Betrifft **jede** Nurture-Mail aus 90 Tagen — bei gesunder App, grünem Healthcheck und leerem Fehlerlog |
| **R2** | Zwei aufeinanderfolgende Fehlläufe von **A6** (Outbox-Worker) | Bei Minutentakt sind das 2 Minuten bis zur Erkennung. Ein stehender Worker heißt: Leads bekommen keine Mail |
| **R3** | `lead_system_health` meldet `outbox_ready` oder `overdue` steigend über 3 Messungen (45 min) | Eine einzelne Messung ist kein Beweis (R0). `outbox_parked` ≥ 1 ist Grundrauschen und **kein** Auslöser |
| **R4** | Ein Fehlschlag von **A1** oder **A7** am Bridge-Node mit `auth_state != ok` | Zeigt Env-Drift beim Service-Key — die Klasse aus V2 |
| **R5** | Der Domain-Sweep findet **irgendeinen** Namen **irgendeiner** Zone auf 503, der vorher lebte | Der `www.ac-events.info`-Fall: eine fremde, längst migrierte App stirbt am Cutover einer anderen (D2c) |
| **R6** | `router_check.py` meldet für einen der drei Namen den falschen Router | B-neu11: 14 Apps und das Coolify-Panel wurden davon schon einmal überstimmt |
| **R7** | Kein gültiges Zertifikat am Origin **15 Minuten** nach der DNS-Umstellung einer Stufe | Referenz: Das Staging-Zertifikat entstand am 25.08. innerhalb von Sekunden. 15 min sind großzügig |

**Der Rückweg selbst** ist in allen Fällen derselbe und dauert eine TTL (60 s nach V4): den
CNAME aus der Sicherung V5 zurückschreiben. Voraussetzung dafür, und deshalb nicht verhandelbar:

- Das **Vercel-Projekt bleibt bestehen**, mit allen drei Domains und allen Envs
- Die **`_vercel`-TXT-Records bleiben stehen** (§4.4)
- **Nichts** wird in Phase 7 entfernt, bevor die Nachlauffrist abgelaufen **und** der Rollback
  bewusst aufgegeben ist ([STATUS §5B](../STATUS-migrationsvorbereitung-2026-08-25.md))

### 6.5 Nachlaufzeit auf Vercel

| Frist | Länge | Begründung |
| --- | ---: | --- |
| **Rollback-Bereitschaft** (Projekt + Domains + Envs unangetastet) | **7–14 Tage** | Fahrplan Audit §8 / STATUS §6. Deckt mindestens einen vollen Wochenzyklus aller vier n8n-Takte ab |
| **Beobachtung ohne Eingriff** danach | bis **30 Tage** | Erst dann ist der langsamste reale Pfad einmal komplett durchgelaufen: Nurture-Strecke mit A7 alle 2 h über die volle Kampagnenlänge |
| **Domainnamen müssen leben** | mindestens **90 Tage** | Laufzeit der Resume-Links in Bestandsmails (M4). Das ist eine Frist für die **Namen**, nicht für Vercel — nach dem Cutover erfüllt sie der Container |
| **`businessleadsquiz.vercel.app` entfernen** | mit Projektlöschung, **nicht früher** | Er ist während der Nachlauffrist der einzige Rollback-Pfad, der ohne DNS auskommt (§2.4) |
| **`zzz-business-schulung`-Projekt löschen** | 6–12 Monate | Bereits als eigener Punkt geführt (STATUS §5B) — unabhängig von diesem Cutover |

🔴 **Was die Nachlaufzeit NICHT abdeckt:** Solange das Vercel-Projekt lebt, ist
`businessleadsquiz.vercel.app` erreichbar und schreibt in dieselbe Supabase-Instanz wie der
Container. Das ist während der Rollback-Frist gewollt, danach ein stiller zweiter Schreiber.
Er gehört deshalb in dieselbe Schreibbarriere wie der pg_cron-Job — als **benannter** Eintrag,
nicht als Fußnote.

---

## 7. Belege

| Behauptung | Beleg |
| --- | --- |
| 85 n8n-Workflows, 60 aktiv, 4 Treffer, 0 feste IPs | `GET /api/v1/workflows` (Seitenlauf) + `GET /api/v1/workflows/<id>` für **jeden** Workflow einzeln; IP-Suche über die vier Trefferdefinitionen |
| Alle vier Workflows laufen | `GET /api/v1/executions?workflowId=<id>&limit=6` — je 6× `success`, jüngste 25.08.2026 10:37 UTC (A6) |
| `business.eaglesfit.ch` in **keinem** Workflow | Volltextsuche über alle 85 Definitionen: 0 Treffer |
| Postmark 0 Webhooks auf unsere Domains | Account-Token → `GET /servers`, je Server `GET /webhooks` — 9 Server, 6 Webhooks, Ziele protokolliert (§2.3) |
| Bunny Library 242544 ohne Webhook und ohne Referrer-Bindung | `GET https://api.bunny.net/videolibrary` mit Account-Key |
| Mautic: 1 Webhook (nicht zu uns), 97/1/0 Vorlagen | `SELECT` auf `webhooks` und `emails` in `mautic_db`, rein lesend über eine temporäre SQL-Datei, die derselbe Lauf danach entfernt hat |
| Meta-Domainbestätigung reist im Image mit | `index.html:8` + Live-`GET` auf alle drei Domains, identischer Tag-Wert |
| CORS blockt `global-sce.com` bereits heute | `OPTIONS`-Preflight je Origin inkl. Positiv- und Negativkontrolle (§2.2) |
| Alle drei Domains an einem Vercel-Projekt | `GET /v9/projects` + `/v9/projects/<id>/domains` über alle 25 Projekte |
| DNS-Ist-Zustand, keine Wildcards, geteilte Ziele | `GET /zones` (20) + `dns_records` je Zone; Ziel-Sweep über alle Zonen |
| Zonen-SSL beide `full` | `GET /zones/<id>/settings/ssl` |
| Traefik/ACME funktioniert für DNS-only-Namen | `openssl s_client -servername <name> -connect 167.233.251.217:443` für vier Bestandsnamen |
| `/health/live` → 404 in Produktion | `GET https://<domain>/health/live` auf allen drei |
| Fremde Aufrufer auf der Coolify-Box | `grep` in allen laufenden App-Containern, Zuordnung der UUIDs über `GET /api/v1/applications` |
| Workspace-Scan | ripgrep über `activecenter-web/` mit `--hidden --no-ignore-vcs`, ohne `node_modules`/`.next`/`dist`/`.git` |
