#!/usr/bin/env node

/**
 * Phase 1: Schema Migration for Tracking System Redesign
 *
 * Tasks:
 * 1. Add is_resume and initial_step columns to tracking_sessions
 * 2. Create indexes
 * 3. Create views (v_funnel_analysis, v_resume_metrics, v_completion_metrics)
 * 4. Verify schema changes
 */

const https = require('https');

const SUPABASE_URL = 'https://xlpiisbozpgmemxhtivj.supabase.co';
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhscGlpc2JvenBnbWVteGh0aXZqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDc5NTU1MiwiZXhwIjoyMDkwMzcxNTUyfQ.2ek_Ay-7igxTHXSxkO03mH1ty53kB35nrZLix7gGOqI';

async function supabaseSQL(sql) {
  return new Promise((resolve, reject) => {
    const url = new URL(SUPABASE_URL);
    const options = {
      hostname: url.hostname,
      port: 443,
      path: '/rest/v1/rpc/sql_execute',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          } else {
            resolve(result);
          }
        } catch (e) {
          resolve({ raw: data, status: res.statusCode });
        }
      });
    });

    req.on('error', reject);
    req.write(JSON.stringify({ query: sql }));
    req.end();
  });
}

// Alternative: Use direct fetch if Node 18+
async function executeSQL(sql) {
  try {
    console.log(`\n📝 Executing SQL:\n${sql.substring(0, 100)}...\n`);

    const response = await fetch(`${SUPABASE_URL}/rest/v1/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ query: sql }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`${response.status}: ${error}`);
    }

    return { success: true, status: response.status };
  } catch (err) {
    console.error(`❌ SQL Error: ${err.message}`);
    throw err;
  }
}

async function runMigration() {
  console.log('🚀 Phase 1: Schema Expansion & Cleanup\n');
  console.log(`✅ Supabase URL: ${SUPABASE_URL}`);
  console.log(`✅ Service Key: ${SUPABASE_SERVICE_KEY.substring(0, 20)}...\n`);

  try {
    // ===== STEP 1: Add Columns to tracking_sessions =====
    console.log('📌 STEP 1: Adding columns to tracking_sessions...\n');

    const alterTableSQL = `
      ALTER TABLE tracking_sessions
      ADD COLUMN IF NOT EXISTS is_resume BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS initial_step TEXT DEFAULT 'intro';
    `;

    console.log('SQL to execute:');
    console.log(alterTableSQL);
    console.log('\n⚠️  Note: Direct SQL execution via REST API requires raw SQL endpoint.');
    console.log('📌 Manual SQL commands to run in Supabase SQL Editor:\n');

    // Display all SQL commands needed
    const allSQL = `
-- ===== PHASE 1: Schema Migration =====

-- Step 1: Add columns to tracking_sessions
ALTER TABLE tracking_sessions
ADD COLUMN IF NOT EXISTS is_resume BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS initial_step TEXT DEFAULT 'intro';

-- Step 2: Create indexes
CREATE INDEX IF NOT EXISTS idx_tracking_sessions_is_resume
  ON tracking_sessions(is_resume);

-- Step 3: Create v_funnel_analysis view (per coach)
CREATE OR REPLACE VIEW v_funnel_analysis AS
SELECT
  berater_slug,
  COUNT(DISTINCT CASE WHEN event_name = 'quiz_started' THEN hash END) as step_1_starts,
  COUNT(DISTINCT CASE WHEN event_name = 'question_viewed' THEN hash END) as step_2_questions,
  COUNT(DISTINCT CASE WHEN event_name = 'form_submit' THEN hash END) as step_form_submits,
  COUNT(DISTINCT CASE WHEN event_name = 'quiz_result' THEN hash END) as completions,
  ROUND(100.0 * COUNT(DISTINCT CASE WHEN event_name = 'quiz_result' THEN hash END) /
    NULLIF(COUNT(DISTINCT CASE WHEN event_name = 'quiz_started' THEN hash END), 0), 1)
    as completion_rate_pct
FROM tracking_events
WHERE hash IS NOT NULL AND berater_slug IS NOT NULL
GROUP BY berater_slug;

-- Step 4: Create v_resume_metrics view (per coach)
CREATE OR REPLACE VIEW v_resume_metrics AS
SELECT
  berater_slug,
  COUNT(DISTINCT hash) as total_resume_sessions,
  COUNT(DISTINCT CASE WHEN event_name = 'quiz_result' THEN hash END) as resume_completions,
  ROUND(100.0 * COUNT(DISTINCT CASE WHEN event_name = 'quiz_result' THEN hash END) /
    NULLIF(COUNT(DISTINCT hash), 0), 1) as resume_completion_rate_pct
FROM tracking_events
WHERE is_resume = TRUE AND hash IS NOT NULL AND berater_slug IS NOT NULL
GROUP BY berater_slug;

-- Step 5: Create v_completion_metrics view (per coach)
CREATE OR REPLACE VIEW v_completion_metrics AS
SELECT
  berater_slug,
  COUNT(DISTINCT CASE WHEN event_name = 'quiz_started' THEN hash END) as total_starts,
  COUNT(DISTINCT CASE WHEN event_name = 'quiz_result' THEN hash END) as total_completions,
  ROUND(100.0 * COUNT(DISTINCT CASE WHEN event_name = 'quiz_result' THEN hash END) /
    NULLIF(COUNT(DISTINCT CASE WHEN event_name = 'quiz_started' THEN hash END), 0), 1)
    as completion_rate_pct
FROM tracking_events
WHERE hash IS NOT NULL AND berater_slug IS NOT NULL
GROUP BY berater_slug;

-- Step 6: Data Cleanup - Count visitor-only sessions (no email)
SELECT COUNT(*) as visitor_only_count
FROM tracking_sessions
WHERE form_email IS NULL AND session_hash IS NOT NULL;

-- Step 7: Data Cleanup - DELETE visitor-only sessions
DELETE FROM tracking_sessions
WHERE form_email IS NULL
  AND session_hash IS NOT NULL
  AND session_hash NOT IN (
    SELECT DISTINCT hash FROM tracking_events
    WHERE event_name IN ('form_submitted', 'quiz_result')
  );

-- Step 8: Verification - Count remaining sessions
SELECT COUNT(*) as remaining_sessions FROM tracking_sessions;

-- Step 9: Verification - Test v_funnel_analysis view
SELECT * FROM v_funnel_analysis LIMIT 5;

-- Step 10: Verification - Check for any NULL berater_slug in events
SELECT COUNT(*) as null_berater_count FROM tracking_events WHERE berater_slug IS NULL;
    `;

    console.log(allSQL);

    console.log('\n\n' + '='.repeat(80));
    console.log('📋 MANUAL SETUP INSTRUCTIONS:');
    console.log('='.repeat(80) + '\n');

    console.log('1️⃣  Go to Supabase Dashboard: https://app.supabase.com/');
    console.log('2️⃣  Select project: xlpiisbozpgmemxhtivj');
    console.log('3️⃣  Go to SQL Editor');
    console.log('4️⃣  Copy the SQL commands above');
    console.log('5️⃣  Execute them in order\n');

    console.log('✅ Expected Results:');
    console.log('   - tracking_sessions has 2 new columns (is_resume, initial_step)');
    console.log('   - 3 views created (v_funnel_analysis, v_resume_metrics, v_completion_metrics)');
    console.log('   - Visitor-only sessions deleted');
    console.log('   - 4 real sessions remain (Lisa, Gudrun, Mariana, etc.)\n');

    // Save SQL to file for easy copy-paste
    const fs = require('fs');
    fs.writeFileSync('phase1-migration.sql', allSQL);
    console.log('💾 SQL saved to: phase1-migration.sql\n');
  } catch (err) {
    console.error('❌ Migration error:', err.message);
    process.exit(1);
  }
}

runMigration();
