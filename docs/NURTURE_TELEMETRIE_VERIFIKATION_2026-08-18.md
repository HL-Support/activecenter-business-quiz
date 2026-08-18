# Nurture-Telemetrie: Live-Verifikation und Maßnahmen (18.08.2026)

Anlass: Architektur-Review des Designs „Multi-Project Nurture Analytics"
(`HL-Support_Analytics/docs/designs/2026-08-06-multi-project-nurture-analytics-design.md`)
mit anschließendem Auftrag, den Umsetzungsstand zu verifizieren, Lücken zu schließen und die
Dokumentation nachzuziehen. Alle Prüfungen erfolgten read-only gegen die Live-Systeme
(n8n-API, Supabase Stats_Logs, produktive Vercel-Deployments, Better-Stack-API).

## Was geprüft wurde — und das Ergebnis

### 1. Sender-Workflow `RqKSRTgFv8mv04H2` (n8n, live gelesen)

- `Supabase - Log Sent` ruft das RPC `record_nurture_sent` mit korrekter `={{ … }}`-Expression
  auf. Der Expression-Bug vom 23.06.2026 (Body ohne `=`-Prefix, Events gingen verloren, siehe
  `NURTURE_REMEDIATION_PLAN_2026-07-21.md`) ist behoben.
- `Supabase - Log Skip` ruft `record_nurture_skip`, `Supabase - Log Run` ruft
  `record_nurture_run` (Execution-ID als Idempotenzschlüssel). Beide vorhanden und aktiv.
- Kadenz bestätigt: Schedule-Trigger alle 2 Stunden, Workflow aktiv, `versionId` vom 06.08.2026.

### 2. Fehler-Workflow `vSpXIyOUK9WIlvxi` (live gelesen)

- Neben dem Postmark-Alarm existiert der Zweig `Filter - Business Nurture Workflow` →
  `Supabase - Log Nurture Failure` (RPC `record_nurture_failure`).
- Ende-zu-Ende bewiesen: 4 `nurture_error`-Events in `lead_events` (DNS-Ausfälle am
  06.08./09.08./11.08.) **und** 4 zugehörige `nurture_runs`-Zeilen mit `status='failed'`,
  Fehlercode und betroffenem Node.

### 3. Live-Daten in Supabase (Stats_Logs, Stichtag 18.08.2026)

- `nurture_sent`: 72 Events in 14 Tagen, letztes am 17.08.; Payload vollständig
  (`phase`, `email_id`, `language`, `variant`, `project_key`, `sequence_key`,
  `telemetry_version: 2`, stabile `event_uid` wie `nurture_sent_contact_5754_b1`).
- `nurture_runs`: 147 Läufe seit 06.08. im sauberen 2-Stunden-Raster, letzter am Prüftag;
  143 `success`, 4 `failed`.
- `nurture_subject_states`: 692 `sent` / 82 `skipped`. Wiederholte identische Skips erhöhen
  nur den Zähler — **dass seit dem 08.08. kaum neue `nurture_skipped`-Events kommen, ist
  gewollte Dedup-Logik, kein Ausfall.**
- `nurture_resume_opened`: 95 Events insgesamt, mit gefüllten `acn_phase`/`acn_email`-Werten
  (auch Follow-up-Phase A3 nachgewiesen). Die `acn_*`-Parameter hängen in den
  Mautic-Template-CTAs (`…&acn_phase=A2&acn_email=13`), nicht im n8n-Link-Builder.
- Grants: `anon`/`authenticated` haben auf allen `nurture_*`-Tabellen null Rechte (verifiziert).

### 4. Deployments (live aufgerufen)

- HBA `get_mail_monitoring_events`: antwortet produktiv mit `410 mail_monitoring_moved`
  und Verweis auf `https://hl-support-analytics.vercel.app` — Cutover abgeschlossen, der
  frühere ungeschützte Endpoint existiert nicht mehr.
- HL-Support Analytics `nurture-overview`/`health/nurture`: ohne Token/Key sauber `401`;
  mit Monitoring-Key `200 ok` mit frischen Signalwerten.

### Korrektur zweier eigener Befunde aus dem Review

1. „`nurture_runs` kennt keine Fehler-Läufe" — **falsch**: `record_nurture_failure` markiert
   den betroffenen Lauf als `failed` (siehe Punkt 2). Kein Handlungsbedarf.
2. „Skip-Logging seit 08.08. ausgefallen" — **falsch**: State-Dedup per
   `nurture_subject_states` (Design `2026-08-06-nurture-person-funnel-dedup-design.md`).

## Was am 18.08.2026 geändert wurde

1. **Externe Überwachung (die eine echte Lücke):** Better-Stack-Monitor **4828434**
   („[NURTURE] Quiz-Nurture Telemetrie") angelegt — pollt
   `/api/health/nurture` alle 3 Minuten mit `X-Monitoring-Key`, E-Mail- und Push-Alarm,
   erster Check „up". Damit gibt es zwei unabhängige Melder: Better Stack auf die
   Health-Ampel plus die bestehende Postmark-Crash-Mail aus n8n.
   Hinweis: `NU-FAIL-001` zählt Fehler über 24 h — ein einzelner transienter Fehler hält den
   Monitor absichtlich bis zu 24 h auf „degraded".
2. **HL-Support Analytics (Repo-Änderungen, eigener Commit dort):**
   `api/nurture-health.js` liefert jetzt wie die übrigen Health-Endpunkte einen
   `runbook`-Link; Test angepasst; Runbook um „External monitoring" und die
   Varianten-Herleitung ergänzt; AGENTS.md um den Monitor ergänzt; Design-Dokument auf
   „implemented" gesetzt mit Addendum aller bewussten Abweichungen. Projekt-Check grün
   (98/98 Tests, Build, Verify).
3. **Varianten-Zuordnung bewusst NICHT im Sendepfad „repariert":**
   `acn_variant`/`acn_run` bleiben in den Template-Links leer. Die Copy-Variante ist
   verlustfrei herleitbar, weil jede Mautic-Template-ID genau einer Kombination aus Phase,
   Sprache und Variante entspricht (Mapping: Sender-Node `Code - Select Email ID` bzw.
   `scripts/backfill-nurture-sent-events.py` `PHASE_IDS`). Die 100+ Live-Templates wurden
   nicht angefasst.
4. **Doku im Ordner `Leads_quiz_Nurture`** (nicht git-versioniert, daher hier festgehalten):
   `docs/NURTURE_IMPACT_TRACKING_IMPLEMENTATION_PLAN.md` aktualisiert — Paket 2
   (`nurture_resume_opened`) auf ✅ ERLEDIGT, die offene Mautic-Klick-Tracking-Verifikation
   per Produktionsbeweis geschlossen (95 Events mit intakten Parametern), Paket 0 als durch
   die Nurture-Zentrale überholt markiert.

## Betriebsreferenzen

- Dashboard: HL-Support Analytics → Bereich **Nurturing** (Übersicht / Personen / Aktivitäten)
- Runbook: `HL-Support_Analytics/docs/runbooks/nurture-monitoring.md`
- Health: `https://hl-support-analytics.vercel.app/api/health/nurture` (Monitor-Code `NURTURE-001`)
- Better-Stack-Monitor: `4828434`
