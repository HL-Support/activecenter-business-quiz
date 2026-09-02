/**
 * Der Ereignis-Katalog des Funnels — Etappe E2 des Maschine/Template-Plans.
 *
 * Hier steht fuer JEDES Funnel-Ereignis, wie es heisst und was es traegt —
 * als pure Bauer (`baue*`, testbar ohne Netz) plus duenne Sender (`melde*`,
 * die den bestehenden Weg trackQuizAnalytics nutzen). Payloads sind wortgleich
 * aus src/app/App.jsx uebernommen; die Ereignis-Matrix (E0b) haelt Namen,
 * Reihenfolge und Schluessel unabhaengig davon eingefroren.
 *
 * Die Video-Ereignisse leben in der Video-Engine (video-engine.js), das
 * form_submitted-Ereignis im Submissionsweg (lib/core.js) — beides gehoert
 * ebenfalls der Maschine. Ausserhalb der Maschine soll es auf Dauer KEINE
 * Ereignisquelle mehr geben (Grenzregel E5).
 */
import {
  trackQuizAnalytics,
  getAspirationLabel,
  deriveQuizBarrier,
  getOptinExperimentVariant,
  getOptinPreviewVariant,
} from '../lib/core.js';

function jetzt() {
  return new Date().toISOString();
}

/**
 * Anzeige- und Messvariante des Optin-A/B in einem Griff:
 * `anzeige` bestimmt, was das Template rendert (Vorschau erzwingt nur das),
 * `messung` bestimmt, was gekennzeichnet wird (Vorschau: nie).
 */
export function optinVarianten(slug) {
  const vorschau = getOptinPreviewVariant();
  const zugeteilt = getOptinExperimentVariant(slug);
  return { anzeige: vorschau || zugeteilt, messung: vorschau ? null : zugeteilt };
}

export function baueQuizGestartet() {
  return { name: 'quiz_started', payload: { quiz_started_at: jetzt() } };
}

export function baueFrageGesehen(frage, frageIndex) {
  return {
    name: 'question_viewed',
    payload: {
      step_index: frageIndex + 1,
      question_index: frageIndex + 1,
      question_key: frage.id,
      question_phase: frage.phase,
      question_viewed_at: jetzt(),
    },
  };
}

export function baueFrageBeantwortet(frage, frageIndex, option) {
  return {
    name: 'question_answered',
    payload: {
      step_index: frageIndex + 1,
      question_index: frageIndex + 1,
      question_key: frage?.id || frageIndex + 1,
      question_phase: frage?.phase || '',
      answer_label: option.label || '',
      answer_type: option.type || '',
      answer_aspiration: option.aspiration || '',
      answer_barrier: option.barrier || '',
      answered_at: jetzt(),
    },
  };
}

export function baueAspirationBestaetigt(aspiration) {
  return {
    name: 'aspiration_confirmed',
    payload: {
      quiz_aspiration: aspiration,
      main_aspiration: aspiration,
      main_aspiration_label: getAspirationLabel(aspiration),
      aspiration_confirmed_at: jetzt(),
    },
  };
}

export function baueQuizErgebnis(profilCode, profilName, aspiration, antworten) {
  return {
    name: 'quiz_result',
    payload: {
      quiz_profile: profilCode,
      quiz_profile_name: profilName,
      quiz_aspiration: aspiration,
      main_aspiration: aspiration,
      main_aspiration_label: getAspirationLabel(aspiration),
      quiz_barrier: deriveQuizBarrier(antworten),
      quiz_completed_at: jetzt(),
    },
  };
}

export function baueOptinGesehen(profil, aspiration, messung) {
  return {
    name: 'optin_viewed',
    payload: {
      quiz_profile: profil?.code || '',
      quiz_profile_name: profil?.name || '',
      quiz_aspiration: aspiration || 'freedom',
      main_aspiration: aspiration || 'freedom',
      main_aspiration_label: getAspirationLabel(aspiration || 'freedom'),
      optin_viewed_at: jetzt(),
      ...(messung ? { experiment_name: 'optin_phone_v1', experiment_variant: messung } : {}),
    },
  };
}

export function baueFormularAbgeschickt(vorname, email, messung, telefonAngegeben) {
  return {
    name: 'form_submit',
    payload: {
      form_first_name: vorname,
      form_email: email,
      form_submitted_at: jetzt(),
      ...(messung
        ? {
            experiment_name: 'optin_phone_v1',
            experiment_variant: messung,
            phone_provided: telefonAngegeben ? '1' : '0',
          }
        : {}),
    },
  };
}

export function baueErgebnisGesehen(profil, aspiration) {
  return {
    name: 'result_viewed',
    payload: {
      quiz_profile: profil?.code || '',
      quiz_profile_name: profil?.name || '',
      quiz_aspiration: aspiration,
      main_aspiration: aspiration,
      main_aspiration_label: getAspirationLabel(aspiration),
      result_viewed_at: jetzt(),
    },
  };
}

export function baueErgebnisCta(profil, aspiration) {
  return {
    name: 'result_cta_click',
    payload: {
      quiz_profile: profil?.code || '',
      quiz_profile_name: profil?.name || '',
      quiz_aspiration: aspiration,
      main_aspiration: aspiration,
      main_aspiration_label: getAspirationLabel(aspiration),
      result_cta_clicked_at: jetzt(),
    },
  };
}

export function baueVideoGesehen(videoStep, videoId) {
  return {
    name: 'video_viewed',
    payload: {
      video_step: videoStep,
      video_id: videoId || `quiz_video_${videoStep}`,
      video_viewed_at: jetzt(),
    },
  };
}

export function baueVideoErholung(videoStep, aktion) {
  return {
    name: 'video_recovery',
    payload: {
      video_step: videoStep,
      video_recovery_action: aktion,
      video_recovery_at: jetzt(),
    },
  };
}

export function baueVideoWeiter(videoStep, videoId, anzahlVideos) {
  return {
    name: 'video_continue_click',
    payload: {
      video_step: videoStep,
      video_id: videoId || `quiz_video_${videoStep}`,
      next_step: videoStep < anzahlVideos ? videoStep + 1 : 'final',
      video_continue_clicked_at: jetzt(),
    },
  };
}

export function baueFinalGesehen(profil) {
  return {
    name: 'final_viewed',
    payload: {
      quiz_profile: profil?.code || '',
      quiz_profile_name: profil?.name || '',
      final_viewed_at: jetzt(),
    },
  };
}

export function baueCta(typ) {
  return { name: 'cta_click', payload: { cta_type: typ, cta_clicked_at: jetzt() } };
}

/** Der eine Sendeweg: gebautes Ereignis -> bestehende Analytics-Leitung. */
export function melde(ereignis) {
  trackQuizAnalytics(ereignis.name, ereignis.payload);
}
