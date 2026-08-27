# Deployment Workflow

Stand: 27.08.2026 · Produktion läuft seit dem Cutover (25.08.) auf **Coolify**, nicht mehr
auf Vercel. Die alte Preview→Promote-Anleitung steht unten als Rückweg-Wissen.

## Produktion (Coolify)

| | |
| --- | --- |
| Server | `167.233.251.217` (coolify-app-nbg1) |
| App | `business-leads-prod`, UUID `yhoacszoiofuq6dg4mykyr7b`, Build: Dockerfile |
| Domains | `quiz.activecenter.info`, `business.activecenter.info`, `business.eaglesfit.ch` |
| Nachweis | `GET /health/live` → `commit` (Quelle `SOURCE_COMMIT`) |

## Deploy-Pipeline Stufe 1 (seit 27.08.): CI deployt nach grünen Gates

Der **rohe Git-Webhook bleibt aus** (er würde ungeprüft bauen). Stattdessen deployt der
CI-Job `deploy` in `.github/workflows/activecenter-safety.yml`:

- nur bei Push auf `main` (Branch Protection erzwingt davor grüne PR-Checks),
- nur **nach** grünen Jobs `safety` und `e2e-queue` im selben Lauf,
- nur wenn **Runtime-Dateien** betroffen sind (`api/`, `server/`, `src/`, `fonts/`,
  `Dockerfile`, `index.html`, `berater-info.html`, `translations.js`, `video-config.js`,
  `ac-track.js`, `build.js`, `package.json`, `pnpm-lock.yaml`) — reine `docs/`- oder
  `scripts/`-Merges deployen nicht,
- und er **beweist** den Deploy: `/health/live` muss innerhalb von 10 Minuten den
  gemergten Commit tragen, sonst ist der Lauf rot.

Zugang: GitHub-Actions-Secret `COOLIFY_API_TOKEN` (gesetzt 27.08.; bei Gelegenheit durch
einen nur-Deploy-berechtigten Token ersetzen). Ein roter `deploy`-Job heisst: Produktion
läuft nachweislich auf dem alten Stand — Ursache im Actions-Log, Fallback unten.

**Stufe 2 (offen, Audit 13.5.6):** Digest-Promotion — Produktion übernimmt exakt das in
Preview getestete Image statt aus demselben Commit neu zu bauen; dazu Preview-App. Kommt
mit der Hetzner-Zielpipeline.

## Fallback: manueller Deploy

Wenn die CI nicht verfügbar ist oder ein Deploy ohne Merge nötig wird:

```bash
# Token: agent-secrets → coolify.apiToken; Basis: https://coolify.hl-support.biz/api/v1
curl -X POST -H "Authorization: Bearer <token>" \
  "https://coolify.hl-support.biz/api/v1/deploy?uuid=yhoacszoiofuq6dg4mykyr7b"
```

Alternativ über die Coolify-Oberfläche (App → Deploy). Nachweis immer über
`/health/live` — **mehrfach über Zeit**, eine Messung ist kein Beweis. Deploys sind
ausfallfrei (Rolling mit Healthcheck, am 25.08. gemessen); eine Router-Umkonfiguration
(Domain-Änderung) ist davon ausgenommen.

## Was sonst noch Kopien hat (nach einem Merge prüfen)

- **Nurture-Wächter**: läuft als Dateikopie auf `167.233.251.217:/opt/waechter-nurture/`,
  nicht aus dem Repo. Update-Weg: [docs/NURTURE_BETRIEB.md](docs/NURTURE_BETRIEB.md) §4.
- **n8n-Workflows**: nur über die API ändern (RAM-Cache), Skill `n8n-workflow-update`.

## Vercel (Rückweg bis zum Abbau)

Vercel bleibt bis zum freigegebenen Abbau (frühestens 02.09., Checkliste
[docs/audits/cutover-vorbereitung/vercel-abbau-checkliste.md](docs/audits/cutover-vorbereitung/vercel-abbau-checkliste.md))
vollständig lauffähig als Hosting-Rückweg; der DNS-unabhängige Eingang
`businessleadsquiz.vercel.app` liefert weiter den Vercel-Stand. Der alte Weg dorthin:

1. `npm run deploy:preview` (Build + Verify + Preview; Preview-URLs sind SSO-geschützt).
2. `npm run promote:prod -- <preview-url>` — der Guard verlangt sauberen Tree, Branch
   `main`, `HEAD == origin/main`.
3. Nie direkt `npx vercel deploy --prod`.

🔴 Ein Vercel-Deploy wirft die **Vercel**-Seite auf neuen Stand — die Produktion an den
Domains bedient aber Coolify. Für den echten Rückweg gehört DNS zurückgestellt
(Rückrolldaten in `docs/audits/cutover-vorbereitung/rueckrolldaten/`).
