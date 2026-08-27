'use strict';

// Datenquelle des Wächters - eine Stelle, zwei Modi.
//
// Warum: Nach dem Datenbank-Cutover gibt es die Supabase-Management-API nicht mehr, und
// die Objekte heissen `leads.*` statt `public.*`. Ohne diese Umschaltstelle müsste am
// Umzugstag der Wächter selbst operiert werden - ausgerechnet das Werkzeug, das den
// Umzug überwachen soll. 🔴 Und ein Wächter, der weiter die ALTE Datenbank befragt,
// meldet zufrieden "alles ruhig", während die neue unbeobachtet läuft.
//
//   WAECHTER_QUELLE=supabase   (Standard, heutiger Zustand)
//   WAECHTER_QUELLE=plattform  (nach dem Cutover)
//
// Der Supabase-Pfad ist bewusst unverändert: dieselbe Funktion, dieselben SQL-Strings.
// Nur im Plattform-Modus läuft das SQL durch die Schema-Abbildung (public -> leads),
// dieselbe Implementierung wie beim Schema-Export - keine zweite Wahrheit.
//
// Der Plattform-Modus braucht (Belege im Betriebshandbuch, NURTURE_BETRIEB.md §4):
//   - Netzweg: nur 10.0.1.5 darf laut pg_hba auf 10.0.1.3:5432. Der Wächter-Host IST
//     10.0.1.5 - gemessen am 27.08.2026, der Weg steht.
//   - Treiber: `postgres` (postgres.js) im Wächter-Verzeichnis. Bewusst dieses Paket,
//     weil es KEINE Abhängigkeiten hat und damit in ein read-only gemountetes
//     Verzeichnis passt; der Container (node:24-alpine) bringt kein psql mit.
//   - Zugang: LEADS_PG_* aus der .env des Wächters (Secrets-Eintrag `leads_pg`).

const { bildeDefinitionAb } = require('./phase5-schema-abbildung.js');

const MODUS = String(process.env.WAECHTER_QUELLE || 'supabase').toLowerCase();

function istPlattform() {
  return MODUS === 'plattform';
}

async function frageSupabase(sql) {
  const { executeManagementQuery } = require('./stats-logs-baseline.js');
  return executeManagementQuery(sql);
}

let verbindung = null;

async function fragePlattform(sql) {
  if (!verbindung) {
    // Erst hier laden: Im Supabase-Modus darf ein fehlender Treiber den Wächter nicht
    // am Starten hindern.
    let postgres;
    try {
      postgres = require('postgres');
    } catch {
      throw new Error(
        'WAECHTER_QUELLE=plattform, aber das Paket "postgres" fehlt. '
        + 'Ablauf zum Nachlegen steht in NURTURE_BETRIEB.md §4.');
    }
    const fehlend = ['LEADS_PG_HOST', 'LEADS_PG_DATENBANK', 'LEADS_PG_BENUTZER', 'LEADS_PG_PASSWORT']
      .filter((n) => !process.env[n]);
    if (fehlend.length) throw new Error(`Zugangsdaten fehlen: ${fehlend.join(', ')}`);

    verbindung = postgres({
      host: process.env.LEADS_PG_HOST,
      port: Number(process.env.LEADS_PG_PORT || 5432),
      database: process.env.LEADS_PG_DATENBANK,
      username: process.env.LEADS_PG_BENUTZER,
      password: process.env.LEADS_PG_PASSWORT,
      // Der Wächter liest nur und läuft stündlich - eine Verbindung genügt und schont
      // das CONNECTION LIMIT der Rolle.
      max: 1,
      idle_timeout: 10,
      connect_timeout: 15,
      // Ein hängender Wächter ist schlimmer als ein fehlgeschlagener: Exitcode 2
      // ("Messung nicht durchführbar") alarmiert, ein Hänger schweigt.
      connection: { statement_timeout: 30000 },
      onnotice: () => {},
    });
  }
  return verbindung.unsafe(sql);
}

// 🔴 Die beiden Wege liefern NICHT dieselben Typen: Die Management-API antwortet mit
// JSON (Zeitstempel als ISO-String), der Treiber mit nativen Date-Objekten. Gemessen am
// 27.08.2026 fiel das an einer Ausgabe auf, die `String(wert).slice(0, 10)` macht:
// aus "2026-06-11" wurde "Thu Jun 11". Kosmetisch im Protokoll - aber jede Stelle, die
// ein Datum vergleicht oder zerlegt, bricht auf demselben Weg still.
//
// Deshalb normalisiert die Datenquelle: Der Wächter sieht in BEIDEN Modi denselben Typ.
// Das ist der ganze Zweck dieser Schicht - sonst verlagert sie den Unterschied nur.
function normalisiere(zeilen) {
  return (zeilen || []).map((zeile) => {
    const raus = {};
    for (const [k, v] of Object.entries(zeile)) {
      raus[k] = v instanceof Date ? v.toISOString() : v;
    }
    return raus;
  });
}

/**
 * Setzt EINE Leseabfrage ab. Im Plattform-Modus wird das SQL vorher auf die
 * Zielschemata abgebildet und das Ergebnis auf die Typen der Management-API gebracht.
 */
async function frage(sql) {
  if (!istPlattform()) return frageSupabase(sql);
  return normalisiere(await fragePlattform(bildeDefinitionAb(sql)));
}

async function schliessen() {
  if (verbindung) {
    await verbindung.end({ timeout: 5 });
    verbindung = null;
  }
}

module.exports = { frage, schliessen, istPlattform, MODUS };
