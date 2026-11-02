**Warden’s strongest pitch: “Give your Jira agent a mandate—and prove it stays inside it.”** Target Jira administrators and engineering leads who want agent triage without granting unchecked write access.

I read [docs/SPEC.md](D:/Tests/test123/warden/docs/SPEC.md). Two corrections first:

- Use your stated **UI Kit + `nodejs24.x`** constraints; the spec still says Custom UI/Node 22.
- A `security` label configured as blocked must produce **Refused**, including when another rule would produce Hold. Use `release-critical` for the approval example.

The official competition gives each criterion 20%. Marketplace bonus eligibility also accepts a **submitted listing with a review-ticket link**, so publication needn’t become a deadline dependency. [Codegeist requirements](https://codegeist2026.devpost.com/)

## 1. Eight highest-impact changes, ranked

Effort is incremental to the working core: **S ≈ 1–2 focused days; M ≈ 3–5; L ≈ 6–10**, including validation. These are estimates.

| Rank | What to build | Effort | Criteria / bonus |
|---|---|---:|---|
| **1** | **Shared preflight plan: simulation + blast-radius preview.** Resolve a bounded list of Jira issues server-side, freeze the proposed changes, then show issue, before → after, verdict and every matching rule. Example: “40 transitions requested. Run limit: 10. Plan refused before execution.” Simulator uses the same evaluator with isolated usage state; it creates no approvals or operational usage. Execution rechecks live state. | M | Technology, Design, Innovation, Presentation; Agents + MCP |
| **2** | **Complete the approval experience inside Jira.** Queue and issue panel share one decision receipt: exact change, requesting user, integration, mandate version, reason and expiry. “Approve this change” executes the saved proposal as the approver after checking their eligibility, current Jira permissions and current policy. Changed target or revoked mandate invalidates approval. Never approve an entire agent conversation. | M | Design, Impact, Technology; Agents |
| **3** | **Make Teamwork Graph change a verdict.** Add one rule: “Changes to work linked to protected release goals require approval.” Query linked goals using `jiraWorkItemGoals`; administrators select protected goal ARIs. Show the actual goal link and rule in the receipt. Compare two otherwise identical issues: one clears, one holds because of its connected goal. | M | Technology, Innovation, Impact; **Teamwork Graph** |
| **4** | **Ship a visible red-team pack.** A “Challenge this mandate” screen runs reproducible fixtures through the real evaluator and adapter tests: forged labels, instruction injection, expired mandate, duplicate submission, concurrent approvals, quota boundary, run splitting, and revocation after Hold. Each case shows expected verdict, actual verdict and whether a write occurred. Include one real Rovo adversarial demonstration. | M | Technology, Innovation, Presentation; Agents + MCP |
| **5** | **Prove Rovo/MCP parity.** Expose the same guarded functions through `rovo:agent` actions and `rovo:mcp`. Demonstrate a protected write from each entry point producing the same rule code and receipt format. Return a queue link and structured outcome to the client. Keep human approval and mandate administration out of agent-accessible tools. | M | Technology, Impact, Presentation; **Agents + MCP** |
| **6** | **Turn natural-language authoring into a reviewed policy draft.** “Allow triage in PAY, hold Highest priority, never touch security, ten writes per run” becomes a validated form. Highlight inferred values, missing expiry and unsupported requests. Require an administrator to review and activate. Run sample proposals against the draft before saving. | M | Design, Innovation, Impact; Agents |
| **7** | **Add guarded restore for priority and assignee only.** Store the previous value and Warden’s written value. Restore only when the current field still matches Warden’s result, permissions allow it and recovery policy permits it. Otherwise: “Changed since this action. Review manually.” Create a linked recovery receipt. | M | Technology, Design, Impact |
| **8** | **Finish the evidence ledger with export.** Filter by agent integration, issue, verdict, rule and time. Export CSV plus structured JSON containing proposal ID, policy version, requester, executor, decision, result and timestamps. Call it an “audit evidence export”; KVS storage alone does not establish immutable or certified compliance records. | S | Impact, Design, Presentation |

**Why #3 is worth doing:** current Teamwork Graph documentation lists `jiraWorkItemGoals` as a supported curated query and supports Forge calls through `api.asUser().requestTeamworkGraph(...)`. Results are permission-filtered; paginate and record lookup time. Missing permissions or a failed lookup must show **“Context unavailable”**, with a conservative Hold when that context is required. An empty result does not establish organization-wide absence of risk. [Curated queries](https://developer.atlassian.com/platform/teamwork-graph/curated-queries/)

**Why #5 needs an early spike:** external MCP exposure is disabled by default per installation and requires administrator enablement plus client OAuth consent. Verify this on the exact installation path judges will use. [Rovo MCP setup](https://developer.atlassian.com/platform/forge/manifest-reference/modules/rovo-mcp/)

**Defer the numeric trust score.** “93% trusted” would look arbitrary and create pressure to weaken controls. Show transparent history instead: “Last 30 days: 84 executed · 7 held · 3 refused.” History should never override a hard rule.

Also defer universal rollback. Workflow transitions can trigger notifications, automation and external effects that reversing a status cannot undo.

**Solo-developer cutoff:** deliver #1–5 first, then #6–8. Reserve the final week for fresh-site installation, UI states, recording and submission—not another integration.

## 2. UI Kit plan: premium through precision

Use an **operational decision desk** aesthetic: restrained surfaces, strong typography, consistent receipts and explicit action language. The product identity is the verdict stamp repeated across Rovo responses, the queue and issue history.

### Main `jira:globalPage`

```text
Warden                                  [Simulate a run]
Agent writes, within your mandate.

[Approvals · 3] [Activity] [Mandates] [Simulator]

[Agent ▼] [Project ▼] [Search issue or proposal............]

Needs your decision
PAY-142   Priority: High → Highest       HOLD       [Review]
PAY-158   Assignee: Maya → Leon          HOLD       [Review]

Latest decisions
PAY-161   Transition                      CLEARED   Executed
PAY-163   Priority                        REFUSED   No write
```

Open on **Approvals**. The first viewport answers “What needs me?” Keep usage meters within the selected mandate rather than filling the landing page with statistics.

| Surface | Exact UI Kit components | Design decisions |
|---|---|---|
| Header and page structure | `Box`, `Stack`, `Inline`, `Heading`, `Text`, `Button` | One H1; generous separation between sections; a single primary action per context. |
| Navigation and filtering | `Tabs`, `TabList`, `Tab`, `TabPanel`, `Badge`, `Select`, `Textfield` | Approval count in the tab; explicit labels for filters; preserve filters after review. |
| Queue and ledger | `DynamicTable`, `Lozenge`, `Link`, `User`, `Button` | Row action says **Review**, not an unlabeled icon. Keep full rule explanations in details. |
| Review dialog | `Modal`, `ModalHeader`, `ModalTitle`, `ModalBody`, `ModalFooter`, `ButtonGroup` | Sections: proposed change → reason → context → execution identity → actions. |
| Mandate editor | `Form`, `Label`, `Textfield`, `TextArea`, `Select`, `CheckboxGroup`, `Checkbox`, `DatePicker`, `HelperMessage`, `ErrorMessage` | Group into Scope, Limits, Approval rules and Expiry. Use numeric text fields for limits; explicit expiry time/timezone. |
| Usage and feedback | `ProgressBar`, `SectionMessage`, `Spinner`, `EmptyState` | Always pair meters with numbers; distinguish loading, empty, inaccessible and failed states. |

These components are available in current UI Kit. Style supported `Box` surfaces with `xcss` and Atlassian tokens for spacing, background, border and radius. Keep the implementation within native components. [UI Kit catalog](https://developer.atlassian.com/platform/forge/ui-kit/components/), [XCSS constraints](https://developer.atlassian.com/platform/forge/ui-kit/components/xcss/)

### The verdict stamp

Make it a compact, bordered **decision receipt**, with a consistent order:

1. `Inline`: `Icon` + `Heading` stating the consequence.
2. `Lozenge` stating the verdict.
3. `Text` explaining the rule.
4. Small receipt metadata: proposal ID, policy version and time.

| Verdict | Stamp heading | Lozenge appearance | Supporting text |
|---|---|---|---|
| Cleared | **Within mandate** | `success` | “Policy permits this change.” |
| Hold | **Your decision is required** | `warning` | “Highest priority requires approval. No change made.” |
| Refused | **Outside mandate** | `danger` | “The security label blocks agent writes. No change made.” |

Use success, warning and error glyphs from the installed Icon catalog, with visible text. **Track execution separately:** Cleared can still have “Execution failed” or “Outcome unconfirmed.” Reserve “Executed” for confirmed Jira success.

Current Lozenge supports `success`, `warning` and `danger`; `isBold` is deprecated. Keep verdict labels short and untruncated. Use current Icon `color` tokens and supported sizes. [Lozenge](https://developer.atlassian.com/platform/forge/ui-kit/components/lozenge/), [Icon](https://developer.atlassian.com/platform/forge/ui-kit/components/icon/)

### Details that make it feel finished

- **Before/after:** “Priority · High → Highest,” followed by the issue link. Avoid raw JSON as the main review surface.
- **All reasons visible:** Refused takes precedence, but list every blocking rule rather than exposing just the first.
- **Consistent spacing:** 8px within a fact group, 16px between groups, 24px between sections using corresponding tokens.
- **Theme support:** semantic tokens in light and dark mode; verdicts remain understandable without color.
- **Issue panel:** latest receipt, pending decision and chronological history. Reuse the global-page review component.

### Empty states and microcopy

| Situation | Copy / action |
|---|---|
| No mandate | **“Give Triage Steward its first mandate.”** “Choose projects, actions and limits before enabling writes.” → **Create mandate** |
| No approvals | **“No decisions waiting.”** “Requests that need your approval will appear here.” → **Simulate a request** |
| No activity | **“Your first decision starts here.”** → **Try a safe simulation** |
| Graph unavailable | **“Connected context couldn’t be checked.”** “This request is held until the required context can be verified.” |
| Stale approval | **“This issue changed while waiting.”** → **Review updated proposal** |
| Approve | **Approve this change**; supporting text: “Runs with your Jira permissions.” |
| Pause | **Pause agent writes**; result: “New requests will be refused. In-flight writes may already complete.” |
| Duplicate click | **“This request was already processed.”** → **View result** |

## 3. Three-minute demo script

Use a small seeded PAY project and real Jira writes. Show simulation with a persistent **Simulation** label. Record at readable scale; keep technical overlays to one short line.

| Time | Screen / action | Narration |
|---|---|---|
| **0:00–0:08** | Rovo request already visible: “Move PAY-101 to In Progress.” Invoke the guarded action. | “Our engineering lead wants agent triage, with explicit limits on what can change.” |
| **0:08–0:16** | **Cleared · Executed** receipt; open Jira and show the new status. | “Warden checks the mandate, executes with the user’s permissions and records the result.” |
| **0:16–0:28** | Request Highest priority on `release-critical` PAY-142. Show **Hold**, then the unchanged Jira priority. | “A sensitive change stops here. The reason is explicit, and Jira stays unchanged.” |
| **0:28–0:45** | Open the global queue; review exact before/after; approve; show changed Jira priority and executor. | “The lead approves this specific change inside Jira. Warden rechecks the request and executes as the approver.” |
| **0:45–1:05** | Two similar issues; reveal one issue’s linked protected release goal and Hold receipt. | “Labels aren’t the whole story. Teamwork Graph connects this work to a protected release goal, so the same proposed change needs review.” |
| **1:05–1:25** | Simulate a frozen plan of 40 transitions. Show limit 10 and **Refused before execution**. | “Before a bulk run, the team sees every proposed change and its scope. This plan exceeds the mandate.” |
| **1:25–1:43** | External MCP client requests a write to a `security` issue. Show Refused and the matching ledger entry. | “Another client reaches the same guarded action and gets the same policy. Instructions cannot override this rule.” |
| **1:43–2:00** | Draft a mandate in Rovo; reveal parsed fields and one unresolved value. | “An administrator can describe a mandate naturally. Warden turns it into a reviewable draft; activation stays with the administrator.” |
| **2:00–2:18** | Challenge pack: show named cases, expected/actual results and write count. | “We test forged metadata, duplicate requests, stale approvals and revocation—not just the happy path.” |
| **2:18–2:35** | Restore a previously changed priority; show linked recovery receipt. | “For supported fields, recovery checks that nobody changed the value afterward. Recovery gets its own evidence.” |
| **2:35–2:47** | Ledger detail, export action, compact architecture overlay. | “One deterministic engine serves Rovo, MCP, simulation and review. Every outcome is traceable.” |
| **2:47–3:00** | Revoke mandate. Agent asks to override revocation. **Refused · MANDATE_REVOKED.** Show unchanged issue. | “The agent can ask again. The mandate still decides.” End card: **“The model proposes. Your mandate decides.”** |

The opening proves both a successful write and a prevented write within 30 seconds. The ending demonstrates the product’s central claim with an observable result.

## 4. Five biggest failure modes

### 1. Claiming a universal firewall that Forge doesn’t provide

An agent with another Jira write tool can bypass Warden.

**Avoid it:** describe the product as enforcing **Warden-routed actions**. Configure the demo agent’s writes exclusively through those actions. Show which actions and integrations are covered. Never accept caller-supplied `agentKey`, labels, project or issue type as authoritative; resolve policy binding and Jira facts server-side. Where MCP identity is limited, state that limitation rather than claiming verified per-model identity.

### 2. Showing policy tests while execution remains unsafe

The existing evaluator checks usage **one proposal at a time**. That alone won’t refuse a 40-item plan before the first write. Likewise, an approval double-click or concurrent request can defeat naive read-then-write logic.

**Avoid it:** add plan-level preflight, server-issued plan/run identifiers, race-safe execution claims and concurrency tests. Use elapsed-time data for genuine rolling limits; hourly buckets alone are insufficient at boundaries. Recheck policy before dispatch and record partial batch results explicitly.

Basic KVS transactions group storage mutations; they do not make a Jira REST call atomic with storage. Conditional Custom Entity Store transactions are available through `@forge/kvs` if needed for execution claims. On an ambiguous Jira timeout, show **Outcome unconfirmed** and reconcile before retrying. Do not promise universal exactly-once execution. [KVS transactions](https://developer.atlassian.com/platform/forge/storage-reference/kvs-transactions/), [conditional transactions](https://developer.atlassian.com/platform/forge/storage-reference/entities-transactions/)

### 3. Looking like a generic approval dashboard with AI attached

A queue, colored badges and an agent chat are easy to imitate.

**Avoid it:** make every receipt carry Jira-specific evidence: exact field change, issue context, rule code, mandate version, execution identity and linked goal. Demonstrate how connected context changes the decision. Keep natural-language authoring secondary to enforcement.

### 4. Failing on the judges’ fresh installation

Your seeded site works; theirs lacks consent, MCP enablement, graph context or a transition available in your workflow.

**Avoid it:** rehearse installation in another site/account. Provide a bounded setup check for Rovo availability, permissions, MCP exposure and graph access. Discover actual Jira transitions and priority IDs rather than assuming names or IDs. Give judges a short reproducible scenario and clearly labeled sample data. Show unavailable integrations honestly.

### 5. Spending the remaining time on breadth and underselling impact

A trust score, universal undo and multiple integrations can consume the schedule while the core approval flow remains unfinished.

**Avoid it:** anchor the submission in one audience and one job: **engineering leads delegating bounded Jira triage**. Test with a few real leads/admins; report their actual feedback and observed task results. Use measured evidence—review time, steps, prevented test writes—without inventing savings. Submit Marketplace review materials early, then protect time for installation and the three-minute recording.

