# Container-Smoke der portablen Runtime

Audit 2026-08-23, §7 P0-5 / Phase 3 Schritt 2 („Lokal als Container testen").

Dieser Ablauf laeuft **bewusst nicht in CI**. Der GitHub-Runner der Safety-Pipeline hat kein
garantiertes Docker, und ein Smoke, der in der Haelfte der Laeufe uebersprungen wird, ist
kein Nachweis, sondern Rauschen. Er wird lokal ausgefuehrt und das Ergebnis im
Abnahmebericht protokolliert.

Gegen die Runtime ohne Container laeuft `pnpm test` (`scripts/tests/http-adapter.test.js`);
dieser Ablauf hier beweist zusaetzlich das **Image**: Build, non-root, HEALTHCHECK,
Signalverhalten.

## 0. Voraussetzung pruefen

```bash
docker version
```

Fehlt Docker, wird der Smoke dokumentiert uebersprungen — nicht simuliert. Ein „waere
vermutlich gruen" ist kein Abnahmebeweis.

## 1. Env-Datei anlegen (nicht committen)

Die Pflichtwerte stehen im Env-Schema in `server/http-adapter.js` (`REQUIRED_ENV`). Fehlt
einer davon, **startet der Container absichtlich nicht** (fail-closed, Exit 1).

```bash
cat > .env.container-smoke <<'EOF'
SUPABASE_URL=https://<projekt>.supabase.co
SUPABASE_SERVICE_KEY=<service-key>
JWT_SECRET=<jwt-secret>
BRIDGE_KEY=<bridge-key>
EOF
```

`.env*` ist sowohl in `.gitignore` als auch in `.dockerignore` — die Datei landet weder im
Repository noch im Image.

> Fuer einen reinen Routing-Smoke reichen syntaktisch gueltige Platzhalter. Dann ist
> `/health/live` gruen und `/health/ready` meldet korrekt **not_ready**, weil die Datenquelle
> nicht antwortet. Fuer einen Ready-Nachweis werden echte, lesende Werte gebraucht — und dann
> gilt: nur markierte Testleads, keine Schreibpfade anfassen.

## 2. Image bauen

```bash
docker build -t business-leads-web:smoke .
```

Erwartung: drei Stages (`deps`, `build`, `runtime`), `pnpm run build` erzeugt `dist/`.

## 3. Container starten

Der Host-Port ist frei waehlbar; `18080` vermeidet Kollisionen mit lokalen Dev-Servern.

```bash
docker run -d --name business-leads-smoke \
  --env-file .env.container-smoke \
  -p 18080:3000 \
  business-leads-web:smoke
```

Startlog pruefen (strukturiertes JSON, eine Zeile pro Ereignis):

```bash
docker logs business-leads-smoke
```

Erwartet: `api_handlers_loaded`, danach `server_listening` mit `"host":"0.0.0.0"`.

## 4. Proben

```bash
BASE=http://127.0.0.1:18080

# 4.1 Liveness (Container-Healthcheck)
curl -sS -o /dev/null -w '%{http_code}\n' $BASE/health/live
# erwartet: 200

# 4.2 Readiness (Env + kurzer Datenquellen-Ping, 2s-Timeout)
curl -sS -w '\n%{http_code}\n' $BASE/health/ready
# erwartet: 200 "ready" mit echten Werten, 503 "not_ready" mit Platzhaltern

# 4.3 Statische Funnel-Seite ueber den Slug-Rewrite
curl -sS -o /dev/null -w '%{http_code} %{content_type}\n' $BASE/markus
# erwartet: 200 text/html

# 4.4 Berater-Info-Rewrite
curl -sS -o /dev/null -w '%{http_code}\n' $BASE/berater-info
# erwartet: 200

# 4.5 API-Vertrag: ungueltiger lead_hash bleibt ein 400 mit stabilem Fehlercode
curl -sS -X POST $BASE/api/lead-track \
  -H 'Content-Type: application/json' \
  --data-binary '{"lead_hash":"nicht-gueltig","event_name":"quiz_started"}' \
  -w '\n%{http_code}\n'
# erwartet: {"success":false,"error":"invalid_lead_hash"} und 400

# 4.6 Unbekannte API-Route liefert JSON-404, nie den SPA-Fallback
curl -sS $BASE/api/gibt-es-nicht -w '\n%{http_code}\n'
# erwartet: {"success":false,"error":"api_route_not_found",...} und 404

# 4.7 Security-Header aus vercel.json liegen auch hier auf jeder Antwort
curl -sSI $BASE/markus | grep -i 'x-frame-options\|x-content-type-options\|referrer-policy\|permissions-policy'
# erwartet: alle vier

# 4.8 non-root
docker exec business-leads-smoke id
# erwartet: uid=1000(node)

# 4.9 Docker-Healthcheck
docker inspect --format '{{.State.Health.Status}}' business-leads-smoke
# erwartet: healthy (nach der start-period)
```

> Umlaute nie inline per `curl` senden (Windows-Shell zerlegt die Kodierung). Fuer
> Umlaut-Proben `--data-binary @datei.json` benutzen und die Bytes vorher per Hexdump
> pruefen.

## 5. Graceful Shutdown

```bash
docker stop -t 15 business-leads-smoke
docker logs business-leads-smoke | tail -5
```

Erwartet: `shutdown_start`, dann `shutdown_complete` mit `"outcome":"drained"`, Exit 0 —
und zwar deutlich vor dem 15-Sekunden-Kill von Docker.

```bash
docker inspect --format '{{.State.ExitCode}}' business-leads-smoke
# erwartet: 0
```

## 6. Fail-closed gegenpruefen

Ein Lauf ohne Pflicht-Env muss scheitern — sonst ist die Schutzwirkung nicht bewiesen:

```bash
docker run --rm business-leads-web:smoke
# erwartet: JSON-Zeile "startup_aborted" / "missing_required_env", Exit-Code 1
```

## 7. Statusnotiz 24.08.2026 (erste Umsetzung P0-5)

`docker version` liefert auf dem Arbeitsrechner „command not found" — Docker Desktop ist
nicht installiert. Der Container-Smoke wurde deshalb **nicht ausgefuehrt**, sondern
dokumentiert uebersprungen. Er ist vor dem Coolify-Preview aus Phase 3 nachzuholen; erst
dann sind Image-Build, non-root, HEALTHCHECK und das SIGTERM-Verhalten im Container belegt.

Ersatzweise wurde am selben Tag dieselbe Runtime **ohne Container** auf dem Host gefahren
(`node server/app-server.js`, PORT 18080, gegen das frisch gebaute `dist/`, mit
Platzhalter-Env). Ergebnis der Proben 4.1 bis 4.7: alle wie oben erwartet, inklusive
`503 not_ready` bei nicht erreichbarer Datenquelle und Exit 1 bei fehlender Pflicht-Env
(Probe 6). Nicht abgedeckt und weiterhin offen: alles, was am Image haengt (Build-Stages,
non-root, HEALTHCHECK) sowie das SIGTERM-Verhalten — Windows stellt Kindprozessen kein
SIGTERM zu; belegt ist es dort nur durch die Unit-Tests in
`scripts/tests/http-adapter.test.js`.

## 8. Aufraeumen

```bash
docker rm -f business-leads-smoke
docker rmi business-leads-web:smoke
rm .env.container-smoke
```

## 8. Durchgeführt am 25.08.2026 (Hetzner 46.224.76.193)

Alle Proben aus §1–7 bestanden — Belege im Statusdokument §5E und im Agentenbericht der Session. Kernwerte: Image 355 MB non-root, /health/ready echt grün (Supabase 147 ms), SIGTERM-Drain 0.206 s Exit 0, fail-closed Exit 1. Basisimage-Digest seither im Dockerfile gepinnt.
