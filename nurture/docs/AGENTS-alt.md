# Leads Quiz Nurture

## Shared Operating Layer

- Read `D:\Antigravity_Projects\agent-core\governance\GOVERNANCE_RULES.json` before substantial work.
- Use direct brain helpers from `D:\Antigravity_Projects\agent-core\scripts\direct-api-helpers.ps1`.
- Session start:
  ```powershell
  . "D:\Antigravity_Projects\agent-core\scripts\direct-api-helpers.ps1"
  Read-Memory -Query "leads quiz nurture mautic aktuelle entscheidungen status"
  ```
- Use `Query-KnowledgeBase` for AnythingLLM and `Save-Memory -Tier PROJECT` for durable project updates.
- Before commits, pushes, branch cleanup, worktree cleanup, or deploys follow `D:\Antigravity_Projects\activecenter-web\.agents\skills\git-deploy-safety\SKILL.md`.
- Safety project key: `leads_quiz_nurture`.
- Required root check:
  ```bash
  npm run safety:status
  ```
- This project is currently configured as `deployable: false`.

## Project Rules

- `v_lead_state_full` / canonical Supabase lead state is the clean source for nurture decisions.
- `lead_hash` is the only match ID for lead state matching.
- Do not add read-time workaround mappings when source data can be normalized correctly.
- Mautic may send and personalize, but should not become a second source of truth for video state.
