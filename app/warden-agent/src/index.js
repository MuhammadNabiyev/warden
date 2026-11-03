/**
 * Entry points declared in manifest.yml.
 *
 * - Rovo action handlers (and the same functions exposed as MCP tools): every Jira write goes
 *   through guardedWrite(); reads (search, explain) are free.
 * - `handler`: the resolver behind the Warden page in Jira (UI Kit).
 */
import Resolver from "@forge/resolver";
import { approve, decline, guardedWrite, loadMandate, receiptText, runIdFor } from "./guard.js";
import * as jira from "./jira.js";
import { evaluatePlan } from "./policy/evaluate.js";
import { sanitizeMandate } from "./policy/defaults.js";
import { listApprovals, listLedger, recentUsage, saveMandate } from "./store.js";
import { seedDemo } from "./demo.js";
import { linkedGoals, protectedMatch } from "./graph.js";
import { ledgerCsv } from "./export.js";

/** Rovo passes the inputs in `payload`; the calling user's id sits in the context. */
const accountOf = (payload, context) => context?.accountId || payload?.context?.accountId || context?.principal?.accountId || null;

/** MCP clients and Rovo both land here; the source is recorded in the ledger. */
const sourceOf = (context) => (context?.moduleKey && String(context.moduleKey).includes("mcp") ? "mcp" : "rovo");

const missing = (name) => `Warden needs “${name}” to do this. Ask the user for it.`;

// ---------- Rovo actions: guarded writes ----------

export async function transitionIssue(payload, context) {
  if (!payload.issueKey || !payload.toStatus) return missing(!payload.issueKey ? "issueKey" : "toStatus");
  const entry = await guardedWrite({ kind: "transition", issueKey: payload.issueKey, args: { toStatus: payload.toStatus }, accountId: accountOf(payload, context), source: sourceOf(context), cloudId: context?.cloudId });
  return receiptText(entry);
}

export async function setPriority(payload, context) {
  if (!payload.issueKey || !payload.priority) return missing(!payload.issueKey ? "issueKey" : "priority");
  const entry = await guardedWrite({ kind: "set_priority", issueKey: payload.issueKey, args: { priority: payload.priority }, accountId: accountOf(payload, context), source: sourceOf(context), cloudId: context?.cloudId });
  return receiptText(entry);
}

export async function assignIssue(payload, context) {
  if (!payload.issueKey || !payload.assignee) return missing(!payload.issueKey ? "issueKey" : "assignee");
  const entry = await guardedWrite({ kind: "assign", issueKey: payload.issueKey, args: { assignee: payload.assignee }, accountId: accountOf(payload, context), source: sourceOf(context), cloudId: context?.cloudId });
  return receiptText(entry);
}

export async function commentIssue(payload, context) {
  if (!payload.issueKey || !payload.text) return missing(!payload.issueKey ? "issueKey" : "text");
  const entry = await guardedWrite({ kind: "comment", issueKey: payload.issueKey, args: { text: payload.text }, accountId: accountOf(payload, context), source: sourceOf(context), cloudId: context?.cloudId });
  return receiptText(entry);
}

// ---------- Rovo actions: free reads ----------

export async function searchIssues(payload) {
  const jql = payload.jql || "order by updated DESC";
  try {
    const issues = await jira.searchIssues(jql, 20);
    if (issues.length === 0) return "No issues match.";
    return issues.map((i) => `${i.key} · ${i.summary} · ${i.status} · ${i.priority}${i.labels.length ? ` · labels: ${i.labels.join(", ")}` : ""}`).join("\n");
  } catch (e) {
    return `Search failed: ${e.message}`;
  }
}

export async function explainMandate() {
  const m = await loadMandate();
  return [
    `Mandate “${m.name}” (v${m.version}, ${m.status}, expires ${m.expiresAt.slice(0, 10)}).`,
    `Allowed actions: ${m.kinds.join(", ") || "none"}.`,
    `Projects: ${m.projects.join(", ") || "none yet (an admin must add projects on the Warden page)"}.`,
    `Never touched: issues labelled ${m.blockedLabels.join(", ") || "-"}; ${m.protectedTypes.join(", ") || "no"} issue types.`,
    `Needs a person first: labels ${m.holdLabels.join(", ") || "-"}; priorities ${m.holdPriorities.join(", ") || "-"}; statuses ${(m.holdStatuses || []).join(", ") || "-"}; more than ${m.holdAboveRun} writes in one run.`,
    `Protected goals (Teamwork Graph): ${(m.protectedGoals || []).join(", ") || "none"}; work linked to them needs a person first.`,
    `Limits: ${m.limits.perRun} per run, ${m.limits.perHour} per hour, ${m.limits.perDay} per day.`,
  ].join("\n");
}

// ---------- Resolver for the Warden page ----------

const resolver = new Resolver();

resolver.define("getState", async () => {
  const now = new Date();
  const [mandate, approvals, ledger, usage] = await Promise.all([loadMandate(), listApprovals(), listLedger(100), recentUsage(now)]);
  const hourAgo = now.getTime() - 3_600_000;
  return {
    mandate,
    approvals: approvals.filter((a) => a.status === "pending").sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    ledger,
    usage: { hour: usage.filter((u) => new Date(u.at).getTime() > hourAgo).length, day: usage.length },
    counts: {
      cleared: ledger.filter((e) => e.status === "executed").length,
      held: ledger.filter((e) => e.status === "pending" || e.status === "approved" || e.status === "declined").length,
      refused: ledger.filter((e) => e.status === "refused").length,
    },
  };
});

resolver.define("saveMandate", async ({ payload }) => {
  const current = await loadMandate();
  const result = sanitizeMandate(payload.mandate || {}, current);
  if (result.error) return { ok: false, message: result.error };
  await saveMandate(result.mandate);
  return { ok: true, mandate: result.mandate };
});

resolver.define("setStatus", async ({ payload }) => {
  const current = await loadMandate();
  if (!["active", "paused", "revoked"].includes(payload.status)) return { ok: false, message: "Unknown status." };
  const next = { ...current, status: payload.status, version: current.version + 1, updatedAt: new Date().toISOString() };
  await saveMandate(next);
  return { ok: true, mandate: next };
});

resolver.define("approve", async ({ payload, context }) => approve(payload.id, context.accountId));
resolver.define("decline", async ({ payload, context }) => decline(payload.id, context.accountId));

/**
 * The simulator: judges a bulk plan against the live mandate without writing anything.
 * Every issue the JQL returns becomes one proposed write of the chosen kind.
 */
resolver.define("simulate", async ({ payload, context }) => {
  const now = new Date();
  const mandate = await loadMandate();
  const issues = await jira.searchIssues(payload.jql || "order by updated DESC", Math.min(Number(payload.max) || 40, 50));
  const runId = `${runIdFor(context.accountId, now)}:simulation`;
  // Same connected context as a real write: protected goals come from the Teamwork Graph.
  const graph = (mandate.protectedGoals || []).length
    ? await Promise.all(issues.map((i) => linkedGoals(context.cloudId, i.id)))
    : issues.map(() => null);
  const proposals = issues.map((i, n) => ({
    kind: payload.kind || "transition",
    issueKey: i.key,
    projectKey: i.key.split("-")[0],
    issueType: i.type,
    labels: i.labels,
    priority: payload.priority,
    toStatus: payload.toStatus,
    protectedGoal: graph[n]?.ok ? protectedMatch(graph[n].goals, mandate.protectedGoals)?.name : undefined,
    contextUnavailable: graph[n] ? !graph[n].ok : false,
    runId,
  }));
  const plan = evaluatePlan(mandate, proposals, await recentUsage(now), now);
  return {
    rows: plan.map(({ proposal, verdict }) => ({ issueKey: proposal.issueKey, decision: verdict.decision, reasons: verdict.reasons })),
    summary: {
      allow: plan.filter((p) => p.verdict.decision === "allow").length,
      hold: plan.filter((p) => p.verdict.decision === "hold").length,
      deny: plan.filter((p) => p.verdict.decision === "deny").length,
    },
  };
});

/** The whole ledger as CSV, for auditors and spreadsheets. */
resolver.define("exportLedger", async () => {
  const entries = await listLedger(5000);
  return { csv: ledgerCsv(entries), count: entries.length };
});

/** Setup check for connected context: which goals does the Teamwork Graph link to this issue? */
resolver.define("checkGraph", async ({ payload, context }) => {
  try {
    const facts = await jira.issueFacts(String(payload.issueKey || "").toUpperCase());
    const graph = await linkedGoals(context.cloudId, facts.issueId);
    return graph.ok
      ? { ok: true, message: graph.goals.length ? `${facts.issueKey} is linked to: ${graph.goals.map((g) => g.name).join(", ")}.` : `Teamwork Graph answered: ${facts.issueKey} has no linked goals.` }
      : { ok: false, message: `Teamwork Graph could not be checked: ${graph.error}` };
  } catch (e) {
    return { ok: false, message: e.message };
  }
});

/** Loads demo issues into a project and adds that project to the mandate. */
resolver.define("seedDemo", async ({ payload }) => {
  const projectKey = String(payload.projectKey || "").trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9_]{1,9}$/.test(projectKey)) return { ok: false, message: "Enter a project key such as PAY." };
  try {
    const created = await seedDemo(projectKey);
    const mandate = await loadMandate();
    if (!mandate.projects.includes(projectKey)) {
      await saveMandate({ ...mandate, projects: [...mandate.projects, projectKey], version: mandate.version + 1, updatedAt: new Date().toISOString() });
    }
    return { ok: true, message: `Created ${created.length} demo issues (${created[0]} to ${created[created.length - 1]}) and added ${projectKey} to the mandate.` };
  } catch (e) {
    return { ok: false, message: `Could not create demo issues in ${projectKey}: ${e.message}` };
  }
});

export const handler = resolver.getDefinitions();
