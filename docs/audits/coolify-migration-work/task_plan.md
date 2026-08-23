# Task Plan: Business Leads Funnel Technical Audit and Coolify Migration

## Goal
Produce an evidence-backed technical audit of the complete Business Leads funnel and a low-risk target architecture and migration plan that integrates the separate `business-schulung` repository, moves the complete application from Vercel to Coolify, and replaces Supabase with the new Hetzner PostgreSQL platform, without changing production during planning.

## Current Phase
Completed

## Phases

### Phase 1: Delivery and dependency discovery
- [x] Inventory deployed files, build system, routes, APIs, environment variables, and external services
- [x] Confirm live delivery reality and repository state
- **Status:** completed

### Phase 2: Funnel and data-path audit
- [x] Trace browser state, quiz flow, form submission, video tracking, resume, CTA, email, and outbox paths
- [x] Inspect production telemetry and failure handling
- **Status:** completed

### Phase 3: Code-quality and operational-risk audit
- [x] Identify duplication, swallowed errors, platform coupling, test gaps, security and observability risks
- [x] Classify findings by severity and confidence
- **Status:** completed

### Phase 4: Coolify target architecture
- [x] Compare current Vercel runtime with container requirements
- [x] Define app, worker, routing, secrets, health, logging, backup, and rollback model
- **Status:** completed

### Phase 5: Migration sequence and report
- [x] Define pre-migration improvements, test matrix, staged cutover, rollback and acceptance gates
- [x] Deliver detailed audit report with prioritized recommendations
- **Status:** completed

Final report: `docs/audits/2026-08-23-business-leads-coolify-technical-audit.md`

### Phase 6: Scope expansion – business-schulung and PostgreSQL sovereignty
- [x] Audit the separate `business-schulung` repository, routes, assets and direct-link contracts
- [x] Inventory every Supabase-provided runtime capability that must be replaced
- [x] Define the consolidated repository/application boundary and Hetzner PostgreSQL access architecture
- [x] Extend migration phases, dual-run validation, cutover and rollback
- [x] Update the final report
- **Status:** completed

## Key Questions
1. Which behavior depends specifically on Vercel serverless semantics?
2. Which client events can be silently lost and which business outcomes depend on them?
3. What must be refactored before migration versus after cutover?
4. What is the smallest reliable Coolify runtime topology?
5. How can Vercel and Coolify be compared safely before DNS cutover?

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Analysis only; no production or database changes | The user requested a technical assessment and migration preparation, not execution |
| Verify live behavior as well as source | Project governance forbids inferring production truth from code alone |
| Preserve the existing untracked workspace file | It belongs to the user and is unrelated to the audit |
| Integrate `business-schulung` before the hosting cutover | It is advisor context directly linked from the funnel and should share one deployable product boundary |
| Replace Supabase instead of carrying it to Coolify | The requested target is self-hosted PostgreSQL on Hetzner; Supabase REST/RPC/RLS behavior must be explicitly replaced |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| Referenced `LEAD_SYSTEM_V2_ARCHITECTURE.md` missing | 1 | Logged as documentation drift; reconstruct from source and live evidence |
| PowerShell quoting failed for bridge-action grep | 1 | Re-ran with single-quoted ripgrep expressions |
| Windows-invalid `*.md` ripgrep path | 1 | Switch to `-g '*.md'` or explicit directories |
| Breite rekursive Referenzsuche über `activecenter-web` lief in OneDrive zu lange | 1 | Abgebrochen; nur bekannte relevante Repositories und Dokumentpfade gezielt durchsuchen |
| Erster gezielter `rg`-Aufruf enthielt unter Windows erneut einen literalen `*.md`-Pfad | 1 | Pfadglob entfernt; ausschließlich `-g`-Filter verwendet |
| Referenzrepo besitzt keine eigene `AGENTS.md`, direkter Leseversuch meldete Datei fehlt | 1 | Übergeordnete Workspace-Regeln gelten; Migrationsplan direkt gelesen |
