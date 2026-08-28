'use strict';

// Übersetzt die PostgREST-Aufrufe dieses Projekts in SQL - Fundament für Phase 4
// Stufe B (direkter Treiber statt PostgREST).
//
// 🔴 GRUNDSATZ: Was dieser Übersetzer nicht sicher versteht, ist ein FEHLER - niemals
// eine Vermutung. Ein Filter, der still verloren geht, liefert zu viele Zeilen; ein
// falsch geratener Konflikt-Zweig überschreibt Daten. Beides fällt nicht auf, und
// genau diese Klasse "stiller Verlust" hat das Projekt schon mehrfach getroffen.
// Deshalb wirft jede unbekannte Form, statt etwas Plausibles zu bauen.
//
// Abgedeckt ist exakt die im Repo verwendete Teilmenge (am 27.08.2026 vollständig
// ausgezählt): Operatoren eq/neq/gt/gte/lt/lte/is/in, Parameter select/limit/order/
// on_conflict, Methoden GET/POST/PATCH, Prefer resolution=merge-duplicates|
// ignore-duplicates und return=minimal|representation.
//
// Erweitert am 28.08.2026 für den Business-Kalkulator (UMZUG-COOLIFY-POSTGRES.md §4,
// gegen dessen echte 14 Abfragen gemessen): die not.-Negation (not.is.null, not.eq.…),
// die Oder-Gruppe or=(a.eq.1,b.in.(2,3)) und offset mit Obergrenze. offset war bewusst
// gesperrt (hier wird per Keyset geblättert); die Kontaktliste des Kalkulators blättert
// aber per LIMIT/OFFSET über höchstens 250 Zeilen je Seite - dafür ist OFFSET
// unbedenklich, solange eine harte Grenze verhindert, dass ein Ausreisser die
// Datenbank ganze Tabellen durchzählen lässt.
//
// Bezeichner werden NICHT aus Nutzereingaben gebildet - sie stammen aus fest im Code
// stehenden Pfaden. Trotzdem werden sie streng geprüft (nur [a-z_][a-z0-9_]*), damit
// eine künftige dynamische Zusammensetzung nicht unbemerkt zur Lücke wird. WERTE
// gehen ausnahmslos als Parameter, nie in den SQL-Text.

const BEZEICHNER = /^[a-z_][a-z0-9_]*$/i;

const OPERATOREN = {
  eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=',
};

// Obergrenze für OFFSET: gross genug für jede echte Blätterung (Kontaktliste: max. 250
// Zeilen je Seite), klein genug, dass ein durchgedrehter Aufrufer die Datenbank nicht
// ganze Tabellen überspringen-und-zählen lässt.
const OFFSET_OBERGRENZE = 10000;

function pruefeBezeichner(name, was) {
  if (!BEZEICHNER.test(String(name || ''))) {
    throw new Error(`Unzulaessiger ${was}: ${JSON.stringify(name)}`);
  }
  return name;
}

// PostgREST kodiert Werte in der URL; `is.null` und `in.(a,b)` sind Sonderformen.
function filterBedingung(spalte, roh, werte) {
  pruefeBezeichner(spalte, 'Spaltenname');
  const punkt = roh.indexOf('.');
  if (punkt < 0) throw new Error(`Filter ohne Operator: ${spalte}=${roh}`);
  const op = roh.slice(0, punkt);

  if (op === 'not') {
    // PostgREST-Negation: not.is.null, not.eq.x, … - der Rest ist ein gewöhnlicher
    // Operatorausdruck, der rekursiv übersetzt und als Ganzes verneint wird.
    return `NOT (${filterBedingung(spalte, roh.slice(punkt + 1), werte)})`;
  }

  const wert = decodeURIComponent(roh.slice(punkt + 1));

  if (op === 'is') {
    // Nur die im Projekt verwendeten Formen - "is.true" o.ae. bewusst nicht geraten.
    if (wert === 'null') return `${spalte} IS NULL`;
    if (wert === 'not.null') return `${spalte} IS NOT NULL`;
    throw new Error(`Nicht unterstuetzte is-Form: ${spalte}=is.${wert}`);
  }

  if (op === 'in') {
    // Form: in.(a,b,c) - PostgREST erlaubt Anfuehrungszeichen um Elemente.
    const innen = wert.replace(/^\(/, '').replace(/\)$/, '');
    const teile = innen.length ? innen.split(',').map((t) => t.replace(/^"|"$/g, '')) : [];
    if (!teile.length) return 'false'; // leere IN-Liste trifft nichts
    const platz = teile.map((t) => { werte.push(t); return `$${werte.length}`; });
    return `${spalte} IN (${platz.join(', ')})`;
  }

  const sqlOp = OPERATOREN[op];
  if (!sqlOp) throw new Error(`Unbekannter Operator: ${spalte}=${op}.…`);
  werte.push(wert);
  return `${spalte} ${sqlOp} $${werte.length}`;
}

// PostgREST-Oder-Gruppe: or=(a.eq.1,b.in.(2,3)). Die Teile trennt ein Komma auf oberster
// Ebene - Kommata INNERHALB von in.(…) gehören zum Teil und dürfen nicht trennen, deshalb
// wird die Klammertiefe mitgezählt. Verschachtelte Gruppen (and(…), or(…)) kommen im
// Kalkulator nicht vor und scheitern laut an der Bezeichnerprüfung.
function oderGruppe(roh, werte) {
  const dekodiert = decodeURIComponent(roh);
  if (!dekodiert.startsWith('(') || !dekodiert.endsWith(')')) {
    throw new Error(`Unzulaessige or-Gruppe: ${roh}`);
  }
  const innen = dekodiert.slice(1, -1);
  const teile = [];
  let tiefe = 0;
  let aktuell = '';
  for (const zeichen of innen) {
    if (zeichen === '(') tiefe += 1;
    if (zeichen === ')') tiefe -= 1;
    if (tiefe < 0) throw new Error(`Unzulaessige or-Gruppe: ${roh}`);
    if (zeichen === ',' && tiefe === 0) {
      teile.push(aktuell);
      aktuell = '';
      continue;
    }
    aktuell += zeichen;
  }
  if (tiefe !== 0) throw new Error(`Unzulaessige or-Gruppe: ${roh}`);
  teile.push(aktuell);
  if (teile.length === 1 && !teile[0]) throw new Error(`Leere or-Gruppe: ${roh}`);
  const bedingungen = teile.map((teil) => {
    // In der Gruppe steht der Spaltenname VOR dem ersten Punkt: spalte.op.wert.
    const punkt = teil.indexOf('.');
    if (punkt < 0) throw new Error(`or-Teil ohne Operator: ${teil}`);
    return filterBedingung(teil.slice(0, punkt), teil.slice(punkt + 1), werte);
  });
  return `(${bedingungen.join(' OR ')})`;
}

function ordnung(roh) {
  // Form: spalte.asc / spalte.desc, mehrere durch Komma getrennt.
  return roh.split(',').map((teil) => {
    const [spalte, richtungRoh = 'asc'] = teil.split('.');
    pruefeBezeichner(spalte, 'Sortierspalte');
    const richtung = richtungRoh.toLowerCase();
    if (richtung !== 'asc' && richtung !== 'desc') {
      throw new Error(`Unbekannte Sortierrichtung: ${teil}`);
    }
    return `${spalte} ${richtung.toUpperCase()}`;
  }).join(', ');
}

function spaltenliste(roh) {
  if (!roh || roh === '*') return '*';
  return roh.split(',').map((s) => pruefeBezeichner(s.trim(), 'Auswahlspalte')).join(', ');
}

function preferTeile(options) {
  const kopf = options.headers && (options.headers.Prefer || options.headers.prefer);
  const teile = String(kopf || '').split(',').map((t) => t.trim()).filter(Boolean);
  const unbekannt = teile.filter((t) => ![
    'return=minimal', 'return=representation',
    'resolution=merge-duplicates', 'resolution=ignore-duplicates',
  ].includes(t));
  if (unbekannt.length) throw new Error(`Unbekannte Prefer-Angabe: ${unbekannt.join(', ')}`);
  return {
    minimal: teile.includes('return=minimal'),
    merge: teile.includes('resolution=merge-duplicates'),
    ignoriere: teile.includes('resolution=ignore-duplicates'),
  };
}

function koerper(options) {
  if (options.body === undefined || options.body === null) return null;
  return typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
}

/**
 * Übersetzt einen PostgREST-Aufruf in { sql, werte, erwartetZeilen }.
 * `schema` ist das Zielschema (Stufe B: 'leads').
 */
function uebersetze(pfad, options = {}, schema = 'leads') {
  const methode = String(options.method || 'GET').toUpperCase();
  const [ziel, abfrageRoh = ''] = String(pfad).split('?');
  const abfrage = new URLSearchParams(abfrageRoh);
  const prefer = preferTeile(options);

  // --- Funktionsaufruf -----------------------------------------------------
  if (ziel.startsWith('rpc/')) {
    if (methode !== 'POST') throw new Error(`RPC nur per POST, nicht ${methode}`);
    const name = pruefeBezeichner(ziel.slice(4), 'Funktionsname');
    const argumente = koerper(options) || {};
    const werte = [];
    // Benannte Parameter: Reihenfolge der Argumente ist damit egal - genau wie bei
    // PostgREST, das ebenfalls ueber Namen zuordnet.
    const zuweisungen = Object.entries(argumente).map(([schluessel, wert]) => {
      pruefeBezeichner(schluessel, 'Argumentname');
      werte.push(wert === undefined ? null : wert);
      return `${schluessel} => $${werte.length}`;
    });
    return {
      sql: `SELECT * FROM ${schema}.${name}(${zuweisungen.join(', ')})`,
      werte,
      erwartetZeilen: true,
    };
  }

  const tabelle = pruefeBezeichner(ziel, 'Tabellenname');
  const werte = [];

  // Filter sammeln: alles ausser den bekannten Steuerparametern.
  const STEUER = new Set(['select', 'limit', 'order', 'offset', 'on_conflict', 'columns']);
  const bedingungen = [];
  for (const [schluessel, roh] of abfrage.entries()) {
    if (STEUER.has(schluessel)) continue;
    if (schluessel === 'or') {
      bedingungen.push(oderGruppe(roh, werte));
      continue;
    }
    bedingungen.push(filterBedingung(schluessel, roh, werte));
  }
  const wo = bedingungen.length ? ` WHERE ${bedingungen.join(' AND ')}` : '';

  // offset gibt es nur beim Lesen; bei PATCH/POST wäre es ein stiller Irrtum des Aufrufers.
  if (abfrage.has('offset') && methode !== 'GET') {
    throw new Error('offset ist nur bei GET erlaubt');
  }
  if (abfrage.has('columns')) throw new Error('columns wird nicht unterstuetzt');

  // --- Lesen ---------------------------------------------------------------
  if (methode === 'GET') {
    let sql = `SELECT ${spaltenliste(abfrage.get('select'))} FROM ${schema}.${tabelle}${wo}`;
    if (abfrage.has('order')) sql += ` ORDER BY ${ordnung(abfrage.get('order'))}`;
    if (abfrage.has('limit')) {
      const n = Number(abfrage.get('limit'));
      if (!Number.isInteger(n) || n < 0) throw new Error(`Unzulaessiges limit: ${abfrage.get('limit')}`);
      sql += ` LIMIT ${n}`;
    }
    if (abfrage.has('offset')) {
      const n = Number(abfrage.get('offset'));
      if (!Number.isInteger(n) || n < 0 || n > OFFSET_OBERGRENZE) {
        throw new Error(`Unzulaessiges offset: ${abfrage.get('offset')} (erlaubt 0 bis ${OFFSET_OBERGRENZE})`);
      }
      sql += ` OFFSET ${n}`;
    }
    return { sql, werte, erwartetZeilen: true };
  }

  // --- Ändern --------------------------------------------------------------
  if (methode === 'PATCH') {
    const daten = koerper(options);
    if (!daten || Array.isArray(daten)) throw new Error('PATCH braucht genau ein Objekt');
    const zuweisungen = Object.entries(daten).map(([spalte, wert]) => {
      pruefeBezeichner(spalte, 'Spaltenname');
      werte.push(wert);
      return `${spalte} = $${werte.length}`;
    });
    if (!zuweisungen.length) throw new Error('PATCH ohne Felder');
    // 🔴 Ohne WHERE traefe ein PATCH die ganze Tabelle. PostgREST verbietet das
    // serverseitig; hier ebenso - lieber ein lauter Fehler als ein stiller Totalschaden.
    if (!bedingungen.length) throw new Error('PATCH ohne Filter ist nicht erlaubt');
    const sql = `UPDATE ${schema}.${tabelle} SET ${zuweisungen.join(', ')}${wo}`
      + (prefer.minimal ? '' : ' RETURNING *');
    return { sql, werte, erwartetZeilen: !prefer.minimal };
  }

  // --- Einfügen / Upsert ---------------------------------------------------
  if (methode === 'POST') {
    const daten = koerper(options);
    const zeilen = Array.isArray(daten) ? daten : [daten];
    if (!zeilen.length || zeilen.some((z) => !z || typeof z !== 'object')) {
      throw new Error('POST braucht ein Objekt oder eine Liste von Objekten');
    }
    // Eine gemeinsame Spaltenliste ueber alle Zeilen: fehlende Felder werden zu NULL,
    // damit die Werteliste rechteckig bleibt.
    const spalten = [...new Set(zeilen.flatMap((z) => Object.keys(z)))]
      .map((s) => pruefeBezeichner(s, 'Spaltenname'));
    if (!spalten.length) throw new Error('POST ohne Felder');

    const zeilenPlatzhalter = zeilen.map((zeile) => {
      const platz = spalten.map((spalte) => {
        werte.push(Object.hasOwn(zeile, spalte) ? zeile[spalte] : null);
        return `$${werte.length}`;
      });
      return `(${platz.join(', ')})`;
    });

    let sql = `INSERT INTO ${schema}.${tabelle} (${spalten.join(', ')}) VALUES ${zeilenPlatzhalter.join(', ')}`;

    const konflikt = abfrage.get('on_conflict');
    if (konflikt) {
      const konfliktSpalten = konflikt.split(',').map((s) => pruefeBezeichner(s.trim(), 'Konfliktspalte'));
      if (prefer.ignoriere) {
        sql += ` ON CONFLICT (${konfliktSpalten.join(', ')}) DO NOTHING`;
      } else if (prefer.merge) {
        // merge-duplicates aktualisiert genau die MITGELIEFERTEN Spalten - dieselbe
        // Semantik wie PostgREST. Konfliktspalten selbst werden nicht gesetzt.
        const zuAktualisieren = spalten.filter((s) => !konfliktSpalten.includes(s));
        sql += zuAktualisieren.length
          ? ` ON CONFLICT (${konfliktSpalten.join(', ')}) DO UPDATE SET `
            + zuAktualisieren.map((s) => `${s} = EXCLUDED.${s}`).join(', ')
          : ` ON CONFLICT (${konfliktSpalten.join(', ')}) DO NOTHING`;
      } else {
        throw new Error('on_conflict ohne resolution=merge-duplicates/ignore-duplicates');
      }
    } else if (prefer.ignoriere) {
      // Ohne benannte Konfliktspalten kann nur der allgemeine Zweig gemeint sein.
      sql += ' ON CONFLICT DO NOTHING';
    } else if (prefer.merge) {
      throw new Error('resolution=merge-duplicates ohne on_conflict ist mehrdeutig');
    }

    if (!prefer.minimal) sql += ' RETURNING *';
    return { sql, werte, erwartetZeilen: !prefer.minimal };
  }

  throw new Error(`Nicht unterstuetzte Methode: ${methode}`);
}

module.exports = { uebersetze };
