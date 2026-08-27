'use strict';

// Phase 4: eine Kysely-Instanz pro Prozess, Verbindung ausschliesslich ueber
// DATABASE_URL. Zeigt in Phase 4 auf Supabase (Direkthost/Pooler), ab Phase 6
// auf die private Hetzner-PG — der aufrufende Code merkt den Unterschied nicht.

const { Kysely, PostgresDialect } = require('kysely');
const { Pool } = require('pg');

let instanz = null;

function datenbank() {
  if (instanz) return instanz;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL fehlt — Phase-4-Datenzugriff braucht die direkte Verbindung (nie PostgREST).');
  }
  instanz = new Kysely({
    dialect: new PostgresDialect({
      pool: new Pool({
        connectionString: url,
        max: Number(process.env.DB_POOL_MAX || 5),
        connectionTimeoutMillis: 10000,
        idleTimeoutMillis: 30000,
      }),
    }),
  });
  return instanz;
}

async function schliessen() {
  if (!instanz) return;
  const alt = instanz;
  instanz = null;
  await alt.destroy();
}

module.exports = { datenbank, schliessen };
