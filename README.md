# Warden: a policy firewall for Rovo agents in Jira

**The model proposes. Plain code decides.**

Teams want AI agents to triage Jira, but one confident agent can reprioritise a release, close a customer escalation, or touch a security ticket in seconds. Warden sits between a Rovo agent and Jira. Every write the agent asks for is judged by a deterministic policy engine, never by a language model, and gets one of three verdicts:

| Verdict | What happens |
|---|---|
| **Cleared** | Inside the mandate. Warden makes the change and records it. |
| **Hold** | Allowed in principle, but a person must approve it first. Nothing is written until they do. |
| **Refused** | Breaks a hard rule. Nothing is written, and the agent is told not to retry or work around it. |

Every decision lands in a ledger with the exact change, the rules that fired, and the mandate version it was judged under.

## What it does

- **Triage Steward**, a Rovo agent (`rovo:agent`) whose only way to change Jira is through Warden's guarded actions: move, set priority, assign, comment. Reads are free.
- **The same tools over MCP** (`rovo:mcp`), so third-party agents get the same guardrails.
- **A mandate the admin controls**: allowed projects and actions, blocked labels, protected issue types, sensitive labels, priorities and statuses, per-run, hourly and daily limits on rolling windows, expiry, and pause or revoke in one click.
- **Teamwork Graph context**: Warden asks the graph which Atlassian Goals an issue is linked to. A change to work linked to a protected goal waits for a person. If the graph cannot be reached, the change waits too; Warden never guesses.
- **Approvals that re-check**: when a person approves a held change, Warden re-reads the issue and re-judges it against the current mandate. If the issue changed meanwhile, or a rule now refuses it, nothing is written. A refusal always beats an approval.
- **A simulator**: judge a bulk plan (any JQL) before anything runs. Limits are projected across the plan, so a 40-item run is refused up front rather than failing halfway.

## How it is built

```
Rovo chat / MCP client
        │  proposes a write
        ▼
 action handler ──► guard.js ──► facts from Jira (asUser), goals from Teamwork Graph
                        │
                        ▼
              policy/evaluate.js   ← pure, deterministic, unit- and property-tested
                        │
        ┌───────────────┼────────────────┐
     Cleared          Hold            Refused
   write to Jira   approval queue    nothing written
        └───────────────┴────────────────┘
                        ▼
                ledger (Forge KVS)  ──►  Warden page in Jira (UI Kit)
```

- Atlassian Forge, `nodejs24.x`, UI Kit (`jira:globalPage`), Forge KVS
- Modules: `rovo:agent`, 6 `action` modules, `rovo:mcp`, `jira:globalPage`
- Teamwork Graph: `jiraWorkItemGoals` (scopes `read:graph:issue:jira`, `read:graph:goal:atlassian`)
- Every Jira call runs `asUser()`, so Warden can never do more than the person using it

| File | Role |
|---|---|
| `app/warden-agent/src/policy/evaluate.js` | The judge: `evaluate()` and `evaluatePlan()` |
| `app/warden-agent/src/policy/defaults.js` | Default mandate and admin input validation |
| `app/warden-agent/src/guard.js` | The only path to a Jira write; approvals |
| `app/warden-agent/src/graph.js` | Teamwork Graph lookup |
| `app/warden-agent/src/frontend/index.jsx` | The Warden page |

## Try it

1. Install the app on a Jira Cloud site with Rovo (the install link is in the Devpost submission).
2. Open **Apps → Warden**. Pick a test project and select **Create demo issues in Jira**. This adds 24 issues covering every verdict and adds the project to the mandate.
3. Open **Ask Rovo**, choose **Triage Steward**, and ask: `Move PAY-1 to In Progress`, then `Move PAY-3 and PAY-4 to In Progress`.
4. Back in Warden: PAY-1 cleared, PAY-3 refused (blocked label `security`), PAY-4 waiting for you (`release-critical`). Approve it and watch the receipt.

## Develop

```bash
cd app/warden-agent
npm install
npm test                      # 13 Vitest unit and property tests (fast-check)
forge deploy -e development
forge install --site <your-site>.atlassian.net --product jira -e development
```

### Black-box tests

`scripts/policy-server.mjs` serves the policy engine over HTTP on port 4747 with no Jira access, so external tools can test the exact code that runs in Forge. The [TestSprite](https://www.testsprite.com) suite in `app/warden-agent/testsprite_tests` runs 10 API tests against it (10/10 passing, see the [report](app/warden-agent/testsprite_tests/testsprite-mcp-test-report.md)).

```bash
node scripts/policy-server.mjs
curl -X POST localhost:4747/evaluate -d '{"mandate":{"projects":["PAY"]},"proposal":{"kind":"comment","issueKey":"PAY-2","projectKey":"PAY","issueType":"Task","labels":[],"runId":"r1"}}'
```

## License

[MIT](LICENSE)
