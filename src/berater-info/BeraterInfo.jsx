/**
 * Schulungsseite /berater-info.
 *
 * Portierung von business-schulung/pages/index.jsx (511 Zeilen) nach React ohne Next.
 * Drei Beruehrungspunkte wurden ersetzt (Inventur 2026-08-24, Abschnitt 4):
 *  - useRouter()/router.query -> resolveBeraterInfoState(window.location.search)
 *  - next/head                -> statische Tags in berater-info.html
 *  - dynamischer JSON-Import  -> statische Importe in ./translations.js
 *
 * Geschrieben mit React.createElement statt JSX-Syntax - dieselbe Konvention wie
 * src/app/App.jsx. Die ESLint-Konfiguration des Repos kennt keinen JSX-Parser; ohne diese
 * Konvention wuerde `pnpm run lint` an jeder Datei mit spitzen Klammern scheitern.
 *
 * Die Schriftfamilien zeigen auf das Fontsystem des Quiz (fonts/fonts.css). Die
 * Herbalife-Fonts der Quelle wurden dort nie eingebunden (Befund A-1); die Seite lief
 * faktisch in Arial. Statt eine tote Referenz zu uebernehmen, nutzt sie jetzt dieselben
 * Schriften wie das Quiz - kein Fremd-CDN.
 *
 * Kein Lead-, Tracking- oder Coach-Code. Die Seite spricht mit keinem Server.
 */

import React from 'react';

import { useTranslation } from './translations.js';
import {
  ASPIRATION_IDS,
  DEFAULT_ASPIRATION,
  PROFILE_IDS,
  resolveBeraterInfoState,
} from './query-contract.js';

const h = React.createElement;

const C = {
  fire: '#C0392B',
  fireBg: '#FEF0EE',
  wind: '#A07010',
  windBg: '#FFFBEB',
  water: '#1A7A4A',
  waterBg: '#EAF7F0',
  rock: '#1A5F9A',
  rockBg: '#EBF3FC',
  gold: '#B8860B',
  goldBg: '#FFFBF0',
  dark: '#1A1A2E',
  mid: '#4A4A6A',
  light: '#8A8AAA',
  page: '#F8F7F4',
  white: '#FFFFFF',
};

// Fontsystem des Quiz (fonts/fonts.css, per <link> in berater-info.html).
const FONT_BODY = "'DM Sans', system-ui, sans-serif";
const FONT_DISPLAY = "'Cormorant Garamond', Georgia, serif";

const LANGS = [
  { id: 'de', label: 'DE' },
  { id: 'it', label: 'IT' },
  { id: 'en', label: 'EN' },
  { id: 'fr', label: 'FR' },
  { id: 'ru', label: 'RU' },
  { id: 'hu', label: 'HU' },
];

const PROFILE_VISUALS = {
  feuer: { emoji: '🔥', color: C.fire, bg: C.fireBg },
  wind: { emoji: '💨', color: C.wind, bg: C.windBg },
  wasser: { emoji: '🌊', color: C.water, bg: C.waterBg },
  fels: { emoji: '🪨', color: C.rock, bg: C.rockBg },
};

const ASPIRATION_EMOJI = {
  freiheit: '🕊️',
  wirkung: '🌱',
  sicherheit: '🏠',
  wachstum: '📈',
};

const SECTIONS = ['grundlage', 'regeln', 'profile', 'referenz'];

const DISC_ROWS = [
  { farbe: '🔥', typ: 'Dominance (D)', id: 'feuer' },
  { farbe: '💨', typ: 'Influence (I)', id: 'wind' },
  { farbe: '🌊', typ: 'Steadiness (S)', id: 'wasser' },
  { farbe: '🪨', typ: 'Conscientiousness (C)', id: 'fels' },
];

// Diese Zeile steht in der Quelle hart im JSX (pages/index.jsx:305) und nicht in den
// Locale-Dateien. Der Bestand bleibt deshalb wortgleich; ergaenzt ist nur Ungarisch.
const MASLOW_NOTE = {
  de: 'Maslow zeigte dass menschliche Motivation in Ebenen organisiert ist...',
  hu: 'Maslow megmutatta, hogy az emberi motiváció szintekbe rendeződik...',
  default: 'Maslow showed that human motivation is organized in levels...',
};

const RESPONSIVE_CSS = `
      @media (min-width: 640px) {
        .disc-grid { grid-template-columns: 1fr 1fr !important; }
        .motivation-grid { flex-direction: row !important; }
        .barriers-grid { flex-direction: row !important; }
        .profile-tabs-grid { grid-template-columns: 1fr 1fr !important; }
        .aspiration-grid { grid-template-columns: 1fr 1fr !important; }
        .reference-grid { grid-template-columns: 1fr 1fr !important; }
        .strength-blind { grid-template-columns: 1fr 1fr !important; }
      }
      .lang-switcher button {
        opacity: 0.5; transition: all 0.2s; font-weight: normal; color: #4A4A6A;
      }
      .lang-switcher button.active {
        opacity: 1; font-weight: bold; color: #1A1A2E;
      }
      .lang-switcher span {
        color: #8A8AAA; opacity: 0.3; padding: 0 4px;
      }
`;

const cardStyle = {
  background: C.white,
  borderRadius: 16,
  border: '1px solid rgba(0,0,0,0.07)',
  boxShadow: '0 2px 16px rgba(0,0,0,0.05)',
  marginBottom: 16,
  overflow: 'hidden',
};

const cardHeadStyle = (background) => ({
  background,
  padding: 'clamp(12px, 3vw, 18px) clamp(14px, 4vw, 24px)',
  borderBottom: '1px solid rgba(0,0,0,0.06)',
  display: 'flex',
  alignItems: 'center',
  gap: 'clamp(10px, 3vw, 14px)',
});

const cardBodyStyle = { padding: 'clamp(12px, 4vw, 20px) clamp(14px, 4vw, 24px)' };

const numberStyle = (color) => ({
  fontFamily: FONT_DISPLAY,
  fontSize: 'clamp(24px, 6vw, 28px)',
  fontWeight: 'bold',
  color,
  flexShrink: 0,
});

const eyebrowStyle = {
  fontSize: 11,
  letterSpacing: 2.5,
  textTransform: 'uppercase',
  color: C.light,
  marginBottom: 8,
};

const sectionTitleStyle = {
  fontFamily: FONT_DISPLAY,
  fontSize: 'clamp(22px,3vw,30px)',
  fontWeight: 'bold',
  color: C.dark,
  marginBottom: 6,
};

const ruleStyle = (color) => ({
  height: 2,
  background: `linear-gradient(90deg,${color},transparent)`,
});

const noteBoxStyle = {
  background: C.goldBg,
  border: '1px solid rgba(184,134,11,0.2)',
  borderLeft: `4px solid ${C.gold}`,
  borderRadius: 12,
  fontSize: 'clamp(13px, 3.5vw, 14px)',
  color: C.mid,
};

const label11 = {
  fontSize: 'clamp(9px, 2.5vw, 11px)',
  letterSpacing: 1.5,
  textTransform: 'uppercase',
  color: C.light,
  marginBottom: 4,
  display: 'block',
};

const text14 = { fontSize: 'clamp(13px, 3.5vw, 14px)', color: C.mid, lineHeight: 1.65 };
const block = { background: C.page, borderRadius: 10, padding: 'clamp(12px, 4vw, 16px)' };
const blockDark = { background: '#1A1A2E', borderRadius: 10, padding: 'clamp(12px, 4vw, 16px)' };
const tileStyle = { background: C.page, borderRadius: 10, padding: 'clamp(10px, 4vw, 16px)' };

function cardHead(number, color, background, title, subtitle) {
  return h(
    'div',
    { style: cardHeadStyle(background) },
    h('div', { style: numberStyle(color) }, number),
    h(
      'div',
      null,
      h(
        'div',
        { style: { fontSize: 'clamp(14px, 3.5vw, 16px)', fontWeight: 700, color: C.dark } },
        title
      ),
      h(
        'div',
        { style: { fontSize: 'clamp(12px, 3vw, 13px)', color: C.light, marginTop: 1 } },
        subtitle
      )
    )
  );
}

function labelledBlock(label, value) {
  return h('div', { style: block }, h('span', { style: label11 }, label), h('div', { style: text14 }, value));
}

export default function BeraterInfo() {
  const { lang, t, setLang } = useTranslation();

  const initialState = React.useMemo(
    () => resolveBeraterInfoState(typeof window === 'undefined' ? '' : window.location.search),
    []
  );

  const [activeProfile, setActiveProfile] = React.useState(initialState.activeProfile);
  const [activeAsp, setActiveAsp] = React.useState(initialState.aspirationByProfile);
  const [openSection, setOpenSection] = React.useState(initialState.openSection);

  // Der Next-Effekt hing an router.query und lief bei jedem Query-Wechsel erneut.
  // Ohne Router uebernimmt popstate diese Rolle (Zurueck-Taste, History-Navigation).
  React.useEffect(() => {
    function applyQuery() {
      const next = resolveBeraterInfoState(window.location.search);
      setActiveProfile(next.activeProfile);
      setActiveAsp(next.aspirationByProfile);
      setOpenSection(next.openSection);
    }

    window.addEventListener('popstate', applyQuery);
    return () => window.removeEventListener('popstate', applyQuery);
  }, []);

  const PROFILES = PROFILE_IDS.map((id) => ({
    id,
    ...PROFILE_VISUALS[id],
    name: t(`${id}.name`, 'profiles'),
    tagline: t(`${id}.tagline`, 'profiles'),
    psychologie: t(`${id}.psychologie`, 'profiles'),
    stärken: t(`${id}.stärken`, 'profiles') || [],
    fleck: t(`${id}.fleck`, 'profiles'),
    niemals: t(`${id}.niemals`, 'profiles'),
    aspirations: ASPIRATION_IDS.map((aId) => ({
      id: aId,
      emoji: ASPIRATION_EMOJI[aId],
      label: t(`${id}.aspirations.${aId}.label`, 'profiles'),
      antrieb: t(`${id}.aspirations.${aId}.antrieb`, 'profiles'),
      nein: t(`${id}.aspirations.${aId}.nein`, 'profiles'),
      opener: t(`${id}.aspirations.${aId}.opener`, 'profiles'),
      gespräch: t(`${id}.aspirations.${aId}.gespräch`, 'profiles'),
      überzeugt: t(`${id}.aspirations.${aId}.überzeugt`, 'profiles'),
      einwände: t(`${id}.aspirations.${aId}.einwände`, 'profiles') || [],
      redflag: t(`${id}.aspirations.${aId}.redflag`, 'profiles'),
    })),
  }));

  const RULES = t('rules.list') || [];

  const profile = PROFILES.find((p) => p.id === activeProfile) || PROFILES[0];
  const aspId = activeAsp[activeProfile] || DEFAULT_ASPIRATION;
  const asp = profile.aspirations.find((a) => a.id === aspId);

  const navBtnStyle = (id) => ({
    padding: '8px 12px',
    borderRadius: '8px 8px 0 0',
    fontSize: 'clamp(12px, 3.5vw, 14px)',
    fontWeight: 600,
    cursor: 'pointer',
    border: 'none',
    background: openSection === id ? C.page : 'transparent',
    color: openSection === id ? C.gold : C.mid,
    fontFamily: FONT_BODY,
    whiteSpace: 'nowrap',
  });

  const profileTabStyle = (id) => {
    const p = PROFILES.find((x) => x.id === id);
    return {
      padding: '6px 12px',
      borderRadius: 100,
      fontSize: 'clamp(11px, 3vw, 13px)',
      fontWeight: 600,
      cursor: 'pointer',
      border: `2px solid ${p.color}`,
      background: activeProfile === id ? p.color : 'transparent',
      color: activeProfile === id ? C.white : p.color,
      fontFamily: FONT_BODY,
      whiteSpace: 'nowrap',
    };
  };

  const aspTabStyle = (id) => ({
    padding: '5px 12px',
    borderRadius: 100,
    fontSize: 'clamp(11px, 3vw, 13px)',
    fontWeight: 600,
    cursor: 'pointer',
    border: `1px solid ${profile.color}`,
    background: aspId === id ? profile.color : 'transparent',
    color: aspId === id ? C.white : profile.color,
    fontFamily: FONT_BODY,
    whiteSpace: 'nowrap',
  });

  const hero = h(
    'div',
    {
      style: {
        background: 'linear-gradient(135deg,#1A1A2E,#2A2A4E)',
        padding: 'clamp(30px, 10vw, 50px) clamp(16px, 5vw, 24px)',
        textAlign: 'center',
      },
    },
    h(
      'div',
      {
        style: {
          fontSize: 'clamp(9px, 2.5vw, 11px)',
          letterSpacing: 2,
          textTransform: 'uppercase',
          color: '#E8C84A',
          marginBottom: 8,
        },
      },
      t('hero.subtitle')
    ),
    h(
      'div',
      {
        style: {
          fontSize: 'clamp(20px, 6vw, 38px)',
          color: '#F5F0E8',
          fontWeight: 'bold',
          marginBottom: 6,
        },
      },
      t('hero.title').replace(t('hero.em'), ''),
      ' ',
      h('em', { style: { color: '#E8C84A' } }, t('hero.em'))
    ),
    h(
      'div',
      {
        style: {
          color: 'rgba(245,240,232,0.55)',
          fontSize: 'clamp(12px, 3vw, 14px)',
          marginBottom: 16,
        },
      },
      t('hero.description')
    ),
    h(
      'div',
      { style: { display: 'flex', justifyContent: 'center', gap: 6, flexWrap: 'wrap' } },
      PROFILES.map((p) =>
        h(
          'span',
          {
            key: p.id,
            style: {
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.12)',
              color: 'rgba(245,240,232,0.75)',
              fontSize: 'clamp(11px, 2.5vw, 13px)',
              padding: '4px 10px',
              borderRadius: 100,
            },
          },
          `${p.emoji} ${p.name}`
        )
      )
    )
  );

  const nav = h(
    'div',
    {
      style: {
        display: 'flex',
        gap: 3,
        padding: 'clamp(12px, 3vw, 16px) clamp(12px, 4vw, 20px) 0',
        borderBottom: '1px solid rgba(0,0,0,0.08)',
        background: C.white,
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
      },
    },
    SECTIONS.map((id) =>
      h(
        'button',
        { key: id, style: navBtnStyle(id), onClick: () => setOpenSection(id) },
        t(`nav.${id}`)
      )
    )
  );

  const grundlage = h(
    'div',
    null,
    h('div', { style: eyebrowStyle }, t('foundation.title')),
    h('div', { style: sectionTitleStyle }, t('foundation.subtitle')),
    h('div', { style: { ...ruleStyle(C.gold), marginBottom: 24 } }),
    h(
      'div',
      {
        style: {
          ...noteBoxStyle,
          padding: 'clamp(14px, 4vw, 24px) clamp(14px, 4vw, 24px)',
          marginBottom: 'clamp(16px, 5vw, 28px)',
          lineHeight: 1.8,
        },
      },
      t('foundation.intro')
    ),

    h(
      'div',
      { style: cardStyle },
      cardHead('01', C.fire, C.fireBg, t('foundation.disc.title'), t('foundation.disc.subtitle')),
      h(
        'div',
        { style: cardBodyStyle },
        h(
          'p',
          {
            style: {
              fontSize: 'clamp(13px, 3.5vw, 14px)',
              color: C.mid,
              lineHeight: 1.75,
              marginBottom: 'clamp(10px, 3vw, 14px)',
            },
          },
          t('foundation.disc.p1')
        ),
        h(
          'div',
          {
            className: 'disc-grid',
            style: {
              display: 'grid',
              gridTemplateColumns: '1fr',
              gap: 'clamp(8px, 3vw, 10px)',
              marginBottom: 14,
            },
          },
          DISC_ROWS.map((item, i) =>
            h(
              'div',
              { key: i, style: tileStyle },
              h(
                'div',
                {
                  style: {
                    fontSize: 'clamp(12px, 3vw, 13px)',
                    fontWeight: 700,
                    color: C.dark,
                    marginBottom: 3,
                  },
                },
                `${item.farbe} ${item.typ} = ${t(`${item.id}.name`, 'profiles')}`
              ),
              h(
                'div',
                { style: { fontSize: 'clamp(12px, 3vw, 13px)', color: C.mid, lineHeight: 1.6 } },
                t(`${item.id}.tagline`, 'profiles')
              )
            )
          )
        ),
        h(
          'p',
          {
            style: {
              fontSize: 'clamp(12px, 3vw, 13px)',
              color: C.light,
              lineHeight: 1.65,
              fontStyle: 'italic',
            },
          },
          t('foundation.disc.p2')
        )
      )
    ),

    h(
      'div',
      { style: cardStyle },
      cardHead(
        '02',
        C.water,
        C.waterBg,
        t('foundation.motivation.title'),
        t('foundation.motivation.subtitle')
      ),
      h(
        'div',
        { style: cardBodyStyle },
        h(
          'p',
          { style: { fontSize: 14, color: C.mid, lineHeight: 1.75, marginBottom: 14 } },
          t('foundation.motivation.p1')
        ),
        h(
          'div',
          {
            className: 'motivation-grid',
            style: {
              display: 'flex',
              flexDirection: 'column',
              gap: 'clamp(8px, 3vw, 10px)',
              marginBottom: 14,
            },
          },
          h(
            'div',
            { style: tileStyle },
            h(
              'div',
              {
                style: {
                  fontSize: 'clamp(12px, 3vw, 13px)',
                  fontWeight: 700,
                  color: C.dark,
                  marginBottom: 4,
                },
              },
              'Abraham Maslow – Bedürfnishierarchie (1943)'
            ),
            h(
              'div',
              { style: { fontSize: 'clamp(12px, 3vw, 13px)', color: C.mid, lineHeight: 1.65 } },
              MASLOW_NOTE[lang] || MASLOW_NOTE.default
            )
          )
        ),
        h(
          'p',
          { style: { fontSize: 13, color: C.light, lineHeight: 1.65, fontStyle: 'italic' } },
          t('foundation.motivation.p2')
        )
      )
    ),

    h(
      'div',
      { style: cardStyle },
      cardHead(
        '03',
        C.rock,
        C.rockBg,
        t('foundation.barriers.title'),
        t('foundation.barriers.subtitle')
      ),
      h(
        'div',
        { style: cardBodyStyle },
        h(
          'p',
          { style: { fontSize: 14, color: C.mid, lineHeight: 1.75, marginBottom: 14 } },
          t('foundation.barriers.p1')
        ),
        h(
          'p',
          { style: { fontSize: 13, color: C.light, lineHeight: 1.65, fontStyle: 'italic' } },
          t('foundation.barriers.p2')
        )
      )
    ),

    h(
      'div',
      {
        style: {
          background: '#1A1A2E',
          borderRadius: 16,
          padding: 'clamp(16px, 5vw, 28px)',
          marginBottom: 8,
        },
      },
      h(
        'div',
        {
          style: {
            fontSize: 'clamp(9px, 2.5vw, 11px)',
            letterSpacing: 1.5,
            textTransform: 'uppercase',
            color: '#E8C84A',
            marginBottom: 10,
          },
        },
        t('foundation.forer.label')
      ),
      h(
        'p',
        {
          style: {
            fontSize: 'clamp(13px, 3.5vw, 14px)',
            color: 'rgba(245,240,232,0.75)',
            lineHeight: 1.8,
            marginBottom: 8,
          },
        },
        t('foundation.forer.p1')
      ),
      h(
        'p',
        {
          style: {
            fontSize: 'clamp(13px, 3.5vw, 14px)',
            color: 'rgba(245,240,232,0.75)',
            lineHeight: 1.8,
          },
        },
        t('foundation.forer.p2')
      )
    )
  );

  const regeln = h(
    'div',
    null,
    h('div', { style: eyebrowStyle }, t('nav.regeln')),
    h('div', { style: sectionTitleStyle }, t('rules.title')),
    h('div', { style: { ...ruleStyle(C.gold), marginBottom: 20 } }),
    h(
      'div',
      {
        style: {
          ...noteBoxStyle,
          padding: 'clamp(12px, 3vw, 20px)',
          marginBottom: 'clamp(12px, 3vw, 20px)',
          lineHeight: 1.7,
        },
      },
      t('rules.intro')
    ),
    RULES.map((r, i) =>
      h(
        'div',
        {
          key: i,
          style: {
            ...cardStyle,
            marginBottom: 'clamp(10px, 3vw, 14px)',
            padding: 'clamp(14px, 4vw, 24px)',
            display: 'flex',
            gap: 'clamp(10px, 3vw, 16px)',
            alignItems: 'flex-start',
          },
        },
        h(
          'div',
          {
            style: {
              fontFamily: FONT_DISPLAY,
              fontSize: 'clamp(24px, 6vw, 32px)',
              fontWeight: 'bold',
              color: C.gold,
              lineHeight: 1,
              flexShrink: 0,
              minWidth: 'clamp(30px, 8vw, 40px)',
            },
          },
          r.nr
        ),
        h(
          'div',
          null,
          h(
            'div',
            {
              style: {
                fontSize: 'clamp(13px, 3.5vw, 15px)',
                fontWeight: 700,
                color: C.dark,
                marginBottom: 3,
              },
            },
            r.title
          ),
          h(
            'div',
            { style: { fontSize: 'clamp(13px, 3.5vw, 14px)', color: C.mid, lineHeight: 1.65 } },
            r.text
          )
        )
      )
    )
  );

  const profileSection = h(
    'div',
    null,
    h('div', { style: eyebrowStyle }, t('profiles.title')),
    h('div', { style: sectionTitleStyle }, t('profiles.title')),
    h('div', { style: { ...ruleStyle(profile.color), marginBottom: 16 } }),

    h(
      'div',
      {
        style: {
          display: 'flex',
          gap: 'clamp(6px, 2vw, 8px)',
          flexWrap: 'wrap',
          marginBottom: 'clamp(12px, 3vw, 16px)',
        },
      },
      PROFILES.map((p) =>
        h(
          'button',
          {
            key: p.id,
            style: profileTabStyle(p.id),
            onClick: () => {
              setActiveProfile(p.id);
              setActiveAsp((a) => ({ ...a, [p.id]: DEFAULT_ASPIRATION }));
            },
          },
          `${p.emoji} ${p.name}`
        )
      )
    ),

    h(
      'div',
      { style: { ...cardStyle, marginBottom: 0 } },
      h(
        'div',
        {
          style: {
            padding: 'clamp(16px, 4vw, 28px) clamp(16px, 5vw, 28px) clamp(12px, 3vw, 20px)',
            background: profile.bg,
            borderBottom: '1px solid rgba(0,0,0,0.06)',
          },
        },
        h(
          'div',
          {
            style: {
              fontSize: 'clamp(18px, 4vw, 30px)',
              fontWeight: 'bold',
              color: profile.color,
              marginBottom: 2,
            },
          },
          `${profile.emoji} ${profile.name}`
        ),
        h(
          'div',
          {
            style: {
              fontSize: 'clamp(13px, 3.5vw, 15px)',
              color: profile.color,
              opacity: 0.75,
              fontStyle: 'italic',
            },
          },
          profile.tagline
        )
      ),

      h(
        'div',
        {
          style: {
            margin: 'clamp(12px, 3vw, 20px) clamp(16px, 5vw, 28px)',
            padding: 'clamp(10px, 3vw, 16px) clamp(12px, 4vw, 20px)',
            background: C.page,
            borderRadius: 10,
            borderLeft: `3px solid ${profile.color}`,
          },
        },
        h('div', { style: { ...label11, color: C.light } }, t('profiles.understand')),
        h('div', { style: text14 }, profile.psychologie)
      ),

      h(
        'div',
        {
          className: 'strength-blind',
          style: {
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 'clamp(8px, 3vw, 12px)',
            margin: '0 clamp(16px, 5vw, 28px) clamp(12px, 4vw, 20px)',
          },
        },
        h(
          'div',
          { style: { background: C.page, borderRadius: 10, padding: 'clamp(10px, 3vw, 16px)' } },
          h('div', { style: { ...label11, color: profile.color } }, t('profiles.strengths')),
          h(
            'ul',
            { style: { paddingLeft: 'clamp(14px, 3vw, 18px)' } },
            profile['stärken'].map((s, i) =>
              h(
                'li',
                {
                  key: i,
                  style: {
                    fontSize: 'clamp(12px, 3vw, 13.5px)',
                    color: C.mid,
                    marginBottom: 2,
                  },
                },
                s
              )
            )
          )
        ),
        h(
          'div',
          { style: { background: C.page, borderRadius: 10, padding: 'clamp(10px, 3vw, 16px)' } },
          h('div', { style: { ...label11, color: '#C0392B' } }, t('profiles.blind_spot')),
          h('div', { style: text14 }, profile.fleck),
          h(
            'div',
            { style: { ...label11, color: '#C0392B', marginTop: 'clamp(8px, 2vw, 12px)' } },
            t('profiles.never_do')
          ),
          h('div', { style: text14 }, profile.niemals)
        )
      ),

      h(
        'div',
        {
          style: {
            padding: 'clamp(10px, 3vw, 16px) clamp(16px, 5vw, 28px) 0',
            borderTop: '1px solid rgba(0,0,0,0.07)',
            display: 'flex',
            gap: 'clamp(6px, 2vw, 8px)',
            flexWrap: 'wrap',
          },
        },
        profile.aspirations.map((a) =>
          h(
            'button',
            {
              key: a.id,
              style: aspTabStyle(a.id),
              onClick: () => setActiveAsp((prev) => ({ ...prev, [activeProfile]: a.id })),
            },
            `${a.emoji} ${a.label}`
          )
        )
      ),

      asp &&
        h(
          'div',
          {
            style: {
              padding: 'clamp(12px, 4vw, 20px) clamp(16px, 5vw, 28px) clamp(16px, 5vw, 28px)',
            },
          },
          h(
            'div',
            {
              style: {
                fontSize: 'clamp(16px, 4vw, 20px)',
                fontWeight: 'bold',
                color: profile.color,
                marginBottom: 12,
              },
            },
            `${asp.emoji} ${profile.name} + ${asp.label}`
          ),
          h(
            'div',
            {
              className: 'aspiration-grid',
              style: {
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 'clamp(8px, 3vw, 12px)',
                marginBottom: 12,
              },
            },
            labelledBlock(t('profiles.driver'), asp.antrieb),
            labelledBlock(t('profiles.no_way'), asp.nein),
            h(
              'div',
              { style: { ...blockDark, gridColumn: '1/-1' } },
              h('span', { style: { ...label11, color: '#E8C84A' } }, t('profiles.opener')),
              h(
                'div',
                {
                  style: {
                    fontSize: 'clamp(13px, 3.5vw, 15px)',
                    color: 'rgba(245,240,232,0.85)',
                    lineHeight: 1.65,
                    fontStyle: 'italic',
                  },
                },
                asp.opener
              )
            ),
            labelledBlock(t('profiles.guidance'), asp['gespräch']),
            labelledBlock(t('profiles.convincer'), asp['überzeugt'])
          ),

          h('span', { style: label11 }, t('profiles.objections')),
          h(
            'div',
            {
              style: {
                display: 'flex',
                flexDirection: 'column',
                gap: 'clamp(6px, 2vw, 8px)',
                marginBottom: 'clamp(10px, 3vw, 14px)',
              },
            },
            asp['einwände'].map((e, i) =>
              h(
                'div',
                {
                  key: i,
                  style: { background: C.page, borderRadius: 10, padding: 'clamp(8px, 3vw, 16px)' },
                },
                h(
                  'div',
                  {
                    style: {
                      fontSize: 'clamp(12px, 3vw, 13.5px)',
                      fontStyle: 'italic',
                      color: C.mid,
                      marginBottom: 3,
                    },
                  },
                  `"${e.q}"`
                ),
                h(
                  'div',
                  {
                    style: {
                      fontSize: 'clamp(13px, 3.5vw, 14px)',
                      color: C.dark,
                      fontWeight: 500,
                    },
                  },
                  `→ ${e.a}`
                )
              )
            )
          ),

          h(
            'div',
            {
              style: {
                background: 'rgba(192,57,43,0.06)',
                border: '1px solid rgba(192,57,43,0.18)',
                borderRadius: 10,
                padding: 'clamp(8px, 3vw, 16px)',
              },
            },
            h('span', { style: { ...label11, color: '#C0392B' } }, `🚩 ${t('profiles.red_flag')}`),
            h('div', { style: text14 }, asp.redflag)
          )
        )
    )
  );

  const referenz = h(
    'div',
    null,
    h('div', { style: eyebrowStyle }, t('nav.referenz')),
    h('div', { style: sectionTitleStyle }, t('reference.title')),
    h('div', { style: { ...ruleStyle(C.gold), marginBottom: 24 } }),
    h(
      'div',
      {
        className: 'reference-grid',
        style: {
          display: 'grid',
          gridTemplateColumns: '1fr',
          gap: 'clamp(12px, 4vw, 16px)',
          marginBottom: 28,
        },
      },
      PROFILES.map((q, qi) =>
        h(
          'div',
          {
            key: qi,
            style: {
              background: C.white,
              borderRadius: 14,
              padding: 'clamp(12px, 3vw, 20px)',
              boxShadow: '0 2px 12px rgba(0,0,0,0.05)',
              border: '1px solid rgba(0,0,0,0.06)',
              borderTopColor: q.color,
              borderTopWidth: 3,
            },
          },
          h(
            'div',
            {
              style: {
                fontSize: 'clamp(14px, 3.5vw, 16px)',
                fontWeight: 700,
                marginBottom: 'clamp(8px, 2vw, 12px)',
                color: q.color,
              },
            },
            `${q.emoji} ${q.name}`
          ),
          (q.aspirations[0] ? q.aspirations[0]['einwände'] : []).map((e, ii) =>
            h(
              'div',
              {
                key: ii,
                style: {
                  fontSize: 'clamp(12px, 3vw, 13px)',
                  color: C.mid,
                  padding: 'clamp(4px, 1.5vw, 6px) 0',
                  borderBottom: ii < 1 ? '1px solid rgba(0,0,0,0.05)' : 'none',
                  lineHeight: 1.5,
                },
              },
              h('strong', { style: { color: C.dark } }, `"${e.q}"`),
              h('br'),
              `→ ${e.a}`
            )
          )
        )
      )
    ),
    h(
      'div',
      {
        style: {
          background: 'linear-gradient(135deg,#1A1A2E,#2A2A4E)',
          borderRadius: 16,
          padding: 'clamp(24px, 8vw, 36px) clamp(20px, 6vw, 32px)',
          textAlign: 'center',
        },
      },
      h(
        'span',
        {
          style: {
            fontSize: 'clamp(9px, 2.5vw, 11px)',
            letterSpacing: 2,
            textTransform: 'uppercase',
            color: '#E8C84A',
            marginBottom: 12,
            display: 'block',
          },
        },
        t('reference.magic_question_label')
      ),
      h(
        'div',
        {
          style: {
            fontSize: 'clamp(14px, 4vw, 22px)',
            fontStyle: 'italic',
            color: '#F5F0E8',
            lineHeight: 1.6,
            marginBottom: 10,
          },
        },
        t('reference.magic_question')
      ),
      h(
        'div',
        {
          style: {
            fontSize: 'clamp(12px, 3vw, 14px)',
            color: 'rgba(245,240,232,0.5)',
            maxWidth: 440,
            margin: '0 auto',
          },
        },
        t('reference.magic_question_desc')
      )
    )
  );

  const footer = h(
    'div',
    {
      style: {
        padding: 'clamp(20px, 8vw, 40px) 20px',
        borderTop: '1px solid rgba(0,0,0,0.05)',
        textAlign: 'center',
      },
    },
    h(
      'div',
      {
        className: 'lang-switcher',
        style: {
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 0,
          flexWrap: 'wrap',
        },
      },
      LANGS.map((l, i) =>
        h(
          'div',
          { key: l.id, style: { display: 'flex', alignItems: 'center' } },
          h(
            'button',
            {
              id: `lang${l.label}`,
              className: lang === l.id ? 'active' : '',
              onClick: () => setLang(l.id),
              style: {
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: 13,
                padding: '4px 8px',
                fontFamily: 'inherit',
              },
            },
            l.label
          ),
          i < LANGS.length - 1 &&
            h('span', { style: { color: C.light, opacity: 0.3, padding: '0 4px' } }, '-')
        )
      )
    ),
    h(
      'div',
      { style: { marginTop: 12, fontSize: 10, color: C.light, opacity: 0.6, letterSpacing: 1 } },
      `© ${new Date().getFullYear()} ACTIVE CENTER`
    )
  );

  const sectionContent = {
    grundlage,
    regeln,
    profile: profileSection,
    referenz,
  }[openSection];

  return h(
    React.Fragment,
    null,
    h('style', null, RESPONSIVE_CSS),
    h(
      'div',
      {
        style: { fontFamily: FONT_BODY, background: C.page, minHeight: '100vh', color: C.dark },
      },
      hero,
      nav,
      h(
        'div',
        {
          style: {
            maxWidth: 860,
            margin: '0 auto',
            padding: 'clamp(16px, 5vw, 28px) clamp(12px, 4vw, 20px) clamp(40px, 10vw, 60px)',
          },
        },
        sectionContent
      ),
      footer
    )
  );
}

export { LANGS };
