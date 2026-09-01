/**
 * AP4 (Conversion-Plan 2026-09-01): Zugangsmail im n8n "AC - Lead Post Processor"
 * umbauen. Arbeitet nach agent-core/skills/n8n-workflow-update:
 *  - frischer GET vor dem Patch (nie alte lokale Kopie)
 *  - Library-Patches identisch in allen 3 Library-Nodes
 *  - jede Ersetzung mit strikter Vorkommens-Pruefung (erwartet: genau 1x pro Node)
 *  - Ergebnis wird NUR lokal geschrieben; der PUT ist ein eigener Schritt.
 *
 * Aufruf: node d:/tmp/patch-ap4-post-processor.js
 * Ergebnis: d:/tmp/ap4-workflow-live.json (Backup) + d:/tmp/ap4-workflow-patched.json
 */
const fs = require('fs');
const s = require('C:/Users/Markus/.agent-secrets/agent-secrets.json');
const BASE = s.n8n.baseUrl.replace(/\/$/, '');
const H = { 'X-N8N-API-KEY': s.n8n.apiKey };
const WF_ID = '9RZdrLxfA8IRhd55';
const LIB_NODES = ['normalize_candidates', 'build_model', 'apply_resume_link'];

const r = String.raw;

// ---------- Library-Patches (in allen 3 Nodes) ----------
const I18N = [
  // DE
  [r`subject: 'Dein Erfolgs-Code und dein Zugang',`,
   r`subject: 'Dein Erfolgs-Code ist da \u2014 und Video 1 (3 Min) wartet',`],
  [r`preheader: 'Dein Erfolgs-Code ist da und dein pers\u00f6nlicher Zugang zur\u00fcck zu deinen Videos wartet auf dich.',`,
   r`preheader: 'Dein pers\u00f6nlicher Zugang zu den 3 Videos ist bereit \u2014 Video 1 dauert nur 3 Minuten.',`],
  [r`resumeIntro: 'Mit diesem Link steigst du direkt wieder dort ein, wo du zuletzt aufgeh\u00f6rt hast.',`,
   r`resumeIntro: 'Dein pers\u00f6nlicher Zugang zu den 3 Videos \u2014 Video 1 dauert 3 Minuten.',`],
  [r`ctaLabel: 'Ja, ich will mehr erfahren',`,
   r`ctaLabel: 'Video 1 ansehen (3 Min)',`],
  // IT
  [r`subject: 'Il tuo codice del successo e il tuo accesso',`,
   r`subject: 'Il tuo codice del successo \u00e8 qui \u2014 e il video 1 (3 min) ti aspetta',`],
  [r`preheader: 'Il tuo codice del successo \u00e8 pronto e il tuo accesso personale ai video ti aspetta.',`,
   r`preheader: 'Il tuo accesso personale ai 3 video \u00e8 pronto \u2014 il video 1 dura solo 3 minuti.',`],
  [r`resumeIntro: 'Con questo link puoi riprendere esattamente dal punto in cui avevi interrotto i video.',`,
   r`resumeIntro: 'Il tuo accesso personale ai 3 video \u2014 il video 1 dura 3 minuti.',`],
  [r`ctaLabel: 'Riprendi i video',`,
   r`ctaLabel: 'Guarda il video 1 (3 min)',`],
  // EN
  [r`subject: 'Your success code and your access',`,
   r`subject: 'Your success code is here \u2014 and video 1 (3 min) is waiting',`],
  [r`preheader: 'Your success code is ready and your personal access back to the videos is waiting for you.',`,
   r`preheader: 'Your personal access to the 3 videos is ready \u2014 video 1 takes just 3 minutes.',`],
  [r`resumeIntro: 'With this link, you jump straight back to the exact spot where you last stopped watching.',`,
   r`resumeIntro: 'Your personal access to the 3 videos \u2014 video 1 takes 3 minutes.',`],
  [r`ctaLabel: 'Continue with your videos',`,
   r`ctaLabel: 'Watch video 1 (3 min)',`],
  // FR
  [r`subject: 'Votre code du succ\u00e8s et votre acc\u00e8s',`,
   r`subject: 'Votre code du succ\u00e8s est l\u00e0 \u2014 et la vid\u00e9o 1 (3 min) vous attend',`],
  [r`preheader: 'Votre code du succ\u00e8s est pr\u00eat et votre acc\u00e8s personnel pour reprendre les vid\u00e9os vous attend.',`,
   r`preheader: 'Votre acc\u00e8s personnel aux 3 vid\u00e9os est pr\u00eat \u2014 la vid\u00e9o 1 ne dure que 3 minutes.',`],
  [r`resumeIntro: 'Avec ce lien, vous reprenez exactement l\u00e0 o\u00f9 vous vous \u00eates arr\u00eat\u00e9 dans les vid\u00e9os.',`,
   r`resumeIntro: 'Votre acc\u00e8s personnel aux 3 vid\u00e9os \u2014 la vid\u00e9o 1 dure 3 minutes.',`],
  [r`ctaLabel: 'Reprendre les vid\u00e9os',`,
   r`ctaLabel: 'Regarder la vid\u00e9o 1 (3 min)',`],
  // RU
  [r`subject: '\u0412\u0430\u0448 \u043a\u043e\u0434 \u0443\u0441\u043f\u0435\u0445\u0430 \u0438 \u0432\u0430\u0448 \u0434\u043e\u0441\u0442\u0443\u043f',`,
   r`subject: '\u0412\u0430\u0448 \u043a\u043e\u0434 \u0443\u0441\u043f\u0435\u0445\u0430 \u0433\u043e\u0442\u043e\u0432 \u2014 \u0438 \u0432\u0438\u0434\u0435\u043e 1 (3 \u043c\u0438\u043d) \u0436\u0434\u0451\u0442 \u0432\u0430\u0441',`],
  [r`preheader: '\u0412\u0430\u0448 \u043a\u043e\u0434 \u0443\u0441\u043f\u0435\u0445\u0430 \u0433\u043e\u0442\u043e\u0432, \u0438 \u0432\u0430\u0448 \u043f\u0435\u0440\u0441\u043e\u043d\u0430\u043b\u044c\u043d\u044b\u0439 \u0434\u043e\u0441\u0442\u0443\u043f \u0434\u043b\u044f \u043f\u0440\u043e\u0434\u043e\u043b\u0436\u0435\u043d\u0438\u044f \u0432\u0438\u0434\u0435\u043e \u0443\u0436\u0435 \u0436\u0434\u0451\u0442 \u0432\u0430\u0441.',`,
   r`preheader: '\u0412\u0430\u0448 \u043b\u0438\u0447\u043d\u044b\u0439 \u0434\u043e\u0441\u0442\u0443\u043f \u043a 3 \u0432\u0438\u0434\u0435\u043e \u0433\u043e\u0442\u043e\u0432 \u2014 \u0432\u0438\u0434\u0435\u043e 1 \u0434\u043b\u0438\u0442\u0441\u044f \u0432\u0441\u0435\u0433\u043e 3 \u043c\u0438\u043d\u0443\u0442\u044b.',`],
  [r`resumeIntro: '\u041f\u043e \u044d\u0442\u043e\u0439 \u0441\u0441\u044b\u043b\u043a\u0435 \u0432\u044b \u0432\u0435\u0440\u043d\u0451\u0442\u0435\u0441\u044c \u0442\u043e\u0447\u043d\u043e \u043a \u0442\u043e\u043c\u0443 \u043c\u0435\u0441\u0442\u0443, \u0433\u0434\u0435 \u043e\u0441\u0442\u0430\u043d\u043e\u0432\u0438\u043b\u0438\u0441\u044c \u0432 \u0432\u0438\u0434\u0435\u043e \u0432 \u043f\u0440\u043e\u0448\u043b\u044b\u0439 \u0440\u0430\u0437.',`,
   r`resumeIntro: '\u0412\u0430\u0448 \u043b\u0438\u0447\u043d\u044b\u0439 \u0434\u043e\u0441\u0442\u0443\u043f \u043a 3 \u0432\u0438\u0434\u0435\u043e \u2014 \u0432\u0438\u0434\u0435\u043e 1 \u0434\u043b\u0438\u0442\u0441\u044f 3 \u043c\u0438\u043d\u0443\u0442\u044b.',`],
  [r`ctaLabel: '\u041f\u0440\u043e\u0434\u043e\u043b\u0436\u0438\u0442\u044c \u0432\u0438\u0434\u0435\u043e',`,
   r`ctaLabel: '\u0421\u043c\u043e\u0442\u0440\u0435\u0442\u044c \u0432\u0438\u0434\u0435\u043e 1 (3 \u043c\u0438\u043d)',`],
  // HU (Block vom 31.08. nutzt echte UTF-8-Zeichen)
  [`subject: 'A sikerkódod és a személyes hozzáférésed',`,
   `subject: 'Megérkezett a sikerkódod \u2014 és vár az 1. videó (3 perc)',`],
  [`preheader: 'A sikerkódod elkészült, és a személyes hozzáférésed vár rád.',`,
   `preheader: 'A személyes hozzáférésed a 3 videóhoz kész \u2014 az 1. videó csak 3 perc.',`],
  [`resumeIntro: 'Ezzel a linkkel pontosan ott folytathatod, ahol legutóbb abbahagytad.',`,
   `resumeIntro: 'A személyes hozzáférésed a 3 videóhoz \u2014 az 1. videó 3 percig tart.',`],
  [`ctaLabel: 'Folytatom a videókat',`,
   `ctaLabel: '1. videó megnézése (3 perc)',`],
];

// Bausteine als Einzelzeilen (keine Template-Literale: ${ darf nicht interpolieren)
const Z_INTRO = '    `<p style="margin:0 0 18px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.65;color:#2D2D2D;">${escapeHtml(copy.intro)}</p>`,';
const Z_RESULTCARD = '    buildLeadResultCard(';
const Z_RESUME_TOP = '    `<p style="margin:0 0 14px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.65;color:#2D2D2D;">${escapeHtml(copy.resumeIntro)}</p>`,';
const Z_BUTTON_TOP = '    `<div style="margin:0 0 28px 0;text-align:center;">${buildBulletproofButton(model.video_access_url, copy.ctaLabel, presentation.accent, presentation.buttonText)}</div>`,';
const Z_RESUME_BOTTOM = '    `<p style="margin:0 0 22px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.65;color:#2D2D2D;">${escapeHtml(copy.resumeIntro)}</p>`,';
const Z_BUTTON_BOTTOM = '    `<div style="margin:0 0 26px 0;text-align:center;">${buildBulletproofButton(model.video_access_url, copy.ctaLabel, presentation.accent, presentation.buttonText)}</div>`,';

// HTML: Video-Button direkt nach dem Intro, VOR der Typanalyse
const HTML_TOP = [
  [Z_INTRO, Z_RESULTCARD].join('\n'),
  [Z_INTRO, Z_RESUME_TOP, Z_BUTTON_TOP, Z_RESULTCARD].join('\n'),
];

// HTML: unten bleibt der zweite, identische Button - ohne doppeltes Intro
const HTML_BOTTOM = [
  [Z_RESUME_BOTTOM, Z_BUTTON_BOTTOM].join('\n'),
  Z_BUTTON_BOTTOM,
];

// Textfassung: Link auch oben direkt nach dem Intro
const T_GREET = '    `${copy.greeting}${greetingName},`,';
const T_LEER = "    '',";
const T_INTRO = '    copy.intro,';
const T_RESUME = '    copy.resumeIntro,';
const T_CTA = '    `${copy.ctaLabel}: ${model.video_access_url}`,';
const TEXT_TOP = [
  [T_GREET, T_LEER, T_INTRO, T_LEER].join('\n'),
  [T_GREET, T_LEER, T_INTRO, T_LEER, T_RESUME, T_CTA, T_LEER].join('\n'),
];
const TEXT_BOTTOM = [
  [T_RESUME, T_LEER, T_CTA].join('\n'),
  T_CTA,
];

const LIB_PATCHES = [...I18N, HTML_TOP, HTML_BOTTOM, TEXT_TOP, TEXT_BOTTOM];

// ---------- Node-spezifische Patches ----------
const TAIL_OLD = r`if (response.error) {
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
model.resume_last_video_step = response.lastVideoStep || 1;`;

const TAIL_NEW = r`// AP4.5 (Conversion-Plan 2026-09-01): Ein Resume-Token-Fehler darf den Versand
// nicht mehr komplett stoppen. Der HTTP-Node versucht es 3x; scheitert auch das,
// geht die Mail mit dem Standard-Link raus, der Job wird ueber last_error zur
// Nacharbeit markiert und die Berater-Mail laeuft unveraendert weiter.
const tokenFehler = response.error
  ? 'Resume token request failed: ' + (response.error.message || JSON.stringify(response.error))
  : (!response.success || (!response.shortUrl && !response.token))
    ? 'Resume link request returned no usable link: ' + JSON.stringify(response).slice(0, 800)
    : '';

const resumeUrl = tokenFehler
  ? buildCoachQuizUrl('https://business.activecenter.info', model.coach_handle)
  : (response.shortUrl || response.resumeUrl || buildResumeUrl('https://business.activecenter.info', response.token));

model.resume_link_fallback = Boolean(tokenFehler);
model.resume_link_fallback_error = tokenFehler || '';
model.resume_token = tokenFehler ? '' : response.token;
model.resume_short_key = tokenFehler ? '' : (response.shortKey || '');
model.resume_last_video_step = tokenFehler ? 1 : (response.lastVideoStep || 1);`;

const OUTCOME_OLD = r`return [{
  json: {
    success: true,
    job_id: email0.job_id,`;
const OUTCOME_NEW = r`const appliedModel = $('Code - Apply Resume Link').first().json;

return [{
  json: {
    success: true,
    resume_link_fallback: appliedModel.resume_link_fallback === true,
    job_id: email0.job_id,`;

const MARK_OLD = r`    last_error = NULL,`;
const MARK_NEW = r`    last_error = {{ $json.resume_link_fallback ? "'resume_link_fallback_manual_followup'" : 'NULL' }},`;

const GATE_OLD = r`={{ ["valid", "unknown"].includes(String($json.status || "").toLowerCase()) || ["role_based", "catch-all", "accept_all"].includes(String($json.sub_status || "").toLowerCase()) || String($json.reason || "").toLowerCase() === "api_error" }}`;
// AP4.6: Formular validiert bereits ueber denselben Checker - hier nur noch
// harte invalid-Faelle blocken.
const GATE_NEW = r`={{ String($json.status || "").toLowerCase() !== "invalid" }}`;

function applyAll(code, patches, nodeLabel) {
  let out = code;
  for (const [oldStr, newStr] of patches) {
    const count = out.split(oldStr).length - 1;
    if (count !== 1) {
      throw new Error(`Patch in ${nodeLabel}: erwartet 1 Vorkommen, gefunden ${count}: ${oldStr.slice(0, 90)}...`);
    }
    out = out.replace(oldStr, newStr);
  }
  return out;
}

(async () => {
  const live = await (await fetch(`${BASE}/workflows/${WF_ID}`, { headers: H })).json();
  if (!live.nodes) throw new Error('GET fehlgeschlagen: ' + JSON.stringify(live).slice(0, 300));
  fs.writeFileSync('d:/tmp/ap4-workflow-live.json', JSON.stringify(live, null, 2));
  console.log('Backup: d:/tmp/ap4-workflow-live.json | versionId:', live.versionId);

  const patchedNodes = [];
  for (const node of live.nodes) {
    if (LIB_NODES.includes(node.id)) {
      node.parameters.jsCode = applyAll(node.parameters.jsCode, LIB_PATCHES, node.name);
      patchedNodes.push(node.name + ' (Library)');
    }
    if (node.id === 'apply_resume_link') {
      node.parameters.jsCode = applyAll(node.parameters.jsCode, [[TAIL_OLD, TAIL_NEW]], node.name + ' Tail');
      patchedNodes.push(node.name + ' (Tail-Fallback)');
    }
    if (node.id === 'build_final_outcome') {
      node.parameters.jsCode = applyAll(node.parameters.jsCode, [[OUTCOME_OLD, OUTCOME_NEW]], node.name);
      patchedNodes.push(node.name);
    }
    if (node.name === 'MySQL - Mark Job Processed') {
      node.parameters.query = applyAll(node.parameters.query, [[MARK_OLD, MARK_NEW]], node.name);
      patchedNodes.push(node.name);
    }
    if (node.name === 'If - Lead Email Allowed') {
      const cond = node.parameters.conditions.conditions[0];
      if (cond.leftValue !== GATE_OLD) {
        throw new Error('Gate-Bedingung weicht vom erwarteten Stand ab: ' + cond.leftValue.slice(0, 120));
      }
      cond.leftValue = GATE_NEW;
      patchedNodes.push(node.name);
    }
    if (node.name === 'HTTP - Generate Resume Token') {
      node.retryOnFail = true;
      node.maxTries = 3;
      node.waitBetweenTries = 2000;
      patchedNodes.push(node.name + ' (Retry 3x)');
    }
    if (node.type === 'n8n-nodes-base.scheduleTrigger') {
      // AP4.4: T1 ergab Modus 'schatten' -> Versand laeuft weiter ueber diesen
      // Cron. 5 -> 1 Minute drueckt die Wartezeit der Zugangsmail von 2-6 min
      // auf ~0-2 min; Claim-Locking traegt parallele Laeufe, Leerlauf ~2 s.
      const iv = node.parameters.rule.interval[0];
      if (iv.field !== 'minutes' || iv.minutesInterval !== 5) {
        throw new Error('Cron weicht vom erwarteten 5-Minuten-Stand ab: ' + JSON.stringify(iv));
      }
      iv.minutesInterval = 1;
      patchedNodes.push(node.name + ' (Cron 5 -> 1 Min)');
    }
  }

  console.log('Gepatcht:');
  for (const p of patchedNodes) console.log('  -', p);
  const expected = 3 + 1 + 1 + 1 + 1 + 1 + 1;
  if (patchedNodes.length !== expected) {
    throw new Error(`Erwartet ${expected} Patch-Stellen, habe ${patchedNodes.length}`);
  }

  // Das PUT-Schema lehnt Zusatzfelder in settings ab (availableInMCP, binaryMode,
  // timeSavedMode kamen mit neueren n8n-Versionen dazu) - nur die erlaubten mitgeben.
  const erlaubteSettings = ['executionOrder', 'saveManualExecutions', 'callerPolicy', 'timezone',
    'saveDataErrorExecution', 'saveDataSuccessExecution', 'saveExecutionProgress',
    'executionTimeout', 'errorWorkflow'];
  const settings = Object.fromEntries(
    Object.entries(live.settings || {}).filter(([k]) => erlaubteSettings.includes(k))
  );
  const body = {
    name: live.name,
    nodes: live.nodes,
    connections: live.connections,
    settings,
  };
  fs.writeFileSync('d:/tmp/ap4-workflow-patched.json', JSON.stringify(body, null, 2));
  console.log('Geschrieben: d:/tmp/ap4-workflow-patched.json (PUT ist ein eigener Schritt)');
})().catch((e) => {
  console.error('ABBRUCH:', e.message);
  process.exit(1);
});
