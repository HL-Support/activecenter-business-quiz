const {
  generateLeadHash,
  getLeadFlags,
  handleOptions,
  isLeadHash,
  isUuid,
  readCookie,
  safeString,
  sendJson,
  setLeadCookie,
  shouldUseNewWriter,
  supabaseJson,
  supabaseRpc,
} = require('../server/lead-system');

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) return;

  if (req.method !== 'POST') {
    return sendJson(res, 405, { success: false, error: 'method_not_allowed' });
  }

  const body = req.body || {};
  const clientSeed = safeString(body.client_seed, 80);
  if (!isUuid(clientSeed)) {
    return sendJson(res, 400, { success: false, error: 'invalid_client_seed' });
  }

  try {
    const flags = await getLeadFlags();
    const routeIdentifier = clientSeed || readCookie(req, 'lead_hash');
    const useNewWriter = shouldUseNewWriter(flags, routeIdentifier);

    if (!useNewWriter) {
      return sendJson(res, 202, {
        success: true,
        enabled: false,
        flags,
      });
    }

    const refId = safeString(body.ref_id || body.member_id, 120);
    const memberId = safeString(body.member_id, 120);
    const requestedLeadHash = safeString(body.lead_hash, 96);

    if (isLeadHash(requestedLeadHash)) {
      const existingRows = await supabaseJson(
        `lead_state?lead_hash=eq.${encodeURIComponent(requestedLeadHash)}&select=lead_hash,utm_source,utm_medium,utm_campaign,utm_content,fbclid,fbc,fbp,event_source_url&limit=1`
      );
      const existingRow = Array.isArray(existingRows) ? existingRows[0] : null;
      const existingLeadHash = existingRow?.lead_hash || '';
      if (isLeadHash(existingLeadHash)) {
        const incomingUtm = {
          utm_source: safeString(body.utm_source, 120) || null,
          utm_medium: safeString(body.utm_medium, 120) || null,
          utm_campaign: safeString(body.utm_campaign, 120) || null,
          utm_content: safeString(body.utm_content, 180) || null,
          fbclid: safeString(body.fbclid, 500) || null,
          fbc: safeString(body.fbc, 500) || null,
          fbp: safeString(body.fbp, 120) || null,
          event_source_url: safeString(body.event_source_url, 1000) || null,
        };
        const utmPatch = {};
        for (const [key, value] of Object.entries(incomingUtm)) {
          if (value && !existingRow[key]) utmPatch[key] = value;
        }

        if (Object.keys(utmPatch).length > 0) {
          await supabaseJson(
            `lead_state?lead_hash=eq.${encodeURIComponent(existingLeadHash)}`,
            {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
              body: JSON.stringify(utmPatch),
            }
          ).catch((err) => console.warn('UTM backfill failed (non-critical):', err?.message));
        }
        setLeadCookie(res, existingLeadHash);
        return sendJson(res, 200, {
          success: true,
          enabled: true,
          lead_hash: existingLeadHash,
          adopted: true,
          flags,
        });
      }
    }

    const generatedLeadHash = isLeadHash(requestedLeadHash) ? requestedLeadHash : generateLeadHash();

    const rows = await supabaseRpc('init_lead', {
      p_client_seed: clientSeed,
      p_lead_hash: generatedLeadHash,
      p_member_id: memberId || null,
      p_ref_id: refId || null,
      p_ref_type:
        refId && memberId && refId !== memberId
          ? safeString(body.ref_type || 'referral_code', 40)
          : safeString(body.ref_type || 'member', 40),
      p_berater_slug: safeString(body.berater_slug || body.slug, 80) || null,
      p_source_app: safeString(body.source_app || 'business_leads_quiz', 80),
      p_funnel_key: safeString(body.funnel_key || body.funnel || 'business', 80),
      p_lang: safeString(body.lang, 10) || null,
      p_country: safeString(body.country, 5) || null,
      p_utm_source: safeString(body.utm_source, 120) || null,
      p_utm_medium: safeString(body.utm_medium, 120) || null,
      p_utm_campaign: safeString(body.utm_campaign, 120) || null,
      p_utm_content: safeString(body.utm_content, 180) || null,
      p_fbclid: safeString(body.fbclid, 500) || null,
      p_fbc: safeString(body.fbc, 500) || null,
      p_fbp: safeString(body.fbp, 120) || null,
      p_event_source_url: safeString(body.event_source_url, 1000) || null,
    });

    const leadHash = Array.isArray(rows) ? rows[0]?.lead_hash : rows?.lead_hash;
    if (!isLeadHash(leadHash)) {
      return sendJson(res, 502, { success: false, error: 'lead_hash_not_returned' });
    }

    setLeadCookie(res, leadHash);
    return sendJson(res, 200, {
      success: true,
      enabled: true,
      lead_hash: leadHash,
      flags,
    });
  } catch (error) {
    return sendJson(res, error.status || 500, {
      success: false,
      error: 'lead_init_failed',
      message: error.message,
    });
  }
};
