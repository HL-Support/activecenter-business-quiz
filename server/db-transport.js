'use strict';

// Transportweg zur Datenbank - Phase 4 Stufe B.
//
//   LEADS_DB_MODUS=postgrest  (Standard, heutiger Zustand: Supabase über HTTP)
//   LEADS_DB_MODUS=direkt     (Plattform-DB mit direktem Treiber, Schema leads)
//
// Warum eine Schicht und kein Umschreiben aller Aufrufer: Die ~30 Aufrufstellen
// prüfen `response.ok`, lesen `response.status` und rufen `.json()`. Ein Umschreiben
// aller Stellen wäre ein Grosseingriff in den kritischen Pfad - genau dort, wo dieses
// Projekt seine teuersten Fehler hatte. Stattdessen liefert der direkte Weg ein
// Objekt, das sich wie eine HTTP-Antwort verhält. Der Aufrufer merkt keinen
// Unterschied; der Vertrag bleibt Zeile für Zeile derselbe.
//
// 🔴 Der Modus gilt GLOBAL. Eine Teilumstellung (RPCs direkt, Tabellen über HTTP)
// hiesse, gleichzeitig in zwei Datenbanken zu schreiben - Split-Brain im Kleinen.
// Deshalb gibt es genau einen Schalter, nicht mehrere.

const { uebersetze } = require('./postgrest-nach-sql.js');

const MODUS = String(process.env.LEADS_DB_MODUS || 'postgrest').toLowerCase();
const SCHEMA = String(process.env.LEADS_DB_SCHEMA || 'leads');

function istDirekt() {
  return MODUS === 'direkt';
}

let verbindung = null;

function verbindungHolen() {
  if (verbindung) return verbindung;
  let postgres;
  try {
    postgres = require('postgres');
  } catch {
    throw new Error('LEADS_DB_MODUS=direkt, aber das Paket "postgres" fehlt.');
  }
  const fehlend = ['LEADS_DB_HOST', 'LEADS_DB_NAME', 'LEADS_DB_BENUTZER', 'LEADS_DB_PASSWORT']
    .filter((n) => !process.env[n]);
  if (fehlend.length) throw new Error(`Zugangsdaten fehlen: ${fehlend.join(', ')}`);

  verbindung = postgres({
    host: process.env.LEADS_DB_HOST,
    port: Number(process.env.LEADS_DB_PORT || 5432),
    database: process.env.LEADS_DB_NAME,
    username: process.env.LEADS_DB_BENUTZER,
    password: process.env.LEADS_DB_PASSWORT,
    // Die Rolle leads_app hat CONNECTION LIMIT 8; darunter bleiben, damit ein
    // Lastspitzen-Moment nicht an der Rollen-Grenze scheitert.
    max: Number(process.env.LEADS_DB_POOL || 6),
    idle_timeout: 30,
    connect_timeout: 10,
    // Die Rolle bringt statement_timeout=8s selbst mit (ALTER ROLE). search_path hier
    // gesetzt, damit unqualifizierte Verweise dieselben Objekte treffen wie in der
    // Quelle - der Uebersetzer qualifiziert zwar, aber Funktionsruempfe tun es nicht.
    connection: { search_path: `${SCHEMA}, ${SCHEMA}_analytics` },
    onnotice: () => {},
    transform: {
      // JSON-Spalten kommen als Objekt zurueck - genau wie ueber PostgREST.
      undefined: null,
    },
  });
  return verbindung;
}

// Antwort-Attrappe: verhält sich nach aussen wie das fetch-Response, das die
// Aufrufer erwarten. Bewusst minimal - nur was im Projekt wirklich genutzt wird
// (ok, status, json, text). Alles andere fehlt absichtlich, damit ein Aufrufer mit
// anderen Erwartungen laut scheitert statt still etwas Falsches zu bekommen.
function alsAntwort(zeilen, erwartetZeilen) {
  const nutzlast = erwartetZeilen ? zeilen : null;
  const text = nutzlast === null ? '' : JSON.stringify(nutzlast);
  return {
    ok: true,
    // 204 wenn kein Inhalt - dieselbe Kennzahl, die der Leere-Antwort-Guard in
    // supabaseJson prueft (Vorfall void-RPC, 27.08.2026).
    status: nutzlast === null ? 204 : 200,
    async json() { return nutzlast; },
    async text() { return text; },
  };
}

/**
 * Setzt einen Aufruf im DIREKTEN Modus ab. Signatur wie supabaseRequest.
 */
async function direktRequest(pfad, options = {}) {
  const { sql, werte, erwartetZeilen } = uebersetze(pfad, options, SCHEMA);
  const sql_ = verbindungHolen();
  try {
    const zeilen = await sql_.unsafe(sql, werte);
    return alsAntwort(Array.from(zeilen), erwartetZeilen);
  } catch (e) {
    // Fehler im selben Gewand wie der HTTP-Weg: Aufrufer werten `error.status` aus.
    const fehler = new Error(`Datenbank ${pfad} fehlgeschlagen: ${e.message}`);
    fehler.status = 500;
    fehler.details = e.message;
    fehler.sql = sql;
    throw fehler;
  }
}

async function schliessen() {
  if (verbindung) {
    await verbindung.end({ timeout: 5 });
    verbindung = null;
  }
}

module.exports = { MODUS, SCHEMA, istDirekt, direktRequest, schliessen };
