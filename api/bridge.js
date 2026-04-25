/**
 * Vercel Serverless Function: /api/bridge (Business Leads Quiz)
 * Proxies requests to the central PHP bridge (ac-reconnect.com) so the browser never needs the Bridge-Key.
 *
 * Public actions used by the quiz:
 * - lookup_subdomain
 * - write_analytics
 * - track_event
 * - forward_typeform_adapter (normalized quiz data -> central Typeform-compatible payload -> HL-support)
 * - generate_resume_token (creates JWT token plus short resume key for resume links)
 * - resolve_resume_token (verifies JWT token and resolves latest video progress)
 * - resolve_resume_key (resolves a short resume key to the latest video progress)
 */

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const BRIDGE_URL = process.env.BRIDGE_URL || 'https://ac-reconnect.com/db-bridge.php';
const BRIDGE_KEY = process.env.BRIDGE_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://xlpiisbozpgmemxhtivj.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const JWT_SECRET = process.env.JWT_SECRET;
const RESUME_KEY_SECRET = process.env.RESUME_KEY_SECRET || JWT_SECRET;
const TRACKING_SCHEMA_VERSION = 'ac_tracking_v1';

const TYPEFORM_TARGET = 'https://contacts.hl-support.biz/webhook/typeform';
const ALLOWED_ADAPTER_KEYS = new Set(['business_leads_quiz_v1']);

if (!SUPABASE_KEY) {
  console.error('ERROR: SUPABASE_SERVICE_KEY environment variable is not set');
}

function nowIso() {
  return new Date().toISOString();
}

function compactObject(record) {
  return Object.fromEntries(
    Object.entries(record || {}).filter(([, value]) => value !== undefined)
  );
}

function safeString(value, maxLength = 255) {
  if (value === null || value === undefined) return null;
  return String(value).slice(0, maxLength);
}

function hasTrackingValue(value) {
  return value !== undefined && value !== null && value !== '';
}

function firstTrackingValue(record, keys) {
  for (const key of keys) {
    if (hasTrackingValue(record?.[key])) return record[key];
  }
  return undefined;
}

function safeTrackingString(record, keys, maxLength = 255) {
  const value = firstTrackingValue(record, Array.isArray(keys) ? keys : [keys]);
  return value === undefined ? undefined : safeString(value, maxLength);
}

function safeInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : null;
}

function safeTrackingInteger(record, keys) {
  const value = firstTrackingValue(record, Array.isArray(keys) ? keys : [keys]);
  return value === undefined ? undefined : safeInteger(value);
}

function eventNameOf(payload) {
  return safeString(payload.event_name || payload.event || payload.name || 'unknown_event', 80);
}

function sessionHashOf(payload) {
  return safeString(payload.session_hash || payload.tracking_hash || payload.hash, 96);
}

function normalizeResumeSlug(slug) {
  const normalized = String(slug || '')
    .trim()
    .toLowerCase();
  return /^[a-z0-9_-]+$/.test(normalized) && normalized !== 'default' ? normalized : '';
}

function resumeBaseUrl(slug) {
  const normalizedSlug = normalizeResumeSlug(slug);
  return normalizedSlug
    ? `https://quiz.activecenter.info/${normalizedSlug}`
    : 'https://quiz.activecenter.info';
}

function longResumeUrl(token, slug) {
  return `${resumeBaseUrl(slug)}?resume=${encodeURIComponent(String(token || ''))}`;
}

function shortResumeUrl(key, slug) {
  return `${resumeBaseUrl(slug)}?r=${encodeURIComponent(String(key || ''))}`;
}

function toBase62(value) {
  const alphabet = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let number = BigInt(value);
  if (number === 0n) return '0';
  let output = '';
  while (number > 0n) {
    const remainder = Number(number % 62n);
    output = alphabet[remainder] + output;
    number /= 62n;
  }
  return output;
}

function fromBase62(value) {
  const alphabet = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let output = 0n;
  for (const char of String(value || '')) {
    const index = alphabet.indexOf(char);
    if (index < 0) throw new Error('Invalid base62 character');
    output = output * 62n + BigInt(index);
  }
  return output;
}

function resumeKeySignature(encodedId) {
  return crypto
    .createHmac('sha256', RESUME_KEY_SECRET || 'resume-fallback-secret')
    .update(`resume:${encodedId}`)
    .digest('base64url')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 6);
}

function createResumeKey(recordId) {
  const encodedId = toBase62(recordId);
  return `${encodedId}${resumeKeySignature(encodedId)}`;
}

function decodeResumeKey(key) {
  const raw = String(key || '').trim();
  if (raw.length <= 6) {
    throw new Error('Resume key too short');
  }

  const encodedId = raw.slice(0, -6);
  const signature = raw.slice(-6);
  if (resumeKeySignature(encodedId) !== signature) {
    throw new Error('Resume key signature mismatch');
  }

  return Number(fromBase62(encodedId));
}

async function supabaseRequest(path, options = {}) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return null;
  }

  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Supabase ${path} failed: ${response.status} ${text}`);
  }

  return response;
}

async function insertIgnoringDuplicates(table, conflictColumn, record) {
  await supabaseRequest(`${table}?on_conflict=${encodeURIComponent(conflictColumn)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Prefer: 'resolution=ignore-duplicates',
    },
    body: JSON.stringify(record),
  });
}

async function patchByEquals(table, column, value, record) {
  const encodedValue = encodeURIComponent(value);
  await supabaseRequest(`${table}?${column}=eq.${encodedValue}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(record),
  });
}

async function determineLastVideoStep(sessionHash) {
  if (!sessionHash) return 1;

  try {
    const queryPath = `quiz_sessions?hash=eq.${encodeURIComponent(sessionHash)}`;
    const sessionResponse = await supabaseRequest(queryPath);
    const sessions = await sessionResponse?.json?.();
    const session = Array.isArray(sessions) ? sessions[0] : null;

    if (!session) return 1;
    if (session.video3_max_pct && Number(session.video3_max_pct) > 0) return 3;
    if (session.video2_max_pct && Number(session.video2_max_pct) > 0) return 2;
    if (session.video1_max_pct && Number(session.video1_max_pct) > 0) return 1;
  } catch (error) {
    console.warn('Could not determine lastVideoStep, defaulting to 1:', error.message);
  }

  return 1;
}

async function ensureResumeSessionRecord({ sessionHash, email, leadHash, context }) {
  if (!sessionHash) return null;

  const existingResponse = await supabaseRequest(
    `tracking_sessions?session_hash=eq.${encodeURIComponent(sessionHash)}&select=id,session_hash,lead_hash,form_email&limit=1`
  );
  const existingRows = await existingResponse?.json?.();
  if (Array.isArray(existingRows) && existingRows[0]?.id) {
    const existing = existingRows[0];
    if ((!existing.form_email || !existing.lead_hash) && (email || leadHash)) {
      await patchByEquals(
        'tracking_sessions',
        'session_hash',
        sessionHash,
        compactObject({
          form_email: email || undefined,
          lead_hash: leadHash || undefined,
          updated_at: nowIso(),
        })
      );
    }
    return existing;
  }

  const upsertResponse = await supabaseRequest('tracking_sessions?on_conflict=session_hash', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify({
      session_hash: sessionHash,
      lead_hash: leadHash || null,
      source_app: 'business_leads_quiz',
      funnel: context || 'quiz',
      form_email: email || null,
      first_seen_at: nowIso(),
      created_at: nowIso(),
      updated_at: nowIso(),
    }),
  });

  const upsertRows = await upsertResponse?.json?.();
  return Array.isArray(upsertRows) ? upsertRows[0] || null : null;
}

async function resolveResumeRecordByKey(key) {
  const trackingSessionId = decodeResumeKey(key);
  const response = await supabaseRequest(
    `tracking_sessions?id=eq.${trackingSessionId}&select=id,session_hash,lead_hash,form_email,funnel&limit=1`
  );
  const rows = await response?.json?.();
  return Array.isArray(rows) ? rows[0] || null : null;
}

function trackingIdentity(payload) {
  const sessionHash = sessionHashOf(payload);
  return {
    sessionHash,
    leadHash: safeString(
      payload.lead_hash || (String(payload.hash || '').startsWith('qz_') ? payload.hash : ''),
      96
    ),
    memberId: safeString(payload.member_id || payload.herbalife_id || payload.ref_id, 80),
    slug: safeString(payload.berater_slug || payload.slug || payload.coach_slug, 80),
    sourceApp: safeString(payload.source_app || 'business_leads_quiz', 80),
    funnel: safeString(payload.funnel || 'business', 80),
  };
}

async function writeTrackingEvent(payload) {
  const identity = trackingIdentity(payload || {});
  if (!identity.sessionHash) return;

  const eventName = eventNameOf(payload);
  const eventAt = safeString(
    payload.event_at ||
      payload.visited_at ||
      payload.form_submitted_at ||
      payload.cta_clicked_at ||
      nowIso(),
    40
  );
  const base = {
    session_hash: identity.sessionHash,
    lead_hash: identity.leadHash,
    member_id: identity.memberId,
    berater_slug: identity.slug,
    source_app: identity.sourceApp,
    funnel: identity.funnel,
    lang: safeString(payload.lang, 10),
    country: safeString(payload.country, 5),
  };

  try {
    const trackingPayload = {
      ...payload,
      schema_version: safeString(payload.schema_version, 40) || TRACKING_SCHEMA_VERSION,
    };
    await insertIgnoringDuplicates(
      'tracking_sessions',
      'session_hash',
      compactObject({
        ...base,
        first_seen_at: eventAt,
        created_at: eventAt,
      })
    );

    // Determine if this is a resume session (first event with is_resume=true)
    const isResume = payload.is_resume === true || payload.is_resume === 'true';

    await patchByEquals(
      'tracking_sessions',
      'session_hash',
      identity.sessionHash,
      compactObject({
        ...base,
        is_resume: isResume ? true : undefined,
        last_event_at: eventAt,
        current_event: eventName,
        device_type: safeTrackingString(payload, 'device_type', 30),
        page_key: safeTrackingString(payload, ['page_key', 'pageKey'], 80),
        quiz_profile: safeTrackingString(payload, 'quiz_profile', 40),
        quiz_profile_name: safeTrackingString(payload, 'quiz_profile_name', 100),
        main_aspiration: safeTrackingString(payload, ['main_aspiration', 'quiz_aspiration'], 60),
        main_aspiration_label: safeTrackingString(
          payload,
          ['main_aspiration_label', 'quiz_aspiration_label'],
          120
        ),
        quiz_barrier: safeTrackingString(payload, 'quiz_barrier', 60),
        form_first_name: safeTrackingString(payload, 'form_first_name', 120),
        form_email: safeTrackingString(payload, 'form_email', 160),
        form_submitted_at: safeTrackingString(payload, 'form_submitted_at', 40),
        final_cta_type: safeTrackingString(payload, 'cta_type', 60),
        final_cta_clicked_at: safeTrackingString(payload, 'cta_clicked_at', 40),
        updated_at: nowIso(),
      })
    );

    await supabaseRequest('tracking_events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(
        compactObject({
          event_id: safeString(payload.event_id || generateId('evt', 28), 96),
          ...base,
          page_key: safeString(payload.page_key || payload.pageKey, 80),
          event_name: eventName,
          event_at: eventAt,
          step_index: safeInteger(payload.step_index),
          question_index: safeInteger(payload.question_index),
          video_step: safeInteger(payload.video_step),
          video_id: safeString(payload.video_id, 120),
          progress_percent: safeInteger(payload.progress_percent),
          unique_watched_percent: safeInteger(payload.unique_watched_percent),
          properties: trackingPayload,
        })
      ),
    });

    if (payload.video_step || String(eventName).startsWith('video_')) {
      const videoStep = safeInteger(payload.video_step);
      if (videoStep) {
        const videoKey = `${identity.sessionHash}::${videoStep}`;
        await insertIgnoringDuplicates(
          'tracking_video_progress',
          'session_video_key',
          compactObject({
            session_video_key: videoKey,
            session_hash: identity.sessionHash,
            lead_hash: identity.leadHash,
            video_step: videoStep,
            first_seen_at: eventAt,
          })
        );
        await patchByEquals(
          'tracking_video_progress',
          'session_video_key',
          videoKey,
          compactObject({
            ...base,
            session_video_key: videoKey,
            video_step: videoStep,
            video_id: safeTrackingString(payload, 'video_id', 120),
            duration_seconds: safeTrackingInteger(payload, 'duration_seconds'),
            unique_watched_seconds: safeTrackingInteger(payload, 'unique_watched_seconds'),
            unique_watched_percent: safeTrackingInteger(payload, [
              'unique_watched_percent',
              'progress_percent',
            ]),
            max_playhead_percent: safeTrackingInteger(payload, 'max_playhead_percent'),
            seek_count: safeTrackingInteger(payload, 'seek_count'),
            watched_ranges: hasTrackingValue(payload.watched_ranges)
              ? payload.watched_ranges
              : undefined,
            unlocked_at: eventName === 'video_unlocked' ? eventAt : undefined,
            completed_at: eventName === 'video_completed' ? eventAt : undefined,
            last_update_at: eventAt,
            updated_at: nowIso(),
          })
        );
      }
    }
  } catch (error) {
    console.error('Supabase tracking error:', error.message);
  }
}

async function writeToSupabaseAsync(payload) {
  try {
    if (!SUPABASE_URL || !SUPABASE_KEY) return;
    if (!payload.hash) return;

    await writeTrackingEvent(payload);

    const fullUpsertData = {
      hash: payload.hash,
      herbalife_id: payload.herbalife_id || null,
      berater_slug: payload.berater_slug || null,
      visited_at: payload.visited_at || null,
      country: payload.country || null,
      device_type: payload.device_type || null,
      lang: payload.lang || null,
      quiz_profile: payload.quiz_profile || null,
      quiz_profile_name: payload.quiz_profile_name || null,
      quiz_aspiration: payload.quiz_aspiration || null,
      quiz_barrier: payload.quiz_barrier || null,
      quiz_completed_at: payload.quiz_completed_at || null,
      form_first_name: payload.form_first_name || null,
      form_email: payload.form_email || null,
      form_submitted_at: payload.form_submitted_at || null,
      video1_watched_sec: payload.video1_watched_sec || 0,
      video1_max_pct: payload.video1_max_pct || 0,
      video1_last_update: payload.video1_last_update || null,
      video2_watched_sec: payload.video2_watched_sec || 0,
      video2_max_pct: payload.video2_max_pct || 0,
      video2_last_update: payload.video2_last_update || null,
      video3_watched_sec: payload.video3_watched_sec || 0,
      video3_max_pct: payload.video3_max_pct || 0,
      video3_last_update: payload.video3_last_update || null,
      cta_type: payload.cta_type || null,
      cta_clicked_at: payload.cta_clicked_at || null,
    };

    const partialUpdateData = {};
    const updateFields = [
      'hash',
      'herbalife_id',
      'berater_slug',
      'visited_at',
      'country',
      'device_type',
      'lang',
      'quiz_profile',
      'quiz_profile_name',
      'quiz_aspiration',
      'quiz_barrier',
      'quiz_completed_at',
      'form_first_name',
      'form_email',
      'form_submitted_at',
      'video1_watched_sec',
      'video1_max_pct',
      'video1_last_update',
      'video2_watched_sec',
      'video2_max_pct',
      'video2_last_update',
      'video3_watched_sec',
      'video3_max_pct',
      'video3_last_update',
      'cta_type',
      'cta_clicked_at',
    ];

    updateFields.forEach((field) => {
      if (field in payload) partialUpdateData[field] = payload[field];
    });

    const checkResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/quiz_sessions?hash=eq.${payload.hash}&select=id`,
      {
        method: 'GET',
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
      }
    );

    const existingRecords = await checkResponse.json();
    const recordExists = Array.isArray(existingRecords) && existingRecords.length > 0;

    await fetch(
      recordExists
        ? `${SUPABASE_URL}/rest/v1/quiz_sessions?hash=eq.${payload.hash}`
        : `${SUPABASE_URL}/rest/v1/quiz_sessions`,
      {
        method: recordExists ? 'PATCH' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
        body: JSON.stringify(recordExists ? partialUpdateData : fullUpsertData),
      }
    );
  } catch (error) {
    console.error('Supabase error:', error.message);
  }
}

async function proxyToBridge(body, forwardedFor, userAgent) {
  if (!BRIDGE_KEY) {
    return {
      status: 500,
      data: { error: 'BRIDGE_KEY not configured' },
    };
  }

  const response = await fetch(BRIDGE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Bridge-Key': BRIDGE_KEY,
      'X-Forwarded-For': forwardedFor || '',
      'User-Agent': userAgent || '',
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (_) {
    data = { raw: text };
  }
  return { status: response.status, data };
}

function generateId(prefix, length = 24) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = `${prefix}_`;
  while (out.length < prefix.length + 1 + length) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function normalizeLang(lang) {
  const value = String(lang || '')
    .toLowerCase()
    .trim();
  return ['de', 'it', 'en'].includes(value) ? value : 'de';
}

function normalizeAspiration(value) {
  const normalized = String(value || '')
    .toLowerCase()
    .trim();
  return ['freedom', 'impact', 'security', 'growth'].includes(normalized) ? normalized : '';
}

const BUSINESS_COPY = {
  de: {
    webhook_title: 'DE - Erfolgscode Quiz',
    result_badge: 'Dein Erfolgscode',
    main_aspiration_title: 'Dein Hauptziel',
    first_name_title: 'Vorname',
    email_title: 'E-Mail-Adresse',
    aspirations: {
      freedom: 'Freiheit',
      impact: 'Wirkung',
      security: 'Sicherheit',
      growth: 'Wachstum',
    },
    questions: [
      [
        'Was treibt dich morgens wirklich aus dem Bett?',
        [
          'Ziele & Fortschritt',
          'Menschen & Begegnungen',
          'Struktur & Ruhe',
          'Tiefe & Herausforderung',
        ],
      ],
      [
        'In einer Gruppe bist du meistens...',
        ['Der Richtungsgeber', 'Der Stimmungsmacher', 'Der Ruhepol', 'Der stille Beobachter'],
      ],
      [
        'Was bringt dich wirklich auf die Palme?',
        ['Blockaden & Zögerer', 'Schlechte Energie', 'Sinnlose Prozesse', 'Vermeidbare Fehler'],
      ],
      [
        'Was ist dir bei deiner Arbeit am wichtigsten?',
        ['Freiheit', 'Wirkung', 'Sicherheit', 'Wachstum'],
      ],
      [
        'Wie sieht dein ideales Leben in 3 Jahren aus?',
        ['Finanziell frei', 'Sinn & Erlebnisse', 'Ruhe & Familie', 'Expertise & System'],
      ],
      [
        'Was hält dich WIRKLICH davon ab, dieses Leben bereits heute zu leben?',
        ['Fehlendes System', 'Fehlendes Umfeld', 'Fehlende Sicherheit', 'Fehlende Möglichkeit'],
      ],
    ],
  },
  it: {
    webhook_title: 'IT - Quiz Codice del Successo',
    result_badge: 'Il tuo codice del successo',
    main_aspiration_title: 'Il tuo obiettivo principale',
    first_name_title: 'Nome',
    email_title: 'Indirizzo e-mail',
    aspirations: {
      freedom: 'Libertà',
      impact: 'Impatto',
      security: 'Sicurezza',
      growth: 'Crescita',
    },
    questions: [
      [
        'Cosa ti fa davvero alzare dal letto la mattina?',
        ['Obiettivi e progresso', 'Persone e incontri', 'Struttura e calma', 'Profondità e sfida'],
      ],
      [
        'In un gruppo sei di solito...',
        [
          'Chi dà la direzione',
          'Chi crea il clima',
          'Il punto di calma',
          "L'osservatore silenzioso",
        ],
      ],
      [
        'Cosa ti manda davvero fuori di testa?',
        ['Blocchi e indecisione', 'Energia negativa', 'Processi senza senso', 'Errori evitabili'],
      ],
      [
        'Che cosa è più importante per te nel lavoro?',
        ['Libertà', 'Impatto', 'Sicurezza', 'Crescita'],
      ],
      [
        'Come appare la tua vita ideale tra 3 anni?',
        [
          'Libero finanziariamente',
          'Senso ed esperienze',
          'Calma e famiglia',
          'Competenza e sistema',
        ],
      ],
      [
        'Che cosa ti impedisce DAVVERO di vivere già oggi quella vita?',
        ['Manca un sistema', "Manca l'ambiente", 'Manca sicurezza', "Manca l'opportunità"],
      ],
    ],
  },
  en: {
    webhook_title: 'EN - Success Code Quiz',
    result_badge: 'Your success code',
    main_aspiration_title: 'Your main goal',
    first_name_title: 'First name',
    email_title: 'Email address',
    aspirations: { freedom: 'Freedom', impact: 'Impact', security: 'Security', growth: 'Growth' },
    questions: [
      [
        'What really gets you out of bed in the morning?',
        ['Goals & progress', 'People & connection', 'Structure & calm', 'Depth & challenge'],
      ],
      [
        'In a group, you are usually...',
        ['The direction setter', 'The energizer', 'The calm center', 'The quiet observer'],
      ],
      [
        'What really gets on your nerves?',
        ['Blockers & hesitators', 'Bad energy', 'Pointless processes', 'Avoidable mistakes'],
      ],
      ['What matters most to you in your work?', ['Freedom', 'Impact', 'Security', 'Growth']],
      [
        'What does your ideal life look like in 3 years?',
        ['Financially free', 'Meaning & experiences', 'Calm & family', 'Expertise & system'],
      ],
      [
        'What is REALLY stopping you from living that life already today?',
        ['Missing system', 'Missing environment', 'Missing certainty', 'Missing opportunity'],
      ],
    ],
  },
};

const BUSINESS_SCHEMA = {
  formId: 'hC2yTcU8',
  ending: {
    id: 'QAt7gWPcX7mQ',
    ref: 'd158dcdf-4588-4111-b8ad-efff4f55e5c4',
    title: 'Success',
    type: 'thankyou_screen',
    properties: { show_button: false, share_icons: false, button_mode: 'reload' },
  },
  fields: [
    {
      key: 'profile',
      id: 'Vn4xYk2LmQ8p',
      ref: 'lead_profile_result',
      type: 'short_text',
      titleKey: 'result_badge',
    },
    {
      key: 'main_aspiration',
      id: 'Z2vy6Tx0Bg4D',
      ref: 'lead_main_aspiration',
      type: 'short_text',
      titleKey: 'main_aspiration_title',
    },
    {
      key: 'q1',
      id: 'R4nq8Lp2Ty6V',
      ref: 'lead_q1_drive',
      type: 'multiple_choice',
      titleIndex: 0,
      choices: [
        ['A1rK7pLm2Xq9', 'lead_q1_opt_1'],
        ['B2sL8qMn3Yr0', 'lead_q1_opt_2'],
        ['C3tM9rNo4Zs1', 'lead_q1_opt_3'],
        ['D4uN0sOp5At2', 'lead_q1_opt_4'],
      ],
    },
    {
      key: 'q2',
      id: 'S5or9Mq3Uz7W',
      ref: 'lead_q2_group',
      type: 'multiple_choice',
      titleIndex: 1,
      choices: [
        ['E5vO1tPq6Bu3', 'lead_q2_opt_1'],
        ['F6wP2uQr7Cv4', 'lead_q2_opt_2'],
        ['G7xQ3vRs8Dw5', 'lead_q2_opt_3'],
        ['H8yR4wSt9Ex6', 'lead_q2_opt_4'],
      ],
    },
    {
      key: 'q3',
      id: 'T6ps0Nr4Va8X',
      ref: 'lead_q3_trigger',
      type: 'multiple_choice',
      titleIndex: 2,
      choices: [
        ['I9zS5xTu0Fy7', 'lead_q3_opt_1'],
        ['J0aT6yUv1Gz8', 'lead_q3_opt_2'],
        ['K1bU7zVw2Ha9', 'lead_q3_opt_3'],
        ['L2cV8aWx3Ib0', 'lead_q3_opt_4'],
      ],
    },
    {
      key: 'q4',
      id: 'U7qt1Os5Wb9Y',
      ref: 'lead_q4_priority',
      type: 'multiple_choice',
      titleIndex: 3,
      choices: [
        ['M3dW9bXy4Jc1', 'lead_q4_opt_1'],
        ['N4eX0cYz5Kd2', 'lead_q4_opt_2'],
        ['O5fY1dZa6Le3', 'lead_q4_opt_3'],
        ['P6gZ2eAb7Mf4', 'lead_q4_opt_4'],
      ],
    },
    {
      key: 'q5',
      id: 'V8ru2Pt6Xc0Z',
      ref: 'lead_q5_future',
      type: 'multiple_choice',
      titleIndex: 4,
      choices: [
        ['Q7hA3fBc8Ng5', 'lead_q5_opt_1'],
        ['R8iB4gCd9Oh6', 'lead_q5_opt_2'],
        ['S9jC5hDe0Pi7', 'lead_q5_opt_3'],
        ['T0kD6iEf1Qj8', 'lead_q5_opt_4'],
      ],
    },
    {
      key: 'q6',
      id: 'W9sv3Qu7Yd1A',
      ref: 'lead_q6_barrier',
      type: 'multiple_choice',
      titleIndex: 5,
      choices: [
        ['U1lE7jFg2Rk9', 'lead_q6_opt_1'],
        ['V2mF8kGh3Sl0', 'lead_q6_opt_2'],
        ['W3nG9lHi4Tm1', 'lead_q6_opt_3'],
        ['X4oH0mIj5Un2', 'lead_q6_opt_4'],
      ],
    },
    {
      key: 'first_name',
      id: 'X0tw4Rv8Ze2B',
      ref: 'first_name',
      type: 'short_text',
      titleKey: 'first_name_title',
    },
    { key: 'email', id: 'Y1ux5Sw9Af3C', ref: 'email', type: 'email', titleKey: 'email_title' },
  ],
};

function adminBaseUrl(formId, token) {
  return `https://admin.typeform.com/form/${formId}/results?responseId=${token}`;
}

function answerUrl(formId, token, fieldId) {
  return `${adminBaseUrl(formId, token)}&fieldId=${fieldId}#responses`;
}

function fieldByKey(key) {
  return BUSINESS_SCHEMA.fields.find((field) => field.key === key);
}

function questionDefinitions(lang) {
  const copy = BUSINESS_COPY[lang] || BUSINESS_COPY.de;
  return copy.questions.map(([text, options], index) => ({
    text,
    options: options.map((label, optionIndex) => {
      if (index < 3) return { label, type: ['R', 'Y', 'G', 'B'][optionIndex] };
      if (index < 5)
        return { label, aspiration: ['freedom', 'impact', 'security', 'growth'][optionIndex] };
      return { label, barrier: ['vehicle', 'community', 'confidence', 'opportunity'][optionIndex] };
    }),
  }));
}

function matchOption(question, answer) {
  return (question.options || []).find(
    (option) =>
      (answer.label && option.label === answer.label) ||
      (answer.type && option.type === answer.type) ||
      (answer.aspiration && option.aspiration === answer.aspiration) ||
      (answer.barrier && option.barrier === answer.barrier)
  );
}

function appendTextVariable(variables, key, value) {
  if (!value || variables.some((variable) => variable && variable.key === key)) return variables;
  return [...variables, { key, type: 'text', text: value }];
}

function buildBusinessTypeformPayload(input) {
  const hidden = { ...((input && input.hidden) || {}) };
  const lang = normalizeLang(hidden.lang || input.lang);
  const copy = BUSINESS_COPY[lang] || BUSINESS_COPY.de;
  const questions = questionDefinitions(lang);
  const selectedAnswers = Array.isArray(input.selected_answers) ? input.selected_answers : [];
  const profile = input.profile && typeof input.profile === 'object' ? input.profile : {};
  const token = String(input.token || generateId('tf', 28).replace(/_/g, ''));
  const submittedAt = String(input.submitted_at || new Date().toISOString());
  const landedAt = String(input.landed_at || submittedAt);
  const eventId = String(input.event_id || generateId('evt', 24).replace(/_/g, '').toUpperCase());
  const derivedAspiration = selectedAnswers
    .map((answer) => normalizeAspiration(answer && answer.aspiration))
    .find(Boolean);
  const mainAspiration =
    normalizeAspiration(input.main_aspiration || hidden.main_aspiration) || derivedAspiration;
  const mainAspirationLabel = String(
    input.main_aspiration_label ||
      hidden.main_aspiration_label ||
      copy.aspirations[mainAspiration] ||
      ''
  ).trim();
  let variables = Array.isArray(input.variables) ? [...input.variables] : [];

  hidden.hash = hidden.hash || hidden.lead_hash || generateId('qz', 16);
  hidden.lang = lang;
  if (mainAspiration) {
    hidden.main_aspiration = mainAspiration;
    hidden.main_aspiration_label = mainAspirationLabel;
    variables = appendTextVariable(variables, 'main_aspiration', mainAspiration);
    variables = appendTextVariable(variables, 'main_aspiration_label', mainAspirationLabel);
  }

  const definitionFields = BUSINESS_SCHEMA.fields.map((field) => {
    const definition = {
      id: field.id,
      ref: field.ref,
      type: field.type,
      title: field.titleKey ? copy[field.titleKey] : field.title || '',
      properties: {},
    };
    if (Number.isInteger(field.titleIndex)) {
      const question = questions[field.titleIndex] || { text: '', options: [] };
      definition.title = question.text;
      definition.choices = (field.choices || []).map(([id, ref], index) => ({
        id,
        ref,
        label: question.options[index] ? question.options[index].label : `Option ${index + 1}`,
      }));
    }
    return definition;
  });

  const answers = [];
  const profileField = fieldByKey('profile');
  const profileLabel = String(profile.name || profile.animal || profile.code || '').trim();
  if (profileField && profileLabel) {
    answers.push({
      type: 'text',
      answer_url: answerUrl(BUSINESS_SCHEMA.formId, token, profileField.id),
      text: profileLabel,
      field: { id: profileField.id, type: profileField.type, ref: profileField.ref },
    });
  }

  const aspirationField = fieldByKey('main_aspiration');
  if (aspirationField && mainAspirationLabel) {
    answers.push({
      type: 'text',
      answer_url: answerUrl(BUSINESS_SCHEMA.formId, token, aspirationField.id),
      text: mainAspirationLabel,
      field: { id: aspirationField.id, type: aspirationField.type, ref: aspirationField.ref },
    });
  }

  selectedAnswers.forEach((answer, index) => {
    if (!answer || typeof answer !== 'object') return;
    const schemaField = fieldByKey(`q${index + 1}`);
    const question = questions[index];
    if (!schemaField || !question) return;
    const matchedOption = matchOption(question, answer);
    const matchedIndex = question.options.indexOf(matchedOption);
    const choiceDef = matchedIndex >= 0 ? schemaField.choices[matchedIndex] : null;
    if (!matchedOption || !choiceDef) return;

    answers.push({
      type: 'choice',
      answer_url: answerUrl(BUSINESS_SCHEMA.formId, token, schemaField.id),
      choice: { id: choiceDef[0], ref: choiceDef[1], label: matchedOption.label },
      field: { id: schemaField.id, type: schemaField.type, ref: schemaField.ref },
    });
  });

  const firstNameField = fieldByKey('first_name');
  if (firstNameField) {
    answers.push({
      type: 'text',
      answer_url: answerUrl(BUSINESS_SCHEMA.formId, token, firstNameField.id),
      text: String(input.first_name || '').trim(),
      field: { id: firstNameField.id, type: firstNameField.type, ref: firstNameField.ref },
    });
  }

  const emailField = fieldByKey('email');
  if (emailField) {
    answers.push({
      type: 'email',
      answer_url: answerUrl(BUSINESS_SCHEMA.formId, token, emailField.id),
      email: String(input.email || '').trim(),
      field: { id: emailField.id, type: emailField.type, ref: emailField.ref },
    });
  }

  return {
    event_id: eventId,
    event_type: 'form_response',
    form_response: {
      form_id: BUSINESS_SCHEMA.formId,
      token,
      response_url: `${adminBaseUrl(BUSINESS_SCHEMA.formId, token)}#responses`,
      landed_at: landedAt,
      submitted_at: submittedAt,
      hidden,
      calculated:
        input.calculated && typeof input.calculated === 'object' ? input.calculated : { score: 0 },
      variables,
      definition: {
        id: BUSINESS_SCHEMA.formId,
        title: copy.webhook_title,
        fields: definitionFields,
        endings: [BUSINESS_SCHEMA.ending],
        settings: { partial_responses_to_all_integrations: false },
      },
      answers,
      ending: { id: BUSINESS_SCHEMA.ending.id, ref: BUSINESS_SCHEMA.ending.ref },
    },
  };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { action, subdomain, payload, target, meta, adapter_key: adapterKey } = req.body || {};
  const forwardedFor = req.headers['x-forwarded-for'] || '';
  const userAgent = req.headers['user-agent'] || '';

  if (!action) {
    return res.status(400).json({ error: 'Missing action' });
  }

  if (action === 'track_event') {
    const trackData = payload || req.body;
    if (!trackData.session_hash && !trackData.hash) {
      return res.status(400).json({ error: 'Missing session_hash or hash' });
    }

    await writeToSupabaseAsync({
      ...trackData,
      hash: trackData.session_hash || trackData.hash || '',
      session_hash: trackData.session_hash || trackData.hash || '',
      herbalife_id: trackData.member_id || trackData.herbalife_id || '',
      berater_slug: trackData.berater_slug || trackData.slug || '',
      visited_at: trackData.visited_at || trackData.event_at || nowIso(),
      event_at: trackData.event_at || nowIso(),
    });

    return res
      .status(200)
      .json({ success: true, session_hash: trackData.session_hash || trackData.hash });
  }

  if (action === 'lookup_subdomain') {
    const result = await proxyToBridge(
      { action: 'lookup_subdomain', subdomain: subdomain || 'default' },
      forwardedFor,
      userAgent
    );
    return res.status(result.status).json(result.data);
  }

  if (action === 'write_analytics') {
    if (!payload || !payload.hash) {
      return res.status(400).json({ error: 'Missing hash' });
    }
    await writeToSupabaseAsync(payload);
    return res.status(200).json({ success: true, hash: payload.hash });
  }

  if (action === 'write_analytics_batch') {
    if (!payload || !Array.isArray(payload.events) || payload.events.length === 0) {
      return res.status(400).json({ error: 'Missing or empty events array' });
    }

    // Process events in parallel but with controlled concurrency
    const maxConcurrent = 5;
    const events = payload.events;
    let processed = 0;
    let failed = 0;

    for (let i = 0; i < events.length; i += maxConcurrent) {
      const batch = events.slice(i, i + maxConcurrent);
      const results = await Promise.allSettled(
        batch.map((event) =>
          writeToSupabaseAsync({
            ...event,
            hash: event.session_hash || event.hash || '',
            session_hash: event.session_hash || event.hash || '',
            herbalife_id: event.member_id || event.herbalife_id || '',
            berater_slug: event.berater_slug || event.slug || '',
            event_at: event.event_at || nowIso(),
          })
        )
      );

      results.forEach((result) => {
        if (result.status === 'fulfilled') {
          processed++;
        } else {
          failed++;
          console.warn('Batch event processing failed:', result.reason?.message);
        }
      });
    }

    return res.status(200).json({
      success: failed === 0,
      processed,
      failed,
      total: events.length,
    });
  }

  if (action === 'forward_typeform_adapter') {
    if (!ALLOWED_ADAPTER_KEYS.has(adapterKey)) {
      return res.status(400).json({ error: 'Unknown adapter_key' });
    }
    if (!payload) {
      return res.status(400).json({ error: 'Missing payload' });
    }
    if (target !== TYPEFORM_TARGET) {
      return res.status(400).json({ error: 'Invalid target' });
    }

    const webhookPayload = buildBusinessTypeformPayload(payload);
    const result = await proxyToBridge(
      {
        action: 'forward_webhook',
        payload: webhookPayload,
        target,
        meta,
      },
      forwardedFor,
      userAgent
    );
    result.data = { ...result.data, adapter_key: adapterKey, payload: webhookPayload };
    return res.status(result.status).json(result.data);
  }

  if (action === 'forward_webhook') {
    if (!payload) {
      return res.status(400).json({ error: 'Missing payload' });
    }
    if (target !== TYPEFORM_TARGET) {
      return res.status(400).json({ error: 'Invalid target' });
    }

    const result = await proxyToBridge(
      {
        action: 'forward_webhook',
        payload,
        target,
        meta,
      },
      forwardedFor,
      userAgent
    );
    return res.status(result.status).json(result.data);
  }

  if (action === 'generate_resume_token') {
    if (!JWT_SECRET) {
      console.error('ERROR: JWT_SECRET environment variable is not set');
      return res.status(500).json({ error: 'Server configuration error' });
    }
    if (!payload || !payload.sessionHash || !payload.email) {
      return res.status(400).json({ error: 'Missing sessionHash or email' });
    }

    const lastVideoStep = await determineLastVideoStep(payload.sessionHash);
    let resumeSession = null;
    try {
      resumeSession = await ensureResumeSessionRecord({
        sessionHash: payload.sessionHash,
        email: safeString(payload.email, 255),
        leadHash: safeString(payload.leadHash || payload.lead_hash, 96),
        context: safeString(payload.context || 'quiz', 80),
      });
    } catch (error) {
      console.warn('Could not create short resume key, falling back to JWT link:', error.message);
    }

    const token = jwt.sign(
      {
        sessionHash: payload.sessionHash,
        email: payload.email,
        context: payload.context || 'quiz',
        lastVideoStep: lastVideoStep,
      },
      JWT_SECRET,
      { algorithm: 'HS256' }
    );

    const resumeSlug = safeString(payload.slug || payload.berater_slug || payload.coach_slug, 80);
    const shortKey = resumeSession?.id ? createResumeKey(resumeSession.id) : null;
    const shortUrl = shortKey ? shortResumeUrl(shortKey, resumeSlug) : null;

    return res.status(200).json({
      success: true,
      token,
      lastVideoStep,
      shortKey,
      shortUrl,
      resumeUrl: shortUrl || longResumeUrl(token, resumeSlug),
    });
  }

  if (action === 'resolve_resume_token') {
    if (!JWT_SECRET) {
      console.error('ERROR: JWT_SECRET environment variable is not set');
      return res.status(500).json({ error: 'Server configuration error' });
    }
    if (!payload || !payload.token) {
      return res.status(400).json({ error: 'Missing token' });
    }

    let decoded;
    try {
      decoded = jwt.verify(payload.token, JWT_SECRET, { algorithms: ['HS256'] });
    } catch (error) {
      return res.status(400).json({ error: 'Invalid resume token', details: error.message });
    }

    const sessionHash = safeString(decoded.sessionHash, 96);
    const email = safeString(decoded.email, 255);
    const context = safeString(decoded.context || 'quiz', 32) || 'quiz';

    if (!sessionHash || !email) {
      return res.status(400).json({ error: 'Resume token missing required fields' });
    }

    const lastVideoStep = await determineLastVideoStep(sessionHash);

    return res.status(200).json({
      success: true,
      sessionHash,
      email,
      context,
      lastVideoStep,
    });
  }

  if (action === 'resolve_resume_key') {
    if (!payload || !payload.key) {
      return res.status(400).json({ error: 'Missing key' });
    }

    let resumeRecord;
    try {
      resumeRecord = await resolveResumeRecordByKey(payload.key);
    } catch (error) {
      return res.status(400).json({ error: 'Invalid resume key', details: error.message });
    }

    if (!resumeRecord?.session_hash) {
      return res.status(404).json({ error: 'Resume key not found' });
    }

    const sessionHash = safeString(resumeRecord.session_hash, 96);
    let email = safeString(resumeRecord.form_email, 255);
    if (!email) {
      try {
        const quizResponse = await supabaseRequest(
          `quiz_sessions?hash=eq.${encodeURIComponent(sessionHash)}&select=form_email&limit=1`
        );
        const quizRows = await quizResponse?.json?.();
        email = safeString(Array.isArray(quizRows) ? quizRows[0]?.form_email : null, 255);
      } catch (error) {
        console.warn('Could not load form_email for resume key:', error.message);
      }
    }

    const lastVideoStep = await determineLastVideoStep(sessionHash);

    return res.status(200).json({
      success: true,
      sessionHash,
      email,
      context: safeString(resumeRecord.funnel || 'quiz', 32) || 'quiz',
      lastVideoStep,
    });
  }

  if (action === 'get_funnel_metrics') {
    const slug = payload?.berater_slug || payload?.slug;
    if (!slug) {
      return res.status(400).json({ error: 'Missing berater_slug' });
    }

    try {
      const slugEncoded = encodeURIComponent(String(slug).toLowerCase());
      const response = await supabaseRequest(
        `v_funnel_analysis?berater_slug=eq.${slugEncoded}&select=*`
      );
      const rows = await response?.json?.();
      const metrics = Array.isArray(rows) ? rows[0] : null;

      if (!metrics) {
        return res.status(200).json({
          success: true,
          data: {
            berater_slug: slug,
            step_1_starts: 0,
            step_2_questions: 0,
            step_form_submits: 0,
            completions: 0,
            completion_rate_pct: 0,
          },
        });
      }

      return res.status(200).json({ success: true, data: metrics });
    } catch (error) {
      console.error('get_funnel_metrics error:', error.message);
      return res.status(500).json({ error: 'Failed to fetch funnel metrics' });
    }
  }

  if (action === 'get_resume_metrics') {
    const slug = payload?.berater_slug || payload?.slug;
    if (!slug) {
      return res.status(400).json({ error: 'Missing berater_slug' });
    }

    try {
      const slugEncoded = encodeURIComponent(String(slug).toLowerCase());
      const response = await supabaseRequest(
        `v_resume_metrics?berater_slug=eq.${slugEncoded}&select=*`
      );
      const rows = await response?.json?.();
      const metrics = Array.isArray(rows) ? rows[0] : null;

      if (!metrics) {
        return res.status(200).json({
          success: true,
          data: {
            berater_slug: slug,
            total_resume_sessions: 0,
            resume_completions: 0,
            resume_completion_rate_pct: 0,
          },
        });
      }

      return res.status(200).json({ success: true, data: metrics });
    } catch (error) {
      console.error('get_resume_metrics error:', error.message);
      return res.status(500).json({ error: 'Failed to fetch resume metrics' });
    }
  }

  if (action === 'get_completion_metrics') {
    const slug = payload?.berater_slug || payload?.slug;
    if (!slug) {
      return res.status(400).json({ error: 'Missing berater_slug' });
    }

    try {
      const slugEncoded = encodeURIComponent(String(slug).toLowerCase());
      const response = await supabaseRequest(
        `v_completion_metrics?berater_slug=eq.${slugEncoded}&select=*`
      );
      const rows = await response?.json?.();
      const metrics = Array.isArray(rows) ? rows[0] : null;

      if (!metrics) {
        return res.status(200).json({
          success: true,
          data: {
            berater_slug: slug,
            total_starts: 0,
            total_completions: 0,
            completion_rate_pct: 0,
          },
        });
      }

      return res.status(200).json({ success: true, data: metrics });
    } catch (error) {
      console.error('get_completion_metrics error:', error.message);
      return res.status(500).json({ error: 'Failed to fetch completion metrics' });
    }
  }

  return res.status(400).json({ error: 'Unknown action' });
};
