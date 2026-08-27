# Phase-4-Design: Ein Aufruf, eine Transaktion — der kanonische Lead-Submit

Stand: 27.08.2026 · Design, noch nicht umgesetzt · Grundlage:
[Antwortverlust-Zielbild §5](2026-08-26-antwortverlust-analyse-und-zielbild.md),
Architekturentscheidung Option C (26.08.), Lehren aus dem
[void-RPC-Vorfall](2026-08-27-void-rpc-teilverluste.md), Audit-Abnahmekriterium
„keine stille Zeilengrenze".

## 1. Ziel

Der kritische Datensatz eines Menschen (Kontakt, 6 Antworten, Profil, Ziel, Barriere,
Attribution) entsteht beim Opt-in über **einen** atomaren, idempotenten Aufruf. Kommt er
an, ist der Mensch vollständig; kommt er nicht an, sieht der Nutzer einen Fehler und
drückt erneut. Ereignisse (Video, Klicks) bleiben Telemetrie — ihr Verlust kostet
Statistik, nie den Menschen.

## 2. Ist-Zustand (nach den Fixes vom 27.08.)

Der Opt-in-Pfad schreibt heute: `lead_state`-Upsert (1 PostgREST-Call) + je Antwort eine
void-RPC `upsert_answer_current` (6 Calls) + MySQL über die PHP-Bridge. Das ist seit
PR #91 korrekt, aber **nicht atomar** (7 Einzel-Calls; ein Abbruch mittendrin hinterlässt
Teilzustände — genau die Klasse, die W5 jetzt bewacht) und läuft über PostgREST.

## 3. Soll-Zustand

```text
Browser ── POST /api/lead/submit (Idempotenzschlüssel: lead_hash + form_response.token) ──┐
                                                                                          ▼
                                                    ┌── EINE Postgres-Transaktion ───────────┐
                                                    │ lead_state  (Upsert on conflict)       │
                                                    │ lead_answers_current (alle 6+2)        │
                                                    │ Profil/Ziel/Barriere SERVERSEITIG      │
                                                    │   deterministisch aus den Antworten    │
                                                    │ lead_events: form_submit (ein Eintrag) │
                                                    │ lead_sync_outbox: Job für MySQL-Kartei │
                                                    └────────────────────────────────────────┘
                                                                       │
                                     Outbox-Worker (existiert) ────────┴──> MySQL-Kartei
```

- **Idempotent:** Unique über `lead_hash` (Kontakt) und `form_response.token`
  (Submit-Versuch) **in derselben Transaktion** — Doppelklick/Retry erzeugt nie Duplikate.
- **Profil serverseitig:** Der Client zeigt nur an; ein Client-Fehler kann kein leeres
  Profil mehr hinterlassen. Der Extraktor/Profilrechner existiert bereits als eine
  Fassung (Live-Pfad, Backfill, Tests) und wandert in die Serverfunktion.
- **MySQL nur noch über die Outbox** (Option C): Der Rücklese-Umweg
  Bridge→MySQL→Readback→PG entfällt; `mysql_contact_id`/`mysql_survey_id` schreibt der
  Outbox-Worker nach erfolgreichem Sync zurück.

## 4. Umsetzung in zwei Stufen

**Stufe A — sofort möglich (noch auf Supabase):** Die gesamte Submit-Transaktion wird
EINE Postgres-Funktion `submit_lead_complete(...)` (SECURITY DEFINER, service_role).
Transport bleibt vorerst PostgREST (ein einziger RPC-Call), aber die Atomarität und
Idempotenz sind gewonnen, und die Funktion ist exakt die, die später der direkte Treiber
aufruft. Bridge-seitig ersetzt sie den 7-Call-Block in
`persistBusinessSubmissionToLeadStateV2`.

**Stufe B — nach Vercel-Abbau und Phase-5-Umzug:** Der Container spricht die
Hetzner-Datenbank mit direktem Treiber (`pg`; Kysely-Merge erst nach dem Abbau —
Entscheidung 25.08., Vercel kann die private DB nicht erreichen). Gleiche Funktion,
gleicher Vertrag, PostgREST verlässt den kritischen Pfad vollständig.

Reihenfolge damit: **Abbau-Tore (02.09.) → Stufe A parallel möglich → Phase-5-Umzug →
Stufe B.**

## 5. Abnahmekriterien (aus den Vorfällen abgeleitet)

1. **Isolierter Pfadbeweis:** Testlauf mit deaktiviertem Ereignisstrom — der Submit
   allein muss den vollständigen Menschen erzeugen (Lehre 27.08.: Redundanz verdeckt
   Fehler; der „Beweis" vom 26.08. maß den falschen Pfad).
2. **Idempotenz-Beweis:** identischer Submit zweimal → eine Person, keine Duplikate,
   zweite Antwort meldet Erfolg.
3. **Teilzustands-Beweis:** erzwungener Abbruch in der Transaktion → NICHTS ist
   geschrieben (kein lead_state ohne Antworten möglich). W5 bleibt als Netz bestehen.
4. **Keine stille Zeilengrenze** und kein `LIMIT` ohne Begründung (gilt weiter, auch für
   SETOF-RPCs, solange irgendein Verbraucher PostgREST spricht).
5. **Fehler sind laut:** Scheitert der Submit, sieht der Nutzer die Wiederholen-Option;
   serverseitig wird gemeldet (GlitchTip), nie still geschluckt.

## 6. Was dabei wegfällt

Der Rücklese-Umweg für Kontaktdaten, die Abhängigkeit des Profils vom Ereignisstrom, die
Sonderbehandlung „Kontakt ohne Profil" im Nurture, und die 7-Call-Sequenz des heutigen
Opt-in-Pfads (damit auch die W5-Fehlerklasse im Live-Pfad — W5 bleibt trotzdem, als
Wächter über Altbestand und Regressionen).

## 7. Offene Entscheidungen

1. **Stufe A jetzt bauen** (empfohlen: ja — kleiner Umbau, sofortige Atomarität, kein
   Wegwerf-Code, weil die Funktion in Stufe B identisch weiterlebt) oder direkt auf
   Stufe B warten?
2. Verhalten bei MySQL-Ausfall im Übergang: Outbox puffert (empfohlen, existiert) — die
   heutige synchrone MySQL-Weiterleitung im Submit-Pfad entfällt dann bewusst.
