const test = require('node:test');
const assert = require('node:assert/strict');
const esbuild = require('esbuild');
const path = require('node:path');
const Module = require('node:module');

function loadAttributionModule() {
  const filePath = path.resolve(__dirname, '../../src/lib/attribution-shadow.js');
  const build = esbuild.buildSync({
    entryPoints: [filePath],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    write: false,
  });
  const loaded = new Module(filePath, module);
  loaded.filename = filePath;
  loaded.paths = Module._nodeModulePaths(path.dirname(filePath));
  loaded._compile(build.outputFiles[0].text, filePath);
  return loaded.exports;
}

const { buildAttributionCandidate, compareAttribution } = loadAttributionModule();

test('current URL attribution wins over stale stored attribution in the candidate', () => {
  const candidate = buildAttributionCandidate({
    search: '?utm_source=instagram&utm_medium=paid_social&utm_ad_id=222',
    stored: { utm_source: 'facebook', utm_medium: 'paid_social', utm_ad_id: '111' },
    currentUrl: 'https://business.activecenter.info/markus?utm_ad_id=222',
  });
  assert.equal(candidate.utm_source, 'instagram');
  assert.equal(candidate.utm_ad_id, '222');
});

test('stored attribution remains available when the current URL has no campaign data', () => {
  const candidate = buildAttributionCandidate({
    search: '',
    stored: { utm_source: 'facebook', utm_medium: 'paid_social', utm_campaign: 'phase-1' },
    currentUrl: 'https://business.activecenter.info/markus',
  });
  assert.equal(candidate.utm_source, 'facebook');
  assert.equal(candidate.utm_campaign, 'phase-1');
});

test('fbclid fallback is classified as paid social without changing explicit UTMs', () => {
  const fallback = buildAttributionCandidate({ search: '?fbclid=abc123' });
  assert.equal(fallback.utm_source, 'meta');
  assert.equal(fallback.utm_medium, 'paid_social');

  const explicit = buildAttributionCandidate({
    search: '?fbclid=abc123&utm_source=instagram&utm_medium=social',
  });
  assert.equal(explicit.utm_source, 'instagram');
  assert.equal(explicit.utm_medium, 'social');
});

test('comparison reports only attribution fields and never exposes click IDs', () => {
  const comparison = compareAttribution(
    { utm_source: 'facebook', fbclid: 'secret-a' },
    { utm_source: 'instagram', fbclid: 'secret-b' }
  );
  assert.equal(comparison.matches, false);
  assert.deepEqual(comparison.mismatchedFields, ['utm_source']);
  assert.equal(comparison.canonical.fbclid, undefined);
  assert.equal(comparison.candidate.fbclid, undefined);
  assert.equal(comparison.canonical.has_fbclid, true);
});
