/**
 * Warden policy engine.
 *
 * This file is the heart of the app: a pure, deterministic judge. No language model is ever asked
 * whether an action is allowed. The Rovo agent (or an MCP client) proposes a Jira write, and this
 * function decides one of three outcomes:
 *
 *   - "allow": the write is inside the mandate and may run now
 *   - "hold":  the write is inside the hard limits but a person must approve it first
 *   - "deny":  the write breaks a hard rule and never runs
 *
 * Every hard rule that is broken is reported (not only the first one), so the person reading a
 * refusal sees the whole picture. "deny" always wins over "hold": a refusal lists only hard rules,
 * and hold reasons appear only when no hard rule is broken.
 */

export const ACTION_KINDS = ["transition", "assign", "comment", "set_priority"];

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Case-insensitive membership check, because Jira labels and names are user-typed. */
const has = (list, value) => (list || []).some((v) => String(v).toLowerCase() === String(value).toLowerCase());

/** Returns the first value of `values` that also appears in `list`, or undefined. */
const overlap = (list, values) => (values || []).find((v) => has(list, v));

/** How many past executed writes fall inside the last `windowMs` milliseconds. */
export function countWithin(usage, now, windowMs) {
  const from = now.getTime() - windowMs;
  return usage.filter((u) => new Date(u.at).getTime() > from).length;
}

/** How many writes this agent run has already made (or reserved). */
export const countInRun = (usage, runId) => usage.filter((u) => u.runId === runId).length;

/**
 * @param {object} mandate   the owner's standing instructions (see defaults.js for the shape)
 * @param {object} proposal  one write the agent wants to make, with facts resolved from Jira
 * @param {Array<{at:string, runId:string}>} usage  executed writes by this mandate
 * @param {Date} now
 * @returns {{decision: "allow"|"hold"|"deny", reasons: Array<{code:string, message:string}>}}
 */
export function evaluate(mandate, proposal, usage, now) {
  const deny = [];
  const hold = [];

  // 1. Is the mandate itself alive?
  if (mandate.status === "revoked") deny.push({ code: "MANDATE_REVOKED", message: "This mandate was revoked. The agent has no write access." });
  if (mandate.status === "paused") deny.push({ code: "MANDATE_PAUSED", message: "This mandate is paused. Resume it to let the agent write." });
  if (now.getTime() > new Date(mandate.expiresAt).getTime()) deny.push({ code: "MANDATE_EXPIRED", message: "This mandate has expired." });

  // 2. Is this kind of write, in this place, allowed at all?
  if (!mandate.kinds.includes(proposal.kind)) {
    deny.push({ code: "ACTION_NOT_ALLOWED", message: `“${proposal.kind.replace("_", " ")}” is not an action this mandate allows.` });
  }
  if (!has(mandate.projects, proposal.projectKey)) {
    deny.push({ code: "PROJECT_OUTSIDE_MANDATE", message: `Project ${proposal.projectKey} is outside this mandate.` });
  }
  const blocked = overlap(mandate.blockedLabels, proposal.labels);
  if (blocked) deny.push({ code: "BLOCKED_LABEL", message: `${proposal.issueKey} carries the blocked label “${blocked}”. Agents never touch it.` });
  if (has(mandate.protectedTypes, proposal.issueType)) {
    deny.push({ code: "PROTECTED_ISSUE_TYPE", message: `${proposal.issueType} issues are protected from agent writes.` });
  }

  // 3. Rolling limits, counted from real timestamps (not calendar buckets).
  const inHour = countWithin(usage, now, HOUR);
  const inDay = countWithin(usage, now, DAY);
  const inRun = countInRun(usage, proposal.runId);
  const { perHour, perDay, perRun } = mandate.limits;
  if (inHour + 1 > perHour) deny.push({ code: "HOURLY_LIMIT", message: `The hourly limit of ${perHour} writes is used up (${inHour} in the last hour).` });
  if (inDay + 1 > perDay) deny.push({ code: "DAILY_LIMIT", message: `The daily limit of ${perDay} writes is used up (${inDay} in the last 24 hours).` });
  if (inRun + 1 > perRun) deny.push({ code: "RUN_LIMIT", message: `One agent run may make at most ${perRun} writes (${inRun} already).` });

  if (deny.length > 0) return { decision: "deny", reasons: deny };

  // 4. Inside the hard limits: does a person need to look first?
  const flagged = overlap(mandate.holdLabels, proposal.labels);
  if (flagged) hold.push({ code: "SENSITIVE_LABEL", message: `${proposal.issueKey} is labelled “${flagged}”, so a person approves first.` });
  if (proposal.kind === "set_priority" && proposal.priority && has(mandate.holdPriorities, proposal.priority)) {
    hold.push({ code: "SENSITIVE_PRIORITY", message: `Setting priority to ${proposal.priority} needs approval.` });
  }
  if (proposal.kind === "transition" && proposal.toStatus && has(mandate.holdStatuses || [], proposal.toStatus)) {
    hold.push({ code: "SENSITIVE_STATUS", message: `Moving work to ${proposal.toStatus} needs approval.` });
  }
  if (proposal.kind === "assign" && proposal.assigneeOutsideProject) {
    hold.push({ code: "OUTSIDE_ASSIGNEE", message: "Assigning to someone who is not on this project needs approval." });
  }
  if (inRun + 1 > mandate.holdAboveRun) {
    hold.push({ code: "LARGE_RUN", message: `More than ${mandate.holdAboveRun} writes in one run needs approval.` });
  }
  if (proposal.protectedGoal) {
    hold.push({ code: "PROTECTED_GOAL", message: `${proposal.issueKey} is linked to the protected goal “${proposal.protectedGoal}”.` });
  }
  if (proposal.contextUnavailable) {
    hold.push({ code: "CONTEXT_UNAVAILABLE", message: "Connected context could not be checked, so a person approves first." });
  }

  return hold.length > 0 ? { decision: "hold", reasons: hold } : { decision: "allow", reasons: [] };
}

/**
 * Judges a whole plan of writes before any of them runs (the simulator and bulk requests use this).
 * Each proposal sees the usage that the earlier proposals in the same plan would add if they ran,
 * so a 40-item plan is refused up front instead of failing halfway through.
 */
export function evaluatePlan(mandate, proposals, usage, now) {
  const projected = [...usage];
  return proposals.map((proposal) => {
    const verdict = evaluate(mandate, proposal, projected, now);
    if (verdict.decision !== "deny") projected.push({ at: now.toISOString(), runId: proposal.runId });
    return { proposal, verdict };
  });
}
