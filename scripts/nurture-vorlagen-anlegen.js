#!/usr/bin/env node
'use strict';

/**
 * Legt die generischen Nurture-Vorlagen für hu, fr und ru in Mautic an.
 *
 * 🔴 DAS GERÜST WIRD NICHT INS REPO KOPIERT. Es wird zur Laufzeit aus einer bestehenden
 * deutschen Vorlage geholt und nur der Textteil ersetzt. Eine Kopie im Repo wäre eine
 * zweite Wahrheit: Ändert jemand das Layout in Mautic, erzeugte dieses Skript ab dann
 * Mails, die anders aussehen als alle anderen — und es fiele niemandem auf.
 *
 * 🔴 STANDARD IST TROCKENLAUF. Ohne `--anlegen` wird nichts geschrieben; das Skript zeigt
 * nur, was entstehen würde. Mit `--anlegen` entstehen 24 echte Vorlagen.
 *
 *   node scripts/nurture-vorlagen-anlegen.js                     # Trockenlauf
 *   node scripts/nurture-vorlagen-anlegen.js --anlegen
 *   node scripts/nurture-vorlagen-anlegen.js --anlegen --sprachen hu
 *
 * Erwartet MAUTIC_BASIS und MAUTIC_AUTH (Basic-Auth-Kopf) in der Umgebung.
 * Am Ende druckt es den Block, der in EMAIL_MAP des n8n-Workflows gehört.
 *
 * Exitcode 0 = fertig · 1 = etwas ist schiefgegangen · 2 = nicht durchführbar.
 */

const { PHASEN, TEXTE, RAHMEN } = require('../nurture/vorlagen/generisch-hu-fr-ru.js');

const ANLEGEN = process.argv.includes('--anlegen');
const REFERENZ_ID = Number(argument('referenz', '13'));
const SPRACHEN = String(argument('sprachen', 'hu,fr,ru'))
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function argument(name, standard) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')
    ? process.argv[i + 1]
    : standard;
}

const BASIS = String(process.env.MAUTIC_BASIS || '').replace(/\/+$/, '');
const AUTH = process.env.MAUTIC_AUTH || '';

async function mautic(pfad, optionen = {}) {
  const antwort = await fetch(BASIS + pfad, {
    ...optionen,
    headers: {
      Authorization: AUTH,
      Accept: 'application/json',
      ...(optionen.body ? { 'Content-Type': 'application/json' } : {}),
      ...(optionen.headers || {}),
    },
  });
  const roh = await antwort.text();
  let daten;
  try {
    daten = roh ? JSON.parse(roh) : {};
  } catch {
    daten = { rohtext: roh.slice(0, 300) };
  }
  if (!antwort.ok) {
    throw new Error(`Mautic ${optionen.method || 'GET'} ${pfad} -> ${antwort.status}: ${JSON.stringify(daten).slice(0, 300)}`);
  }
  return daten;
}

/**
 * Zerlegt die Referenzvorlage in Kopf und Fuss. Dazwischen kommt der neue Text.
 *
 * Die Marken sind bewusst lang und wörtlich: Findet eine davon nichts, bricht das Skript
 * ab, statt eine halbe Mail zu bauen. Ein stiller Layoutverlust wäre schlimmer als ein
 * lauter Abbruch.
 */
function zerlege(html) {
  const kopfMarke = '<td class="content-cell"';
  const kopfEnde = html.indexOf('>', html.indexOf(kopfMarke)) + 1;
  const fussMarke = '<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:24px 0 0 0;';
  const fussStart = html.indexOf(fussMarke);
  const knopfMarke = '<div style="margin:0 0 28px 0;text-align:center;">';
  const knopfStart = html.indexOf(knopfMarke);
  const knopfEnde = html.indexOf('</div>', knopfStart) + '</div>'.length;

  if (html.indexOf(kopfMarke) < 0 || fussStart < 0 || knopfStart < 0) {
    throw new Error('Referenzvorlage hat ein unerwartetes Layout — Marken nicht gefunden. Abbruch.');
  }
  return {
    kopf: html.slice(0, kopfEnde),
    knopfBlock: html.slice(knopfStart, knopfEnde),
    fuss: html.slice(fussStart),
  };
}

const P_STIL = 'margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.65;color:#2d2d2d;';
const P_STIL_GRUSS = 'margin:0 0 14px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.65;color:#2d2d2d;';

function absatz(text, stil = P_STIL) {
  return `<p style="${stil}">${text}</p>`;
}

/** Setzt Beschriftung und Ziel des Knopfes neu — an beiden Stellen, mso und regulär. */
function knopfAnpassen(block, beschriftung, phaseGross, emailId) {
  const ziel = `{contactfield=ac_last_video_access_url}&acn_phase=${phaseGross}&acn_email=${emailId}`;
  return block
    .replace(/href="[^"]*"/g, `href="${ziel}"`)
    .replace(/(<center[^>]*>)[^<]*(<\/center>)/, `$1${beschriftung}$2`)
    .replace(/(white-space:nowrap;[^>]*>)[^<]*(<\/a>)/, `$1${beschriftung}$2`);
}

/**
 * Übersetzt Beraterkasten und Fusszeile. Jede Ersetzung wird GEPRÜFT: Findet eine davon
 * ihren deutschen Ausgangstext nicht, bricht der Lauf ab. Sonst entstünde still eine
 * halb deutsche Mail — und genau das ist beim ersten Entwurf passiert.
 */
function rahmenUebersetzen(fuss, sprache) {
  const de = RAHMEN.de;
  const ziel = RAHMEN[sprache];
  if (!ziel) throw new Error(`Kein Rahmen für Sprache ${sprache}`);

  const ersetzungen = [
    [`>${de.ansprechpartner}<`, `>${ziel.ansprechpartner}<`],
    [`<strong>${de.telefon}</strong>`, `<strong>${ziel.telefon}</strong>`],
    [`<strong>${de.email}</strong>`, `<strong>${ziel.email}</strong>`],
    [de.vorLink, ziel.vorLink],
    [de.nachLink, ziel.nachLink],
    [`>${de.abmelden}</a>`, `>${ziel.abmelden}</a>`],
    [`>${de.impressum}</a>`, `>${ziel.impressum}</a>`],
  ];

  let ergebnis = fuss;
  for (const [alt, neu] of ersetzungen) {
    if (!ergebnis.includes(alt)) {
      throw new Error(`Rahmenbaustein nicht gefunden: ${JSON.stringify(alt.slice(0, 50))}. Abbruch, statt halb übersetzt zu senden.`);
    }
    ergebnis = ergebnis.split(alt).join(neu);
  }
  return ergebnis;
}

function baueHtml(teile, inhalt, phase, emailId, sprache) {
  const { gruss, absaetze, knopf } = inhalt;
  const emoji = TEXTE[phase].emoji;
  const koerper = [
    absatz(`${gruss} {contactfield=firstname},`, P_STIL_GRUSS),
    absatz(`<strong>${absaetze[0]}</strong> ${emoji}`),
    ...absaetze.slice(1).map((a) => absatz(a)),
  ].join('\n');

  return [
    teile.kopf,
    koerper,
    knopfAnpassen(teile.knopfBlock, knopf, phase.toUpperCase(), emailId),
    absatz(inhalt.team),
    rahmenUebersetzen(teile.fuss, sprache),
  ].join('\n');
}

(async () => {
  if (!BASIS || !AUTH) {
    console.error('  🔴 MAUTIC_BASIS oder MAUTIC_AUTH fehlt.');
    process.exit(2);
  }

  const referenz = (await mautic(`/api/emails/${REFERENZ_ID}`)).email;
  if (!referenz) throw new Error(`Referenzvorlage ${REFERENZ_ID} nicht gefunden`);
  const teile = zerlege(referenz.customHtml || '');

  console.log('');
  console.log(`Gerüst aus Vorlage ${REFERENZ_ID} ("${referenz.name}")`);
  console.log(`  Absender : ${referenz.fromName} <${referenz.fromAddress}>`);
  console.log(`  Antwort an: ${referenz.replyToAddress}`);
  console.log(`  Sprachen : ${SPRACHEN.join(', ')} · Phasen: ${PHASEN.join(', ')}`);
  console.log(`  Modus    : ${ANLEGEN ? '🔴 ANLEGEN' : 'Trockenlauf'}`);
  console.log('');

  // Vor dem Anlegen ansehen können, was entsteht — 24 Vorlagen blind zu erzeugen und
  // hinterher zu prüfen wäre der teurere Weg.
  const zeigen = argument('zeige', null);
  if (zeigen) {
    const [phase, sprache] = zeigen.split('/');
    const inhalt = TEXTE[phase]?.[sprache];
    if (!inhalt) {
      console.error(`  🔴 Kein Text für ${zeigen}. Erwartet z. B. --zeige a2/hu`);
      process.exit(1);
    }
    console.log(baueHtml(teile, inhalt, phase, 'XXX', sprache));
    process.exit(0);
  }

  const karte = {};
  let angelegt = 0;

  for (const sprache of SPRACHEN) {
    for (const phase of PHASEN) {
      const inhalt = TEXTE[phase]?.[sprache];
      if (!inhalt) {
        console.error(`  🔴 Kein Text für ${phase}/${sprache} — übersprungen.`);
        continue;
      }
      const name = `AC Nurture - ${phase.toUpperCase()} - ${sprache.toUpperCase()} - generisch`;

      if (!ANLEGEN) {
        console.log(`  [Trockenlauf] ${name}`);
        console.log(`      Betreff: ${inhalt.betreff}`);
        console.log(`      Knopf  : ${inhalt.knopf}`);
        continue;
      }

      // Zuerst anlegen, um die Kennung zu bekommen — der Knopf trägt sie in der Adresse
      // (`acn_email=`), damit sich Klicks später je Vorlage zuordnen lassen.
      const neu = (await mautic('/api/emails/new', {
        method: 'POST',
        body: JSON.stringify({
          name,
          subject: inhalt.betreff,
          language: sprache,
          emailType: 'template',
          isPublished: true,
          fromAddress: referenz.fromAddress,
          fromName: referenz.fromName,
          replyToAddress: referenz.replyToAddress,
          customHtml: '<p>wird sofort ersetzt</p>',
        }),
      })).email;

      const html = baueHtml(teile, inhalt, phase, neu.id, sprache);
      await mautic(`/api/emails/${neu.id}/edit`, {
        method: 'PATCH',
        body: JSON.stringify({ customHtml: html }),
      });

      karte[phase] = karte[phase] || {};
      karte[phase][sprache] = neu.id;
      angelegt += 1;
      console.log(`  ✓ ${String(neu.id).padStart(4)}  ${name}`);
    }
  }

  if (!ANLEGEN) {
    console.log('');
    console.log('  Nichts geschrieben. Mit `--anlegen` entstehen die Vorlagen wirklich.');
    process.exit(0);
  }

  console.log('');
  console.log(`  ${angelegt} Vorlagen angelegt.`);
  console.log('');
  console.log('  --- Für EMAIL_MAP im Workflow (je Phase ergänzen):');
  for (const phase of PHASEN) {
    if (!karte[phase]) continue;
    const teil = Object.entries(karte[phase])
      .map(([l, id]) => `${l}: { _single: ${id} }`)
      .join(', ');
    console.log(`    ${phase}: { …, ${teil} },`);
  }
  console.log('');
  console.log(JSON.stringify(karte));
  process.exit(0);
})().catch((fehler) => {
  console.error(`  🔴 Abbruch: ${fehler.message}`);
  process.exit(1);
});
