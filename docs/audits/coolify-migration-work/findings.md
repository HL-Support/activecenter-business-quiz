> 🔴 **HISTORISCH — Messstand 23.08.2026.**
>
> Mehrere Befunde sind überholt: `api/init-quiz-db.js` ist entfernt (PR #55),
> `package.json` hat inzwischen `engines`/`packageManager`, das Repo
> `business-schulung` existiert nicht mehr (heute `src/berater-info/`).
>
> Aktueller Stand: [../../STAND-UND-FORTSETZUNG.md](../../STAND-UND-FORTSETZUNG.md)

---

# Findings: Business Leads Funnel and Coolify Migration

## Requirements
- Audit the complete Business Leads funnel technically.
- Identify error sources, code-quality problems, and architectural weaknesses.
- Recommend improvements before or during migration.
- Design a Coolify target that removes the Vercel hosting dependency.
- Do not change production during the audit.

## Research Findings
- Repository is canonical under `D:\Antigravity_Projects\...`, on `main`, with zero commits ahead or behind `origin/main`.
- Existing untracked `business_leads_quiz.code-workspace` is unrelated and must be preserved.
- Production currently serves `dist/`; the browser shell loads runtime translation/video configuration plus the built app bundle.
- Supabase v2 is the source of truth; MySQL is downstream through an outbox worker.
- A confirmed production incident showed browser-local video progression can diverge from server tracking without visible failure.
- Delivery is a hybrid static/serverless app: `dist/` contains the browser assets while eight files in `api/` are deployed as Vercel functions.
- `api/bridge.js` is about 166 KB and combines coach lookup, resume handling, webhook adaptation, legacy tracking, analytics, Postmark and other integrations; it is a high-change/high-blast-radius module.
- `api/lead-outbox-worker.js` is about 41 KB and runs as a request-triggered worker rather than a continuously running process.
- `vercel.json` contains a platform-specific `/api/lead/init` rewrite and slug-to-`index.html` fallback; equivalent routing must be explicit on Coolify.
- The HTML shell embeds Meta Pixel bootstrapping, runtime translations/video config, legal modal, language bootstrap and dynamic module loading; these are not all part of the React bundle.
- Documentation references `LEAD_SYSTEM_V2_ARCHITECTURE.md`, but that file is absent from the repository.
- The repository contains both root `ac-track.js` and `src/ac-track.js`, with different sizes and stated roles; this is a duplication/ownership risk that requires contract-level inspection.
- Production dependencies extend beyond Vercel: Supabase, Laravel/PHP bridge, Contacts, n8n, Mautic, Postmark, Meta CAPI and Bunny/Player.js.
- The bridge exposes at least fourteen action contracts through one public endpoint, including analytics writes, legacy tracking, result updates, webhook forwarding, resume token generation/resolution and metrics reads.
- API module syntax is mixed: most handlers use CommonJS while `validate-email.js` and `init-quiz-db.js` use ESM-style default exports. Vercel hides this inconsistency; a conventional Node server needs a deliberate module adapter or normalization.
- Runtime configuration spans roughly two dozen environment keys, including multiple bridge URLs/secrets, Supabase service credentials, Postmark, Meta CAPI, JWT/resume secrets and worker controls. There is no typed startup validation.
- Hard-coded hosting coupling remains in runtime content: coach-insights links point to `business-schulung.vercel.app`; resume/default URLs and documentation embed production domains.
- `build.js` contains legacy inline-Babel/CDN migration branches even though `src/app.entry.js` is canonical. This dead compatibility path increases build complexity.
- The build deletes and recreates `dist/`, bundles without sourcemaps, and drops all `console` and `debugger` statements. Dropping console calls removes useful client diagnostics precisely where silent tracking loss is already confirmed.
- Generated `dist/` is not tracked, which is healthy for source control but requires the Coolify image build to be deterministic and verified before startup.
- Tests are mainly source-string/contracts and narrow Node tests; there is no broad browser E2E suite covering the real quiz, media progression, resume, CTA and notification chain.
- `api/init-quiz-db.js` is a production-deployed schema/bootstrap helper surface. Even with a token gate, schema initialization should not be part of the public application runtime.
- Root `ac-track.js` and `src/ac-track.js` are genuinely different implementations, not generated copies: the root file owns an older immediate bridge writer/session model, while `src/ac-track.js` owns a persisted batch queue. The naming makes ownership ambiguous.
- The v2 browser writer in `src/lib/core.js` sends `/api/lead-track` with `keepalive`, does not await the result, does not inspect HTTP status, does not retry, and converts every rejection to `undefined`. This exactly permits silent business-event loss.
- Several other business side effects in `App.jsx` use the same swallowed-error pattern, including points updates and the all-videos notification call.
- The built frontend removes console diagnostics, further reducing incident evidence from affected browsers.
- The legacy batcher has persistence/retry logic, but the canonical v2 writer bypasses it. The newer source-of-truth path is therefore less delivery-resilient than the legacy fallback.
- The codebase still contains extensive legacy mirroring and fallback branches across bridge, resume, progress and migration logic. This raises the number of possible write paths even though live flags intend a single v2 writer.
- Public lead endpoints send `Access-Control-Allow-Origin: *` and do not authenticate browser event writes. `/api/lead-track` accepts any syntactically valid `qz_...` plus client-supplied event and percentage values.
- Video completion is therefore integrity-checked only by knowing a high-entropy lead hash, not by a signed session or server-verifiable progression token. A client that knows its own hash can forge three 100% progress events and trigger downstream rank/notification effects.
- `/api/lead-init` accepts a client-provided existing lead hash and adopts it if found. This is convenient for resume but couples identity adoption to possession of the hash rather than a signed resume credential.
- The Supabase service role is correctly kept server-side and RPC execution is revoked from public roles in the SQL source. Database privilege boundaries are stronger than the public application contract in front of them.
- Worker and health endpoints use shared-secret headers and the outbox claims jobs atomically through RPCs, then processes a bounded batch sequentially. This is portable to Coolify but should become an internal scheduled worker rather than a public cron-style HTTP surface.
- `init-quiz-db.js` has a dangerous default token (`quiz_init_secret_change_me`) when its environment variable is absent. A production bootstrap route must fail closed or be removed entirely.
- The current CORS policy is broader than required for same-origin funnel calls and makes browser-origin abuse easier.

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| Separate hosting migration from data-platform migration | Moving off Vercel does not require moving Supabase, Postmark, Bunny, n8n or MySQL in the same change |
| Classify recommendations as pre-cutover, cutover, or post-cutover | Prevents a risky rewrite and infrastructure move from becoming one indivisible release |

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| Planning skill requires audit files although task is analysis-only | Files are isolated under `docs/audits/coolify-migration-work/` and contain no runtime changes or secrets |
| Runbook references missing `LEAD_SYSTEM_V2_ARCHITECTURE.md` | Treat as documentation drift and reconstruct the architecture from live code and production data |
| First action-extraction command had a PowerShell quoting error | Re-ran with single-quoted ripgrep patterns; no inspection scope was lost |
| Ripgrep received a Windows-invalid literal `*.md` path | Logged; future searches use `-g '*.md'` or explicit directories |

## Resources
- `AGENTS.md`
- `README.md`
- `LEAD_SYSTEM_RUNBOOK.md`
- `LEAD_SYSTEM_V2_ARCHITECTURE.md`
- `vercel.json`
- `package.json`
- `api/`
- `src/app/`
- `src/lib/core.js`

## Visual/Browser Findings
- Pending live-surface verification.
## Offizielle Betriebs- und Sicherheitsreferenzen

- Coolify betreibt Anwendungen grundsätzlich als Container. Für diesen Funnel ist ein eigenes Dockerfile geeigneter als ein implizites Build Pack, weil Node-Version, Build, Startprozess, Port und Healthcheck dadurch reproduzierbar festgelegt werden können.
- Coolify/Traefik routet nur auf als gesund erkannte Container. Ein echter Container-Healthcheck sowie getrennte Liveness-/Readiness-Endpunkte sind daher Teil der Zielarchitektur, nicht nur Komfort.
- Die Anwendung muss im Container auf `0.0.0.0` lauschen und einen expliziten Port veröffentlichen. Deploy-Hooks müssen idempotent sein; ein fehlgeschlagener Post-Deploy-Befehl markiert laut Coolify-Dokumentation nicht zwingend das Deployment selbst als fehlgeschlagen.
- Supabase verlangt sowohl passende Grants als auch RLS. Für besonders exponierte Tabellen empfiehlt Supabase ein eigenes API-Schema sowie explizite Grants. Pre-Request-Prüfungen können zusätzliche Schranken wie Rate Limits oder API-Key-Prüfungen erzwingen.
- Supabase stellt die automatische Exposition neuer Tabellen im `public`-Schema 2026 auf Opt-in um. Das schützt neue Tabellen, ersetzt aber keine explizite Überprüfung der bestehenden Tabellen und Policies.
- Backend-Schlüssel dürfen niemals im Browser landen. Supabase empfiehlt die neuen Secret Keys als Nachfolger des Legacy-`service_role`-JWT; das ist eine sinnvolle spätere Schlüsselmodernisierung.

### Quellen

- https://coolify.io/docs/applications/build-packs
- https://coolify.io/docs/applications/build-packs/static
- https://coolify.io/docs/applications/index
- https://coolify.io/docs/knowledge-base/health-checks
- https://next.coolify.io/docs/applications/builds/dockerfile
- https://supabase.com/docs/guides/api/securing-your-api
- https://supabase.com/docs/guides/database/secure-data
- https://supabase.com/docs/guides/getting-started/api-keys
- https://supabase.com/changelog?types=breaking-change

## Live-Auslieferung

- `business.activecenter.info` und `quiz.activecenter.info` zeigen derzeit jeweils per CNAME direkt auf unterschiedliche `vercel-dns-017.com`-Ziele, liefern aber denselben HTML-Stand aus. Für den Umzug müssen deshalb beide Hostnamen bewusst übernommen oder einer kanonisch umgeleitet werden.
- Die Live-Antworten tragen `Server: Vercel` und `X-Vercel-*`; die aktuelle Plattformkopplung ist damit auch auf DNS-/Edge-Ebene bestätigt.
- HTML und das gebaute, inhaltlich fingerprint-lose `/assets/app.js` werden beide mit `Cache-Control: public, max-age=0, must-revalidate` ausgeliefert. Dadurch fehlt langfristiges Immutable-Caching für das rund 230 KB große Bundle. Ziel: Inhalts-Hash im Dateinamen plus `immutable`; HTML kurz bzw. `no-cache`.
- Alle geprüften statischen Antworten setzen `Access-Control-Allow-Origin: *`. Das ist für die gleich-originige Anwendung unnötig breit. Im Zielsystem CORS nur auf tatsächlich fremd eingebettete Ressourcen/API-Routen begrenzen.
- HSTS (2 Jahre), `nosniff`, `DENY`, Referrer- und Permissions-Policy sind live vorhanden und müssen am Coolify-Proxy bzw. Anwendungsserver erhalten bleiben. Eine Content-Security-Policy fehlt in der geprüften Antwort.

## Lokale Qualitäts-Baseline

- `npm test`: 32/32 Tests bestanden.
- `npm run lint`: ohne Befund.
- `npm run verify`: bestanden.
- `npm run build`: reproduzierbar erfolgreich; erzeugt weiterhin nur `dist/assets/app.js` (230.204 Bytes) ohne Inhalts-Hash.
- Die vorhandenen Tests sichern vor allem Vertragslogik und Quellcode-Invarianten ab. Es fehlt ein vollständiger Browser-E2E-Test, der echten Video-Fortschritt, Netzfehler, Wiederaufnahme, finalen CTA, Outbox und Mailbenachrichtigung als zusammenhängenden Ablauf verifiziert.
- `build.js` entfernt in Produktion alle `console`-Ausgaben und `debugger`-Statements und erzeugt keine Source Map. Das hält das Bundle klein, erschwert aber die Diagnose genau der sporadischen Client-/Tracking-Fehler. Ziel: strukturierte Clientfehler-Telemetrie und private/uploaded Source Maps statt völliger Blindheit.

## API- und Sicherheitsgrenzen

- Positiv: Die SQL-Definition aktiviert RLS für die v2-Tabellen, beschränkt lesenden Zugriff von Coaches über `member_id` und widerruft die kritischen RPCs für `PUBLIC`; Ausführung wird nur `service_role` gewährt.
- Kritisch: `/api/lead-track` ist öffentlich und bindet Schreibzugriffe nur an einen syntaktisch gültigen `qz_...`-Hash. Es gibt keinen browserseitigen signierten Session-Nachweis, keine sichtbare Origin-/Rate-Limit-Prüfung und keine strenge Allowlist der Ereignisnamen bzw. Zustandsübergänge. Wer einen Lead-Hash besitzt, kann damit Events und clientseitige Prozentwerte einreichen und potenziell den Hot-Lead-Pfad auslösen.
- Kritisch: `generate_resume_token` ist ebenfalls ohne serverseitige Aufrufer-Authentisierung erreichbar. Bei Kenntnis von E-Mail plus Session-/Lead-Hash erstellt die Route ein Resume-JWT und gibt Resume-Zustand zurück. Das ist Besitzlink-Sicherheit, aber keine belastbare Identitätsprüfung.
- Mittel: Die drei Metrik-Aktionen im Bridge-Monolithen liefern Funnel-/Resume-/Completion-Kennzahlen nur anhand eines Coach-Slugs und ohne Authentisierung aus. Falls diese Daten nicht absichtlich öffentlich sein sollen, ist das eine Informationsfreigabe.
- Kritisch: `api/init-quiz-db.js` fällt bei fehlender Umgebungsvariable auf das feste Secret `quiz_init_secret_change_me` zurück. Eine produktive Schema-Initialisierungsroute darf nicht öffentlich deployt werden und muss zumindest fail-closed sein.
- Mittel: `notify_all_videos_completed` meldet im kanonischen Pfad `email_sent: true`, obwohl tatsächlich nur ein Outbox-Job eingereiht wurde. Das erzeugt einen falschen Erfolgszustand im Browser; korrekt wären `queued: true` und ein separater Zustellstatus.
- Die zentrale Bridge vereint Tracking, Resume, Metriken, Webhook-Proxy, E-Mail, Meta und Legacy-Migration in einer Datei von rund 165 KB. Das erhöht den Blast Radius und erschwert Authentisierung pro Aktion sowie portable Serveradapter.

## Produktionszustand (read-only, 2026-08-23)

- Der geschützte Health-Endpunkt meldet `ok: true`: v2-Writer 100 %, Legacy-Writer aus, Outbox-Worker an, keine überfälligen/fehlgeschlagenen/toten Jobs und keine Metrikfehler.
- Es gibt einen korrekt zurückgestellten Outbox-Job und 40 offene `migration_unresolved`-Datensätze. Letztere sind aktuell keine Health-Warnung, müssen aber vor einem größeren Architekturumbau separat klassifiziert werden.
- Die tatsächlich installierten RLS-Policies entsprechen für die acht geprüften v2-Tabellen der SQL-Definition; es wurden nur die erwarteten `authenticated`-Select-Policies gefunden.

## Funnel-Zustandsmaschine und bekannter WhatsApp-Widerspruch

- Der normale Player entsperrt den nächsten Schritt erst ab 95 % eindeutig beobachteter Videosekunden und versucht größere Vorwärtssprünge zurückzusetzen.
- Die UI-Fortschaltung ist dennoch lokal: Nach der lokalen Entsperrung wechselt React zum nächsten Video bzw. zum finalen Screen, ohne vorher eine erfolgreiche Antwort von `/api/lead-track` abzuwarten.
- `sendLeadTrackEvent` startet lediglich `fetch(..., keepalive: true)` und verwirft jeden Fehler. Es prüft weder HTTP-Status noch JSON-Antwort und besitzt keine persistente Retry-Queue. Somit können alle Videos lokal korrekt gesehen worden sein, während Supabase nur einen frühen Zwischenstand kennt.
- Der finale WhatsApp-Link wird als normales `<a target="_blank">` sofort geöffnet; im `onClick` wird Tracking nur nebenläufig angestoßen. Navigation und WhatsApp funktionieren daher auch dann, wenn `cta_clicked` nicht gespeichert wird.
- Der Resume-Resolver berechnet `resumeTarget: final` serverseitig nur dann, wenn alle drei v2-Fortschritte mindestens 95 % melden. Im Frontend selbst führt ein aufgelöstes `resumeTarget: final` dann direkt zum finalen Screen. Diese Trennung benötigt einen Regressionstest, damit niemals ein ungeprüftes/alt gemapptes Ziel übernommen wird.
- Für den René-Hammer-Fall ist deshalb die stärkste technische Erklärung: Videos/Finalscreen liefen in einem bereits offenen Browserzustand weiter, während v2-Tracking verlorenging; der um 13:39 geöffnete Resume-Link landete laut vorhandener Analyse dagegen auf Video 1. Der Link allein erklärt den finalen WhatsApp-Text nicht.

## Plattformkopplung und Fremdabhängigkeiten

- Der Code benötigt rund 20 produktive Umgebungsvariablen, aber es gibt keine zentrale, typisierte Startvalidierung. Mehrere Module verwenden unterschiedliche Fallbacks. In einem langlebigen Container muss die Anwendung bei fehlenden Pflicht-Secrets vor Readiness fail-closed stoppen.
- Vercel-spezifisch sind derzeit Deployment-Skripte, `vercel.json`, Serverless-Handlerform, `maxDuration`, Preview-/Promote-Dokumentation, Host-Erkennung und Logannahmen.
- Zwei echte Laufzeitverweise zeigen weiterhin hart auf `https://business-schulung.vercel.app/` (Bridge und Outbox-Worker). Diese URL muss konfigurierbar und vor Abschaltung des letzten Vercel-Projekts ersetzt werden.
- Ein Coolify-Umzug entfernt nur Vercel als Host. Der Funnel bleibt funktional abhängig von Supabase, Bunny/Player.js, Postmark, Meta, ZeroBounce, WhatsApp, Contacts, Mautic, PHP-Bridges, n8n sowie extern gehosteten Branding-/Datenschutzressourcen.
- Besonders fragil im Browser sind das unversioniert wirkende externe Player.js-Skript, das Bunny-Embed, das ImageKit-Favicon, das externe Logo und der Datenschutz-Iframe. Player.js sollte selbst gehostet bzw. kryptografisch/versioniert fixiert werden; Markenassets gehören auf die eigene kanonische Asset-Domain. Bunny-Video und WhatsApp bleiben bewusste Geschäftsabhängigkeiten.

## Coolify-Betriebsmodell

- Coolify-Rolling-Updates funktionieren für eine normale Dockerfile-Anwendung, nicht für Docker-Compose-Anwendungen. Sie benötigen einen echten Healthcheck, Standard-Containernamen und dürfen keinen Host-Port fest binden.
- Das spricht für eine einzelne Coolify-`Application` mit eigenem Dockerfile für Web/API. Ein separater Worker kann später als zweite Application aus demselben Image laufen; Docker Compose würde hier den Rolling-Update-Vorteil unnötig aufgeben.
- Die Anwendung muss SIGTERM/graceful shutdown beherrschen und während einer Übergangsphase mit der alten Version gleichzeitig auf dieselbe Datenbank zugreifen können.
- Coolify Scheduled Tasks können Kommandos im laufenden Container ausführen. Für den bestehenden Minutentakt ist das ein möglicher n8n-Ersatz; robuster ist langfristig ein eigener, intern laufender Worker mit Supabase-RPC-Claiming. Niemals zwei unkoordinierte Scheduler beim Cutover aktivieren.
- Coolify-Backups sichern das Control Plane, aber keine Anwendungsdaten. Der Quiz-Container ist stateless und braucht kein Volume; Supabase-Backups und Coolify-`APP_KEY`/SSH-Key-Sicherung bleiben separate Betriebsaufgaben.

## Build- und Runtime-Portabilität

- `pnpm-lock.yaml` ist vorhanden, aber `package.json` definiert weder `packageManager` noch `engines`. Der Container muss Node- und pnpm-Version exakt festlegen und mit `pnpm install --frozen-lockfile` bauen.
- Die API mischt CommonJS-Handler mit zwei ESM-Default-Exports (`validate-email.js`, `init-quiz-db.js`). Vercel löst diese implizit auf; ein normaler Node-Server benötigt einen expliziten Adapter oder eine vorherige Vereinheitlichung.
- Live liefert `/api/lead-config` die vier Flags korrekt. API-Antworten und selbst 405/OPTIONS tragen allerdings ebenfalls das globale `Access-Control-Allow-Origin: *` und Cacheprofil. Dynamische/fehlerhafte API-Antworten sollten grundsätzlich `Cache-Control: no-store` bekommen.
- `npm audit` ist für dieses pnpm-Projekt nicht aussagefähig und scheiterte erwartungsgemäß ohne npm-Lockfile; der richtige Audit-Befehl ist `pnpm audit --prod`.
- `pnpm audit --prod` meldet aktuell 0 bekannte Schwachstellen in 21 produktiven Abhängigkeiten. Die lokal verwendeten Versionen waren Node 24.13.1 und pnpm 10.32.1; für Produktion sollte dennoch eine LTS-Node-Version im Image festgelegt werden statt die lokale Current-Version implizit zu übernehmen.
- Der vorhandene read-only Produktions-Smoke ist grün und bestätigt Startseite, Bridge-OPTIONS, Ablehnung unbekannter Actions sowie den sicheren Nichtversand bei unvollständigem Videozustand.
- Die dokumentierte Abhängigkeitskarte ist grundsätzlich hilfreich, nennt aber weiterhin „Vercel-APIs“ statt portable Projekt-APIs und ist vom 13.07.2026. Sie muss Teil des Migrationsabschlusses aktualisiert werden.

### Weitere Coolify-Quellen

- https://coolify.io/docs/knowledge-base/rolling-updates
- https://next.coolify.io/docs/core/automation/scheduled-tasks/overview
- https://coolify.io/docs/knowledge-base/cron-syntax
- https://coolify.io/docs/knowledge-base/how-to/backup-restore-coolify

## Scope-Erweiterung: `business-schulung`

- Das separate Repository liegt kanonisch unter `D:\Antigravity_Projects/activecenter-web/business-schulung`, ist auf `main` sauber und synchron zu `origin/main`.
- Es ist eine kleine Next.js-14-Pages-Anwendung ohne eigene API und ohne Datenbank: eine 511-zeilige Clientseite, ein Translation-Provider, lokale JSON-Inhalte in fünf Sprachen und lokale Fonts.
- Die Fachseite ist damit kein eigenständiger Backend-Service, sondern ein statisches Berater-Nachschlagewerk. Eine Integration als Route/Featuremodul in das Business-Leads-Produkt ist technisch sinnvoller als ein dauerhaft separates Deployment.
- Bestehender Deep-Link-Vertrag: `type` wählt das Profil; `goal`, `asp` oder `aspiration` wählen das Ziel; `lang` oder `l` wählen die Sprache. Profil-Aliase und Ziel-Aliase sind öffentliches Verhalten und müssen beim Import erhalten bleiben.
- Der integrierte Zielpfad sollte kanonisch unter derselben Domain liegen, zum Beispiel `/berater-info?type=...&goal=...&lang=...`. Die alte Vercel-Domain braucht während der Übergangszeit Redirects auf diesen Pfad.
- Inhalte und Styling sind derzeit stark in einem einzigen Componentfile gebündelt; Übersetzungsschlüssel und Profilcodes überlappen fachlich mit dem Quiz, verwenden aber andere interne IDs (`feuer/wind/wasser/fels` statt der Quizcodes). Vor dem Zusammenführen ist eine explizite Mapping-Schicht erforderlich; keine stillen ID-Umbenennungen in URLs oder gespeicherten Daten.
- Im Business-Leads-Code erzeugen genau Bridge und Outbox-Worker die Schulungslinks. Beide nutzen dieselbe hart codierte Vercel-Basis-URL. Diese Linkerzeugung wird zu einer gemeinsamen, relativen URL-Funktion des integrierten Produkts zusammengeführt.
- Bridge und Worker duplizieren nicht nur die Basis-URL, sondern auch Profil-/Aspirations-Normalisierung und URL-Building. Die Integration erhält ein einziges Shared-Modul plus Vertragstests für alle Sprachaliase.
- Der aktuelle Next-Build ist grün und vollständig statisch; die Seite benötigt ca. 87 KB First-Load-JavaScript. Die fünf Sprachpakete umfassen zusammen rund 156 KB JSON. Es gibt damit keinen technischen Grund, Next.js als zweite Runtime mitzunehmen.
- Integrationsweg: UI und Inhalte als Featuremodul neu in der Quiz-Keimzelle einbauen, nicht `.next`, alte Pages-Struktur oder ein zweites `package.json` kopieren. Fonts werden mit den bereits vorhandenen Quiz-Fonts dedupliziert.
- Altdomain-Falle: Bereits versendete E-Mails enthalten unveränderbare `business-schulung.vercel.app`-Links. Neue Links müssen sofort auf die eigene Domain wechseln; das alte Vercel-Projekt bleibt für eine definierte Nachlauffrist als reiner Redirect bestehen. Nach Abschaltung kann die fremde `vercel.app`-Adresse nicht dauerhaft von uns umgeleitet werden.

## Scope-Erweiterung: Supabase-Ablösung

- Supabase wird derzeit nicht über ein Client-SDK, sondern serverseitig direkt über PostgREST (`/rest/v1`) und privilegierten Service-Key angesprochen. Das erleichtert die Ablösung, weil der Browser bereits über die eigenen `/api/*`-Routen läuft.
- Zu ersetzen sind trotzdem mehrere Plattformleistungen: PostgREST-Filter-/Upsert-Semantik, REST-RPC-Aufrufe, `service_role`, Supabase-JWT-Helfer in RLS (`auth.jwt()`), Management-API für Diagnoseabfragen sowie Konfigurations-/Health-Zugriffe.
- Die v2-Kerndatenbank besteht mindestens aus acht Tabellen, zwei Views, Triggern/Indizes und sieben geschützten RPC-Funktionen. Zusätzlich greift die große Bridge noch auf Legacyobjekte wie `quiz_sessions`, `tracking_sessions`, `tracking_events`, `lead_profiles` und drei Metrikviews zu. Der Migrationsscope darf deshalb nicht nur `supabase-lead-system-v2.sql` exportieren.
- Zielprinzip: Kein neuer PostgREST-Ersatz als öffentliche Universal-API. Der Node-Server greift über einen begrenzten PostgreSQL-Connection-Pool direkt auf parameterisierte Queries bzw. klar benannte Repository-Methoden zu. Browserzugriff bleibt ausschließlich über fachliche HTTP-Endpunkte.
- RLS kann auf dem eigenen PostgreSQL als Defense-in-Depth bestehen bleiben, darf aber nicht mehr von Supabase-spezifischem `auth.jwt()` abhängen. Coach/Admin-Lesezugriffe brauchen entweder transaktionslokalen App-Kontext plus Policies oder – einfacher und auditierbarer – ausschließlich serverseitig autorisierte Queries mit getrennten DB-Rollen.
- Der Zielserver braucht PgBouncer oder einen bewusst klein konfigurierten App-Pool, TLS/privates Netzwerk, getrennte Rollen für Migration, Runtime und Read-only/Monitoring sowie unabhängige Backups mit Restore-Test. Coolify-App und Datenbank dürfen nicht über einen öffentlich offenen Port 5432 gekoppelt werden.
- Der reale Flottenstandard ist bereits festgelegt: PostgreSQL 18.6 auf dem DB-Server `10.0.1.3`, Zugriff aus Coolify über das private Hetzner-Netz von `10.0.1.5`, direkter TypeScript-Treiber über Kysely und ausdrücklich kein PostgREST. Die Business-Leads-Planung übernimmt diesen Standard.
- Die Anwendung erhält eine eigene Datenbank und einen host-/rollenbeschränkten Runtime-Benutzer. Keine Mitbenutzung des Marathon-Schemas und kein Superuser/Shared-Flottenuser.
- Reihenfolge korrigiert: Der Hostingcutover erfolgt noch mit unverändertem Supabase-REST/RPC-Zugriff. Erst im langlebigen Coolify-Container wird auf Kysely umgestellt. So entsteht kein unkontrollierbares Connection-Fan-out durch Vercel-Serverless-Instanzen; die Referenzmigration hat genau diese Connection-Budget-Falle praktisch gezeigt.
- Connection Pooling ist Pflicht. Für diese kleine App ist ein begrenzter Kysely/`pg`-Pool ausreichend, sofern die gesamte Flottenkapazität auf dem 2-vCPU/3-GB-DB-Server eingehalten wird; PgBouncer wird erst dann vorgeschaltet, wenn die gemeinsame Kapazitätsrechnung oder mehrere Replikate dies erfordern. Keinesfalls pro Request eine neue Verbindung öffnen.
- Die vorhandene Outbox-Claim-Logik mit atomischem `FOR UPDATE SKIP LOCKED` ist portabel und soll fachlich erhalten bleiben. Bulk-Erstimport per `COPY`, inkrementelle Deltas per idempotentem Upsert/Event-UID.
- Rollenmodell: `business_leads_migrator` für DDL, `business_leads_app` mit minimalen DML-/Funktionsrechten, optional `business_leads_readonly` für Health/Reporting. `PUBLIC`-Defaults werden entzogen; die Runtime erhält weder DROP/ALTER noch unnötiges DELETE.
- Nach dem Import müssen Fremdschlüsselindizes, Partial-/Unique-Indizes, Sequenzen, Constraints und Funktionsrechte maschinell gegen die Quelle geprüft werden; reine Zeilenzählung reicht nicht.
- Der Flottencluster besitzt bereits zwei unabhängige Sicherungsschichten: tägliche logische Dumps mit Off-box-Kopie sowie pgBackRest/PITR in verschlüsseltem Hetzner Object Storage. RPO laut belegtem Stand ≤ 5 Minuten, PITR-Fenster etwa 30 Tage und Restore wurde zweimal geprobt. Die neue Business-Leads-Datenbank wird automatisch vom Clusterbackup erfasst; nach dem realen Import ist dennoch ein eigener schema-/datenbezogener Restore-Drill vorgeschrieben.
- Entscheidende Scope-Grenze: Das Supabase-Projekt `Stats_Logs` wird von neun Verbrauchern geteilt. Die Lead-Tabellen, Analytics-Aggregate, HBA-/Kleinverbraucher und n8n-Zugriffe bilden einen Migrationsverbund. Das Quiz darf seine Schreibquelle umstellen, Supabase kann aber erst abgeschaltet werden, wenn alle Verbraucher inventarisiert, umgestellt und nachgemessen sind.
- Der bestehende Flottenplan ordnet die Lead-Familie ausdrücklich als gemeinsame Phase ein. Für dieses Projekt bedeutet das: keine isolierte Kopie von `lead_state` bei weiterlaufenden alten Schreibern; entweder vollständiger Lead-Verbund-Cutover oder kontrollierte Change-Data-Capture-/Dual-Write-Phase mit genau einer kanonischen Schreibquelle.
- Der PostgreSQL-Server ist ein gemeinsamer Failure Domain mit nur 2 vCPU/3 GB RAM. Die heutigen Datenmengen sind klein, aber vor Aufnahme des Lead-Verbunds müssen Kapazitätsbudget, Connection-Limits, `work_mem`, Autovacuum, `pg_stat_statements` und Alarmierung neu gemessen werden.
- Live-Bestand am 23.08.: `lead_events` ca. 171 MB/~102.000 Zeilen, `tracking_events` ca. 34 MB/~22.000, `lead_state` ca. 11 MB/~5.800, `lead_sync_outbox` ca. 1,2 MB/~2.200; dazu Antworten, Video, Profile, Quiz-/Tracking-Sessions, Nurture-, Webhook-, Analytics- und Metrikobjekte. Die Größen sind für PostgreSQL klein, der Objektgraph und die Zahl der Verbraucher sind das eigentliche Risiko.
- `analytics_internal` enthält aktuell `event_daily` und `refresh_runs`; diese Aggregate/Refresh-Läufe müssen gemeinsam mit den Leadereignissen migriert oder während der Übergangszeit bewusst zentral gehalten werden. Eine unbemerkte Mischung aus alter Ereignisquelle und neuem Aggregat ist nicht zulässig.
- Für nahezu unterbrechungsfreie Datenmigration ist logische Replikation geeignet, aber PostgreSQL repliziert weder DDL noch Sequenzstände, Views oder Funktionen. Deshalb: Schema/Funktionen/Views zuerst versioniert einspielen, ab Subscription einen DDL-Freeze setzen, alle Sequenzen beim Cutover per `setval` korrigieren und Katalogparität separat prüfen.
- Der Subscriber bleibt bis zum Cutover read-only für Anwendungszugriffe. Schreibtests laufen ausschließlich gegen eine Wegwerfdatenbank; parallele Anwendungsschreibvorgänge auf replizierte Tabellen erzeugen Konflikt-/Split-Brain-Risiken.
- Replikationsgates: alle Tabellen besitzen eine geeignete Replica Identity, Initial Copy abgeschlossen, `pg_stat_subscription` ohne Fehler/Lag, zweimalige Parität über Zeit, DDL-Freeze eingehalten, Replikationsslots/-worker im Kapazitätsbudget.

### PostgreSQL-Referenzen

- https://www.postgresql.org/docs/18/logical-replication.html
- https://www.postgresql.org/docs/18/logical-replication-restrictions.html
- https://www.postgresql.org/docs/18/sql-createsubscription.html
- https://www.postgresql.org/docs/18/logical-replication-monitoring.html
