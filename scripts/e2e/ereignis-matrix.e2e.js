/**
 * E0b des Maschine/Template-Plans (docs/plans/2026-09-01-frontend-maschine-template.md):
 * Ereignis-Matrix und Style-Schnappschuss — die Browser-Haelfte des Beweisgeschirrs.
 *
 * Ein deterministischer Funnel-Durchlauf (immer die ERSTE Antwortoption → Profil
 * "R", Optin gegen den Harness-Stub, bis Video 1 erreicht) friert zwei Dinge ein:
 *
 *   1. EREIGNIS-MATRIX: die geordnete Folge aller an /api/lead-track gesendeten
 *      Ereignisse bis einschliesslich video_viewed — je Ereignis Name + sortierte
 *      Payload-SCHLUESSEL (Werte sind fluechtig, Schluessel sind der Vertrag).
 *      Verliert eine spaetere Etappe ein Ereignis oder ein Feld, wird es rot.
 *      Ereignisse NACH video_viewed (Player-Verhalten, timing-abhaengig) werden
 *      bewusst nicht eingefroren — die Video-Engine zieht in E2 unveraendert um
 *      und bekommt dort eigene Unit-Vertraege.
 *
 *   2. STYLE-SCHNAPPSCHUSS: je Screen ein Hash ueber alle Inline-Style-Attribute
 *      (Pfad + style-Text jedes Elements). Vor E3/E4 eingefroren, danach der
 *      Beweis der Pixel-Gleichheit auf Style-Ebene. Der analyzing-Screen ist
 *      ausgenommen (laufende Animation, nicht stabil einfrierbar). Bei einer
 *      Abweichung schreibt der Test die Ist-Liste nach e2e-artifacts/ zum Diffen.
 *
 * Referenz-Screenshots je Screen landen in e2e-artifacts/ (Anschauung, nicht
 * Assertion). lead-track laeuft als markierter Testtraffic (?test=1) gegen die
 * echte API; der Optin-Submit ist gestubbt (keine Kartei-Zeile, keine Mail).
 *
 * 🔴 Bewusste Produktionswirkung, kein Fehler-Rest (Stand 02.09., nach #137):
 * Jeder Lauf legt einen ECHTEN, aber markierten Lead in leads.lead_state an -
 * test_lead_marked, ohne Rang-Auftrag, ohne Nurture. Wer Zahlen im Ads-Cockpit
 * oder direkt in der Datenbank liest, muss internen Verkehr weiterhin selbst
 * herausrechnen (is_internal_traffic bzw. @example.com-Adressen).
 *
 * Golden aktualisieren (nur bewusst, Begruendung in den PR):
 *   GOLDEN_AKTUALISIEREN=1 pnpm run e2e:matrix
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// driveQuizToOptin aus lib.js reicht hier nicht: die Schleife ist inline
// nachgebaut, weil unterwegs Schnappschuesse (Frage 1/5, Aspiration) entstehen.
const {
  startHarness,
  launchBrowser,
  fillOptin,
  waitForQueueEmpty,
  readDeadLetters,
} = require('./lib.js');

const GOLDEN_DIR = path.resolve(__dirname, 'golden');
const MATRIX_GOLDEN = path.join(GOLDEN_DIR, 'ereignis-matrix.golden.json');
const STYLE_GOLDEN = path.join(GOLDEN_DIR, 'style-schnappschuss.golden.json');
const AKTUALISIEREN = process.env.GOLDEN_AKTUALISIEREN === '1';
const VIEWPORT = { width: 390, height: 844 };
const CTA_PATTERN = /Video ansehen/;

function artefakt(name) {
  fs.mkdirSync('e2e-artifacts', { recursive: true });
  return path.join('e2e-artifacts', name);
}

/** Alle Inline-Styles der Seite als [pfad, styleText], stabil geordnet. */
async function styleListe(page) {
  return page.evaluate(() => {
    function pfad(el) {
      const teile = [];
      for (let node = el; node && node.nodeType === 1 && teile.length < 12; node = node.parentElement) {
        const eltern = node.parentElement;
        const index = eltern ? Array.prototype.indexOf.call(eltern.children, node) : 0;
        teile.unshift(`${node.tagName.toLowerCase()}:${index}`);
      }
      return teile.join('>');
    }
    return Array.from(document.querySelectorAll('[style]')).map((el) => [
      pfad(el),
      el.getAttribute('style') || '',
    ]);
  });
}

async function screenSchnappschuss(page, name, sammlung) {
  const liste = await styleListe(page);
  const hash = crypto.createHash('sha256').update(JSON.stringify(liste)).digest('hex');
  sammlung.hashes[name] = { hash, elemente: liste.length };
  sammlung.listen[name] = liste;
  await page.screenshot({ path: artefakt(`matrix-${name}.png`), fullPage: true }).catch(() => {});
}

function ereignisMatrix(harness, deadLetters) {
  const gesendet = harness.apiLog
    .filter((entry) => entry.path === '/api/lead-track' && typeof entry.request === 'string')
    .map((entry) => {
      try {
        const body = JSON.parse(entry.request);
        return {
          ereignis: body.event_name || '',
          felder: Object.keys(body.payload || {}).sort(),
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  // Dead-Letters zaehlen mit: gesendet heisst gesendet, auch wenn die API ablehnt.
  for (const toter of deadLetters) {
    gesendet.push({
      ereignis: `${toter.event_name} (dead-letter)`,
      felder: Object.keys(toter.payload || {}).sort(),
    });
  }

  // Nur bis einschliesslich des ersten video_viewed einfrieren (s. Kopfkommentar).
  const ende = gesendet.findIndex((e) => e.ereignis === 'video_viewed');
  return ende >= 0 ? gesendet.slice(0, ende + 1) : gesendet;
}

function vergleicheOderSchreibe(goldenPath, ist, meldung) {
  if (AKTUALISIEREN || !fs.existsSync(goldenPath)) {
    fs.mkdirSync(path.dirname(goldenPath), { recursive: true });
    fs.writeFileSync(goldenPath, `${JSON.stringify(ist, null, 2)}\n`, 'utf8');
    return { geschrieben: true };
  }
  const soll = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));
  assert.deepEqual(ist, soll, meldung);
  return { geschrieben: false };
}

test('Ereignis-Matrix und Style-Schnappschuss entsprechen dem Golden-Master', async (t) => {
  const harness = await startHarness();
  harness.faults.stubOptin = true;
  const browser = await launchBrowser();
  const context = await browser.newContext({ viewport: VIEWPORT, locale: 'de-DE' });
  const page = await context.newPage();
  const styles = { hashes: {}, listen: {} };

  t.after(async () => {
    try {
      fs.writeFileSync(artefakt('matrix-api-log.json'), JSON.stringify(harness.apiLog, null, 2));
      fs.writeFileSync(
        artefakt('matrix-style-listen.json'),
        JSON.stringify(styles.listen, null, 2)
      );
    } catch {
      /* Artefakte sind best effort */
    }
    await browser.close();
    await harness.close();
  });

  // ---------- Intro ----------
  await page.goto(`${harness.baseUrl}/markus?test=1`, {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  await page.waitForTimeout(3500);
  await screenSchnappschuss(page, 'intro', styles);

  // ---------- Quiz bis Optin (deterministisch: immer erste Option -> Profil R) ----------
  // Unterwegs Schnappschuesse von Frage 1 (Phase 1, gold) und Frage 5 (Phase 2, blau).
  await page.getByText(/Meinen Code entdecken/).first().click();
  await page.waitForTimeout(1200);
  await screenSchnappschuss(page, 'frage-1', styles);

  const deadline = Date.now() + 90000;
  let aspirationGesehen = false;
  let frage5Gesehen = false;
  for (;;) {
    const optinDa = await page
      .locator('input[placeholder="Dein Vorname"]')
      .first()
      .isVisible()
      .catch(() => false);
    if (optinDa) break;
    if (Date.now() > deadline) throw new Error('Optin nicht erreicht (90 s)');

    // innerText spiegelt text-transform: uppercase — darum case-insensitiv.
    const istAspiration = await page.evaluate(() =>
      /dein fokus/i.test(document.body.innerText)
    );
    if (istAspiration && !aspirationGesehen) {
      aspirationGesehen = true;
      await screenSchnappschuss(page, 'aspiration-confirm', styles);
    }
    if (!istAspiration && aspirationGesehen && !frage5Gesehen) {
      const frageText = await page.evaluate(() => /frage\s*5/i.test(document.body.innerText));
      if (frageText) {
        frage5Gesehen = true;
        await screenSchnappschuss(page, 'frage-5-phase2', styles);
      }
    }

    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const option = buttons.find((candidate) => {
        const label = (candidate.innerText || '').trim();
        if (label.length < 12) return false;
        if (/Weiter|Auswertung|zurück|nochmal|starten|entdecken/i.test(label)) return false;
        return true;
      });
      if (option) option.click();
    });
    await page.waitForTimeout(700);
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const next = buttons.find((candidate) =>
        /^(Weiter|Auswertung starten)\s*→$/.test((candidate.innerText || '').trim())
      );
      if (next && !next.disabled) next.click();
    });
    await page.waitForTimeout(900);
  }
  assert.ok(aspirationGesehen, 'Aspiration-Bestaetigung muss auf dem Weg liegen');
  await screenSchnappschuss(page, 'optin', styles);

  // ---------- Optin absenden (Stub), Ergebnis, Videos ----------
  const submit = await fillOptin(page, {
    firstName: 'E2E Matrix',
    email: 'e2e-matrix@example.com',
  });
  await submit.click();
  await page
    .locator('button', { hasText: CTA_PATTERN })
    .first()
    .waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForTimeout(600);
  await screenSchnappschuss(page, 'result', styles);

  await page.locator('button', { hasText: CTA_PATTERN }).first().click();
  await page
    .locator('iframe[src*="mediadelivery.net"]')
    .first()
    .waitFor({ state: 'attached', timeout: 15000 });
  await page.waitForTimeout(800);
  await screenSchnappschuss(page, 'video-1', styles);

  // ---------- Queue leeren, Matrix bauen ----------
  const rest = await waitForQueueEmpty(page, 90000);
  assert.equal(rest, 0, `Event-Queue muss leerlaufen (noch ${rest})`);
  const deadLetters = await readDeadLetters(page);
  assert.equal(
    deadLetters.length,
    0,
    `keine Dead-Letters erwartet: ${JSON.stringify(deadLetters.map((d) => d.event_name))}`
  );

  const matrix = ereignisMatrix(harness, deadLetters);

  // Unverhandelbare Anker unabhaengig vom Golden (Schutz gegen leeres Golden):
  const namen = matrix.map((e) => e.ereignis);
  for (const pflicht of [
    'page_view',
    'quiz_started',
    'question_viewed',
    'quiz_answer',
    'aspiration_confirmed',
    'quiz_result',
    'optin_viewed',
    'form_submit',
    'form_submitted',
    'result_viewed',
    'result_cta_click',
    'video_viewed',
  ]) {
    assert.ok(namen.includes(pflicht), `Pflichtereignis fehlt im Durchlauf: ${pflicht}`);
  }
  assert.equal(
    namen.filter((n) => n === 'quiz_answer').length,
    6,
    'genau sechs beantwortete Fragen erwartet'
  );

  const matrixErgebnis = vergleicheOderSchreibe(
    MATRIX_GOLDEN,
    matrix,
    'Ereignis-Matrix weicht vom Golden-Master ab — entweder hat eine Verschiebung ' +
      'ein Ereignis/Feld verloren (Fehler beheben) oder es ist eine bewusste ' +
      'Vertragsaenderung (GOLDEN_AKTUALISIEREN=1 + Begruendung im PR).'
  );

  // ---------- Style-Schnappschuss ----------
  const erwarteteScreens = [
    'intro',
    'frage-1',
    'aspiration-confirm',
    'frage-5-phase2',
    'optin',
    'result',
    'video-1',
  ];
  for (const screen of erwarteteScreens) {
    assert.ok(styles.hashes[screen], `Style-Schnappschuss fehlt fuer Screen: ${screen}`);
    assert.ok(
      styles.hashes[screen].elemente > 10,
      `Screen ${screen}: verdaechtig wenige gestylte Elemente (${styles.hashes[screen].elemente})`
    );
  }
  const styleErgebnis = vergleicheOderSchreibe(
    STYLE_GOLDEN,
    styles.hashes,
    'Style-Schnappschuss weicht ab — die Ist-Listen liegen zum Diffen in ' +
      'e2e-artifacts/matrix-style-listen.json. Verhaltensgleiche Etappen duerfen ' +
      'hier NICHTS aendern; bewusste Optik-Aenderungen: GOLDEN_AKTUALISIEREN=1 + PR.'
  );

  if (matrixErgebnis.geschrieben || styleErgebnis.geschrieben) {
    console.log('Golden-Master geschrieben:', {
      matrix: matrixErgebnis.geschrieben,
      style: styleErgebnis.geschrieben,
    });
  }
});
