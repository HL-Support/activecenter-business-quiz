/**
 * Wächter über den Nurture-Versand — misst das ERGEBNIS, nicht den Vorgang.
 *
 * WARUM ES DIESES WERKZEUG GIBT
 * -----------------------------
 * Am 26.08.2026 kam heraus: Der Versand hatte drei Wochen lang keinen neuen Kontakt
 * angeschrieben. 186 Menschen gingen durch den Funnel und hörten nie etwas. In dieser Zeit
 * war jede vorhandene Anzeige grün:
 *
 *   - der Workflow meldete zwölfmal täglich `success` — er lief ja auch durch,
 *     nur mit unvollständiger Eingabe;
 *   - `nurture_runs.candidates_checked` zeigte ~4120 pro Tag — immer dieselben Alten;
 *   - `nurture_runs.sent_count` zeigte 0 — an JEDEM Tag, auch an Tagen mit
 *     nachweislichem Versand. Dieser Zähler ist strukturell kaputt.
 *
 * 🔴 Eine Überwachung, die im Normalbetrieb dieselbe Zahl zeigt wie im Totalausfall, kann
 * den Ausfall nicht anzeigen. Deshalb misst dieser Wächter ausschliesslich Zustände, die
 * sich im Fehlerfall zwangsläufig ändern.
 *
 * ZWEI PRÜFUNGEN
 * --------------
 * W1  Kappungsnähe. PostgREST begrenzt serverseitig (`db-max-rows`, hier 1000). Kommen
 *     genau so viele Zeilen zurück wie die Grenze, wurde GARANTIERT abgeschnitten — das
 *     ist die einzige verlässliche Erkennung, denn die Antwort ist einfach kürzer, ohne
 *     Fehler und ohne Warnung. Diese Prüfung gilt für jede inventarisierte Leseabfrage,
 *     nicht nur für die des Versands, und fängt damit die Fehlerklasse statt des Einzelfalls.
 *
 * W2  Ergebnis statt Vorgang. Gibt es fällige Empfänger, die seit Stunden keine Mail
 *     bekommen? Und liegt die letzte Sendung länger zurück, als bei fälligen Kandidaten
 *     erklärbar wäre?
 *
 * REIN LESEND. Supabase über die Management-API mit erzwungenem `read_only`.
 *
 *   node scripts/waechter-nurture.js            # Bericht, Exitcode 1 bei Befund
 *   node scripts/waechter-nurture.js --still    # nur Exitcode, für Zeitplan/Alarm
 *   node scripts/waechter-nurture.js --json d.json
 *
 * Exitcode 0 = unauffällig · 1 = Befund · 2 = Messung nicht durchführbar.
 */
const fs = require('fs');
const { executeManagementQuery } = require('./stats-logs-baseline.js');

// Serverseitige Zeilengrenze von PostgREST. Steht in der Projektkonfiguration unter
// `max_rows`. Wird sie dort geändert, muss dieser Wert mitgezogen werden - sonst prüft der
// Wächter gegen eine Grenze, die es nicht mehr gibt.
const ZEILENGRENZE = Number(process.env.POSTGREST_MAX_ROWS || 1000);

// Ab welchem Anteil der Grenze gewarnt wird. 90 % gibt Vorlauf, bevor abgeschnitten wird.
const WARNSCHWELLE = 0.9;

// 🔴 Inventar der Leseabfragen, die eine LISTE holen und deshalb an die Grenze stossen
// können. Einzelabfragen (`limit=1`) stehen bewusst nicht drin - sie können nicht kappen.
// Wer eine neue Listenabfrage baut, trägt sie hier ein.
// `blaettert: true` heisst: Die Abfrage holt Seite für Seite und kann die Grenze deshalb
// nicht mehr verschlucken. Für sie gilt nur noch die Obergrenze der Blätterung
// (Seiten × Seitengröße). Ohne diese Unterscheidung würde der Wächter genau die Abfragen
// anschreien, die repariert sind — und wäre nach einer Woche Hintergrundrauschen.
const LISTENABFRAGEN = [
  {
    name: 'Nurture: versandfähige Leads',
    wo: 'n8n RqKSRTgFv8mv04H2 → Supabase - Get Eligible Leads',
    blaettert: true,
    seitenGrenze: 20 * 1000, // maxRequests × Seitengröße aus der Knotenkonfiguration
    sql: `select count(*) from public.v_lead_state_full
          where source_app = 'business_leads_quiz' and funnel_key = 'business'
            and email_normalized is not null and first_name is not null`,
  },
  {
    name: 'Nurture: Versand- und Testereignisse',
    wo: 'n8n RqKSRTgFv8mv04H2 → Supabase - Get Test Events',
    blaettert: true,
    seitenGrenze: 20 * 1000,
    sql: `select count(*) from public.lead_events
          where event_name in ('test_lead_marked','test_lead_unmarked','nurture_sent')`,
  },
];

async function zahl(sql) {
  const r = await executeManagementQuery(sql);
  const erste = r && r[0];
  return Number(erste && (erste.count ?? erste.n ?? Object.values(erste)[0]));
}

/**
 * Bewertet EINE Abfrage. Rückgabe null = unauffällig. Bewusst als reine Funktion, damit
 * die Regel im Selbsttest geprüft werden kann, ohne die Datenbank anzufassen — ein
 * Wächter, den man nie hat anschlagen sehen, ist kein Wächter.
 */
function kappungsUrteil(zeilen, abfrage, grenze = ZEILENGRENZE) {
  // Blätternde Abfragen: Die Serverobergrenze ist für sie bedeutungslos. Gemessen wird
  // stattdessen die Decke der Blätterung, die praktisch nie erreicht wird — aber wenn
  // doch, wäre der Fehler derselbe, nur zwanzigmal später.
  const decke = abfrage.blaettert ? abfrage.seitenGrenze || grenze * 20 : grenze;

  if (zeilen >= decke) {
    return {
      stufe: 'ALARM',
      text: abfrage.blaettert
        ? `${zeilen} Zeilen bei einer Blätter-Decke von ${decke} — auch die Blätterung `
          + 'schneidet jetzt ab. Seitenzahl erhöhen oder die Menge verkleinern.'
        : `${zeilen} Zeilen bei Grenze ${decke} — es wird GARANTIERT abgeschnitten. `
          + 'Die Abfrage muss blättern oder die Menge muss kleiner werden.',
    };
  }
  if (zeilen >= decke * WARNSCHWELLE) {
    return {
      stufe: 'WARNUNG',
      text: `${zeilen} von ${decke} Zeilen (${Math.round((zeilen / decke) * 100)} %). `
        + 'Vor dem Erreichen handeln, nicht danach.',
    };
  }
  return null;
}

async function w1Kappungsnaehe() {
  const befunde = [];
  for (const a of LISTENABFRAGEN) {
    const n = await zahl(a.sql);
    const u = kappungsUrteil(n, a);
    if (u) befunde.push({ ...a, zeilen: n, ...u });
  }
  return befunde;
}

function selbsttest() {
  const ohne = { name: 'test', blaettert: false };
  const mit = { name: 'test', blaettert: true, seitenGrenze: 20000 };
  const faelle = [
    ['Nicht blätternd, genau an der Grenze -> ALARM',
      kappungsUrteil(1000, ohne, 1000)?.stufe === 'ALARM'],
    ['Nicht blätternd, darüber -> ALARM',
      kappungsUrteil(1606, ohne, 1000)?.stufe === 'ALARM'],
    ['Nicht blätternd, 90 % -> WARNUNG',
      kappungsUrteil(900, ohne, 1000)?.stufe === 'WARNUNG'],
    ['Nicht blätternd, 89 % -> kein Befund',
      kappungsUrteil(890, ohne, 1000) === null],
    ['Blätternd, weit über der Serverobergrenze -> kein Befund',
      kappungsUrteil(1606, mit, 1000) === null],
    ['Blätternd, an der Blätter-Decke -> ALARM',
      kappungsUrteil(20000, mit, 1000)?.stufe === 'ALARM'],
    ['Blätternd, 90 % der Decke -> WARNUNG',
      kappungsUrteil(18000, mit, 1000)?.stufe === 'WARNUNG'],
    // Der reale Fall vom 26.08.: 1207 Leads bei Grenze 1000, damals ohne Blätterung.
    ['Der echte Vorfall wäre erkannt worden',
      kappungsUrteil(1207, ohne, 1000)?.stufe === 'ALARM'],
  ];
  let fehler = 0;
  console.log('Selbsttest der Kappungsregel (fasst keine Datenbank an):\n');
  for (const [titel, ok] of faelle) {
    console.log(`  ${ok ? 'OK    ' : 'FEHLER'}  ${titel}`);
    if (!ok) fehler += 1;
  }
  console.log('');
  if (fehler) {
    console.log(`${fehler} von ${faelle.length} fehlgeschlagen — der Regel ist nicht zu trauen.`);
    process.exit(1);
  }
  console.log(`Alle ${faelle.length} bestanden.`);
  process.exit(0);
}

if (process.argv.includes('--selbsttest')) selbsttest();

async function w2ErgebnisStattVorgang() {
  const befunde = [];

  // (a) Fällige Erstempfänger, die nichts bekommen haben. Fälligkeit wie im Workflow:
  // 12 Stunden nach dem Absenden des Formulars, Rang 0, kein Abschluss-Klick, kein Testlead.
  // Der Puffer von 6 Stunden verhindert Fehlalarme durch den Zwei-Stunden-Takt.
  const ueberfaellig = await executeManagementQuery(`
    select count(*) as n, min(v.form_submitted_at) as aeltester
    from public.v_lead_state_full v
    where v.source_app = 'business_leads_quiz' and v.funnel_key = 'business'
      and v.email_normalized is not null and v.first_name is not null
      and v.cta_type is null
      and coalesce(v.completed_rank, 0) = 0
      and v.form_submitted_at < now() - interval '18 hours'
      and not exists (select 1 from public.lead_events e
        where e.lead_hash = v.lead_hash and e.event_name = 'nurture_sent')
      and not exists (select 1 from public.lead_events e
        where e.lead_hash = v.lead_hash and e.event_name = 'test_lead_marked')`);
  const u = ueberfaellig[0];
  // 🔴 Bewusst nur WARNUNG, nie Alarm: Solange ein Rückstand abgearbeitet wird, ist diese
  // Zahl legitim hoch und sinkt von selbst. Ein Alarm darauf wäre tagelang rot und würde
  // zum Wegsehen erziehen. Gefährlich ist erst die KOMBINATION aus fälligen Empfängern und
  // stehendem Versand — und die prüft (b) darunter.
  if (Number(u.n) > 0) {
    befunde.push({
      stufe: 'WARNUNG',
      name: 'Fällige Erstempfänger ohne Mail',
      zeilen: Number(u.n),
      text: `${u.n} Kontakte sind seit über 18 Stunden fällig und haben nie eine Mail `
        + `bekommen. Ältester Formulareingang: ${String(u.aeltester).slice(0, 10)}.`,
    });
  }

  // (b) Stillstand: Die letzte Sendung liegt zu lange zurück, OBWOHL es fällige gibt.
  // Ohne die zweite Bedingung wäre das ein Fehlalarm an jedem ruhigen Wochenende.
  const letzte = await executeManagementQuery(
    `select max(event_at) as letzte from public.lead_events where event_name = 'nurture_sent'`
  );
  const stunden = letzte[0].letzte
    ? (Date.now() - new Date(letzte[0].letzte).getTime()) / 3600000
    : Infinity;
  if (stunden > 26 && Number(u.n) > 0) {
    befunde.push({
      stufe: 'ALARM',
      name: 'Versand steht still',
      zeilen: Number(u.n),
      text: `Letzte Sendung vor ${Math.round(stunden)} Stunden, obwohl ${u.n} fällige `
        + 'Kontakte warten. Genau dieser Zustand blieb im August drei Wochen unbemerkt.',
    });
  }

  return { befunde, stunden, faellige: Number(u.n) };
}

(async () => {
  const w1 = await w1Kappungsnaehe();
  const w2 = await w2ErgebnisStattVorgang();
  const alle = [...w1, ...w2.befunde];
  const still = process.argv.includes('--still');

  const jsonIndex = process.argv.indexOf('--json');
  if (jsonIndex >= 0 && process.argv[jsonIndex + 1]) {
    fs.writeFileSync(
      process.argv[jsonIndex + 1],
      JSON.stringify({ gemessen_am: new Date().toISOString(), zeilengrenze: ZEILENGRENZE, befunde: alle }, null, 2)
    );
  }

  if (!still) {
    console.log('');
    console.log('Wächter Nurture-Versand');
    console.log('');
    console.log(`  Zeilengrenze PostgREST : ${ZEILENGRENZE}`);
    console.log(`  Letzte Sendung vor     : ${Number.isFinite(w2.stunden) ? Math.round(w2.stunden) + ' Stunden' : 'nie'}`);
    console.log(`  Fällige ohne Mail      : ${w2.faellige}`);
    console.log('');
    if (!alle.length) {
      console.log('  Keine Auffälligkeiten.');
    } else {
      for (const b of alle) {
        console.log(`  [${b.stufe}] ${b.name}`);
        if (b.wo) console.log(`           ${b.wo}`);
        console.log(`           ${b.text}`);
        console.log('');
      }
    }
    console.log('');
  }

  process.exit(alle.some((b) => b.stufe === 'ALARM') ? 1 : 0);
})().catch((e) => {
  process.stderr.write(`Wächter nicht durchführbar: ${e.message}\n`);
  process.exit(2);
});
