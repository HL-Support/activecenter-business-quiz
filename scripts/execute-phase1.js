#!/usr/bin/env node

/**
 * Execute Phase 1 migration via Supabase REST API
 * Splits SQL file into statements and executes each one
 */

const fs = require('fs');
const https = require('https');

const SUPABASE_URL = 'https://xlpiisbozpgmemxhtivj.supabase.co';
const SUPABASE_SERVICE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhscGlpc2JvenBnbWVteGh0aXZqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDc5NTU1MiwiZXhwIjoyMDkwMzcxNTUyfQ.2ek_Ay-7igxTHXSxkO03mH1ty53kB35nrZLix7gGOqI';

// Polyfill for fetch (Node.js < 18)
const fetch = globalThis.fetch || require('node-fetch');

async function executeSql(statement) {
  const cleaned = statement.trim();
  if (!cleaned || cleaned.startsWith('--')) return { success: true, skipped: true };

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ query: cleaned }),
    });

    const text = await response.text();

    if (!response.ok) {
      return { success: false, status: response.status, error: text };
    }

    return { success: true, status: response.status };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function runMigration() {
  console.log('================================================================================');
  console.log('PHASE 1: Schema Migration & Data Cleanup');
  console.log('================================================================================\n');

  try {
    const path = require('path');
    const sqlFile = path.join(__dirname, 'PHASE1-FINAL-CORRECT.sql');
    console.log(`Loading SQL from: ${sqlFile}\n`);

    if (!fs.existsSync(sqlFile)) {
      console.error(`ERROR: SQL file not found at ${sqlFile}`);
      process.exit(1);
    }

    const sql = fs.readFileSync(sqlFile, 'utf8');

    // Split by ; and clean up
    const statements = sql
      .split(';')
      .map((s) => {
        // Remove comments and trim
        const lines = s.split('\n').filter((line) => !line.trim().startsWith('--'));
        return lines.join('\n').trim();
      })
      .filter((s) => s && s.length > 0);

    console.log(`Found ${statements.length} SQL statements\n`);

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      console.log(`\n[${i + 1}/${statements.length}] Executing...`);
      console.log(`SQL: ${statement.substring(0, 80)}${statement.length > 80 ? '...' : ''}`);

      const result = await executeSql(statement);

      if (result.success) {
        console.log('✅ Success');
        successCount++;
      } else {
        console.log(`❌ Error: ${result.error || result.status}`);
        failCount++;
        // Continue even on error
      }

      // Small delay between requests
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    console.log(
      '\n================================================================================'
    );
    console.log('PHASE 1 EXECUTION COMPLETE');
    console.log('================================================================================');
    console.log(`✅ Success: ${successCount}`);
    console.log(`❌ Failed: ${failCount}`);
    console.log(`Total: ${statements.length}\n`);

    if (failCount === 0) {
      console.log('All statements executed successfully!');
    } else {
      console.log('Some statements failed. Check Supabase dashboard for details.');
    }
  } catch (err) {
    console.error('Fatal error:', err.message);
    process.exit(1);
  }
}

runMigration();
