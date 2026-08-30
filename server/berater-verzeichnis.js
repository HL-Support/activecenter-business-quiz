'use strict';

/**
 * Loest den Berater zu einem Funnel-Slug auf.
 *
 * Bis zum 30.08.2026 ging das ausschliesslich ueber einen HTTP-Aufruf an
 * `ac-reconnect.com/db-bridge.php` (`action: lookup_subdomain`) — der letzte Fremdaufruf
 * im Benachrichtigungsweg. Seit dem 30.08. gibt es auf der Plattform das Verzeichnis
 * `leads.berater`, gespiegelt vom n8n-Workflow «AC - Berater-Verzeichnis spiegeln»
 * (alle 15 Minuten aus `prod_activesupport.users`, derselben Maschine).
 *
 * Warum gespiegelt und nicht direkt aus MySQL gelesen: Die Anwendung hat bewusst **keinen**
 * MySQL-Treiber (Abhaengigkeiten: jsonwebtoken, postgres, react, react-dom). Ein zweiter
 * Treiber waere ein neuer Ausfallweg fuer den teuersten Vorgang des Funnels.
 *
 * Abbildung am 30.08.2026 gemessen: `lead_state.berater_slug` == `users.sub_domain`.
 * 95 der 96 im Quiz vorkommenden Slugs stehen im Verzeichnis. Der eine Rest ist `default`
 * — dafuer gibt es in `users` keinen Satz, und fuer Leads mit diesem Slug wurde noch nie
 * ein Hot-Lead-Auftrag erzeugt (0 von 245). Der SQL-Weg verhaelt sich dort wie der alte:
 * kein Treffer, kein Versand.
 */

const VERZEICHNIS_FELDER = [
  'slug',
  'email',
  'first_name',
  'last_name',
  'full_name',
  'country',
  'preferred_language',
  'organisation_name',
  'herbalife_id',
].join(',');

/** Genau die Normalisierung, die der Bridge-Weg seit jeher benutzt. */
function normalisiereSlug(slug) {
  const roh = String(slug ?? '').slice(0, 80).trim().toLowerCase();
  return roh || 'default';
}

/**
 * Bringt eine Verzeichniszeile in die Form, die `buildHotLeadEmail` erwartet.
 * Die Feldnamen folgen der Antwort der alten Bridge, damit der Aufrufer unveraendert bleibt.
 */
function ausVerzeichniszeile(zeile) {
  if (!zeile || !zeile.email) return null;
  const vorname = zeile.first_name || '';
  const nachname = zeile.last_name || '';
  return {
    found: true,
    email: zeile.email,
    first_name: vorname || null,
    last_name: nachname || null,
    name: zeile.full_name || [vorname, nachname].filter(Boolean).join(' ') || null,
    organisation_name: zeile.organisation_name || null,
    country: zeile.country || null,
    preferred_newsletter_language: zeile.preferred_language || null,
    herbalife_id: zeile.herbalife_id || null,
    quelle: 'verzeichnis',
  };
}

/**
 * Liest den Berater aus `leads.berater`.
 * `leseJson` ist der modusbewusste Leser der Anwendung (`supabaseJson`) — dadurch braucht
 * dieses Modul weder eine Verbindung noch Kenntnis des Betriebsmodus.
 */
async function beraterAusVerzeichnis(slug, leseJson) {
  const normalisiert = normalisiereSlug(slug);
  const zeilen = await leseJson(
    `berater?slug=eq.${encodeURIComponent(normalisiert)}` +
      `&select=${VERZEICHNIS_FELDER}&limit=1`
  );
  const zeile = Array.isArray(zeilen) ? zeilen[0] : null;
  return ausVerzeichniszeile(zeile);
}

/** Felder, die im Schattenvergleich zaehlen. Reihenfolge = Ausgabereihenfolge. */
const VERGLEICHSFELDER = [
  'email',
  'first_name',
  'last_name',
  'organisation_name',
  'country',
  'preferred_newsletter_language',
];

/**
 * Vergleicht die Antwort der Bridge mit der aus dem Verzeichnis.
 * Liefert die Namen der abweichenden Felder — leer heisst deckungsgleich.
 * Verglichen wird nachsichtig: leer, null und undefined gelten als gleich, und bei
 * Zeichenketten wird Gross-/Kleinschreibung und Randabstand ignoriert. Sonst meldete
 * der Vergleich Unterschiede, die keine sind.
 */
function vergleiche(ausBridge, ausVerzeichnis) {
  if (!ausBridge && !ausVerzeichnis) return [];
  if (!ausBridge) return ['nur_im_verzeichnis'];
  if (!ausVerzeichnis) return ['nur_in_der_bridge'];
  const gleich = (a, b) => {
    const x = String(a ?? '').trim().toLowerCase();
    const y = String(b ?? '').trim().toLowerCase();
    return x === y;
  };
  return VERGLEICHSFELDER.filter((feld) => !gleich(ausBridge[feld], ausVerzeichnis[feld]));
}

module.exports = {
  VERZEICHNIS_FELDER,
  VERGLEICHSFELDER,
  normalisiereSlug,
  ausVerzeichniszeile,
  beraterAusVerzeichnis,
  vergleiche,
};
