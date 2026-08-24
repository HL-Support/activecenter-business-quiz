/**
 * Gemeinsame Infrastruktur der E2E-Fehlerfall-Suite (Audit P0-6).
 *
 * Testaufbau: Der frisch gebaute Client aus dist/ wird von einem lokalen Server
 * ausgeliefert; /api/* wird auf die echte Produktions-API proxied. So wird immer
 * der NEUE Client gegen den REALEN Serververtrag geprueft, bevor er deployt ist.
 * Fehlerinjektion passiert im Proxy (nicht im Browser), damit auch keepalive-
 * Requests und Race-Faelle realistisch bleiben.
 *
 * Alle Laeufe sind markierte Testleads (?test=1 -> is_internal_traffic).
 */
const path = require('path');
const fs = require('fs');
const http = require('http');
const { Buffer } = require('buffer');

const projectRoot = path.resolve(__dirname, '../..');
const DIST = path.join(projectRoot, 'dist');
const UPSTREAM = (process.env.E2E_UPSTREAM || 'https://business.activecenter.info').replace(/\/$/, '');
const SLUG = process.env.E2E_SLUG || 'markus';

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

function loadPlaywright() {
  // Aufloesung ab Projektwurzel (playwright liegt im Workspace-node_modules darueber).
  const { createRequire } = require('module');
  return createRequire(path.join(projectRoot, 'package.json'))('playwright');
}

/**
 * Startet den dist-Server mit Produktions-Proxy und steuerbarer Fehlerinjektion.
 * faults.leadTrack: { mode: 'off' | 'refuse' | 'http500', remaining?: number }
 *   refuse  -> Verbindung kappen (Netzausfall)
 *   http500 -> 500 antworten; remaining > 0 zaehlt pro Antwort herunter, dann off
 * faults.leadInit: { mode: 'off' | 'refuse' }
 */
async function startHarness() {
  const faults = { leadTrack: { mode: 'off', remaining: Infinity }, leadInit: { mode: 'off' } };
  const apiLog = [];

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');

    if (url.pathname.startsWith('/api/')) {
      const isTrack = url.pathname === '/api/lead-track';
      const isInit = url.pathname === '/api/lead/init' || url.pathname === '/api/lead-init';

      if (isInit && faults.leadInit.mode === 'refuse') {
        req.destroy();
        return;
      }
      if (isTrack && faults.leadTrack.mode === 'refuse') {
        apiLog.push({ path: url.pathname, injected: 'refuse' });
        req.destroy();
        return;
      }
      if (isTrack && faults.leadTrack.mode === 'http500' && faults.leadTrack.remaining > 0) {
        faults.leadTrack.remaining -= 1;
        if (faults.leadTrack.remaining <= 0) faults.leadTrack.mode = 'off';
        apiLog.push({ path: url.pathname, injected: 'http500' });
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'injected_e2e_fault' }));
        return;
      }

      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const requestBody = Buffer.concat(chunks);
      try {
        const upstream = await fetch(`${UPSTREAM}${url.pathname}${url.search}`, {
          method: req.method,
          headers: { 'Content-Type': req.headers['content-type'] || 'application/json' },
          body: ['POST', 'PUT', 'PATCH'].includes(req.method) ? requestBody : undefined,
        });
        const responseBody = Buffer.from(await upstream.arrayBuffer());
        apiLog.push({
          path: url.pathname,
          status: upstream.status,
          request: requestBody.toString('utf8').slice(0, 2000),
          response: responseBody.toString('utf8').slice(0, 1000),
        });
        res.writeHead(upstream.status, {
          'Content-Type': upstream.headers.get('content-type') || 'application/json',
        });
        res.end(responseBody);
      } catch (error) {
        apiLog.push({ path: url.pathname, proxyError: String(error.message) });
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ proxy_error: String(error.message) }));
      }
      return;
    }

    const file =
      url.pathname === '/' || /^\/[a-z0-9_-]+$/.test(url.pathname) ? '/index.html' : url.pathname;
    const full = path.join(DIST, file);
    if (!full.startsWith(path.resolve(DIST)) || !fs.existsSync(full)) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream' });
    res.end(fs.readFileSync(full));
  });

  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  return {
    faults,
    apiLog,
    baseUrl: `http://localhost:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

async function launchBrowser() {
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'],
  });
  return browser;
}

/** Intro oeffnen und `answers` Quizfragen mit dem bewaehrten Muster beantworten. */
async function driveQuiz(page, baseUrl, answers = 2) {
  await page.goto(`${baseUrl}/${SLUG}?test=1`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3500);
  await page.getByText(/Meinen Code entdecken/).first().click();
  await page.waitForTimeout(1200);

  for (let step = 0; step < answers; step += 1) {
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
      const next = buttons.find((candidate) => /Weiter\s*→/.test((candidate.innerText || '').trim()));
      if (next && !next.disabled) next.click();
    });
    await page.waitForTimeout(900);
  }
}

async function readQueue(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('acLeadEventQueue_v1') || '[]'));
}

async function readDeadLetters(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('acLeadEventDead_v1') || '[]'));
}

async function waitForQueueEmpty(page, timeoutMs = 30000) {
  const started = Date.now();
  for (;;) {
    const entries = await readQueue(page);
    if (entries.length === 0) return 0;
    if (Date.now() - started > timeoutMs) return entries.length;
    await page.waitForTimeout(1000);
  }
}

module.exports = {
  SLUG,
  UPSTREAM,
  startHarness,
  launchBrowser,
  driveQuiz,
  readQueue,
  readDeadLetters,
  waitForQueueEmpty,
};
