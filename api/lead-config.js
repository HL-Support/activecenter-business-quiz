const { getLeadFlags, handleOptions, sendJson } = require('../server/lead-system');

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) return;

  if (req.method !== 'GET') {
    return sendJson(res, 405, { success: false, error: 'method_not_allowed' });
  }

  try {
    const flags = await getLeadFlags();
    return sendJson(res, 200, { success: true, flags });
  } catch (error) {
    return sendJson(res, error.status || 500, {
      success: false,
      error: 'lead_config_failed',
      message: error.message,
    });
  }
};
