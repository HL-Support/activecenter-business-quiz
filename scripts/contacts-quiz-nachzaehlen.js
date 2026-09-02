#!/usr/bin/env node
'use strict';

/**
 * Nachzaehlen der Lead-Uebergabe an contacts — Plan B §10.
 *
 * 🔴 WARUM ZAEHLEN UND NICHT „es lief durch"
 * Ein 2xx ist kein Beweis. Am 26.08.2026 hat die leere Antwort der alten Route bei den
 * Nachbarn einen stillen Fehler versteckt, und am 26.08. davor hatte der Nurture-Versand
 * drei Wochen lang niemanden angeschrieben, waehrend jede Anzeige gruen war. Deshalb wird
 * hier nicht der Vorgang gemessen, sondern das ERGEBNIS — und zwar aus zwei voneinander
 * unabhaengigen Richtungen, die uebereinstimmen muessen.
 *
 * Zaehler A  Opt-ins:      leads.lead_state mit form_submitted_at am Tag — OHNE Testleads
 *              (test_lead_marked, seit #137): die durchlaufen den Funnel echt, erzeugen aber
 *              absichtlich keine Kartei-Zeile. Sie stehen als eigene Spalte daneben, damit
 *              Testverkehr weder Fehlalarme ausloest noch echte Luecken verdecken kann.
 * Zaehler B  Uebermittlungen: leads.contacts_zustellprotokoll — Paritaet ebenfalls nur ueber
 *              echte Leads; gescheitert/offen alarmieren weiterhin fuer ALLE Zeilen
 *              - im Modus `schatten`: Zeilen mit status='schatten'   -> muss A entsprechen
 *              - im Modus `an`:       success+duplicate MIT contact_id -> muss A entsprechen
 * Zaehler S  Auftraege:    leads.lead_sync_outbox je Zustand; `dead` muss 0 sein
 * Zaehler R  Rang:         mysql_*-Auftraege; `dead` muss 0 sein (Kopplung §6)
 *
 * 🔴 Zwei Zaehler des Plans stehen hier NICHT und lassen sich hier auch nicht bilden:
 *   C (Postmark-Tags optin_coach/lead_access) — die Mails verschickt n8n ueber einen
 *     anderen Postmark-Server; Zeitstempel dort sind EDT, MESZ = +6 h (MAILWEGE §5).
 *   D (Kartei-Zeilen je Tag, doppelte submission_id/hash/email) — die Legacy-MySQL ist
 *     von hier nicht lesbar; das ist ein Lesescript im contacts-Projekt.
 * Sie ehrlich zu benennen ist besser, als sie stillschweigend wegzulassen: Wer nur A und B
 * vergleicht, sieht einen Doppelversand NICHT.
 *
 * 🔴 `--modus` ist kein Schmuck, sondern der Unterschied zwischen einer Zaehlung und einer
 * Ueberwachung. Ohne ihn ist ein Tag mit NULL Uebermittlungen unauffaellig — und damit
 * saehe ein Totalausfall des Sendewegs genauso aus wie „der Modus ist aus". Das ist exakt
 * der Fehler, an dem der Nurture-Versand drei Wochen unbemerkt stillstand: Eine Anzeige,
 * die im Normalbetrieb dieselbe Zahl zeigt wie im Ausfall, kann den Ausfall nicht zeigen.
 * Wer `--modus schatten` oder `--modus an` mitgibt, sagt: „ab hier MUSS etwas entstehen".
 *
 *   node scripts/contacts-quiz-nachzaehlen.js              # letzte 7 Tage, nachsichtig
 *   node scripts/contacts-quiz-nachzaehlen.js --modus schatten --ab 2026-09-01
 *   node scripts/contacts-quiz-nachzaehlen.js --tage 14 --json bericht.json
 *
 * Braucht WAECHTER_QUELLE=plattform und die LEADS_PG_*-Zugaenge — dieselbe Umschaltstelle
 * wie der Waechter (`scripts/waechter-datenquelle.js`), damit es nicht zwei Wege zur
 * Datenbank gibt.
 *
 * Exitcode 0 = stimmig · 1 = Befund · 2 = nicht durchfuehrbar.
 */

const fs = require('fs');
const { frage, schliessen, istPlattform, MODUS } = require('./waechter-datenquelle.js');

function argument(name, standard) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : standard;
}

const TAGE = Math.max(1, Math.min(90, Number(argument('tage', 7)) || 7));

// Welcher Modus laeuft — und damit, was an einem Tag entstanden sein MUSS.
const MODUS_ERWARTET = String(argument('modus', 'unbekannt')).toLowerCase();
// Erster Tag, der beurteilt wird. Der Tag des Umschaltens ist immer ein halber und
// erzeugt sonst einen Fehlalarm, den man dann wegzuerklaeren lernt — und das ist der
// Anfang vom Ende jeder Ueberwachung.
const AB = argument('ab', null);

function zahl(wert) {
  return Number(wert || 0);
}

(async () => {
  if (!istPlattform()) {
    process.stderr.write(
      `Nachzaehlen braucht WAECHTER_QUELLE=plattform (aktuell: ${MODUS}).\n` +
        'Die Uebergabe-Objekte liegen ausschliesslich auf der Plattform-DB.\n'
    );
    process.exit(2);
  }

  // Zaehler A und B je Kalendertag, in EINER Abfrage zusammengefuehrt — damit ein Tag
  // ohne Uebermittlungen nicht einfach aus der Liste faellt und dadurch unsichtbar wird.
  const jeTag = await frage(`
    WITH tage AS (
      SELECT generate_series(
               (current_date - ${TAGE - 1})::date, current_date, interval '1 day'
             )::date AS tag
    ),
    -- 🔴 Testleads (E2E-Geschirr, ?test=1) durchlaufen den Funnel ECHT, aber ohne
    -- Kartei-Zeile und ohne Mail — seit #137 tragen sie die Marke test_lead_marked.
    -- Sie duerfen weder mitgezaehlt werden (sonst ist jeder E2E-Tag ein Fehlalarm,
    -- Vorfall-Nachlese 02.09.: 39 Opt-ins / 20 Schatten, Delta = 19 Testleads) noch
    -- stillschweigend verschwinden (sonst verdeckt Testverkehr echte Luecken).
    -- Darum: eigene Spalte, Paritaet NUR ueber echte Leads. Gescheitert/offen
    -- alarmieren weiterhin fuer ALLE Zeilen — ein failed ist nie normal.
    optins AS (
      SELECT (s.form_submitted_at AT TIME ZONE 'Europe/Vienna')::date AS tag,
             count(*) FILTER (WHERE NOT EXISTS (
               SELECT 1 FROM leads.lead_events e
                WHERE e.lead_hash = s.lead_hash
                  AND e.event_name = 'test_lead_marked')) AS n,
             count(*) FILTER (WHERE EXISTS (
               SELECT 1 FROM leads.lead_events e
                WHERE e.lead_hash = s.lead_hash
                  AND e.event_name = 'test_lead_marked')) AS testleads
        FROM leads.lead_state s
       WHERE s.form_submitted_at >= current_date - ${TAGE - 1}
         AND s.source_app = 'business_leads_quiz'
       GROUP BY 1
    ),
    protokoll AS (
      SELECT (c.created_at AT TIME ZONE 'Europe/Vienna')::date AS tag,
             count(*) FILTER (WHERE c.status = 'schatten' AND NOT EXISTS (
               SELECT 1 FROM leads.lead_events e
                WHERE e.lead_hash = c.lead_hash
                  AND e.event_name = 'test_lead_marked')) AS schatten,
             count(*) FILTER (WHERE c.status IN ('success','duplicate') AND c.contact_id IS NOT NULL AND NOT EXISTS (
               SELECT 1 FROM leads.lead_events e
                WHERE e.lead_hash = c.lead_hash
                  AND e.event_name = 'test_lead_marked')) AS zugestellt,
             count(*) FILTER (WHERE c.status = 'failed') AS gescheitert,
             count(*) FILTER (WHERE c.status = 'pending') AS offen
        FROM leads.contacts_zustellprotokoll c
       WHERE c.created_at >= current_date - ${TAGE - 1}
       GROUP BY 1
    )
    SELECT t.tag,
           COALESCE(o.n, 0)          AS optins,
           COALESCE(o.testleads, 0)  AS testleads,
           COALESCE(p.schatten, 0)   AS schatten,
           COALESCE(p.zugestellt, 0) AS zugestellt,
           COALESCE(p.gescheitert, 0) AS gescheitert,
           COALESCE(p.offen, 0)      AS offen
      FROM tage t
      LEFT JOIN optins o ON o.tag = t.tag
      LEFT JOIN protokoll p ON p.tag = t.tag
     ORDER BY t.tag DESC`);

  const auftraege = await frage(`
    SELECT sync_type, status, count(*) AS n
      FROM leads.lead_sync_outbox
     WHERE sync_type = 'contacts_quiz_submission' OR sync_type LIKE 'mysql%'
     GROUP BY 1, 2 ORDER BY 1, 2`);

  const befunde = [];
  const zeilen = [];

  for (const z of jeTag) {
    const tag = String(z.tag).slice(0, 10);
    const optins = zahl(z.optins);
    const testleads = zahl(z.testleads);
    const schatten = zahl(z.schatten);
    const zugestellt = zahl(z.zugestellt);
    const gescheitert = zahl(z.gescheitert);
    const offen = zahl(z.offen);
    zeilen.push({ tag, optins, testleads, schatten, zugestellt, gescheitert, offen });

    // 🔴 Der heutige Tag laeuft noch — eine Abweichung dort ist eine Momentaufnahme,
    // kein Befund. Gezaehlt wird ab dem ersten VOLLSTAENDIGEN Tag.
    const heute = tag === new Date().toISOString().slice(0, 10);
    if (heute) continue;
    // Tage vor dem Umschalten werden nicht beurteilt — dort ist „nichts" richtig.
    if (AB && tag < AB) continue;

    const uebermittelt = schatten + zugestellt;

    // 🔴 Der Fall, den eine reine Zaehlung verschluckt: Der Modus laeuft, es gab Opt-ins,
    // und trotzdem ist NICHTS entstanden. Ohne diese Pruefung sieht der Totalausfall aus
    // wie ein ruhiger Tag.
    if (MODUS_ERWARTET !== 'unbekannt' && MODUS_ERWARTET !== 'aus' && optins > 0 && uebermittelt === 0) {
      befunde.push(
        `🔴 ${tag}: ${optins} Opt-ins, aber KEINE einzige Uebermittlung — im Modus ` +
          `'${MODUS_ERWARTET}' haette jedes Opt-in eine Zeile erzeugen muessen. Entweder ` +
          'steht der Modus nicht mehr, oder der Zweig wirft still (er ist gekapselt). ' +
          'Containerprotokoll nach "[contacts-quiz]" durchsehen.'
      );
      continue;
    }

    if (uebermittelt > 0 && uebermittelt !== optins) {
      befunde.push(
        `${tag}: ${optins} Opt-ins, aber ${uebermittelt} Uebermittlungen ` +
          `(${schatten} Schatten, ${zugestellt} zugestellt). Jede Abweichung ist ein ` +
          'Befund — nicht wegerklaeren, nachsehen.'
      );
    }
    if (gescheitert > 0) {
      befunde.push(`${tag}: ${gescheitert} gescheiterte Uebermittlungen im Protokoll.`);
    }
    if (offen > 0) {
      befunde.push(
        `${tag}: ${offen} Uebermittlungen stehen seit einem abgeschlossenen Tag auf ` +
          '`pending` — die haetten laengst fertig sein muessen.'
      );
    }
  }

  for (const a of auftraege) {
    if (a.status === 'dead') {
      befunde.push(
        `🔴 ${zahl(a.n)} TOTE Auftraege vom Typ ${a.sync_type}. Bei ` +
          'contacts_quiz_submission heisst das: der Lead steht in lead_state, aber es gibt ' +
          'keine Kartei-Zeile, keine Mail 1 und keine Mail 2.'
      );
    }
  }

  console.log('');
  console.log(`Nachzaehlen der Contacts-Uebergabe (${TAGE} Tage, Quelle ${MODUS})`);
  console.log(
    `  Erwarteter Modus: ${MODUS_ERWARTET}` +
      (MODUS_ERWARTET === 'unbekannt'
        ? '  ⚠️ ohne --modus bleibt ein Totalausfall unauffaellig'
        : '') +
      (AB ? `  ·  beurteilt ab ${AB}` : '')
  );
  console.log('');
  console.log(
    '  Tag          Opt-ins   Testleads   Schatten   Zugestellt   Gescheitert   Offen'
  );
  for (const z of zeilen) {
    console.log(
      `  ${z.tag}   ${String(z.optins).padStart(7)}   ${String(z.testleads).padStart(9)}` +
        `   ${String(z.schatten).padStart(8)}   ${String(z.zugestellt).padStart(10)}` +
        `   ${String(z.gescheitert).padStart(11)}   ${String(z.offen).padStart(5)}`
    );
  }
  console.log('');
  console.log('  Auftraege:');
  if (!auftraege.length) console.log('    (keine)');
  for (const a of auftraege) {
    console.log(`    ${String(a.sync_type).padEnd(26)} ${String(a.status).padEnd(11)} ${zahl(a.n)}`);
  }
  console.log('');

  if (befunde.length) {
    console.log('  BEFUNDE:');
    for (const b of befunde) console.log(`    - ${b}`);
  } else {
    console.log('  Keine Abweichungen.');
  }
  console.log('');
  console.log('  🔴 Nicht von hier messbar und deshalb VON HAND zu pruefen:');
  console.log('     C  Postmark-Tags optin_coach + lead_access = 2 x Opt-ins (Zeitstempel EDT!)');
  console.log('     D  Kartei je Tag: Zeilenzahl = Opt-ins, doppelte submission_id = 0,');
  console.log('        doppelte E-Mail am Tag = 0 (Lesescript im contacts-Projekt)');
  console.log('');

  const jsonZiel = argument('json', null);
  if (jsonZiel) {
    fs.writeFileSync(
      jsonZiel,
      JSON.stringify(
        { gemessen_am: new Date().toISOString(), quelle: MODUS, tage: TAGE, zeilen, auftraege, befunde },
        null,
        2
      )
    );
  }

  await schliessen();
  process.exit(befunde.length ? 1 : 0);
})().catch(async (fehler) => {
  await schliessen().catch(() => {});
  process.stderr.write(`Nachzaehlen nicht durchfuehrbar: ${fehler.message}\n`);
  process.exit(2);
});
