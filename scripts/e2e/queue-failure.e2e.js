/**
 * E2E-Fehlerfall-Suite fuer die persistente Lead-Event-Queue (Audit P0-6).
 *
 * Szenarien gegen den frisch gebauten Client + echte Produktions-API:
 *  1. Totalausfall von /api/lead-track -> Events sammeln sich persistent in der Queue
 *  2. Reload mit kaputtem /api/lead-init -> vollstaendige FIFO-Nachlieferung mit
 *     identischen event_uid-Werten (Server-Idempotenz-Anker), Queue leer, 0 Dead-Letters
 *  3. Transiente 500er -> Retry mit Backoff bis zur Zustellung, keine Dead-Letters
 *
 * Aufruf: pnpm run e2e:queue  (setzt einen frischen Build in dist/ voraus)
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  startHarness,
  launchBrowser,
  driveQuiz,
  readQueue,
  readDeadLetters,
  waitForQueueEmpty,
} = require('./lib.js');

test('Queue uebersteht Totalausfall, Reload und transiente 500er ohne Eventverlust', async (t) => {
  const harness = await startHarness();
  const browser = await launchBrowser();
  const context = await browser.newContext({ viewport: { width: 480, height: 900 } });
  const page = await context.newPage();

  t.after(async () => {
    await browser.close();
    await harness.close();
  });

  // ---------- Szenario 1: Totalausfall ----------
  harness.faults.leadTrack.mode = 'refuse';
  await driveQuiz(page, harness.baseUrl, 2);

  const queuedDuringOutage = await readQueue(page);
  assert.ok(
    queuedDuringOutage.length >= 3,
    `mindestens page_view + question_viewed + quiz_answer erwartet, habe ${queuedDuringOutage.length}`
  );
  for (const entry of queuedDuringOutage) {
    assert.equal(entry.payload.event_uid, entry.uid, 'payload.event_uid muss der Queue-UID entsprechen');
  }
  const outageUids = queuedDuringOutage.map((entry) => entry.uid);
  const outageOrder = queuedDuringOutage.map((entry) => entry.event_name);
  assert.equal(outageOrder[0], 'page_view', 'FIFO: page_view muss Kopf der Queue sein');

  // ---------- Szenario 2: Reload mit kaputtem lead-init ----------
  harness.faults.leadTrack.mode = 'off';
  harness.faults.leadInit.mode = 'refuse';

  const replayed = [];
  page.on('response', async (response) => {
    if (!response.url().includes('/api/lead-track')) return;
    try {
      const requestBody = JSON.parse(response.request().postData() || '{}');
      const responseBody = await response.json().catch(() => ({}));
      replayed.push({
        uid: requestBody.payload && requestBody.payload.event_uid,
        event: requestBody.event_name,
        status: response.status(),
        success: responseBody.success === true,
      });
    } catch {
      /* nur Beweisaufnahme */
    }
  });

  await page.reload({ waitUntil: 'domcontentloaded' });
  const remainingAfterReplay = await waitForQueueEmpty(page, 30000);

  assert.equal(remainingAfterReplay, 0, 'Queue muss nach dem Reload vollstaendig nachliefern');
  for (const uid of outageUids) {
    assert.ok(
      replayed.some((entry) => entry.uid === uid && entry.status === 200 && entry.success),
      `Event ${uid} muss mit identischer UID bestaetigt nachgeliefert werden`
    );
  }
  const replayedQueueUids = replayed.filter((entry) => outageUids.includes(entry.uid)).map((e) => e.uid);
  assert.deepEqual(replayedQueueUids, outageUids, 'Nachlieferung muss die FIFO-Ordnung erhalten');
  assert.equal((await readDeadLetters(page)).length, 0, 'kein Event darf im Dead-Letter landen');

  // ---------- Szenario 3: transiente 500er ----------
  // Der vorige Reload lief mit kaputtem lead-init, der lokale v2-State steht auf
  // enabled:false. Ein weiterer Reload mit heilem Init aktiviert v2 wieder; dessen
  // page_view muss dann durch die zwei injizierten 500er hindurch zugestellt werden.
  harness.faults.leadInit.mode = 'off';
  harness.faults.leadTrack.mode = 'http500';
  harness.faults.leadTrack.remaining = 2;

  const before500 = harness.apiLog.filter((entry) => entry.injected === 'http500').length;
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  // Backoff der Queue: erster Retry nach ~4 s (2000*2^1 +-30 %). 25 s sind reichlich.
  const remainingAfterFlaky = await waitForQueueEmpty(page, 25000);
  const injected500 = harness.apiLog.filter((entry) => entry.injected === 'http500').length - before500;

  assert.equal(injected500, 2, 'beide injizierten 500er muessen den Client erreicht haben');
  assert.equal(remainingAfterFlaky, 0, 'nach Ende der Stoerung muss die Queue leerlaufen');
  assert.equal((await readDeadLetters(page)).length, 0, 'transiente 500er duerfen kein Dead-Letter erzeugen');

  // Beweis der Backoff-Telemetrie: mindestens ein erfolgreich nachgelieferter Request
  // muss queue_attempts > 0 tragen.
  const retriedDelivery = harness.apiLog.find((entry) => {
    if (entry.path !== '/api/lead-track' || entry.status !== 200) return false;
    try {
      return (JSON.parse(entry.request).payload || {}).queue_attempts > 0;
    } catch {
      return false;
    }
  });
  assert.ok(retriedDelivery, 'ein nachgelieferter Request muss queue_attempts > 0 tragen');
});
