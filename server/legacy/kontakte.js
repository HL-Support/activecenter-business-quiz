'use strict';

/**
 * Die EINE Tuer zur Kontaktkartei des Altsystems: `POST /webhook/quiz` bei contacts.
 *
 * Vorbild: `analysen/legacy/kontakte.js`. Vertrag: `docs/contacts-quiz-webhook-vertrag.md`
 * — der gilt, nicht §3 des Plans; die Gegenstelle wurde anders gebaut als geplant
 * (Korrekturen K1: `meta.survey` statt `meta.quiz`, K2: Kopf `X-Quiz-Signature`).
 *
 * 🔴 Dieses Modul BAUT den Vertragspayload nicht. Er entsteht in `api/bridge.js`, direkt
 * neben `buildBusinessTypeformPayload`, aus denselben Quellen (`BUSINESS_SCHEMA`,
 * `BUSINESS_COPY`, `questionDefinitions`) und in derselben Schleife. Eine zweite Kopie
 * dieser Semantik waere eine zweite Wahrheit — genau das Muster, das den Antwortverlust
 * drei Monate lang versteckt hat (Falle 1 in STAND-UND-FORTSETZUNG.md). Hier liegt, was
 * mit dem fertigen Rumpf geschieht: pruefen, signieren, senden, Antwort auswerten.
 *
 * 🔴 Und dieses Modul ENTSCHEIDET nichts. Ob gesendet wird, sagt der Modus; welchem
 * Berater der Kontakt am Ende gehoert, sagt die Gegenstelle.
 */

const crypto = require('crypto');

/** Der Registry-Schluessel drueben (config/surveys.php). Unbekannt ⇒ 422. */
const REGISTRY_SCHLUESSEL = 'quiz-erfolgscode';

/** K2: eigener Kopfname, nicht der geteilte `Typeform-Signature` der Nachbarrouten. */
const SIGNATUR_KOPF = 'X-Quiz-Signature';

/**
 * 15 Sekunden — dasselbe Fenster, das der Browser dem Opt-in heute gibt
 * (`fetchWithTimeout(..., 15000)` in src/lib/core.js). Der Worker wiederholt ohnehin;
 * ein haengender Aufruf darf nur keinen Arbeiter blockieren.
 */
const FRIST_MS = 15000;

const MODI = Object.freeze(['aus', 'schatten', 'an']);

function text(wert, max) {
  const roh = wert === null || wert === undefined ? '' : String(wert);
  return roh.trim().slice(0, max);
}

/** Der Rohwert des Schalters. Alles Unbekannte ist `aus` — nie „vermutlich gemeint". */
function modus(env = process.env) {
  const roh = text(env.CONTACTS_QUIZ_MODUS, 20).toLowerCase();
  return MODI.includes(roh) ? roh : 'aus';
}

function ziel(env = process.env) {
  return text(env.CONTACTS_QUIZ_URL, 500);
}

function geheimnis(env = process.env) {
  return text(env.CONTACTS_QUIZ_WEBHOOK_SECRET, 512);
}

function konfiguriert(env = process.env) {
  return Boolean(ziel(env) && geheimnis(env));
}

/**
 * Der WIRKSAME Modus — fail-safe in Richtung des alten, bewiesenen Weges.
 *
 * 🔴 Steht der Schalter auf `an`, fehlt aber Adresse oder Geheimnis, verhaelt sich der
 * Adapter wie `aus`: Die Opt-ins gehen weiter den alten Weg, und es wird laut gemeldet.
 * Der Worker tut das NICHT — bereits eingereihte Auftraege stellt er auf `failed` mit
 * `env_missing`, niemals auf einen Ersatzweg. Ein Lead darf nicht verlorengehen, aber er
 * darf auch nicht unsigniert irgendwohin.
 */
function wirksamerModus(env = process.env) {
  const gewuenscht = modus(env);
  // Nur `an` braucht Adresse und Geheimnis. Der Schatten sendet NIE — ihn an das
  // Geheimnis zu binden hiesse, zwei unabhaengige Dinge zu koppeln und den Schattenlauf
  // ohne Not zu verzoegern.
  if (gewuenscht === 'an' && !konfiguriert(env)) {
    return { modus: 'aus', gewuenscht, grund: 'env_missing' };
  }
  return { modus: gewuenscht, gewuenscht, grund: null };
}

/**
 * Die Pflichtfelder des Vertrags. Was hier durchfaellt, wird NICHT gesendet.
 *
 * Warum die Pruefung hier und nicht drueben: Die Gegenstelle antwortet auf einen
 * unvollstaendigen Rumpf mit 422 — der Auftrag liefe dann durch alle acht Versuche und
 * stuerbe nach vier Stunden, ohne dass irgendwo steht, welches Feld fehlte. Ein lauter
 * Fehler beim Bauen ist billiger als ein toter Auftrag beim Senden.
 */
function pruefeVertrag(rumpf) {
  const fehlend = [];
  const meta = (rumpf && rumpf.meta) || {};
  const kontakt = (rumpf && rumpf.contact) || {};

  if (meta.survey !== REGISTRY_SCHLUESSEL) fehlend.push('meta.survey');
  if (!text(meta.hash, 100)) fehlend.push('meta.hash');
  if (!text(meta.memberId, 50)) fehlend.push('meta.memberId');
  if (!text(meta.language, 5)) fehlend.push('meta.language');
  if (!text(meta.submittedAt, 40)) fehlend.push('meta.submittedAt');
  if (!text(kontakt.firstName, 100)) fehlend.push('contact.firstName');
  if (!text(kontakt.email, 190)) fehlend.push('contact.email');
  if (!Array.isArray(rumpf && rumpf.answers) || rumpf.answers.length === 0) {
    fehlend.push('answers');
  }

  // meta.submissionId fehlt hier absichtlich: Sie entsteht in der Datenbank beim ersten
  // Einreihen (sql/contacts-quiz-uebergabe.sql) und steht erst im eingefrorenen Auftrag.
  // Vor dem SENDEN wird sie geprueft — dort, wo sie da sein muss.
  if (fehlend.length) {
    const fehler = new Error(`vertrag_unvollstaendig:${fehlend.join(',')}`);
    fehler.fehlend = fehlend;
    throw fehler;
  }
  return rumpf;
}

/** HMAC-SHA256 ueber den EXAKTEN rohen Rumpf. Base64, mit `sha256=`-Praefix. */
function signiere(rohRumpf, wert) {
  if (!wert) throw new Error('env_missing:CONTACTS_QUIZ_WEBHOOK_SECRET');
  return `sha256=${crypto.createHmac('sha256', wert).update(rohRumpf, 'utf8').digest('base64')}`;
}

/**
 * Sendet den eingefrorenen Rumpf.
 *
 * 🔴 Der Rumpf wird GENAU EINMAL serialisiert und dieselbe Zeichenkette wird signiert und
 * gesendet. Zweimal `JSON.stringify` waere zweimal dieselbe Ausgabe — heute. Es reicht
 * eine Ordnungsaenderung irgendwo, und die Signatur passt nicht mehr zum Rumpf; der
 * Fehler waere ein 401 ohne erkennbaren Grund.
 */
async function sendeAnContacts(rumpf, env = process.env, holer = fetch) {
  const adresse = ziel(env);
  const wert = geheimnis(env);
  if (!adresse || !wert) {
    const fehler = new Error('env_missing:CONTACTS_QUIZ_URL_ODER_SECRET');
    fehler.envFehlt = true;
    throw fehler;
  }

  const rohRumpf = JSON.stringify(rumpf);
  const abbruch = new AbortController();
  const zeiger = setTimeout(() => abbruch.abort(), FRIST_MS);

  try {
    const antwort = await holer(adresse, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [SIGNATUR_KOPF]: signiere(rohRumpf, wert),
      },
      body: rohRumpf,
      signal: abbruch.signal,
    });

    const roh = await antwort.text().catch(() => '');
    let daten = {};
    try {
      daten = roh ? JSON.parse(roh) : {};
    } catch {
      // Kein JSON ist ein Befund, kein Absturz — die Auswertung stuft ihn als Fehlschlag ein.
      daten = {};
    }

    return { ok: antwort.ok, status: antwort.status, roh, daten, gesendet: rohRumpf };
  } finally {
    clearTimeout(zeiger);
  }
}

/**
 * Wertet die Antwort aus.
 *
 * 🔴 Ein 2xx OHNE `contact_id` ist ein Fehlschlag, kein Erfolg. Die leere Antwort der
 * alten Route hat am 26.08.2026 bei den Nachbarn genau so einen stillen Fehler versteckt.
 * Die Wiederholung ist dank `submissionId` gefahrlos und liefert die Kennungen im
 * Duplikatsfall nach.
 */
function werteAntwortAus({ ok, status, daten } = {}) {
  const inhalt = daten && typeof daten === 'object' ? daten : {};
  const contactId = Number(inhalt.contact_id) || null;
  const surveyId = Number(inhalt.survey_id) || null;
  const duplikat = inhalt.duplicate === true;

  if (!ok) {
    return {
      erfolg: false,
      duplikat,
      status: 'failed',
      httpStatus: status || 0,
      contactId,
      surveyId,
      coachMemberId: null,
      fall: null,
      fehler: `contacts_http_${status || 0}:${text(inhalt.message, 300) || 'ohne_meldung'}`,
    };
  }

  if (!contactId) {
    return {
      erfolg: false,
      duplikat,
      status: 'failed',
      httpStatus: status || 0,
      contactId: null,
      surveyId,
      coachMemberId: null,
      fall: null,
      fehler: 'contacts_2xx_ohne_kennung',
    };
  }

  return {
    erfolg: true,
    duplikat,
    status: duplikat ? 'duplicate' : 'success',
    httpStatus: status || 200,
    contactId,
    surveyId,
    // 🔴 Beide traegt NUR die Erfolgsantwort. Die Duplikat-Antwort laesst sie weg
    // (SurveyIntake.php:419-428) — wer sie nicht beim ersten Mal speichert, bekommt sie
    // nie wieder. Daran haengt Strang M.
    coachMemberId: text(inhalt.coach_member_id, 120) || null,
    fall: text(inhalt.case, 60) || null,
    fehler: null,
  };
}

module.exports = {
  REGISTRY_SCHLUESSEL,
  SIGNATUR_KOPF,
  FRIST_MS,
  MODI,
  modus,
  wirksamerModus,
  konfiguriert,
  ziel,
  geheimnis,
  pruefeVertrag,
  signiere,
  sendeAnContacts,
  werteAntwortAus,
};
