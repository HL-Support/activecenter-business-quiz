/**
 * Meldet Serverfehler an GlitchTip (errors.hl-support.biz) - Audit 2026-08-23, P1
 * "private Source Maps zu einem Fehlerdienst".
 *
 * Warum ueberhaupt: Bis hierher landete jeder Serverfehler in `console.error`/dem
 * JSON-Log und damit im Container-Protokoll - sichtbar nur fuer den, der zufaellig
 * hineinsieht. Genau die Fehlerarten dieses Funnels sind aber still: Ein gescheiterter
 * lead-init zeigt dem Interessenten nur ein haengendes Formular, eine geworfene
 * Outbox-Zustellung kostet einen Lead, ohne dass irgendwo etwas rot wird.
 *
 * Warum ohne Bibliothek: Die Laufzeit haengt heute an drei Produktionsabhaengigkeiten
 * (jsonwebtoken, react, react-dom). Ein Sentry-SDK zoege einen erheblichen Baum nach sich
 * fuer etwas, das hier gut hundert Zeilen sind - GlitchTip spricht das
 * Sentry-Envelope-Protokoll, und mehr als ein POST ist es nicht.
 *
 * Drei Eigenschaften sind Pflicht, sonst richtet die Fehlermeldung mehr Schaden an als
 * Nutzen:
 *   1. Sie darf NIE werfen. Ein kaputter Melder darf keine Anfrage kippen.
 *   2. Sie darf NIE warten. Der Aufrufer laeuft weiter, der POST geht nebenher.
 *   3. Sie darf NICHT fluten. Faellt Supabase aus, wiederholt sich derselbe Fehler im
 *      Sekundentakt - ungebremst waere das eine Selbst-Ueberlastung.
 *
 * Vierte Eigenschaft, die dieser Funnel zusaetzlich braucht: Sie darf NICHTS
 * Personenbezogenes hinaustragen. Der Kontext ist deshalb kein freies Objekt, sondern
 * eine feste, kurze Liste (Route, Request-ID, Status). Payloads, Header, Cookies,
 * E-Mail-Adressen und lead_hash koennen so gar nicht erst uebergeben werden - siehe
 * `KONTEXT_FELDER` und `entschaerfen()`.
 */
'use strict';

const crypto = require('crypto');

const { resolveCommit } = require('./commit');

/** Derselbe Fehler wird hoechstens einmal pro Minute gemeldet. */
const GLEICHER_FEHLER_MS = 60 * 1000;
/** Und insgesamt nicht mehr als 20-mal pro Minute, egal wie viele verschiedene Fehler. */
const HOECHSTENS_PRO_MINUTE = 20;
const FENSTER_MS = 60 * 1000;
/** Die Landkarte der zuletzt gemeldeten Fehler darf nicht unbegrenzt wachsen. */
const MAX_SCHLUESSEL = 200;
/** Ein haengender Fehlerdienst darf keinen Socket dauerhaft binden. */
const SENDE_TIMEOUT_MS = 5_000;
/** Mehr Rahmen macht die Gruppierung nicht besser, blaeht die Meldung aber auf. */
const MAX_RAHMEN = 50;
/** Eine Fehlermeldung, die laenger ist als das, ist keine Meldung mehr, sondern ein Dump. */
const MAX_TEXT = 1_000;

/**
 * Die EINZIGEN Kontextfelder, die den Prozess verlassen. Ein Aufrufer, der versehentlich
 * einen Anfrage-Rumpf oder einen Lead-Schluessel mitgibt, bewirkt damit nichts - unbekannte
 * Schluessel werden verworfen, nicht durchgereicht. Bewusst strenger als ein Freitext-`extra`:
 * Vergessen ist wahrscheinlicher als Boeswilligkeit, und ein Payload im Fehlerdienst waere
 * genau die Datenweitergabe, die Audit 13.2.2 ausschliesst.
 */
const KONTEXT_FELDER = ['bereich', 'route', 'request_id', 'status', 'level'];

const ERLAUBTE_STUFEN = new Set(['fatal', 'error', 'warning', 'info']);

// --- Entschaerfen ---------------------------------------------------------------------------

/**
 * Fehlertexte schreiben wir nicht selbst - sie kommen aus Node, aus fetch, aus Supabase.
 * Ein Text wie "duplicate key qz_abc... (markus@example.com)" wuerde sonst genau das
 * hinaustragen, was hier nie hinaus soll.
 *
 * Zweiter, ebenso wichtiger Grund: Ohne diese Normalisierung waere JEDE Meldung eines
 * Massenfehlers einzigartig (weil pro Lead ein anderer Hash darin steht) - die Drosselung
 * unten haette keinen Griff und das Minutenbudget waere sofort aufgebraucht.
 */
function entschaerfen(text) {
  return String(text === undefined || text === null ? '' : text)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/\bqz_[A-Za-z0-9]{6,}/g, '[lead_hash]')
    .replace(/\bac_[A-Za-z0-9]{6,}/g, '[session_hash]')
    .replace(/\beyJ[A-Za-z0-9_-]{10,}(?:\.[A-Za-z0-9_-]+){0,2}/g, '[token]')
    // Nur an URLs und Pfaden schneiden, nicht an jedem Fragezeichen in einem Satz.
    .replace(/((?:https?:\/\/|\/)[^\s"']*?)\?[^\s"']*/gi, '$1?[query]')
    .slice(0, MAX_TEXT);
}

// --- Ziel aus der DSN -----------------------------------------------------------------------

/**
 * Zerlegt die DSN in Endpunkt und Schluessel. Fehlt oder taugt sie nicht, ist der Melder
 * vollstaendig inaktiv: kein fetch, kein Log, keine Warnung. Eine Entwicklungsumgebung ohne
 * GLITCHTIP_DSN soll nicht bei jedem Fehler zusaetzlich ueber den Melder klagen.
 */
function zielAusDsn(dsn) {
  if (!dsn) return null;
  try {
    const url = new URL(dsn);
    const projekt = url.pathname.replace(/^\//, '');
    if (!projekt || !url.username) return null;
    return {
      endpunkt: `${url.protocol}//${url.host}/api/${projekt}/envelope/`,
      schluessel: url.username,
    };
  } catch {
    return null;
  }
}

/** 32 Hexzeichen, wie das Protokoll es verlangt. */
function kennung() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Aus dem Node-Stack die Rahmen ziehen. Ohne sie gruppiert GlitchTip nur ueber den Text,
 * und zwei verschiedene Ursachen mit derselben Meldung landen im selben Eintrag.
 */
function rahmen(stack) {
  const zeilen = String(stack || '')
    .split('\n')
    .slice(1);
  const treffer = [];
  for (const zeile of zeilen) {
    const passt = zeile.match(/^\s*at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?\s*$/);
    if (!passt) continue;
    treffer.push({
      function: passt[1] || '?',
      filename: passt[2],
      lineno: Number(passt[3]),
      colno: Number(passt[4]),
      in_app: !passt[2].includes('node_modules') && !passt[2].startsWith('node:'),
    });
    if (treffer.length >= MAX_RAHMEN) break;
  }
  // Sentry erwartet die aelteste Ebene zuerst.
  return treffer.reverse();
}

/** Uebernimmt ausschliesslich die Felder aus KONTEXT_FELDER, alles andere faellt weg. */
function kontextFiltern(kontext) {
  const sauber = {};
  if (!kontext || typeof kontext !== 'object') return sauber;
  for (const feld of KONTEXT_FELDER) {
    const wert = kontext[feld];
    if (wert === undefined || wert === null || wert === '') continue;
    if (feld === 'status') {
      const zahl = Number(wert);
      if (Number.isFinite(zahl)) sauber.status = String(Math.trunc(zahl));
      continue;
    }
    if (feld === 'level') {
      const stufe = String(wert).toLowerCase();
      if (ERLAUBTE_STUFEN.has(stufe)) sauber.level = stufe;
      continue;
    }
    // Route und Request-ID sind bereits anonymisiert (routeLabelFor bzw. UUID); der Schnitt
    // hier ist die zweite Sicherung, falls jemand doch einen rohen Pfad uebergibt.
    sauber[feld] = entschaerfen(wert).slice(0, 200);
  }
  return sauber;
}

// --- Melder ----------------------------------------------------------------------------------

/**
 * Baut einen Melder. Alles Aeussere ist injizierbar (`env`, `fetchImpl`, `jetzt`), damit die
 * Tests denselben Code fahren wie der Container - ohne Netz und ohne Uhr.
 */
function erzeugeMelder({ env = process.env, fetchImpl = null, jetzt = () => Date.now() } = {}) {
  const ziel = zielAusDsn(String(env.GLITCHTIP_DSN || '').trim());
  const umgebung = env.NODE_ENV === 'production' ? 'production' : 'entwicklung';

  const zuletztGemeldet = new Map();
  let fensterBeginn = 0;
  let imFenster = 0;

  /**
   * Zwei Bremsen uebereinander: derselbe Fehler hoechstens einmal pro Minute, und quer ueber
   * alle Fehler hoechstens 20 Meldungen pro Minute. Die erste faengt den Dauerfehler
   * (Supabase weg), die zweite den Sturm aus vielen verschiedenen Fehlern (Deploy kaputt).
   */
  function darfMelden(schluessel) {
    const zeit = jetzt();

    if (zeit - fensterBeginn > FENSTER_MS) {
      fensterBeginn = zeit;
      imFenster = 0;
    }
    if (imFenster >= HOECHSTENS_PRO_MINUTE) return false;

    const letzte = zuletztGemeldet.get(schluessel);
    if (letzte !== undefined && zeit - letzte < GLEICHER_FEHLER_MS) return false;

    if (zuletztGemeldet.size > MAX_SCHLUESSEL) zuletztGemeldet.clear();
    zuletztGemeldet.set(schluessel, zeit);
    imFenster += 1;
    return true;
  }

  function bauen(fehler, kontext) {
    const istFehler = fehler instanceof Error;
    const typ = entschaerfen(istFehler ? fehler.name || 'Error' : 'Fehler').slice(0, 120);
    const text = entschaerfen(istFehler ? fehler.message : fehler);

    const sauber = kontextFiltern(kontext);
    const bereich = sauber.bereich || sauber.route || 'server';

    // Die Request-ID gehoert NICHT in den Schluessel: sie ist pro Anfrage neu, damit waere
    // jede Meldung einzigartig und die Drosselung wirkungslos.
    const schluessel = `${bereich}|${typ}|${text}`;
    if (!darfMelden(schluessel)) return null;

    const tags = { bereich };
    if (sauber.route) tags.route = sauber.route;
    if (sauber.status) tags.status = sauber.status;

    const extra = {};
    if (sauber.request_id) extra.request_id = sauber.request_id;

    return {
      event_id: kennung(),
      timestamp: new Date().toISOString(),
      platform: 'node',
      level: sauber.level || 'error',
      logger: bereich,
      release: resolveCommit({ env }).commit || 'unbekannt',
      environment: umgebung,
      server_name: 'business-leads-quiz',
      transaction: sauber.route || bereich,
      tags,
      extra,
      exception: {
        values: [
          {
            type: typ,
            value: text,
            stacktrace: istFehler ? { frames: rahmen(fehler.stack) } : undefined,
          },
        ],
      },
    };
  }

  /**
   * Meldet einen Fehler. Gibt nichts zurueck, auf das man warten muesste - bewusst.
   * Wirft nie: der gesamte Rumpf haengt in einem try, und der POST endet in einem
   * verschluckenden catch.
   */
  function melden(fehler, kontext) {
    if (!ziel) return;
    try {
      const ereignis = bauen(fehler, kontext);
      if (!ereignis) return;

      const umschlag = [
        JSON.stringify({ event_id: ereignis.event_id, sent_at: new Date().toISOString() }),
        JSON.stringify({ type: 'event' }),
        JSON.stringify(ereignis),
      ].join('\n');

      const senden = fetchImpl || globalThis.fetch;
      if (typeof senden !== 'function') return;

      const abbruch = new AbortController();
      const frist = setTimeout(() => abbruch.abort(), SENDE_TIMEOUT_MS);
      if (typeof frist.unref === 'function') frist.unref();

      // Kein await: Der Aufrufer wartet nicht. Und ein Fehlschlag hier bleibt folgenlos -
      // sonst wuerde ausgerechnet der Melder zur Fehlerquelle.
      const lauf = senden(ziel.endpunkt, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-sentry-envelope',
          'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${ziel.schluessel}, sentry_client=business-leads-quiz/1.0`,
        },
        body: umschlag,
        signal: abbruch.signal,
      });

      if (lauf && typeof lauf.then === 'function') {
        lauf.then(
          () => clearTimeout(frist),
          () => clearTimeout(frist)
        );
      } else {
        clearTimeout(frist);
      }
    } catch {
      // Ein kaputter Melder darf keine Anfrage kippen (Eigenschaft 1).
    }
  }

  /** Fuer den Notfall: vor dem Beenden des Prozesses kurz Zeit zum Absenden lassen. */
  function nachlauf(ms = 500) {
    return new Promise((fertig) => setTimeout(fertig, ms));
  }

  function eingerichtet() {
    return Boolean(ziel);
  }

  return {
    melden,
    nachlauf,
    eingerichtet,
    _test: {
      ziel,
      bauen,
      darfMelden,
      zuruecksetzen() {
        zuletztGemeldet.clear();
        fensterBeginn = 0;
        imFenster = 0;
      },
    },
  };
}

/**
 * Der Melder des Prozesses. Wird beim Laden aus process.env gebaut; ohne GLITCHTIP_DSN ist
 * er vollstaendig inaktiv und kostet nichts.
 */
const standard = erzeugeMelder();

module.exports = {
  GLEICHER_FEHLER_MS,
  HOECHSTENS_PRO_MINUTE,
  KONTEXT_FELDER,
  erzeugeMelder,
  entschaerfen,
  rahmen,
  standard,
  melden: (fehler, kontext) => standard.melden(fehler, kontext),
  nachlauf: (ms) => standard.nachlauf(ms),
  eingerichtet: () => standard.eingerichtet(),
};
