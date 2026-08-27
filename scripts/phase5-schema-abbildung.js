'use strict';

// Schema-Abbildung Quelle -> Plattform (Rollenmodell docs/audits/plattform-rollenmodell-2026-08-27.md §5):
// auf der Plattform darf kein Projekt im Supabase-Standardschema liegen.
//
// EINE Implementierung fuer Export, Paritaetsvergleich und Datenprobe - doppelte
// Helfer driften (Falle 1, api/bridge.js-Vorfall vom 27.08.).
//
// Die Ersetzung ist bewusst KONTROLLIERT, nicht blind: es werden nur die drei im
// Live-Katalog tatsaechlich vorkommenden Formen ersetzt (qualifizierte Verweise
// "schema.", search_path-Literale und information_schema-Filter "= 'schema'").
// Danach erzwingt pruefeRestfrei(), dass kein Quellschema-Token uebrig ist -
// ein unbekanntes Vorkommen ist ein harter Fehler, keine stille Annahme.

const ABBILDUNG = Object.freeze({
  public: 'leads',
  analytics_internal: 'leads_analytics',
});

function bildeSchemaAb(schema) {
  return ABBILDUNG[schema] || schema;
}

// \bpublic trifft "graphql_public" nicht (Unterstrich ist Wortzeichen, keine Grenze).
const QUELLTOKEN = /\b(public|analytics_internal)\b/;

function bildeDefinitionAb(text) {
  let t = String(text === null || text === undefined ? '' : text);
  // 1. Qualifizierte Verweise: public.lead_state, analytics_internal.event_daily,
  //    auch innerhalb von Strings (NULL::public.lead_state, advisory-lock-Namen).
  t = t.replace(/\banalytics_internal\./g, 'leads_analytics.');
  t = t.replace(/\bpublic\./g, 'leads.');
  // 2. Quotierte Schemanamen: SET search_path TO 'public', 'pg_temp' und
  //    information_schema-Filter table_schema = 'public'.
  t = t.replace(/'analytics_internal'/g, "'leads_analytics'");
  t = t.replace(/'public'/g, "'leads'");
  return t;
}

// Haerte-Check nach der Abbildung: kein Quellschema-Token darf uebrig sein.
// Kommentarzeilen (--) sind ausgenommen - sie sind Freitext des Generators.
function pruefeRestfrei(sqlText, kontext) {
  const funde = [];
  const zeilen = String(sqlText).split('\n');
  for (let i = 0; i < zeilen.length; i += 1) {
    const zeile = zeilen[i];
    if (zeile.trimStart().startsWith('--')) continue;
    if (QUELLTOKEN.test(zeile)) funde.push(`Zeile ${i + 1}: ${zeile.trim().slice(0, 160)}`);
  }
  if (funde.length) {
    throw new Error(
      `Abbildung unvollstaendig (${kontext}): Quellschema-Token nach der Ersetzung gefunden -\n  `
      + funde.slice(0, 20).join('\n  ')
      + (funde.length > 20 ? `\n  ... und ${funde.length - 20} weitere` : ''));
  }
}

module.exports = { ABBILDUNG, bildeSchemaAb, bildeDefinitionAb, pruefeRestfrei };
