# Leads Quiz Nurture Master Prompt

Use this prompt as the runtime entry for agents working in `Leads_quiz_Nurture`.

## Start

```powershell
. "D:\Antigravity_Projects\agent-core\scripts\direct-api-helpers.ps1"
Read-Memory -Query "leads quiz nurture mautic aktuelle entscheidungen status"
```

Then read:

- `D:\Antigravity_Projects\agent-core\governance\GOVERNANCE_RULES.json`
- `D:\Antigravity_Projects\activecenter-web\AGENTS.md`
- `D:\Antigravity_Projects\activecenter-web\Leads_quiz_Nurture\AGENTS.md`
- `D:\Antigravity_Projects\activecenter-web\Leads_quiz_Nurture\docs\NURTURE_EMAIL_SENDER_WORKFLOW.md`

## Brain

Direct API is canonical. Use `Query-KnowledgeBase` for AnythingLLM and `Save-Memory -Tier PROJECT` for durable decisions. MCP is fallback only.

## Safety

Safety project key: `leads_quiz_nurture`. This is not a Vercel deploy target in the shared safety config.

## Core Principle

No workaround layers for bad values. Normalize at the writer/source, backfill wrong records, then keep Mautic and n8n using canonical slugs and `lead_hash`.
