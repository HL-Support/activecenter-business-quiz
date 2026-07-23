const test = require('node:test');
const assert = require('node:assert/strict');

const {
  boundedCount,
  getLeadFlagsStrict,
  withRetry,
} = require('../../api/lead-system-health')._test;

const liveFlags = [
  { key: 'new_lead_writer_enabled', value: true },
  { key: 'new_lead_writer_percent', value: 100 },
  { key: 'legacy_writer_enabled', value: false },
  { key: 'outbox_worker_enabled', value: true },
];

test('strict health flag read retries transient failures without inventing fallback flags', async () => {
  let attempts = 0;
  const flags = await getLeadFlagsStrict(async () => {
    attempts += 1;
    if (attempts < 3) throw new Error('temporary DNS failure');
    return liveFlags;
  });

  assert.equal(attempts, 3);
  assert.deepEqual(flags, {
    new_lead_writer_enabled: true,
    new_lead_writer_percent: 100,
    legacy_writer_enabled: false,
    outbox_worker_enabled: true,
  });
});

test('strict health flag read rejects incomplete config instead of using defaults', async () => {
  await assert.rejects(
    getLeadFlagsStrict(async () =>
      liveFlags.filter((row) => row.key !== 'outbox_worker_enabled')
    ),
    /missing_app_config_keys:outbox_worker_enabled/
  );
});

test('retry helper aborts hung reads before the n8n monitor timeout', async () => {
  const startedAt = Date.now();
  await assert.rejects(
    withRetry(
      (signal) =>
        new Promise((resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('read_timeout')));
        }),
      2,
      10
    ),
    /read_timeout/
  );
  assert.ok(Date.now() - startedAt < 1000);
});

test('bounded counts stay exact below the cap and disclose truncation above it', async () => {
  const forty = await boundedCount('table?select=id', 100, async () =>
    Array.from({ length: 40 }, (_, id) => ({ id }))
  );
  const overCap = await boundedCount('table?select=id', 100, async () =>
    Array.from({ length: 101 }, (_, id) => ({ id }))
  );

  assert.deepEqual(forty, { value: 40, capped: false });
  assert.deepEqual(overCap, { value: 100, capped: true });
});
