const response = $input.first().json;
const baseModel = $('Code - Build Lead Model').first().json;
const model = JSON.parse(JSON.stringify(baseModel));

if (response.error) {
  return [{
    json: {
      failed: true,
      job_id: model.job_id,
      last_error: 'Resume token request failed: ' + (response.error.message || JSON.stringify(response.error)),
    },
  }];
}

if (!response.success || (!response.shortUrl && !response.token)) {
  return [{
    json: {
      failed: true,
      job_id: model.job_id,
      last_error: 'Resume link request returned no usable link: ' + JSON.stringify(response).slice(0, 800),
    },
  }];
}

const resumeUrl = response.shortUrl || response.resumeUrl || buildResumeUrl('https://business.activecenter.info', response.token);

model.resume_token = response.token;
model.resume_short_key = response.shortKey || '';
model.resume_last_video_step = response.lastVideoStep || 1;
model.video_access_url = resumeUrl;
if (model.mautic_contact_payload) {
  model.mautic_contact_payload.ac_last_video_access_url = resumeUrl;
}
model.lead_email_html = buildPremiumLeadEmailHtml(model);
model.lead_email_text = buildPremiumLeadEmailText(model);
const mauticSegments = JSON.parse($('Set Config').first().json.mautic_segments_json || '{}');
const selectedSegment = mauticSegments[model.language] || mauticSegments.de || { id: 2, alias: 'ac-business-leads-quiz-new', name: 'AC - Business Leads Quiz - New' };
model.mautic_segment_id = selectedSegment.id;
model.mautic_segment_alias = selectedSegment.alias;
model.mautic_segment_name = selectedSegment.name;

return [{
  json: {
    ...model,
    failed: false,
  },
}];