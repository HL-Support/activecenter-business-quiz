/**
 * Herkunft des laufenden Commits (Audit 13.5.6).
 *
 * Warum eine eigene Datei: Die Aufloesung wird an zwei Stellen gebraucht, die sich NICHT
 * gegenseitig laden duerfen - /health/live in server/http-adapter.js und die Release-Angabe
 * in server/fehlermeldung.js, die der Adapter seinerseits einbindet. Ein wechselseitiges
 * require() waere ein Zyklus; eine zweite Kopie der Reihenfolge waere schlimmer, weil
 * Startzeile, Healthendpunkt und Fehlermeldung dann auseinanderlaufen koennten, ohne dass
 * es jemandem auffaellt.
 *
 * Inhaltlich unveraendert aus server/http-adapter.js hierher gezogen; der Adapter
 * re-exportiert `resolveCommit` weiterhin, damit kein Aufrufer angepasst werden muss.
 */
'use strict';

/**
 * Reihenfolge, in der die Herkunft des Commits gesucht wird. Die erste Quelle mit einem
 * plausiblen Wert gewinnt:
 *
 *  1. `GIT_COMMIT_SHA`      - ins Image gebacken (Dockerfile-ARG, siehe dort). Der explizit
 *                             gesetzte Wert schlaegt alles andere, damit ein `docker build`
 *                             ausserhalb von Coolify (Container-Smoke, CI) beweisbar bleibt.
 *  2. `SOURCE_COMMIT`       - setzt COOLIFY zur LAUFZEIT in den Container. Empirisch belegt
 *                             am 25.08.2026 an der Staging-App: der Wert ist derselbe
 *                             40-stellige SHA, mit dem Coolify das Image taggt
 *                             (`-t <resource-uuid>:<sha>`). Coolify uebergibt KEINEN
 *                             Commit als Build-Arg - die Bau-Zeile kennt nur COOLIFY_URL,
 *                             COOLIFY_FQDN, COOLIFY_BRANCH, COOLIFY_RESOURCE_UUID und
 *                             COOLIFY_BUILD_SECRETS_HASH.
 *  3. `VERCEL_GIT_COMMIT_SHA` - der gleichwertige Wert im Vercel-Betrieb, damit dieselbe
 *                             Antwort auch waehrend des Rollback-Fensters etwas aussagt.
 *
 * Fehlt alles, bleibt das Feld LEER statt zu raten - ein falscher Commit im Rollback-Beweis
 * waere schaedlicher als gar keiner.
 */
const COMMIT_ENV_ORDER = ['GIT_COMMIT_SHA', 'SOURCE_COMMIT', 'VERCEL_GIT_COMMIT_SHA'];

/** Ein Commit-SHA ist hexadezimal und 7-40 Zeichen lang. Alles andere ist kein Commit. */
const COMMIT_SHA = /^[0-9a-f]{7,40}$/i;

/**
 * Liefert den laufenden Commit und die Variable, aus der er stammt. Die Herkunft wird
 * mitgegeben, weil sie beim Cutover die eigentliche Frage beantwortet: Steht da ein
 * gebackener Wert (`GIT_COMMIT_SHA`) oder einer, den die Plattform beisteuert
 * (`SOURCE_COMMIT`)? Ohne diese Angabe sieht beides gleich aus.
 */
function resolveCommit({ env = process.env } = {}) {
  for (const name of COMMIT_ENV_ORDER) {
    const value = String(env[name] || '').trim();
    if (COMMIT_SHA.test(value)) return { commit: value.toLowerCase(), commit_source: name };
  }
  return { commit: '', commit_source: '' };
}

module.exports = { COMMIT_ENV_ORDER, COMMIT_SHA, resolveCommit };
