const fs = require('fs');
const https = require('https');
const path = require('path');
const querystring = require('querystring');

const DIRECT_CONFIG = {
  apiUrl: process.env.MAUTIC_API_URL || 'https://mautic.hl-support.biz/api/',
  tokenUrl: process.env.MAUTIC_TOKEN_URL || 'https://mautic.hl-support.biz/oauth/v2/token',
  clientId: process.env.MAUTIC_CLIENT_ID,
  clientSecret: process.env.MAUTIC_CLIENT_SECRET,
};

function requireDirectConfig(config) {
  const missing = Object.entries(config)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missing.length) {
    throw new Error(`Missing Mautic environment values: ${missing.join(', ')}`);
  }
}

function extractConfigFromTool(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const apiUrl = source.match(/const MAUTIC_API_URL = "([^"]+)"/)?.[1];
  const clientId = source.match(/const CLIENT_ID\s+= "([^"]+)"/)?.[1];
  const clientSecret = source.match(/const CLIENT_SECRET\s+= "([^"]+)"/)?.[1];
  const tokenUrl = source.match(/const TOKEN_URL\s+= "([^"]+)"/)?.[1];

  if (!apiUrl || !clientId || !clientSecret || !tokenUrl) {
    throw new Error(`Could not extract Mautic config from ${filePath}`);
  }

  return { apiUrl, clientId, clientSecret, tokenUrl };
}

function requestJson({ hostname, path: reqPath, method, headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = https.request(
      {
        hostname,
        path: reqPath,
        method,
        headers: {
          ...headers,
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          let parsed = data;
          try {
            parsed = JSON.parse(data);
          } catch {}
          resolve({ status: res.statusCode, body: parsed });
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function getAccessToken(config) {
  const tokenUrl = new URL(config.tokenUrl);
  const postData = querystring.stringify({
    grant_type: 'client_credentials',
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: tokenUrl.hostname,
        path: tokenUrl.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(postData),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (!parsed.access_token) {
              reject(new Error(`No access_token in auth response: ${data}`));
              return;
            }
            resolve(parsed.access_token);
          } catch (error) {
            reject(error);
          }
        });
      }
    );
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function mauticRequestFactory(config, token) {
  const apiUrl = new URL(config.apiUrl);
  return (method, reqPath, body = null) =>
    requestJson({
      hostname: apiUrl.hostname,
      path: path.posix.join(apiUrl.pathname, reqPath).replace(/\\/g, '/'),
      method,
      body,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
}

async function ensureField(request, spec) {
  const fieldsResponse = await request('GET', 'fields/contact?limit=200');
  if (fieldsResponse.status >= 400) {
    throw new Error(`Failed to list contact fields: ${JSON.stringify(fieldsResponse.body)}`);
  }

  const fields = Object.values(fieldsResponse.body.fields || {});
  const existing = fields.find((field) => field.alias === spec.alias);
  if (existing) {
    return { status: 'exists', id: existing.id, alias: existing.alias };
  }

  const createResponse = await request('POST', 'fields/contact/new', spec);
  if (createResponse.status >= 400) {
    throw new Error(`Failed to create field ${spec.alias}: ${JSON.stringify(createResponse.body)}`);
  }

  const field = createResponse.body.field || createResponse.body;
  return { status: 'created', id: field.id, alias: field.alias || spec.alias };
}

async function ensureSegment(request, spec) {
  const listResponse = await request('GET', 'segments?limit=200');
  if (listResponse.status >= 400) {
    throw new Error(`Failed to list segments: ${JSON.stringify(listResponse.body)}`);
  }

  const segments = Object.values(listResponse.body.lists || listResponse.body.segments || {});
  const existing = segments.find((segment) => segment.alias === spec.alias || segment.name === spec.name);
  if (existing) {
    return { status: 'exists', id: existing.id, alias: existing.alias, name: existing.name };
  }

  const createResponse = await request('POST', 'segments/new', spec);
  if (createResponse.status >= 400) {
    throw new Error(`Failed to create segment ${spec.alias}: ${JSON.stringify(createResponse.body)}`);
  }

  const segment = createResponse.body.list || createResponse.body.segment || createResponse.body;
  return { status: 'created', id: segment.id, alias: segment.alias || spec.alias, name: segment.name || spec.name };
}

async function ensureCampaign(request, spec) {
  const listResponse = await request('GET', 'campaigns?limit=200');
  if (listResponse.status >= 400) {
    throw new Error(`Failed to list campaigns: ${JSON.stringify(listResponse.body)}`);
  }

  const campaigns = Object.values(listResponse.body.campaigns || {});
  const existing = campaigns.find((campaign) => campaign.alias === spec.alias || campaign.name === spec.name);
  if (existing) {
    return { status: 'exists', id: existing.id, alias: existing.alias, name: existing.name };
  }

  const createResponse = await request('POST', 'campaigns/new', spec);
  if (createResponse.status >= 400) {
    throw new Error(`Failed to create campaign ${spec.alias}: ${JSON.stringify(createResponse.body)}`);
  }

  const campaign = createResponse.body.campaign || createResponse.body;
  return { status: 'created', id: campaign.id, alias: campaign.alias || spec.alias, name: campaign.name || spec.name };
}

async function ensureEmail(request, spec) {
  const listResponse = await request('GET', 'emails?limit=200');
  if (listResponse.status >= 400) {
    throw new Error(`Failed to list emails: ${JSON.stringify(listResponse.body)}`);
  }

  const emails = Object.values(listResponse.body.emails || {});
  const existing = emails.find((email) => email.name === spec.name || email.subject === spec.subject);
  if (existing) {
    return { status: 'exists', id: existing.id, name: existing.name, subject: existing.subject };
  }

  const createResponse = await request('POST', 'emails/new', spec);
  if (createResponse.status >= 400) {
    throw new Error(`Failed to create email ${spec.name}: ${JSON.stringify(createResponse.body)}`);
  }

  const email = createResponse.body.email || createResponse.body;
  return { status: 'created', id: email.id, name: email.name || spec.name, subject: email.subject || spec.subject };
}

async function main() {
  const config = DIRECT_CONFIG;
  requireDirectConfig(config);
  const token = await getAccessToken(config);
  const request = mauticRequestFactory(config, token);

  const fieldSpecs = [
    { label: 'AC Member ID', alias: 'ac_member_id', type: 'text', group: 'core' },
    { label: 'AC Coach User ID', alias: 'ac_coach_user_id', type: 'text', group: 'core' },
    { label: 'AC Coach Herbalife ID', alias: 'ac_coach_herbalife_id', type: 'text', group: 'core' },
    { label: 'AC Contact ID', alias: 'ac_contact_id', type: 'text', group: 'core' },
    { label: 'AC Last Typeform Survey ID', alias: 'ac_last_typeform_survey_i', type: 'text', group: 'core' },
    { label: 'AC Last Form ID', alias: 'ac_last_form_id', type: 'text', group: 'core' },
    { label: 'AC Last Lead Hash', alias: 'ac_last_lead_hash', type: 'text', group: 'core' },
    { label: 'AC Last Session Hash', alias: 'ac_last_session_hash', type: 'text', group: 'core' },
    { label: 'AC Last Funnel', alias: 'ac_last_funnel', type: 'text', group: 'core' },
    { label: 'AC Last Profile', alias: 'ac_last_profile', type: 'text', group: 'core' },
    { label: 'AC Last Profile Label', alias: 'ac_last_profile_label', type: 'text', group: 'core' },
    { label: 'AC Last Main Goal', alias: 'ac_last_main_goal', type: 'text', group: 'core' },
    { label: 'AC Last Main Goal Label', alias: 'ac_last_main_goal_label', type: 'text', group: 'core' },
    { label: 'AC Last Form Language', alias: 'ac_last_form_language', type: 'text', group: 'core' },
    { label: 'AC Last Form Submitted At', alias: 'ac_last_form_submitted_at', type: 'datetime', group: 'core' },
    { label: 'AC Last Video Access URL', alias: 'ac_last_video_access_url', type: 'url', group: 'core' },
    { label: 'AC Last Barrier', alias: 'ac_last_barrier', type: 'text', group: 'core' },
    { label: 'AC Berater Vorname', alias: 'ac_berater_vorname', type: 'text', group: 'core' },
    { label: 'AC Berater Name', alias: 'ac_berater_name', type: 'text', group: 'core' },
    { label: 'AC Berater E-Mail', alias: 'ac_berater_email', type: 'email', group: 'core' },
    { label: 'AC Berater WhatsApp', alias: 'ac_berater_whatsapp', type: 'text', group: 'core' },
    { label: 'AC Berater Slug', alias: 'ac_berater_slug', type: 'text', group: 'core' },
    { label: 'AC Nurture Stopped', alias: 'ac_nurture_stopped', type: 'boolean', group: 'core' },
    { label: 'AC Evergreen Position', alias: 'ac_evergreen_position', type: 'number', group: 'core' },
  ].map((spec) => ({
    object: 'lead',
    isPublished: true,
    isRequired: false,
    isPubliclyUpdatable: false,
    isUniqueIdentifier: false,
    ...spec,
  }));

  const segmentSpec = {
    name: 'AC - Business Leads Quiz - New',
    alias: 'ac-business-leads-quiz-new',
    publicName: 'AC - Business Leads Quiz - New',
    description: 'Entry segment for the Business Leads Quiz follow-up sequence.',
    isPublished: true,
    isGlobal: true,
    filters: [],
  };

  const campaignSpec = {
    name: 'AC - Business Leads Quiz - Email 0',
    alias: 'ac-business-leads-quiz-email-0',
    description: 'Campaign shell for the first lead follow-up email after Business Leads Quiz submission.',
    isPublished: false,
  };

  const nurtureSegmentSpecs = [
    {
      name: 'AC - Nurture Phase A',
      alias: 'ac-nurture-phase-a',
      publicName: 'AC - Nurture Phase A',
      description: 'Leads who registered but have not watched any video. Activation sequence days 2-21.',
      isPublished: true,
      isGlobal: true,
      filters: [],
    },
    {
      name: 'AC - Nurture Phase B',
      alias: 'ac-nurture-phase-b',
      publicName: 'AC - Nurture Phase B',
      description: 'Leads who watched Video 1 but not Video 2. 24h inactivity trigger.',
      isPublished: true,
      isGlobal: true,
      filters: [],
    },
    {
      name: 'AC - Nurture Phase C',
      alias: 'ac-nurture-phase-c',
      publicName: 'AC - Nurture Phase C',
      description: 'Leads who watched Video 2 but not Video 3. 24h inactivity trigger.',
      isPublished: true,
      isGlobal: true,
      filters: [],
    },
    {
      name: 'AC - Nurture Phase D',
      alias: 'ac-nurture-phase-d',
      publicName: 'AC - Nurture Phase D',
      description: 'Leads who watched all 3 videos but have not clicked CTA. Conversion sequence.',
      isPublished: true,
      isGlobal: true,
      filters: [],
    },
    {
      name: 'AC - Nurture Evergreen',
      alias: 'ac-nurture-evergreen',
      publicName: 'AC - Nurture Evergreen',
      description: 'Monthly evergreen sequence. Leads added after activation phase completes (>23 days). Position tracked via ac_evergreen_position.',
      isPublished: true,
      isGlobal: true,
      filters: [],
    },
    {
      name: 'AC - Nurture Reactivation',
      alias: 'ac-nurture-reactivation',
      publicName: 'AC - Nurture Reactivation',
      description: 'Leads who clicked a link in an Evergreen email. Intensive 3-5 day re-activation sequence.',
      isPublished: true,
      isGlobal: true,
      filters: [],
    },
    {
      name: 'AC - Nurture Post CTA',
      alias: 'ac-nurture-post-cta',
      publicName: 'AC - Nurture Post CTA',
      description: 'Leads who clicked the CTA (State 4). Receive E1 confirmation email.',
      isPublished: true,
      isGlobal: true,
      filters: [],
    },
  ];

  const nurtureCampaignSpecs = [
    {
      name: 'AC - Nurture Phase A',
      alias: 'ac-nurture-campaign-phase-a',
      description: 'Activation sequence for leads who have not watched any video. Emails A2 (day 2), A3 (day 5), A4 (day 10), A5 (day 21). Condition: lifecycle_stage = 0.',
      isPublished: false,
    },
    {
      name: 'AC - Nurture Phase B',
      alias: 'ac-nurture-campaign-phase-b',
      description: 'Deepening sequence after Video 1. Emails B1 (immediately), B2 (day +3). Condition: lifecycle_stage = 1.',
      isPublished: false,
    },
    {
      name: 'AC - Nurture Phase C',
      alias: 'ac-nurture-campaign-phase-c',
      description: 'Momentum sequence after Video 2. Emails C1 (immediately), C2 (day +3). Condition: lifecycle_stage = 2.',
      isPublished: false,
    },
    {
      name: 'AC - Nurture Phase D',
      alias: 'ac-nurture-campaign-phase-d',
      description: 'Conversion sequence after all 3 videos. Emails D1 (immediately), D2 (day +3), D3 (day +7). Condition: lifecycle_stage = 3.',
      isPublished: false,
    },
    {
      name: 'AC - Nurture Evergreen',
      alias: 'ac-nurture-campaign-evergreen',
      description: 'Monthly evergreen sequence. Sends one email per month based on ac_evergreen_position. Stops only on unsubscribe or ac_nurture_stopped=true.',
      isPublished: false,
    },
    {
      name: 'AC - Nurture Reactivation',
      alias: 'ac-nurture-campaign-reactivation',
      description: 'Re-activation when Evergreen lead clicks a link. 3-5 day intensive sequence. After day +7: webhook fires to resume Evergreen at EX+1.',
      isPublished: false,
    },
    {
      name: 'AC - Nurture Post CTA',
      alias: 'ac-nurture-campaign-post-cta',
      description: 'Immediate confirmation email E1 after CTA click. Warm welcome, sets expectations, introduces coach.',
      isPublished: false,
    },
  ];

  const results = {
    fields: [],
    segment: null,
    nurtureSegments: [],
    nurtureCampaigns: [],
    email: null,
    campaign: null,
  };

  for (const spec of fieldSpecs) {
    // Keep field creation sequential for easier troubleshooting on partial failures.
    /* eslint-disable no-await-in-loop */
    const result = await ensureField(request, spec);
    results.fields.push(result);
  }

  results.segment = await ensureSegment(request, segmentSpec);

  for (const spec of nurtureSegmentSpecs) {
    /* eslint-disable no-await-in-loop */
    const result = await ensureSegment(request, spec);
    results.nurtureSegments.push(result);
  }

  for (const spec of nurtureCampaignSpecs) {
    /* eslint-disable no-await-in-loop */
    const result = await ensureCampaign(request, spec);
    results.nurtureCampaigns.push(result);
  }

  const emailSpec = {
    name: 'AC - Business Leads Quiz - Email 0',
    subject: 'Dein Erfolgs-Code und dein Zugang',
    language: 'de',
    emailType: 'list',
    isPublished: false,
    fromAddress: 'markus@hl-support.biz',
    fromName: 'Markus Oberhofer',
    preheaderText: 'Dein Erfolgs-Code ist da und dein persönlicher Zugang zurück zu deinen Videos wartet auf dich.',
    lists: [results.segment.id],
    customHtml: [
      '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">',
      '<html xmlns="http://www.w3.org/1999/xhtml">',
      '<head>',
      '  <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
      '  <meta name="x-apple-disable-message-reformatting" />',
      '  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />',
      '  <meta name="color-scheme" content="light" />',
      '  <meta name="supported-color-schemes" content="light" />',
      '  <title></title>',
      '  <style type="text/css" rel="stylesheet" media="all">',
      '    #outlook a { padding: 0; }',
      '    body { width: 100% !important; height: 100%; margin: 0; -webkit-text-size-adjust: none; -ms-text-size-adjust: 100%; }',
      '    a img { border: none; }',
      '    td { word-break: break-word; }',
      '    body, td, th { font-family: Arial, Helvetica, sans-serif; }',
      '    td, th { font-size: 16px; }',
      '    p, ul, ol { margin: 0 0 18px 0; font-size: 16px; line-height: 1.65; color: #2d2d2d; }',
      '    p:last-child { margin-bottom: 0; }',
      '    a { color: #212529; text-decoration: underline; }',
      '    .email-wrapper { width: 100%; margin: 0; padding: 0; background-color: #f0f0f0; }',
      '    .email-body_inner { width: 570px; margin: 0 auto; padding: 0; background-color: #ffffff; }',
      '    .content-cell { padding: 36px 40px; }',
      '    .email-footer { width: 570px; margin: 0 auto; padding: 0; text-align: center; }',
      '    .email-footer p { color: #999999; font-size: 12px; line-height: 1.6; }',
      '    .email-footer a { color: #999999; text-decoration: underline; }',
      '    .email-masthead { background-color: #212529; padding: 16px 24px; }',
      '    @media only screen and (max-width: 600px) {',
      '      .email-body_inner, .email-footer { width: 100% !important; }',
      '      .content-cell { padding: 24px 20px !important; }',
      '      .email-masthead { padding: 14px 16px !important; }',
      '      .logo-img { width: 150px !important; }',
      '    }',
      '    :root { color-scheme: light; }',
      '  </style>',
      '  <!--[if mso]><style type="text/css">body,td,th,p,a,.f-fallback{font-family:Arial,sans-serif !important;}</style><![endif]-->',
      '</head>',
      '<body style="margin:0;padding:0;background-color:#f0f0f0;-webkit-text-size-adjust:none;-ms-text-size-adjust:100%;" bgcolor="#f0f0f0">',
      '<table class="email-wrapper" width="100%" cellpadding="0" cellspacing="0" role="presentation" bgcolor="#f0f0f0">',
      '<tr><td align="center" style="padding:24px 8px;">',
      '<table width="100%" cellpadding="0" cellspacing="0" role="presentation">',
      '<tr><td>',
      '<table class="email-body_inner" align="center" width="570" cellpadding="0" cellspacing="0" role="presentation" style="border-radius:4px 4px 0 0;overflow:hidden;">',
      '<tr><td class="email-masthead" bgcolor="#212529" style="background-color:#212529;padding:16px 24px;border-radius:4px 4px 0 0;">',
      '<img src="https://hl-support.biz/storage/images/cwemaillogo-1bcb4f.png" width="180" alt="Brand Logo" class="logo-img f-fallback" style="display:block;border:0;outline:none;text-decoration:none;height:auto;width:180px;max-width:180px;" />',
      '</td></tr>',
      '</table>',
      '</td></tr>',
      '<tr><td width="570" cellpadding="0" cellspacing="0">',
      '<table class="email-body_inner" align="center" width="570" cellpadding="0" cellspacing="0" role="presentation" bgcolor="#ffffff">',
      '<tr><td class="content-cell f-fallback" style="padding:36px 40px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.65;color:#2d2d2d;">',
      '<span style="display:none !important;visibility:hidden;mso-hide:all;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">Dein Erfolgs-Code ist da und dein persönlicher Zugang zurück zu deinen Videos wartet auf dich.</span>',
      '<p style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.65;color:#2d2d2d;">Hi {contactfield=firstname},</p>',
      '<p style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.65;color:#2d2d2d;">dein Erfolgs-Code ist da und dein persönlicher Zugang ist bereit.</p>',
      '<p style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.65;color:#2d2d2d;">Dein Typ: <strong>{contactfield=ac_last_profile_label}</strong><br>Deine Zielsetzung: <strong>{contactfield=ac_last_main_goal_label}</strong></p>',
      '<p style="margin:0 0 24px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.65;color:#2d2d2d;">Mit diesem Link steigst du direkt wieder dort ein, wo du zuletzt aufgehört hast.</p>',
      '<p style="margin:0 0 28px 0;"><a href="{contactfield=ac_last_video_access_url}" style="display:inline-block;background:#111111;color:#ffffff;text-decoration:none;padding:14px 22px;font-weight:700;">Videos jetzt fortsetzen</a></p>',
      '<p style="margin:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.65;color:#2d2d2d;">Je nach Ergebnis kann sich auch dein zuständiger Coach bei dir melden.</p>',
      '<p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.65;color:#2d2d2d;">Markus</p>',
      '</td></tr>',
      '</table>',
      '</td></tr>',
      '<tr><td>',
      '<table class="email-footer" align="center" width="570" cellpadding="0" cellspacing="0" role="presentation">',
      '<tr><td class="content-cell f-fallback" align="center" style="padding:24px 40px 32px 40px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#999999;text-align:center;">',
      '<p style="margin:0 0 8px 0;font-size:12px;color:#999999;">Du erhältst diese E-Mail, weil du dich auf business.activecenter.info eingetragen hast.</p>',
      '<p style="margin:0 0 8px 0;font-size:12px;color:#999999;"><a href="{unsubscribe_url}" style="color:#999999;text-decoration:underline;">Abmelden</a>&nbsp;&middot;&nbsp;<a href="https://impressum.hl-support.biz/privacy.html" style="color:#999999;text-decoration:underline;">Impressum &amp; Datenschutz</a></p>',
      '<p style="margin:0;font-size:12px;color:#999999;">&copy; HL-Support Ltd. &middot; Alle Rechte vorbehalten</p>',
      '</td></tr>',
      '</table>',
      '</td></tr>',
      '</table>',
      '</td></tr>',
      '</table>',
      '</body>',
      '</html>',
    ].join(''),
  };

  results.email = await ensureEmail(request, emailSpec);

  results.campaign = await ensureCampaign(request, {
    ...campaignSpec,
    lists: [results.segment.id],
    events: [
      {
        name: 'Email 0: Zugang senden',
        type: 'email.send',
        eventType: 'action',
        channel: 'email',
        channelId: String(results.email.id),
        order: 1,
        properties: {
          email: results.email.id,
          email_type: 'list',
        },
        triggerMode: 'immediate',
        triggerInterval: 1,
        triggerIntervalUnit: 'd',
      },
    ],
    canvasSettings: {
      nodes: [{ id: 'email0', positionX: '300', positionY: '80' }],
      connections: [],
    },
  });

  results.languageRoutes = { de: { segment: results.segment, email: results.email, campaign: results.campaign } };

  const extraLanguageSpecs = [
    {
      key: 'it',
      segment: {
        name: 'AC - Business Leads Quiz - New IT',
        alias: 'ac-business-leads-quiz-new-it',
        publicName: 'AC - Business Leads Quiz - New IT',
        description: 'Italian entry segment for the Business Leads Quiz follow-up sequence.',
        isPublished: true,
        isGlobal: true,
        filters: [],
      },
      email: {
        name: 'AC - Business Leads Quiz - Email 0 IT',
        subject: 'Il tuo codice del successo e il tuo accesso',
        language: 'it',
        emailType: 'list',
        isPublished: false,
        fromAddress: 'markus@hl-support.biz',
        fromName: 'Markus Oberhofer',
        preheaderText: 'Il tuo codice del successo è pronto e il tuo accesso personale ai video ti aspetta.',
      },
      campaign: {
        name: 'AC - Business Leads Quiz - Email 0 IT',
        alias: 'ac-business-leads-quiz-email-0-it',
        description: 'Italian campaign shell for the first Business Leads Quiz follow-up email.',
        isPublished: false,
      },
    },
    {
      key: 'en',
      segment: {
        name: 'AC - Business Leads Quiz - New EN',
        alias: 'ac-business-leads-quiz-new-en',
        publicName: 'AC - Business Leads Quiz - New EN',
        description: 'English entry segment for the Business Leads Quiz follow-up sequence.',
        isPublished: true,
        isGlobal: true,
        filters: [],
      },
      email: {
        name: 'AC - Business Leads Quiz - Email 0 EN',
        subject: 'Your success code and your access',
        language: 'en',
        emailType: 'list',
        isPublished: false,
        fromAddress: 'markus@hl-support.biz',
        fromName: 'Markus Oberhofer',
        preheaderText: 'Your success code is ready and your personal access back to the videos is waiting for you.',
      },
      campaign: {
        name: 'AC - Business Leads Quiz - Email 0 EN',
        alias: 'ac-business-leads-quiz-email-0-en',
        description: 'English campaign shell for the first Business Leads Quiz follow-up email.',
        isPublished: false,
      },
    },
    {
      key: 'fr',
      segment: {
        name: 'AC - Business Leads Quiz - New FR',
        alias: 'ac-business-leads-quiz-new-fr',
        publicName: 'AC - Business Leads Quiz - New FR',
        description: 'French entry segment for the Business Leads Quiz follow-up sequence.',
        isPublished: true,
        isGlobal: true,
        filters: [],
      },
      email: {
        name: 'AC - Business Leads Quiz - Email 0 FR',
        subject: 'Votre code du succès et votre accès',
        language: 'fr',
        emailType: 'list',
        isPublished: false,
        fromAddress: 'markus@hl-support.biz',
        fromName: 'Markus Oberhofer',
        preheaderText:
          'Votre code du succès est prêt et votre accès personnel pour reprendre les vidéos vous attend.',
      },
      campaign: {
        name: 'AC - Business Leads Quiz - Email 0 FR',
        alias: 'ac-business-leads-quiz-email-0-fr',
        description: 'French campaign shell for the first Business Leads Quiz follow-up email.',
        isPublished: false,
      },
    },
    {
      key: 'ru',
      segment: {
        name: 'AC - Business Leads Quiz - New RU',
        alias: 'ac-business-leads-quiz-new-ru',
        publicName: 'AC - Business Leads Quiz - New RU',
        description: 'Russian entry segment for the Business Leads Quiz follow-up sequence.',
        isPublished: true,
        isGlobal: true,
        filters: [],
      },
      email: {
        name: 'AC - Business Leads Quiz - Email 0 RU',
        subject: 'Ваш код успеха и ваш доступ',
        language: 'ru',
        emailType: 'list',
        isPublished: false,
        fromAddress: 'markus@hl-support.biz',
        fromName: 'Markus Oberhofer',
        preheaderText:
          'Ваш код успеха готов, и ваш персональный доступ для продолжения видео уже ждёт вас.',
      },
      campaign: {
        name: 'AC - Business Leads Quiz - Email 0 RU',
        alias: 'ac-business-leads-quiz-email-0-ru',
        description: 'Russian campaign shell for the first Business Leads Quiz follow-up email.',
        isPublished: false,
      },
    },
  ];

  for (const spec of extraLanguageSpecs) {
    const segment = await ensureSegment(request, spec.segment);
    const email = await ensureEmail(request, {
      ...spec.email,
      lists: [segment.id],
      customHtml: [
        '<p>Language-specific shell for follow-up routing.</p>',
        '<p>Profile: {contactfield=ac_last_profile_label}<br>Main goal: {contactfield=ac_last_main_goal_label}</p>',
        '<p>Resume link: {contactfield=ac_last_video_access_url}</p>',
      ].join(''),
    });
    const campaign = await ensureCampaign(request, {
      ...spec.campaign,
      lists: [segment.id],
      events: [
        {
          name: 'Email 0: Zugang senden',
          type: 'email.send',
          eventType: 'action',
          channel: 'email',
          channelId: String(email.id),
          order: 1,
          properties: {
            email: email.id,
            email_type: 'list',
          },
          triggerMode: 'immediate',
          triggerInterval: 1,
          triggerIntervalUnit: 'd',
        },
      ],
      canvasSettings: {
        nodes: [{ id: 'email0', positionX: '300', positionY: '80' }],
        connections: [],
      },
    });
    results.languageRoutes[spec.key] = { segment, email, campaign };
  }

  console.log(JSON.stringify(results, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
