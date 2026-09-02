/**
 * Textregel Markus 02.09.2026: keine Gedankenstriche in Mailtexten
 * (anti-ai-slop-humanizer). Ersetzt Betreff/Preheader/resumeIntro der
 * Zugangsmail in allen 6 Sprachen; Betreff DE ist die Formulierung von Markus.
 * Protokoll wie gehabt: frischer GET, exakte Ersetzung, PUT separat.
 */
const fs = require('fs');
const s = require('C:/Users/Markus/.agent-secrets/agent-secrets.json');
const BASE = s.n8n.baseUrl.replace(/\/$/, '');
const H = { 'X-N8N-API-KEY': s.n8n.apiKey };
const WF_ID = '9RZdrLxfA8IRhd55';
const LIB_NODES = ['normalize_candidates', 'build_model', 'apply_resume_link'];
const r = String.raw;

const PATCHES = [
  // DE
  [r`subject: 'Dein Erfolgs-Code ist da \u2014 und Video 1 (3 Min) wartet',`,
   r`subject: 'Dein Erfolgs-Code ist da und Video 1 (3 Min) wartet',`],
  [r`preheader: 'Dein pers\u00f6nlicher Zugang zu den 3 Videos ist bereit \u2014 Video 1 dauert nur 3 Minuten.',`,
   r`preheader: 'Dein pers\u00f6nlicher Zugang zu den 3 Videos ist bereit. Video 1 dauert nur 3 Minuten.',`],
  [r`resumeIntro: 'Dein pers\u00f6nlicher Zugang zu den 3 Videos \u2014 Video 1 dauert 3 Minuten.',`,
   r`resumeIntro: 'Hier ist dein pers\u00f6nlicher Zugang zu den 3 Videos. Video 1 dauert 3 Minuten.',`],
  // IT
  [r`subject: 'Il tuo codice del successo \u00e8 qui \u2014 e il video 1 (3 min) ti aspetta',`,
   r`subject: 'Il tuo codice del successo \u00e8 qui e il video 1 (3 min) ti aspetta',`],
  [r`preheader: 'Il tuo accesso personale ai 3 video \u00e8 pronto \u2014 il video 1 dura solo 3 minuti.',`,
   r`preheader: 'Il tuo accesso personale ai 3 video \u00e8 pronto. Il video 1 dura solo 3 minuti.',`],
  [r`resumeIntro: 'Il tuo accesso personale ai 3 video \u2014 il video 1 dura 3 minuti.',`,
   r`resumeIntro: 'Ecco il tuo accesso personale ai 3 video. Il video 1 dura 3 minuti.',`],
  // EN
  [r`subject: 'Your success code is here \u2014 and video 1 (3 min) is waiting',`,
   r`subject: 'Your success code is here and video 1 (3 min) is waiting',`],
  [r`preheader: 'Your personal access to the 3 videos is ready \u2014 video 1 takes just 3 minutes.',`,
   r`preheader: 'Your personal access to the 3 videos is ready. Video 1 takes just 3 minutes.',`],
  [r`resumeIntro: 'Your personal access to the 3 videos \u2014 video 1 takes 3 minutes.',`,
   r`resumeIntro: 'Here is your personal access to the 3 videos. Video 1 takes 3 minutes.',`],
  // FR
  [r`subject: 'Votre code du succ\u00e8s est l\u00e0 \u2014 et la vid\u00e9o 1 (3 min) vous attend',`,
   r`subject: 'Votre code du succ\u00e8s est l\u00e0 et la vid\u00e9o 1 (3 min) vous attend',`],
  [r`preheader: 'Votre acc\u00e8s personnel aux 3 vid\u00e9os est pr\u00eat \u2014 la vid\u00e9o 1 ne dure que 3 minutes.',`,
   r`preheader: 'Votre acc\u00e8s personnel aux 3 vid\u00e9os est pr\u00eat. La vid\u00e9o 1 ne dure que 3 minutes.',`],
  [r`resumeIntro: 'Votre acc\u00e8s personnel aux 3 vid\u00e9os \u2014 la vid\u00e9o 1 dure 3 minutes.',`,
   r`resumeIntro: 'Voici votre acc\u00e8s personnel aux 3 vid\u00e9os. La vid\u00e9o 1 dure 3 minutes.',`],
  // RU
  [r`subject: '\u0412\u0430\u0448 \u043a\u043e\u0434 \u0443\u0441\u043f\u0435\u0445\u0430 \u0433\u043e\u0442\u043e\u0432 \u2014 \u0438 \u0432\u0438\u0434\u0435\u043e 1 (3 \u043c\u0438\u043d) \u0436\u0434\u0451\u0442 \u0432\u0430\u0441',`,
   r`subject: '\u0412\u0430\u0448 \u043a\u043e\u0434 \u0443\u0441\u043f\u0435\u0445\u0430 \u0433\u043e\u0442\u043e\u0432, \u0438 \u0432\u0438\u0434\u0435\u043e 1 (3 \u043c\u0438\u043d) \u0436\u0434\u0451\u0442 \u0432\u0430\u0441',`],
  [r`preheader: '\u0412\u0430\u0448 \u043b\u0438\u0447\u043d\u044b\u0439 \u0434\u043e\u0441\u0442\u0443\u043f \u043a 3 \u0432\u0438\u0434\u0435\u043e \u0433\u043e\u0442\u043e\u0432 \u2014 \u0432\u0438\u0434\u0435\u043e 1 \u0434\u043b\u0438\u0442\u0441\u044f \u0432\u0441\u0435\u0433\u043e 3 \u043c\u0438\u043d\u0443\u0442\u044b.',`,
   r`preheader: '\u0412\u0430\u0448 \u043b\u0438\u0447\u043d\u044b\u0439 \u0434\u043e\u0441\u0442\u0443\u043f \u043a 3 \u0432\u0438\u0434\u0435\u043e \u0433\u043e\u0442\u043e\u0432. \u0412\u0438\u0434\u0435\u043e 1 \u0434\u043b\u0438\u0442\u0441\u044f \u0432\u0441\u0435\u0433\u043e 3 \u043c\u0438\u043d\u0443\u0442\u044b.',`],
  [r`resumeIntro: '\u0412\u0430\u0448 \u043b\u0438\u0447\u043d\u044b\u0439 \u0434\u043e\u0441\u0442\u0443\u043f \u043a 3 \u0432\u0438\u0434\u0435\u043e \u2014 \u0432\u0438\u0434\u0435\u043e 1 \u0434\u043b\u0438\u0442\u0441\u044f 3 \u043c\u0438\u043d\u0443\u0442\u044b.',`,
   r`resumeIntro: '\u0412\u043e\u0442 \u0432\u0430\u0448 \u043b\u0438\u0447\u043d\u044b\u0439 \u0434\u043e\u0441\u0442\u0443\u043f \u043a 3 \u0432\u0438\u0434\u0435\u043e. \u0412\u0438\u0434\u0435\u043e 1 \u0434\u043b\u0438\u0442\u0441\u044f 3 \u043c\u0438\u043d\u0443\u0442\u044b.',`],
  // HU (echte UTF-8-Zeichen im Code)
  [`subject: 'Megérkezett a sikerkódod \u2014 és vár az 1. videó (3 perc)',`,
   `subject: 'Megérkezett a sikerkódod, és vár az 1. videó (3 perc)',`],
  [`preheader: 'A személyes hozzáférésed a 3 videóhoz kész \u2014 az 1. videó csak 3 perc.',`,
   `preheader: 'A személyes hozzáférésed a 3 videóhoz kész. Az 1. videó csak 3 perc.',`],
  [`resumeIntro: 'A személyes hozzáférésed a 3 videóhoz \u2014 az 1. videó 3 percig tart.',`,
   `resumeIntro: 'Itt a személyes hozzáférésed a 3 videóhoz. Az 1. videó 3 percig tart.',`],
];

function applyAll(code, label) {
  let out = code;
  for (const [oldStr, newStr] of PATCHES) {
    const count = out.split(oldStr).length - 1;
    if (count !== 1) {
      throw new Error(`Patch in ${label}: erwartet 1 Vorkommen, gefunden ${count}: ${oldStr.slice(0, 70)}...`);
    }
    out = out.replace(oldStr, newStr);
  }
  return out;
}

(async () => {
  const live = await (await fetch(`${BASE}/workflows/${WF_ID}`, { headers: H })).json();
  if (!live.nodes) throw new Error('GET fehlgeschlagen');
  fs.writeFileSync('d:/tmp/ap4b-workflow-live.json', JSON.stringify(live, null, 2));
  console.log('Backup: d:/tmp/ap4b-workflow-live.json | versionId:', live.versionId);

  let patched = 0;
  for (const node of live.nodes) {
    if (!LIB_NODES.includes(node.id)) continue;
    node.parameters.jsCode = applyAll(node.parameters.jsCode, node.name);
    if ((node.parameters.jsCode.match(/\\u2014|—/g) || []).length > 0) {
      throw new Error(`${node.name}: es sind noch Gedankenstriche uebrig`);
    }
    patched += 1;
    console.log('Gepatcht:', node.name);
  }
  if (patched !== 3) throw new Error(`Erwartet 3 Nodes, habe ${patched}`);

  const erlaubteSettings = ['executionOrder', 'saveManualExecutions', 'callerPolicy', 'timezone',
    'saveDataErrorExecution', 'saveDataSuccessExecution', 'saveExecutionProgress',
    'executionTimeout', 'errorWorkflow'];
  const settings = Object.fromEntries(
    Object.entries(live.settings || {}).filter(([k]) => erlaubteSettings.includes(k))
  );
  fs.writeFileSync('d:/tmp/ap4b-workflow-patched.json', JSON.stringify({
    name: live.name, nodes: live.nodes, connections: live.connections, settings,
  }, null, 2));
  console.log('Geschrieben: d:/tmp/ap4b-workflow-patched.json');
})().catch((e) => { console.error('ABBRUCH:', e.message); process.exit(1); });
