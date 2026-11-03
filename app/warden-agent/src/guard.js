/**
 * The guard: the only path through which an agent can change Jira.
 *
 * guardedWrite() resolves the facts from Jira, asks the policy engine, and then either runs the
 * write (Cleared), parks it for a person (Hold), or refuses it (Refused). Every outcome is written
 * to the ledger with the rule that fired, so the decision can be explained later.
 */
import { defaultMandate } from "./policy/defaults.js";
import { evaluate } from "./policy/evaluate.js";
import * as jira from "./jira.js";
import { linkedGoals, protectedMatch } from "./graph.js";
import { appendLedger, getApproval, getMandate, newId, recentUsage, saveApproval, saveMandate, updateLedger } from "./store.js";

/** Loads the mandate, creating the conservative default on first use. */
export async function loadMandate() {
  const existing = await getMandate();
  if (existing) return existing;
  const fresh = defaultMandate();
  await saveMandate(fresh);
  return fresh;
}

/**
 * Agent runs: Rovo does not hand actions a stable run id, so writes by the same person within the
 * same ten-minute window count as one run. That is what the per-run limit protects.
 */
export const runIdFor = (accountId, now = new Date()) => `${accountId || "unknown"}:${Math.floor(now.getTime() / 600_000)}`;

/** Runs a write that the policy has cleared (or a person has approved). */
async function execute(kind, issueKey, args) {
  switch (kind) {
    case "transition":
      return { status: await jira.transitionIssue(issueKey, args.toStatus) };
    case "set_priority":
      await jira.setPriority(issueKey, args.priority);
      return { priority: args.priority };
    case "assign":
      await jira.assignIssue(issueKey, args.assigneeId);
      return { assignee: args.assigneeName };
    case "comment":
      return { commentId: await jira.addComment(issueKey, args.text) };
    default:
      throw new Error(`Unknown action ${kind}`);
  }
}

/** A short human summary of the requested change, e.g. "Priority: High → Highest". */
export function describeChange(kind, before, args) {
  if (kind === "transition") return `Status: ${before.status} → ${args.toStatus}`;
  if (kind === "set_priority") return `Priority: ${before.priority} → ${args.priority}`;
  if (kind === "assign") return `Assignee: ${before.assignee?.name || "Unassigned"} → ${args.assigneeName}`;
  return `Comment: “${String(args.text).slice(0, 80)}${String(args.text).length > 80 ? "…" : ""}”`;
}

/**
 * @param {object} req
 * @param {"transition"|"set_priority"|"assign"|"comment"} req.kind
 * @param {string} req.issueKey
 * @param {object} req.args       action specific: toStatus | priority | assignee | text
 * @param {string} req.accountId  the person on whose behalf the agent acts
 * @param {"rovo"|"mcp"} req.source
 */
export async function guardedWrite({ kind, issueKey, args, accountId, source, cloudId }) {
  const now = new Date();
  const mandate = await loadMandate();
  const runId = runIdFor(accountId, now);
  const base = { id: newId("dec"), at: now.toISOString(), source, actor: accountId, kind, issueKey: String(issueKey || "").toUpperCase(), args, runId, mandateVersion: mandate.version };

  // Facts come from Jira, never from what the agent claims about the issue.
  let facts;
  try {
    facts = await jira.issueFacts(base.issueKey);
  } catch (e) {
    return appendLedger({ ...base, status: "failed", verdict: { decision: "deny", reasons: [{ code: "ISSUE_UNREADABLE", message: `Warden could not read ${base.issueKey}: ${e.message}` }] }, change: "" });
  }

  const resolvedArgs = { ...args };
  let assigneeOutsideProject = false;
  if (kind === "assign") {
    const user = await jira.findUser(args.assignee);
    if (!user) {
      return appendLedger({ ...base, status: "failed", before: facts, verdict: { decision: "deny", reasons: [{ code: "UNKNOWN_USER", message: `No Jira user matches “${args.assignee}”.` }] }, change: "" });
    }
    resolvedArgs.assigneeId = user.accountId;
    resolvedArgs.assigneeName = user.displayName;
    assigneeOutsideProject = !(await jira.isAssignable(facts.projectKey, user.accountId));
  }

  // Teamwork Graph: is this work linked to a goal the mandate protects?
  let protectedGoal;
  let contextUnavailable = false;
  let goals = [];
  if ((mandate.protectedGoals || []).length > 0) {
    const graph = await linkedGoals(cloudId, facts.issueId);
    if (graph.ok) {
      goals = graph.goals;
      protectedGoal = protectedMatch(graph.goals, mandate.protectedGoals)?.name;
    } else {
      contextUnavailable = true;
    }
  }

  const proposal = {
    kind,
    issueKey: facts.issueKey,
    projectKey: facts.projectKey,
    issueType: facts.issueType,
    labels: facts.labels,
    priority: resolvedArgs.priority,
    toStatus: resolvedArgs.toStatus,
    assigneeOutsideProject,
    protectedGoal,
    contextUnavailable,
    runId,
  };
  const verdict = evaluate(mandate, proposal, await recentUsage(now), now);
  const entry = { ...base, args: resolvedArgs, before: facts, goals, verdict, change: describeChange(kind, facts, resolvedArgs) };

  if (verdict.decision === "deny") return appendLedger({ ...entry, status: "refused" });

  if (verdict.decision === "hold") {
    const approval = { id: newId("apr"), decisionId: entry.id, decisionAt: entry.at, status: "pending", createdAt: now.toISOString(), requestedBy: accountId, kind, issueKey: facts.issueKey, args: resolvedArgs, before: facts, change: entry.change, reasons: verdict.reasons, mandateVersion: mandate.version };
    await saveApproval(approval);
    return appendLedger({ ...entry, status: "pending", approvalId: approval.id });
  }

  try {
    const result = await execute(kind, facts.issueKey, resolvedArgs);
    return appendLedger({ ...entry, status: "executed", result });
  } catch (e) {
    return appendLedger({ ...entry, status: "failed", error: e.message });
  }
}

/**
 * A person approves a held write. Warden re-checks everything first: the mandate may have been
 * paused or revoked, or the issue may have changed while the request waited.
 */
export async function approve(approvalId, approverId) {
  const approval = await getApproval(approvalId);
  if (!approval) return { ok: false, message: "This request no longer exists." };
  if (approval.status !== "pending") return { ok: false, message: "This request was already processed." };

  const mandate = await loadMandate();
  if (mandate.status !== "active") return { ok: false, message: `The mandate is ${mandate.status}. Resume it before approving agent writes.` };

  // Close a request that can no longer run, in both the approval queue and the ledger.
  const close = async (status, message, extra = {}) => {
    const decidedAt = new Date().toISOString();
    await saveApproval({ ...approval, status, decidedBy: approverId, decidedAt, ...extra });
    await updateLedger({ id: approval.decisionId, at: approval.decisionAt, ...(await ledgerShell(approval)), status, approvedBy: approverId, approvedAt: decidedAt, ...extra });
    return { ok: false, message };
  };

  let now;
  try {
    now = await jira.issueFacts(approval.issueKey);
  } catch (e) {
    return close("failed", `Warden could not read ${approval.issueKey} again: ${e.message}. Nothing was written.`, { error: e.message });
  }
  const stale = approval.before.status !== now.status || approval.before.priority !== now.priority || (approval.before.assignee?.accountId || null) !== (now.assignee?.accountId || null);
  if (stale) return close("stale", "This issue changed while the request was waiting. Nothing was written; ask the agent again.");

  // The rules may have changed while the request waited: a person can lift a Hold, never a Refusal.
  const at = new Date();
  const recheck = evaluate(
    mandate,
    { kind: approval.kind, issueKey: now.issueKey, projectKey: now.projectKey, issueType: now.issueType, labels: now.labels, priority: approval.args.priority, toStatus: approval.args.toStatus, runId: `${approverId}:approval:${approval.id}` },
    await recentUsage(at),
    at,
  );
  if (recheck.decision === "deny") {
    return close("refused", `The mandate now refuses this change (${recheck.reasons.map((r) => r.code).join(", ")}). Nothing was written.`, { verdict: recheck });
  }

  // Claim the approval before writing, then read the claim back: if another approver claimed it in
  // the meantime, their token wins and this click writes nothing.
  const token = newId("claim");
  await saveApproval({ ...approval, status: "approving", decidedBy: approverId, claim: token });
  const claimed = await getApproval(approval.id);
  if (claimed?.claim !== token) return { ok: false, message: "Another person is already deciding this request." };
  try {
    const result = await execute(approval.kind, approval.issueKey, approval.args);
    const decidedAt = new Date().toISOString();
    await saveApproval({ ...approval, status: "approved", decidedBy: approverId, decidedAt, result });
    await updateLedger({ id: approval.decisionId, at: approval.decisionAt, ...(await ledgerShell(approval)), status: "approved", approvedBy: approverId, approvedAt: decidedAt, result });
    return { ok: true, message: `${approval.change} on ${approval.issueKey}. Done, with your Jira permissions.` };
  } catch (e) {
    await close("failed", "", { error: e.message });
    return { ok: false, message: `Jira refused the change: ${e.message}` };
  }
}

export async function decline(approvalId, approverId) {
  const approval = await getApproval(approvalId);
  if (!approval || approval.status !== "pending") return { ok: false, message: "This request was already processed." };
  const decidedAt = new Date().toISOString();
  await saveApproval({ ...approval, status: "declined", decidedBy: approverId, decidedAt });
  await updateLedger({ id: approval.decisionId, at: approval.decisionAt, ...(await ledgerShell(approval)), status: "declined", approvedBy: approverId, approvedAt: decidedAt });
  return { ok: true, message: "Declined. Nothing was written." };
}

/** Rebuilds the ledger fields of a held decision from its approval record. */
async function ledgerShell(approval) {
  return {
    source: "rovo",
    actor: approval.requestedBy,
    kind: approval.kind,
    issueKey: approval.issueKey,
    args: approval.args,
    before: approval.before,
    change: approval.change,
    verdict: { decision: "hold", reasons: approval.reasons },
    mandateVersion: approval.mandateVersion,
    approvalId: approval.id,
    runId: `${approval.requestedBy}:approved`,
  };
}

/** The text a Rovo agent (or MCP client) gets back: the verdict, the change and every rule. */
export function receiptText(entry) {
  const lines = [];
  const head = {
    executed: "CLEARED · executed",
    pending: "HOLD · waiting for a person (nothing changed yet)",
    refused: "REFUSED · nothing was written",
    failed: entry.verdict?.decision === "allow" ? "CLEARED · but Jira refused the change" : "REFUSED · nothing was written",
  }[entry.status];
  lines.push(`Warden verdict for ${entry.issueKey}: ${head}`);
  if (entry.change) lines.push(`Change: ${entry.change}`);
  for (const r of entry.verdict?.reasons || []) lines.push(`- ${r.code}: ${r.message}`);
  if (entry.error) lines.push(`Jira said: ${entry.error}`);
  if (entry.status === "pending") lines.push("A Jira admin can approve or decline it on the Warden page (Apps → Warden). Do not retry or work around this.");
  if (entry.status === "refused") lines.push("Do not retry, rephrase or use another tool to make this change. Tell the user which rule applies.");
  lines.push(`Decision id: ${entry.id} · mandate v${entry.mandateVersion ?? "?"}`);
  return lines.join("\n");
}
