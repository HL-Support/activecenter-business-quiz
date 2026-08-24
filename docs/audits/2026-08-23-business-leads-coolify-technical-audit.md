# Technischer Funnel-Audit und Konsolidierungs-/Migrationskonzept

Stand: 23.08.2026  
Scope: Business Leads Quiz, Integration `business-schulung`, Browser-Funnel, Projekt-APIs, Ablösung von Vercel und Supabase, Hetzner PostgreSQL 18.6, Resume, Video, CTA, Outbox und Mail  
Art: Read-only Produktionsanalyse; keine Funnel- oder Produktionslogik verändert

## 1. Entscheidung in einem Satz

Der Zielzustand ist ein konsolidiertes Business-Leads-Produkt auf Coolify: Quiz und Berater-Schulung in einem Repository/einer Web-Application, fachliche APIs und Worker im selben Image sowie eine eigene Datenbank auf dem Flotten-PostgreSQL 18.6 auf Hetzner – ohne Vercel, Supabase, PostgREST oder zweite Schulungs-Runtime.

Kein vollständiger Rewrite vor dem Umzug. Empfohlen ist eine kontrollierte Folge kompatibler Releases.

## 2. Gesamtbewertung

| Bereich | Bewertung | Kernaussage |
| --- | --- | --- |
| Fachlicher Funnel | grundsätzlich funktionsfähig | Quiz, Opt-in, Ergebnis, Videos, Finalscreen und Resume sind vorhanden |
| Datenzuverlässigkeit | kritisch | UI läuft weiter, obwohl zentrale Events nicht bestätigt wurden |
| Datenbank/Outbox | gut mit Restpunkten | v2, RLS, monotone RPCs und atomisches Claiming sind eine starke Basis |
| Supabase-Ablösung | großer, aber beherrschbarer Verbundumbau | direkter Kysely-Zugriff muss vor dem Datenumzug entstehen; neun Verbraucher teilen die Quelle |
| `business-schulung` | einfach integrierbar | vollständig statische Next-Seite ohne API/DB; Deep Links und fünf Sprachen müssen erhalten bleiben |
| API-Sicherheit | verbesserungsbedürftig | Lead-Hash ist teilweise die einzige Schreibberechtigung |
| Codeaufbau | mittleres bis hohes Änderungsrisiko | Bridge-Monolith, doppelte Tracker und Legacy-Pfade erhöhen den Blast Radius |
| Testbarkeit | solide Basis, entscheidende Lücke | 32 Tests grün, aber kein vollständiger Browser-/Fehlerfall-E2E |
| Beobachtbarkeit | unzureichend im Browser | Produktionsbuild entfernt Logs und liefert keine verwertbare Fehlertelemetrie |
| Vercel-Portabilität | gut lösbar | dünner HTTP-Adapter, Dockerfile, Health und Env-Schema fehlen |
| Coolify-Eignung | gut | stateless Anwendung; kein Persistenzvolume notwendig |

## 3. Heutige Systemkette

```text
Meta / Direktlink
  -> business.activecenter.info/{coach-slug}
  -> Coach-Auflösung und Lead-Initialisierung
  -> Quizfragen und lokale Attribution
  -> Opt-in / Typeform-kompatibler Adapter
  -> Supabase lead_state / answers / events
  -> Ergebnis
  -> Video 1 -> Video 2 -> Video 3 (lokal ab 95 % entsperrt)
  -> finaler WhatsApp-CTA

Parallel und nachgelagert:
  -> PHP-/Laravel-Bridge und Contacts
  -> n8n / Mautic / Postmark
  -> Supabase lead_sync_outbox
  -> /api/lead-outbox-worker
  -> Coach-Hot-Lead-Mail
  -> Resume-Link über /api/bridge
```

Supabase v2 ist die kanonische Wahrheit. MySQL-/Legacy-Tabellen sind Spiegel- oder Fallbackpfade und dürfen beim Umbau nicht wieder zu einer zweiten Wahrheit werden.

## 4. Wichtigste technische Befunde

### 4.1 Kritisch: Client-Fortschritt und Serverfortschritt können auseinanderlaufen

Der Player prüft lokal sinnvoll auf 95 % eindeutig gesehene Videosekunden. Danach schaltet React jedoch lokal weiter. Der zentrale Writer in `src/lib/core.js` startet nur einen nicht abgewarteten `fetch` und verwirft Fehler. HTTP-Fehler und negative JSON-Antworten werden nicht geprüft; eine persistente Retry-Queue fehlt.

Folge:

- Der Nutzer kann Video 2, Video 3 und den Finalscreen erreichen.
- Supabase kann gleichzeitig nur Video 1 oder gar keinen Abschluss kennen.
- Der Outbox-Rang 3 entsteht nicht.
- Die Coach-Mail fehlt.
- Das Browsererlebnis sieht trotzdem erfolgreich aus.

Das entspricht genau der Fehlerklasse des René-Hammer-Vorfalls. Der um 13:39 geöffnete Resume-Link landete nach den vorhandenen Daten auf Video 1. Der finale WhatsApp-Text muss daher eher aus einem bereits offenen/lokal weitergelaufenen Browserzustand stammen, dessen v2-Schreibvorgänge nicht vollständig ankamen.

### 4.2 Kritisch: WhatsApp-Navigation ist stärker als das CTA-Tracking

Der finale CTA ist ein normaler Link mit neuem Tab. Der Klick startet Tracking nur im `onClick`, blockiert die Navigation aber nicht und speichert das Event nicht zuerst dauerhaft lokal. WhatsApp kann daher zuverlässig geöffnet werden, obwohl `cta_clicked` verloren geht.

### 4.3 Kritisch: Öffentliche API vertraut dem Lead-Hash zu stark

`/api/lead-track` akzeptiert einen syntaktisch gültigen `qz_...`-Hash, Ereignisnamen und clientseitige Prozentwerte. Es gibt keine belastbare browserseitige Session-Signatur, keine strenge Zustandsmaschine an der HTTP-Grenze und keine sichtbare Rate-Limit-/Origin-Bindung.

Der Hash besitzt hohe Entropie und ist nicht leicht zu erraten. Sobald er aber in Logs, Links oder Browserzustand bekannt wird, dient sein Besitz praktisch als Schreibberechtigung.

### 4.4 Kritisch: Öffentliche DB-Initialisierungsroute mit Default-Secret

`api/init-quiz-db.js` verwendet bei fehlender Env-Variable das feste Secret `quiz_init_secret_change_me`. Eine Schema-Initialisierung gehört nicht in die öffentlich deployte Runtime. Die Route sollte entfernt und Migrationen ausschließlich über einen kontrollierten CLI-/CI-Pfad ausgeführt werden.

### 4.5 Hoch: Resume-Erzeugung und Metriken sind nicht getrennt authentisiert

`generate_resume_token` kann mit bekannter E-Mail und Session-/Lead-Kontext einen Besitzlink erzeugen. Die drei Metrik-Aktionen liefern Coach-Kennzahlen nur anhand eines Slugs. Diese Funktionen brauchen getrennte Aufruferklassen:

- Browser: nur Resolve eines bereits ausgestellten Resume-Links
- n8n/Mailer: authentisierte Erzeugung
- Coach/Admin: authentisierte Metriken

### 4.6 Hoch: Bridge-Monolith und doppelte Trackingarchitektur

`api/bridge.js` hat rund 165 KB und mindestens 14 öffentliche Action-Verträge. Darin liegen Coach-Lookup, Analytics, Resume, Webhook-Proxy, Mail, Meta und Legacy-Migration zusammen. Zusätzlich existieren zwei unterschiedliche `ac-track.js`-Modelle und der neue v2-Direktwriter.

Das ist nicht nur ein Stilproblem. Es führt zu:

- unterschiedlichen Retry-Eigenschaften;
- unterschiedlichen Identitätsquellen (`ac_` versus `qz_`);
- schwerer Authentisierung pro Funktion;
- hoher Regressionsempfindlichkeit;
- unnötig schwieriger Containeradaption.

### 4.7 Hoch: Erfolgsmeldung vor tatsächlicher Mailzustellung

Der kanonische `notify_all_videos_completed`-Pfad antwortet mit `email_sent: true`, obwohl nur ein Outbox-Job erzeugt wurde. Das Browser-Flag wird damit zu früh auf „sent“ gesetzt.

Korrekte Semantik:

```json
{
  "success": true,
  "queued": true,
  "email_sent": false,
  "job_id": "..."
}
```

Die tatsächliche Zustellung gehört ausschließlich in Worker-/Providerstatus.

### 4.8 Mittel: Vercel-Laufzeit wird implizit vorausgesetzt

- Serverless-Handler erwarten Vercel-/Express-artige Request-/Response-Objekte.
- CommonJS und ESM-Default-Exports sind gemischt.
- `maxDuration`, Rewrites, Preview/Promote und Host-Erkennung sind Vercel-spezifisch.
- Zwei Laufzeitpfade verweisen hart auf `business-schulung.vercel.app`.
- Node- und pnpm-Version sind nicht in `package.json` fixiert.

### 4.9 Mittel: Cache und Browser-Supply-Chain

Das 230-KB-Bundle heißt immer `/assets/app.js` und wird nicht immutable gecacht. Zudem werden Player.js, Favicon, Logo und Datenschutzseite fremd eingebunden. Besonders Player.js ist Teil der kritischen Video-Zustandsmaschine.

### 4.10 Mittel: Beobachtbarkeit

Der Produktionsbuild entfernt `console` und erzeugt keine Source Maps. Es fehlen belastbare Kennzahlen für:

- gesendete versus bestätigte Browser-Events;
- Alter und Umfang der lokalen Retry-Queue;
- Clientfehler nach Browser/Version;
- Video-Unlock ohne korrespondierenden Serverrang;
- Zeit von Rang 3 bis Outbox/Providerannahme;
- Resume-Zielabweichungen.

## 5. Was bereits gut ist

- Supabase v2 hat eine klare kanonische `lead_hash`-Identität.
- Video-Fortschritt wird per RPC monoton fortgeschrieben.
- Event-UIDs und Unique Constraint ermöglichen Idempotenz.
- Der Outbox-Worker claimt Jobs atomisch und verarbeitet begrenzte Batches.
- RLS ist aktiv; kritische RPCs sind für `PUBLIC` entzogen und auf `service_role` beschränkt.
- Der geschützte Produktions-Healthcheck war am Audit-Tag grün.
- 32 Tests, Lint, Verify, Build und read-only Produktions-Smoke waren grün.
- Die Anwendung ist stateless und benötigt in Coolify kein Volume.

Diese Grundlagen sollten erhalten und nicht durch eine Neuentwicklung ersetzt werden.

## 6. Empfohlene Zielarchitektur

```text
Coolify / Traefik
  -> eine Dockerfile-Application: business-leads-web
       -> Node LTS, Port 3000, bind 0.0.0.0
       -> statische fingerprintete dist-Assets
       -> Funnel unter /{coach-slug}
       -> integrierte Berater-Info unter /berater-info
       -> portable HTTP-Routen unter /api/*
       -> /health/live
       -> /health/ready
       -> strukturierte JSON-Logs und Request-ID

  -> zweite Application aus demselben Image: business-leads-worker
       -> claimt PostgreSQL-Outbox intern
       -> keine öffentliche Domain notwendig

Privates Hetzner-Netz:
  -> PostgreSQL 18.6 auf 10.0.1.3
       -> eigene Datenbank business_leads
       -> Kysely + pg, begrenzter Connection-Pool
       -> Rollen: Migrator, Runtime, Read-only/Monitoring
       -> pgBackRest/PITR + tägliche logische Dumps

Weitere externe Systeme:
  -> PHP/Contacts/n8n/Mautic/Postmark
  -> Meta, ZeroBounce, Bunny, WhatsApp
```

### Warum kein Docker Compose als Standard

Coolify unterstützt Rolling Updates für normale Dockerfile-Applications, nicht für Docker-Compose-Deployments. Web und Worker sollten deshalb bei Bedarf als zwei Applications aus demselben Image betrieben werden. Das erhält unabhängige Skalierung und bessere Deploy-Verfügbarkeit.

### HTTP-Server

Für die erste portable Version ist ein dünner, getesteter Node-HTTP-Adapter sinnvoll, der die bestehenden API-Verträge unverändert bedient. Er muss bereitstellen:

- Body-Limit und JSON-Parsing;
- korrekte `req.query`, Header und Client-IP hinter Traefik;
- Responseadapter für `status/json/send/end/setHeader`;
- statische Assets und Slug-Fallback;
- API-404 statt SPA-Fallback für unbekannte `/api/*`-Pfade;
- Request-Timeouts und Abort-Signale;
- SIGTERM und graceful shutdown.

Keine große Fachlogik in diesen Adapter verschieben.

### Integrierte Berater-Schulung

- Das separate Next-Projekt wird nicht als Sub-App oder zweites Buildsystem übernommen.
- UI und Inhalte wandern als Featuremodul in die bestehende React-Keimzelle.
- Der öffentliche Vertrag bleibt kompatibel: `type`, `goal`/`asp`/`aspiration` und `lang`/`l`.
- Kanonischer Link: `https://business.activecenter.info/berater-info?...`.
- Profil-/Aspirations-Mapping und URL-Erzeugung liegen in genau einem Shared-Modul und werden von Bridge, Worker und UI verwendet.
- Die fünf Sprachpakete werden in die kanonische i18n-Struktur des Gesamtprodukts überführt; doppelte Fonts und Next-Runtime entfallen.
- Neue E-Mails verwenden sofort die eigene Domain. Das alte Vercel-Projekt dient nur während einer definierten Nachlauffrist als Redirect für bereits versendete Links.

### Eigene PostgreSQL-Datenbank

- Anlage über den Flottenstandard `/root/pg-neues-projekt.sh business_leads`.
- Direkter Treiber über Kysely + `pg`; kein PostgREST und kein Supabase-kompatibles Gerüst.
- Zunächst source-kompatible Tabellen-/Schemanamen für logische Replikation. Legacyobjekte bleiben an einer klaren Repository-Naht und werden später entfernt oder in ein Legacy-Schema verschoben.
- Keine Browserverbindung zur Datenbank. Sämtlicher Zugriff läuft über fachliche HTTP-Endpunkte oder den internen Worker.
- Supabase-RLS/`auth.jwt()` wird nicht blind kopiert. Im privaten Backendmodell gelten getrennte Rollen und minimale Grants; besonders privilegierte Operationen laufen über eng begrenzte Funktionen mit festem `search_path`.
- Outbox-Claiming bleibt atomisch mit `FOR UPDATE SKIP LOCKED`.
- Der Cluster ist bereits durch tägliche Dumps sowie pgBackRest/PITR abgesichert. Nach Import des echten Leadbestands folgt eine erneute anwendungsspezifische Restore-Probe.

Vorläufige Besitzmatrix, die vor der Publication durch einen Verbraucher-Scan bestätigt werden muss:

| Ziel | Objekte |
| --- | --- |
| Sicher in `business_leads` | `lead_state`, `lead_video_progress`, `lead_answers_current`, `lead_events`, `lead_profiles`, `lead_contact_crm`, `lead_migration_unresolved`, `lead_sync_outbox`, `lead_access_permissions`, `app_config`, `quiz_sessions`, `tracking_sessions`, `tracking_events`, `tracking_video_progress`, zugehörige Views/Funktionen/Sequenzen |
| Lead-Verbund, Eigentümer noch bestätigen | `nurture_*`, `webhook_*`, `form_webhook_deliveries`, `system_alerts`, `analytics_internal.*` |
| Nicht blind in diese Produktdatenbank übernehmen | `hba_*`, `sso_token_consumptions`, `landing_page*`, `coach_access`, der geteilte `cron_runs`-Altbestand |

`n8n` soll nach Möglichkeit weiterhin fachliche APIs aufrufen und keinen direkten Datenbankzugang erhalten. Falls ein direkter Zugriff nachweislich unvermeidbar ist, benötigt `10.0.1.4` separat UFW-, `pg_hba.conf`- und Read-/Write-Rollenfreigaben.

### Healthchecks

- `/health/live`: Prozess läuft; keine externen Aufrufe.
- `/health/ready`: Pflichtkonfiguration gültig, Pool verfügbar und eine kurze, begrenzte PostgreSQL-Bereitschaftsprüfung erfolgreich.
- Der bestehende detaillierte `/api/lead-system-health` bleibt ein geschützter Diagnoseendpunkt und darf nicht als eng getakteter Container-Healthcheck verwendet werden.

## 7. Änderungen vor dem Umzug

### P0 – vor jedem Coolify-Cutover

1. **Zuverlässige Client-Eventqueue**
   - stabile `event_uid` vor dem Versand erzeugen;
   - Event synchron in IndexedDB oder dem bereits vorhandenen persistenten Batcher ablegen;
   - Serverantwort prüfen;
   - exponentiell mit Jitter wiederholen;
   - erst nach bestätigtem 2xx und passendem Ack entfernen;
   - Queue bei Start, `online`, `visibilitychange` und kontrolliertem Intervall leeren.

2. **Kritische Zustandsübergänge serverseitig bestätigen**
   - Videoabschluss nicht nur lokal setzen;
   - `record_lead_event` als transaktionale RPC erwägen: Event + monotone Progression + Rank/Outbox in einer DB-Transaktion;
   - Finalscreen nur nach bestätigter Video-3-Progression oder explizitem, servergeprüftem Resume-Ziel öffnen;
   - CTA vor Navigation dauerhaft in die Queue schreiben.

3. **API-Vertrauensgrenze härten**
   - bei `/api/lead-init` kurzlebige signierte Lead-Session als HttpOnly/SameSite-Cookie ausstellen;
   - `/api/lead-track` leitet `lead_hash` aus der Session ab bzw. vergleicht ihn verbindlich;
   - Event-Allowlist und Payloadschema pro Event;
   - erlaubte Video-/Rank-Übergänge serverseitig prüfen;
   - Rate Limits pro Session/IP sowie Same-Origin-Prüfung für Browserrouten.

4. **Gefährliche Runtimefläche entfernen**
   - `init-quiz-db` aus dem Deployment entfernen;
   - Resume-Generierung mit n8n-/Mailer-Secret absichern;
   - Metriken hinter Coach-/Adminauthentisierung stellen;
   - globales `Access-Control-Allow-Origin: *` entfernen.

5. **Portable Runtime schaffen**
   - Node LTS und pnpm-Version festlegen;
   - Module vereinheitlichen oder explizit adaptieren;
   - zentral validiertes Env-Schema, Pflichtwerte fail-closed;
   - harte Vercel-URL durch Env-/Service-URL ersetzen;
   - Dockerfile, `.dockerignore`, Healthchecks und lokalen Container-Smoke ergänzen.

6. **Ende-zu-Ende-Tests**
   - normaler kompletter Funnel;
   - langsames Netz und 500/timeout bei `lead-track`;
   - Browserreload mit wartender Queue;
   - drei Videoabschlüsse und genau ein Rank-3-Outboxjob;
   - WhatsApp-Klick trotz neuer Tabnavigation;
   - Resume Rank 0, partielles Video, alle Videos, abgelaufener/ungültiger Link;
   - doppelte Events/Requests;
   - Worker-Retry, Dead Letter und Mail-Dedupe.

7. **`business-schulung` vor dem Plattformwechsel integrieren**
   - Featuremodul, Inhalte und fünf Sprachen in dieses Repository übernehmen;
   - Deep-Link-Vertrag und Alias-Matrix mit Tests fixieren;
   - Bridge/Worker auf eine gemeinsame relative Linkfunktion umstellen;
   - Vercel-Preview und Produktion ausliefern, bevor Coolify oder Datenbank wechseln;
   - alte Schulungsdomain als zeitlich begrenzten Redirect für historische E-Mails belassen.

8. **Datenzugriff vor dem Datenumzug entkoppeln**
   - vollständige Liste aller PostgREST-Tabellen, Views und RPCs erstellen;
   - typisierte Kysely-Schemata aus dem Live-Katalog generieren;
   - fachliche Repositories für Lead, Tracking, Resume, Nurture, Outbox und Analytics aufbauen;
   - jede Route zunächst gegen dieselbe Supabase-PostgreSQL-Quelle von REST auf Kysely umstellen;
   - Alt/Neu-Abfragen mit normalisierten Ergebnissen vergleichen;
   - erst wenn keine Runtime-Abhängigkeit mehr zu `/rest/v1`, Service-Key oder Supabase-Management-API besteht, Daten replizieren.

### P1 – vor oder zusammen mit dem Plattform-Cutover

- Inhalts-Hash für JS/CSS und `Cache-Control: public, max-age=31536000, immutable`.
- HTML kurz cachen bzw. revalidieren; APIs und Fehlerantworten `no-store`.
- Bestehende HSTS-, Frame-, MIME-, Referrer- und Permissions-Header übernehmen.
- Content-Security-Policy zunächst im Report-only-Modus einführen.
- Strukturierte JSON-Logs mit Request-ID, Route, Status, Latenz, Event-UID und pseudonymer Lead-ID.
- Private Source Maps zu einem Fehlerdienst hochladen, nicht öffentlich ausliefern.
- Self-hosted/pinned Player.js und eigene kanonische Brandingassets.
- `email_sent` in `queued`/`delivered` auftrennen.

### P2 – nach stabilem Coolify-Cutover

- Bridge in Router und Fachmodule zerlegen: Identity, Tracking, Submission, Resume, Metrics, Notifications, externe Adapter.
- Alte `ac_`-Writer und doppelte Batcher nach Telemetriebeweis entfernen.
- Browseraufruf `notify_all_videos_completed` entfernen; Rang 3 und Mail ausschließlich aus v2/Outbox ableiten.
- Outbox vom öffentlichen HTTP-Cron zu einem internen Workerprozess verschieben.
- Legacy-Tabellen/-Repositories nach belegter Nichtnutzung entfernen oder in ein klar markiertes Legacy-Schema verschieben.
- Altes `business-schulung`-Repository und Vercel-Projekt erst nach Ablauf der historischen Link-Nachlauffrist archivieren.

## 8. Migrationsabfolge ohne Big Bang

### Phase 0 – Drei Achsen bewusst trennen

Die Reihenfolge trennt Funktionsumbau, Hostingwechsel und Datenbankwechsel. Bei einem Fehler ist dadurch klar, welche Achse verantwortlich ist.

### Phase 1 – Schulung integrieren, noch auf Vercel/Supabase

1. Schulungsseite als Featuremodul in dieses Repository überführen.
2. Route `/berater-info` und alle bestehenden Query-Aliase testen.
3. Shared-Linkbuilder in Bridge und Worker verwenden.
4. Neue Links auf `business.activecenter.info` umstellen.
5. Auf Vercel-Preview und anschließend Produktion ausliefern.
6. Altes Schulungsprojekt auf Redirect umstellen; keine neuen fachlichen Änderungen mehr dort.

### Phase 2 – Funnel stabilisieren, noch auf Vercel/Supabase

1. Persistente Clientqueue und Server-Acks implementieren.
2. Kritische Zustandsübergänge transaktional machen.
3. API-Sicherheit und DB-Init-Entfernung getrennt deployen.
4. E2E-/Failure-Tests und Beobachtungsperiode durchführen.

### Phase 3 – Portabler Server und Coolify-Hostingcutover, Datenzugriff bleibt zunächst unverändert

1. HTTP-Adapter, Dockerfile, Health, Logs und graceful shutdown ergänzen.
2. Lokal als Container testen.
3. Coolify-Preview mit denselben Supabase-REST-/RPC-Pfaden und ausschließlich markierten Testleads betreiben.
4. n8n, Resume, Schulungslinks, Postmark, PHP-Bridge und Meta prüfen.
5. DNS-TTL senken; `business.activecenter.info` und `quiz.activecenter.info` definiert umstellen.
6. Bestehenden n8n-Outbox-Trigger zunächst unverändert lassen, damit nur das Hosting wechselt.
7. Vercel 7–14 Tage als funktionierenden Hostingrollback behalten. Weil Supabase in dieser Phase weiterhin kanonisch ist, benötigt ein DNS-Rollback keinen Datenrollback.

### Phase 4 – Kysely-Umbau auf Coolify gegen die bestehende Supabase-Datenbank

1. Direkten Supabase-PostgreSQL-Zugang mit einer eigenen minimalen Quellrolle einrichten.
2. Kysely + `pg`, DB-Typen, einen klein begrenzten Pool und Repository-Grenzen hinzufügen.
3. PostgREST-Abfragen Route für Route durch parameterisierte Kysely-Abfragen ersetzen.
4. RPCs als explizite Funktionsaufrufe erhalten; zusammengehörige Schreibschritte in Transaktionen zusammenziehen.
5. Alt-/Neu-Lesevergleiche gegen dieselben Quelldaten fahren, jeweils mit Positiv- und Negativproben.
6. Connection-Budget vor und nach jeder Gruppe messen. Der Umbau läuft bewusst erst im kontrollierten Coolify-Container, nicht in horizontal unberechenbaren Vercel-Serverless-Instanzen.
7. Restgate: keine produktive Runtime-Referenz mehr auf `/rest/v1`, `SUPABASE_SERVICE_KEY`, Supabase-Management-API oder `auth.jwt()`.

Der Codeumbau erfolgt vor dem Datenumzug. Ein selbst gehostetes PostgREST wäre ein später wieder abzureißendes Gerüst und ist ausgeschlossen.

### Phase 5 – Hetzner-Datenbank vorbereiten

1. `business_leads` über `/root/pg-neues-projekt.sh` anlegen.
2. Rollen/Grants, Connection-Budget und Kysely-Pool festlegen.
3. Exakte Besitzmatrix erstellen: Leadkern, Tracking-Legacy, Quiz, Nurture, Webhooks, Outbox, Analytics; HBA-/SSO-/fremde Tabellen explizit ausschließen.
4. Schema, Funktionen, Views, Indizes, Constraints und Trigger versioniert auf PostgreSQL 18.6 einspielen.
5. Katalogparität prüfen: Tabellen, Spalten/Typen/Defaults, PK/FK, Replica Identity, Indizes einschließlich Partial Unique, Funktionen/Signaturen, Views, Trigger, Sequenzen und Grants.
6. Einmaligen Testimport durchführen; Zeilenzahlen plus stabile Prüfsummen zweimal vergleichen; anschließend Testdaten verwerfen.
7. App-Generalprobe gegen eine Wegwerfdatenbank mit exakt der späteren Runtime-Rolle.
8. Kapazität und Backup nachmessen; anwendungsspezifischen Restore-Drill durchführen.

### Phase 6 – Lead-Verbund replizieren und Datenbank umschalten

1. Vorher alle Schreiber und Leser inventarisieren: Quiz, Analytics, HBA-Schnittstellen, n8n, Nurture, Webhook-/Bridge-Pfade und Kleinverbraucher.
2. Alle aktiven Schreiber müssen auf den direkten Treiber/fachliche APIs vorbereitet sein. Keine isolierte Quiz-Umschaltung bei weiterlaufenden Supabase-Schreibern.
3. Explizite Publication nur für die dem Business-Leads-Produkt gehörenden Tabellen anlegen; keine pauschale Replikation des gemischten `public`-Schemas.
4. Subscription mit Initial Copy starten. Ab jetzt DDL-Freeze für publizierte Objekte.
5. Mindestens 48 Stunden Lag, Fehler, Zeilenzahlen und Prüfsummen beobachten; zweimalige Parität über Zeit.
6. Cutoverfenster: n8n-Lead-/Nurture-Workflows pausieren, Web und Worker stoppen, Lag auf 0, finale Parität.
7. Subscription deaktivieren, Sequenzen auf `max(id)+Puffer` setzen, `DATABASE_URL` auf `10.0.1.3` wechseln.
8. Web starten und vollständigen Smoke ausführen; erst danach Worker und n8n wieder aktivieren.
9. Genau eine kanonische Schreibquelle. Kein unkontrolliertes Dual-Write.

### Phase 7 – Nachlauf und Supabase-Abschaltung

1. 72 Stunden enges Monitoring, danach 30 Tage Beobachtung: Ack-Rate, DB-Pool, Querylatenz, Replikations-/Outbox-/Nurture-Zustand und Providerfehler.
2. Supabase als eingefrorenen Rückweg behalten; Rücktransfer vom neuen PostgreSQL zu einer Supabase-Wegwerfkopie vorher praktisch testen.
3. Alte Schulungslinks gemäß definierter Nachlauffrist beobachten; Vercel-Schulungsprojekt erst danach abschalten.
4. Supabase erst kündigen/löschen, wenn alle neun Verbraucher weg sind, Storage-Inhalte migriert und ein organisationsweiter Restscan 0 Treffer liefert.
5. Vercel-Projekte, Domains und Secrets erst entfernen, wenn Hosting- und Datenbankrollback bewusst aufgegeben wurden.

## 9. Rollback

Hosting- und Datenbankrollback sind zwei unterschiedliche Verfahren.

### Hostingrollback vor dem PostgreSQL-Cutover

- DNS zurück auf die dokumentierten Vercel-Ziele.
- Coolify-Web/Worker stoppen.
- Supabase bleibt kanonisch; kein Datenrollback nötig.
- Ereignisse anhand `event_uid` idempotent nachliefern.

### Datenbankrollback im Cutover-Smoke, bevor externe Schreiber freigegeben werden

- Coolify-Web/Worker stoppen.
- `DATABASE_URL` zurück auf die eingefrorene Supabase-Quelle.
- Subscription/Publication nicht löschen, sondern zunächst deaktiviert erhalten.
- Web starten, Smoke prüfen, n8n/Worker erst danach wieder freigeben.

### Datenbankrollback nach neuen Schreibvorgängen auf Hetzner

Ein einfaches Zurückdrehen wäre Datenverlust. Deshalb vorab praktisch proben:

1. alle Schreiber stoppen;
2. Delta/vollständigen Dump aus `business_leads` erzeugen;
3. in eine Supabase-Scratch-Umgebung einspielen und Parität prüfen;
4. erst dann die eingefrorene Supabase-Produktion aktualisieren;
5. Verbindungen zurückdrehen und Schreiber freigeben.

Vercel kann die private Datenbank `10.0.1.3` nicht erreichen. Nach dem PostgreSQL-Cutover ist Vercel daher nur zusammen mit einer aktuellen Supabase-Rückfallebene ein funktionierender Datenrollback – nicht mehr allein durch DNS.

Voraussetzung: Während der Übergangszeit müssen alte und neue Version dasselbe API-/DB-Schema rückwärtskompatibel verstehen.

## 10. Abnahmekriterien

Der Umzug ist erst freigabefähig, wenn:

- 100 vollständige synthetische/markierte Testläufe keinen UI-/DB-Rangunterschied erzeugen;
- ein absichtlich unterbrochener Trackingrequest nach Reload nachgeliefert wird;
- pro Lead maximal ein wirksamer Rank-3-Hot-Lead-Job entsteht;
- CTA-Klick und WhatsApp-Navigation getrennt nachvollziehbar sind;
- Resume niemals einen höheren Zustand als die kanonische DB freigibt;
- `/berater-info` alle Profil-/Ziel-/Sprach-Deep-Links kompatibel auflöst;
- Bridge und Worker ausschließlich Links auf der eigenen Domain erzeugen;
- alle API-Secrets beim Start validiert werden;
- unbekannte API-Routen kein HTML liefern;
- Container-Readiness, Rolling Update und SIGTERM-Test bestehen;
- beide Produktionsdomains definiertes Verhalten zeigen;
- n8n, PHP-Bridge, Postmark, Meta und ZeroBounce mit Zeitouts und klaren Fehlerzuständen getestet sind;
- DNS-Rollback praktisch getestet und dokumentiert ist.
- der Runtimecode keine Supabase-REST-/Service-Key-/Management-API-Abhängigkeit mehr besitzt;
- Zielkatalog, Zeilenzahlen und stabile Prüfsummen zweimal über Zeit mit der Quelle übereinstimmen;
- jede publizierte Tabelle Primary Key oder geeignete Replica Identity besitzt;
- Replikationslag mindestens 48 Stunden stabil bei 0 bzw. im festgelegten Grenzwert liegt;
- Sequenzen beim Cutover korrigiert und mit einem Testinsert bewiesen sind;
- dieselbe PostgreSQL-Runtime-Rolle in Generalprobe und Produktion verwendet wird;
- DB-Pool, Cluster-Ressourcen, Dump und PITR-Heartbeat grün sind;
- ein Restore des echten Business-Leads-Bestands in einer Wegwerfdb bestanden hat;
- alle verbleibenden Supabase-Verbraucher vor einer Kündigung mit Verantwortlichem und Abschaltgate dokumentiert sind.

## 11. Nicht mit dem Hostingwechsel verwechseln

Mit diesem erweiterten Plan verschwinden Vercel und Supabase aus dem Zielbetrieb. Vollständige Fremdunabhängigkeit entsteht trotzdem nicht: Bunny, Postmark, Meta, ZeroBounce, WhatsApp, Mautic und weitere Dienste bleiben bewusste externe Abhängigkeiten. Diese werden nicht gleichzeitig ersetzt, damit die Konsolidierung rückrollbar bleibt.

## 12. Empfohlene unmittelbare Arbeitsreihenfolge

1. `business-schulung` als `/berater-info` integrieren und auf Vercel produktiv schalten.
2. Reliable-Tracking, Zustandsinvarianten und API-Vertrauensgrenze reparieren.
3. Vollständige Supabase-/Verbraucherlandkarte als maschinenprüfbares Inventar erzeugen.
4. Portablen Node-Server/Dockerfile bauen und Hosting mit unverändertem Datenzugriff separat auf Coolify umstellen.
5. Erst im kontrollierten Coolify-Container Kysely-Repositories gegen die bestehende Supabase-PostgreSQL-Datenbank einführen.
6. Eigene Datenbank `business_leads` auf PostgreSQL 18.6 vorbereiten und testen.
7. Lead-Verbund per logischer Replikation synchronisieren und kontrolliert umschalten.
8. 30 Tage Nachlauf; erst danach Supabase-/Vercel-Reste entfernen.

## 13. Zweitprüfung und Ergänzungen (23.08.2026, unabhängiges Review)

Read-only-Gegenprüfung des Plans gegen den tatsächlichen Code. Ergebnis: Der Plan ist in
Architektur, Phasentrennung und Rollback-Logik tragfähig. Kein Befund des Audits musste
zurückgenommen werden. Es gibt aber Korrekturen an Priorität und Detailtiefe sowie Lücken,
die vor Phase 3/6 geschlossen werden müssen.

### 13.1 Verifikation der Kernbefunde am Code

| Audit-Behauptung | Beleg | Status |
| --- | --- | --- |
| Fire-and-forget-Writer verwirft Fehler | `src/lib/core.js:684-693`: `fetch(...).catch(() => undefined)`, keine Statusprüfung, keine Queue | bestätigt |
| Bridge-Monolith ~165 KB | `api/bridge.js` = 165.564 Bytes | bestätigt |
| Default-Secret in DB-Init | `api/init-quiz-db.js:17`: `'quiz_init_secret_change_me'` | bestätigt, siehe 13.2.1 (schlimmer) |
| Globales CORS `*` | `api/bridge.js:3581` | bestätigt |
| Harte Vercel-URLs | `api/bridge.js:46`, `api/lead-outbox-worker.js:29` | bestätigt |
| Kein Asset-Fingerprinting | `build.js`: fester Pfad `/assets/app.js` | bestätigt |
| Node/pnpm nicht fixiert | `package.json` ohne `engines`/`packageManager` | bestätigt |
| `business-schulung` statisch, Next 14 | separates Repo, nur `next`/`react` als Deps, keine API | bestätigt |
| Zwei Tracker-Modelle | `./ac-track.js` (Root) und `src/ac-track.js` parallel | bestätigt |
| Secrets nicht im Git | nur `.env.example` getrackt; `.gitignore` deckt alle `.env*` ab | bestätigt (positiv) |

### 13.2 Korrekturen und Verschärfungen

**13.2.1 `init-quiz-db` ist schlimmer als beschrieben: Host-Header-Bypass.**
`api/init-quiz-db.js:20` erlaubt den Zugriff auch ohne Token, wenn `req.headers.host ===
'localhost:3000'`. Der Host-Header ist clientkontrolliert. Hinter Vercel routet die Plattform
zwar nach Host, aber genau diese implizite Schutzannahme fällt beim Umzug: Sobald der Container
direkt erreichbar ist (Portfreigabe, interner Aufruf, Traefik-Catch-all, Curl vom selben Host)
genügt `-H "Host: localhost:3000"` für unauthentisierte Schema-DDL gegen die Produktions-DB.
Konsequenz: Die Route muss nicht „vor dem Cutover", sondern **sofort** entfernt werden (P0,
unabhängig von allen Phasen; Aufwand < 1 Stunde).

**13.2.2 Worker-Secret via Query-String.**
`api/lead-outbox-worker.js:57` akzeptiert das Secret als `?secret=...`. Query-Strings landen in
Vercel-Logs, künftig in Traefik-Access-Logs und in n8n-Ausführungshistorien. Beim Umbau den
Query-Parameter-Pfad entfernen und nur den Header `x-lead-worker-secret` (bzw. Authorization)
zulassen; Secret beim Cutover rotieren (siehe 13.3.6).

**13.2.3 Arbeitsreihenfolge in §12 umstellen: Tracking-Zuverlässigkeit vor Schulungs-Integration.**
§12 setzt die `business-schulung`-Integration auf Platz 1. Der René-Hammer-Fehlerklasse-Bug
(4.1/4.2) verliert aber **laufend** Hot-Lead-Mails in Produktion — jeder Tag kostet real
Coach-Benachrichtigungen, während die Schulungs-Integration nur Struktur konsolidiert und
keinen aktiven Schaden stoppt. Empfohlene Reihenfolge:

1. Sofortmaßnahme: `init-quiz-db` entfernen (13.2.1).
2. Reliable-Tracking, Zustandsinvarianten, CTA-Persistenz (P0-1/P0-2).
3. Danach erst `business-schulung`-Integration und der Rest wie in §12.

Die beiden Arbeitsstränge berühren disjunkte Dateien und können bei Kapazität parallel laufen;
bei Serialisierung gewinnt Tracking.

### 13.3 Ergänzungen (Lücken im Plan)

**13.3.1 Voraussetzungen der logischen Replikation aus Supabase heraus (Phase 6 blockierend).**
Vor Phase 6 verifizieren, sonst platzt das Cutover-Fenster:

- Replikation läuft nur über die **Direktverbindung** (Port 5432), nie über den Pooler
  (Supavisor/PgBouncer sprechen kein Replikationsprotokoll).
- Supabase-Direktverbindungen sind IPv6-first. Der Hetzner-Subscriber (`10.0.1.3`-Host) braucht
  funktionierendes ausgehendes IPv6 **oder** das Supabase-IPv4-Add-on. Vorab testen:
  `psql "<direct-connection-string>"` vom DB-Host.
- UFW-**Egress** vom DB-Host zu Supabase:5432 erlauben; falls im Supabase-Projekt Network
  Restrictions aktiv sind, die Hetzner-Egress-IP dort freischalten.
- Prüfen, dass der Supabase-Plan Replication Slots zulässt und `max_replication_slots` frei ist.
- Auf dem Flotten-Cluster: `max_logical_replication_workers`/`max_worker_processes`-Headroom —
  das ist eine clusterweite Einstellung und muss mit den anderen Projekten koordiniert werden.
- Cross-Major-Version (Supabase PG 15/17 → 18.6) ist für logische Replikation zulässig
  (aufwärts); vorab die tatsächliche Supabase-Major-Version dokumentieren.

**13.3.2 Einfachere Alternative ernsthaft prüfen: Dump/Restore-Cutover statt Replikation.**
Der Lead-Bestand ist klein (Funnel-Daten, keine Massendaten). Phase 6 verlangt ohnehin ein
Fenster, in dem alle Schreiber pausieren. In diesem Fenster ist `pg_dump | pg_restore` des
gesamten `business_leads`-Objektsatzes voraussichtlich in Minuten fertig und eliminiert eine
komplette Fehlerklasse: Slots, Lag-Monitoring, Publication-Scoping, DDL-Freeze über Tage,
Sequenz-Sync. Empfehlung: Testimport aus Phase 5 Schritt 6 mit Zeitmessung durchführen; liegt
die Gesamtzeit (Dump + Restore + Paritätsprüfung) unter dem vertretbaren Wartungsfenster
(z. B. 30 Minuten, nachts), wird **Dump/Restore der Primärweg** und logische Replikation nur
der Fallback für den Fall, dass das Fenster nicht reicht. Rollback bleibt identisch einfach:
Supabase bleibt eingefroren kanonisch bis zum Smoke-Erfolg.

**13.3.3 Deploy-Pipeline und Preview-Story auf Coolify fehlen im Plan.**
Heute: `deploy:preview` → `vercel deploy`, `promote:prod` → Guard-Skript + `vercel promote`.
Diese Gates (`guard-production-deploy.js`, `verify.js`) dürfen beim Wechsel nicht stillschweigend
wegfallen. Festlegen vor Phase 3:

- Build-Weg: Git-Push-Deploy mit Dockerfile in Coolify; Produktions-App auf einen
  Release-Branch/Tag pinnen, damit `main`-Pushes nicht ungeprüft live gehen (Ersatz für
  Preview→Promote).
- Preview: separate Coolify-App auf `main` (oder PR-Previews) mit Test-Env gegen markierte
  Testleads.
- Die bestehenden Guard-/Verify-Schritte in CI (GitHub Actions) vor dem Deploy-Webhook
  ausführen — nicht löschen.

**13.3.4 Wegfall der Vercel-Edge kompensieren.**
Mit Vercel verschwinden implizit: Anycast-CDN, DDoS-Absorption, verwaltetes TLS auf Edge-Ebene.
Auf Coolify übernimmt Traefik TLS (Let's Encrypt, automatisch), aber DDoS/Bot-Druck trifft
direkt den Origin. Entscheidung dokumentieren: Cloudflare (Proxy-Modus) davor **oder** bewusst
Origin-only mit Traefik-Rate-Limit-Middleware + CrowdSec/fail2ban. Die P0-Rate-Limits auf
App-Ebene ersetzen das nicht. Zusätzlich beachten: hinter einem weiteren Proxy ändert sich die
Client-IP-Ermittlung (X-Forwarded-For-Kette) — betrifft den HTTP-Adapter aus §6.

**13.3.5 Worker-App: Health, Replikas, Shutdown.**
§6 definiert Health nur für die Web-App. Für `business-leads-worker` ergänzen:

- Liveness ohne öffentliche Domain: kleiner interner HTTP-Health-Port oder prozessbasierter
  Coolify-Healthcheck.
- **Genau eine Replika** als bewusste Vorgabe dokumentieren (SKIP LOCKED schützt zwar vor
  Doppelverarbeitung, aber Mail-Provider-Duplikate bei Retries sind teurer als Skalierung nützt).
- SIGTERM: laufenden Batch zu Ende verarbeiten, keinen neuen claimen, dann exit (Job-Draining).

**13.3.6 Secret-Rotation als Cutover-Bestandteil.**
Die heutigen Secrets (BRIDGE_KEY, Worker-Secret, INIT_DB_TOKEN, Supabase-Keys) existierten in
Vercel-Env, lokalen `.env`-Dateien im OneDrive-Sync und n8n-Credentials. Der Plattformwechsel
ist der natürliche Rotationszeitpunkt: Beim Einrichten der Coolify-Env **neue** Werte erzeugen,
n8n nachziehen, alte Werte nach dem Rollback-Fenster für ungültig erklären. Supabase-Keys nach
Phase 7 widerrufen, nicht nur löschen.

**13.3.7 Konkrete Versionspinnung.**
„Node LTS" präzisieren: aktuelle Active-LTS-Linie wählen und dreifach fixieren —
`engines.node` in `package.json`, `packageManager: "pnpm@<version>"` (Corepack) und dasselbe
Node-Image-Tag im Dockerfile (digest-gepinnt). CI und Dockerfile müssen dieselbe Version
beweisen, sonst wiederholt sich die Klasse „lokal grün, Container anders".

**13.3.8 E2E-Werkzeug festlegen: Playwright.**
§7 P0-6 nennt Tests, aber kein Werkzeug. Im Repo existiert bereits `.playwright-cli/` —
Playwright ist gesetzt. Die Fehlerfall-Szenarien (500/Timeout auf `lead-track`, Reload mit
wartender Queue) mit Playwright-Route-Interception (`page.route`) abbilden; das deckt genau die
Lücke „kein Browser-/Fehlerfall-E2E".

**13.3.9 Collation/ICU beim DB-Wechsel.**
Bekannter Vorfall vom 20.08.2026: Collation-Änderungen brachen n8n-Queries (Alert „n8n Status
200, Response {}"). Beim Wechsel Supabase→PG 18.6 ändern sich glibc/ICU-Versionen. Bei
Dump/Restore werden Indizes neu gebaut (unkritisch); aber: alle n8n-SQL-Nodes, die gegen den
Lead-Verbund arbeiten, auf implizite Collation-Annahmen prüfen und nach dem Cutover mit
Umlaut-Testdaten (ä/ö/ü/ß, kyrillisch wegen `ru`) verifizieren. In die Abnahmekriterien (§10)
aufnehmen.

**13.3.10 DSGVO-Nachführung.**
Personenbezogene Leaddaten wandern von Supabase/Vercel zu Hetzner (Datenlokalität verbessert
sich). Nacharbeiten: Auftragsverarbeiter-Liste/Datenschutzerklärung aktualisieren (Vercel,
Supabase raus; Hetzner rein), AVV mit Hetzner prüfen. Die fremd eingebundene Datenschutzseite
(4.9) im selben Zug auf die eigene Domain holen.

**13.3.11 Kleinere technische Notiz zur Client-Queue.**
`keepalive: true`-Fetches (heute in `sendLeadTrackEvent`) unterliegen einem Body-Limit von
64 KB pro Request. Die neue persistente Queue sollte Batches entsprechend klein halten und
`keepalive` nur für den Unload-Flush verwenden, nicht als Ersatz für die Retry-Queue.

### 13.4 Ergänzte Abnahmekriterien (zusätzlich zu §10)

- `init-quiz-db` existiert in keinem Deployment mehr; ein Request darauf liefert 404.
  Übergangsregel, weil die CI den Read-only-Smoke bei jedem Push gegen Produktion fährt:
  Bis die Entfernung deployt ist, akzeptiert der Smoke 403/404 (nie eine Erfolgsantwort);
  ab dem Deploy wird `READONLY_SMOKE_STRICT_INIT_ROUTE=1` gesetzt und strikt 404 erzwungen.
- Kein Secret wird mehr als Query-Parameter akzeptiert.
- Umlaut-/Kyrillisch-Testleads laufen nach dem DB-Cutover korrekt durch n8n-Queries (13.3.9).
- Direktverbindungs-/IPv6-Test von `10.0.1.3` zu Supabase ist vor Phase 6 dokumentiert
  (entfällt bei Dump/Restore-Primärweg).
- Worker verarbeitet bei SIGTERM den laufenden Batch zu Ende (Log-Beweis).
- Neue Secrets aktiv, alte widerrufen (Nachweis pro Secret).
- CI führt Guard/Verify vor jedem Produktions-Deploy aus; ein absichtlich fehlschlagender
  Verify-Lauf blockiert das Deploy nachweislich.

### 13.5 Drittprüfung (Markus, 23.08.2026): verbleibende Lücken bis Umsetzungsreife

Freigabe der Kapitel 1–13.4 mit sieben Ergänzungen. Erst mit diesen gilt der Plan als
vollständig ausführbar. Die wichtigsten vier: Schreibruhe-Nachweis, Objektmanifest,
Migration Runner und die nicht exakt-einmalige Mailzustellung.

**13.5.1 Objektmanifest für den Datenbankumzug (Phase 5, vor dem Testimport).**
Der selektive Dump darf nicht nur auf einer Tabellenliste beruhen — im gemischten
`public`-Schema sind fehlende Abhängigkeiten sonst wahrscheinlich. Vor dem Testimport entsteht
ein maschinenlesbares Manifest mit:

- Tabellen, Sequenzen und Sequence-Ownership;
- Constraints und schemaübergreifenden Foreign Keys;
- Views und Materialized Views;
- Funktionen, Triggern und verwendeten Extensions;
- Rollen und Grants.

Ein Katalogtest beweist zusätzlich: Kein Objekt des Business-Leads-Verbunds hängt unbemerkt
von einem nicht migrierten Objekt ab.

**13.5.2 Echte Schreibruhe beweisen (Phase 6, vor dem finalen Dump).**
„Alle bekannten Writer pausieren" reicht bei neun Verbrauchern nicht. Das Cutover-Fenster
braucht eine technische Schreibbarriere:

1. Web-App in Read-only-/Wartungsmodus;
2. Worker stoppen und drainen;
3. betroffene n8n-Workflows deaktivieren;
4. alte API-Keys während des Fensters blockieren;
5. anschließend z. B. fünf Minuten nachweisen, dass Tabellenzähler, maximale Event-ID und
   `updated_at` unverändert bleiben.

Erst danach beginnt der finale Dump. Sonst kann zwischen letztem Check und Dump noch ein Lead
geschrieben werden.

**13.5.3 Migration Runner definieren.**
`init-quiz-db` wird nicht durch lose SQL-Dateien ersetzt, sondern durch einen eindeutigen
Migration Runner:

- versionierte Migrationen im Repository;
- genau ein CI-/Release-Schritt führt sie aus;
- PostgreSQL-Advisory-Lock gegen parallele Migrationen;
- keine Migration beim Start jeder Web-/Worker-Replika;
- Expand/Contract-Migrationen, damit alte und neue App-Version kurz parallel laufen können
  (bei Coolify Rolling Updates zwingend).

**13.5.4 Präzisierung zu Sequenzen bei Dump/Restore (korrigiert 13.3.2).**
Ein vollständiger `pg_dump`/`pg_restore` übernimmt Sequenzzustände normalerweise mit. Bei
**selektiven** Dumps gilt das nur, wenn Sequenz, Ownership und `setval` tatsächlich enthalten
sind. Dump/Restore reduziert die manuelle Sequenzarbeit, ersetzt aber nicht die Prüfung.
Abnahmetest bleibt: jede ID-Sequenz hat den richtigen Owner, `nextval()` liegt über `MAX(id)`,
ein Testinsert erzeugt keinen Konflikt.

**13.5.5 Outbox bedeutet nicht automatisch „keine Doppelmail".**
Auch mit genau einer Worker-Replika bleibt möglich: Postmark nimmt die Mail an → die
HTTP-Antwort geht verloren → der Worker wertet den Versuch als fehlgeschlagen → Retry sendet
ein zweites Mal. Die Outbox garantiert „mindestens einmal", nicht „exakt einmal". Ergänzen:

- stabile fachliche Notification-ID;
- Speicherung von Versuch und Provider-Message-ID;
- Webhook-/Delivery-Reconciliation;
- Alarm bei unklarem Providerzustand;
- definierte manuelle Entscheidung statt blindem Retry.

Für Hot-Lead-Mails ist das geschäftlich relevanter als die Anzahl der Worker-Replikas.

**13.5.6 Dasselbe Docker-Image promoten (ergänzt 13.3.3/13.3.7).**
Release-Branch-Pinning genügt nicht; Produktion darf nicht erneut aus demselben Commit bauen:

```text
Commit → Tests → Image bauen → Preview mit Image-Digest testen
       → exakt denselben Digest nach Produktion promoten
```

Zusätzlich: non-root Container, Healthcheck im Image, SBOM/Dependency-Scan, Commit-SHA und
Image-Digest über `/health` bzw. `/version` abfragbar, Lockfile und exakte Node-/pnpm-Version.
Für die Übergangsphase mindestens **Node 22**: Supabase hat die Unterstützung für Node 20 in
seinen Clientbibliotheken zum 30.06.2026 beendet
([Supabase-Changelog](https://supabase.com/changelog/45715-deprecation-notice-dropping-support-for-node-js-20);
gegengeprüft am 23.08.2026: Datum und Mindestversion Node 22 bestätigt, Hintergrund ist das
Node-20-EOL am 30.04.2026). Ist-Stand im Repo: Die CI (`activecenter-safety.yml`) läuft bereits
auf Node 24/pnpm 10 — `package.json` (`engines`, `packageManager`) und das künftige Dockerfile
müssen auf dieselbe Linie gepinnt werden, sonst beweist die CI eine andere Runtime als die
Produktion.

**13.5.7 Rollback nach Wiederaufnahme der Writes: Point of no Return definieren (ergänzt §9).**
Vor den ersten Hetzner-Writes ist der Rollback einfach, danach nicht mehr. Deshalb:

- finalen Quell-Watermark protokollieren;
- Dump mit SHA-256 sichern;
- Zeitpunkt der ersten Zielschreibfreigabe dokumentieren;
- Rückübertragung neuer Zielwrites praktisch proben;
- definieren, wer den Rollback auslöst;
- maximale Entscheidungszeit festlegen.

Ohne geprobten Reverse-Transfer darf „Supabase zurückschalten" nach neuen Zielwrites nicht als
einfacher Rollback bezeichnet werden.

**13.5.8 Kleinere Punkte.**

- Für `/berater-info` ausdrücklich entscheiden: öffentlich/noindex oder geschützt. Ein
  geheimer Direktlink ist keine Zugriffskontrolle.
- Bei Cloudflare-Einsatz (13.3.4) den Origin so sperren, dass Traefik nicht unter Umgehung
  von Cloudflare erreichbar bleibt.
- Neben Collation (13.3.9) auch UTC/`timestamptz`, `NULL`-Sortierung, JSON-Typen und
  case-insensitive Vergleiche testen.
- Lösch- und Aufbewahrungsfristen einschließlich Backups und Wiederherstellung definieren.
  Nach einem Restore müssen zwischenzeitlich gelöschte Leads erneut gelöscht werden können.
- RPO und RTO getrennt festlegen: PITR schützt Daten, erzeugt aber keine Hochverfügbarkeit
  bei Ausfall der einzelnen PostgreSQL-VM.

**Status nach Drittprüfung:** Plan belastbar umsetzungsreif. Erste Umsetzung:
`init-quiz-db` entfernen und mit einem automatisierten 404-Test absichern.

## 14. Verwendete offizielle Plattformreferenzen

- Coolify Build Packs: https://coolify.io/docs/applications/build-packs
- Coolify Applications: https://coolify.io/docs/applications/index
- Coolify Healthchecks: https://coolify.io/docs/knowledge-base/health-checks
- Coolify Rolling Updates: https://coolify.io/docs/knowledge-base/rolling-updates
- Coolify Scheduled Tasks: https://next.coolify.io/docs/core/automation/scheduled-tasks/overview
- Coolify Backup/Restore: https://coolify.io/docs/knowledge-base/how-to/backup-restore-coolify
- Supabase API-Sicherheit: https://supabase.com/docs/guides/api/securing-your-api
- Supabase Datensicherheit: https://supabase.com/docs/guides/database/secure-data
- Supabase API-Keys: https://supabase.com/docs/guides/getting-started/api-keys
- PostgreSQL 18 Logical Replication: https://www.postgresql.org/docs/18/logical-replication.html
- PostgreSQL 18 Restrictions: https://www.postgresql.org/docs/18/logical-replication-restrictions.html
- PostgreSQL 18 Create Subscription: https://www.postgresql.org/docs/18/sql-createsubscription.html
- PostgreSQL 18 Replication Monitoring: https://www.postgresql.org/docs/18/logical-replication-monitoring.html
