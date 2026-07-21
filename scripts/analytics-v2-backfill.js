const { executeManagementQuery } = require('./stats-logs-baseline.js');
const { buildDailyBatches, compareRange } = require('./analytics-v2-parity.js');

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--from') values.from = argv[index + 1];
    if (argv[index] === '--to') values.to = argv[index + 1];
    if (argv[index] === '--dry-run') values.dryRun = true;
  }
  if (!values.from || !values.to) throw new Error('Usage: node scripts/analytics-v2-backfill.js --from YYYY-MM-DD --to YYYY-MM-DD [--dry-run]');
  return values;
}

async function refreshDay(day, options = {}) {
  const rows = await executeManagementQuery(
    `select analytics_internal.refresh_event_daily('${day}'::date, '${day}'::date) result`,
    options
  );
  const parity = await compareRange(day, day, options);
  if (!parity.ok) throw new Error(`Parity failed for ${day}: ${JSON.stringify(parity.mismatches.slice(0, 20))}`);
  return { day, refresh: rows[0]?.result || null, parity };
}

async function runBackfill({ from, to, dryRun = false }, options = {}) {
  const batches = buildDailyBatches(from, to);
  if (dryRun) return { dryRun: true, batches };
  const completed = [];
  for (const batch of batches) completed.push(await refreshDay(batch.from, options));
  return { dryRun: false, completed };
}

if (require.main === module) {
  runBackfill(parseArgs(process.argv.slice(2)))
    .then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`))
    .catch((error) => {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
    });
}

module.exports = { parseArgs, refreshDay, runBackfill };
