---
tokens:
  color:
    background:
      base: "#070B14"
      overlay: "rgba(7,11,20,0.62)"
      overlay-strong: "rgba(7,11,20,0.95)"
      surface: "rgba(255,255,255,0.028)"
      surface-subtle: "rgba(255,255,255,0.025)"
      surface-hover: "rgba(255,255,255,0.045)"
    text:
      primary: "#F5F0E8"
      secondary: "rgba(245,240,232,0.68)"
      muted: "rgba(245,240,232,0.52)"
      faint: "rgba(245,240,232,0.38)"
      ghost: "rgba(245,240,232,0.18)"
      on-accent: "#0A0A0A"
    accent:
      primary: "#C9A84C"
      primary-dark: "#A8873E"
      surface: "rgba(201,168,76,0.07)"
      border: "rgba(201,168,76,0.13)"
      border-active: "rgba(201,168,76,0.2)"
    semantic:
      danger: "#FF6B6B"
      danger-text: "#FF9E9E"
      danger-surface: "rgba(255,107,107,0.08)"
      danger-border: "rgba(255,107,107,0.22)"
      whatsapp: "#25D366"
  gradient:
    page-bg: "radial-gradient(ellipse at 20% 15%, rgba(201,168,76,0.05) 0%, transparent 45%), radial-gradient(ellipse at 80% 85%, rgba(74,100,200,0.05) 0%, transparent 45%), #070B14"
    progress-bar: "linear-gradient(90deg, #C9A84C, #A8873E)"
    video-fade: "linear-gradient(to top, rgba(7,11,20,0.95), transparent)"
    card-highlight: "linear-gradient(180deg, {accent}18 0%, rgba(255,255,255,0.045) 100%)"

  typography:
    fonts:
      sans: "'DM Sans', system-ui, sans-serif"
      serif: "'Cormorant Garamond', Georgia, serif"
    weights:
      light: 300
      normal: 400
      medium: 500
      semibold: 600
      bold: 700
    letter-spacing:
      badge: "3.5px"
      button: "0.3px"
    line-height:
      heading: 1.2

  spacing:
    page-padding: "24px 16px"
    panel-padding: "clamp(28px, 5vw, 50px) clamp(22px, 5vw, 46px)"
    button-primary: "15px 40px"
    button-secondary: "13px 24px"
    input: "14px 18px"

  border-radius:
    full: "100px"
    panel: "26px"
    card: "12px"
    input: "12px"
    modal: "16px"

  shadows:
    card-glow: "0 22px 70px {accent}12, inset 0 1px 0 rgba(255,255,255,0.08)"

  blur:
    panel: "20px"
    modal-backdrop: "4px"

  breakpoints:
    panel-max-width: "680px"
    modal-max-width: "1024px"
---

# Design System — Business Leads Quiz

## Brand & Visual Identity

Das Quiz hat ein dunkles, premium-minimalistisches Erscheinungsbild. Der Grundton ist tiefes Marineblau-Schwarz (`#070B14`), ergänzt durch subtile radiale Gradienten mit Gold- und Indigotönen in den Ecken — das schafft Tiefe, ohne aufdringlich zu sein. Gold (`#C9A84C`) ist das einzige starke Branding-Signal: es erscheint in Badges, Akzentüberschriften, CTAs und der Fortschrittsleiste. Der Gesamteindruck ist: exklusiv, vertrauenswürdig, professionell.

Der Designstil ist **Glass Morphism auf dunklem Hintergrund**: halbtransparente Panels mit `backdrop-filter: blur(20px)` und goldenen Borders — keine weißen Cards, keine harten Schatten.

## Color System

### Background-Schichten

Die Schichtung von außen nach innen:

1. **Page base** `#070B14` — das tiefe Dunkelblau-Schwarz, Seiten-Hintergrund
2. **Page gradient** — zwei radiale Farbpunkte (Gold 5% opacity oben-links, Indigo 5% unten-rechts) über dem Base
3. **Panel surface** `rgba(255,255,255,0.028)` — Glasscheibe-Effekt für alle Content-Cards
4. **Input/field background** `rgba(255,255,255,0.04)` + `rgba(7,11,20,0.62)` — leicht aufgehellte Eingabefelder

Panels haben immer `backdrop-filter: blur(20px)` und eine goldene Border `rgba(201,168,76,0.13)`.

### Text-Hierarchie

Text ist nie reines Weiß, sondern immer in `#F5F0E8` (warmes Off-White) mit verschiedenen Opacity-Stufen:

| Stufe | Wert | Einsatz |
|---|---|---|
| Primary | `#F5F0E8` (100%) | Hauptüberschriften, Antworttext |
| Secondary | `rgba(245,240,232,0.68)` | Subtitel, Beschreibungen |
| Muted | `rgba(245,240,232,0.52)` | Labels, Hilfstexte |
| Faint | `rgba(245,240,232,0.38)` | Inaktive States, Sekundär-Buttons |
| Ghost | `rgba(245,240,232,0.18)` | Footer, Trennlinien, Legal-Links |

### Accent / Brand-Farbe

Gold `#C9A84C` ist die einzige Akzentfarbe und wird für:
- **Badge-Labels** über Überschriften (uppercase, letter-spacing 3.5px)
- **Fortschrittsanzeige** (Schritte und Fortschrittsbalken-Gradient `#C9A84C → #A8873E`)
- **Primäre CTAs** (Hintergrund des Haupt-Buttons)
- **Aktiver Sprachschalter** (Hover und aktiver State)
- **Em-Tags** in Hauptüberschriften für goldene Wortakzente

verwendet. Der goldene CTA-Button hat immer dunklen Text `#0A0A0A` drauf.

Die Akzentfarbe ist dynamisch: `accentColor` wird aus dem Coach-Profil geladen (`e?.accentColor || '#C9A84C'`). Coaches können also ihre eigene Markenfarbe einsetzen — alle Stile nutzen diesen Wert dynamisch.

### Semantische Farben

| Rolle | Farbe | Einsatz |
|---|---|---|
| Danger/Error | `#FF6B6B` / `#FF9E9E` | Formular-Validierung, Error-Borders |
| Danger Surface | `rgba(255,107,107,0.08)` + Border `0.22` | Error-Infoboxen |
| WhatsApp CTA | `#25D366` auf weißem Text | WhatsApp-Button auf Result-Seite |

## Typography

### Font-Familien

**Cormorant Garamond** (Serif) — für Haupt-Headlines. Selbst gehostet als `.woff2` in 4 Schnitten: 400, 400-italic, 600, 700. Vermittelt Premium und Persönlichkeit. Wird ausschließlich in `titleStyle()` verwendet.

**DM Sans** (Sans-Serif) — für alles andere: Body, Buttons, Labels, Inputs, Badges. Selbst gehostet in 4 Schnitten: 300, 400, 500, 600. Sehr gut lesbar, modern und neutral.

### Anwendungsmuster

| Element | Font | Größe | Gewicht |
|---|---|---|---|
| Haupt-Headline | Cormorant Garamond | `clamp(~28px, vw-formel, 46px)` | 400 |
| Badge über Headline | DM Sans | 11px | 400, uppercase, ls 3.5px |
| Body / Antwortoptionen | DM Sans | 15px | 400–500 |
| Button (primary) | DM Sans | 15px | 600 |
| Button (secondary) | DM Sans | 13px | 400 |
| Input | DM Sans | 15px | 400 |
| Footer / Legal | DM Sans | 10px | 400 |

Headlines nutzen `clamp()` für fluid responsive Skalierung: `clamp(size*0.62px, size*0.07vw + 10px, sizepx)`.

## Spacing & Layout

Die gesamte App ist eine Single-Page-Anwendung mit vertikaler Zentrierung. Der Page-Container hat:
- `minHeight: 100vh`, `display: flex`, `flexDirection: column`, `alignItems: center`, `justifyContent: center`
- Padding: `24px 16px` (oben/unten, links/rechts)

Content-Panels sind immer auf max. `680px` begrenzt und nehmen `width: 100%` — mobile-first. Padding innerhalb der Panels: `clamp(28px, 5vw, 50px)` vertikal, `clamp(22px, 5vw, 46px)` horizontal.

## Component Patterns

### Panels (Cards)

Alle Content-Schritte (Intro, Fragen, Optin-Formular, Ergebnis, Videos) nutzen dieselbe Panel-Struktur:

```
background: rgba(255,255,255,0.028)
border-radius: 26px
border: 1px solid rgba(201,168,76,0.13)
padding: clamp(28px,5vw,50px) clamp(22px,5vw,46px)
backdrop-filter: blur(20px)
```

Panel-Transitions beim Stufenwechsel: `opacity 0.35s ease, transform 0.35s ease` (fade + slide up 10px).

### Buttons

**Primary Button** — für die Haupt-CTA jeder Seite:
```
background: linear-gradient(135deg, {accentColor}, {accentColor}CC)
color: #0A0A0A
border: none
border-radius: 100px
padding: 15px 40px
font-size: 15px
font-weight: 600
letter-spacing: 0.3px
```

**Secondary Button** — für "Zurück" oder optionale Aktionen:
```
background: none
border: 1px solid rgba(255,255,255,0.1)
border-radius: 100px
padding: 13px 24px
color: rgba(245,240,232,0.38)
font-size: 13px
```

Beide Buttons haben `border-radius: 100px` — vollständig abgerundet (Pill-Form).

### Antwort-Optionen (Quiz)

Antwort-Cards sind subtile Glass-Container:
```
background: rgba(255,255,255,0.03)
border: 1px solid rgba(255,255,255,0.06)
border-radius: 12px
```
Nach Auswahl wechselt der Border auf `accentColor`.

### Formulare (Optin-Step)

Inputs:
```
background: rgba(255,255,255,0.04)  (oder rgba(7,11,20,0.62) als Alternative)
border: 1px solid rgba(245,240,232,0.16)
border-radius: 12px
padding: 14px 18px
font-size: 15px
color: #F5F0E8
font-family: DM Sans
```

Focus: Border wechselt auf `accentColor`. Error: Border wechselt auf `#FF6B6B`, Error-Text in `#FF6B6B` 12px darunter.

### Fortschrittsleiste

Zweistufige Anzeige:
1. **Schritt-Indikatoren** — kleine Punkte/Segmente, aktiv = `accentColor`, inaktiv = `rgba(255,255,255,0.1)`
2. **Bar** — Hintergrund `rgba(201,168,76,0.1)`, Füllung als Gradient `linear-gradient(90deg, #C9A84C, #A8873E)`

### Badge

Über Haupt-Headlines erscheint immer ein Badge-Label:
```
font-family: DM Sans
font-size: 11px
letter-spacing: 3.5px
text-transform: uppercase
color: #C9A84C
margin-bottom: 12px
display: block
```

### Sprach-Switcher

Inline-Liste mit Sprachkürzeln. Aktive Sprache und Hover: `#C9A84C`. Inaktiv: `rgba(245,240,232,0.38)`. Transition: color.

### Modal (Legal/Impressum)

```
backdrop: rgba(0,0,0,0.6) + blur(4px)
container: background white, border-radius 16px, max-width 1024px, height 80vh
header: border-bottom 1px solid #f3f4f6, font-size 18px, font-weight 600, color #111827
```

Das Legal-Modal ist der einzige Teil der App in Hell/Weiß — bewusst kontrastierend für rechtliche Dokumente.

## Motion & Interaction

- **Panel-Transitionen**: `opacity 0.35s ease + translateY(10px→0)` beim Ein-/Ausblenden jedes Schritts
- **Button-Hover**: Inline-Style-Wechsel (keine CSS-Klassen), meist color oder opacity
- **Modal**: `opacity` + `scale(0.95→1)` mit `300ms transition`
- **Allgemeines Prinzip**: Sanfte, kurze Fades/Slides. Keine aufwändigen Animationen — der Fokus liegt auf Inhalten

## Dynamisches Theming (Coach-Branding)

Die Akzentfarbe ist nicht hardcoded. Beim Start wird `accentColor` aus dem Coach-Profil (`localStorage acCoach`) geladen. Alle `primaryButtonStyle()`, Progress-Indikatoren, Focus-States und Akzent-Borders verwenden diese dynamische Farbe. Standard-Fallback ist immer `#C9A84C`.

Das ermöglicht White-Label-Einsatz: jeder Coach kann seine eigene Markenfarbe einsetzen, ohne das Gesamtlayout zu verändern.
