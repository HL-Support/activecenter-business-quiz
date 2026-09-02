/**
 * Die Ablauf-Maschine des Funnels — Etappe E1 des Maschine/Template-Plans
 * (docs/plans/2026-09-01-frontend-maschine-template.md, §2.1/§3 E1).
 *
 * Hier leben die ENTSCHEIDUNGEN der Schrittfolge als pure Funktionen: welcher
 * Schritt auf eine Antwort folgt, wie ein Wiedereinstieg abgebildet wird, wie
 * ein Neustart aussieht, und die Auswertungsableitungen aus den Antworten
 * (Profilcode, Aspiration). Kein UI-Framework, kein Netz, kein Speicher, keine Optik —
 * Eingabe rein, Entscheidung raus. Die Seiteneffekte (State-Setzen, Storage,
 * Ereignisse, 350-ms-Blende) bleiben beim Aufrufer; sie ziehen in spaeteren
 * Etappen nach.
 *
 * 🔴 Verhaltensvertrag: Jede Funktion bildet EXAKT das Verhalten ab, das bis
 * E1 inline in src/app/App.jsx stand (QuizFlow: Antwort-Uebergang, analyzing-
 * Auswertung, Resume-Effect, Restart). Aenderungen hier sind Fachaenderungen
 * und brauchen einen eigenen, begruendeten PR — nie "nebenbei".
 * scripts/tests/ablauf-maschine.test.js haelt die Entscheidungstabelle fest.
 */

/** Die Schritte des Funnels in ihrer natuerlichen Reihenfolge. */
export const SCHRITTE = [
  'intro',
  'quiz',
  'aspiration-confirm',
  'analyzing',
  'optin',
  'result',
  'videos',
  'final',
];

/** Nach Frage 4 (Index 3) wird die Aspiration bestaetigt — wie bisher. */
const ASPIRATION_BESTAETIGUNG_NACH_INDEX = 3;

/**
 * Was auf eine beantwortete Frage folgt.
 * Rueckgabe: { ziel: 'aspiration-confirm'|'quiz'|'analyzing', naechsterIndex }
 * — 'quiz' heisst: naechste Frage im selben Schritt.
 */
export function uebergangNachAntwort(frageIndex, anzahlFragen) {
  if (frageIndex === ASPIRATION_BESTAETIGUNG_NACH_INDEX) {
    return { ziel: 'aspiration-confirm', naechsterIndex: frageIndex + 1 };
  }
  if (frageIndex < anzahlFragen - 1) {
    return { ziel: 'quiz', naechsterIndex: frageIndex + 1 };
  }
  return { ziel: 'analyzing', naechsterIndex: frageIndex };
}

/**
 * Profilcode aus den ersten drei Antworten — exakt die bisherige Zaehlung
 * inklusive Gleichstand-Verhalten: stabile Sortierung, bei Gleichstand
 * gewinnt die Einfuegereihenfolge R vor Y vor G vor B.
 */
export function profilCodeAusAntworten(antworten) {
  const zaehler = { R: 0, Y: 0, G: 0, B: 0 };
  (Array.isArray(antworten) ? antworten : []).slice(0, 3).forEach((antwort) => {
    if (antwort && antwort.type && zaehler[antwort.type] !== undefined) {
      zaehler[antwort.type] += 1;
    }
  });
  return Object.entries(zaehler).sort((links, rechts) => rechts[1] - links[1])[0][0];
}

/** Aspiration aus den Antworten — Frage 4 vor Frage 5, sonst 'freedom'. */
export function aspirationAusAntworten(antworten) {
  const liste = Array.isArray(antworten) ? antworten : [];
  return liste[3]?.aspiration || liste[4]?.aspiration || 'freedom';
}

/** Wiedereinstiegs-Prozentwert wie bisher hart auf 0..90 geklemmt. */
export function klemmeResumeProzent(wert) {
  const zahl = Number(wert);
  return Number.isFinite(zahl) ? Math.max(0, Math.min(90, zahl)) : 0;
}

/**
 * Abbildung eines Wiedereinstiegs (Resume-Link) auf den Startzustand.
 *
 * Eingabe:
 *   resumeTarget      'videos' | 'final' | 'result' | beliebig
 *   videoStep         gewuenschter Videoschritt aus der Saat
 *   resumeStartPercent gewuenschter Startfortschritt (roh)
 *   profilBekannt     true, wenn der Profilcode aus der Saat aufloesbar ist
 *   anzahlVideos      Anzahl konfigurierter Videos
 *
 * Rueckgabe: { schritt, videoStep, resumeVideoStep, resumeStartPercent }
 *
 * Verhalten wie bisher (App.jsx-Resume-Effect), inklusive des Guards: Ziel
 * 'result' OHNE aufloesbaren Profilcode faellt auf die Videoseite (Schritt 1),
 * nie zurueck ins Quiz.
 */
export function resumeZiel({
  resumeTarget,
  videoStep,
  resumeStartPercent,
  profilBekannt,
  anzahlVideos,
}) {
  if (resumeTarget === 'videos') {
    const normalisiert =
      videoStep > 1 && videoStep <= anzahlVideos ? videoStep : 1;
    return {
      schritt: 'videos',
      videoStep: normalisiert,
      resumeVideoStep: normalisiert,
      resumeStartPercent: klemmeResumeProzent(resumeStartPercent),
    };
  }
  if (resumeTarget === 'final') {
    return { schritt: 'final', videoStep: 1, resumeVideoStep: 0, resumeStartPercent: 0 };
  }
  if (profilBekannt) {
    return { schritt: 'result', videoStep: 1, resumeVideoStep: 0, resumeStartPercent: 0 };
  }
  return { schritt: 'videos', videoStep: 1, resumeVideoStep: 1, resumeStartPercent: 0 };
}

/**
 * Der Neustart-Zustand (Final-Seite -> "nochmal") — exakt die bisherigen
 * Werte des Restart-Handlers.
 */
export function neustartZustand() {
  return {
    schritt: 'intro',
    frageIndex: 0,
    antworten: [],
    gewaehlt: null,
    profil: null,
    analyzingSchritt: 0,
    videoStep: 1,
    aspiration: 'freedom',
  };
}
