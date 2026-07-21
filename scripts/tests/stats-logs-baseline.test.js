const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeBaseline, redactSecrets } = require('../stats-logs-baseline.js');

test('baseline contains raw counts, daily totals and stable event UID totals', () => {
  const result = normalizeBaseline({
    total: '2',
    distinct_uids: '2',
    missing_uids: '0',
    daily: [{ day: '2026-07-21', count: '2' }],
  });

  assert.deepEqual(result, {
    total: 2,
    distinctUids: 2,
    missingUids: 0,
    daily: [{ day: '2026-07-21', count: 2 }],
  });
});

test('baseline output redacts credential-shaped fields and JWTs', () => {
  const value = redactSecrets({
    SUPABASE_SERVICE_KEY: 'secret-value',
    nested: { authorization: 'Bearer abc.def.ghi', safe: 'ok' },
  });

  assert.deepEqual(value, {
    SUPABASE_SERVICE_KEY: '[REDACTED]',
    nested: { authorization: '[REDACTED]', safe: 'ok' },
  });
});
