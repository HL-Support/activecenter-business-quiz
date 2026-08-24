const crypto = require('crypto');
const { Buffer } = require('buffer');

const {
  getLeadFlags,
  handleOptions,
  isLeadHash,
  normalizeLanguage,
  safeInteger,
  safeString,
  sendJson,
  supabaseJson,
  supabaseRequest,
  supabaseRpc,
} = require('../server/lead-system');

// Seit Phase 1 (/berater-info) gibt es genau EINEN Erzeuger fuer Coach-Insights-Links.
// Vorher lagen hier und in api/bridge.js zwei Kopien mit unterschiedlichem Profil-Mapping
// (Inventur 2026-08-24, Befund D-2).
const {
  buildCoachInsightsUrl,
  normalizeAspirationKey,
  normalizeProfileCode,
} = require('../server/coach-insights-link');

const N8N_UPDATE_RESULT_URL = process.env.N8N_UPDATE_RESULT_URL;
const N8N_UPDATE_RESULT_SECRET = String(process.env.N8N_UPDATE_RESULT_SECRET || '').trim();
const WORKER_SECRET = process.env.LEAD_OUTBOX_WORKER_SECRET || process.env.BRIDGE_KEY;
const BRIDGE_URL = process.env.BRIDGE_URL || 'https://ac-reconnect.com/db-bridge.php';
const BRIDGE_KEY = process.env.BRIDGE_KEY;
const POSTMARK_SERVER_TOKEN = process.env.POSTMARK_SERVER_TOKEN;
const POSTMARK_FROM = process.env.POSTMARK_FROM || 'Activecenter-Support <mail@mail.hl-support.biz>';
const POSTMARK_MESSAGE_STREAM = process.env.POSTMARK_MESSAGE_STREAM || 'outbound';
const HOT_LEAD_OUTBOX_EMAIL_ENABLED =
  String(process.env.HOT_LEAD_OUTBOX_EMAIL_ENABLED || '').trim() === '1';
const BRAND_LOGO_URL = 'https://hl-support.biz/storage/images/cwemaillogo-1bcb4f.png';
const BRAND_PRIVACY_URL = 'https://hl-support.biz/impressum-datenschutz/';

const MYSQL_SYNC_TYPES = new Set(['mysql_initial_rank', 'mysql_rank_update']);
const SUPPORTED_SYNC_TYPES = new Set([...MYSQL_SYNC_TYPES, 'coach_hot_lead_email']);

function getHeader(req, name) {
  const wanted = name.toLowerCase();
  const entry = Object.entries(req.headers || {}).find(([key]) => key.toLowerCase() === wanted);
  return entry ? String(entry[1] || '') : '';
}

function timingSafeEqualText(a, b) {
  const left = Buffer.from(String(a || '').trim());
  const right = Buffer.from(String(b || '').trim());
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function authorize(req) {
  if (!WORKER_SECRET) {
    const error = new Error('worker_secret_not_configured');
    error.status = 500;
    throw error;
  }

  const provided =
    getHeader(req, 'x-lead-worker-secret') ||
    getHeader(req, 'x-bridge-key') ||
    safeString(req.query?.secret, 512);

  if (!provided || !timingSafeEqualText(provided, WORKER_SECRET)) {
    const error = new Error('unauthorized');
    error.status = 401;
    throw error;
  }
}

function rankLabel(rank, lang = 'de') {
  const normalizedRank = Math.max(0, Math.min(3, safeInteger(rank)));
  const normalizedLang = safeString(lang, 5).toLowerCase().slice(0, 2) || 'de';
  const labels = {
    de: [
      'Noch kein Infovideo vollständig angeschaut',
      '1/3 Infovideos vollständig angeschaut',
      '2/3 Infovideos vollständig angeschaut',
      'Alle 3 Infovideos vollständig angeschaut',
    ],
    it: [
      'Nessun video informativo completato',
      '1/3 video informativi completati',
      '2/3 video informativi completati',
      'Tutti e 3 i video informativi completati',
    ],
    en: [
      'No information video fully watched yet',
      '1/3 information videos fully watched',
      '2/3 information videos fully watched',
      'All 3 information videos fully watched',
    ],
    fr: [
      'Aucune vidéo informative regardée entièrement',
      '1/3 vidéos informatives regardées entièrement',
      '2/3 vidéos informatives regardées entièrement',
      'Les 3 vidéos informatives regardées entièrement',
    ],
    ru: [
      'Информационные видео ещё не просмотрены полностью',
      '1/3 информационных видео просмотрено полностью',
      '2/3 информационных видео просмотрено полностью',
      'Все 3 информационных видео просмотрены полностью',
    ],
    hu: [
      'Még nincs teljesen megnézett információs videó',
      '1/3 információs videó teljesen megnézve',
      '2/3 információs videó teljesen megnézve',
      'Mind a 3 információs videó teljesen megnézve',
    ],
  };

  return (labels[normalizedLang] || labels.de)[normalizedRank];
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char]);
}

const HOT_LEAD_EMAIL_I18N = {
  de: {
    subject: (name) => `Hot Lead: ${name} hat alle 3 Videos angesehen`,
    preheader: 'Ein Kontakt hat alle 3 Info-Videos vollständig angeschaut.',
    title: (slug) => `Hot Lead aus business.activecenter.info/${slug || ''}`,
    greeting: (name) => `Hallo ${name},`,
    intro:
      'ein Kontakt hat alle 3 Info-Videos vollständig angeschaut. Das zeigt großes Interesse und ist ein guter Moment für eine persönliche Nachricht.',
    labels: {
      name: 'Name',
      email: 'E-Mail',
      type: 'Typ',
      aspiration: 'Zielsetzung',
      barrier: 'Was ihn aktuell zurückhält',
      completedAt: 'Abgeschlossen am',
    },
    footerReason:
      'Diese Benachrichtigung wurde automatisch erstellt, weil ein Quiz-Kontakt alle 3 Info-Videos vollständig angeschaut hat.',
    privacyLabel: 'Impressum &amp; Datenschutz',
    copyrightLabel: '&copy; HL-Support Ltd. &middot; Alle Rechte vorbehalten',
    profiles: {
      A: 'Typ A Der Macher',
      B: 'Typ B Der Netzwerker',
      C: 'Typ C Der Anker',
      D: 'Typ D Der Architekt',
    },
    aspirations: {
      freedom: 'Freiheit',
      impact: 'Wirkung',
      security: 'Sicherheit',
      growth: 'Wachstum',
    },
    barriers: {
      vehicle: 'ein funktionierendes System',
      community: 'das richtige Umfeld',
      confidence: 'einen sicheren ersten Schritt',
      opportunity: 'die passende Möglichkeit',
    },
  },
  it: {
    subject: (name) => `Hot lead: ${name} ha guardato tutti e 3 i video`,
    preheader: 'Un contatto ha guardato completamente tutti e 3 i video informativi.',
    title: (slug) => `Hot lead da business.activecenter.info/${slug || ''}`,
    greeting: (name) => `Ciao ${name},`,
    intro:
      'un contatto ha guardato completamente tutti e 3 i video informativi. Questo mostra un grande interesse ed è un buon momento per un messaggio personale.',
    labels: {
      name: 'Nome',
      email: 'E-mail',
      type: 'Tipo',
      aspiration: 'Obiettivo',
      barrier: 'Cosa lo trattiene al momento',
      completedAt: 'Completato il',
    },
    footerReason:
      'Questa notifica è stata creata automaticamente perché un contatto del quiz ha guardato completamente tutti e 3 i video informativi.',
    privacyLabel: 'Note legali &amp; privacy',
    copyrightLabel: '&copy; HL-Support Ltd. &middot; Tutti i diritti riservati',
    profiles: {
      A: 'Tipo A Il realizzatore',
      B: 'Tipo B Il connettore',
      C: "Tipo C L'ancora",
      D: "Tipo D L'architetto",
    },
    aspirations: {
      freedom: 'Libertà',
      impact: 'Impatto',
      security: 'Sicurezza',
      growth: 'Crescita',
    },
    barriers: {
      vehicle: 'un sistema che funziona',
      community: "l'ambiente giusto",
      confidence: 'un primo passo sicuro',
      opportunity: "l'opportunità giusta",
    },
  },
  en: {
    subject: (name) => `Hot lead: ${name} watched all 3 videos`,
    preheader: 'A contact has watched all 3 info videos all the way through.',
    title: (slug) => `Hot lead from business.activecenter.info/${slug || ''}`,
    greeting: (name) => `Hi ${name},`,
    intro:
      'a contact has watched all 3 info videos all the way through. This shows strong interest and it is a good moment for a personal message.',
    labels: {
      name: 'Name',
      email: 'Email',
      type: 'Type',
      aspiration: 'Goal',
      barrier: 'What is currently holding them back',
      completedAt: 'Completed on',
    },
    footerReason:
      'This notification was created automatically because a quiz contact watched all 3 info videos all the way through.',
    privacyLabel: 'Legal notice &amp; privacy',
    copyrightLabel: '&copy; HL-Support Ltd. &middot; All rights reserved',
    profiles: {
      A: 'Type A The doer',
      B: 'Type B The connector',
      C: 'Type C The anchor',
      D: 'Type D The architect',
    },
    aspirations: {
      freedom: 'Freedom',
      impact: 'Impact',
      security: 'Security',
      growth: 'Growth',
    },
    barriers: {
      vehicle: 'a working system',
      community: 'the right environment',
      confidence: 'a safe first step',
      opportunity: 'the right opportunity',
    },
  },
  fr: {
    subject: (name) => `Lead chaud : ${name} a regardé les 3 vidéos`,
    preheader: "Un contact a regardé les 3 vidéos d'information jusqu'au bout.",
    title: (slug) => `Lead chaud depuis business.activecenter.info/${slug || ''}`,
    greeting: (name) => `Bonjour ${name},`,
    intro:
      "un contact a regardé les 3 vidéos d'information jusqu'au bout. Cela montre un grand intérêt et c'est un bon moment pour un message personnel.",
    labels: {
      name: 'Nom',
      email: 'E-mail',
      type: 'Type',
      aspiration: 'Objectif',
      barrier: 'Ce qui le bloque actuellement',
      completedAt: 'Terminé le',
    },
    footerReason:
      "Cette notification a été créée automatiquement parce qu'un contact du quiz a regardé les 3 vidéos d'information jusqu'au bout.",
    privacyLabel: 'Mentions légales &amp; confidentialité',
    copyrightLabel: '&copy; HL-Support Ltd. &middot; Tous droits réservés',
    profiles: {
      A: 'Type A Le faiseur',
      B: 'Type B Le connecteur',
      C: "Type C L'ancre",
      D: "Type D L'architecte",
    },
    aspirations: {
      freedom: 'Liberté',
      impact: 'Impact',
      security: 'Sécurité',
      growth: 'Croissance',
    },
    barriers: {
      vehicle: 'un système fonctionnant',
      community: "l'environnement adéquat",
      confidence: 'un premier pas sûr',
      opportunity: "l'opportunité idéale",
    },
  },
  ru: {
    subject: (name) => `Горячий лид: ${name} посмотрел(а) все 3 видео`,
    preheader: 'Контакт полностью посмотрел все 3 информационных видео.',
    title: (slug) => `Горячий лид с business.activecenter.info/${slug || ''}`,
    greeting: (name) => `Здравствуйте, ${name},`,
    intro:
      'контакт полностью посмотрел все 3 информационных видео. Это показывает высокий интерес и это хороший момент для личного сообщения.',
    labels: {
      name: 'Имя',
      email: 'E-mail',
      type: 'Тип',
      aspiration: 'Цель',
      barrier: 'Что сейчас останавливает',
      completedAt: 'Завершено',
    },
    footerReason:
      'Это уведомление было создано автоматически, потому что контакт из квиза полностью посмотрел все 3 информационных видео.',
    privacyLabel: 'Правовая информация и конфиденциальность',
    copyrightLabel: '&copy; HL-Support Ltd. &middot; Все права защищены',
    profiles: {
      A: 'Тип A Деятель',
      B: 'Тип B Соединитель',
      C: 'Тип C Якорь',
      D: 'Тип D Архитектор',
    },
    aspirations: {
      freedom: 'Свобода',
      impact: 'Влияние',
      security: 'Безопасность',
      growth: 'Рост',
    },
    barriers: {
      vehicle: 'работающая система',
      community: 'правильная среда',
      confidence: 'безопасный первый шаг',
      opportunity: 'правильная возможность',
    },
  },
  hu: {
    subject: (name) => `Forró érdeklődő: ${name} megnézte mind a 3 videót`,
    preheader: 'Egy kontakt teljesen végignézte mind a 3 információs videót.',
    title: (slug) => `Forró érdeklődő innen: business.activecenter.info/${slug || ''}`,
    greeting: (name) => `Szia ${name},`,
    intro:
      'valaki teljesen végignézte mind a 3 információs videót. Ez erős érdeklődést mutat, és jó pillanat egy személyes üzenetre.',
    insightsLinkLabel: 'Itt tudhatsz meg többet a kontaktodról',
    labels: {
      name: 'Név',
      email: 'E-mail',
      type: 'Típus',
      aspiration: 'Cél',
      barrier: 'Mi tartja most vissza',
      completedAt: 'Befejezve',
    },
    footerReason:
      'Ezt az értesítést automatikusan hoztuk létre, mert egy kvízkitöltő teljesen végignézte mind a 3 információs videót.',
    privacyLabel: 'Impresszum és adatvédelem',
    copyrightLabel: '&copy; HL-Support Ltd. &middot; Minden jog fenntartva',
    profiles: {
      A: 'A Cselekvő (A típus)',
      B: 'A Kapcsolatteremtő (B típus)',
      C: 'A Támasz (C típus)',
      D: 'Az Építő (D típus)',
    },
    aspirations: {
      freedom: 'Szabadság',
      impact: 'Hatás',
      security: 'Biztonság',
      growth: 'Növekedés',
    },
    barriers: {
      vehicle: 'egy működő rendszer',
      community: 'a megfelelő környezet',
      confidence: 'egy biztonságos első lépés',
      opportunity: 'a megfelelő lehetőség',
    },
  },
};

function normalizeBarrierKey(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (
    normalized === 'vehicle' ||
    normalized.includes('system') ||
    normalized.includes('sistema') ||
    normalized.includes('système') ||
    normalized.includes('система') ||
    normalized.includes('rendszer')
  ) {
    return 'vehicle';
  }
  if (
    normalized === 'community' ||
    normalized.includes('umfeld') ||
    normalized.includes('ambiente') ||
    normalized.includes('environnement') ||
    normalized.includes('сред') ||
    normalized.includes('környezet') ||
    normalized.includes('kornyezet')
  ) {
    return 'community';
  }
  if (
    normalized === 'confidence' ||
    normalized.includes('sicherheit') ||
    normalized.includes('sicurezza') ||
    normalized.includes('sécurité') ||
    normalized.includes('schritt') ||
    normalized.includes('passo') ||
    normalized.includes('pas ') ||
    normalized.includes('шаг') ||
    normalized.includes('biztonság') ||
    normalized.includes('biztonsag') ||
    normalized.includes('lépés') ||
    normalized.includes('lepes')
  ) {
    return 'confidence';
  }
  if (
    normalized === 'opportunity' ||
    normalized.includes('möglichkeit') ||
    normalized.includes('opportun') ||
    normalized.includes('возмож') ||
    normalized.includes('lehetőség') ||
    normalized.includes('lehetoseg')
  ) {
    return 'opportunity';
  }
  return '';
}

function formatLocalizedDateTime(value, lang) {
  const date = new Date(value || new Date().toISOString());
  if (Number.isNaN(date.getTime())) return '';
  const formatter = new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  if (lang === 'it' || lang === 'fr') return `${parts.day}/${parts.month}/${parts.year} - ${parts.hour}:${parts.minute}`;
  if (lang === 'en') return `${parts.month}/${parts.day}/${parts.year} - ${parts.hour}:${parts.minute}`;
  if (lang === 'ru' || lang === 'hu') return `${parts.day}.${parts.month}.${parts.year} - ${parts.hour}:${parts.minute}`;
  return `${parts.day}.${parts.month}.${parts.year} - ${parts.hour}:${parts.minute} Uhr`;
}

function detectCoachLanguage(coach, lead, job) {
  const country = String(coach?.address?.country || coach?.country || '').trim().toUpperCase();
  const countryLanguage =
    {
      DE: 'de',
      AT: 'de',
      CH: 'de',
      IT: 'it',
      FR: 'fr',
      BE: 'fr',
      RU: 'ru',
      GB: 'en',
      UK: 'en',
      US: 'en',
      CA: 'en',
      AU: 'en',
      HU: 'hu',
    }[country] || '';
  const candidates = [
    coach?.preferred_newsletter_language,
    coach?.preferred_language,
    coach?.language,
    coach?.lang,
    coach?.locale,
    job?.context_data?.lang,
    lead?.lang,
    countryLanguage,
  ];
  for (const value of candidates) {
    const lang = String(value || '').trim().toLowerCase().slice(0, 2);
    if (['de', 'it', 'en', 'fr', 'ru', 'hu'].includes(lang)) return lang;
  }
  return normalizeLanguage('de');
}

function buildDefaultFooter(reason, lang = 'de') {
  const copy = HOT_LEAD_EMAIL_I18N[lang] || HOT_LEAD_EMAIL_I18N.de;
  return [
    `<p style="margin:0 0 10px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#999999;">${escapeHtml(reason)}</p>`,
    `<p style="margin:0 0 10px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#999999;"><a href="${BRAND_PRIVACY_URL}" style="color:#999999;text-decoration:underline;">${copy.privacyLabel}</a></p>`,
    `<p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#999999;">${copy.copyrightLabel}</p>`,
  ].join('');
}

function buildBrandedEmailShell({ preheader, bodyHtml, footerHtml, brandName = 'Activecenter' }) {
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="x-apple-disable-message-reformatting" />
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title></title>
  <style type="text/css" rel="stylesheet" media="all">
    #outlook a { padding: 0; }
    body { width: 100% !important; height: 100%; margin: 0; -webkit-text-size-adjust: none; -ms-text-size-adjust: 100%; }
    a img { border: none; }
    td { word-break: break-word; }
    body, td, th { font-family: Arial, Helvetica, sans-serif; }
    td, th { font-size: 16px; }
    p, ul, ol { margin: 0 0 18px 0; font-size: 16px; line-height: 1.65; color: #2d2d2d; }
    p:last-child { margin-bottom: 0; }
    a { color: #212529; text-decoration: underline; }
    .email-wrapper    { width: 100%; margin: 0; padding: 0; background-color: #f0f0f0; }
    .email-body_inner { width: 570px; margin: 0 auto; padding: 0; background-color: #ffffff; }
    .content-cell     { padding: 36px 40px; }
    .email-footer     { width: 570px; margin: 0 auto; padding: 0; text-align: center; }
    .email-footer p   { color: #999999; font-size: 12px; line-height: 1.6; }
    .email-footer a   { color: #999999; text-decoration: underline; }
    .email-masthead   { background-color: #212529; padding: 16px 24px; }
    @media only screen and (max-width: 600px) {
      .email-body_inner, .email-footer { width: 100% !important; }
      .content-cell   { padding: 24px 20px !important; }
      .email-masthead { padding: 14px 16px !important; }
      .logo-img       { width: 150px !important; }
    }
    :root { color-scheme: light; }
  </style>
  <!--[if mso]><style type="text/css">body,td,th,p,a,.f-fallback{font-family:Arial,sans-serif !important;}</style><![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#f0f0f0;-webkit-text-size-adjust:none;-ms-text-size-adjust:100%;" bgcolor="#f0f0f0">
<table class="email-wrapper" width="100%" cellpadding="0" cellspacing="0" role="presentation" bgcolor="#f0f0f0">
<tr><td align="center" style="padding:24px 8px;">
<table width="100%" cellpadding="0" cellspacing="0" role="presentation">
  <tr><td>
    <table class="email-body_inner" align="center" width="570" cellpadding="0" cellspacing="0" role="presentation" style="border-radius:4px 4px 0 0;overflow:hidden;">
      <tr><td class="email-masthead" bgcolor="#212529" style="background-color:#212529;padding:16px 24px;border-radius:4px 4px 0 0;">
        <img src="${BRAND_LOGO_URL}" width="180" alt="${escapeHtml(brandName)}" class="logo-img f-fallback" style="display:block;border:0;outline:none;text-decoration:none;height:auto;width:180px;max-width:180px;" />
      </td></tr>
    </table>
  </td></tr>
  <tr><td width="570" cellpadding="0" cellspacing="0">
    <table class="email-body_inner" align="center" width="570" cellpadding="0" cellspacing="0" role="presentation" bgcolor="#ffffff">
      <tr><td class="content-cell f-fallback" style="padding:36px 40px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.65;color:#2d2d2d;">
        <span style="display:none !important;visibility:hidden;mso-hide:all;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${escapeHtml(preheader || '')}</span>
        ${bodyHtml}
      </td></tr>
    </table>
  </td></tr>
  <tr><td>
    <table class="email-footer" align="center" width="570" cellpadding="0" cellspacing="0" role="presentation">
      <tr><td class="content-cell f-fallback" align="center" style="padding:24px 40px 32px 40px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#999999;text-align:center;">
        ${footerHtml}
      </td></tr>
    </table>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

function hasContactData(lead) {
  return Boolean(
    safeString(lead?.email, 180) ||
    safeString(lead?.email_normalized, 180) ||
    safeString(lead?.phone, 80) ||
    safeString(lead?.form_submitted_at, 80) ||
    safeString(lead?.mysql_survey_id, 40)
  );
}

async function loadLeadFull(leadHash) {
  const rows = await supabaseJson(
    `v_lead_state_full?lead_hash=eq.${encodeURIComponent(leadHash)}` +
      '&select=lead_hash,member_id,ref_id,berater_slug,source_app,funnel_key,lang,first_name,email,email_normalized,phone,form_submitted_at,profile_code,profile_label,main_aspiration_label,initial_barrier,lifecycle_stage,mysql_survey_id,completed_rank,video1_max_pct,video2_max_pct,video3_max_pct,video1_completed_at,video2_completed_at,video3_completed_at&limit=1'
  );
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function loadLeadFallbackContext(leadHash) {
  const [trackingRows, quizRows] = await Promise.all([
    supabaseJson(
      `tracking_sessions?lead_hash=eq.${encodeURIComponent(leadHash)}` +
        '&select=quiz_profile,quiz_profile_name,main_aspiration,main_aspiration_label,quiz_barrier,updated_at,last_event_at&order=updated_at.desc&limit=1'
    ),
    supabaseJson(
      `quiz_sessions?hash=eq.${encodeURIComponent(leadHash)}` +
        '&select=quiz_profile,quiz_profile_name,quiz_aspiration,quiz_barrier,updated_at&order=updated_at.desc&limit=1'
    ),
  ]);

  const tracking = Array.isArray(trackingRows) ? trackingRows[0] || {} : {};
  const quiz = Array.isArray(quizRows) ? quizRows[0] || {} : {};
  return { tracking, quiz };
}

function mergeLeadFallbackContext(lead, fallback) {
  const tracking = fallback?.tracking || {};
  const quiz = fallback?.quiz || {};
  return {
    ...lead,
    profile_code: lead.profile_code || quiz.quiz_profile || tracking.quiz_profile || null,
    profile_label: lead.profile_label || quiz.quiz_profile_name || tracking.quiz_profile_name || null,
    main_aspiration: lead.main_aspiration || tracking.main_aspiration || quiz.quiz_aspiration || null,
    main_aspiration_label: lead.main_aspiration_label || tracking.main_aspiration_label || null,
    initial_barrier: lead.initial_barrier || tracking.quiz_barrier || quiz.quiz_barrier || null,
  };
}

async function loadLeadAnswers(leadHash) {
  const rows = await supabaseJson(
    `lead_answers_current?lead_hash=eq.${encodeURIComponent(leadHash)}` +
      '&select=question_ref,question_index,answer_text,answer_value,answered_at&order=question_index.asc'
  );
  return Array.isArray(rows) ? rows : [];
}

async function callN8nUpdateResult(job) {
  if (!N8N_UPDATE_RESULT_URL) {
    throw new Error('n8n_update_result_not_configured');
  }

  const context = job.context_data || {};
  const rank = Math.max(0, Math.min(3, safeInteger(context.rank)));
  const lang = safeString(context.lang, 5) || 'de';
  const leadHash = safeString(job.lead_hash, 96);

  if (!isLeadHash(leadHash)) {
    throw new Error(`invalid_lead_hash:${leadHash}`);
  }

  const lead = await loadLeadFull(leadHash);
  if (safeString(lead?.lifecycle_stage, 80).toLowerCase() === 'merged_duplicate') {
    return {
      success: true,
      updated: false,
      skipped: true,
      reason: 'merged_duplicate_no_mysql_sync',
      lead_hash: leadHash,
    };
  }

  if (!hasContactData(lead)) {
    return {
      success: true,
      updated: false,
      skipped: true,
      reason: 'not_a_contact_lead',
      lead_hash: leadHash,
    };
  }

  const headers = { 'Content-Type': 'application/json' };
  if (N8N_UPDATE_RESULT_SECRET) {
    headers['X-Update-Secret'] = N8N_UPDATE_RESULT_SECRET;
  }

  const response = await fetch(N8N_UPDATE_RESULT_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      hash: leadHash,
      personalityType: rankLabel(rank, lang),
      points_result: rankLabel(rank, lang),
      rank,
      lang,
      source: 'lead_sync_outbox',
      job_id: job.id,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false || Number(data.matchedRows || 0) < 1) {
    throw new Error(
      `n8n_update_failed:${response.status}:${safeString(
        data.error || data.message || JSON.stringify(data),
        500
      )}`
    );
  }

  return data;
}

async function lookupCoach(slug) {
  const normalizedSlug = safeString(slug, 80).toLowerCase() || 'default';
  if (!BRIDGE_KEY) return null;

  const response = await fetch(BRIDGE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Bridge-Key': BRIDGE_KEY,
    },
    body: JSON.stringify({ action: 'lookup_subdomain', subdomain: normalizedSlug }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.found) return null;
  return data;
}

async function sendPostmark(message) {
  if (!POSTMARK_SERVER_TOKEN) {
    throw new Error('postmark_not_configured');
  }

  const response = await fetch('https://api.postmarkapp.com/email', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Postmark-Server-Token': POSTMARK_SERVER_TOKEN,
    },
    body: JSON.stringify(message),
  });
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!response.ok) {
    throw new Error(`postmark_send_failed:${response.status}:${safeString(data.Message || data.ErrorCode || text, 500)}`);
  }
  return data;
}

async function hotLeadAlreadySent(leadHash) {
  const rows = await supabaseJson(
    `lead_events?lead_hash=eq.${encodeURIComponent(leadHash)}` +
      '&event_name=eq.hot_lead_coach_email_sent&select=event_id&limit=1'
  );
  return Array.isArray(rows) && rows.length > 0;
}

function answerSummary(answers) {
  const rows = (answers || [])
    .filter((row) => safeString(row.answer_text || row.answer_value, 500))
    .map((row) => {
      const label = row.question_index ? `Frage ${row.question_index}` : row.question_ref || 'Antwort';
      return `${label}: ${row.answer_text || row.answer_value}`;
    });
  return rows.length ? rows.join('\n') : '-';
}

function buildHotLeadEmail({ lead, coach, answers, job }) {
  const lang = detectCoachLanguage(coach, lead, job);
  const copy = HOT_LEAD_EMAIL_I18N[lang] || HOT_LEAD_EMAIL_I18N.de;
  const firstName = safeString(lead.first_name, 120) || 'Interessent';
  const email = safeString(lead.email || lead.email_normalized, 180) || '-';
  const coachFirstName = safeString(coach?.first_name || coach?.name, 80) || 'Markus';
  const brandName = safeString(
    coach?.organisation_name || coach?.org_name || coach?.company || 'Activecenter',
    120
  );
  const rawProfile = [lead.profile_code, lead.profile_label].filter(Boolean).join(' ');
  const profileCode = normalizeProfileCode(rawProfile);
  const profile = copy.profiles[profileCode] || '-';
  const rawAspiration = lead.main_aspiration || lead.main_aspiration_label || '';
  const aspiration =
    copy.aspirations[normalizeAspirationKey(rawAspiration)] ||
    safeString(lead.main_aspiration_label || lead.main_aspiration, 180) ||
    '-';
  const rawBarrier = lead.initial_barrier || lead.initial_barrier_label || '';
  const barrier =
    copy.barriers[normalizeBarrierKey(rawBarrier)] ||
    safeString(lead.initial_barrier_label || lead.initial_barrier, 180) ||
    '-';
  // D-1: Die Mail-Sprache steht hier schon fest (lang, oben) und wandert jetzt in den Link.
  const insightsUrl = buildCoachInsightsUrl({
    profileCode: lead.profile_code,
    profileLabel: lead.profile_label,
    aspiration: rawAspiration,
    lang,
  });
  const completedAt = formatLocalizedDateTime(
    lead.video3_completed_at || job.context_data?.event_at || new Date().toISOString(),
    lang
  );
  const slug = safeString(lead.berater_slug, 80).toLowerCase();
  const subject = copy.subject(firstName);
  const rows = [
    [copy.labels.name, firstName],
    [copy.labels.email, email],
    [copy.labels.type, profile],
    [copy.labels.aspiration, aspiration],
    [copy.labels.completedAt, completedAt],
  ];
  if (barrier && barrier !== '-') {
    rows.splice(4, 0, [copy.labels.barrier, barrier]);
  }
  const insightsLabel = copy.insightsLinkLabel || 'Erfahre hier mehr zu deinem Kontakt';
  const insightsLinkHtml = `<p style="margin:24px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.65;color:#2d2d2d;"><a href="${escapeHtml(insightsUrl)}" style="color:#212529;text-decoration:underline;font-weight:700;">${escapeHtml(insightsLabel)}</a></p>`;
  const htmlRows = rows
    .map(([label, value]) => `<tr><td style="padding:10px 0;border-bottom:1px solid #e6e6e6;font-weight:700;width:180px;">${escapeHtml(label)}</td><td style="padding:10px 0;border-bottom:1px solid #e6e6e6;">${escapeHtml(value || '-')}</td></tr>`)
    .join('');
  const textRows = rows.map(([label, value]) => `${label}: ${value || '-'}`).join('\n');
  const bodyHtml = [
    `<h1 style="margin:0 0 20px 0;font-family:Arial,Helvetica,sans-serif;font-size:28px;line-height:1.3;color:#212529;">${escapeHtml(copy.title(slug))}</h1>`,
    `<p style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.65;color:#2d2d2d;">${escapeHtml(copy.greeting(coachFirstName))}</p>`,
    `<p style="margin:0 0 24px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.65;color:#2d2d2d;">${escapeHtml(copy.intro)}</p>`,
    '<table style="width:100%;border-collapse:collapse;margin:0 0 8px 0;">',
    htmlRows,
    '</table>',
    insightsLinkHtml,
  ].join('');
  const html = buildBrandedEmailShell({
    preheader: copy.preheader,
    bodyHtml,
    brandName,
    footerHtml: buildDefaultFooter(copy.footerReason, lang),
  });
  const text = [
    copy.title(slug),
    '',
    copy.greeting(coachFirstName),
    '',
    copy.intro,
    '',
    textRows,
    '',
    `${insightsLabel}: ${insightsUrl}`,
    '',
    'Quiz-Antworten:',
    answerSummary(answers),
  ].join('\n');

  return {
    From: POSTMARK_FROM,
    To: coach.email,
    Subject: subject,
    HtmlBody: html,
    TextBody: text,
    MessageStream: POSTMARK_MESSAGE_STREAM,
    Metadata: {
      lead_hash: lead.lead_hash,
      member_id: safeString(lead.member_id, 80),
      event_type: 'hot_lead_all_videos_completed',
    },
  };
}

async function insertHotLeadSentEvent({ lead, coach, postmark, job }) {
  await supabaseRequest('lead_events?on_conflict=event_uid', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Prefer: 'resolution=ignore-duplicates,return=minimal',
    },
    body: JSON.stringify({
      event_uid: `hot_lead_email_${lead.lead_hash}`,
      lead_hash: lead.lead_hash,
      event_name: 'hot_lead_coach_email_sent',
      event_at: new Date().toISOString(),
      member_id: lead.member_id || null,
      ref_id: lead.ref_id || null,
      berater_slug: lead.berater_slug || null,
      source_app: lead.source_app || 'business_leads_quiz',
      funnel_key: lead.funnel_key || 'business',
      payload: {
        outbox_job_id: job.id,
        coach_email: coach.email,
        postmark_message_id:
          postmark.MessageID || postmark.MessageId || postmark.messageId || null,
        completed_rank: lead.completed_rank,
      },
    }),
  });
}

async function sendHotLeadCoachEmail(job) {
  const leadHash = safeString(job.lead_hash, 96);
  if (!isLeadHash(leadHash)) {
    throw new Error(`invalid_lead_hash:${leadHash}`);
  }

  if (!HOT_LEAD_OUTBOX_EMAIL_ENABLED) {
    return {
      success: true,
      skipped: true,
      reason: 'hot_lead_outbox_email_disabled_primary_mail_active',
      lead_hash: leadHash,
    };
  }

  if (await hotLeadAlreadySent(leadHash)) {
    return { success: true, skipped: true, reason: 'already_sent', lead_hash: leadHash };
  }

  let lead = await loadLeadFull(leadHash);
  if (!lead) {
    throw new Error(`lead_not_found:${leadHash}`);
  }
  lead = mergeLeadFallbackContext(lead, await loadLeadFallbackContext(leadHash));
  if (!hasContactData(lead)) {
    return { success: true, skipped: true, reason: 'not_a_contact_lead', lead_hash: leadHash };
  }
  if (safeInteger(lead.completed_rank) < 3) {
    return {
      success: true,
      skipped: true,
      reason: 'rank_below_3',
      lead_hash: leadHash,
      completed_rank: safeInteger(lead.completed_rank),
    };
  }
  if (!normalizeProfileCode([lead.profile_code, lead.profile_label].filter(Boolean).join(' '))) {
    return {
      success: true,
      skipped: true,
      reason: 'not_success_code_quiz_profile',
      lead_hash: leadHash,
    };
  }

  const coach = await lookupCoach(lead.berater_slug);
  if (!coach?.email) {
    throw new Error(`coach_email_missing:${safeString(lead.berater_slug, 80) || lead.member_id || 'unknown'}`);
  }

  const answers = await loadLeadAnswers(leadHash);
  const message = buildHotLeadEmail({ lead, coach, answers, job });
  const postmark = await sendPostmark(message);
  await insertHotLeadSentEvent({ lead, coach, postmark, job });

  return {
    success: true,
    email_sent: true,
    lead_hash: leadHash,
    coach_email: coach.email,
    postmark_message_id: postmark.MessageID || postmark.MessageId || postmark.messageId || null,
  };
}

async function processJob(job, workerId) {
  try {
    if (!SUPPORTED_SYNC_TYPES.has(job.sync_type)) {
      throw new Error(`unsupported_sync_type:${job.sync_type}`);
    }

    const responseData = MYSQL_SYNC_TYPES.has(job.sync_type)
      ? await callN8nUpdateResult(job)
      : await sendHotLeadCoachEmail(job);
    await supabaseRpc('mark_outbox_done', {
      p_job_id: job.id,
      p_worker_id: workerId,
      p_response_data: responseData,
    });
    return { id: job.id, status: 'done' };
  } catch (error) {
    const responseData = {
      error: safeString(error.message, 1000),
      sync_type: job.sync_type,
    };
    await supabaseRpc('mark_outbox_failed', {
      p_job_id: job.id,
      p_worker_id: workerId,
      p_error: error.message || 'unknown_outbox_error',
      p_response_data: responseData,
    });
    return { id: job.id, status: 'failed', error: responseData.error };
  }
}

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) return;

  if (req.method !== 'POST') {
    return sendJson(res, 405, { success: false, error: 'method_not_allowed' });
  }

  try {
    authorize(req);

    const flags = await getLeadFlags();
    if (!flags.outbox_worker_enabled) {
      return sendJson(res, 202, { success: true, enabled: false, processed: 0 });
    }

    const batchSize = Math.max(1, Math.min(25, safeInteger(req.body?.batch_size, 10)));
    const workerId = safeString(req.body?.worker_id, 120) || `vercel_${Date.now()}`;
    const jobs = await supabaseRpc('claim_outbox_jobs', {
      worker_id: workerId,
      batch_size: batchSize,
    });

    const claimedJobs = Array.isArray(jobs) ? jobs : [];
    const results = [];
    for (const job of claimedJobs) {
      results.push(await processJob(job, workerId));
    }

    return sendJson(res, 200, {
      success: true,
      enabled: true,
      claimed: claimedJobs.length,
      processed: results.length,
      results,
    });
  } catch (error) {
    return sendJson(res, error.status || 500, {
      success: false,
      error: 'lead_outbox_worker_failed',
      message: error.message,
    });
  }
};
