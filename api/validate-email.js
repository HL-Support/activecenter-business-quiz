/**
 * Vercel Serverless Function: /api/validate-email
 * Validates email address using ZeroBounce API
 *
 * POST /api/validate-email
 * { email: "test@example.com" }
 *
 * Response: { valid: true/false, reason: "...", status: "...", sub_status: "..." }
 */

const ZEROBOUNCE_API_KEY = process.env.ZEROBOUNCE_API_KEY;
const ZEROBOUNCE_URL = 'https://api.zerobounce.net/v2/validate';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email } = req.body;

  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Email is required' });
  }

  // Basic format check
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(200).json({
      valid: false,
      reason: 'invalid_format',
      status: 'invalid',
      sub_status: '',
    });
  }

  try {
    if (!ZEROBOUNCE_API_KEY) {
      return res.status(200).json({
        valid: true,
        reason: 'missing_api_key',
        status: 'unknown',
        sub_status: '',
      });
    }

    const zeroBounceResponse = await fetch(
      `${ZEROBOUNCE_URL}?api_key=${ZEROBOUNCE_API_KEY}&email=${encodeURIComponent(email)}`,
      { method: 'GET' }
    );

    if (!zeroBounceResponse.ok) {
      console.error('ZeroBounce API error:', zeroBounceResponse.status);
      return res.status(200).json({
        valid: true,
        reason: 'api_error',
        status: 'unknown',
        sub_status: '',
      });
    }

    const data = await zeroBounceResponse.json();

    const status = String(data.status || 'unknown').toLowerCase();
    const subStatus = String(data.sub_status || '').toLowerCase();
    const allowedSubStatuses = new Set(['role_based', 'catch-all', 'accept_all']);
    const isValid = status === 'valid' || allowedSubStatuses.has(subStatus);

    return res.status(200).json({
      valid: isValid,
      reason: subStatus || status,
      status,
      sub_status: subStatus,
    });
  } catch (error) {
    console.error('Email validation error:', error.message);
    return res.status(200).json({
      valid: true,
      reason: 'api_error',
      status: 'unknown',
      sub_status: '',
    });
  }
}
