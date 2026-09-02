/**
 * AP1 Scroll-Verhalten (docs/plans/2026-09-01-optin-zu-video-conversion.md).
 *
 * Befund aus der Code-Analyse: Die Step-Uebergaenge toggeln nur Opacity, es gibt
 * keinen Scroll-Reset. Wer das Optin unten absendet, landet auf der Ergebnisseite
 * mitten im Text; wer unten "Teil 1 starten" klickt, landet auf der Videoseite
 * UNTER dem Player am gesperrten Weiter-Button.
 *
 * Dieser Test misst genau das: Vor dem Fix dokumentiert er den Befund (rote
 * Assertions + Messwerte im Log), mit dem Fix ist er die Regression-Wache.
 *
 * Optin-Submit und E-Mail-Pruefung laufen gegen den Harness-Stub
 * (faults.stubOptin): kein Lead im Backend, keine Mail. Nur lead-track-Events
 * laufen als markierter Testtraffic (?test=1) gegen die echte API — wie in der
 * uebrigen E2E-Suite.
 *
 * Aufruf: pnpm run e2e:scroll  (setzt einen frischen Build in dist/ voraus)
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const { startHarness, launchBrowser, driveQuizToOptin, fillOptin } = require('./lib.js');

const VIEWPORTS = [
  { name: 'mobil', viewport: { width: 390, height: 844 } },
  { name: 'desktop', viewport: { width: 1280, height: 900 } },
];

for (const { name, viewport } of VIEWPORTS) {
  test(`Scroll-Reset (${name}): Ergebnis oben, Player im Viewport`, async (t) => {
    const harness = await startHarness();
    harness.faults.stubOptin = true;
    const browser = await launchBrowser();
    const context = await browser.newContext({ viewport, locale: 'de-DE' });
    const page = await context.newPage();

    t.after(async () => {
      try {
        const fs = require('node:fs');
        fs.mkdirSync('e2e-artifacts', { recursive: true });
        await page
          .screenshot({ path: `e2e-artifacts/scroll-${name}-last-state.png` })
          .catch(() => {});
      } catch {
        /* Artefakte sind best effort */
      }
      await browser.close();
      await harness.close();
    });

    await driveQuizToOptin(page, harness.baseUrl);

    // ---------- Uebergang Optin -> Ergebnis ----------
    const submit = await fillOptin(page);
    const scrollBeforeSubmit = await page.evaluate(() => window.scrollY);
    await submit.click();

    // Ergebnisseite abwarten (Stub antwortet sofort, Fade dauert 350 ms).
    await page
      .locator('button', { hasText: /Teil 1 starten|Video ansehen/ })
      .first()
      .waitFor({ state: 'visible', timeout: 15000 });
    await page.waitForTimeout(600);

    const scrollOnResult = await page.evaluate(() => window.scrollY);
    console.log(
      `[scroll-${name}] vor Submit: ${scrollBeforeSubmit}px, auf Ergebnisseite: ${scrollOnResult}px`
    );
    assert.equal(
      scrollOnResult,
      0,
      `Ergebnisseite muss oben starten (gemessen: ${scrollOnResult}px, vor Submit: ${scrollBeforeSubmit}px)`
    );

    // ---------- Uebergang Ergebnis -> Videos ----------
    // Zum CTA ganz unten scrollen, wie es der echte Nutzer tut.
    const cta = page.locator('button', { hasText: /Teil 1 starten|Video ansehen/ }).last();
    await cta.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    const scrollBeforeCta = await page.evaluate(() => window.scrollY);
    await cta.click();

    await page
      .locator('iframe[src*="mediadelivery.net"]')
      .first()
      .waitFor({ state: 'attached', timeout: 15000 });
    await page.waitForTimeout(600);

    const measured = await page.evaluate(() => {
      const frame = document.querySelector('iframe[src*="mediadelivery.net"]');
      const rect = frame ? frame.getBoundingClientRect() : null;
      return {
        scrollY: window.scrollY,
        playerTop: rect ? Math.round(rect.top) : null,
        playerBottom: rect ? Math.round(rect.bottom) : null,
        viewportHeight: window.innerHeight,
      };
    });
    console.log(
      `[scroll-${name}] vor CTA-Klick: ${scrollBeforeCta}px, Videoseite: scrollY=${measured.scrollY}px, playerTop=${measured.playerTop}px (Viewport ${measured.viewportHeight}px)`
    );

    assert.equal(
      measured.scrollY,
      0,
      `Videoseite muss oben starten (gemessen: ${measured.scrollY}px, vor CTA-Klick: ${scrollBeforeCta}px)`
    );
    assert.ok(
      measured.playerTop !== null &&
        measured.playerTop >= 0 &&
        measured.playerTop < measured.viewportHeight,
      `Player muss ohne Scrollen sichtbar sein (playerTop=${measured.playerTop}px bei ${measured.viewportHeight}px Viewport)`
    );
  });
}
