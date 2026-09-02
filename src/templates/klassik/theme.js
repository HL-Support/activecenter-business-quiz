/**
 * Theme "klassik" — Etappe E3a des Maschine/Template-Plans.
 *
 * Das heutige Gold-Schwarz-Design als erstes, wortgleiches Theme: die sieben
 * Style-Helfer sind unveraendert aus src/lib/core.js umgezogen (core traegt
 * damit keine Optik mehr), dazu der Token-Katalog aus dem DESIGN.md-Frontmatter
 * und der Phasen-Akzent der Quiz-Phase 2. Der Style-Schnappschuss (E0b-Golden)
 * beweist: kein einziges Style-Attribut hat sich geaendert.
 *
 * 🔴 Plan-Korrektur (kontrolliert am 02.09.): Die PROFIL-Akzentfarben
 * (accentColor/accentSoft in getProfiles) ziehen NICHT hierher — das komplette
 * Profil-Objekt reist im Submit-Payload an die Bridge (`profile: profile`,
 * core.js performQuizSubmission) und ist damit Datenvertrag, keine Optik.
 * Der Golden-Payload-Test haelt das fest.
 *
 * Spaetere Themes (z. B. "petrol", E7) definieren dieselben Exporte mit
 * eigenen Werten; die Registry (E5) waehlt.
 */

/** Token-Katalog — Werte identisch zum DESIGN.md-Frontmatter. */
export const tokens = {
  farbe: {
    grund: '#070B14',
    textPrimaer: '#F5F0E8',
    aufAkzent: '#0A0A0A',
    akzent: '#C9A84C',
    akzentDunkel: '#A8873E',
    gefahr: '#FF6B6B',
    gefahrText: '#FF9E9E',
    whatsapp: '#25D366',
    phase2: '#74B9FF',
  },
  schrift: {
    sans: "'DM Sans', system-ui, sans-serif",
    serif: "'Cormorant Garamond', Georgia, serif",
  },
};

/** Akzent der Quiz-Phase 2 (Fragen 4-6, blau) — sonst der Standard-Akzent. */
export function phasenAkzent(phase) {
  return phase === 2 ? tokens.farbe.phase2 : tokens.farbe.akzent;
}

// ── Die sieben Style-Helfer, wortgleich aus src/lib/core.js (E3a) ───────────

export const pageLayout = {
  minHeight: '100vh',
  background:
    'radial-gradient(ellipse at 20% 15%, rgba(201,168,76,0.05) 0%, transparent 45%), radial-gradient(ellipse at 80% 85%, rgba(74,100,200,0.05) 0%, transparent 45%), #070B14',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '24px 16px',
  fontFamily: "'DM Sans', system-ui, sans-serif",
};

export const panelStyle = (visible, extra = {}) => ({
  width: '100%',
  maxWidth: '680px',
  background: 'rgba(255,255,255,0.028)',
  borderRadius: '26px',
  border: '1px solid rgba(201,168,76,0.13)',
  padding: 'clamp(28px, 5vw, 50px) clamp(22px, 5vw, 46px)',
  backdropFilter: 'blur(20px)',
  opacity: visible ? 1 : 0,
  transform: visible ? 'translateY(0px)' : 'translateY(10px)',
  transition: 'opacity 0.35s ease, transform 0.35s ease',
  ...extra,
});

export const titleStyle = (size, extra = {}) => ({
  fontFamily: "'Cormorant Garamond', Georgia, serif",
  fontSize: `clamp(${Math.round(size * 0.62)}px, ${size * 0.07}vw + 10px, ${size}px)`,
  lineHeight: 1.2,
  color: '#F5F0E8',
  ...extra,
});

export const badgeStyle = {
  fontFamily: "'DM Sans', system-ui",
  fontSize: '11px',
  letterSpacing: '3.5px',
  textTransform: 'uppercase',
  color: '#C9A84C',
  marginBottom: '12px',
  display: 'block',
};

export const primaryButtonStyle = (backgroundColor, color = '#0A0A0A', extra = {}) => ({
  background: `linear-gradient(135deg, ${backgroundColor}, ${backgroundColor}CC)`,
  color,
  border: 'none',
  borderRadius: '100px',
  padding: '15px 40px',
  fontSize: '15px',
  fontWeight: '600',
  cursor: 'pointer',
  letterSpacing: '0.3px',
  ...extra,
});

export const secondaryButtonStyle = (extra = {}) => ({
  background: 'none',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '100px',
  padding: '13px 24px',
  color: 'rgba(245,240,232,0.38)',
  fontSize: '13px',
  cursor: 'pointer',
  ...extra,
});

export const inputStyle = {
  width: '100%',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '12px',
  padding: '14px 18px',
  fontSize: '15px',
  color: '#F5F0E8',
  outline: 'none',
  boxSizing: 'border-box',
  fontFamily: "'DM Sans', system-ui",
};
