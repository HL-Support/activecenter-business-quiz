const fs = require('fs');
const path = require('path');
const vm = require('vm');
const esbuild = require('esbuild');

const projectRoot = path.resolve(__dirname, '..');
const filesToSyntaxCheck = [
  path.join(projectRoot, 'src', 'app.entry.js'),
  path.join(projectRoot, 'src', 'app', 'bootstrap.js'),
  path.join(projectRoot, 'src', 'app', 'App.jsx'),
  path.join(projectRoot, 'src', 'lib', 'core.js'),
  path.join(projectRoot, 'src', 'lib', 'lead-event-queue.js'),
  path.join(projectRoot, 'build.js'),
  path.join(projectRoot, 'api', 'bridge.js'),
  path.join(projectRoot, 'server', 'lead-system.js'),
  path.join(projectRoot, 'api', 'lead-config.js'),
  path.join(projectRoot, 'api', 'lead-init.js'),
  path.join(projectRoot, 'api', 'lead-track.js'),
  path.join(projectRoot, 'api', 'lead-outbox-worker.js'),
  path.join(projectRoot, 'api', 'lead-system-health.js'),
  path.join(projectRoot, 'api', 'validate-email.js'),
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function runNodeCheck(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  try {
    esbuild.transformSync(fs.readFileSync(filePath, 'utf8'), {
      loader: path.extname(filePath) === '.jsx' ? 'jsx' : 'js',
      format: 'cjs',
      target: 'es2020',
    });
  } catch (error) {
    throw new Error(
      `Syntax check failed for ${path.relative(projectRoot, filePath)}\n${error.message}`,
      { cause: error }
    );
  }
}

function verifyTranslations() {
  const source = fs.readFileSync(path.join(projectRoot, 'translations.js'), 'utf8');
  const context = { window: {} };

  vm.createContext(context);
  vm.runInContext(source, context);

  const translations = context.window.TRANSLATIONS || {};
  const langs = ['de', 'it', 'fr', 'ru', 'en', 'hu'];
  const baseKeys = Object.keys(translations.de || {});

  assert(baseKeys.length > 0, 'translations.js: German base translation set is empty');
  assert(
    langs.every((lang) => Object.prototype.hasOwnProperty.call(translations, lang)),
    'translations.js: expected de/it/fr/ru/en/hu language sets'
  );

  for (const lang of langs) {
    const keys = Object.keys(translations[lang] || {});
    assert(keys.length === baseKeys.length, `translations.js: ${lang} key count mismatch`);

    for (const key of baseKeys) {
      assert(
        Object.prototype.hasOwnProperty.call(translations[lang], key),
        `translations.js: ${lang} missing key ${key}`
      );
    }

    assert(
      !String(translations[lang].video_btn_locked || '').includes('75'),
      `translations.js: ${lang} video_btn_locked must not contain the 75% instruction`
    );
  }
}

function verifyVideoConfig() {
  const source = fs.readFileSync(path.join(projectRoot, 'video-config.js'), 'utf8');
  const context = { window: {} };

  vm.createContext(context);
  vm.runInContext(source, context);

  const config = context.window.AC_VIDEO_CONFIG || {};
  const langs = ['de', 'it', 'fr', 'ru', 'en', 'hu'];

  assert(
    langs.every((lang) => Object.prototype.hasOwnProperty.call(config, lang)),
    'video-config.js: expected de/it/fr/ru/en/hu language sets'
  );

  for (const lang of langs) {
    const steps = config[lang] || {};
    ['1', '2', '3'].forEach((step) => {
      assert(steps[step], `video-config.js: ${lang} missing step ${step}`);
      assert(steps[step].id, `video-config.js: ${lang} step ${step} missing id`);
      assert(steps[step].lib, `video-config.js: ${lang} step ${step} missing lib`);
    });
  }
}

function verifyBuildOutput() {
  const distDir = path.join(projectRoot, 'dist');
  const requiredFiles = [
    path.join(distDir, 'index.html'),
    path.join(distDir, 'translations.js'),
    path.join(distDir, 'video-config.js'),
    path.join(distDir, 'assets', 'app.js'),
  ];

  for (const filePath of requiredFiles) {
    assert(
      fs.existsSync(filePath),
      `Missing build output: ${path.relative(projectRoot, filePath)}`
    );
  }

  const html = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8');
  assert(html.includes('/translations.js'), 'dist/index.html is missing translations.js');
  assert(html.includes('/video-config.js'), 'dist/index.html is missing video-config.js');
  assert(html.includes('/assets/app.js'), 'dist/index.html is missing assets/app.js');
  assert(
    !html.includes('/submit-lang-fix.js'),
    'dist/index.html still references submit-lang-fix.js'
  );
}

function verifyLanguageShell() {
  const html = fs.readFileSync(path.join(projectRoot, 'index.html'), 'utf8');
  assert(
    html.includes("['de','it','fr','ru','en','hu']"),
    'index.html must support de/it/fr/ru/en/hu'
  );
  assert(html.includes("getElementById('langFR')"), 'index.html must render FR switcher logic');
  assert(html.includes("getElementById('langRU')"), 'index.html must render RU switcher logic');
  assert(html.includes("getElementById('langEN')"), 'index.html must render EN switcher logic');
  assert(html.includes("getElementById('langHU')"), 'index.html must render HU switcher logic');
}

function verifyHashFlow() {
  const core = fs.readFileSync(path.join(projectRoot, 'src', 'lib', 'core.js'), 'utf8');
  const app = fs.readFileSync(path.join(projectRoot, 'src', 'app', 'App.jsx'), 'utf8');
  const apiBridge = fs.readFileSync(path.join(projectRoot, 'api', 'bridge.js'), 'utf8');
  const leadTrack = fs.readFileSync(path.join(projectRoot, 'api', 'lead-track.js'), 'utf8');
  const leadWorker = fs.readFileSync(
    path.join(projectRoot, 'api', 'lead-outbox-worker.js'),
    'utf8'
  );
  const leadHealth = fs.readFileSync(
    path.join(projectRoot, 'api', 'lead-system-health.js'),
    'utf8'
  );
  const leadInit = fs.readFileSync(path.join(projectRoot, 'api', 'lead-init.js'), 'utf8');
  const leadSql = fs.readFileSync(path.join(projectRoot, 'supabase-lead-system-v2.sql'), 'utf8');
  const tracker = fs.readFileSync(path.join(projectRoot, 'ac-track.js'), 'utf8');
  const readme = fs.readFileSync(path.join(projectRoot, 'README.md'), 'utf8');

  assert(
    core.includes("generateId('ac', 32)"),
    'core.js must generate ac_ tracking session hashes'
  );
  assert(core.includes("lead_hash: generateId('qz', 24)"), 'core.js must generate qz_ lead hashes');
  assert(
    core.includes('getLeadRunForSubmission'),
    'core.js must keep a dedicated submission lead-run helper'
  );
  assert(core.includes('lead_hash: hash'), 'core.js Typeform payload must include lead_hash');
  assert(
    core.includes('session_hash: sessionHash'),
    'core.js Typeform payload must include session_hash'
  );
  assert(
    core.includes('tracking_hash: sessionHash'),
    'core.js Typeform payload must include tracking_hash'
  );
  assert(
    core.includes('initializeLeadSystemV2') &&
      core.includes('/api/lead/init') &&
      core.includes('/api/lead-track'),
    'core.js must initialize and use lead system v2 endpoints'
  );
  assert(
    core.includes('createLeadEventQueue') &&
      core.includes('getLeadEventQueue().enqueue') &&
      !core.includes("fetch('/api/lead-track'"),
    'core.js must send lead events through the persistent queue, never fire-and-forget'
  );
  assert(
    /initializeQuizEnvironment[\s\S]{0,600}getLeadEventQueue\(\);/.test(core),
    'core.js must initialize the lead event queue at app start (offline-reload backlog drain)'
  );
  assert(
    core.includes('lead_system_v2_enabled') && app.includes('isLeadSystemV2Active'),
    'frontend must gate legacy tracking when lead system v2 is active'
  );
  assert(
    core.includes('main_aspiration: mainAspiration'),
    'core.js Typeform adapter payload must include main_aspiration'
  );
  assert(
    core.includes('main_aspiration_label: mainAspirationLabel'),
    'core.js Typeform adapter payload must include main_aspiration_label'
  );
  assert(app.includes("e('fr', 'FR')"), 'App.jsx must expose the FR language switcher');
  assert(app.includes("e('ru', 'RU')"), 'App.jsx must expose the RU language switcher');
  assert(app.includes("e('hu', 'HU')"), 'App.jsx must expose the HU language switcher');
  assert(
    apiBridge.includes('buildBusinessTypeformPayload'),
    'api/bridge.js must keep the local Typeform adapter builder'
  );
  assert(
    apiBridge.includes("ref: 'lead_main_aspiration'"),
    'api/bridge.js Typeform builder must include lead_main_aspiration'
  );
  assert(
    apiBridge.includes("action: 'forward_webhook'"),
    'api/bridge.js must forward built Typeform payload through forward_webhook'
  );
  assert(
    apiBridge.includes('usesLeadSystemV2') &&
      apiBridge.includes('lead_system_v2_enabled') &&
      apiBridge.includes('!usesLeadSystemV2'),
    'api/bridge.js must skip legacy resume/initial points writes for lead system v2'
  );
  assert(
    /queued: true,\s*\n\s*email_sent: false,[\s\S]{0,250}canonical_outbox_handles_hot_lead/.test(
      apiBridge
    ),
    'bridge canonical notify path must report queued:true, never a delivery it cannot know'
  );
  assert(
    app.includes('data.queued === true || data.email_sent === true'),
    'App.jsx must accept the honest queued ack for the notify-sent marker'
  );
  assert(
    leadInit.includes("supabaseRpc('init_lead'") &&
      leadTrack.includes("supabaseRpc('upsert_video_progress_monotonic'") &&
      leadTrack.includes("supabaseRpc('enqueue_lead_sync'") &&
      leadWorker.includes("supabaseRpc('claim_outbox_jobs'") &&
      leadWorker.includes("supabaseRpc('mark_outbox_done'") &&
      leadWorker.includes("supabaseRpc('mark_outbox_failed'"),
    'lead v2 API must use Supabase RPCs for init, video progress, and outbox'
  );
  assert(
    leadHealth.includes('lead_sync_outbox?status=eq.dead') &&
      leadHealth.includes('outbox_processing_stale') &&
      leadHealth.includes('migration_unresolved_open') &&
      leadHealth.includes('sendAlertEmail') &&
      leadHealth.includes('lead_system_health_last_alert'),
    'lead system health endpoint must monitor outbox failures and dedupe alerts'
  );
  assert(
    !leadHealth.includes('count=exact') &&
      leadHealth.includes('boundedCount') &&
      leadHealth.includes('count_caps') &&
      leadHealth.includes('recent_events_1h_available'),
    'lead system health endpoint must use disclosed bounded counts instead of exact full-table counts'
  );
  assert(
    leadHealth.includes('outbox_parked') && leadHealth.includes('OUTBOX_PARKED_THRESHOLD_MS'),
    'lead system health endpoint must report deliberately parked outbox jobs separately'
  );
  assert(
    leadSql.includes('WITH (security_invoker = true)') &&
      leadSql.includes('max_attempts    int DEFAULT 5') &&
      leadSql.includes('FOR UPDATE SKIP LOCKED') &&
      leadSql.includes('stale_lock_timeout') &&
      leadSql.includes('CREATE OR REPLACE FUNCTION public.mark_outbox_done') &&
      leadSql.includes('CREATE OR REPLACE FUNCTION public.mark_outbox_failed') &&
      leadSql.includes('CREATE TABLE IF NOT EXISTS public.app_config'),
    'lead v2 SQL must include Supabase security/performance safeguards'
  );
  assert(
    core.includes('storage.removeItem(LEGACY_QUIZ_HASH_KEY)'),
    'core.js must remove legacy global acQuizHash'
  );
  assert(
    tracker.includes('persistSession(data.session_hash, memberId, slug)'),
    'ac-track.js must persist tracking sessions with slug context'
  );
  assert(
    readme.includes('`translations.js` ist die einzige kanonische Uebersetzungsdatei') &&
      readme.includes('`fr`') &&
      readme.includes('`ru`'),
    'README.md must document 5 languages'
  );
  assert(readme.includes('lead_hash'), 'README.md must document lead_hash');
  assert(readme.includes('session_hash'), 'README.md must document session_hash');
  assert(readme.includes('main_aspiration'), 'README.md must document main_aspiration');
}

function verifyRemovedRuntimeSurface() {
  // Audit 2026-08-23, 13.2.1: Die DB-Init-Route hatte ein Default-Secret und einen
  // Host-Header-Bypass und darf nicht wieder in die deploybare Runtime gelangen.
  assert(
    !fs.existsSync(path.join(projectRoot, 'api', 'init-quiz-db.js')),
    'api/init-quiz-db.js must stay removed; run migrations via a controlled CLI/CI path'
  );
}

function verifyApiHardening() {
  // P0-3: Drei Eigenschaften, die nicht still zurueckfallen duerfen.
  const leadTrack = fs.readFileSync(path.join(projectRoot, 'api', 'lead-track.js'), 'utf8');

  assert(
    leadTrack.includes('ALLOWED_EVENTS'),
    'api/lead-track.js must keep the ALLOWED_EVENTS allowlist at the HTTP boundary'
  );
  assert(
    leadTrack.includes('event_not_allowed'),
    'api/lead-track.js must reject unknown events with event_not_allowed (400 = permanent in the client queue)'
  );

  // P0-4: Das Gate gilt fuer beide Runtime-Verzeichnisse. server/lead-system.js setzt die
  // CORS-Header fuer saemtliche lead-Routen - ein Wildcard dort wirkt breiter als in api/.
  const wildcardCors = ['api', 'server'].flatMap((dirName) => {
    const dirPath = path.join(projectRoot, dirName);
    if (!fs.existsSync(dirPath)) return [];
    return fs
      .readdirSync(dirPath, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
      .filter((entry) =>
        fs
          .readFileSync(path.join(dirPath, entry.name), 'utf8')
          .includes("Access-Control-Allow-Origin', '*'")
      )
      .map((entry) => `${dirName}/${entry.name}`);
  });

  assert(
    wildcardCors.length === 0,
    `Wildcard CORS is not allowed in api/ or server/: ${wildcardCors.join(', ')}`
  );

  const leadSystem = fs.readFileSync(path.join(projectRoot, 'server', 'lead-system.js'), 'utf8');
  assert(
    leadSystem.includes('function allowedCorsOrigin') &&
      leadSystem.includes('PREVIEW_ORIGIN_SUFFIX') &&
      leadSystem.includes('const allowedOrigin = allowedCorsOrigin(req?.headers?.origin);'),
    'server/lead-system.js must keep the canonical CORS allowlist and use it in handleOptions'
  );

  // P0-4 (Audit 4.5): Der Beobachtungsmodus und der Enforcement-Schalter fuer die
  // Nicht-Browser-Actions duerfen nicht still aus der Bridge verschwinden.
  const apiBridge = fs.readFileSync(path.join(projectRoot, 'api', 'bridge.js'), 'utf8');
  assert(
    apiBridge.includes('SERVICE_AUTH_ACTIONS') &&
      apiBridge.includes('resolveServiceAuthState') &&
      apiBridge.includes('[bridge-auth-observe]'),
    'api/bridge.js must keep the service auth observation for resume/metric actions'
  );
  // Bewusst die exakten Literale: 'includes' auf den blossen Namen wuerde auch bei einem
  // umbenannten Fehlercode ('service_auth_required_v2') noch gruen bleiben.
  assert(
    apiBridge.includes("error: 'service_auth_required'") &&
      apiBridge.includes("process.env.BRIDGE_SERVICE_AUTH_ENFORCE === '1'"),
    'api/bridge.js must keep the BRIDGE_SERVICE_AUTH_ENFORCE gate with service_auth_required'
  );
}

function main() {
  for (const filePath of filesToSyntaxCheck) {
    runNodeCheck(filePath);
  }

  verifyRemovedRuntimeSurface();
  verifyApiHardening();

  verifyTranslations();
  verifyVideoConfig();
  verifyBuildOutput();
  verifyLanguageShell();
  verifyHashFlow();

  console.log('Verification passed');
}

main();
