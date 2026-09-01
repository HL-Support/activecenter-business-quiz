const resp = $json;
const leadData = $('Code - Determine Phase').item.json;

let c = null;
if (resp.contact) c = resp.contact;
else if (resp.contacts) { const arr = Object.values(resp.contacts); c = arr.length ? arr[0] : null; }
if (!c) return { json: { skip: true, reason: 'contact_not_found', lead_hash: leadData.lead_hash } };

// DNC / Abmeldung: nativer Mautic-Unsubscribe/Bounce fuer Email-Kanal -> niemals senden
const dncList = Array.isArray(c.doNotContact) ? c.doNotContact : [];
if (dncList.some(d => (d.channel || 'email') === 'email')) {
  return { json: { skip: true, reason: 'dnc_unsubscribed', lead_hash: leadData.lead_hash } };
}

const getField = (alias) => {
  const f = c.fields || {};
  if (f.all && f.all[alias] !== undefined) {
    const v = f.all[alias];
    return (v && typeof v === 'object') ? (v.value != null ? v.value : '') : (v != null ? v : '');
  }
  for (const group of Object.values(f)) {
    if (group && typeof group === 'object' && group[alias] !== undefined) {
      const v = group[alias];
      return (v && typeof v === 'object') ? (v.value != null ? v.value : '') : (v != null ? v : '');
    }
  }
  return c[alias] != null ? c[alias] : '';
};

// 🔴 Mautic liefert Boolean-Felder als ZAHL (1), nicht als Zeichenkette. Die alte Pruefung
// verglich streng gegen true/'1'/'true' und war damit wirkungslos - der Stoppschalter hat
// nie jemanden angehalten. Gemessen am 29.08.2026: ac_nurture_stopped kam als number 1
// zurueck, die Pruefung ergab false. Bis dahin trug niemand die Markierung, es ist also
// keine Mail zu Unrecht rausgegangen.
const nurtureStopped = getField('ac_nurture_stopped');
const istGestoppt = nurtureStopped === true || nurtureStopped === 1
  || ['1', 'true', 'ja', 'yes'].includes(String(nurtureStopped).toLowerCase());
if (istGestoppt) {
  return { json: { skip: true, reason: 'nurture_stopped', lead_hash: leadData.lead_hash } };
}

const sentRaw = getField('ac_nurture_sent_phases') || '';
const sentPhases = sentRaw ? sentRaw.split(',').map(s => s.trim()).filter(Boolean) : [];

if (sentPhases.includes(leadData.phase)) {
  return { json: { skip: true, reason: 'already_sent:' + leadData.phase, lead_hash: leadData.lead_hash } };
}

const EMAIL_MAP = {
  a2: {
    de: { freedom: 13, impact: 14, security: 15, growth: 16 },
    it: { freedom: 98, impact: 99, security: 100, growth: 101 },
    en: { freedom: 146, impact: 147, security: 148, growth: 149 },
    hu: { _single: 162 },
    fr: { _single: 170 },
    ru: { _single: 178 },
  },
  a3: {
    de: { vehicle: 17, community: 18, confidence: 19, opportunity: 20 },
    it: { vehicle: 114, community: 115, confidence: 116, opportunity: 117 },
    en: { vehicle: 130, community: 131, confidence: 132, opportunity: 133 },
    hu: { _single: 163 },
    fr: { _single: 171 },
    ru: { _single: 179 },
  },
  a4: {
    de: { feuer: 21, wind: 22, wasser: 23, fels: 24 },
    it: { feuer: 21, wind: 22, wasser: 23, fels: 24 },
    en: { feuer: 21, wind: 22, wasser: 23, fels: 24 },
  },
  a5: {
    de: { _single: 25 }, it: { _single: 25 }, en: { _single: 25 },
  },
  b1: {
    de: { feuer: 26, wind: 27, wasser: 28, fels: 29 },
    it: { feuer: 102, wind: 103, wasser: 104, fels: 105 },
    en: { feuer: 150, wind: 151, wasser: 152, fels: 153 },
    hu: { _single: 164 },
    fr: { _single: 172 },
    ru: { _single: 180 },
  },
  b2: {
    de: { feuer: 30, wind: 31, wasser: 32, fels: 33 },
    it: { feuer: 118, wind: 119, wasser: 120, fels: 121 },
    en: { feuer: 134, wind: 135, wasser: 136, fels: 137 },
    hu: { _single: 165 },
    fr: { _single: 173 },
    ru: { _single: 181 },
  },
  c1: {
    de: { freedom: 34, impact: 95, security: 96, growth: 97 },
    it: { freedom: 106, impact: 107, security: 108, growth: 109 },
    en: { freedom: 154, impact: 155, security: 156, growth: 157 },
    hu: { _single: 166 },
    fr: { _single: 174 },
    ru: { _single: 182 },
  },
  c2: {
    de: { feuer: 35, wind: 36, wasser: 37, fels: 38 },
    it: { feuer: 122, wind: 123, wasser: 124, fels: 125 },
    en: { feuer: 138, wind: 139, wasser: 140, fels: 141 },
    hu: { _single: 167 },
    fr: { _single: 175 },
    ru: { _single: 183 },
  },
  d1: {
    de: { freedom: 39, impact: 40, security: 41, growth: 42 },
    it: { freedom: 110, impact: 111, security: 112, growth: 113 },
    en: { freedom: 158, impact: 159, security: 160, growth: 161 },
    hu: { _single: 168 },
    fr: { _single: 176 },
    ru: { _single: 184 },
  },
  d2: {
    de: { vehicle: 43, community: 44, confidence: 45, opportunity: 46 },
    it: { vehicle: 126, community: 127, confidence: 128, opportunity: 129 },
    en: { vehicle: 142, community: 143, confidence: 144, opportunity: 145 },
    hu: { _single: 169 },
    fr: { _single: 177 },
    ru: { _single: 185 },
  },
};

const PHASE_DIM = {
  a2: 'main_goal', a3: 'barrier', a4: 'profile', a5: '_single',
  b1: 'profile', b2: 'profile', c1: 'main_goal', c2: 'profile', d1: 'main_goal', d2: 'barrier',
};

// Normalize localized/legacy values to canonical variant keys
const GOAL_ALIAS = { freiheit:'freedom', liberta:'freedom', 'liberta`':'freedom', wirkung:'impact', impatto:'impact', sicherheit:'security', sicurezza:'security', wachstum:'growth', crescita:'growth', 'mehr-energie':'growth', energy:'growth', energia:'growth', freedom:'freedom', impact:'impact', security:'security', growth:'growth' };
const PROFILE_ALIAS = { 'il-realizzatore':'feuer', 'il-connettore':'wind', 'l-ancora':'wasser', 'l-architetto':'fels', 'tipo-a':'feuer', 'tipo-b':'wind', 'tipo-c':'wasser', 'tipo-d':'fels', fire:'feuer', wind:'wind', water:'wasser', rock:'fels' };
const BARRIER_ALIAS = { 'fehlende-sicherheit':'confidence', 'manca-sicurezza':'confidence', 'fehlende-moglichkeit':'opportunity', 'fehlendes-umfeld':'community', 'manca-l-ambiente':'community', 'manca-un-sistema':'vehicle', vehicle:'vehicle', community:'community', confidence:'confidence', opportunity:'opportunity' };
const norm = (val, map) => { const v=(val||'').toLowerCase(); return map[v] || v; };

const rawLang = (getField('ac_last_form_language') || leadData.lang || 'de').toLowerCase().replace(/_.*/, '');
// Sprach-Gate: nur Sprachen mit echten Templates senden. DE, IT und EN sind aktiv.
// Seit 31.08.2026 auch hu, fr und ru — dort je Phase EINE generische Vorlage
// (Version A). Quelle der Texte: nurture/vorlagen/generisch-hu-fr-ru.js im
// Quiz-Repo. 🔴 Wer eine Sprache wieder abschaltet, nimmt sie NUR hier heraus;
// die Vorlagen bleiben stehen und lassen sich jederzeit wieder zuschalten.
const SUPPORTED_LANGS = ['de', 'it', 'en', 'hu', 'fr', 'ru'];
if (!SUPPORTED_LANGS.includes(rawLang)) {
  return { json: { skip: true, reason: 'unsupported_language:' + rawLang, lead_hash: leadData.lead_hash } };
}
const lang = rawLang;
const profile  = norm(getField('ac_last_profile') || leadData.profile_code, PROFILE_ALIAS);
const mainGoal = norm(getField('ac_last_main_goal') || leadData.main_aspiration, GOAL_ALIAS);
const barrier  = norm(getField('ac_last_barrier') || leadData.initial_barrier, BARRIER_ALIAS);

const dim = PHASE_DIM[leadData.phase];
let variantKey;
if (dim === 'main_goal') variantKey = mainGoal;
else if (dim === 'profile') variantKey = profile;
else if (dim === 'barrier') variantKey = barrier;
else variantKey = '_single';

// 🔴 Rueckfall auf die generische Fassung: Sprachen ohne Variantentiefe haben je
// Phase EINE Vorlage unter `_single`. Wer spaeter eine echte Variante nachtraegt,
// ueberschreibt damit genau diese Kombination — ohne Umstellung, ohne Deploy.
const emailId = EMAIL_MAP[leadData.phase]?.[lang]?.[variantKey]
  ?? EMAIL_MAP[leadData.phase]?.[lang]?.['_single'];
if (!emailId) {
  return { json: { skip: true, reason: 'no_email_id:' + leadData.phase + '/' + lang + '/' + variantKey, lead_hash: leadData.lead_hash } };
}

const coachEmail = getField('ac_berater_email') || '';
if (!coachEmail) {
  return { json: { skip: true, reason: 'no_coach_data', lead_hash: leadData.lead_hash } };
}
const cleanPart = (value) => String(value || '').trim().replace(/\s+/g, ' ');
const coachName = [cleanPart(getField('ac_berater_vorname')), cleanPart(getField('ac_berater_name'))].filter(Boolean).join(' ').trim();
const coachOrg = cleanPart(getField('ac_berater_org_display')) || 'Activecenter';
const coachDisplayName = [coachName, coachOrg].filter(Boolean).join(' - ') || 'Activecenter';

const newSentPhases = [...sentPhases, leadData.phase].join(',');

return { json: {
  skip: false,
  mauticContactId: c.id,
  emailId,
  phase: leadData.phase,
  lead_hash: leadData.lead_hash,
  email: leadData.email,
  berater_slug: leadData.berater_slug || '',
  language: lang,
  variantKey,
  newSentPhases,
  coachEmail,
  coachDisplayName,
  pilot_batch: leadData.pilot_batch || '',
  pilot_cap: leadData.pilot_cap || null,
  pilot_interval_hours: leadData.pilot_interval_hours || null,
}};
