# n8n-Workflows — versionierte Ausfuhr der laufenden Definitionen

Bis zum 28.08.2026 existierten die Workflow-Definitionen **nur** in der laufenden
n8n-Instanz. Ein Versehen an der Oberfläche war unwiederbringlich. Seitdem liegt hier ein
datierter Export.

## Was hier liegt

`export-2026-08-28/` — zehn Workflows, direkt aus `https://n8n.hl-support.biz` gezogen,
plus `_index.json` mit ID, Name, Aktiv-Zustand, Knotenzahl und `versionId` je Workflow.

| Workflow | ID | Takt | Rolle |
| --- | --- | --- | --- |
| AC - Lead Post Processor | `9RZdrLxfA8IRhd55` | alle 5 Min | 🔴 verschickt **Opt-in-Mail und Zugangsmail**, pollt die Legacy-MySQL |
| AC - Lead Sync Outbox Worker | `ALLHYLRwkvujkuFJ` | jede Minute | ruft `/api/lead-outbox-worker` in diesem Repo |
| AC - Quiz Nurture Email Sender | `RqKSRTgFv8mv04H2` | alle 2 h | Nurture-Strecke über Mautic, liest die **Plattform-DB** |
| AC - Lead System Health Monitor | `m52uJBbSQUFUA2Dm` | alle 15 Min | Gesundheitsprüfung |
| AC - Quiz Reactivation Trigger | `XfefeLNF1DYJPGc8` | Webhook | Reaktivierung |
| AC - Quiz Evergreen Scheduler | `pUaGat8invCLmFx1` | täglich | Evergreen-Strecke |
| AC - Quiz Nightly Data Sync | `BLQLWW8oN8M4BSe1` | nächtlich | MySQL → Mautic |
| AC - Error Alert (Postmark) | `vSpXIyOUK9WIlvxi` | Error-Trigger | Alarmkanal, schreibt in die **Plattform-DB** |
| Supabase Keep-Alive | `CODeVYeZ_63C-DoT4Z8SN` | — | **tot**, gelöscht am 28.08. — Export ist der Rückweg |
| AC - Quiz Video Inactivity Checker | `ie2WEc1RmFhN5LQf` | — | **tot**, gelöscht am 28.08. — Export ist der Rückweg |

## 🔴 Regeln für Änderungen

1. **Nie per SQL.** n8n hält die Definitionen im RAM-Cache; ein direktes `UPDATE` wird vom
   laufenden Prozess ignoriert. Nur ein **API-PUT** erzeugt eine neue `versionId`.
   Verfahren: `agent-core/skills/n8n-workflow-update`.
2. **Vorher sichern**, nachher die `versionId` vergleichen — sie muss sich geändert haben.
3. `PUT /workflows/{id}` nimmt nur `name`, `nodes`, `connections`, `settings`.
   `settings` wird streng geprüft: `binaryMode` und `timeSavedMode` werden mit
   `400 must NOT have additional properties` abgelehnt. **n8n ergänzt `settings`, es
   ersetzt sie nicht** — ein PUT ohne diese Schlüssel lässt sie stehen (nachgemessen).
   Ein abgelehnter PUT (400) schreibt nichts und taugt als gefahrlose Tastprobe.
4. **Dieser Export ist eine Momentaufnahme, keine Quelle der Wahrheit.** Wer deployt,
   zieht vorher frisch. Vor grösseren Eingriffen einen neuen datierten Ordner anlegen.

## Zusammenhang

Was welche Mail verschickt, steht in [`../docs/MAILWEGE.md`](../docs/MAILWEGE.md).
Der Plan, den Benachrichtigungsweg von der Legacy-MySQL auf die Plattform zu holen, steht
in [`../docs/plans/benachrichtigungsweg-auf-plattform.md`](../docs/plans/benachrichtigungsweg-auf-plattform.md).
