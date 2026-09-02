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
  ziel: '{contactfield=ac_last_main_goal_label}',
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

// 🔴 Textregel (Markus, 02.09.2026): Mailtexte laufen durch den
// anti-ai-slop-humanizer (agent-core/skills) — keine Gedankenstriche als
// Satzkleber, kurze aktive Sätze. Formulierung von Markus, 02.09.2026.
const TEXTE = {
  a1: {
    emoji: '🎬',
    de: {
      betreff: `${T.vorname}, dein Video 1 wartet (3 Min)`,
      gruss: 'Hi',
      absaetze: [
        'Dein Video 1 wartet und es dauert nur 3 Minuten.',
        `Dein Erfolgs-Code zeigt dir deine Stärken und deine Zielsetzung: ${T.profil} mit dem Wunsch nach ${T.ziel}. Damit passt du sehr gut in unser Team.`,
        'Schau dir das kurze Einführungsvideo an. Vielleicht ist es genau das, was du suchst.',
      ],
      knopf: 'Video 1 ansehen (3 Min)',
      team: `Dein ${T.org} Team`,
    },
    it: {
      betreff: `${T.vorname}, il tuo video 1 ti aspetta (3 min)`,
      gruss: 'Ciao',
      absaetze: [
        'Il tuo video 1 ti aspetta e dura solo 3 minuti.',
        `Il tuo codice del successo mostra i tuoi punti di forza e il tuo obiettivo: ${T.profil}, con il desiderio di ${T.ziel}. Un profilo che sta benissimo nel nostro team.`,
        'Guarda il breve video introduttivo. Forse è proprio quello che cerchi.',
      ],
      knopf: 'Guarda il video 1 (3 min)',
      team: `Il tuo team ${T.org}`,
    },
    en: {
      betreff: `${T.vorname}, your video 1 is waiting (3 min)`,
      gruss: 'Hi',
      absaetze: [
        'Your video 1 is waiting and it only takes 3 minutes.',
        `Your success code shows your strengths and your goal: ${T.profil}, driven by ${T.ziel}. That profile fits our team very well.`,
        'Watch the short intro video. Maybe it is exactly what you are looking for.',
      ],
      knopf: 'Watch video 1 (3 min)',
      team: `Your ${T.org} team`,
    },
    fr: {
      betreff: `${T.vorname}, ta vidéo 1 t'attend (3 min)`,
      gruss: 'Salut',
      absaetze: [
        "Ta vidéo 1 t'attend et elle ne dure que 3 minutes.",
        `Ton code du succès montre tes forces et ton objectif : ${T.profil}, avec « ${T.ziel} » comme moteur. Un profil qui a toute sa place dans notre équipe.`,
        "Regarde la courte vidéo d'introduction. C'est peut-être exactement ce que tu cherches.",
      ],
      knopf: 'Regarder la vidéo 1 (3 min)',
      team: `Ton équipe ${T.org}`,
    },
    ru: {
      betreff: `${T.vorname}, твоё видео 1 ждёт тебя (3 мин)`,
      gruss: 'Привет',
      absaetze: [
        'Твоё видео 1 ждёт тебя, и оно длится всего 3 минуты.',
        `Твой код успеха показывает твои сильные стороны и главную цель: ${T.profil}, цель «${T.ziel}». Такой профиль отлично подходит нашей команде.`,
        'Посмотри короткое вводное видео. Возможно, это именно то, что ты ищешь.',
      ],
      knopf: 'Смотреть видео 1 (3 мин)',
      team: `Твоя команда ${T.org}`,
    },
    hu: {
      betreff: `${T.vorname}, vár az 1. videód (3 perc)`,
      gruss: 'Szia',
      absaetze: [
        'Vár az 1. videód, és csak 3 percig tart.',
        `A sikerkódod megmutatja az erősségeidet és a célodat: ${T.profil}, cél: ${T.ziel}. Ez a profil remekül illik a csapatunkba.`,
        'Nézd meg a rövid bevezető videót. Lehet, hogy pont ezt keresed.',
      ],
      knopf: '1. videó megnézése (3 perc)',
      team: `A ${T.org} csapatod`,
    },
  },
};

module.exports = { PHASEN: ['a1'], TEXTE, RAHMEN, T };
