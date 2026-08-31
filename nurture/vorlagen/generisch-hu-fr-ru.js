'use strict';

/**
 * Nurture-Strecke, generische Fassung („Version A") für hu, fr, ru.
 *
 * 🔴 WARUM ES DIESE DATEI GIBT
 * Die Strecke fächert jede Phase nach einer Dimension auf — Hauptziel, Profil oder
 * Barriere, je vier Varianten. In Deutsch sind das 32 Vorlagen, und alle 32 werden
 * nachweislich benutzt (gemessen am 31.08.2026: 440 Mails über 31 verschiedene
 * Mautic-Kennungen seit dem 01.08.).
 *
 * Für Ungarisch, Französisch und Russisch geht es heute um SIEBEN Menschen. Vier
 * Varianten je Phase auszuspielen, deren Wirkung man bei sieben Empfängern ohnehin nicht
 * messen kann, wäre Aufwand ohne Erkenntnis — und jede künftige Textänderung ginge durch
 * 96 statt 24 Vorlagen. Deshalb: EINE Fassung je Phase und Sprache.
 *
 * ⚠️ VERMERK FÜR SPÄTER (Entscheidung Markus, 31.08.2026): Das ist bewusst die
 * vereinfachte Fassung. Sobald eine dieser Sprachen nennenswert Volumen bekommt, gehört
 * sie auf die volle Tiefe gebracht — vier Varianten je Phase, wie in Deutsch. Der
 * Rückfall im Sender (`EMAIL_MAP[phase][lang][variant] || …['_single']`) macht das
 * schrittweise möglich: Wer eine Variante nachträgt, überschreibt damit den generischen
 * Eintrag für genau diese Kombination. Es braucht dafür KEINE Umstellung.
 *
 * 🔴 UNGEPRÜFT: Die Übersetzungen sind nicht muttersprachlich gegengelesen. Die
 * betroffenen Berater sind es aber — die ungarischen Leads hängen an `wellnesskurs`, der
 * russische an `fit`. Vor dem Scharfschalten gehört das dorthin.
 *
 * Die deutsche Fassung steht hier als REFERENZ, aus der übersetzt wurde. Sie wird nicht
 * angelegt — Deutsch hat seine 32 Varianten bereits.
 */

/** Die acht aktiven Phasen. `a4` und `a5` stehen nicht in ACTIVE_PHASES und fehlen bewusst. */
const PHASEN = ['a2', 'a3', 'b1', 'b2', 'c1', 'c2', 'd1', 'd2'];

/** Mautic-Platzhalter, in allen Sprachen identisch — sie werden NIE übersetzt. */
const T = {
  vorname: '{contactfield=firstname}',
  profil: '{contactfield=ac_last_profile_label}',
  berater: '{contactfield=ac_berater_vorname}',
  org: '{contactfield=ac_berater_org_display}',
};

/**
 * 🔴 Der RAHMEN — Beraterkasten und Fusszeile.
 *
 * Beim ersten erzeugten Entwurf standen sie noch auf Deutsch, während der Text ungarisch
 * war. Eine halb übersetzte Mail ist schlechter als eine ganz fremdsprachige: Sie sieht
 * aus wie ein Fehler, weil sie einer ist. Deshalb gehört jeder feste Baustein hier mit
 * hinein — auch „Abmelden", das rechtlich zählt.
 *
 * `vorLink`/`nachLink` umschliessen die Anmeldeadresse in der Fusszeile; sie steht in der
 * Mitte des Satzes und darf nicht mit übersetzt werden.
 */
const RAHMEN = {
  de: {
    ansprechpartner: 'Dein Ansprechpartner',
    telefon: 'Telefon / WhatsApp:',
    email: 'E-Mail:',
    vorLink: 'Du erhältst diese Mail weil du dich auf ',
    nachLink: ' eingetragen hast.',
    abmelden: 'Abmelden',
    impressum: 'Impressum &amp; Datenschutz',
  },
  hu: {
    ansprechpartner: 'A kapcsolattartód',
    telefon: 'Telefon / WhatsApp:',
    email: 'E-mail:',
    vorLink: 'Ezt a levelet azért kapod, mert feliratkoztál itt: ',
    nachLink: '.',
    abmelden: 'Leiratkozás',
    impressum: 'Impresszum és adatvédelem',
  },
  fr: {
    ansprechpartner: 'Ton interlocuteur',
    telefon: 'Téléphone / WhatsApp :',
    email: 'E-mail :',
    vorLink: "Tu reçois cet e-mail parce que tu t'es inscrit sur ",
    nachLink: '.',
    abmelden: 'Se désabonner',
    impressum: 'Mentions légales et confidentialité',
  },
  ru: {
    ansprechpartner: 'Твой контакт',
    telefon: 'Телефон / WhatsApp:',
    email: 'E-mail:',
    vorLink: 'Ты получаешь это письмо, потому что зарегистрировался на ',
    nachLink: '.',
    abmelden: 'Отписаться',
    impressum: 'Выходные данные и защита данных',
  },
};

const TEXTE = {
  a2: {
    emoji: '🔓',
    de: {
      betreff: `${T.vorname}, dein Erfolgscode`,
      absaetze: [
        `Dein Erfolgscode besagt: Du bist ${T.profil}.`,
        'Dein Ergebnis ist der Startpunkt, nicht das Ziel. Es zeigt, wie du an Dinge herangehst und worauf es bei dir ankommt, wenn du etwas Eigenes aufbaust.',
        'In Teil 1 siehst du, worum es geht: das Modell, die Menschen dahinter und ob das grundsätzlich zu dir und deinem nächsten Lebensabschnitt passt.',
        '👉 Starte mit Teil 1. Danach kannst du besser einschätzen, ob dieser Weg für dich stimmig ist.',
      ],
      knopf: 'Teil 1 starten',
      gruss: 'Hallo',
      team: `Dein ${T.org} Team`,
    },
    hu: {
      betreff: `${T.vorname}, itt a sikerkódod`,
      absaetze: [
        `A sikerkódod szerint te ${T.profil} vagy.`,
        'Az eredményed a kiindulópont, nem a végcél. Megmutatja, hogyan állsz a dolgokhoz, és mi számít neked igazán, ha valami sajátot építesz.',
        'Az 1. részben látod, miről van szó: a modellről, az emberekről mögötte, és arról, hogy ez egyáltalán illik-e hozzád és a következő életszakaszodhoz.',
        '👉 Kezdd az 1. résszel. Utána sokkal jobban meg tudod ítélni, hogy ez az út neked való-e.',
      ],
      knopf: '1. rész indítása',
      gruss: 'Szia',
      team: `A ${T.org} csapatod`,
    },
    fr: {
      betreff: `${T.vorname}, voici ton code de réussite`,
      absaetze: [
        `Ton code de réussite le dit : tu es ${T.profil}.`,
        "Ton résultat est un point de départ, pas une arrivée. Il montre comment tu abordes les choses et ce qui compte vraiment pour toi quand tu construis quelque chose qui t'appartient.",
        "Dans la partie 1, tu vois de quoi il s'agit : le modèle, les personnes derrière, et si tout cela correspond à toi et à ta prochaine étape de vie.",
        '👉 Commence par la partie 1. Ensuite, tu sauras bien mieux si ce chemin te convient.',
      ],
      knopf: 'Démarrer la partie 1',
      gruss: 'Bonjour',
      team: `Ton équipe ${T.org}`,
    },
    ru: {
      betreff: `${T.vorname}, твой код успеха`,
      absaetze: [
        `Твой код успеха говорит: ты ${T.profil}.`,
        'Твой результат — это отправная точка, а не финиш. Он показывает, как ты подходишь к делу и что для тебя действительно важно, когда ты строишь что-то своё.',
        'В части 1 ты увидишь, о чём речь: сама модель, люди за ней и то, подходит ли это тебе и твоему следующему этапу жизни.',
        '👉 Начни с части 1. После неё ты гораздо точнее поймёшь, твой ли это путь.',
      ],
      knopf: 'Начать часть 1',
      gruss: 'Здравствуй',
      team: `Твоя команда ${T.org}`,
    },
  },

  a3: {
    emoji: '🧭',
    de: {
      betreff: 'Dein erster Schritt braucht keinen fertigen Plan',
      absaetze: [
        'Du musst noch nichts entschieden haben.',
        'Die meisten warten an dieser Stelle auf den richtigen Moment. Den gibt es selten. Was es gibt, ist ein erster ruhiger Blick.',
        'Teil 1 bringt Ordnung rein: worum es geht, welche Art Mensch gesucht wird und ob du dich darin wiedererkennst.',
        '👉 Klick jetzt auf Teil 1. Du brauchst keine Vorbereitung. Nur ein paar ruhige Minuten und einen ehrlichen Blick.',
      ],
      knopf: 'Teil 1 starten',
      gruss: 'Hallo',
      team: `Dein ${T.org} Team`,
    },
    hu: {
      betreff: 'Az első lépéshez nem kell kész terv',
      absaetze: [
        'Még semmit nem kell eldöntened.',
        'A legtöbben ilyenkor a megfelelő pillanatra várnak. Az ritkán jön el. Ami viszont bármikor megvan: egy nyugodt első pillantás.',
        'Az 1. rész rendet tesz: miről szól az egész, milyen embert keresünk, és magadra ismersz-e benne.',
        '👉 Kattints most az 1. részre. Nem kell rá készülnöd. Csak néhány nyugodt perc és egy őszinte pillantás.',
      ],
      knopf: '1. rész indítása',
      gruss: 'Szia',
      team: `A ${T.org} csapatod`,
    },
    fr: {
      betreff: "Ton premier pas n'a pas besoin d'un plan tout prêt",
      absaetze: [
        "Tu n'as encore rien à décider.",
        "À ce stade, la plupart attendent le bon moment. Il vient rarement. Ce qui est toujours possible, c'est un premier regard tranquille.",
        "La partie 1 met de l'ordre : de quoi il s'agit, quel type de personne nous cherchons, et si tu t'y reconnais.",
        "👉 Clique maintenant sur la partie 1. Aucune préparation nécessaire. Juste quelques minutes au calme et un regard honnête.",
      ],
      knopf: 'Démarrer la partie 1',
      gruss: 'Bonjour',
      team: `Ton équipe ${T.org}`,
    },
    ru: {
      betreff: 'Для первого шага не нужен готовый план',
      absaetze: [
        'Тебе пока ничего не нужно решать.',
        'На этом месте большинство ждёт подходящего момента. Он приходит редко. А вот спокойно посмотреть в первый раз можно в любой день.',
        'Часть 1 наводит порядок: о чём вообще речь, какого человека мы ищем и узнаёшь ли ты в этом себя.',
        '👉 Нажми на часть 1. Готовиться не нужно. Хватит нескольких спокойных минут и честного взгляда.',
      ],
      knopf: 'Начать часть 1',
      gruss: 'Здравствуй',
      team: `Твоя команда ${T.org}`,
    },
  },

  b1: {
    emoji: '▶️',
    de: {
      betreff: `${T.vorname}, jetzt wird's konkret`,
      absaetze: [
        'Du hast Teil 1 gesehen. Das ist mehr, als die meisten tun.',
        'Du weißt jetzt, worum es geht. Die Frage danach ist eine andere: Wie wird aus Interesse ein klares System?',
        'Teil 2 zeigt dir den konkreten Aufbau: wie du startest, wer dich begleitet und wie daraus ein echtes zweites Standbein entstehen kann.',
        '👉 Klick jetzt auf Teil 2. Danach siehst du klarer, ob dieser Weg zu deinem Alltag passt.',
      ],
      knopf: 'Teil 2 - Das System verstehen',
      gruss: 'Hallo',
      team: `Dein ${T.org} Team`,
    },
    hu: {
      betreff: `${T.vorname}, most jön a konkrétum`,
      absaetze: [
        'Megnézted az 1. részt. Ez már többe, mint amit a legtöbben megtesznek.',
        'Most már tudod, miről szól. A következő kérdés viszont más: hogyan lesz az érdeklődésből világos rendszer?',
        'A 2. rész megmutatja a konkrét felépítést: hogyan indulsz, ki kísér téged, és hogyan lehet ebből valódi második lábon állás.',
        '👉 Kattints most a 2. részre. Utána tisztábban látod, illik-e ez a hétköznapjaidhoz.',
      ],
      knopf: '2. rész - A rendszer megértése',
      gruss: 'Szia',
      team: `A ${T.org} csapatod`,
    },
    fr: {
      betreff: `${T.vorname}, on passe au concret`,
      absaetze: [
        'Tu as vu la partie 1. Ça, la plupart des gens ne le font pas.',
        "Tu sais maintenant de quoi il s'agit. La question suivante est différente : comment transformer un intérêt en système clair ?",
        "La partie 2 te montre la construction concrète : comment tu démarres, qui t'accompagne, et comment cela peut devenir une vraie seconde activité.",
        '👉 Clique maintenant sur la partie 2. Ensuite, tu verras plus clairement si ce chemin tient dans ton quotidien.',
      ],
      knopf: 'Partie 2 - Comprendre le système',
      gruss: 'Bonjour',
      team: `Ton équipe ${T.org}`,
    },
    ru: {
      betreff: `${T.vorname}, теперь по существу`,
      absaetze: [
        'Ты посмотрел часть 1. Это больше, чем делает большинство.',
        'Теперь ты знаешь, о чём речь. Дальше вопрос уже другой: как из интереса получается понятная система?',
        'Часть 2 показывает конкретное устройство: как ты начинаешь, кто тебя сопровождает и как из этого может вырасти настоящая вторая опора.',
        '👉 Нажми на часть 2. После неё будет яснее, вписывается ли этот путь в твою повседневность.',
      ],
      knopf: 'Часть 2 — понять систему',
      gruss: 'Здравствуй',
      team: `Твоя команда ${T.org}`,
    },
  },

  b2: {
    emoji: '🔧',
    de: {
      betreff: `${T.vorname}, jetzt siehst du das System`,
      absaetze: [
        'Du hast Teil 1 gesehen. Jetzt geht es um den Aufbau.',
        'Ein erster Eindruck reicht für Neugier. Für eine Entscheidung braucht es einen Ablauf: welche Schritte dazugehören, was am Anfang wirklich zu tun ist und was realistisch möglich ist.',
        'Genau das ist Teil 2. Danach ist das Modell nicht mehr nur interessant — du kannst es prüfen.',
        '👉 Klick jetzt auf Teil 2.',
      ],
      knopf: 'Teil 2 - Das System verstehen',
      gruss: 'Hallo',
      team: `Dein ${T.org} Team`,
    },
    hu: {
      betreff: `${T.vorname}, most látod a rendszert`,
      absaetze: [
        'Megnézted az 1. részt. Most a felépítésről lesz szó.',
        'Egy első benyomás elég a kíváncsisághoz. Egy döntéshez viszont menet kell: milyen lépések tartoznak hozzá, mit kell az elején valóban csinálni, és mi az, ami reálisan elérhető.',
        'Pontosan ez a 2. rész. Utána a modell már nem csak érdekes — meg tudod vizsgálni.',
        '👉 Kattints most a 2. részre.',
      ],
      knopf: '2. rész - A rendszer megértése',
      gruss: 'Szia',
      team: `A ${T.org} csapatod`,
    },
    fr: {
      betreff: `${T.vorname}, voici le système`,
      absaetze: [
        'Tu as vu la partie 1. Passons à la construction.',
        "Une première impression suffit pour la curiosité. Pour décider, il faut un déroulé : quelles étapes en font partie, ce qu'il y a vraiment à faire au début, et ce qui est réellement possible.",
        "C'est exactement la partie 2. Ensuite, le modèle n'est plus seulement intéressant — tu peux l'examiner.",
        '👉 Clique maintenant sur la partie 2.',
      ],
      knopf: 'Partie 2 - Comprendre le système',
      gruss: 'Bonjour',
      team: `Ton équipe ${T.org}`,
    },
    ru: {
      betreff: `${T.vorname}, теперь видно всю систему`,
      absaetze: [
        'Ты посмотрел часть 1. Теперь речь о том, как это устроено.',
        'Первого впечатления хватает для любопытства. Для решения нужен порядок действий: какие шаги в него входят, что действительно делать в начале и что реально возможно.',
        'Именно это и есть часть 2. После неё модель уже не просто интересна — её можно проверить.',
        '👉 Нажми на часть 2.',
      ],
      knopf: 'Часть 2 — понять систему',
      gruss: 'Здравствуй',
      team: `Твоя команда ${T.org}`,
    },
  },

  c1: {
    emoji: '✨',
    de: {
      betreff: `${T.vorname}, jetzt wird's persönlich`,
      absaetze: [
        'Zwei Teile gesehen. Jetzt kommen die echten Erfahrungen.',
        'Du kennst jetzt den Aufbau. In Teil 3 siehst du, wie sich das bei echten Menschen anfühlt.',
        'Sie sind aus ganz unterschiedlichen Situationen gestartet: Nebenjob, Studium, Familie, der Wunsch nach mehr Freiheit.',
        'Schau nicht nach Perfektion, sondern nach Wiedererkennung. Welche Erfahrung klingt nach deinem nächsten Schritt?',
        '👉 Klick jetzt auf Teil 3.',
      ],
      knopf: 'Teil 3 - Echte Erfahrungen ansehen',
      gruss: 'Hallo',
      team: `Dein ${T.org} Team`,
    },
    hu: {
      betreff: `${T.vorname}, most jön a személyes rész`,
      absaetze: [
        'Két részt láttál. Most jönnek a valódi tapasztalatok.',
        'A felépítést már ismered. A 3. részben azt látod, milyen ez valódi embereknél.',
        'Nagyon különböző helyzetekből indultak: másodállás, tanulmányok, család, vágy a nagyobb szabadságra.',
        'Ne a tökéletességet keresd, hanem a ráismerést. Melyik történet hangzik úgy, mint a te következő lépésed?',
        '👉 Kattints most a 3. részre.',
      ],
      knopf: '3. rész - Valódi tapasztalatok',
      gruss: 'Szia',
      team: `A ${T.org} csapatod`,
    },
    fr: {
      betreff: `${T.vorname}, place au personnel`,
      absaetze: [
        'Deux parties vues. Place aux expériences réelles.',
        'Tu connais maintenant la construction. Dans la partie 3, tu vois ce que ça donne chez de vraies personnes.',
        "Elles sont parties de situations très différentes : un emploi à côté, des études, une famille, l'envie de plus de liberté.",
        'Ne cherche pas la perfection, cherche la reconnaissance. Quelle expérience ressemble à ton prochain pas ?',
        '👉 Clique maintenant sur la partie 3.',
      ],
      knopf: 'Partie 3 - Voir les expériences réelles',
      gruss: 'Bonjour',
      team: `Ton équipe ${T.org}`,
    },
    ru: {
      betreff: `${T.vorname}, теперь о людях`,
      absaetze: [
        'Две части позади. Дальше — реальный опыт.',
        'Устройство ты уже знаешь. В части 3 видно, как это выглядит у живых людей.',
        'Они начинали из очень разных ситуаций: подработка, учёба, семья, желание большей свободы.',
        'Ищи не совершенство, а узнавание. Чья история звучит как твой следующий шаг?',
        '👉 Нажми на часть 3.',
      ],
      knopf: 'Часть 3 — реальный опыт',
      gruss: 'Здравствуй',
      team: `Твоя команда ${T.org}`,
    },
  },

  c2: {
    emoji: '👥',
    de: {
      betreff: `${T.vorname}, echte Menschen statt Theorie`,
      absaetze: [
        'Du hast Teil 1 und Teil 2 gesehen. Jetzt kommt der Realitätscheck.',
        'Ein Modell kann auf dem Papier gut klingen. Interessant wird es erst, wenn man sieht, was Menschen wirklich damit machen.',
        'Teil 3 zeigt echte Erfahrungen: unterschiedliche Lebenssituationen, verschiedene Starts, klare Ergebnisse. Nicht als Show, sondern als Vergleich.',
        'Achte darauf, bei welcher Erfahrung du denkst: „Das könnte mein nächster Schritt sein."',
        '👉 Klick jetzt auf Teil 3.',
      ],
      knopf: 'Teil 3 - Echte Erfahrungen ansehen',
      gruss: 'Hallo',
      team: `Dein ${T.org} Team`,
    },
    hu: {
      betreff: `${T.vorname}, valódi emberek elmélet helyett`,
      absaetze: [
        'Megnézted az 1. és a 2. részt. Most jön a valóságpróba.',
        'Egy modell papíron is hangozhat jól. Igazán akkor lesz érdekes, ha látod, mit kezdenek vele az emberek.',
        'A 3. rész valódi tapasztalatokat mutat: különböző élethelyzetek, különböző indulások, világos eredmények. Nem műsor, hanem összehasonlítás.',
        'Arra figyelj, melyik történetnél gondolod azt: „ez lehetne az én következő lépésem".',
        '👉 Kattints most a 3. részre.',
      ],
      knopf: '3. rész - Valódi tapasztalatok',
      gruss: 'Szia',
      team: `A ${T.org} csapatod`,
    },
    fr: {
      betreff: `${T.vorname}, des personnes réelles plutôt que de la théorie`,
      absaetze: [
        'Tu as vu les parties 1 et 2. Passons à la vérification par le réel.',
        'Un modèle peut bien sonner sur le papier. Il devient intéressant quand on voit ce que les gens en font vraiment.',
        'La partie 3 montre des expériences réelles : des situations de vie différentes, des départs différents, des résultats clairs. Pas un spectacle, une comparaison.',
        "Repère l'expérience qui te fait penser : « ça pourrait être mon prochain pas ».",
        '👉 Clique maintenant sur la partie 3.',
      ],
      knopf: 'Partie 3 - Voir les expériences réelles',
      gruss: 'Bonjour',
      team: `Ton équipe ${T.org}`,
    },
    ru: {
      betreff: `${T.vorname}, живые люди вместо теории`,
      absaetze: [
        'Ты посмотрел части 1 и 2. Теперь проверка реальностью.',
        'На бумаге модель может звучать хорошо. По-настоящему интересно становится, когда видишь, что люди с ней делают.',
        'Часть 3 показывает реальный опыт: разные жизненные ситуации, разные старты, понятные результаты. Не шоу, а сравнение.',
        'Обрати внимание, на какой истории ты подумаешь: «вот это мог бы быть мой следующий шаг».',
        '👉 Нажми на часть 3.',
      ],
      knopf: 'Часть 3 — реальный опыт',
      gruss: 'Здравствуй',
      team: `Твоя команда ${T.org}`,
    },
  },

  d1: {
    emoji: '✅',
    de: {
      betreff: `${T.vorname}, du hast jetzt alles gesehen`,
      absaetze: [
        'Drei Teile. Ein vollständiges Bild.',
        'Was jetzt fehlt, steht in keinem Video: ein Gespräch mit jemandem, der den Weg schon gegangen ist.',
        `Genau diese Person ist ${T.berater}. Ein Gespräch, in dem du herausfindest, ob das hier zu dir passt — und ${T.berater} herausfindet, ob er dich auf diesem Weg begleiten kann.`,
        `Vielleicht hast du ${T.berater} längst geantwortet, per Nachricht oder am Telefon. Dann passt alles, ignorier diese Mail.`,
        'Falls nicht: Gib mit einem Klick Bescheid, wo du stehst. Klingt es interessant? Oder gerade nicht? Beides ist völlig okay.',
      ],
      knopf: `${T.berater} kurz Bescheid geben`,
      gruss: 'Hallo',
      team: `Dein ${T.org} Team`,
    },
    hu: {
      betreff: `${T.vorname}, most már mindent láttál`,
      absaetze: [
        'Három rész. Egy teljes kép.',
        'Ami most hiányzik, az egyik videóban sincs benne: egy beszélgetés valakivel, aki ezt az utat már végigjárta.',
        `Pontosan ez a személy ${T.berater}. Egy beszélgetés, amelyben te kiderítheted, illik-e ez hozzád — ${T.berater} pedig azt, hogy el tud-e kísérni ezen az úton.`,
        `Lehet, hogy ${T.berater} részére már régen válaszoltál, üzenetben vagy telefonon. Akkor minden rendben, hagyd figyelmen kívül ezt a levelet.`,
        'Ha viszont nem: egyetlen kattintással jelezd, hol tartasz. Érdekesen hangzik? Vagy most éppen nem? Mindkettő teljesen rendben van.',
      ],
      knopf: `Rövid visszajelzés ${T.berater} részére`,
      gruss: 'Szia',
      team: `A ${T.org} csapatod`,
    },
    fr: {
      betreff: `${T.vorname}, tu as maintenant tout vu`,
      absaetze: [
        'Trois parties. Une image complète.',
        "Ce qui manque maintenant n'est dans aucune vidéo : une conversation avec quelqu'un qui a déjà fait ce chemin.",
        `Cette personne, c'est ${T.berater}. Un échange où tu découvres si tout cela te correspond — et où ${T.berater} découvre s'il peut t'accompagner sur ce chemin.`,
        `Peut-être as-tu déjà répondu à ${T.berater}, par message ou par téléphone. Dans ce cas tout va bien, ignore cet e-mail.`,
        "Sinon : dis en un clic où tu en es. Ça t'intéresse ? Ou pas en ce moment ? Les deux réponses sont parfaitement acceptables.",
      ],
      knopf: `Répondre brièvement à ${T.berater}`,
      gruss: 'Bonjour',
      team: `Ton équipe ${T.org}`,
    },
    ru: {
      betreff: `${T.vorname}, теперь ты видел всё`,
      absaetze: [
        'Три части. Целая картина.',
        'Того, чего сейчас не хватает, нет ни в одном видео: разговора с человеком, который этот путь уже прошёл.',
        `Этот человек — ${T.berater}. Разговор, в котором ты поймёшь, подходит ли тебе всё это, а ${T.berater} поймёт, сможет ли он сопровождать тебя на этом пути.`,
        `Возможно, ты уже давно ответил ${T.berater} — сообщением или по телефону. Тогда всё в порядке, просто не обращай внимания на это письмо.`,
        'Если нет — одним нажатием дай знать, на каком ты этапе. Звучит интересно? Или сейчас не время? Оба ответа совершенно нормальны.',
      ],
      knopf: `Коротко ответить ${T.berater}`,
      gruss: 'Здравствуй',
      team: `Твоя команда ${T.org}`,
    },
  },

  d2: {
    emoji: '🤝',
    de: {
      betreff: 'Dein nächster Schritt kann klein sein',
      absaetze: [
        'Du hast alle drei Teile gesehen. Jetzt geht es nicht um einen perfekten Plan.',
        `Der nächste Schritt ist nur eine kurze Rückmeldung an ${T.berater}: interessiert, unsicher oder gerade nicht passend.`,
        `Aus deiner Rückmeldung entsteht das richtige Gespräch. Dann kann ${T.berater} mit dir schauen, welcher Startpunkt für deine Situation Sinn macht.`,
        '👉 Klick jetzt auf den letzten Schritt. Eine ehrliche Einordnung reicht.',
      ],
      knopf: `${T.berater} kurz Bescheid geben`,
      gruss: 'Hallo',
      team: `Dein ${T.org} Team`,
    },
    hu: {
      betreff: 'A következő lépésed lehet egészen kicsi',
      absaetze: [
        'Mind a három részt láttad. Most nem egy tökéletes terven múlik.',
        `A következő lépés csak egy rövid visszajelzés ${T.berater} részére: érdekel, bizonytalan vagy éppen nem aktuális.`,
        `A visszajelzésedből lesz a jó beszélgetés. Akkor ${T.berater} veled együtt nézheti meg, melyik kiindulópont van értelme a te helyzetedben.`,
        '👉 Kattints most az utolsó lépésre. Egy őszinte besorolás elég.',
      ],
      knopf: `Rövid visszajelzés ${T.berater} részére`,
      gruss: 'Szia',
      team: `A ${T.org} csapatod`,
    },
    fr: {
      betreff: 'Ton prochain pas peut être tout petit',
      absaetze: [
        "Tu as vu les trois parties. Il ne s'agit pas d'avoir un plan parfait.",
        `Le prochain pas, c'est simplement une courte réponse à ${T.berater} : intéressé, hésitant, ou pas au bon moment.`,
        `C'est de ta réponse que naît la bonne conversation. ${T.berater} pourra alors regarder avec toi quel point de départ a du sens dans ta situation.`,
        '👉 Clique maintenant sur la dernière étape. Une réponse honnête suffit.',
      ],
      knopf: `Répondre brièvement à ${T.berater}`,
      gruss: 'Bonjour',
      team: `Ton équipe ${T.org}`,
    },
    ru: {
      betreff: 'Твой следующий шаг может быть совсем небольшим',
      absaetze: [
        'Ты посмотрел все три части. Речь сейчас не о безупречном плане.',
        `Следующий шаг — это просто короткий ответ ${T.berater}: интересно, пока не уверен или сейчас не подходит.`,
        `Именно из твоего ответа рождается нужный разговор. Тогда ${T.berater} сможет вместе с тобой посмотреть, какая точка старта имеет смысл в твоей ситуации.`,
        '👉 Нажми на последний шаг. Честного ответа достаточно.',
      ],
      knopf: `Коротко ответить ${T.berater}`,
      gruss: 'Здравствуй',
      team: `Твоя команда ${T.org}`,
    },
  },
};

module.exports = { PHASEN, TEXTE, RAHMEN, T };
