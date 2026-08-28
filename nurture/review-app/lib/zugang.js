/**
 * Zugangsprüfung der Review-App — bewusst OHNE Next.js-Abhängigkeit,
 * damit sie im Testlauf des Hauptprojekts geprüft werden kann.
 *
 * Anlass (28.08.2026): Die App bot GET UND PATCH auf die Mautic-Vorlagen mit dem
 * Mautic-admin-Konto — ohne jede Zugangsprüfung, öffentlich erreichbar. Jeder mit der
 * URL konnte die laufenden Nurture-Mails überschreiben.
 *
 * 🔴 Die wichtigste Entscheidung hier ist FAIL-CLOSED: Ist kein Passwort konfiguriert,
 * wird ALLES abgewiesen. Der übliche Fehler ist das Gegenteil — "kein Passwort gesetzt,
 * also niemand prüfen" — und genau dann steht die Tür nach einem vergessenen
 * Umgebungswert wieder offen, ohne dass es jemand merkt.
 */

const BENUTZER_STANDARD = 'review';

/** Zeitkonstanter Vergleich: Die Laufzeit darf nicht verraten, wie viele Zeichen stimmen. */
function gleichOhneZeitverrat(a, b) {
  const links = String(a ?? '');
  const rechts = String(b ?? '');
  // Längenunterschied fliesst als Abweichung ein, statt früh abzubrechen.
  let abweichung = links.length ^ rechts.length;
  const laenge = Math.max(links.length, rechts.length);
  for (let i = 0; i < laenge; i += 1) {
    abweichung |= (links.charCodeAt(i) || 0) ^ (rechts.charCodeAt(i) || 0);
  }
  return abweichung === 0;
}

// Bewusst nur `atob`: Das gibt es in Node ab 16 UND in der Edge-Laufzeit, in der die
// Next.js-Middleware laeuft. Ein `require('node:buffer')` waere dort nicht verfuegbar.
function base64Dekodieren(wert) {
  try {
    return atob(wert);
  } catch {
    return null;
  }
}

/**
 * @param {string|null|undefined} authHeader  Inhalt des Authorization-Kopfes
 * @param {object} umgebung  { REVIEW_PASS, REVIEW_USER }
 * @returns {{ok: boolean, grund: string}}
 */
function pruefeZugang(authHeader, umgebung = {}) {
  const passwort = String(umgebung.REVIEW_PASS ?? '').trim();
  if (!passwort) {
    // FAIL-CLOSED. Ohne konfiguriertes Passwort ist die App zu, nicht offen.
    return { ok: false, grund: 'kein_passwort_konfiguriert' };
  }

  const kopf = String(authHeader ?? '').trim();
  if (!kopf) return { ok: false, grund: 'kein_authorization_kopf' };

  const [schema, ...rest] = kopf.split(' ');
  if (String(schema).toLowerCase() !== 'basic') return { ok: false, grund: 'falsches_schema' };

  const roh = base64Dekodieren(rest.join(' ').trim());
  if (roh === null) return { ok: false, grund: 'kein_gueltiges_base64' };

  const trenner = roh.indexOf(':');
  if (trenner < 0) return { ok: false, grund: 'kein_doppelpunkt' };

  const benutzer = roh.slice(0, trenner);
  const eingegeben = roh.slice(trenner + 1);
  const erwarteterBenutzer = String(umgebung.REVIEW_USER ?? '').trim() || BENUTZER_STANDARD;

  // Beide Vergleiche IMMER ausführen, damit die Laufzeit nicht verrät, welcher
  // Teil danebenlag.
  const benutzerStimmt = gleichOhneZeitverrat(benutzer, erwarteterBenutzer);
  const passwortStimmt = gleichOhneZeitverrat(eingegeben, passwort);
  if (!benutzerStimmt || !passwortStimmt) return { ok: false, grund: 'zugangsdaten_falsch' };

  return { ok: true, grund: 'ok' };
}

module.exports = { pruefeZugang, BENUTZER_STANDARD };
