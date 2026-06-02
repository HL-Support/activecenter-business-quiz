# Business Leads Quiz Master Prompt

Nutze diese Datei zusammen mit `AGENTS.md`. `AGENTS.md` enthaelt die detailreichen Projektregeln; diese Datei ist der schnelle Runtime-Einstieg fuer neue Agenten.

## Start

1. Lies `D:\OneDrive\Antigravity Laptop\agent-core\governance\GOVERNANCE_RULES.json`.
2. Lies `D:\OneDrive\Antigravity Laptop\activecenter-web\AGENTS.md`.
3. Lies `D:\OneDrive\Antigravity Laptop\activecenter-web\business_leads_quiz\AGENTS.md`.
4. Lade Projekterinnerungen:
   ```powershell
   . "D:\OneDrive\Antigravity Laptop\agent-core\scripts\direct-api-helpers.ps1"
   Read-Memory -Query "business leads quiz aktuelle entscheidungen status"
   ```

## Brain und Knowledge

- mem0: dynamische Entscheidungen, Status, Architekturentscheidungen.
- AnythingLLM: statische Referenzen, Mastermind-/Policy-Wissen, laengere Dokumente.
- Standardpfad ist Direct API ueber `direct-api-helpers.ps1`, nicht MCP.

## Git und Deploy

- Safety project key: `business_leads_quiz`.
- Vor Commit: `npm run safety:guard -- --project business_leads_quiz`.
- Vor Production: `npm run safety:deploy -- --project business_leads_quiz`.
- GitHub CI: `Activecenter Safety`, job `safety`.
- Production nur aus `main`; Branch Protection verlangt den gruenen `safety`-Check.

## Wichtig

`lead_hash` ist die kanonische Lead-ID. Resume, Video-Tracking, Supabase-State, n8n/Mautic-Followups und Hotlead-Logik duerfen nicht wieder parallele Wahrheiten erzeugen.
