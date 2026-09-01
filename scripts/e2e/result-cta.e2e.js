/**
 * AP2/AP6 Ergebnisseite (docs/plans/2026-09-01-optin-zu-video-conversion.md):
 *  - Der Video-CTA ist ab Sekunde 1 als Sticky-Footer sichtbar.
 *  - Am Seitenende dockt er an seiner natuerlichen Position an (kein Doppel-Button).
 *  - Beide Zustaende fuehren per Klick zu den Videos und feuern result_cta_click.
 *  - Der Mount der Ergebnisseite feuert result_viewed (Messluecke aus dem Plan).
 *
 * Optin-Submit laeuft gegen den Harness-Stub (kein Lead, keine Mail); die
 * lead-track-Events laufen als markierter Testtraffic (?test=1) zur echten API
 * und werden ueber das Harness-Log bewiesen.
 *
 * Aufruf: pnpm run e2e:result  (setzt einen frischen Build in dist/ voraus)
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  startHarness,
  launchBrowser,
  driveQuizToOptin,
  fillOptin,
  waitForQueueEmpty,
  readDeadLetters,
} = require('./lib.js');

const CTA_PATTERN = /Video ansehen/;
const VIEWPORT = { width: 390, height: 844 };

function trackedEvents(harness) {
  return harness.apiLog
    .filter((entry) => entry.path === '/api/lead-track' && entry.status === 200)
    .map((entry) => {
      try {
        return JSON.parse(entry.request).event_name || '';
      } catch {
        return '';
      }
    });
}

async function ctaState(page) {
  return page.evaluate((pattern) => {
    const matcher = new RegExp(pattern);
    const buttons = Array.from(document.querySelectorAll('button')).filter((candidate) =>
      matcher.test((candidate.innerText || '').trim())
    );
    const button = buttons[0] || null;
    let fixed = false;
    for (let node = button; node; node = node.parentElement) {
      if (window.getComputedStyle(node).position === 'fixed') fixed = true;
    }
    const rect = button ? button.getBoundingClientRect() : null;
    return {
      count: buttons.length,
      fixed,
      top: rect ? Math.round(rect.top) : null,
      bottom: rect ? Math.round(rect.bottom) : null,
      viewportHeight: window.innerHeight,
      scrollY: window.scrollY,
    };
  }, CTA_PATTERN.source);
}

async function driveToResult(page, baseUrl) {
  await driveQuizToOptin(page, baseUrl);
  const submit = await fillOptin(page);
  await submit.click();
  await page
    .locator('button', { hasText: CTA_PATTERN })
    .first()
    .waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForTimeout(600);
}

test('Ergebnis-CTA: Sticky ab Sekunde 1, dockt am Seitenende an, beide Wege tracken', async (t) => {
  const harness = await startHarness();
  harness.faults.stubOptin = true;
  const browser = await launchBrowser();
  const context = await browser.newContext({ viewport: VIEWPORT, locale: 'de-DE' });
  const page = await context.newPage();

  t.after(async () => {
    try {
      const fs = require('node:fs');
      fs.mkdirSync('e2e-artifacts', { recursive: true });
      await page.screenshot({ path: 'e2e-artifacts/result-cta-last-state.png' }).catch(() => {});
      fs.writeFileSync(
        'e2e-artifacts/result-cta-api-log.json',
        JSON.stringify(harness.apiLog, null, 2)
      );
    } catch {
      /* Artefakte sind best effort */
    }
    await browser.close();
    await harness.close();
  });

  await driveToResult(page, harness.baseUrl);
  await page.screenshot({ path: 'e2e-artifacts/result-sticky-mobil.png' }).catch(() => {});

  // ---------- Sticky ab Sekunde 1, ohne Doppel-Button ----------
  const sticky = await ctaState(page);
  assert.equal(sticky.count, 1, `genau ein CTA erwartet, habe ${sticky.count}`);
  assert.equal(sticky.fixed, true, 'CTA muss beim Laden als Sticky-Footer schweben');
  assert.ok(
    sticky.bottom !== null && sticky.bottom <= sticky.viewportHeight && sticky.top > 0,
    `Sticky-CTA muss im Viewport liegen (top=${sticky.top}, bottom=${sticky.bottom}, viewport=${sticky.viewportHeight})`
  );

  // ---------- Am Seitenende andocken ----------
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(600);
  const docked = await ctaState(page);
  assert.equal(docked.count, 1, `nach dem Andocken genau ein CTA erwartet, habe ${docked.count}`);
  assert.equal(docked.fixed, false, 'am Seitenende muss der CTA angedockt sein (nicht mehr fixed)');
  await page.screenshot({ path: 'e2e-artifacts/result-docked-mobil.png' }).catch(() => {});

  // ---------- Klick auf den angedockten Button -> Videos ----------
  await page.locator('button', { hasText: CTA_PATTERN }).first().click();
  await page
    .locator('iframe[src*="mediadelivery.net"]')
    .first()
    .waitFor({ state: 'attached', timeout: 15000 });

  const remaining = await waitForQueueEmpty(page, 90000);
  assert.equal(remaining, 0, `Event-Queue muss leerlaufen (noch ${remaining} Eintraege)`);
  let events = trackedEvents(harness);
  // result_viewed: hier zaehlt das SENDEN (Client-Verhalten). Die Annahme prueft
  // der Unit-Test gegen api/lead-track.js; die Produktions-API antwortet bis zum
  // Deploy der erweiterten Allowlist noch mit 400 event_not_allowed - das Event
  // landet dann nachweisbar im Dead-Letter.
  const deadLetters = await readDeadLetters(page);
  const resultViewedSent =
    harness.apiLog.some(
      (entry) =>
        entry.path === '/api/lead-track' &&
        typeof entry.request === 'string' &&
        entry.request.includes('"event_name":"result_viewed"')
    ) || deadLetters.some((entry) => entry.event_name === 'result_viewed');
  assert.ok(
    resultViewedSent,
    `result_viewed muss beim Mount der Ergebnisseite gesendet werden (bestaetigt kamen: ${events.join(',')})`
  );
  assert.ok(
    events.includes('result_cta_click'),
    'Klick auf den angedockten CTA muss result_cta_click feuern'
  );

  // ---------- Zweiter Lauf: Klick auf den schwebenden Sticky ----------
  const stickyClicksBefore = events.filter((name) => name === 'result_cta_click').length;
  await page.evaluate(() => localStorage.clear());
  await driveToResult(page, harness.baseUrl);
  const stickyAgain = await ctaState(page);
  assert.equal(stickyAgain.fixed, true, 'zweiter Lauf: CTA muss wieder als Sticky starten');
  await page.locator('button', { hasText: CTA_PATTERN }).first().click();
  await page
    .locator('iframe[src*="mediadelivery.net"]')
    .first()
    .waitFor({ state: 'attached', timeout: 15000 });

  await waitForQueueEmpty(page, 90000);
  events = trackedEvents(harness);
  const stickyClicksAfter = events.filter((name) => name === 'result_cta_click').length;
  assert.ok(
    stickyClicksAfter > stickyClicksBefore,
    'Klick auf den schwebenden Sticky muss ebenfalls result_cta_click feuern'
  );
});
