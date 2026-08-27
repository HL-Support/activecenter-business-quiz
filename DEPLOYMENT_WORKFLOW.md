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

## 🔴 Merge auf main deployt NICHT

Der Git-Webhook/Auto-Deploy ist **bewusst deaktiviert**, bis die Deploy-Pipeline aus dem
Audit steht (13.3.3/13.5.6: Digest-Promotion, Preview-App, **CI-Gates vor dem Webhook**).
Beleg: alle Deployments seit dem Cutover tragen `webhook=false`. Ein alter Stand in
Produktion ist deshalb **kein Ausfall-Indiz**, sondern der Normalzustand nach einem Merge.

## Ablauf für einen Produktions-Deploy

1. PR gegen `main`; die Pflicht-Checks (`safety`, `e2e-queue`) müssen grün sein.
   Branch Protection erzwingt das — direkte Pushes auf `main` ohne grüne Checks gibt es
   nicht.
2. Nach dem Merge den Deploy **bewusst anstossen** (nur nötig, wenn Runtime-Code betroffen
   ist: `api/`, `server/`, `src/`, `index.html`, `translations.js`, `video-config.js`,
   `Dockerfile`; reine `docs/`- oder `scripts/`-Merges brauchen keinen Deploy):

   ```bash
   # Token: agent-secrets → coolify.apiToken; Basis: https://coolify.hl-support.biz/api/v1
   curl -X POST -H "Authorization: Bearer <token>" \
     "https://coolify.hl-support.biz/api/v1/deploy?uuid=yhoacszoiofuq6dg4mykyr7b"
   ```

   Alternativ über die Coolify-Oberfläche (App → Deploy).
3. Nachweis führen — **mehrfach über Zeit**, eine Messung ist kein Beweis:

   ```bash
   curl -s https://quiz.activecenter.info/health/live   # commit == gemergter SHA?
   ```

   Deploys sind ausfallfrei (Rolling mit Healthcheck, am 25.08. gemessen); eine
   Router-Umkonfiguration (Domain-Änderung) ist davon ausgenommen.

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
