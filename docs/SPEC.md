# Warden: guardrails for Rovo agents (Codegeist 2026)

Category: **Apps for Software Teams**. Bonus targets: **Best Agents** (rovo:agent + actions) and **Best app with Atlassian MCP** (rovo:mcp). Stretch: Marketplace listing.

## Problem
Teams are letting Rovo agents change Jira: transition issues, assign, edit priority, bulk-comment. A prompt that says "never touch security issues" is a suggestion; a confused or manipulated agent can ignore it. Admins have no per-agent limits, no approval step and no audit trail.

## Idea
The model proposes, plain code decides. Warden is the policy layer between a Rovo agent and Jira. Every write an agent wants to make passes a deterministic policy engine and returns **Cleared**, **Hold** (a human approves in Jira) or **Refused** (with the exact rule). Everything lands in an audit ledger.

## What ships
1. **Policy engine** (`src/policy`, pure TypeScript, unit tested, property-tested). Policy ("mandate") per agent:
   - allowed action kinds: `transition`, `assign`, `comment`, `set_priority`, `create_subtask`
   - allowed projects (keys), blocked labels (e.g. `security`), protected issue types
   - rolling limits: max writes per hour/day, max writes per single run (burst)
   - hold rules: anything on a flagged label, priority raised to Highest, assigning to a user outside the project, more than N issues in one run
   - expiry and an instant kill switch (pause / revoke)
2. **Rovo agent "Triage Steward"** (`rovo:agent`) whose Jira-writing `action` modules all go through the engine. Read actions (search, summarise) stay free.
3. **Atlassian MCP tools** (`rovo:mcp`) exposing the same guarded actions so any MCP-capable agent gets the same guardrails.
4. **Admin page** (`jira:adminPage`, Custom UI): create/edit mandates (plain-English description fills the form via Rovo), live usage meters, pause/revoke.
5. **Approval queue** (`jira:globalPage` and issue panel): Hold decisions wait here with who/what/why; Approve executes the original action once, Decline closes it.
6. **Audit ledger**: every proposal, verdict, rule that fired, actor, issue key and result. Exportable.
7. **Issue panel** (`jira:issuePanel`): per-issue history of agent decisions.

## Architecture
- Forge app, Node 22 runtime, `@forge/api` (`requestJira`), `@forge/kvs` for mandates, usage counters and ledger.
- Custom UI (React + Vite) for admin/queue; Atlassian design tokens for theme colours; the Warden "stamp" verdict motif.
- Pure modules (policy, windows, validation) are framework-free so they can be tested without Forge and re-used by a standalone web preview.
- Standalone preview app (same React UI with a mocked `@forge/bridge`) is hosted on Vercel for design review, Codex iteration and TestSprite end-to-end tests.

## Data model (kvs)
- `mandate:<id>` { id, name, agentKey, kinds[], projects[], blockedLabels[], protectedTypes[], limits{hour,day,burst}, holdRules[], expiresAt, status }
- `usage:<mandateId>:<yyyymmddhh>` counters
- `ledger:<ts>:<id>` entries
- `approval:<id>` { entryId, action, args, status, decidedBy }

## Verdict contract
`evaluate(mandate, proposal, usage, now) -> { decision: "allow"|"hold"|"deny", reasons: [{code, message}] }`. Reasons are always all-of (not first-match). `hold` never executes until approved; `deny` never executes.

## Acceptance
- Installing the app on a fresh site gives a working agent with a default mandate in under 2 minutes.
- Demo: agent tries (a) a normal transition (Cleared), (b) raising a `security` issue priority (Hold, approver sees why), (c) closing 40 issues in one run (Refused: burst limit), (d) admin revokes, next action refused.
- Unit tests for policy; TestSprite suite for the standalone preview; Forge `forge lint` clean.

## Risks / open questions
- Rovo agent availability on a free developer site (verify after `forge install --demo-site`).
- `rovo:mcp` module is newer: verify manifest shape against current docs when scaffolding.
- Approval execution must run as the approver (use `asUser()` for Jira calls where scopes allow).
