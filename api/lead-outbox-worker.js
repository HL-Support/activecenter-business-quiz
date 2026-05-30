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

const N8N_UPDATE_RESULT_URL = process.env.N8N_UPDATE_RESULT_URL;
const N8N_UPDATE_RESULT_SECRET = String(process.env.N8N_UPDATE_RESULT_SECRET || '').trim();
const WORKER_SECRET = process.env.LEAD_OUTBOX_WORKER_SECRET || process.env.BRIDGE_KEY;
const BRIDGE_URL = process.env.BRIDGE_URL || 'https://ac-reconnect.com/db-bridge.php';
const BRIDGE_KEY = process.env.BRIDGE_KEY;
const POSTMARK_SERVER_TOKEN = process.env.POSTMARK_SERVER_TOKEN;
const POSTMARK_FROM = process.env.POSTMARK_FROM || 'Activecenter-Support <mail@mail.hl-support.biz>';
const POSTMARK_MESSAGE_STREAM = process.env.POSTMARK_MESSAGE_STREAM || 'outbound';
const HOT_LEAD_OUTBOX_EMAIL_ENABLED = process.env.HOT_LEAD_OUTBOX_EMAIL_ENABLED === '1';

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

function hasContactData(lead) {
  return !!(
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
  let data = {};
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
  const lang = normalizeLanguage(lead.lang || job.context_data?.lang || 'de');
  const firstName = safeString(lead.first_name, 120) || 'Interessent';
  const email = safeString(lead.email || lead.email_normalized, 180) || '-';
  const coachFirstName = safeString(coach?.first_name || coach?.name, 80) || 'Hallo';
  const profile = safeString(lead.profile_label || lead.profile_code, 180) || '-';
  const aspiration = safeString(lead.main_aspiration_label, 180) || '-';
  const barrier = safeString(lead.initial_barrier, 180) || '-';
  const completedAt =
    safeString(lead.video3_completed_at || job.context_data?.event_at, 80) || new Date().toISOString();
  const source = `business.activecenter.info/${safeString(lead.berater_slug, 80) || ''}`;
  const subjectByLang = {
    de: `Hot Lead: ${firstName} hat alle 3 Videos angesehen`,
    it: `Hot lead: ${firstName} ha guardato tutti e 3 i video`,
    en: `Hot lead: ${firstName} watched all 3 videos`,
    fr: `Hot lead : ${firstName} a regarde les 3 videos`,
    ru: `Hot lead: ${firstName} prosmotrel vse 3 video`,
  };
  const introByLang = {
    de: 'ein Kontakt hat alle drei Info-Videos vollstaendig angeschaut. Das ist ein klares Hot-Lead-Signal.',
    it: 'un contatto ha guardato tutti e tre i video informativi. Questo e un chiaro segnale hot lead.',
    en: 'a contact watched all three information videos. This is a clear hot-lead signal.',
    fr: 'un contact a regarde les trois videos informatives. C est un signal hot lead clair.',
    ru: 'kontakt prosmotrel vse tri informatsionnyh video. Eto yavnyj signal hot lead.',
  };
  const rows = [
    ['Name', firstName],
    ['E-Mail', email],
    ['Typ', profile],
    ['Wunsch', aspiration],
    ['Barriere', barrier],
    ['Video-Status', '3/3 vollstaendig angeschaut'],
    ['Abgeschlossen am', completedAt],
    ['Quelle', source],
  ];
  const htmlRows = rows
    .map(([label, value]) => `<tr><td style="padding:10px 0;border-bottom:1px solid #e6e6e6;font-weight:700;width:170px;">${escapeHtml(label)}</td><td style="padding:10px 0;border-bottom:1px solid #e6e6e6;">${escapeHtml(value)}</td></tr>`)
    .join('');
  const html = `<!doctype html><html><body style="margin:0;background:#f0f0f0;font-family:Arial,Helvetica,sans-serif;color:#212529;"><table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr><td align="center" style="padding:32px 12px;"><table width="570" cellpadding="0" cellspacing="0" role="presentation" style="max-width:570px;width:100%;background:#ffffff;border-radius:4px;overflow:hidden;"><tr><td style="background:#212529;padding:16px 24px;"><strong style="color:#ffffff;font-size:18px;">Activecenter</strong></td></tr><tr><td style="padding:32px 40px;"><h1 style="margin:0 0 20px;font-size:28px;line-height:1.3;">${escapeHtml(subjectByLang[lang] || subjectByLang.de)}</h1><p style="font-size:16px;line-height:1.65;margin:0 0 16px;">Hallo ${escapeHtml(coachFirstName)},</p><p style="font-size:16px;line-height:1.65;margin:0 0 24px;">${escapeHtml(introByLang[lang] || introByLang.de)}</p><table style="width:100%;border-collapse:collapse;">${htmlRows}</table></td></tr></table></td></tr></table></body></html>`;
  const text = [
    subjectByLang[lang] || subjectByLang.de,
    '',
    `Hallo ${coachFirstName},`,
    '',
    introByLang[lang] || introByLang.de,
    '',
    ...rows.map(([label, value]) => `${label}: ${value}`),
    '',
    'Quiz-Antworten:',
    answerSummary(answers),
  ].join('\n');

  return {
    From: POSTMARK_FROM,
    To: coach.email,
    Subject: subjectByLang[lang] || subjectByLang.de,
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

  const lead = await loadLeadFull(leadHash);
  if (!lead) {
    throw new Error(`lead_not_found:${leadHash}`);
  }
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
