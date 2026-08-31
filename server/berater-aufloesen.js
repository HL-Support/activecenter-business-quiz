'use strict';

/**
 * Ein Auflöser für die Berateridentität — für ALLE vier Stellen, die sie brauchen.
 *
 * Vorher fragten vier Stellen dasselbe auf vier Wegen:
 *   S1 `api/bridge.js` resolveConsultantLookup      — bei JEDEM Seitenaufruf des Funnels
 *   S2 `api/bridge.js` ensureBusinessSubmissionIdentity — beim Absenden ohne member_id
 *   S3 `api/bridge.js` loadCompletionNotificationContext — nach den drei Videos
 *   S4 `api/lead-outbox-worker.js`                   — bei jeder Hot-Lead-Mail
 *
 * Jetzt gibt es einen Weg und einen Schalter. Damit ist die Datenquelle eine
 * Betriebsentscheidung, keine Codeänderung — und jede Umschaltung ist EINE Änderung auf
 * EINEM Pfad.
 *
 * 🔴 Der Standard ist `bridge`. Ein Deploy ohne gesetzte Variablen ändert NICHTS.
 */

const STELLEN = Object.freeze({
  FUNNEL: 'funnel',
  SUBMIT: 'submit',
  ABSCHLUSS: 'abschluss',
  MAIL: 'mail',
});

const QUELLEN = Object.freeze(['bridge', 'verzeichnis', 'mysql']);

/** Frist je Stelle. Der Funnel darf nie an einer hängenden Legacy-DB kleben. */
const FRIST_MS = Object.freeze({
  [STELLEN.FUNNEL]: 2500,
  [STELLEN.SUBMIT]: 2500,
  [STELLEN.ABSCHLUSS]: 2500,
  // Die Outbox wiederholt ohnehin — hier darf es länger dauern als im Funnel.
  [STELLEN.MAIL]: 5000,
});

const ENV_JE_STELLE = Object.freeze({
  [STELLEN.FUNNEL]: 'COACH_LOOKUP_SOURCE_FUNNEL',
  [STELLEN.SUBMIT]: 'COACH_LOOKUP_SOURCE_SUBMIT',
  [STELLEN.ABSCHLUSS]: 'COACH_LOOKUP_SOURCE_ABSCHLUSS',
  [STELLEN.MAIL]: 'COACH_LOOKUP_SOURCE_MAIL',
});

/**
 * Liest die Schalter.
 *
 * 🔴 Abwärtskompatibilität ist Pflicht: Der heute produktiv gesetzte Wert `beide` wird
 * weiter angenommen und als „Bridge entscheidet, Verzeichnis wird gemessen" gedeutet.
 * Sonst bräche der laufende Schattenlauf mit dem Deploy dieses Codes ab.
 */
function schalter(stelle, env = process.env) {
  const roh = String(env.COACH_LOOKUP_SOURCE || '').trim().toLowerCase();
  let quelle = 'bridge';
  let schatten = String(env.COACH_LOOKUP_SCHATTEN || '').trim().toLowerCase() || 'aus';

  if (roh === 'beide') {
    quelle = 'bridge';
    if (schatten === 'aus') schatten = 'verzeichnis';
  } else if (QUELLEN.includes(roh)) {
    quelle = roh;
  }

  const jeStelle = String(env[ENV_JE_STELLE[stelle]] || '').trim().toLowerCase();
  if (QUELLEN.includes(jeStelle)) quelle = jeStelle;

  if (!QUELLEN.includes(schatten)) schatten = 'aus';
  // Sich selbst zu vergleichen ist sinnlos.
  if (schatten === quelle) schatten = 'aus';

  return { quelle, schatten };
}

function mitFrist(versprechen, ms, was) {
  let zeiger;
  const frist = new Promise((_, ab) => {
    zeiger = setTimeout(() => ab(new Error(`${was}_timeout_${ms}ms`)), ms);
  });
  return Promise.race([versprechen, frist]).finally(() => clearTimeout(zeiger));
}

/**
 * Holt den Berater aus einer benannten Quelle. Liefert `{ status, data }` — dieselbe Form,
 * die `proxyToBridge` fuer `lookup_subdomain` liefert, damit die Aufrufer unveraendert
 * bleiben koennen.
 */
async function ausQuelle(quelle, slug, stelle, quellen) {
  if (quelle === 'bridge') {
    return quellen.bridge();
  }
  const leser = quelle === 'mysql' ? quellen.mysql : quellen.verzeichnis;
  if (typeof leser !== 'function') {
    throw new Error(`quelle_${quelle}_nicht_verfuegbar`);
  }
  const berater = await mitFrist(
    Promise.resolve(leser(slug)),
    FRIST_MS[stelle] || 2500,
    quelle
  );
  return { status: 200, data: berater || { found: false } };
}

/**
 * Der Auflöser.
 *
 * @param {object} p
 * @param {string} p.slug              der Berater-Slug
 * @param {string} p.stelle            eine der STELLEN
 * @param {object} p.quellen           { bridge(), verzeichnis(slug), mysql(slug) }
 * @param {function} [p.schattenNotiz] (befund) => void — schreibt haltbar, darf nie werfen
 * @param {object} [p.env]
 * @param {function} [p.vergleiche]    (a, b) => string[] — Feldvergleich
 * @returns {Promise<{status:number,data:object,quelle:string}>}
 */
async function beraterAufloesen({ slug, stelle, quellen, schattenNotiz, env, vergleiche }) {
  const { quelle, schatten } = schalter(stelle, env || process.env);

  let ergebnis;
  try {
    ergebnis = await ausQuelle(quelle, slug, stelle, quellen);
  } catch (fehler) {
    // 🔴 Rückfall: Faellt die gewaehlte Quelle aus, entscheidet die Bridge — nie ein
    // halbes Ergebnis. Ein Fehler aus legacy/ erreicht nie einen Verbraucher.
    notiere(schattenNotiz, {
      slug,
      stelle,
      quelle,
      abweichungen: [`${quelle}_fehler`],
      fehler: fehler.message,
    });
    if (quelle === 'bridge') throw fehler;
    ergebnis = await quellen.bridge();
    return { ...ergebnis, quelle: 'bridge_rueckfall' };
  }

  if (schatten !== 'aus' && typeof vergleiche === 'function') {
    // Nur messen, nie entscheiden. Ein Fehler im Schattenweg darf den Aufruf nicht
    // gefaehrden — deshalb faengt der Vergleich alles ab.
    try {
      const zweit = await ausQuelle(schatten, slug, stelle, quellen);
      const a = ergebnis.data && ergebnis.data.found ? ergebnis.data : null;
      const b = zweit.data && zweit.data.found ? zweit.data : null;
      const abweichungen = vergleiche(a, b);
      notiere(schattenNotiz, { slug, stelle, quelle, schatten, abweichungen });
    } catch (fehler) {
      notiere(schattenNotiz, {
        slug,
        stelle,
        quelle,
        schatten,
        abweichungen: [`${schatten}_fehler`],
        fehler: fehler.message,
      });
    }
  }

  return { ...ergebnis, quelle };
}

/** Schreibt den Befund — und schluckt jeden Fehler dabei. Ein Protokoll ist nie ein Datenpfad. */
function notiere(schattenNotiz, befund) {
  try {
    console.warn('[berater-vergleich] ' + JSON.stringify(befund));
  } catch {
    /* egal */
  }
  if (typeof schattenNotiz !== 'function') return;
  try {
    const ergebnis = schattenNotiz(befund);
    if (ergebnis && typeof ergebnis.catch === 'function') ergebnis.catch(() => {});
  } catch {
    /* egal */
  }
}

/**
 * Baut die haltbare Schattennotiz.
 *
 * 🔴 Warum es sie gibt: Der Vergleich lebte nur im Containerprotokoll — und ein Deploy
 * ersetzt den Container. Am 31.08.2026 sind so binnen zwei Stunden zweimal alle
 * gesammelten Vergleiche verschwunden. Ohne haltbaren Speicher duerfte das Projekt bis
 * zum Umschalten nicht mehr deployen; das waere eine absurde Einschraenkung.
 *
 * Der Datenzugang wird eingespeist (`rpc`), damit dieses Modul ihn nicht kennen muss.
 * Ziel: `leads.notiere_berater_vergleich` (sql/berater-vergleich.sql), aggregiert je Tag.
 */
function schattenNotizUeberRpc(rpc) {
  if (typeof rpc !== 'function') return undefined;
  return (befund) =>
    rpc('notiere_berater_vergleich', {
      p_stelle: String(befund.stelle || '?').slice(0, 40),
      p_slug: String(befund.slug || '?').slice(0, 80),
      p_quelle: String(befund.quelle || '?').slice(0, 40),
      p_schatten: String(befund.schatten || 'aus').slice(0, 40),
      // Kanonisch sortiert, damit dieselbe Abweichung immer dieselbe Zeile trifft.
      p_abweichungen: [...(befund.abweichungen || [])].sort().join(',').slice(0, 400),
    });
}

module.exports = {
  STELLEN,
  QUELLEN,
  FRIST_MS,
  schalter,
  beraterAufloesen,
  schattenNotizUeberRpc,
};
