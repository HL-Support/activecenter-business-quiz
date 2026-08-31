function safeJsonParse(value, fallback = {}) {
  if (value == null || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function slugify(value, fallback = 'unknown') {
  const normalized = String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || fallback;
}

function firstNonEmpty(values, fallback = null) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return value;
    }
  }
  return fallback;
}

function normalizePersonName(value) {
  const normalized = String(value || '').trim().replace(/\s+/g, ' ');
  if (!normalized) return '';

  return normalized
    .split(/([\s'-]+)/)
    .map((part) => {
      if (!part || /^[\s'-]+$/.test(part)) return part;
      const lower = part.toLocaleLowerCase('de-DE');
      const chars = Array.from(lower);
      return chars[0].toLocaleUpperCase('de-DE') + chars.slice(1).join('');
    })
    .join('');
}

function normalizeLanguage(...values) {
  const raw = firstNonEmpty(values, 'de');
  const lang = String(raw || 'de').toLowerCase().slice(0, 2);
  return ['de', 'it', 'en', 'fr', 'ru', 'hu'].includes(lang) ? lang : 'de';
}

function formatPhone(prefix, number) {
  const cleanPrefix = String(prefix || '').replace(/[^\d+]/g, '');
  const cleanNumber = String(number || '').replace(/[^\d]/g, '');
  if (!cleanPrefix && !cleanNumber) return '';
  if (!cleanPrefix) return cleanNumber;
  if (!cleanNumber) return cleanPrefix.startsWith('+') ? cleanPrefix : `+${cleanPrefix}`;

  const intlPrefix = cleanPrefix.startsWith('+') ? cleanPrefix : `+${cleanPrefix}`;
  const firstChunk = cleanNumber.slice(0, 3);
  const rest = cleanNumber.slice(3);
  return rest ? `${intlPrefix} ${firstChunk} ${rest}` : `${intlPrefix} ${firstChunk}`;
}

function extractVariables(formResponse) {
  const variables = Array.isArray(formResponse?.form_response?.variables)
    ? formResponse.form_response.variables
    : Array.isArray(formResponse?.variables)
      ? formResponse.variables
      : [];

  const map = {};
  for (const entry of variables) {
    if (!entry || !entry.key) continue;
    map[entry.key] = firstNonEmpty([entry.text, entry.value, entry.number], null);
  }
  return map;
}

function extractHidden(formResponse) {
  const hidden = formResponse?.form_response?.hidden || formResponse?.hidden || {};
  return typeof hidden === 'object' && hidden ? hidden : {};
}

function extractAnswers(formResponse) {
  const answers = Array.isArray(formResponse?.form_response?.answers)
    ? formResponse.form_response.answers
    : Array.isArray(formResponse?.answers)
      ? formResponse.answers
      : [];

  return answers.map((answer, index) => {
    const field = answer?.field || {};
    const textValue = firstNonEmpty([
      answer?.text,
      answer?.email,
      answer?.phone_number,
      answer?.choice?.label,
      answer?.choices?.labels?.join(', '),
      answer?.boolean,
      answer?.number
    ], '');

    return {
      index: index + 1,
      field_id: field.id || null,
      field_ref: field.ref || null,
      field_type: field.type || null,
      question: field.title || field.ref || `Frage ${index + 1}`,
      answer: textValue == null ? '' : String(textValue)
    };
  });
}

const PROFILE_ALIAS_MAP = {
  feuer: { slug: 'feuer', label: 'Der Macher' },
  r: { slug: 'feuer', label: 'Der Macher' },
  'typ-a': { slug: 'feuer', label: 'Der Macher' },
  'type-a': { slug: 'feuer', label: 'Der Macher' },
  'tipo-a': { slug: 'feuer', label: 'Der Macher' },
  'der-macher': { slug: 'feuer', label: 'Der Macher' },
  macher: { slug: 'feuer', label: 'Der Macher' },
  cselekvo: { slug: 'feuer', label: 'A Cselekv?' },
  'a-cselekvo': { slug: 'feuer', label: 'A Cselekv?' },
  'a-cselekvo-a-tipus': { slug: 'feuer', label: 'A Cselekv?' },
  'il-realizzatore': { slug: 'feuer', label: 'Il realizzatore' },
  'the-doer': { slug: 'feuer', label: 'The doer' },
  'le-moteur': { slug: 'feuer', label: 'Le moteur' },
  fire: { slug: 'feuer', label: 'Fire' },
  fuoco: { slug: 'feuer', label: 'Fuoco' },
  feu: { slug: 'feuer', label: 'Feu' },
  wind: { slug: 'wind', label: 'Der Netzwerker' },
  y: { slug: 'wind', label: 'Der Netzwerker' },
  'typ-b': { slug: 'wind', label: 'Der Netzwerker' },
  'type-b': { slug: 'wind', label: 'Der Netzwerker' },
  'tipo-b': { slug: 'wind', label: 'Il connettore' },
  'der-netzwerker': { slug: 'wind', label: 'Der Netzwerker' },
  netzwerker: { slug: 'wind', label: 'Der Netzwerker' },
  'il-connettore': { slug: 'wind', label: 'Il connettore' },
  'the-connector': { slug: 'wind', label: 'The connector' },
  'le-connecteur': { slug: 'wind', label: 'Le connecteur' },
  connector: { slug: 'wind', label: 'The connector' },
  connettore: { slug: 'wind', label: 'Il connettore' },
  connecteur: { slug: 'wind', label: 'Le connecteur' },
  kapcsolatteremto: { slug: 'wind', label: 'A Kapcsolatteremt?' },
  'a-kapcsolatteremto': { slug: 'wind', label: 'A Kapcsolatteremt?' },
  'a-kapcsolatteremto-b-tipus': { slug: 'wind', label: 'A Kapcsolatteremt?' },
  vento: { slug: 'wind', label: 'Vento' },
  vent: { slug: 'wind', label: 'Vent' },
  wasser: { slug: 'wasser', label: 'Der Anker' },
  g: { slug: 'wasser', label: 'Der Anker' },
  'typ-c': { slug: 'wasser', label: 'Der Anker' },
  'type-c': { slug: 'wasser', label: 'Der Anker' },
  'tipo-c': { slug: 'wasser', label: "L'ancora" },
  'der-anker': { slug: 'wasser', label: 'Der Anker' },
  anker: { slug: 'wasser', label: 'Der Anker' },
  'l-ancora': { slug: 'wasser', label: "L'ancora" },
  'the-anchor': { slug: 'wasser', label: 'The anchor' },
  'l-ancrage': { slug: 'wasser', label: "L'ancrage" },
  anchor: { slug: 'wasser', label: 'The anchor' },
  ancora: { slug: 'wasser', label: "L'ancora" },
  tamasz: { slug: 'wasser', label: 'A T?masz' },
  'a-tamasz': { slug: 'wasser', label: 'A T?masz' },
  'a-tamasz-c-tipus': { slug: 'wasser', label: 'A T?masz' },
  acqua: { slug: 'wasser', label: 'Acqua' },
  water: { slug: 'wasser', label: 'Water' },
  eau: { slug: 'wasser', label: 'Eau' },
  fels: { slug: 'fels', label: 'Der Architekt' },
  b: { slug: 'fels', label: 'Der Architekt' },
  'typ-d': { slug: 'fels', label: 'Der Architekt' },
  'type-d': { slug: 'fels', label: 'Der Architekt' },
  'tipo-d': { slug: 'fels', label: "L'architetto" },
  'der-architekt': { slug: 'fels', label: 'Der Architekt' },
  architekt: { slug: 'fels', label: 'Der Architekt' },
  'l-architetto': { slug: 'fels', label: "L'architetto" },
  'the-architect': { slug: 'fels', label: 'The architect' },
  'l-architecte': { slug: 'fels', label: "L'architecte" },
  architect: { slug: 'fels', label: 'The architect' },
  architecte: { slug: 'fels', label: "L'architecte" },
  epito: { slug: 'fels', label: 'Az ?p?t?' },
  'az-epito': { slug: 'fels', label: 'Az ?p?t?' },
  'az-epito-d-tipus': { slug: 'fels', label: 'Az ?p?t?' },
  roccia: { slug: 'fels', label: 'Roccia' },
  stone: { slug: 'fels', label: 'Stone' },
  pierre: { slug: 'fels', label: 'Pierre' },
};

function normalizeProfile(rawSlugOrLabel, rawLabel) {
  const candidates = [rawSlugOrLabel, rawLabel].filter(Boolean);
  for (const candidate of candidates) {
    const raw = String(candidate || '').trim();
    const key = slugify(candidate, '');
    const typeLetterAliases = {
      a: PROFILE_ALIAS_MAP['typ-a'],
      b: PROFILE_ALIAS_MAP['typ-b'],
      c: PROFILE_ALIAS_MAP['typ-c'],
      d: PROFILE_ALIAS_MAP['typ-d'],
    };
    if (raw.length > 1 && typeLetterAliases[key]) {
      const mapped = typeLetterAliases[key];
      return {
        ...mapped,
        label: firstNonEmpty([rawLabel, mapped.label], mapped.label),
      };
    }
    if (key && PROFILE_ALIAS_MAP[key]) {
      const mapped = PROFILE_ALIAS_MAP[key];
      return {
        ...mapped,
        label: firstNonEmpty([rawLabel, mapped.label], mapped.label),
      };
    }
  }

  const fallbackLabel = firstNonEmpty(candidates, 'Unbekannt');
  return {
    slug: '',
    label: fallbackLabel,
  };
}

function buildCoachInsightsUrl(profileSlug, aspirationSlug) {
  const baseUrl = 'https://business.activecenter.info/berater-info';
  const params = [];
  if (profileSlug) params.push(`type=${encodeURIComponent(profileSlug)}`);
  if (aspirationSlug) params.push(`goal=${encodeURIComponent(aspirationSlug)}`);
  const query = params.join('&');
  return query ? `${baseUrl}?${query}` : baseUrl;
}

function extractProfileData(formResponse, pointsResult, language = 'de', options = {}) {
  const hidden = extractHidden(formResponse);
  const vars = extractVariables(formResponse);
  const answers = extractAnswers(formResponse);
  const points = safeJsonParse(pointsResult, {});
  const allowSuccessCodeFields = options.allowSuccessCodeFields !== false;

  if (!allowSuccessCodeFields) {
    return {
      profile_slug: '',
      profile_label: '',
      profile_summary: '',
      main_aspiration_slug: '',
      main_aspiration_label: '',
      barrier_slug: '',
      barrier_label: '',
    };
  }

  const answerProfileLabel = findAnswerValue(answers, ['lead_profile_result'], '');
  const answerAspirationLabel = findAnswerValue(answers, ['lead_main_aspiration'], '');

  const rawProfileLabel = firstNonEmpty([
    vars.profile_label,
    vars.lead_profile_label,
    answerProfileLabel,
    hidden.profile_label,
    points.profile_label,
    points.personality_label,
    points.personality_type
  ], 'Unbekannt');

  const rawProfileSlug = firstNonEmpty([
    vars.profile_slug,
    vars.lead_profile_result,
    answerProfileLabel,
    hidden.profile_slug,
    points.profile_slug,
    points.personality_type,
    rawProfileLabel
  ], 'unknown');

  const normalizedProfile = normalizeProfile(rawProfileSlug, rawProfileLabel);

  const profileSummary = firstNonEmpty([
    vars.profile_summary,
    hidden.profile_summary,
    points.profile_summary,
    ''
  ], '');

  const mainAspirationLabel = firstNonEmpty([
    vars.main_aspiration_label,
    vars.lead_main_aspiration,
    answerAspirationLabel,
    hidden.main_aspiration_label,
    points.main_aspiration_label,
    points.main_aspiration
  ], 'Unbekannt');

  const mainAspirationKey = firstNonEmpty([
    normalizeAspirationKey(vars.main_aspiration),
    normalizeAspirationKey(hidden.main_aspiration),
    normalizeAspirationKey(points.main_aspiration),
    normalizeAspirationKey(vars.main_aspiration_slug),
    normalizeAspirationKey(hidden.main_aspiration_slug),
    normalizeAspirationKey(points.main_aspiration_slug),
    normalizeAspirationKey(mainAspirationLabel)
  ], '');

  const mainAspirationSlug = mainAspirationKey || slugify(firstNonEmpty([
    vars.main_aspiration_slug,
    hidden.main_aspiration_slug,
    points.main_aspiration_slug,
    mainAspirationLabel
  ], 'unknown'));

  const repairedMainAspirationLabel = repairDamagedAspirationLabel(
    mainAspirationLabel,
    language,
    mainAspirationKey
  );

  return {
    profile_slug: normalizedProfile.slug,
    profile_label: normalizedProfile.label,
    profile_summary: profileSummary,
    main_aspiration_slug: mainAspirationSlug,
    main_aspiration_label: repairedMainAspirationLabel
  };
}

function buildVideoAccessUrl(baseUrl, leadHash, memberId) {
  if (!leadHash) return '';
  const trimmedBase = String(baseUrl || 'https://business.activecenter.info').replace(/\/+$/, '');
  if (memberId) return `${trimmedBase}/${memberId}/access/${encodeURIComponent(leadHash)}`;
  return `${trimmedBase}/access/${encodeURIComponent(leadHash)}`;
}

function buildResumeUrl(baseUrl, token) {
  if (!token) return '';
  const trimmedBase = String(baseUrl || 'https://business.activecenter.info').replace(/\/+$/, '');
  return `${trimmedBase}?resume=${encodeURIComponent(token)}`;
}

function buildCoachQuizUrl(baseUrl, coachHandle) {
  const trimmedBase = String(baseUrl || 'https://business.activecenter.info').replace(/\/+$/, '');
  const cleanHandle = String(coachHandle || '').trim().replace(/^\/+|\/+$/g, '');
  return cleanHandle ? `${trimmedBase}/${encodeURIComponent(cleanHandle)}` : trimmedBase;
}

function detectFunnelKey(formResponse, row = {}) {
  const hidden = extractHidden(formResponse);
  const vars = extractVariables(formResponse);
  const definitionTitle = String(
    formResponse?.form_response?.definition?.title ||
      formResponse?.definition?.title ||
      row.form_title ||
      ''
  ).toLowerCase();
  const candidates = [
    hidden.funnel_key,
    hidden.funnel,
    vars.funnel_key,
    vars.funnel,
    row.funnel_key,
    row.funnel,
    row.queued_funnel,
  ].filter(Boolean);

  if (
    candidates.some((value) => String(value).toLowerCase() === 'landing_page_business') ||
    definitionTitle.includes('landing page business')
  ) {
    return 'landing_page_business';
  }

  return 'business_leads_quiz';
}

function isBusinessLeadsQuizFunnel(funnelKey) {
  return String(funnelKey || '') === 'business_leads_quiz';
}

function getOrganisationName(model) {
  const orgName = String(model?.coach_organisation_name || model?.organisation_name || '').trim();
  return orgName || 'Activecenter';
}

function toDisplayNamePart(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function buildCoachDisplayName(model) {
  const coachName = [
    toDisplayNamePart(model?.coach_first_name),
    toDisplayNamePart(model?.coach_last_name || model?.coach_full_name)
  ].filter(Boolean).join(' ').trim();
  const organisation = toDisplayNamePart(getOrganisationName(model));
  return [coachName, organisation].filter(Boolean).join(' - ');
}

const BRAND_LOGO_URL = 'https://hl-support.biz/storage/images/cwemaillogo-1bcb4f.png';
const BRAND_PRIVACY_URL = 'https://impressum.hl-support.biz/privacy.html';

function findAnswerValue(answers, refs, fallback = '') {
  const wanted = new Set(refs);
  const match = (answers || []).find((entry) => wanted.has(entry.field_ref) && entry.answer);
  return match ? match.answer : fallback;
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

function buildDefaultFooter(reason, language = 'de') {
  const lang = normalizeLanguage(language);
  const privacyLabels = {
    de: 'Impressum &amp; Datenschutz',
    it: 'Note legali &amp; privacy',
    en: 'Legal notice &amp; privacy',
    fr: 'Mentions l\u00e9gales &amp; confidentialit\u00e9',
    ru: '\u041f\u0440\u0430\u0432\u043e\u0432\u0430\u044f \u0438\u043d\u0444\u043e\u0440\u043c\u0430\u0446\u0438\u044f \u0438 \u043a\u043e\u043d\u0444\u0438\u0434\u0435\u043d\u0446\u0438\u0430\u043b\u044c\u043d\u043e\u0441\u0442\u044c',
    hu: 'Impresszum ?s adatv?delem',
  };
  const copyrightLabels = {
    de: '&copy; HL-Support Ltd. &middot; Alle Rechte vorbehalten',
    it: '&copy; HL-Support Ltd. &middot; Tutti i diritti riservati',
    en: '&copy; HL-Support Ltd. &middot; All rights reserved',
    fr: '&copy; HL-Support Ltd. &middot; Tous droits r\u00e9serv\u00e9s',
    ru: '&copy; HL-Support Ltd. &middot; \u0412\u0441\u0435 \u043f\u0440\u0430\u0432\u0430 \u0437\u0430\u0449\u0438\u0449\u0435\u043d\u044b',
    hu: '&copy; HL-Support Ltd. &middot; Minden jog fenntartva',
  };
  return [
    `<p style="margin:0 0 8px 0;font-size:12px;color:#999999;">${reason || ''}</p>`,
    `<p style="margin:0 0 8px 0;font-size:12px;color:#999999;"><a href="${BRAND_PRIVACY_URL}" style="color:#999999;text-decoration:underline;">${privacyLabels[lang]}</a></p>`,
    `<p style="margin:0;font-size:12px;color:#999999;">${copyrightLabels[lang]}</p>`,
  ].filter(Boolean).join('');
}

const PROFILE_EMAIL_PRESENTATIONS = {
  feuer: {
    code: 'Typ A',
    icon: 'A',
    iconUrl: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f525.png',
    element: 'Feuer',
    tagline: 'Du bist geboren, um zu f\u00fchren und nicht um zu folgen.',
    accent: '#D45B40',
    buttonText: '#FFFFFF'
  },
  wind: {
    code: 'Typ B',
    icon: 'B',
    iconUrl: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f4a8.png',
    element: 'Wind',
    tagline: 'Deine Energie ist ansteckend und genau das ist dein unfairer Vorteil.',
    accent: '#C9A84C',
    buttonText: '#1A1A1A'
  },
  wasser: {
    code: 'Typ C',
    icon: 'C',
    iconUrl: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f30a.png',
    element: 'Wasser',
    tagline: 'Du bist der Fels, auf den andere bauen und das ist seltener, als du denkst.',
    accent: '#2E9F6B',
    buttonText: '#FFFFFF'
  },
  fels: {
    code: 'Typ D',
    icon: 'D',
    iconUrl: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1faa8.png',
    element: 'Fels',
    tagline: 'Du siehst Muster, die andere v\u00f6llig \u00fcbersehen.',
    accent: '#4F8ECB',
    buttonText: '#FFFFFF'
  }
};

function getLeadEmailPresentation(model) {
  const fallback = {
    code: 'Dein Typ',
    icon: '*',
    iconUrl: '',
    element: 'Erfolgscode',
    tagline: 'Hier siehst du deinen pers\u00f6nlichen Erfolgs-Code auf einen Blick.',
    accent: '#C9A84C',
    buttonText: '#1A1A1A'
  };
  const presentation = PROFILE_EMAIL_PRESENTATIONS[model.profile_slug] || fallback;
  return {
    ...presentation,
    tagline: firstNonEmpty([model.profile_summary, presentation.tagline], presentation.tagline)
  };
}

function normalizePhoneDigits(value) {
  return String(value || '').replace(/[^\d]/g, '');
}


const LEAD_BARRIER_SLUG_MAP = {
  vehicle: 'vehicle',
  fahrzeug: 'vehicle',
  modell: 'vehicle',
  'business-modell': 'vehicle',
  system: 'vehicle',
  veicolo: 'vehicle',
  vehiculo: 'vehicle',
  community: 'community',
  gemeinschaft: 'community',
  netzwerk: 'community',
  umfeld: 'community',
  'fehlendes-umfeld': 'community',
  comunita: 'community',
  'manca-l-ambiente': 'community',
  comunidad: 'community',
  confidence: 'confidence',
  vertrauen: 'confidence',
  selbstvertrauen: 'confidence',
  sicherheit: 'confidence',
  'fehlende-sicherheit': 'confidence',
  zweifel: 'confidence',
  fiducia: 'confidence',
  sicurezza: 'confidence',
  'manca-sicurezza': 'confidence',
  confianza: 'confidence',
  opportunity: 'opportunity',
  moglichkeit: 'opportunity',
  moeglichkeit: 'opportunity',
  'fehlende-moglichkeit': 'opportunity',
  'fehlende-moeglichkeit': 'opportunity',
  gelegenheit: 'opportunity',
  chance: 'opportunity',
  opportunita: 'opportunity',
  oportunidad: 'opportunity',
};

function normalizeBarrierSlug(rawValue) {
  if (!rawValue) return '';
  const key = slugify(rawValue, '');
  if (LEAD_BARRIER_SLUG_MAP[key]) return LEAD_BARRIER_SLUG_MAP[key];
  const lower = String(rawValue).toLowerCase();
  if (lower.includes('vehicle') || lower.includes('fahrzeug') || lower.includes('modell') || lower.includes('system') || lower.includes('veicolo')) return 'vehicle';
  if (lower.includes('community') || lower.includes('gemeinschaft') || lower.includes('netzwerk') || lower.includes('comunita') || lower.includes('k?rnyezet') || lower.includes('kornyezet')) return 'community';
  if (lower.includes('confidence') || lower.includes('vertrauen') || lower.includes('selbst') || lower.includes('zweifel') || lower.includes('fiducia')) return 'confidence';
  if (lower.includes('opportunity') || lower.includes('gelegenheit') || lower.includes('chance') || lower.includes('opportunita') || lower.includes('lehet?s?g') || lower.includes('lehetoseg')) return 'opportunity';
  return '';
}

const LEAD_EMAIL_ASPIRATION_KEYS = {
  freiheit: 'freedom',
  freedom: 'freedom',
  liberta: 'freedom',
  liberte: 'freedom',
  \u0441\u0432\u043e\u0431\u043e\u0434\u0430: 'freedom',
  wirkung: 'impact',
  impact: 'impact',
  impatto: 'impact',
  impacte: 'impact',
  influence: 'impact',
  \u0432\u043b\u0438\u044f\u043d\u0438\u0435: 'impact',
  sicherheit: 'security',
  security: 'security',
  sicurezza: 'security',
  securite: 'security',
  stabilit\u00e9: 'security',
  stabilnost: 'security',
  \u0441\u0442\u0430\u0431\u0438\u043b\u044c\u043d\u043e\u0441\u0442\u044c: 'security',
  wachstum: 'growth',
  growth: 'growth',
  crescita: 'growth',
  croissance: 'growth',
  rost: 'growth',
  \u0440\u043e\u0441\u0442: 'growth',
};

function normalizeAspirationKey(rawValue) {
  const key = slugify(rawValue, '');
  return key && LEAD_EMAIL_ASPIRATION_KEYS[key] ? LEAD_EMAIL_ASPIRATION_KEYS[key] : '';
}

function localizedAspirationFromKey(language, key) {
  const copy = getLeadEmailCopy(language);
  return key && copy.aspirations[key] ? copy.aspirations[key] : '';
}

function repairDamagedAspirationLabel(label, language, key) {
  const value = String(label || '').trim();
  const localized = localizedAspirationFromKey(language, key);
  if (!value) return localized || value;
  if (localized && (value.includes('?') || value.includes('\uFFFD'))) return localized;
  return value;
}

const LEAD_EMAIL_I18N = {
  de: {
    subject: 'Dein Erfolgs-Code und dein Zugang',
    preheader: 'Dein Erfolgs-Code ist da und dein pers\u00f6nlicher Zugang zur\u00fcck zu deinen Videos wartet auf dich.',
    greeting: 'Hi',
    intro: 'dein Erfolgs-Code ist da und dein pers\u00f6nlicher Zugang ist bereit.',
    resultLabel: 'Dein Erfolgs-Code',
    elementLabel: 'Element',
    resumeIntro: 'Mit diesem Link steigst du direkt wieder dort ein, wo du zuletzt aufgeh\u00f6rt hast.',
    ctaLabel: 'Ja, ich will mehr erfahren',
    contactPrompt: 'Wenn du deinen n\u00e4chsten Schritt pers\u00f6nlich besprechen willst, kontaktiere {coach} direkt \u00fcber WhatsApp.',
    whatsappLabel: 'WhatsApp',
    coachHeading: 'Dein Ansprechpartner',
    phoneLabel: 'Telefon / WhatsApp',
    emailLabel: 'E-Mail',
    footerReason: (coachHandle = '') => buildLeadFooterReason(
      coachHandle,
      'Du erh\u00e4ltst diese E-Mail, weil du auf',
      'deine E-Mail-Adresse eingetragen hast.'
    ),
    privacyLabel: 'Impressum & Datenschutz',
    copyrightLabel: '\u00a9 HL-Support Ltd. \u00b7 Alle Rechte vorbehalten',
    defaultGoalLabel: 'Zielsetzung',
    defaultProfileLabel: 'Dein Profil',
    profiles: {
      feuer: {
        code: 'Typ A',
        label: 'Der Macher',
        element: 'Feuer',
        tagline: 'Du bist geboren, um zu f\u00fchren und nicht um zu folgen.',
        shadow: 'Manchmal wirkt deine Energie auf andere ungeduldig, aber das ist nur Antrieb, der ein Ventil sucht.',
        strengths: [
          'Schnelle, klare Entscheidungskraft',
          'Konsequenter Weg von der Idee zur Umsetzung',
          'Nat\u00fcrliche F\u00fchrungsst\u00e4rke',
          'Selbstgetrieben und unabh\u00e4ngig',
        ],
        fit: {
          freedom: 'Du brauchst kein 9-to-5. Du brauchst ein System, das so schnell skaliert wie du denkst. Kein Chef. Kein Deckel. Deine Regeln.',
          impact: 'Wenn du Wirkung willst, brauchst du ein Modell, in dem deine Energie andere wirklich bewegt und nicht in endlosen Meetings verpufft.',
          security: 'Auch wenn du stark nach vorne gehst, willst du ein Fundament, das tr\u00e4gt. Ein starkes System gibt dir genau diese Basis.',
          growth: 'Du entwickelst dich am st\u00e4rksten dort, wo du Verantwortung \u00fcbernehmen, f\u00fchren und Ergebnisse sehen kannst.',
        },
        cta: {
          freedom: 'Du wei\u00dft bereits, was du willst. Die Frage ist nur noch: Hast du das richtige Vehikel daf\u00fcr?',
          impact: 'Deine Energie kann Menschen mitziehen. Entscheidend ist nur, ob du sie im richtigen Umfeld einsetzt.',
          security: 'Du musst dich nicht klein machen, um Sicherheit zu bekommen. Du brauchst nur das richtige Modell.',
          growth: 'Du brauchst keine Motivation von au\u00dfen. Du brauchst ein Spielfeld, das gro\u00df genug f\u00fcr dich ist.',
        },
      },
      wind: {
        code: 'Typ B',
        label: 'Der Netzwerker',
        element: 'Wind',
        tagline: 'Deine Energie ist ansteckend und genau das ist dein unfairer Vorteil.',
        shadow: 'Manchmal springst du von Idee zu Idee, aber das ist kein Fehler. Du brauchst nur den richtigen Rahmen.',
        strengths: [
          'Ansteckende Begeisterungsf\u00e4higkeit',
          'Vertrauen in kurzer Zeit aufbauen',
          'Verbindender Kitt in jedem Team',
          'Positive, mitrei\u00dfende Ausstrahlung',
        ],
        fit: {
          freedom: 'Du musst nicht in starren Strukturen festh\u00e4ngen. Du brauchst ein Umfeld, in dem du mit Menschen und Energie wachsen kannst.',
          impact: 'Wenn du Wirkung willst, bist du am st\u00e4rksten dort, wo echte Beziehungen wichtiger sind als starre Prozesse.',
          security: 'Sicherheit entsteht f\u00fcr dich nicht nur durch Geld, sondern durch ein Umfeld, das tr\u00e4gt und Menschen, die mit dir gehen.',
          growth: 'Du w\u00e4chst dort am st\u00e4rksten, wo du neue Menschen, neue R\u00e4ume und neue M\u00f6glichkeiten erlebst.',
        },
        cta: {
          freedom: 'Du musst nicht verkaufen. Du musst einfach du sein. Ein Business auf echten Verbindungen ist deine nat\u00fcrliche Heimat.',
          impact: 'Die st\u00e4rksten Teams entstehen nicht durch perfekte Strategie, sondern durch Menschen wie dich.',
          security: 'Wenn das Umfeld stimmt, ziehst du mit Leichtigkeit Menschen und M\u00f6glichkeiten an.',
          growth: 'Dein gr\u00f6\u00dftes Potenzial entfaltet sich dort, wo Begeisterung auf ein klares System trifft.',
        },
      },
      wasser: {
        code: 'Typ C',
        label: 'Der Anker',
        element: 'Wasser',
        tagline: 'Du bist der Fels, auf den andere bauen und das ist seltener, als du denkst.',
        shadow: 'Du neigst dazu, deine eigenen Bed\u00fcrfnisse zur\u00fcckzustellen, aber dein Wohlbefinden ist die Grundlage f\u00fcr alles andere.',
        strengths: [
          'Absolut verl\u00e4sslich und wortgetreu',
          'Tiefes und dauerhaftes Vertrauen',
          'Ruhepol in schwierigen Situationen',
          'Ausgeglichen und konfliktfrei',
        ],
        fit: {
          freedom: 'Du brauchst kein Rampenlicht. Du brauchst Stabilit\u00e4t plus echte Freiheit, ohne Chaos in dein Leben zu bringen.',
          impact: 'Du ver\u00e4nderst Menschen nicht durch Lautst\u00e4rke, sondern durch Konstanz, Vertrauen und echte Pr\u00e4senz.',
          security: 'Ein stabiles, tragf\u00e4higes Modell ist f\u00fcr dich wichtiger als Hype. Genau dort entfaltet sich deine St\u00e4rke.',
          growth: 'Du w\u00e4chst nicht \u00fcber Druck, sondern \u00fcber Sicherheit, Klarheit und ein Umfeld, das dir vertraut.',
        },
        cta: {
          freedom: 'Du brauchst keine Show. Du brauchst ein Modell, das zu deinem Leben passt und dir dabei Luft l\u00e4sst.',
          impact: 'Teams, die wirklich lange durchhalten, werden von Menschen wie dir gepr\u00e4gt und zusammengehalten.',
          security: 'Deine St\u00e4rke liegt darin, Vertrauen aufzubauen, das auch morgen noch tr\u00e4gt.',
          growth: 'Wenn du das richtige Umfeld hast, entwickelst du eine Tiefe, die andere selten erreichen.',
        },
      },
      fels: {
        code: 'Typ D',
        label: 'Der Architekt',
        element: 'Fels',
        tagline: 'Du siehst Muster, die andere v\u00f6llig \u00fcbersehen.',
        shadow: 'Manchmal analysierst du zu lange, aber Pr\u00e4zision ist deine Superkraft und kein Hindernis.',
        strengths: [
          'Fundierte und durchdachte Entscheidungen',
          'Systemischer Blick mit Weitblick',
          'Konsequente Optimierung mit Pr\u00e4zision',
          'Intrinsisch motiviert und unabh\u00e4ngig',
        ],
        fit: {
          freedom: 'Du brauchst kein Chaos und keine leeren Versprechen. Du brauchst ein System, das du verstehst und langfristig optimieren kannst.',
          impact: 'Deine Wirkung entsteht dort, wo andere nur Oberfl\u00e4che sehen und du echte Struktur hineinbringst.',
          security: 'Sicherheit entsteht f\u00fcr dich \u00fcber Klarheit, Logik und ein Modell, das nachvollziehbar funktioniert.',
          growth: 'Du w\u00e4chst am st\u00e4rksten, wenn du ein System durchdringen, verbessern und meistern kannst.',
        },
        cta: {
          freedom: 'Du brauchst keine Hektik. Du brauchst ein Vehikel, das Substanz hat und deiner Denkweise standh\u00e4lt.',
          impact: 'Die besten Strukturen in einem Business werden von Menschen wie dir erschaffen und perfektioniert.',
          security: 'Wenn du etwas verstehst, kannst du es mit Ruhe und Pr\u00e4zision gro\u00df machen.',
          growth: 'Deine St\u00e4rke liegt darin, aus M\u00f6glichkeiten echte Systeme zu machen.',
        },
      },
    },
    snapshotHeading: 'Deine Auswertung auf einen Blick',
    snapshotTypeLabel: 'Dein Erfolgstyp',
    snapshotEnergyLabel: 'Deine st\u00e4rkste Energie',
    snapshotBlockerLabel: 'Dein innerer Blocker',
    snapshotAccessLabel: 'Dein n\u00e4chster Zugang',
    snapshotAccessText: '3 kurze Videos, passend zu deinem Typ',
    snapshotBlockerFallback: 'dein n\u00e4chster klarer Schritt',
    strengthsHeading: 'Deine gr\u00f6\u00dften St\u00e4rken',
    shadowHeading: 'Dein blinder Fleck',
    videoAccessNote: 'Dein Zugang ist freigeschaltet. Im n\u00e4chsten Schritt zeigen wir dir, welches System zu deinem Typ und deinem Ziel passt.',
    barrierIntro: 'Du hast selbst gesagt: Dir fehlt - "',
    barrierOutro: '". Genau daf\u00fcr haben wir etwas.',
    energyLabels: {
      freedom: 'Freiheit durch Selbstbestimmung',
      impact: 'Wirkung durch echte Beziehungen',
      security: 'Sicherheit durch klare Schritte',
      growth: 'Wachstum durch ein lernbares System',
    },
    barrierLabels: {
      vehicle: 'ein funktionierendes System',
      community: 'das richtige Umfeld',
      confidence: 'einen sicheren ersten Schritt',
      opportunity: 'die passende M\u00f6glichkeit',
    },
    aspirations: {
      freedom: 'Freiheit',
      impact: 'Wirkung',
      security: 'Sicherheit',
      growth: 'Wachstum',
    },
    whatsappPrefill: 'Hallo {coach}! Ich habe gerade mein Erfolgscode-Quiz gemacht und m\u00f6chte mehr erfahren.',
  },
  it: {
    subject: 'Il tuo codice del successo e il tuo accesso',
    preheader: 'Il tuo codice del successo \u00e8 pronto e il tuo accesso personale ai video ti aspetta.',
    greeting: 'Ciao',
    intro: 'il tuo codice del successo \u00e8 pronto e il tuo accesso personale ti aspetta.',
    resultLabel: 'Il tuo codice del successo',
    elementLabel: 'Elemento',
    resumeIntro: 'Con questo link puoi riprendere esattamente dal punto in cui avevi interrotto i video.',
    ctaLabel: 'Riprendi i video',
    contactPrompt: 'Se vuoi parlare del tuo prossimo passo in modo personale, contatta {coach} direttamente su WhatsApp.',
    whatsappLabel: 'WhatsApp',
    coachHeading: 'Il tuo coach di riferimento',
    phoneLabel: 'Telefono / WhatsApp',
    emailLabel: 'E-mail',
    footerReason: (coachHandle = '') => buildLeadFooterReason(
      coachHandle,
      'Ricevi questa e-mail perch\u00e9 hai lasciato il tuo indirizzo su',
      '.'
    ),
    privacyLabel: 'Note legali & privacy',
    copyrightLabel: '\u00a9 HL-Support Ltd. \u00b7 Tutti i diritti riservati',
    defaultGoalLabel: 'Obiettivo principale',
    defaultProfileLabel: 'Il tuo profilo',
    profiles: {
      feuer: { code: 'Tipo A', label: 'Il realizzatore', element: 'Fuoco', tagline: 'Sei nato per guidare, non per seguire.' },
      wind: { code: 'Tipo B', label: 'Il connettore', element: 'Vento', tagline: 'La tua energia \u00e8 contagiosa e questo \u00e8 il tuo vantaggio nascosto.' },
      wasser: { code: 'Tipo C', label: "L'ancora", element: 'Acqua', tagline: 'Sei il punto fermo su cui gli altri possono costruire, ed \u00e8 pi\u00f9 raro di quanto pensi.' },
      fels: { code: 'Tipo D', label: "L'architetto", element: 'Roccia', tagline: 'Vedi schemi che gli altri non notano affatto.' },
    },
    aspirations: {
      freedom: 'Libert\u00e0',
      impact: 'Impatto',
      security: 'Sicurezza',
      growth: 'Crescita',
    },
    whatsappPrefill: 'Ciao {coach}! Ho appena completato il quiz Codice del Successo e vorrei saperne di pi\u00f9.',
  },
  en: {
    subject: 'Your success code and your access',
    preheader: 'Your success code is ready and your personal access back to the videos is waiting for you.',
    greeting: 'Hi',
    intro: 'your success code is ready and your personal access is waiting for you.',
    resultLabel: 'Your success code',
    elementLabel: 'Element',
    resumeIntro: 'With this link, you jump straight back to the exact spot where you last stopped watching.',
    ctaLabel: 'Continue with your videos',
    contactPrompt: 'If you want to talk through your next step personally, contact {coach} directly on WhatsApp.',
    whatsappLabel: 'WhatsApp',
    coachHeading: 'Your contact coach',
    phoneLabel: 'Phone / WhatsApp',
    emailLabel: 'Email',
    footerReason: (coachHandle = '') => buildLeadFooterReason(
      coachHandle,
      'You are receiving this email because you entered your email address on',
      '.'
    ),
    privacyLabel: 'Legal notice & privacy',
    copyrightLabel: '\u00a9 HL-Support Ltd. \u00b7 All rights reserved',
    defaultGoalLabel: 'Main goal',
    defaultProfileLabel: 'Your profile',
    profiles: {
      feuer: { code: 'Type A', label: 'The doer', element: 'Fire', tagline: 'You were born to lead, not to follow.' },
      wind: { code: 'Type B', label: 'The connector', element: 'Wind', tagline: 'Your energy is contagious and that is your unfair advantage.' },
      wasser: { code: 'Type C', label: 'The anchor', element: 'Water', tagline: 'You are the steady point others can build on and that is rarer than you think.' },
      fels: { code: 'Type D', label: 'The architect', element: 'Stone', tagline: 'You see patterns that others completely miss.' },
    },
    aspirations: {
      freedom: 'Freedom',
      impact: 'Impact',
      security: 'Security',
      growth: 'Growth',
    },
    whatsappPrefill: 'Hello {coach}! I just completed the Success Code quiz and would like to learn more.',
  },
  fr: {
    subject: 'Votre code du succ\u00e8s et votre acc\u00e8s',
    preheader: 'Votre code du succ\u00e8s est pr\u00eat et votre acc\u00e8s personnel pour reprendre les vid\u00e9os vous attend.',
    greeting: 'Bonjour',
    intro: 'votre code du succ\u00e8s est pr\u00eat et votre acc\u00e8s personnel vous attend.',
    resultLabel: 'Votre code du succ\u00e8s',
    elementLabel: '\u00c9l\u00e9ment',
    resumeIntro: 'Avec ce lien, vous reprenez exactement l\u00e0 o\u00f9 vous vous \u00eates arr\u00eat\u00e9 dans les vid\u00e9os.',
    ctaLabel: 'Reprendre les vid\u00e9os',
    contactPrompt: 'Si vous souhaitez parler personnellement de votre prochaine \u00e9tape, contactez {coach} directement sur WhatsApp.',
    whatsappLabel: 'WhatsApp',
    coachHeading: 'Votre coach r\u00e9f\u00e9rent',
    phoneLabel: 'T\u00e9l\u00e9phone / WhatsApp',
    emailLabel: 'E-mail',
    footerReason: (coachHandle = '') => buildLeadFooterReason(
      coachHandle,
      'Vous recevez cet e-mail parce que vous avez saisi votre adresse e-mail sur',
      '.'
    ),
    privacyLabel: 'Mentions l\u00e9gales & confidentialit\u00e9',
    copyrightLabel: '\u00a9 HL-Support Ltd. \u00b7 Tous droits r\u00e9serv\u00e9s',
    defaultGoalLabel: 'Objectif principal',
    defaultProfileLabel: 'Votre profil',
    profiles: {
      feuer: { code: 'Type A', label: 'Le moteur', element: 'Feu', tagline: 'Vous \u00eates n\u00e9 pour guider, pas pour suivre.' },
      wind: { code: 'Type B', label: 'Le connecteur', element: 'Vent', tagline: 'Votre \u00e9nergie est contagieuse et c\u2019est pr\u00e9cis\u00e9ment votre avantage d\u00e9cisif.' },
      wasser: { code: 'Type C', label: "L'ancrage", element: 'Eau', tagline: 'Vous \u00eates le point stable sur lequel les autres peuvent construire, et c\u2019est plus rare qu\u2019on ne le pense.' },
      fels: { code: 'Type D', label: "L'architecte", element: 'Pierre', tagline: 'Vous voyez des sch\u00e9mas que les autres ne remarquent m\u00eame pas.' },
    },
    aspirations: {
      freedom: 'Libert\u00e9',
      impact: 'Impact',
      security: 'S\u00e9curit\u00e9',
      growth: 'Croissance',
    },
    whatsappPrefill: 'Bonjour {coach} ! Je viens de terminer le quiz Code du Succ\u00e8s et j\u2019aimerais en savoir plus.',
  },
  ru: {
    subject: '\u0412\u0430\u0448 \u043a\u043e\u0434 \u0443\u0441\u043f\u0435\u0445\u0430 \u0438 \u0432\u0430\u0448 \u0434\u043e\u0441\u0442\u0443\u043f',
    preheader: '\u0412\u0430\u0448 \u043a\u043e\u0434 \u0443\u0441\u043f\u0435\u0445\u0430 \u0433\u043e\u0442\u043e\u0432, \u0438 \u0432\u0430\u0448 \u043f\u0435\u0440\u0441\u043e\u043d\u0430\u043b\u044c\u043d\u044b\u0439 \u0434\u043e\u0441\u0442\u0443\u043f \u0434\u043b\u044f \u043f\u0440\u043e\u0434\u043e\u043b\u0436\u0435\u043d\u0438\u044f \u0432\u0438\u0434\u0435\u043e \u0443\u0436\u0435 \u0436\u0434\u0451\u0442 \u0432\u0430\u0441.',
    greeting: '\u0417\u0434\u0440\u0430\u0432\u0441\u0442\u0432\u0443\u0439\u0442\u0435',
    intro: '\u0432\u0430\u0448 \u043a\u043e\u0434 \u0443\u0441\u043f\u0435\u0445\u0430 \u0433\u043e\u0442\u043e\u0432, \u0438 \u0432\u0430\u0448 \u043f\u0435\u0440\u0441\u043e\u043d\u0430\u043b\u044c\u043d\u044b\u0439 \u0434\u043e\u0441\u0442\u0443\u043f \u0443\u0436\u0435 \u0436\u0434\u0451\u0442 \u0432\u0430\u0441.',
    resultLabel: '\u0412\u0430\u0448 \u043a\u043e\u0434 \u0443\u0441\u043f\u0435\u0445\u0430',
    elementLabel: '\u042d\u043b\u0435\u043c\u0435\u043d\u0442',
    resumeIntro: '\u041f\u043e \u044d\u0442\u043e\u0439 \u0441\u0441\u044b\u043b\u043a\u0435 \u0432\u044b \u0432\u0435\u0440\u043d\u0451\u0442\u0435\u0441\u044c \u0442\u043e\u0447\u043d\u043e \u043a \u0442\u043e\u043c\u0443 \u043c\u0435\u0441\u0442\u0443, \u0433\u0434\u0435 \u043e\u0441\u0442\u0430\u043d\u043e\u0432\u0438\u043b\u0438\u0441\u044c \u0432 \u0432\u0438\u0434\u0435\u043e \u0432 \u043f\u0440\u043e\u0448\u043b\u044b\u0439 \u0440\u0430\u0437.',
    ctaLabel: '\u041f\u0440\u043e\u0434\u043e\u043b\u0436\u0438\u0442\u044c \u0432\u0438\u0434\u0435\u043e',
    contactPrompt: '\u0415\u0441\u043b\u0438 \u0432\u044b \u0445\u043e\u0442\u0438\u0442\u0435 \u043b\u0438\u0447\u043d\u043e \u043e\u0431\u0441\u0443\u0434\u0438\u0442\u044c \u0441\u0432\u043e\u0439 \u0441\u043b\u0435\u0434\u0443\u044e\u0449\u0438\u0439 \u0448\u0430\u0433, \u0441\u0432\u044f\u0436\u0438\u0442\u0435\u0441\u044c \u0441 {coach} \u043d\u0430\u043f\u0440\u044f\u043c\u0443\u044e \u0432 WhatsApp.',
    whatsappLabel: 'WhatsApp',
    coachHeading: '\u0412\u0430\u0448 \u0441\u043e\u043f\u0440\u043e\u0432\u043e\u0436\u0434\u0430\u044e\u0449\u0438\u0439 coach',
    phoneLabel: '\u0422\u0435\u043b\u0435\u0444\u043e\u043d / WhatsApp',
    emailLabel: 'E-mail',
    footerReason: (coachHandle = '') => buildLeadFooterReason(
      coachHandle,
      '\u0412\u044b \u043f\u043e\u043b\u0443\u0447\u0438\u043b\u0438 \u044d\u0442\u043e \u043f\u0438\u0441\u044c\u043c\u043e, \u043f\u043e\u0442\u043e\u043c\u0443 \u0447\u0442\u043e \u0443\u043a\u0430\u0437\u0430\u043b\u0438 \u0441\u0432\u043e\u0439 e-mail \u043d\u0430',
      '.'
    ),
    privacyLabel: '\u041f\u0440\u0430\u0432\u043e\u0432\u0430\u044f \u0438\u043d\u0444\u043e\u0440\u043c\u0430\u0446\u0438\u044f \u0438 \u043a\u043e\u043d\u0444\u0438\u0434\u0435\u043d\u0446\u0438\u0430\u043b\u044c\u043d\u043e\u0441\u0442\u044c',
    copyrightLabel: '\u00a9 HL-Support Ltd. \u00b7 \u0412\u0441\u0435 \u043f\u0440\u0430\u0432\u0430 \u0437\u0430\u0449\u0438\u0449\u0435\u043d\u044b',
    defaultGoalLabel: '\u0413\u043b\u0430\u0432\u043d\u0430\u044f \u0446\u0435\u043b\u044c',
    defaultProfileLabel: '\u0412\u0430\u0448 \u043f\u0440\u043e\u0444\u0438\u043b\u044c',
    profiles: {
      feuer: { code: '\u0422\u0438\u043f A', label: '\u0414\u0432\u0438\u0436\u0443\u0449\u0430\u044f \u0441\u0438\u043b\u0430', element: '\u041e\u0433\u043e\u043d\u044c', tagline: '\u0412\u044b \u0440\u043e\u0436\u0434\u0435\u043d\u044b \u0432\u0435\u0441\u0442\u0438 \u0437\u0430 \u0441\u043e\u0431\u043e\u0439, \u0430 \u043d\u0435 \u0441\u043b\u0435\u0434\u043e\u0432\u0430\u0442\u044c \u0437\u0430 \u0434\u0440\u0443\u0433\u0438\u043c\u0438.' },
      wind: { code: '\u0422\u0438\u043f B', label: '\u041a\u043e\u043c\u043c\u0443\u043d\u0438\u043a\u0430\u0442\u043e\u0440', element: '\u0412\u0435\u0442\u0435\u0440', tagline: '\u0412\u0430\u0448\u0430 \u044d\u043d\u0435\u0440\u0433\u0438\u044f \u0437\u0430\u0440\u0430\u0437\u0438\u0442\u0435\u043b\u044c\u043d\u0430, \u0438 \u0438\u043c\u0435\u043d\u043d\u043e \u0432 \u044d\u0442\u043e\u043c \u0432\u0430\u0448\u0435 \u0441\u043a\u0440\u044b\u0442\u043e\u0435 \u043f\u0440\u0435\u0438\u043c\u0443\u0449\u0435\u0441\u0442\u0432\u043e.' },
      wasser: { code: '\u0422\u0438\u043f C', label: '\u041e\u043f\u043e\u0440\u0430', element: '\u0412\u043e\u0434\u0430', tagline: '\u0412\u044b \u0442\u043e\u0442 \u0443\u0441\u0442\u043e\u0439\u0447\u0438\u0432\u044b\u0439 \u0446\u0435\u043d\u0442\u0440, \u043d\u0430 \u043a\u043e\u0442\u043e\u0440\u044b\u0439 \u0434\u0440\u0443\u0433\u0438\u0435 \u043c\u043e\u0433\u0443\u0442 \u043e\u043f\u0435\u0440\u0435\u0442\u044c\u0441\u044f, \u0438 \u044d\u0442\u043e \u0432\u0441\u0442\u0440\u0435\u0447\u0430\u0435\u0442\u0441\u044f \u0433\u043e\u0440\u0430\u0437\u0434\u043e \u0440\u0435\u0436\u0435, \u0447\u0435\u043c \u043a\u0430\u0436\u0435\u0442\u0441\u044f.' },
      fels: { code: '\u0422\u0438\u043f D', label: '\u0410\u0440\u0445\u0438\u0442\u0435\u043a\u0442\u043e\u0440', element: '\u041a\u0430\u043c\u0435\u043d\u044c', tagline: '\u0412\u044b \u0437\u0430\u043c\u0435\u0447\u0430\u0435\u0442\u0435 \u0437\u0430\u043a\u043e\u043d\u043e\u043c\u0435\u0440\u043d\u043e\u0441\u0442\u0438, \u043a\u043e\u0442\u043e\u0440\u044b\u0435 \u0434\u0440\u0443\u0433\u0438\u0435 \u043f\u043e\u043b\u043d\u043e\u0441\u0442\u044c\u044e \u0443\u043f\u0443\u0441\u043a\u0430\u044e\u0442.' },
    },
    aspirations: {
      freedom: '\u0421\u0432\u043e\u0431\u043e\u0434\u0430',
      impact: '\u0412\u043b\u0438\u044f\u043d\u0438\u0435',
      security: '\u0421\u0442\u0430\u0431\u0438\u043b\u044c\u043d\u043e\u0441\u0442\u044c',
      growth: '\u0420\u043e\u0441\u0442',
    },
    whatsappPrefill: '\u0417\u0434\u0440\u0430\u0432\u0441\u0442\u0432\u0443\u0439\u0442\u0435, {coach}! \u042f \u0442\u043e\u043b\u044c\u043a\u043e \u0447\u0442\u043e \u043f\u0440\u043e\u0448\u0451\u043b(\u0430) \u043a\u0432\u0438\u0437 \u00ab\u041a\u043e\u0434 \u0443\u0441\u043f\u0435\u0445\u0430\u00bb \u0438 \u0445\u043e\u0447\u0443 \u0443\u0437\u043d\u0430\u0442\u044c \u0431\u043e\u043b\u044c\u0448\u0435.',
  },
  hu: {
    subject: 'A sikerkódod és a személyes hozzáférésed',
    preheader: 'A sikerkódod elkészült, és a személyes hozzáférésed vár rád.',
    greeting: 'Szia',
    intro: 'a sikerkódod elkészült, és a személyes hozzáférésed készen áll.',
    resultLabel: 'A sikerkódod',
    elementLabel: 'Elem',
    resumeIntro: 'Ezzel a linkkel pontosan ott folytathatod, ahol legutóbb abbahagytad.',
    ctaLabel: 'Folytatom a videókat',
    contactPrompt: 'Ha személyesen szeretnéd átbeszélni a következő lépésedet, keresd {coach} coachodat közvetlenül WhatsAppon.',
    whatsappLabel: 'WhatsApp',
    coachHeading: 'A kapcsolattartód',
    phoneLabel: 'Telefonsz?m / WhatsApp',
    emailLabel: 'E-mail',
    footerReason: (coachHandle = '') => buildLeadFooterReason(
      coachHandle,
      'Ezt az e-mailt azért kapod, mert ezen az oldalon',
      'megadtad az e-mail címedet.'
    ),
    privacyLabel: 'Impresszum és adatvédelem',
    copyrightLabel: '© HL-Support Ltd. · Minden jog fenntartva',
    defaultGoalLabel: 'Cél',
    defaultProfileLabel: 'A profilod',
    profiles: {
      feuer: {
        code: 'A típus',
        label: 'A Cselekvő',
        element: 'Tűz',
        tagline: 'Arra születtél, hogy irányt mutass, ne arra, hogy csak kövess másokat.',
        shadow: 'Néha türelmetlennek tűnhetsz mások szemében, de ez valójában erő, amely megfelelő irányt keres.',
        strengths: [
          'Gyors és tiszta döntések',
          'Következetes út az ötlettől a megvalósításig',
          'Természetes vezetői erő',
          'Önálló, belülről hajtott működés',
        ],
        fit: {
          freedom: 'Neked nem egy 9-től 5-ig tartó keret kell. Olyan rendszerre van szükséged, amely olyan gyorsan skálázódik, ahogy te gondolkodsz. Nincs főnök. Nincs plafon. A te szabályaid.',
          impact: 'Ha hatást akarsz, olyan modell kell, ahol az energiád valóban megmozdít másokat, nem pedig végtelen megbeszélésekben vész el.',
          security: 'Akkor is szükséged van stabil alapra, ha erősen haladsz előre. Egy jó rendszer pontosan ezt adja meg.',
          growth: 'Ott fejlődsz a legerősebben, ahol felelősséget vállalhatsz, vezethetsz és eredményeket láthatsz.',
        },
        cta: {
          freedom: 'Már tudod, mit akarsz. A kérdés csak az: megvan hozzá a megfelelő eszközöd?',
          impact: 'Az energiád képes embereket magával vinni. Csak az számít, jó környezetben használod-e.',
          security: 'Nem kell kicsire venned magad a biztonságért. Csak a megfelelő modellre van szükséged.',
          growth: 'Neked nem külső motiváció kell. Olyan pálya kell, amely elég nagy hozzád.',
        },
      },
      wind: {
        code: 'B típus',
        label: 'A Kapcsolatteremtő',
        element: 'Szél',
        tagline: 'Az energiád ragadós, és pontosan ez a verhetetlen előnyöd.',
        shadow: 'Néha egyik ötlettől a másikig ugrasz, de ez nem hiba. Csak megfelelő keretre van szükséged.',
        strengths: [
          'Ragadós lelkesedés',
          'Gyors bizalomépítés',
          'Kapcsolódást teremtő jelenlét minden csapatban',
          'Pozitív, magával ragadó kisugárzás',
        ],
        fit: {
          freedom: 'Nem merev struktúrákban kell ragadnod. Olyan környezet kell, ahol emberekkel és energiával együtt növekedhetsz.',
          impact: 'Ha hatást akarsz, ott vagy a legerősebb, ahol a valódi kapcsolatok többet számítanak, mint a rideg folyamatok.',
          security: 'A biztonság neked nem csak pénz. Olyan környezet is, amely megtart, és emberek, akik veled mennek.',
          growth: 'Ott fejlődsz a legjobban, ahol új embereket, új tereket és új lehetőségeket élhetsz meg.',
        },
        cta: {
          freedom: 'Neked nem eladnod kell. Elég, ha önmagad vagy. Egy kapcsolatokra épülő üzlet a természetes tereped.',
          impact: 'A legerősebb csapatok nem tökéletes stratégiából születnek, hanem olyan emberekből, mint te.',
          security: 'Ha a környezet jó, könnyedén vonzod az embereket és a lehetőségeket.',
          growth: 'A valódi potenciálod akkor nyílik ki, amikor a lelkesedés tiszta rendszerrel találkozik.',
        },
      },
      wasser: {
        code: 'C típus',
        label: 'A Támasz',
        element: 'Víz',
        tagline: 'Te vagy az a stabil pont, amelyre mások építeni tudnak. Ez ritkább, mint gondolnád.',
        shadow: 'Hajlamos vagy a saját igényeidet hátrébb tenni, pedig a te jólléted az alapja minden másnak.',
        strengths: [
          'Megbízhatóság és következetesség',
          'Mély, tartós bizalom',
          'Nyugalom nehéz helyzetekben',
          'Kiegyensúlyozott, békét teremtő működés',
        ],
        fit: {
          freedom: 'Neked nem reflektorfény kell. Stabilitásra és valódi szabadságra van szükséged, káosz nélkül.',
          impact: 'Nem hangerővel változtatsz meg embereket, hanem következetességgel, bizalommal és valódi jelenléttel.',
          security: 'Számodra egy stabil, megbízható modell fontosabb, mint a hangos ígéretek. Pont ott bontakozik ki az erőd.',
          growth: 'Nem nyomás alatt nősz, hanem biztonságban, tisztaságban és egy olyan környezetben, amely bízik benned.',
        },
        cta: {
          freedom: 'Neked nincs szükséged show-ra. Olyan modell kell, amely illik az életedhez, és közben levegőt hagy.',
          impact: 'A hosszú távon erős csapatokat olyan emberek tartják össze, mint te.',
          security: 'Az erőd abban van, hogy olyan bizalmat építesz, amely holnap is tart.',
          growth: 'Ha megvan a megfelelő környezet, olyan mélységet építesz, amelyet mások ritkán érnek el.',
        },
      },
      fels: {
        code: 'D típus',
        label: 'Az Építő',
        element: 'Szikla',
        tagline: 'Olyan mintákat látsz meg, amelyeket mások teljesen elnéznek.',
        shadow: 'Néha túl sokáig elemzel, de a pontosságod nem akadály, hanem az egyik legnagyobb erősséged.',
        strengths: [
          'Átgondolt és megalapozott döntések',
          'Rendszerszemlélet előrelátással',
          'Következetes optimalizálás pontossággal',
          'Belső motiváció és önállóság',
        ],
        fit: {
          freedom: 'Neked nem káosz és üres ígéretek kellenek. Olyan rendszerre van szükséged, amelyet megértesz és hosszú távon fejleszthetsz.',
          impact: 'A hatásod ott kezdődik, ahol mások csak a felszínt látják, te pedig valódi struktúrát viszel bele.',
          security: 'Számodra a biztonság tisztaságból, logikából és egy érthetően működő modellből születik.',
          growth: 'Akkor fejlődsz a legtöbbet, ha átláthatsz, javíthatsz és mesteri szintre vihetsz egy rendszert.',
        },
        cta: {
          freedom: 'Neked nem kapkodás kell. Olyan eszköz kell, amelynek van tartalma, és kiállja a gondolkodásod próbáját.',
          impact: 'A legjobb üzleti struktúrákat olyan emberek hozzák létre és finomítják, mint te.',
          security: 'Ha valamit megértesz, nyugodtan és pontosan tudod naggyá tenni.',
          growth: 'Az erőd abban van, hogy a lehetőségekből valódi rendszereket építesz.',
        },
      },
    },
    snapshotHeading: 'A kiértékelésed röviden',
    snapshotTypeLabel: 'A sikertípusod',
    snapshotEnergyLabel: 'A legerősebb energiád',
    snapshotBlockerLabel: 'A belső akadályod',
    snapshotAccessLabel: 'A következő hozzáférésed',
    snapshotAccessText: '3 rövid videó, a típusodhoz igazítva',
    snapshotBlockerFallback: 'a következő tiszta lépésed',
    strengthsHeading: 'A legnagyobb erősségeid',
    shadowHeading: 'A vakfoltod',
    videoAccessNote: 'A hozzáférésed megnyílt. A következő lépésben megmutatjuk, melyik rendszer illik a típusodhoz és a célodhoz.',
    barrierIntro: 'Te magad mondtad: most ez hiányzik - "',
    barrierOutro: '". Pontosan erre van megoldásunk.',
    energyLabels: {
      freedom: 'Szabadság önálló döntéseken keresztül',
      impact: 'Hatás valódi kapcsolatokon keresztül',
      security: 'Biztonság tiszta lépéseken keresztül',
      growth: 'Növekedés egy tanulható rendszeren keresztül',
    },
    barrierLabels: {
      vehicle: 'egy működő rendszer',
      community: 'a megfelelő környezet',
      confidence: 'egy biztonságos első lépés',
      opportunity: 'a hozzád illő lehetőség',
    },
    aspirations: {
      freedom: 'Szabadság',
      impact: 'Hatás',
      security: 'Biztonság',
      growth: 'Növekedés',
    },
    whatsappPrefill: 'Szia {coach}! Most töltöttem ki a Sikerkód kvízt, és szeretnék többet megtudni erről a lehetőségről.',
  },
};

function getLeadEmailCopy(language) {
  return LEAD_EMAIL_I18N[normalizeLanguage(language)] || LEAD_EMAIL_I18N.de;
}

function buildLeadFooterReason(coachHandle, prefix, suffix) {
  const href = buildCoachQuizUrl('https://business.activecenter.info', coachHandle);
  const label = href.replace(/^https?:\/\//, '');
  return `${prefix} <a href="${escapeHtml(href)}" style="color:#999999;text-decoration:underline;">${escapeHtml(label)}</a>${suffix}`;
}

function getLeadAspirationKey(rawValue, fallbackLabel) {
  const candidates = [rawValue, fallbackLabel].filter(Boolean);
  for (const candidate of candidates) {
    const key = slugify(candidate, '');
    if (key && LEAD_EMAIL_ASPIRATION_KEYS[key]) return LEAD_EMAIL_ASPIRATION_KEYS[key];
  }
  return '';
}

function getLocalizedAspirationLabel(language, rawValue, fallbackLabel) {
  const copy = getLeadEmailCopy(language);
  const key = getLeadAspirationKey(rawValue, fallbackLabel);
  return copy.aspirations[key] || fallbackLabel || copy.defaultGoalLabel;
}

function getLocalizedLeadEmailPresentation(model) {
  const copy = getLeadEmailCopy(model.language);
  const canonicalProfile = normalizeProfile(model.profile_slug, model.profile_label);
  const profileSlug = canonicalProfile.slug;
  const base = getLeadEmailPresentation({ ...model, profile_slug: profileSlug });
  const localizedProfile = copy.profiles[profileSlug] || {};
  return {
    ...base,
    ...localizedProfile,
    label: firstNonEmpty([localizedProfile.label, model.profile_label, canonicalProfile.label, copy.defaultProfileLabel], copy.defaultProfileLabel),
    code: firstNonEmpty([localizedProfile.code, base.code], base.code),
    element: firstNonEmpty([localizedProfile.element, base.element], base.element),
    tagline: firstNonEmpty([localizedProfile.tagline, base.tagline], base.tagline),
  kornyezet: 'community',
  'megfelelo-kornyezet': 'community',
  'hianyzik-a-kornyezet': 'community',
  biztonsag: 'confidence',
  'hianyzik-a-biztonsag': 'confidence',
  lehetoseg: 'opportunity',
  'hianyzik-a-lehetoseg': 'opportunity',
  szabadsag: 'freedom',
  hatas: 'impact',
  biztonsag: 'security',
  stabilitas: 'security',
  novekedes: 'growth',
  };
}

function buildWhatsAppUrl(phone, prefill) {
  const digits = normalizePhoneDigits(phone);
  if (!digits) return '';
  return prefill
    ? `https://wa.me/${digits}?text=${encodeURIComponent(prefill)}`
    : `https://wa.me/${digits}`;
}

function buildBulletproofButton(url, label, backgroundColor, textColor) {
  const safeUrl = escapeHtml(url || '');
  const safeLabel = escapeHtml(label || '\u00d6ffnen');
  const safeBackground = escapeHtml(backgroundColor || '#111111');
  const safeText = escapeHtml(textColor || '#ffffff');

  return [
    '<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:0 auto;">',
    '<tr>',
    `<td align="center" bgcolor="${safeBackground}" style="border-radius:14px;background:${safeBackground};">`,
    '<!--[if mso]>',
    `<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${safeUrl}" style="height:50px;v-text-anchor:middle;width:260px;" arcsize="14%" stroke="f" fillcolor="${safeBackground}">`,
    '<w:anchorlock/>',
    `<center style="color:${safeText};font-family:Arial,sans-serif;font-size:16px;font-weight:700;">${safeLabel}</center>`,
    '</v:roundrect>',
    '<![endif]-->',
    '<!--[if !mso]><!-- -->',
    `<a href="${safeUrl}" style="background:${safeBackground};border:1px solid ${safeBackground};border-radius:14px;color:${safeText};display:inline-block;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:700;line-height:50px;text-align:center;text-decoration:none;width:260px;-webkit-text-size-adjust:none;">${safeLabel}</a>`,
    '<!--<![endif]-->',
    '</td>',
    '</tr>',
    '</table>'
  ].join('');
}

function buildLeadProfileIconHtml(presentation, size = 46) {
  const safeSize = Math.max(12, Math.min(72, Number(size) || 46));
  if (presentation.iconUrl) {
    return `<img src="${escapeHtml(presentation.iconUrl)}" width="${safeSize}" height="${safeSize}" alt="${escapeHtml(presentation.element || presentation.code || '')}" style="display:block;margin:0 auto;border:0;outline:none;text-decoration:none;width:${safeSize}px;height:${safeSize}px;" />`;
  }
  return escapeHtml(presentation.icon || '');
}

function buildLeadResultCard(model, presentation) {
  const copy = getLeadEmailCopy(model.language);
  const largeIconHtml = buildLeadProfileIconHtml(presentation, 46);
  const smallIconHtml = buildLeadProfileIconHtml(presentation, 16);
  return [
    '<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 26px 0;border-collapse:separate;">',
    '<tr>',
    '<td bgcolor="#10141C" style="background-color:#10141C;border:1px solid #1C2430;border-radius:28px;padding:28px 24px;text-align:center;">',
    `<div style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.4;letter-spacing:4px;text-transform:uppercase;color:${escapeHtml(presentation.accent)};font-weight:700;">${escapeHtml(presentation.code)} &middot; ${escapeHtml(copy.resultLabel)}</div>`,
    `<div style="margin:0 0 16px 0;font-size:46px;line-height:1;text-align:center;">${largeIconHtml}</div>`,
    `<div style="margin:0 0 10px 0;font-family:Georgia,'Times New Roman',serif;font-size:44px;line-height:1.08;font-weight:700;color:${escapeHtml(presentation.accent)};">${escapeHtml(model.profile_label || copy.defaultProfileLabel)}</div>`,
    `<div style="margin:0 0 22px 0;font-family:Georgia,'Times New Roman',serif;font-size:21px;line-height:1.45;font-style:italic;color:#D9D0C1;">${escapeHtml(presentation.tagline)}</div>`,
    '<table role="presentation" align="center" cellpadding="0" cellspacing="0" style="margin:0 auto;border-collapse:separate;">',
    '<tr>',
    `<td bgcolor="#1A212C" style="background-color:#1A212C;border:1px solid ${escapeHtml(presentation.accent)}55;border-radius:999px;padding:10px 18px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.2;color:${escapeHtml(presentation.accent)};font-weight:700;"><table role="presentation" cellpadding="0" cellspacing="0" align="center" style="border-collapse:collapse;"><tr><td valign="middle" style="padding:0 8px 0 0;line-height:0;">${smallIconHtml}</td><td valign="middle" style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.2;color:${escapeHtml(presentation.accent)};font-weight:700;">${escapeHtml(copy.elementLabel)}: ${escapeHtml(presentation.element)}</td></tr></table></td>`,
    '<td style="font-size:0;line-height:0;width:8px;">&nbsp;</td>',
    `<td bgcolor="#1A212C" style="background-color:#1A212C;border:1px solid ${escapeHtml(presentation.accent)}55;border-radius:999px;padding:10px 18px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.2;color:${escapeHtml(presentation.accent)};font-weight:700;">${escapeHtml(model.main_aspiration_label || copy.defaultGoalLabel)}</td>`,
    '</tr>',
    '</table>',
    '</td>',
    '</tr>',
    '</table>'
  ].join('');
}

function buildCoachContactBlock(model, presentation) {
  const copy = getLeadEmailCopy(model.language);
  const rows = [
    '<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-collapse:separate;">',
    '<tr>',
    '<td bgcolor="#F7F3EA" style="background-color:#F7F3EA;border:1px solid #E7DFC9;border-radius:18px;padding:20px 20px 18px 20px;">',
    `<div style="margin:0 0 8px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.4;letter-spacing:2px;text-transform:uppercase;color:#7A6C52;font-weight:700;">${escapeHtml(copy.coachHeading)}</div>`,
    `<div style="margin:0 0 10px 0;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:1.3;font-weight:700;color:#1A1A1A;">${escapeHtml(model.coach_full_name || 'Dein Coach')}</div>`
  ];

  if (model.coach_phone_formatted) {
    const linkedPhone = model.coach_whatsapp_url
      ? `<a href="${escapeHtml(model.coach_whatsapp_url)}" style="color:${escapeHtml(presentation.accent)};text-decoration:underline;font-weight:700;">${escapeHtml(model.coach_phone_formatted)}</a>`
      : escapeHtml(model.coach_phone_formatted);
    rows.push(`<div style="margin:0 0 8px 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#2D2D2D;"><strong>${escapeHtml(copy.phoneLabel)}:</strong> ${linkedPhone}</div>`);
  }

  if (model.coach_email) {
    rows.push(`<div style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#2D2D2D;"><strong>${escapeHtml(copy.emailLabel)}:</strong> <a href="mailto:${escapeHtml(model.coach_email)}" style="color:${escapeHtml(presentation.accent)};text-decoration:underline;">${escapeHtml(model.coach_email)}</a></div>`);
  }

  rows.push('</td>');
  rows.push('</tr>');
  rows.push('</table>');
  return rows.join('');
}

function getLeadAnalysisProfile(model, presentation) {
  const copy = getLeadEmailCopy(model.language);
  const fallbackCopy = LEAD_EMAIL_I18N.de;
  return copy.profiles[model.profile_slug] || fallbackCopy.profiles[model.profile_slug] || {
    code: presentation.code,
    label: presentation.label || model.profile_label || copy.defaultProfileLabel,
    element: presentation.element,
    tagline: presentation.tagline,
    strengths: [],
    shadow: '',
    fit: {},
    cta: {},
  };
}

function getLeadEmailValue(copy, key) {
  return firstNonEmpty([copy[key], LEAD_EMAIL_I18N.de[key]], '');
}

function getLeadEmailMapValue(copy, mapName, key, fallback = '') {
  const ownMap = copy[mapName] || {};
  const fallbackMap = LEAD_EMAIL_I18N.de[mapName] || {};
  return firstNonEmpty([ownMap[key], fallbackMap[key], fallback], fallback);
}

function getLeadBarrierLabel(model, copy) {
  const barrierSlug = model.barrier_slug || normalizeBarrierSlug(model.barrier_label);
  return getLeadEmailMapValue(
    copy,
    'barrierLabels',
    barrierSlug,
    model.barrier_label || getLeadEmailValue(copy, 'snapshotBlockerFallback')
  );
}

function buildLeadSnapshotSection(model, presentation, profile) {
  const copy = getLeadEmailCopy(model.language);
  const accent = escapeHtml(presentation.accent);
  const aspirationSlug = model.main_aspiration_slug || 'freedom';
  const tiles = [
    ['01', getLeadEmailValue(copy, 'snapshotTypeLabel'), profile.label || presentation.label || model.profile_label],
    ['02', getLeadEmailValue(copy, 'snapshotEnergyLabel'), getLeadEmailMapValue(copy, 'energyLabels', aspirationSlug, getLocalizedAspirationLabel(model.language, aspirationSlug, model.main_aspiration_label))],
    ['03', getLeadEmailValue(copy, 'snapshotBlockerLabel'), getLeadBarrierLabel(model, copy)],
    ['04', getLeadEmailValue(copy, 'snapshotAccessLabel'), getLeadEmailValue(copy, 'snapshotAccessText')],
  ];

  const tileHtml = tiles.map(([number, label, value]) => [
    '<td width="50%" valign="top" style="padding:5px;">',
    `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-collapse:separate;"><tr><td bgcolor="#151B25" style="background-color:#151B25;border:1px solid ${accent}33;border-radius:12px;padding:13px 14px;">`,
    `<div style="margin:0 0 7px 0;font-family:Arial,Helvetica,sans-serif;font-size:10px;line-height:1.2;letter-spacing:2px;text-transform:uppercase;color:${accent};font-weight:700;">${escapeHtml(number)}</div>`,
    `<div style="margin:0 0 5px 0;font-family:Arial,Helvetica,sans-serif;font-size:10.5px;line-height:1.35;letter-spacing:1.6px;text-transform:uppercase;color:#8D96A6;font-weight:700;">${escapeHtml(label)}</div>`,
    `<div style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:13.5px;line-height:1.45;color:#F5F0E8;font-weight:700;">${escapeHtml(value)}</div>`,
    '</td></tr></table>',
    '</td>',
  ].join(''));

  return [
    '<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 18px 0;border-collapse:separate;">',
    '<tr>',
    `<td bgcolor="#10141C" style="background-color:#10141C;border:1px solid #1C2430;border-radius:18px;padding:18px 16px;">`,
    `<div style="margin:0 0 12px 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.4;letter-spacing:2.4px;text-transform:uppercase;color:#8D96A6;font-weight:700;">${escapeHtml(getLeadEmailValue(copy, 'snapshotHeading'))}</div>`,
    '<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-collapse:separate;">',
    `<tr>${tileHtml[0]}${tileHtml[1]}</tr>`,
    `<tr>${tileHtml[2]}${tileHtml[3]}</tr>`,
    '</table>',
    '</td>',
    '</tr>',
    '</table>',
  ].join('');
}

function buildLeadStrengthsSection(model, presentation, profile) {
  const copy = getLeadEmailCopy(model.language);
  const strengths = Array.isArray(profile.strengths) ? profile.strengths.filter(Boolean).slice(0, 4) : [];
  if (!strengths.length) return '';
  const accent = escapeHtml(presentation.accent);
  const items = strengths.map((strength) => [
    '<tr>',
    `<td valign="top" width="18" style="padding:0 0 8px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;color:${accent};">\u25c6</td>`,
    `<td valign="top" style="padding:0 0 8px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#4A4A4A;">${escapeHtml(strength)}</td>`,
    '</tr>',
  ].join('')).join('');

  return [
    '<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 18px 0;border-collapse:separate;">',
    '<tr>',
    '<td bgcolor="#F7F3EA" style="background-color:#F7F3EA;border:1px solid #E7DFC9;border-radius:16px;padding:20px 20px 14px 20px;">',
    `<div style="margin:0 0 12px 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.4;letter-spacing:2.2px;text-transform:uppercase;color:#7A6C52;font-weight:700;">${escapeHtml(getLeadEmailValue(copy, 'strengthsHeading'))}</div>`,
    '<table width="100%" cellpadding="0" cellspacing="0" role="presentation">',
    items,
    '</table>',
    '</td>',
    '</tr>',
    '</table>',
  ].join('');
}

function buildLeadShadowSection(model, presentation, profile) {
  const copy = getLeadEmailCopy(model.language);
  if (!profile.shadow) return '';
  return [
    '<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 22px 0;border-collapse:separate;">',
    '<tr>',
    `<td bgcolor="#FAFAFA" style="background-color:#FAFAFA;border-left:3px solid ${escapeHtml(presentation.accent)};border-radius:12px;padding:17px 19px;">`,
    `<div style="margin:0 0 7px 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.4;letter-spacing:2.2px;text-transform:uppercase;color:#8C8C8C;font-weight:700;">${escapeHtml(getLeadEmailValue(copy, 'shadowHeading'))}</div>`,
    `<div style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:16px;line-height:1.6;font-style:italic;color:#5B5B5B;">${escapeHtml(profile.shadow)}</div>`,
    '</td>',
    '</tr>',
    '</table>',
  ].join('');
}

function buildLeadNarrativeSection(model, presentation, profile) {
  const copy = getLeadEmailCopy(model.language);
  const aspirationSlug = model.main_aspiration_slug || 'freedom';
  const fitText = profile.fit ? firstNonEmpty([profile.fit[aspirationSlug], profile.fit.freedom], '') : '';
  const ctaText = profile.cta ? firstNonEmpty([profile.cta[aspirationSlug], profile.cta.freedom], '') : '';
  const barrierLabel = getLeadBarrierLabel(model, copy);
  const barrierLine = barrierLabel
    ? `<p style="margin:0 0 18px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:${escapeHtml(presentation.accent)};font-style:italic;">${escapeHtml(getLeadEmailValue(copy, 'barrierIntro'))}${escapeHtml(barrierLabel)}${escapeHtml(getLeadEmailValue(copy, 'barrierOutro'))}</p>`
    : '';

  return [
    fitText
      ? `<p style="margin:0 0 10px 0;font-family:Georgia,'Times New Roman',serif;font-size:20px;line-height:1.55;color:#212529;font-weight:700;">${escapeHtml(fitText)}</p>`
      : '',
    barrierLine,
    ctaText
      ? `<p style="margin:0 0 14px 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.65;color:#4A4A4A;">${escapeHtml(ctaText)}</p>`
      : '',
    `<p style="margin:0 0 22px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:${escapeHtml(presentation.accent)};font-weight:700;">${escapeHtml(getLeadEmailValue(copy, 'videoAccessNote'))}</p>`,
  ].join('');
}

function buildPremiumLeadEmailHtml(model) {
  const copy = getLeadEmailCopy(model.language);
  const presentation = getLocalizedLeadEmailPresentation(model);
  const analysisProfile = getLeadAnalysisProfile(model, presentation);
  const coachName = firstNonEmpty([model.coach_first_name, model.coach_full_name], copy.coachHeading.toLowerCase());
  const bodyHtml = [
    `<p style="margin:0 0 14px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.65;color:#2D2D2D;">${escapeHtml(copy.greeting)} ${escapeHtml(model.contact_first_name || 'there')},</p>`,
    `<p style="margin:0 0 18px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.65;color:#2D2D2D;">${escapeHtml(copy.intro)}</p>`,
    buildLeadResultCard(
      {
        ...model,
        profile_label: presentation.label || model.profile_label,
        main_aspiration_label: getLocalizedAspirationLabel(model.language, model.main_aspiration_slug, model.main_aspiration_label),
      },
      presentation
    ),
    buildLeadSnapshotSection(model, presentation, analysisProfile),
    buildLeadStrengthsSection(model, presentation, analysisProfile),
    buildLeadShadowSection(model, presentation, analysisProfile),
    buildLeadNarrativeSection(model, presentation, analysisProfile),
    `<p style="margin:0 0 22px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.65;color:#2D2D2D;">${escapeHtml(copy.resumeIntro)}</p>`,
    `<div style="margin:0 0 26px 0;text-align:center;">${buildBulletproofButton(model.video_access_url, copy.ctaLabel, presentation.accent, presentation.buttonText)}</div>`,
    `<p style="margin:0 0 8px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.65;color:#2D2D2D;">${escapeHtml(copy.contactPrompt.replace('{coach}', coachName))}</p>`,
    model.coach_whatsapp_url
      ? `<p style="margin:0 0 24px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.65;color:#2D2D2D;">${escapeHtml(copy.whatsappLabel)}: <a href="${escapeHtml(model.coach_whatsapp_url)}" style="color:${escapeHtml(presentation.accent)};text-decoration:underline;font-weight:700;">${escapeHtml(model.coach_phone_formatted || copy.whatsappLabel)}</a></p>`
      : '',
    buildCoachContactBlock(model, presentation)
  ].join('');

  return buildBrandedEmailShell({
    preheader: copy.preheader,
    bodyHtml,
    footerHtml: buildDefaultFooter(copy.footerReason(model.coach_handle || ''), model.language),
    brandName: getOrganisationName(model),
  });
}

function buildPremiumLeadEmailText(model) {
  const copy = getLeadEmailCopy(model.language);
  const presentation = getLocalizedLeadEmailPresentation(model);
  const analysisProfile = getLeadAnalysisProfile(model, presentation);
  const aspirationSlug = model.main_aspiration_slug || 'freedom';
  const fitText = analysisProfile.fit ? firstNonEmpty([analysisProfile.fit[aspirationSlug], analysisProfile.fit.freedom], '') : '';
  const ctaText = analysisProfile.cta ? firstNonEmpty([analysisProfile.cta[aspirationSlug], analysisProfile.cta.freedom], '') : '';
  const strengths = Array.isArray(analysisProfile.strengths) ? analysisProfile.strengths.filter(Boolean).slice(0, 4) : [];
  const barrierLabel = getLeadBarrierLabel(model, copy);
  const greetingName = model.contact_first_name ? ` ${model.contact_first_name}` : '';
  return [
    `${copy.greeting}${greetingName},`,
    '',
    copy.intro,
    '',
    `${presentation.code} \u00b7 ${copy.resultLabel}`,
    `${presentation.label || model.profile_label}`,
    `${presentation.tagline}`,
    `${copy.elementLabel}: ${presentation.element}`,
    `${copy.defaultGoalLabel}: ${getLocalizedAspirationLabel(model.language, model.main_aspiration_slug, model.main_aspiration_label)}`,
    '',
    getLeadEmailValue(copy, 'snapshotHeading'),
    `${getLeadEmailValue(copy, 'snapshotTypeLabel')}: ${analysisProfile.label || presentation.label || model.profile_label}`,
    `${getLeadEmailValue(copy, 'snapshotEnergyLabel')}: ${getLeadEmailMapValue(copy, 'energyLabels', aspirationSlug, getLocalizedAspirationLabel(model.language, aspirationSlug, model.main_aspiration_label))}`,
    `${getLeadEmailValue(copy, 'snapshotBlockerLabel')}: ${barrierLabel}`,
    `${getLeadEmailValue(copy, 'snapshotAccessLabel')}: ${getLeadEmailValue(copy, 'snapshotAccessText')}`,
    '',
    strengths.length ? getLeadEmailValue(copy, 'strengthsHeading') : '',
    ...strengths.map((strength) => `- ${strength}`),
    strengths.length ? '' : '',
    analysisProfile.shadow ? getLeadEmailValue(copy, 'shadowHeading') : '',
    analysisProfile.shadow || '',
    analysisProfile.shadow ? '' : '',
    fitText,
    barrierLabel ? `${getLeadEmailValue(copy, 'barrierIntro')}${barrierLabel}${getLeadEmailValue(copy, 'barrierOutro')}` : '',
    ctaText,
    getLeadEmailValue(copy, 'videoAccessNote'),
    '',
    copy.resumeIntro,
    '',
    `${copy.ctaLabel}: ${model.video_access_url}`,
    '',
    copy.contactPrompt.replace('{coach}', firstNonEmpty([model.coach_first_name, model.coach_full_name], copy.coachHeading.toLowerCase())),
    '',
    model.coach_whatsapp_url ? `${copy.whatsappLabel}: ${model.coach_phone_formatted}` : '',
    '',
    copy.coachHeading,
    model.coach_full_name || copy.coachHeading,
    model.coach_phone_formatted ? `${copy.phoneLabel}: ${model.coach_phone_formatted}` : '',
    model.coach_email ? `${copy.emailLabel}: ${model.coach_email}` : '',
  ].join('\n');
}

function buildCoachEmailHtml(model) {
  const bodyHtml = [
    `<h1 style="margin:0 0 20px 0;font-family:Arial,Helvetica,sans-serif;font-size:28px;line-height:1.3;color:#212529;">Neuer Kontakt aus business.activecenter.info/${model.coach_handle || ''}</h1>`,
    `<p style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.65;color:#2d2d2d;">Hallo ${escapeHtml(model.coach_first_name || 'Markus')},</p>`,
    '<p style="margin:0 0 24px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.65;color:#2d2d2d;">ein neuer Kontakt hat den Erfolgs-Code berechnet und die Info-Videos angefordert.</p>',
    '<table style="width:100%;border-collapse:collapse;margin:0 0 8px 0;">',
    `<tr><td style="padding:10px 0;border-bottom:1px solid #e6e6e6;font-weight:700;width:180px;">Name</td><td style="padding:10px 0;border-bottom:1px solid #e6e6e6;">${escapeHtml(model.contact_full_name)}</td></tr>`,
    `<tr><td style="padding:10px 0;border-bottom:1px solid #e6e6e6;font-weight:700;width:180px;">E-Mail</td><td style="padding:10px 0;border-bottom:1px solid #e6e6e6;">${escapeHtml(model.contact_email || '-')}</td></tr>`,
    `<tr><td style="padding:10px 0;border-bottom:1px solid #e6e6e6;font-weight:700;width:180px;">Typ</td><td style="padding:10px 0;border-bottom:1px solid #e6e6e6;">${escapeHtml(model.profile_label || '-')}</td></tr>`,
    `<tr><td style="padding:10px 0;border-bottom:1px solid #e6e6e6;font-weight:700;width:180px;">Zielsetzung</td><td style="padding:10px 0;border-bottom:1px solid #e6e6e6;">${escapeHtml(model.main_aspiration_label || '-')}</td></tr>`,
    `<tr><td style="padding:10px 0;border-bottom:1px solid #e6e6e6;font-weight:700;width:180px;">Was ihn aktuell zur\u00fcckh\u00e4lt</td><td style="padding:10px 0;border-bottom:1px solid #e6e6e6;">${escapeHtml(model.barrier_label || '-')}</td></tr>`,
    '</table>',
    `<p style="margin:24px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.65;color:#2d2d2d;"><a href="${escapeHtml(model.coach_insights_url || '')}" style="color:#212529;text-decoration:underline;font-weight:700;">Erfahre hier mehr zu deinem Kontakt</a></p>`,
  ].join('');

  return buildBrandedEmailShell({
    preheader: `Neuer Kontakt aus business.activecenter.info/${model.coach_handle || ''}`,
    bodyHtml,
    brandName: getOrganisationName(model),
    footerHtml: buildDefaultFooter('Diese Benachrichtigung wurde automatisch f\u00fcr einen neuen Quiz-Kontakt erstellt.'),
  });
}

function buildCoachEmailText(model) {
  return [
    `Neuer Kontakt aus business.activecenter.info/${model.coach_handle || ''}`,
    '',
    `Hallo ${model.coach_first_name || 'Markus'},`,
    '',
    'ein neuer Kontakt hat den Erfolgs-Code berechnet und die Info-Videos angefordert.',
    '',
    `Name: ${model.contact_full_name}`,
    `E-Mail: ${model.contact_email || '-'}`,
    `Typ: ${model.profile_label || '-'}`,
    `Zielsetzung: ${model.main_aspiration_label || '-'}`,
    `Was ihn aktuell zur\u00fcckh\u00e4lt: ${model.barrier_label || '-'}`,
    '',
    `Erfahre hier mehr zu deinem Kontakt: ${model.coach_insights_url || ''}`,
  ].join('\n');
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildLeadModel(row, options = {}) {
  const formResponse = safeJsonParse(row.form_response, {});
  const hidden = extractHidden(formResponse);
  const vars = extractVariables(formResponse);
  const answers = extractAnswers(formResponse);

  const leadHash = firstNonEmpty([
    row.lead_hash,
    hidden.hash,
    hidden.lead_hash,
    vars.lead_hash,
    row.survey_hash
  ], '');

  const sessionHash = firstNonEmpty([
    row.session_hash,
    hidden.session_hash,
    vars.session_hash,
    hidden.tracking_hash
  ], '');

  const memberId = firstNonEmpty([
    row.coach_herbalife_id,
    hidden.member_id,
    hidden.ref_id,
    row.member_id
  ], null);

  const token = firstNonEmpty([
    row.token,
    formResponse?.form_response?.token,
    formResponse?.token
  ], '');

  const language = normalizeLanguage(
    row.queued_language,
    hidden.lang,
    vars.contact_language,
    row.survey_locale,
    row.contact_locale,
    row.coach_preferred_language
  );

  const funnelKey = detectFunnelKey(formResponse, row);
  const profileData = extractProfileData(formResponse, row.points_result, language, {
    allowSuccessCodeFields: isBusinessLeadsQuizFunnel(funnelKey),
  });

  const contactFirstName = normalizePersonName(row.contact_first_name);
  const contactLastName = normalizePersonName(row.contact_last_name);
  const coachFirstName = normalizePersonName(row.coach_first_name);
  const coachLastName = normalizePersonName(row.coach_last_name);
  const contactFullName = firstNonEmpty([
    [contactFirstName, contactLastName].filter(Boolean).join(' ').trim(),
    contactFirstName
  ], 'Unbekannt');

  const coachFullName = firstNonEmpty([
    normalizePersonName(row.coach_full_name),
    [coachFirstName, coachLastName].filter(Boolean).join(' ').trim(),
    coachFirstName
  ], 'Coach');

  const model = {
    job_id: row.job_id || null,
    typeform_survey_id: row.typeform_survey_id,
    contact_id: row.contact_id,
    coach_id: row.final_coach_id || row.coach_id || null,
    member_id: memberId,
    form_id: row.form_id,
    token,
    survey_hash: row.survey_hash || '',
    lead_hash: leadHash,
    session_hash: sessionHash,
    ref_id: firstNonEmpty([hidden.ref_id, hidden.member_id, row.member_id, row.coach_herbalife_id], ''),
    language,
    survey_submitted_at: row.survey_submitted_at,
    contact_first_name: contactFirstName,
    contact_last_name: contactLastName,
    contact_full_name: contactFullName,
    contact_email: row.contact_email || '',
    contact_phone_formatted: formatPhone(row.contact_phone_prefix, row.contact_phone_number),
    coach_first_name: coachFirstName,
    coach_last_name: coachLastName,
    coach_full_name: coachFullName,
    coach_email: row.coach_email || '',
    coach_phone_formatted: formatPhone(row.coach_area_code, row.coach_phone_number),
    coach_herbalife_id: row.coach_herbalife_id || '',
    coach_handle: row.coach_sub_domain || '',
    coach_organisation_name: row.coach_organisation_name || '',
    organisation_name: row.coach_organisation_name || '',
    answers,
    questions: answers.map((entry) => entry.question),
    video_access_url: buildVideoAccessUrl(options.videoBaseUrl, leadHash, memberId),
    funnel_key: funnelKey,
    ...profileData
  };

  const leadCopy = getLeadEmailCopy(model.language);
  const canonicalProfile = normalizeProfile(model.profile_slug, model.profile_label);
  model.profile_slug = canonicalProfile.slug || model.profile_slug;
  model.localized_profile_label = (leadCopy.profiles[model.profile_slug] || {}).label || model.profile_label;
  model.localized_main_aspiration_label = getLocalizedAspirationLabel(model.language, model.main_aspiration_slug, model.main_aspiration_label);
  model.barrier_label = firstNonEmpty([
    findAnswerValue(model.answers, ['lead_q6_barrier'], ''),
    findAnswerValue(model.answers, ['lead_barrier', 'q6', 'lead_q6'], ''),
    ((model.answers || []).find((entry) => Number(entry.index) === 6) || {}).answer
  ], '');
  model.barrier_slug = normalizeBarrierSlug(firstNonEmpty([vars.barrier_slug, vars.lead_barrier, hidden.barrier_slug, hidden.lead_barrier, model.barrier_label], ''));
  model.coach_insights_url = buildCoachInsightsUrl(model.profile_slug, model.main_aspiration_slug);
  model.coach_quiz_url = buildCoachQuizUrl(options.videoBaseUrl, model.coach_handle);
  model.coach_whatsapp_url = buildWhatsAppUrl(
    model.coach_phone_formatted,
    `Hallo ${model.coach_first_name || ''}! Ich habe gerade mein Erfolgscode-Quiz gemacht und m\u00f6chte mehr erfahren.`
      .replace(/\s+/g, ' ')
      .trim()
  );
  model.coach_whatsapp_url = buildWhatsAppUrl(
    model.coach_phone_formatted,
    leadCopy.whatsappPrefill.replace('{coach}', model.coach_first_name || '')
      .replace(/\s+/g, ' ')
      .trim()
  );
  model.lead_email_subject = leadCopy.subject;
  model.lead_email_html = buildPremiumLeadEmailHtml(model);
  model.lead_email_text = buildPremiumLeadEmailText(model);
  model.coach_email_subject = `Neuer Erfolgs-Code von: ${model.contact_full_name || model.contact_first_name || 'Neuer Kontakt'}`;
  model.coach_email_html = buildCoachEmailHtml(model);
  model.coach_email_text = buildCoachEmailText(model);
  model.mautic_tags = [
    'ac:funnel:business-leads-quiz',
    `ac:form:${model.form_id}`,
    model.profile_slug ? `ac:profile:${model.profile_slug}` : null,
    model.main_aspiration_slug ? `ac:goal:${model.main_aspiration_slug}` : null,
    model.coach_herbalife_id ? `ac:coach:${model.coach_herbalife_id}` : null,
    `ac:lang:${model.language}`,
    'ac:source:typeform-survey'
  ].filter(Boolean);
  model.mautic_contact_payload = {
    firstname: model.contact_first_name || '',
    lastname: model.contact_last_name || '',
    email: model.contact_email || '',
    mobile: model.contact_phone_formatted || '',
    ref_id: model.ref_id || '',
    coach_id: model.coach_id || '',
    ac_member_id: memberId || '',
    ac_coach_user_id: model.coach_id || '',
    ac_coach_herbalife_id: model.coach_herbalife_id || '',
    ac_contact_id: row.contact_id || '',
    ac_last_typeform_survey_i: row.typeform_survey_id || '',
    ac_last_form_id: model.form_id || '',
    ac_last_lead_hash: model.lead_hash || '',
    ac_last_session_hash: model.session_hash || '',
    ac_last_funnel: model.funnel_key || 'business_leads_quiz',
    ac_last_profile: model.profile_slug || '',
    ac_last_profile_label: model.localized_profile_label || model.profile_label || '',
    ac_last_main_goal: model.main_aspiration_slug || '',
    ac_last_main_goal_label: model.localized_main_aspiration_label || model.main_aspiration_label || '',
    ac_last_form_language: model.language || '',
    ac_last_form_submitted_at: model.survey_submitted_at || '',
    ac_last_video_access_url: model.video_access_url || '',
    ac_last_barrier: model.barrier_slug || '',
    ac_berater_vorname: model.coach_first_name || '',
    ac_berater_name: model.coach_last_name || model.coach_full_name || '',
    ac_berater_email: model.coach_email || '',
    ac_berater_whatsapp: model.coach_phone_formatted || '',
    ac_berater_slug: model.coach_handle || '',
    ac_berater_org_display: getOrganisationName(model),
    ac_berater_display_name: buildCoachDisplayName(model)
  };

  return model;
}