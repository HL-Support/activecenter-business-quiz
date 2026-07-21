const test = require('node:test');
const assert = require('node:assert/strict');

const { compareBuckets, buildDailyBatches } = require('../analytics-v2-parity.js');

test('parity fails closed on missing or mismatched buckets', () => {
  assert.deepEqual(
    compareBuckets(
      [{ key: '2026-07-20|view', count: 10 }],
      [{ key: '2026-07-20|view', count: 9 }]
    ),
    {
      ok: false,
      mismatches: [{ key: '2026-07-20|view', legacy: 10, v2: 9 }],
    }
  );
});

test('parity detects buckets missing on either side', () => {
  const result = compareBuckets(
    [{ key: 'a', count: 1 }],
    [{ key: 'b', count: 1 }]
  );
  assert.equal(result.ok, false);
  assert.deepEqual(result.mismatches, [
    { key: 'a', legacy: 1, v2: 0 },
    { key: 'b', legacy: 0, v2: 1 },
  ]);
});

test('backfill batches cover each UTC day exactly once', () => {
  assert.deepEqual(buildDailyBatches('2026-07-19', '2026-07-21'), [
    { from: '2026-07-19', to: '2026-07-19' },
    { from: '2026-07-20', to: '2026-07-20' },
    { from: '2026-07-21', to: '2026-07-21' },
  ]);
});
