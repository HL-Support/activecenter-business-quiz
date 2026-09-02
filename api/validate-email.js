import { createHash } from 'node:crypto';

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

function centralEnabled() {
  return String(process.env.EMAIL_REPUTATION_ENABLED || '').toLowerCase() === 'true';
}

function pendingResponse() {
  return {
    valid: true,
    reason: 'accepted_pending',
    status: 'unknown',
    sub_status: '',
    action: 'accept_pending',
    policy_version: 'v1',
  };
}

function idempotencyKey(consumerRef, email) {
  const digest = createHash('sha256')
    .update(`${consumerRef}\u0000${email}`, 'utf8')
    .digest('hex')
    .slice(0, 32);
  return `quiz-email-${digest}`;
}

async function validateCentrally(email, consumerRef) {
  const baseUrl = String(process.env.EMAIL_REPUTATION_URL || '').replace(/\/$/, '');
  const consumer = String(process.env.EMAIL_REPUTATION_CONSUMER || 'business_leads_quiz');
  const secret = String(process.env.EMAIL_REPUTATION_SECRET || '');
  if (!baseUrl || !secret) return pendingResponse();

  const response = await fetch(`${baseUrl}/v1/intake-decisions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${secret}`,
      'x-consumer-id': consumer,
      'idempotency-key': idempotencyKey(consumerRef, email),
    },
    body: JSON.stringify({ consumer, consumer_ref: consumerRef, email }),
    signal: globalThis.AbortSignal.timeout(1000),
  });
  if (!response.ok) return pendingResponse();

  const data = await response.json();
  const actions = new Set(['accept', 'accept_pending', 'request_correction', 'reject_invalid']);
  const publicReasons = new Set(['accepted', 'accepted_pending', 'check_email', 'invalid_email']);
  if (
    !data ||
    typeof data.decision_id !== 'string' ||
    !actions.has(data.action) ||
    !publicReasons.has(data.public_reason) ||
    data.policy_version !== 'v1'
  ) {
    return pendingResponse();
  }

  return {
    valid: data.action !== 'reject_invalid',
    reason: data.public_reason,
    status: data.action,
    sub_status: '',
    action: data.action,
    ...(typeof data.suggested_email === 'string'
      ? { suggested_email: data.suggested_email }
      : {}),
    decision_id: data.decision_id,
    policy_version: data.policy_version,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, consumer_ref: consumerRef } = req.body;

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
      action: 'reject_invalid',
      policy_version: 'v1',
    });
  }

  if (centralEnabled()) {
    if (!consumerRef || typeof consumerRef !== 'string') {
      return res.status(400).json({ error: 'Consumer reference is required' });
    }
    try {
      return res.status(200).json(await validateCentrally(email, consumerRef));
    } catch {
      console.error('Central email reputation request failed');
      return res.status(200).json(pendingResponse());
    }
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
