const fs = require('fs');
const path = require('path');
const vm = require('vm');
const esbuild = require('esbuild');
const { spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const filesToSyntaxCheck = [
  path.join(projectRoot, 'src', 'app.entry.js'),
  path.join(projectRoot, 'src', 'app', 'bootstrap.js'),
  path.join(projectRoot, 'src', 'app', 'App.jsx'),
  path.join(projectRoot, 'src', 'lib', 'core.js'),
  path.join(projectRoot, 'build.js'),
  path.join(projectRoot, 'api', 'bridge.js'),
  path.join(projectRoot, 'api', 'validate-email.js'),
  path.join(projectRoot, 'api', 'init-quiz-db.js'),
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

  if (path.extname(filePath) === '.jsx') {
    try {
      esbuild.transformSync(fs.readFileSync(filePath, 'utf8'), {
        loader: 'jsx',
        format: 'esm',
        target: 'es2020',
      });
      return;
    } catch (error) {
      throw new Error(
        `Syntax check failed for ${path.relative(projectRoot, filePath)}\n${error.message}`,
        { cause: error }
      );
    }
  }

  const result = spawnSync(process.execPath, ['--check', filePath], {
    cwd: projectRoot,
    stdio: 'pipe',
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    throw new Error(
      `Syntax check failed for ${path.relative(projectRoot, filePath)}\n${result.stderr || result.stdout}`
    );
  }
}

function verifyTranslations() {
  const source = fs.readFileSync(path.join(projectRoot, 'translations.js'), 'utf8');
  const context = { window: {} };

  vm.createContext(context);
  vm.runInContext(source, context);

  const translations = context.window.TRANSLATIONS || {};
  const langs = ['de', 'it', 'fr', 'ru', 'en'];
  const baseKeys = Object.keys(translations.de || {});

  assert(baseKeys.length > 0, 'translations.js: German base translation set is empty');
  assert(
    langs.every((lang) => Object.prototype.hasOwnProperty.call(translations, lang)),
    'translations.js: expected de/it/fr/ru/en language sets'
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
  const langs = ['de', 'it', 'fr', 'ru', 'en'];

  assert(
    langs.every((lang) => Object.prototype.hasOwnProperty.call(config, lang)),
    'video-config.js: expected de/it/fr/ru/en language sets'
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
  assert(html.includes("['de','it','fr','ru','en']"), 'index.html must support de/it/fr/ru/en');
  assert(html.includes("getElementById('langFR')"), 'index.html must render FR switcher logic');
  assert(html.includes("getElementById('langRU')"), 'index.html must render RU switcher logic');
  assert(html.includes("getElementById('langEN')"), 'index.html must render EN switcher logic');
}

function verifyHashFlow() {
  const core = fs.readFileSync(path.join(projectRoot, 'src', 'lib', 'core.js'), 'utf8');
  const app = fs.readFileSync(path.join(projectRoot, 'src', 'app', 'App.jsx'), 'utf8');
  const apiBridge = fs.readFileSync(path.join(projectRoot, 'api', 'bridge.js'), 'utf8');
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
    core.includes('main_aspiration: mainAspiration'),
    'core.js Typeform adapter payload must include main_aspiration'
  );
  assert(
    core.includes('main_aspiration_label: mainAspirationLabel'),
    'core.js Typeform adapter payload must include main_aspiration_label'
  );
  assert(app.includes("e('fr', 'FR')"), 'App.jsx must expose the FR language switcher');
  assert(app.includes("e('ru', 'RU')"), 'App.jsx must expose the RU language switcher');
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

function main() {
  for (const filePath of filesToSyntaxCheck) {
    runNodeCheck(filePath);
  }

  verifyTranslations();
  verifyVideoConfig();
  verifyBuildOutput();
  verifyLanguageShell();
  verifyHashFlow();

  console.log('Verification passed');
}

main();
