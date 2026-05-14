const crypto = require('crypto');
const { Buffer } = require('buffer');

const {
  getLeadFlags,
  handleOptions,
  isLeadHash,
  safeInteger,
  safeString,
  sendJson,
  supabaseRpc,
} = require('../server/lead-system');

const N8N_UPDATE_RESULT_URL = process.env.N8N_UPDATE_RESULT_URL;
const N8N_UPDATE_RESULT_SECRET = String(process.env.N8N_UPDATE_RESULT_SECRET || '').trim();
const WORKER_SECRET = process.env.LEAD_OUTBOX_WORKER_SECRET || process.env.BRIDGE_KEY;

const MYSQL_SYNC_TYPES = new Set(['mysql_initial_rank', 'mysql_rank_update']);

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
      'Noch kein Infovideo vollstaendig angeschaut',
      '1/3 Infovideos vollstaendig angeschaut',
      '2/3 Infovideos vollstaendig angeschaut',
      'Alle 3 Infovideos vollstaendig angeschaut',
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
      'Aucune video informative regardee entierement',
      '1/3 videos informatives regardees entierement',
      '2/3 videos informatives regardees entierement',
      'Les 3 videos informatives regardees entierement',
    ],
    ru: [
      'Informatsionnye video eshche ne prosmotreny polnostyu',
      '1/3 informatsionnyh video prosmotreno polnostyu',
      '2/3 informatsionnyh video prosmotreno polnostyu',
      'Vse 3 informatsionnyh video prosmotreny polnostyu',
    ],
  };

  return (labels[normalizedLang] || labels.de)[normalizedRank];
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

async function processJob(job, workerId) {
  try {
    if (!MYSQL_SYNC_TYPES.has(job.sync_type)) {
      throw new Error(`unsupported_sync_type:${job.sync_type}`);
    }

    const responseData = await callN8nUpdateResult(job);
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
