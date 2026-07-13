const ATTRIBUTION_FIELDS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_campaign_id',
  'utm_adset_id',
  'utm_ad_id',
  'utm_term',
];

function clean(value, maxLength = 180) {
  return String(value || '').trim().slice(0, maxLength);
}

function publicSnapshot(value) {
  const snapshot = {};
  for (const field of ATTRIBUTION_FIELDS) {
    snapshot[field] = clean(value?.[field], field.endsWith('_id') ? 80 : 180);
  }
  snapshot.has_fbclid = Boolean(value?.fbclid);
  return snapshot;
}

export function buildAttributionCandidate({ search = '', stored = {}, currentUrl = '' } = {}) {
  const params = new URLSearchParams(search);
  const candidate = {};

  for (const field of ATTRIBUTION_FIELDS) {
    candidate[field] = clean(params.get(field) || stored[field], field.endsWith('_id') ? 80 : 180);
  }

  candidate.fbclid = clean(params.get('fbclid') || stored.fbclid, 500);
  if (candidate.fbclid && !candidate.utm_medium) {
    candidate.utm_medium = 'paid_social';
    if (!candidate.utm_source) candidate.utm_source = 'meta';
  }

  const hasCurrentAttribution = ATTRIBUTION_FIELDS.some((field) => params.has(field)) || params.has('fbclid');
  candidate.event_source_url = clean(
    hasCurrentAttribution ? currentUrl : stored.event_source_url || currentUrl,
    1000
  );

  return candidate;
}

export function compareAttribution(canonical, candidate) {
  const canonicalSnapshot = publicSnapshot(canonical);
  const candidateSnapshot = publicSnapshot(candidate);
  const mismatchedFields = Object.keys(candidateSnapshot).filter(
    (field) => canonicalSnapshot[field] !== candidateSnapshot[field]
  );

  return {
    matches: mismatchedFields.length === 0,
    mismatchedFields,
    canonical: canonicalSnapshot,
    candidate: candidateSnapshot,
  };
}

export function recordAttributionShadow({ source, search, stored, canonical, currentUrl } = {}) {
  if (typeof window === 'undefined') return null;

  const candidate = buildAttributionCandidate({ search, stored, currentUrl });
  const comparison = compareAttribution(canonical, candidate);
  const detail = {
    source: clean(source, 60) || 'unknown',
    at: new Date().toISOString(),
    ...comparison,
  };

  window.__AC_ATTRIBUTION_SHADOW__ = detail;
  window.dispatchEvent(new window.CustomEvent('ac:attribution-shadow', { detail }));

  if (!comparison.matches) {
    try {
      const key = 'acAttributionShadowDiagnostics';
      const previous = JSON.parse(window.sessionStorage.getItem(key) || '[]');
      const entries = Array.isArray(previous) ? previous : [];
      entries.push(detail);
      window.sessionStorage.setItem(key, JSON.stringify(entries.slice(-20)));
    } catch (_error) {
      // Diagnostics must never affect the funnel.
    }
  }

  return detail;
}
