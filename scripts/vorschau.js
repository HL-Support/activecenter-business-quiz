#!/usr/bin/env node
'use strict';

/**
 * Lokale Vorschau des frisch gebauten Clients — zum Ansehen und Durchklicken,
 * BEVOR etwas live geht.
 *
 *   pnpm run vorschau        (baut dist/ und startet den Server)
 *
 * Was dahinter passiert: Die E2E-Harness liefert dist/ aus und proxied /api/*
 * auf die Produktion. Der Optin-Submit und die E-Mail-Pruefung sind gestubbt
 * (faults.stubOptin): Es entsteht KEIN Lead und es geht KEINE Mail raus —
 * man kann das Formular also gefahrlos absenden und die Ergebnisseite samt
 * Sticky-CTA ansehen. Tracking-Events laufen als markierter Testtraffic
 * (?test=1 -> is_internal_traffic), die Statistik bleibt sauber.
 *
 * Beenden mit Strg+C.
 */
const { startHarness, SLUG } = require('./e2e/lib.js');

(async () => {
  const harness = await startHarness();
  harness.faults.stubOptin = true;

  console.log('');
  console.log('  Vorschau laeuft (Optin gestubbt - kein Lead, keine Mail):');
  console.log('');
  console.log(`      ${harness.baseUrl}/${SLUG}?test=1`);
  console.log('');
  console.log('  Beenden mit Strg+C.');
})().catch((error) => {
  console.error('Vorschau konnte nicht starten:', error.message);
  process.exit(1);
});
