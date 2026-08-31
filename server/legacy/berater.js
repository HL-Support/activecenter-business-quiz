'use strict';

/**
 * Liest die Berateridentitaet direkt aus der Legacy-MySQL — ueber die schmale Lese-View
 * `prod_quiz.quiz_berater` (Definition: `sql/legacy-views.sql`), nicht ueber Rohtabellen.
 *
 * 🔴 Aufgabe dieses Moduls: die Antwort der alten Bridge (`db-bridge.php`,
 * `action: lookup_subdomain`) ZEICHENGLEICH nachbauen. Jede Abweichung waere eine stille
 * Verhaltensaenderung — genau der Fehler, der am 31.08.2026 beim Spiegel auftrat
 * (`o.name` statt `o.org_name` → "EaglesFit-Support" statt "EaglesFit").
 *
 * Deshalb ist auch die laenderspezifische Telefonformatierung nachgebaut, obwohl die
 * heutigen Leser ohnehin alle Nicht-Ziffern entfernen: Gleichheit ist billiger als ein
 * offener Punkt.
 */

const { abfragen, konfiguriert } = require('./datenbank');

const SPALTEN = [
  'slug',
  'user_id',
  'first_name',
  'last_name',
  'full_name',
  'email',
  'herbalife_id',
  'preferred_newsletter_language',
  'organisation_name',
  'organisation_id',
  'country',
  'street',
  'postal',
  'place',
  'area_code',
  'phone_number',
  'image',
  'avatar_150',
  'avatar_300',
  'avatar_600',
  'instagram',
  'facebook',
].join(', ');

const SQL = `SELECT ${SPALTEN} FROM prod_quiz.quiz_berater WHERE slug = ? LIMIT 1`;

/** Genau die Normalisierung, die der Bridge-Weg seit jeher benutzt. */
function normalisiereSlug(slug) {
  const roh = String(slug ?? '')
    .slice(0, 80)
    .trim()
    .toLowerCase();
  return roh || 'default';
}

/**
 * Vorwahl normalisieren — Nachbau von db-bridge.php:1355-1362.
 * "0049"/"390049" → "+49", "49" → "+49", "+41" bleibt "+41".
 */
function vorwahl(roh) {
  const wert = String(roh ?? '').trim();
  const doppelnull = wert.match(/0{2}(\d+)$/);
  if (doppelnull) return `+${doppelnull[1]}`;
  if (wert !== '' && wert[0] !== '+') return `+${wert}`;
  return wert;
}

/**
 * Laenderspezifische Anzeigeformatierung — Nachbau von db-bridge.php:1364-1396.
 * Reine Anzeige; der WhatsApp-Link entfernt die Leerzeichen ohnehin per JS.
 */
function formatiereNummer(landesvorwahl, roh) {
  const sauber = String(roh ?? '')
    .trim()
    .replace(/^0/, '');
  const ziffern = sauber.replace(/\D/g, '');
  const land = String(landesvorwahl || '').replace(/^\+/, '');

  if (land === '41' && ziffern.length === 9) {
    return `${ziffern.slice(0, 2)} ${ziffern.slice(2, 5)} ${ziffern.slice(5, 7)} ${ziffern.slice(7, 9)}`;
  }
  if (land === '49') {
    if (ziffern.length >= 10 && ziffern[0] === '1') {
      return `${ziffern.slice(0, 3)} ${ziffern.slice(3, 7)} ${ziffern.slice(7)}`;
    }
    if (ziffern.length >= 9) {
      return `${ziffern.slice(0, 3)} ${ziffern.slice(3, 6)} ${ziffern.slice(6)}`;
    }
    return sauber;
  }
  if (land === '43' && ziffern.length >= 10 && ziffern[0] === '6') {
    return `${ziffern.slice(0, 3)} ${ziffern.slice(3, 6)} ${ziffern.slice(6)}`;
  }
  if (land === '39' && ziffern.length === 10 && ziffern[0] === '3') {
    return `${ziffern.slice(0, 3)} ${ziffern.slice(3, 6)} ${ziffern.slice(6)}`;
  }
  return sauber;
}

/** db-bridge.php:1396 — Vorwahl und formatierte Nummer, getrimmt. */
function telefon(areaCode, phoneNumber) {
  const prefix = vorwahl(areaCode);
  const fmt = formatiereNummer(prefix, phoneNumber);
  return prefix || fmt ? `${prefix} ${fmt}`.trim() : '';
}

/**
 * Bringt eine Zeile der View in exakt die Form, die `db-bridge.php` zurueckgibt
 * (Belegstelle: db-bridge.php:1404-1436).
 *
 * 🔴 `country` steht NUR im verschachtelten `address` — ein flaches `country` gibt es in
 * der Bridge-Antwort nicht. Der Verbraucher liest `coach?.address?.country || coach?.country`
 * (api/lead-outbox-worker.js:444).
 *
 * Bewusst NICHT nachgebaut: `marketing_status`, `marketing_level_id`, `level_name`,
 * `level_id` — kein Leser im Quiz (ausgezaehlt). Sie stehen als `null` in der Antwort,
 * damit die Feldmenge dieselbe bleibt.
 */
function ausZeile(zeile) {
  if (!zeile || !zeile.email) return null;
  const vorname = zeile.first_name || '';
  const nachname = zeile.last_name || '';
  const vollerName = String(zeile.full_name || `${vorname} ${nachname}`).trim();
  const memberId = String(zeile.herbalife_id ?? '').trim();

  return {
    found: true,
    source: 'user',
    member_id: memberId,
    ref_id: memberId,
    match: memberId !== '' ? '1' : '0',
    id: Number(zeile.user_id),
    first_name: zeile.first_name,
    last_name: zeile.last_name,
    full_name: vollerName,
    email: zeile.email,
    phone: telefon(zeile.area_code, zeile.phone_number),
    herbalife_id: zeile.herbalife_id,
    organisation_id: zeile.organisation_id,
    marketing_status: null,
    marketing_level_id: null,
    level_name: null,
    level_id: null,
    preferred_newsletter_language: zeile.preferred_newsletter_language,
    avatar_150: zeile.avatar_150,
    avatar_300: zeile.avatar_300,
    avatar_600: zeile.avatar_600,
    image: zeile.image,
    instagram: zeile.instagram || null,
    facebook: zeile.facebook || null,
    organisation_name: zeile.organisation_name,
    address: {
      street: zeile.street,
      postal: zeile.postal,
      place: zeile.place,
      country: zeile.country,
    },
    quelle: 'mysql',
  };
}

/**
 * Liest den Berater. Liefert `null`, wenn es ihn nicht gibt oder das Modul nicht
 * konfiguriert ist — wirft nur bei echten Datenbankfehlern; der Aufloeser faengt sie.
 */
async function beraterAusMysql(slug, env = process.env) {
  if (!konfiguriert(env)) return null;
  const zeilen = await abfragen(SQL, [normalisiereSlug(slug)], env);
  return ausZeile(Array.isArray(zeilen) ? zeilen[0] : null);
}

module.exports = {
  SPALTEN,
  SQL,
  normalisiereSlug,
  vorwahl,
  formatiereNummer,
  telefon,
  ausZeile,
  beraterAusMysql,
};
