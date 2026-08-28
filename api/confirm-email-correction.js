import { createHash } from 'node:crypto';

function centralEnabled() {
  return String(process.env.EMAIL_REPUTATION_ENABLED || '').toLowerCase() === 'true';
}

function confirmationKey(consumerRef, confirmation) {
  const digest = createHash('sha256')
    .update(`${consumerRef}\u0000${confirmation}`, 'utf8')
    .digest('hex')
    .slice(0, 32);
  return `quiz-confirm-${digest}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const consumerRef = req.body?.consumer_ref;
  const confirmation = req.body?.confirmation;
  if (
    typeof consumerRef !== 'string' || !consumerRef.trim() ||
    !['suggestion', 'original'].includes(confirmation)
  ) {
    return res.status(400).json({ success: false, error: 'invalid_request' });
  }
  const baseUrl = String(process.env.EMAIL_REPUTATION_URL || '').replace(/\/$/, '');
  const consumer = String(process.env.EMAIL_REPUTATION_CONSUMER || 'business_leads_quiz');
  const secret = String(process.env.EMAIL_REPUTATION_SECRET || '');
  if (!centralEnabled() || !baseUrl || !secret) {
    return res.status(503).json({ success: false, error: 'confirmation_pending' });
  }

  try {
    const response = await fetch(`${baseUrl}/v1/corrections/confirm`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${secret}`,
        'x-consumer-id': consumer,
        'idempotency-key': confirmationKey(consumerRef, confirmation),
      },
      body: JSON.stringify({
        consumer,
        consumer_ref: consumerRef.trim(),
        confirmation,
      }),
      signal: globalThis.AbortSignal.timeout(1000),
    });
    if (!response.ok) {
      return res.status(503).json({ success: false, error: 'confirmation_pending' });
    }
    const data = await response.json();
    if (data?.confirmation !== confirmation || data?.policy_version !== 'v1') {
      return res.status(503).json({ success: false, error: 'confirmation_pending' });
    }
    return res.status(200).json({ success: true, confirmation, policy_version: 'v1' });
  } catch {
    console.error('Central email correction confirmation failed');
    return res.status(503).json({ success: false, error: 'confirmation_pending' });
  }
}
