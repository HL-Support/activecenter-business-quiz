# Phase 4 — Direkter Datenbankzugriff (Kysely)

🔴 **Dieser Branch wird NICHT gemergt, solange Vercel der Hosting-Rückweg ist**
(Entscheidung Markus 25.08.2026: Vercel erreicht die private DB nicht; Merge erst
nach dem Vercel-Abbau laut Checkliste).

## Zielbild (aus der Antwortverlust-Analyse, von Markus freigegeben)

Ein Opt-in = **ein Aufruf, eine Transaktion, idempotent**; Profil und Barriere werden
serverseitig abgeleitet. Keine Hin-und-Her-Geschichten zwischen Client, PostgREST und
RPCs. Details: `docs/audits/2026-08-26-antwortverlust-analyse-und-zielbild.md`.

## Regeln für diesen Umbau

1. **Keine stille Zeilengrenze** (Abnahmekriterium Audit Phase 4 Punkt 8): Kysely
   liest ohne PostgREST-Deckel — trotzdem hat jede Listenabfrage entweder eine bewusste
   `limit`-Begründung oder gar keins. Solange irgendein Verbraucher noch PostgREST
   spricht, gilt das Kriterium auch für RPCs mit `SETOF`-Rückgabe.
2. **Migration Runner** (Audit 13.5.3): versionierte Migrationen im Repo, genau EIN
   Release-Schritt führt sie aus, Advisory-Lock gegen Parallelläufe, keine Migration
   beim Container-Start. Expand/Contract, weil Coolify rollierend deployt (alte und
   neue Version laufen kurz parallel).
3. **Verbindung**: `DATABASE_URL` (Umgebungsvariable, nie im Repo). In Phase 4 zeigt
   sie auf Supabase (Direkthost über IPv6, Pooler als IPv4-Rückfallebene — beide Wege
   am 26.08. gemessen); ab Phase 6 auf die private Hetzner-PG. Der Code merkt den
   Unterschied nicht.
4. **Schreiber-Scope**: alle Schreibpfade aus dem Verbraucher-Inventar §5D — nicht nur
   die Bridge. Ein Schreiber, der PostgREST behält, hält die alten Fallen am Leben.

## Stand

- `verbindung.js`: Kysely-Fabrik (PostgresDialect, pg-Pool), fail-fast ohne
  `DATABASE_URL`, ein Pool pro Prozess.
- Nächste Schritte: Schema-Typen aus dem Objektmanifest ableiten
  (`docs/audits/cutover-vorbereitung/objektmanifest/`), ersten Schreibpfad
  (Opt-in-Transaktion) als Parallelpfad hinter Feature-Flag bauen, Migration Runner
  aufsetzen.
