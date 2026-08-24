# P0-1 Abnahme: Persistente Lead-Event-Queue (24.08.2026)

Audit-Befund 4.1 (fire-and-forget-Writer verliert Events → verlorene Hot-Lead-Mails,
René-Hammer-Fehlerklasse) ist mit `src/lib/lead-event-queue.js` geschlossen.

## Garantien

- Jedes Event wird **synchron** in `acLeadEventQueue_v1` persistiert, bevor Netzwerkarbeit
  beginnt (CTA-sicher: Tab-Wechsel/Navigation verliert nichts mehr).
- Stabile `event_uid` über alle Versuche → Server-Idempotenz greift
  (`on_conflict=event_uid`, Hot-Lead-Dedupe per Advisory-Lock): Retries können keine
  Doppel-Events und keine Doppel-Mails erzeugen.
- Strikt FIFO, genau ein Request in flight; exponentieller Backoff (2 s·2^n, Cap 5 min,
  ±30 % Jitter); permanente Fehler (400/401/403/405/413/422) und erschöpfte Retries (12)
  wandern in `acLeadEventDead_v1` (max. 20) statt die Queue zu blockieren.
- Nachlieferung bei App-Start (unabhängig vom Erfolg von `/api/lead-init` — Offline-Reload-
  Szenario), bei `online`, bei Sichtbarkeitswechsel und per 20-s-Weckruf solange nicht leer.
- Bounds: max. 150 Einträge; Überlauf verdrängt zuerst rekonstruierbares `video_progress`,
  nie CTA-/Formular-Events.

## Beweisführung

1. 12 deterministische Unit-Tests (`scripts/tests/lead-event-queue.test.js`): synchrone
   Persistenz vor Fetch, FIFO, Backoff, UID-Stabilität, Reload-Nachlieferung, Dead-Letter,
   Reentranz, Storage-Korruption, Stall-Guard bei vollem localStorage.
2. Zwei neue `verify.js`-Gates: kein fire-and-forget mehr in core.js; Queue-Init beim
   App-Start vorhanden.
3. **Browser-Beweis `replay-beweis-2026-08-24.json`**: neuer dist-Build gegen die echte
   Produktions-API (lokaler Proxy), markierter Testlead. Phase A: `/api/lead-track`
   vollständig blockiert → 7 Events (page_view…quiz_answer) in der Queue, Retries liefen.
   Phase B: Reload mit **absichtlich blockiertem `/api/lead-init`** → alle 7 Events in
   FIFO-Ordnung mit identischen `event_uid`s nachgeliefert, 7×200/`success:true`,
   Queue leer, 0 Dead-Letters.

## Bewusste Nicht-Ziele (Begründung im Modulkopf)

Kein Multi-Tab-Lock (Server-Idempotenz deckt Doppel-Sends ab), kein IndexedDB (asynchron —
bräche die synchrone CTA-Garantie), keine Änderung an Legacy-`ac-track.js` (P2) oder an der
Server-API.

Zusätzlich in diesem Stand: `engines.node: 24.x` + `packageManager: pnpm@10.32.1` gepinnt
(Vercel-Projekt läuft verifiziert auf 24.x, CI auf 24/pnpm 10 — dokumentiert nur die Realität).
