/**
 * Vercel Serverless Function: /api/validate-email
 * Validates email address using ZeroBounce API
 *
 * POST /api/validate-email
 * { email: "test@example.com" }
 *
 * Response: { valid: true/false, reason: "valid|invalid|catch_all|unknown|..." }
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
    });
  }

  try {
    if (!ZEROBOUNCE_API_KEY) {
      return res.status(200).json({
        valid: true,
        reason: 'missing_api_key_fallback',
      });
    }

    const zeroBounceResponse = await fetch(
      `${ZEROBOUNCE_URL}?api_key=${ZEROBOUNCE_API_KEY}&email=${encodeURIComponent(email)}`,
      { method: 'GET' }
    );

    if (!zeroBounceResponse.ok) {
      console.error('ZeroBounce API error:', zeroBounceResponse.status);
      // Fallback: accept email if ZeroBounce is down
      return res.status(200).json({
        valid: true,
        reason: 'api_error_fallback',
      });
    }

    const data = await zeroBounceResponse.json();

    // Reject only clearly bad statuses to avoid blocking valid corporate domains.
    // `do_not_mail` from ZeroBounce is too aggressive for this funnel and was
    // rejecting legitimate addresses like internal business domains.
    const reason = String(data.status || 'unknown')
      .toLowerCase()
      .replace(/-/g, '_');
    const blockedStatuses = new Set(['invalid', 'spamtrap', 'abuse']);
    const isValid = !blockedStatuses.has(reason);

    return res.status(200).json({
      valid: isValid,
      reason: reason,
    });
  } catch (error) {
    console.error('Email validation error:', error.message);
    // On error, be permissive (don't block valid emails due to API issues)
    return res.status(200).json({
      valid: true,
      reason: 'api_error_fallback',
    });
  }
}
