/**
 * Startpunkt der portablen Runtime (Audit 2026-08-23, §7 P0-5, Phase 3).
 *
 *   node server/app-server.js      (bzw. `pnpm run start:server`)
 *
 * Der Prozess ist bewusst duenn: Env pruefen, Handler vorladen, Server binden, Signale
 * behandeln. Die gesamte Routenlogik liegt in server/http-adapter.js, die Fachlogik
 * unveraendert in api/ und server/lead-system.js.
 *
 * Fail-closed: Fehlt eine Pflichtvariable, startet der Prozess GAR NICHT. Ein Container,
 * der ohne SUPABASE_URL hochkommt und dann pro Request 500er liefert, ist schlechter als
 * einer, der nie "healthy" meldet - Coolify haelt in dem Fall das alte Deployment.
 */
'use strict';

const http = require('http');
const path = require('path');

const {
  REQUEST_TIMEOUT_MS,
  SHUTDOWN_GRACE_MS,
  createApiRegistry,
  createApp,
  createShutdownController,
  resolveCommit,
  resolveImageRef,
  validateEnv,
} = require('./http-adapter');

const PORT = Number(process.env.PORT || 3000);
// 0.0.0.0 ist im Container Pflicht: an 127.0.0.1 gebunden kaeme Traefik nicht heran.
const HOST = String(process.env.HOST || '0.0.0.0');

/** Eine Zeile JSON pro Ereignis - direkt in `docker logs` bzw. den Coolify-Logviewer. */
function log(entry) {
  const line = { ts: new Date().toISOString(), level: 'info', ...entry };
  const text = JSON.stringify(line);
  if (line.level === 'error') console.error(text);
  else console.log(text);
}

async function main() {
  const envCheck = validateEnv(process.env);
  if (!envCheck.ok) {
    log({
      level: 'error',
      msg: 'startup_aborted',
      reason: 'missing_required_env',
      missing: envCheck.missing,
    });
    process.exit(1);
    return;
  }

  const registry = createApiRegistry(path.join(__dirname, '..', 'api'));

  // Alle Handler einmal laden, bevor der Port offen ist. Ein Syntax-/Importfehler faellt so
  // beim Deploy auf und nicht erst beim ersten echten Lead.
  const moduleNames = registry.listModuleNames();
  for (const moduleName of moduleNames) {
    await registry.resolve(moduleName);
  }
  log({ msg: 'api_handlers_loaded', count: moduleNames.length, routes: moduleNames });

  let shutdownController = null;
  const app = createApp({
    registry,
    log,
    isShuttingDown: () => Boolean(shutdownController && shutdownController.isShuttingDown()),
  });

  const server = http.createServer((req, res) => {
    if (shutdownController) shutdownController.track(res);
    app(req, res);
  });

  // requestTimeout deckt das Einlesen des Requests ab, der Watchdog im Adapter die
  // Bearbeitung. headersTimeout muss unter requestTimeout liegen, keepAliveTimeout ueber
  // dem Idle-Timeout des Proxys, sonst schliesst der Server einen Socket, den Traefik
  // gerade wiederverwenden will.
  server.requestTimeout = REQUEST_TIMEOUT_MS;
  server.headersTimeout = 20_000;
  server.keepAliveTimeout = 65_000;

  shutdownController = createShutdownController({
    server,
    graceMs: SHUTDOWN_GRACE_MS,
    log,
    exit: (code) => process.exit(code),
  });

  for (const signal of ['SIGTERM', 'SIGINT']) {
    process.on(signal, () => {
      shutdownController.shutdown(signal).catch((error) => {
        log({ level: 'error', msg: 'shutdown_failed', error: String(error.message || error) });
        process.exit(1);
      });
    });
  }

  process.on('unhandledRejection', (reason) => {
    log({ level: 'error', msg: 'unhandled_rejection', error: String((reason && reason.message) || reason) });
  });

  server.listen(PORT, HOST, () => {
    // Dieselbe Aufloesung wie /health/live - Startzeile und Endpunkt koennen sich damit
    // nicht widersprechen, wenn beim Cutover beide zum Beweis herangezogen werden.
    const { commit, commit_source: commitSource } = resolveCommit();
    log({
      msg: 'server_listening',
      host: HOST,
      port: PORT,
      node: process.version,
      commit,
      commit_source: commitSource,
      image: resolveImageRef(),
    });
  });
}

main().catch((error) => {
  log({ level: 'error', msg: 'startup_failed', error: String(error.stack || error) });
  process.exit(1);
});
