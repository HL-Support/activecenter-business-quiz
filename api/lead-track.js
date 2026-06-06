const {
  eventUid,
  getLeadFlags,
  handleOptions,
  hashEmail,
  isLeadHash,
  normalizeEmail,
  normalizeLanguage,
  nowIso,
  safeInteger,
  safeNumber,
  safeString,
  sendJson,
  shouldUseNewWriter,
  supabaseRequest,
  supabaseRpc,
} = require('../server/lead-system');

function eventAtOf(payload) {
  return safeString(
    payload.event_at ||
      payload.visited_at ||
      payload.form_submitted_at ||
      payload.cta_clicked_at ||
      nowIso(),
    40
  );
}

function normalizeEventName(eventName) {
  const name = safeString(eventName, 100);
  if (name === 'question_answered') return 'quiz_answer';
  if (name === 'cta_click') return 'cta_clicked';
  return name;
}

const ASPIRATION_LABELS = {
  de: {
    freedom: 'Freiheit',
    impact: 'Wirkung',
    security: 'Sicherheit',
    growth: 'Wachstum',
  },
  it: {
    freedom: 'Libertà',
    impact: 'Impatto',
    security: 'Sicurezza',
    growth: 'Crescita',
  },
  en: {
    freedom: 'Freedom',
    impact: 'Impact',
    security: 'Security',
    growth: 'Growth',
  },
  fr: {
    freedom: 'Liberté',
    impact: 'Impact',
    security: 'Sécurité',
    growth: 'Croissance',
  },
  ru: {
    freedom: 'Свобода',
    impact: 'Влияние',
    security: 'Стабильность',
    growth: 'Рост',
  },
};

function normalizeAspiration(value) {
  const key = safeString(value, 80).toLowerCase();
  return ['freedom', 'impact', 'security', 'growth'].includes(key) ? key : '';
}

const BUSINESS_PROFILE_MAP = {
  a: { code: 'feuer', label: 'Der Macher' },
  r: { code: 'feuer', label: 'Der Macher' },
  'typ-a': { code: 'feuer', label: 'Der Macher' },
  'type-a': { code: 'feuer', label: 'Der Macher' },
  feuer: { code: 'feuer', label: 'Der Macher' },
  macher: { code: 'feuer', label: 'Der Macher' },
  'der-macher': { code: 'feuer', label: 'Der Macher' },
  realizzatore: { code: 'feuer', label: 'Der Macher' },
  'il-realizzatore': { code: 'feuer', label: 'Der Macher' },
  doer: { code: 'feuer', label: 'Der Macher' },
  b: { code: 'wind', label: 'Der Netzwerker' },
  y: { code: 'wind', label: 'Der Netzwerker' },
  'typ-b': { code: 'wind', label: 'Der Netzwerker' },
  'type-b': { code: 'wind', label: 'Der Netzwerker' },
  wind: { code: 'wind', label: 'Der Netzwerker' },
  netzwerker: { code: 'wind', label: 'Der Netzwerker' },
  'der-netzwerker': { code: 'wind', label: 'Der Netzwerker' },
  connettore: { code: 'wind', label: 'Der Netzwerker' },
  'il-connettore': { code: 'wind', label: 'Der Netzwerker' },
  connector: { code: 'wind', label: 'Der Netzwerker' },
  c: { code: 'wasser', label: 'Der Anker' },
  g: { code: 'wasser', label: 'Der Anker' },
  'typ-c': { code: 'wasser', label: 'Der Anker' },
  'type-c': { code: 'wasser', label: 'Der Anker' },
  wasser: { code: 'wasser', label: 'Der Anker' },
  anker: { code: 'wasser', label: 'Der Anker' },
  'der-anker': { code: 'wasser', label: 'Der Anker' },
  ancora: { code: 'wasser', label: 'Der Anker' },
  'l-ancora': { code: 'wasser', label: 'Der Anker' },
  anchor: { code: 'wasser', label: 'Der Anker' },
  d: { code: 'fels', label: 'Der Architekt' },
  'typ-d': { code: 'fels', label: 'Der Architekt' },
  'type-d': { code: 'fels', label: 'Der Architekt' },
  fels: { code: 'fels', label: 'Der Architekt' },
  architekt: { code: 'fels', label: 'Der Architekt' },
  'der-architekt': { code: 'fels', label: 'Der Architekt' },
  architetto: { code: 'fels', label: 'Der Architekt' },
  'l-architetto': { code: 'fels', label: 'Der Architekt' },
  architect: { code: 'fels', label: 'Der Architekt' },
};

function normalizeBusinessProfile(...values) {
  for (const value of values) {
    const key = safeString(value, 180)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    if (key && BUSINESS_PROFILE_MAP[key]) return BUSINESS_PROFILE_MAP[key];
  }
  return null;
}

function localizedAspirationLabel(lang, aspiration, fallback) {
  const key = normalizeAspiration(aspiration);
  const labels = ASPIRATION_LABELS[normalizeLanguage(lang)] || ASPIRATION_LABELS.de;
  return (key && labels[key]) || safeString(fallback, 180) || null;
}

function normalizePersonName(value, maxLength = 120) {
  const text = safeString(value, maxLength);
  if (!text) return text || '';
  const normalized = text.trim().replace(/\s+/g, ' ');
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

async function insertLeadEvent({ leadHash, eventName, eventAt, payload }) {
  const record = {
    event_uid: eventUid(payload),
    lead_hash: leadHash,
    event_name: eventName,
    event_at: eventAt,
    member_id: safeString(payload.member_id || payload.herbalife_id, 120) || null,
    ref_id: safeString(payload.ref_id || payload.member_id || payload.herbalife_id, 120) || null,
    berater_slug: safeString(payload.berater_slug || payload.slug, 80) || null,
    source_app: safeString(payload.source_app || 'business_leads_quiz', 80),
    funnel_key: safeString(payload.funnel_key || payload.funnel || 'business', 80),
    video_step: payload.video_step ? safeInteger(payload.video_step) : null,
    question_ref: safeString(payload.question_ref, 120) || null,
    unique_watched_percent:
      payload.unique_watched_percent === undefined
        ? null
        : Math.max(0, Math.min(100, safeNumber(payload.unique_watched_percent))),
    playhead_percent:
      payload.max_playhead_percent === undefined && payload.playhead_percent === undefined
        ? null
        : Math.max(0, Math.min(100, safeNumber(payload.max_playhead_percent ?? payload.playhead_percent))),
    payload,
  };

  await supabaseRequest('lead_events?on_conflict=event_uid', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Prefer: 'resolution=ignore-duplicates,return=minimal',
    },
    body: JSON.stringify(record),
  });
}

async function patchLeadState(leadHash, patch) {
  await supabaseRequest(`lead_state?lead_hash=eq.${encodeURIComponent(leadHash)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(patch),
  });
}

async function enqueueSync(leadHash, syncType, contextData) {
  await supabaseRpc('enqueue_lead_sync', {
    p_lead_hash: leadHash,
    p_sync_type: syncType,
    p_context_data: contextData || {},
  });
}

async function handleSideEffects(leadHash, eventName, eventAt, payload) {
  const lang = normalizeLanguage(payload.lang);

  if (eventName === 'quiz_answer') {
    await supabaseRpc('upsert_answer_current', {
      p_lead_hash: leadHash,
      p_question_ref: safeString(
        payload.question_ref || payload.question_id || payload.question_key,
        120
      ),
      p_question_index: payload.question_index === undefined ? null : safeInteger(payload.question_index),
      p_question_text: safeString(payload.question_text, 500) || null,
      p_answer_ref: safeString(payload.answer_ref || payload.answer_id || payload.answer_type, 120) || null,
      p_answer_text: safeString(payload.answer_text || payload.answer_label, 500) || null,
      p_answer_value: safeString(payload.answer_value || payload.value || payload.answer_aspiration || payload.answer_barrier, 500) || null,
      p_profile_delta: payload.profile_delta || {},
      p_lang: lang,
      p_answered_at: eventAt,
    });
    await patchLeadState(leadHash, { last_event_at: eventAt });
    return;
  }

  if (eventName === 'quiz_result') {
    const mainAspiration = normalizeAspiration(payload.main_aspiration || payload.quiz_aspiration);
    const normalizedProfile = normalizeBusinessProfile(
      payload.profile_code,
      payload.quiz_profile,
      payload.profile_label,
      payload.quiz_profile_name
    );
    await patchLeadState(leadHash, {
      profile_code: normalizedProfile?.code || null,
      profile_label: normalizedProfile?.label || null,
      main_aspiration: mainAspiration || null,
      main_aspiration_label: localizedAspirationLabel(
        lang,
        mainAspiration,
        payload.main_aspiration_label || payload.quiz_aspiration_label
      ),
      initial_barrier: safeString(payload.initial_barrier || payload.quiz_barrier, 120) || null,
      lifecycle_stage: 'profile_known',
      last_event_at: eventAt,
    });
    return;
  }

  if (eventName === 'form_submitted') {
    await patchLeadState(leadHash, {
      first_name: normalizePersonName(payload.first_name || payload.form_first_name, 120) || null,
      email: safeString(payload.email || payload.form_email, 180) || null,
      email_normalized: normalizeEmail(payload.email || payload.form_email) || null,
      email_hash: hashEmail(payload.email || payload.form_email) || null,
      phone: safeString(payload.phone, 80) || null,
      form_submitted_at: safeString(payload.submitted_at || payload.form_submitted_at || eventAt, 40),
      utm_source: safeString(payload.utm_source, 120) || null,
      utm_medium: safeString(payload.utm_medium, 120) || null,
      utm_campaign: safeString(payload.utm_campaign, 180) || null,
      utm_content: safeString(payload.utm_content, 180) || null,
      fbclid: safeString(payload.fbclid, 500) || null,
      fbc: safeString(payload.fbc, 500) || null,
      fbp: safeString(payload.fbp, 120) || null,
      event_source_url: safeString(payload.event_source_url, 1000) || null,
      lifecycle_stage: 'contact_known',
      lang,
      last_event_at: eventAt,
    });
    await enqueueSync(leadHash, 'mysql_initial_rank', {
      rank: 0,
      lang,
      reason: 'form_submitted',
    });
    return;
  }

  if (eventName === 'video_progress' || eventName === 'video_unlocked' || eventName === 'video_completed') {
    const rankRows = await supabaseRpc('upsert_video_progress_monotonic', {
      p_lead_hash: leadHash,
      p_video_step: safeInteger(payload.video_step),
      p_video_id: safeString(payload.video_id, 120) || null,
      p_unique_watched_percent: Math.max(
        0,
        Math.min(100, safeNumber(payload.unique_watched_percent ?? payload.progress_percent))
      ),
      p_playhead_percent: Math.max(
        0,
        Math.min(100, safeNumber(payload.max_playhead_percent ?? payload.playhead_percent))
      ),
      p_unique_watched_seconds: safeInteger(payload.unique_watched_seconds),
      p_event_at: eventAt,
      p_lang: lang,
    });
    const rankResult = Array.isArray(rankRows) ? rankRows[0] : rankRows;
    if (rankResult?.rank_changed === true && safeInteger(rankResult.completed_rank) >= 3) {
      await enqueueSync(leadHash, 'coach_hot_lead_email', {
        lang,
        rank: safeInteger(rankResult.completed_rank),
        reason: 'all_videos_completed',
        event_at: eventAt,
        video_step: safeInteger(payload.video_step),
      });
    }
    return;
  }

  if (eventName === 'result_cta_click') {
    await patchLeadState(leadHash, { last_event_at: eventAt });
    return;
  }

  if (eventName === 'cta_clicked') {
    await patchLeadState(leadHash, {
      cta_type: safeString(payload.cta_type, 80) || null,
      cta_clicked_at: safeString(payload.cta_clicked_at || eventAt, 40),
      lifecycle_stage: 'cta_clicked',
      last_event_at: eventAt,
    });
    return;
  }

  await patchLeadState(leadHash, { last_event_at: eventAt });
}

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) return;

  if (req.method !== 'POST') {
    return sendJson(res, 405, { success: false, error: 'method_not_allowed' });
  }

  const body = req.body || {};
  const payload = body.payload || body;
  const leadHash = safeString(body.lead_hash || payload.lead_hash || payload.hash, 96);
  const eventName = normalizeEventName(body.event_name || payload.event_name || payload.event);

  if (!isLeadHash(leadHash)) {
    return sendJson(res, 400, { success: false, error: 'invalid_lead_hash' });
  }

  if (!eventName) {
    return sendJson(res, 400, { success: false, error: 'missing_event_name' });
  }

  try {
    const flags = await getLeadFlags();
    if (!shouldUseNewWriter(flags, leadHash)) {
      return sendJson(res, 202, {
        success: true,
        enabled: false,
        skipped: true,
        flags,
      });
    }

    const eventAt = eventAtOf(payload);
    await insertLeadEvent({ leadHash, eventName, eventAt, payload: { ...payload, lead_hash: leadHash } });
    await handleSideEffects(leadHash, eventName, eventAt, payload);

    return sendJson(res, 200, {
      success: true,
      enabled: true,
      lead_hash: leadHash,
    });
  } catch (error) {
    return sendJson(res, error.status || 500, {
      success: false,
      error: 'lead_track_failed',
      message: error.message,
    });
  }
};
