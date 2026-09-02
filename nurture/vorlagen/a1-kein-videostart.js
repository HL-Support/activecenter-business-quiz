'use strict';

/**
 * Phase a1 — Erinnerung „kein Videostart" (Conversion-Plan 2026-09-01, AP5).
 *
 * Zielgruppe: Opt-in liegt 2–24 h zurück, kein `video_started`, kein CTA, kein
 * Abschluss. Der Lead hat die Zugangsmail bekommen und nichts angeklickt — diese
 * Mail ist der zweite Touch: kurz, EIN Knopf, keine Typanalyse-Wiederholung.
 * Die Auswahl- und Zeitlogik liegt im Sender (`Code - Determine Phase`,
 * Workflow RqKSRTgFv8mv04H2); dieses Modul ist ausschliesslich der Text.
 *
 * EINE generische Fassung je Sprache — auch für de/it/en. Anders als die
 * Bestandsphasen (vier Varianten in de/it/en) ist a1 bewusst variantenlos: Die
 * Mail sagt nur „Video 1 wartet, 3 Minuten"; eine Auffächerung nach Ziel oder
 * Profil hätte hier nichts zu tragen. Wer später auffächern will: Der Sender
 * fällt über `EMAIL_MAP[phase][lang][variant] ?? ['_single']` zurück, Varianten
 * lassen sich also nachträglich ergänzen, ohne irgendetwas umzustellen.
 *
 * 🔴 UNGEPRÜFT: fr/ru/hu sind nicht muttersprachlich gegengelesen (gleiche Lage
 * wie bei `generisch-hu-fr-ru.js` — vor dem Gegenlesen der Berater dort gilt
 * derselbe Vorbehalt hier).
 */

const generisch = require('./generisch-hu-fr-ru.js');

/** Mautic-Platzhalter, in allen Sprachen identisch — sie werden NIE übersetzt. */
const T = {
  vorname: '{contactfield=firstname}',
  profil: '{contactfield=ac_last_profile_label}',
  berater: '{contactfield=ac_berater_vorname}',
  org: '{contactfield=ac_berater_org_display}',
};

/**
 * Rahmen (Beraterkasten/Fusszeile): de/hu/fr/ru kommen aus dem generischen Modul,
 * it/en kommen hier dazu — die Bestandsvorlagen in it/en wurden seinerzeit von
 * Hand in Mautic gebaut, darum gab es sie im Modul bisher nicht.
 */
const RAHMEN = {
  ...generisch.RAHMEN,
  it: {
    ansprechpartner: 'Il tuo referente',
    telefon: 'Telefono / WhatsApp:',
    email: 'E-mail:',
    vorLink: 'Ricevi questa e-mail perché ti sei registrato su ',
    nachLink: '.',
    abmelden: 'Annulla iscrizione',
    impressum: 'Note legali &amp; privacy',
  },
  en: {
    ansprechpartner: 'Your contact person',
    telefon: 'Phone / WhatsApp:',
    email: 'Email:',
    vorLink: 'You are receiving this email because you signed up at ',
    nachLink: '.',
    abmelden: 'Unsubscribe',
    impressum: 'Imprint &amp; privacy',
  },
};

const TEXTE = {
  a1: {
    emoji: '🎬',
    de: {
      betreff: `${T.vorname}, dein Video 1 wartet (3 Min)`,
      gruss: 'Hi',
      absaetze: [
        'Dein Video 1 wartet — und es dauert nur 3 Minuten.',
        `Darin bekommt dein Erfolgs-Code seine Bedeutung: was es heißt, dass du ${T.profil} bist — und welcher nächste Schritt zu deinem Typ passt.`,
      ],
      knopf: 'Video 1 ansehen (3 Min)',
      team: `Dein ${T.org} Team`,
    },
    it: {
      betreff: `${T.vorname}, il tuo video 1 ti aspetta (3 min)`,
      gruss: 'Ciao',
      absaetze: [
        'Il tuo video 1 ti aspetta — e dura solo 3 minuti.',
        `Al suo interno il tuo codice del successo prende significato: cosa vuol dire essere ${T.profil} — e qual è il prossimo passo adatto al tuo tipo.`,
      ],
      knopf: 'Guarda il video 1 (3 min)',
      team: `Il tuo team ${T.org}`,
    },
    en: {
      betreff: `${T.vorname}, your video 1 is waiting (3 min)`,
      gruss: 'Hi',
      absaetze: [
        'Your video 1 is waiting — and it only takes 3 minutes.',
        `It puts your success code into context: what it means that you are ${T.profil} — and which next step fits your type.`,
      ],
      knopf: 'Watch video 1 (3 min)',
      team: `Your ${T.org} team`,
    },
    fr: {
      betreff: `${T.vorname}, ta vidéo 1 t'attend (3 min)`,
      gruss: 'Salut',
      absaetze: [
        "Ta vidéo 1 t'attend — et elle ne dure que 3 minutes.",
        `Elle donne tout son sens à ton code du succès : ce que cela signifie d'être ${T.profil} — et quelle prochaine étape correspond à ton profil.`,
      ],
      knopf: 'Regarder la vidéo 1 (3 min)',
      team: `Ton équipe ${T.org}`,
    },
    ru: {
      betreff: `${T.vorname}, твоё видео 1 ждёт тебя (3 мин)`,
      gruss: 'Привет',
      absaetze: [
        'Твоё видео 1 ждёт тебя — и длится всего 3 минуты.',
        `В нём твой код успеха обретает смысл: что значит, что ты — ${T.profil}, и какой следующий шаг подходит твоему типу.`,
      ],
      knopf: 'Смотреть видео 1 (3 мин)',
      team: `Твоя команда ${T.org}`,
    },
    hu: {
      betreff: `${T.vorname}, vár az 1. videód (3 perc)`,
      gruss: 'Szia',
      absaetze: [
        'Vár az 1. videód — és csak 3 percig tart.',
        `Ebben kap értelmet a sikerkódod: mit jelent, hogy ${T.profil} vagy — és melyik következő lépés illik a típusodhoz.`,
      ],
      knopf: '1. videó megnézése (3 perc)',
      team: `A ${T.org} csapatod`,
    },
  },
};

module.exports = { PHASEN: ['a1'], TEXTE, RAHMEN, T };
