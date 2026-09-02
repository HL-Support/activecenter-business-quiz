import { NextResponse } from 'next/server';
import { pruefeZugang } from './lib/zugang.js';

/**
 * Passwortschutz vor der GESAMTEN App — Seiten und API.
 *
 * 🔴 Der Matcher muss `/api/...` einschliessen. Der eigentliche Schaden lag nicht auf der
 * Seite, sondern in `app/api/email/[id]/route.js`: dort liegt ein PATCH, der die
 * Mautic-Vorlagen mit dem admin-Konto ueberschreibt. Ein Schutz, der nur die Oberflaeche
 * abdeckt, waere reine Zierde.
 */
export function middleware(request) {
  const { ok, grund } = pruefeZugang(request.headers.get('authorization'), {
    REVIEW_PASS: process.env.REVIEW_PASS,
    REVIEW_USER: process.env.REVIEW_USER,
  });

  if (ok) return NextResponse.next();

  // Ohne konfiguriertes Passwort gibt es nichts zu tippen — dann kein Anmeldefenster,
  // sondern eine klare Absage. Sonst probiert jemand minutenlang Passwoerter fuer eine
  // Tuer, die gar keinen Schluessel hat.
  if (grund === 'kein_passwort_konfiguriert') {
    return new NextResponse('Review-App ist nicht freigeschaltet (REVIEW_PASS fehlt).', {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  return new NextResponse('Zugang nur mit Passwort.', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Activecenter Email Review", charset="UTF-8"',
      'Cache-Control': 'no-store',
    },
  });
}

export const config = {
  // Alles ausser den Build-Artefakten und dem Favicon. `/api/` ist ABSICHTLICH dabei.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
