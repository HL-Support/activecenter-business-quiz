/** AP4-Validierung VOR dem PUT: Mail-Bau aus der gepatchten Library, alle 6 Sprachen. */
const fs = require('fs');
const wf = JSON.parse(fs.readFileSync('d:/tmp/ap4-workflow-patched.json', 'utf8'));
const node = wf.nodes.find((n) => n.id === 'apply_resume_link');
const code = node.parameters.jsCode;

// 1) Syntax des kompletten Node-Codes (inkl. Tail) pruefen
new Function('$input', '$', code);
console.log('Syntax OK (apply_resume_link, inkl. Tail)');

// 2) Library isolieren und Mail bauen
const marker = 'const response = $input.first().json;';
const lib = code.slice(0, code.indexOf(marker));
const gib = new Function(
  lib +
    '\nreturn { buildPremiumLeadEmailHtml, buildPremiumLeadEmailText, getLeadEmailCopy };'
)();

const model = {
  language: 'de',
  contact_first_name: 'Markus',
  contact_full_name: 'Markus Test',
  contact_email: 'test@example.com',
  profile_slug: 'feuer',
  profile_label: 'Der Macher',
  main_aspiration_slug: 'freedom',
  main_aspiration_label: 'Freiheit',
  barrier_slug: 'vehicle',
  video_access_url: 'https://business.activecenter.info/markus?r=TESTKEY&target=videos',
  coach_first_name: 'Markus',
  coach_full_name: 'Markus Oberhofer',
  coach_handle: 'markus',
  coach_email: 'coach@example.com',
  coach_phone_formatted: '+49 151 0000000',
  coach_whatsapp_url: 'https://wa.me/491510000000',
  coach_organisation_name: 'Active Center',
};

let fehler = 0;
for (const lang of ['de', 'it', 'en', 'fr', 'ru', 'hu']) {
  const m = { ...model, language: lang };
  const copy = gib.getLeadEmailCopy(lang);
  const html = gib.buildPremiumLeadEmailHtml(m);
  const text = gib.buildPremiumLeadEmailText(m);

  // Link liegt im HTML mit &amp;-Escaping; TESTKEY zaehlt beide Varianten.
  // snapshotHeading gibt es nur in de/hu, sonst greift der DE-Fallback.
  const deCopy = gib.getLeadEmailCopy('de');
  const snapshotText = copy.snapshotHeading || deCopy.snapshotHeading;
  const buttonCount = html.split('TESTKEY').length - 1;
  const firstButton = html.indexOf('TESTKEY');
  const snapshot = html.indexOf(snapshotText);
  const probleme = [];
  if (!/1 \(3 [^)]*\)|1\. vide\u00f3|\u0432\u0438\u0434\u0435\u043e 1/i.test(copy.subject)) probleme.push('Betreff ohne Video-1-Bezug: ' + copy.subject);
  if (buttonCount < 2) probleme.push(`nur ${buttonCount} Button-Link(s) im HTML`);
  if (!(firstButton > -1 && snapshot > -1 && firstButton < snapshot)) probleme.push('erster Button liegt nicht VOR der Typanalyse');
  if (/zuletzt aufgeh|avevi interrotto|last stopped|arr\u00eat\u00e9 dans|abbahagytad|\u043f\u0440\u043e\u0448\u043b\u044b\u0439 \u0440\u0430\u0437/i.test(copy.resumeIntro)) probleme.push('resumeIntro spricht noch vom Wiedereinstieg');
  const textLinkPos = text.indexOf(m.video_access_url);
  const textSnapshotPos = text.indexOf(snapshotText);
  if (!(textLinkPos > -1 && textLinkPos < textSnapshotPos)) probleme.push('Textfassung: Link nicht vor der Analyse');

  if (probleme.length) {
    fehler += 1;
    console.log(`✖ ${lang}:`, probleme.join(' | '));
  } else {
    console.log(`✔ ${lang}: Betreff="${copy.subject}" | Buttons=${buttonCount} | erster Button vor Analyse`);
  }
}
fs.writeFileSync('d:/tmp/ap4-mail-vorschau-de.html', gib.buildPremiumLeadEmailHtml(model));
console.log(fehler ? 'FEHLGESCHLAGEN' : 'ALLE SPRACHEN OK — Vorschau: d:/tmp/ap4-mail-vorschau-de.html');
process.exit(fehler ? 1 : 0);
