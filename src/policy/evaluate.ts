import type { Mandate, Proposal, Reason, UsageEvent, Verdict } from "./types";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const has = (list: string[], value: string): boolean => list.some((v) => v.toLowerCase() === value.toLowerCase());
const overlap = (list: string[], values: string[]): string | undefined => values.find((v) => has(list, v));

/** How many past writes fall inside the last `windowMs`. */
export function countWithin(usage: UsageEvent[], now: Date, windowMs: number): number {
  const from = now.getTime() - windowMs;
  return usage.filter((u) => new Date(u.at).getTime() > from).length;
}

/** How many writes this run has already made. */
export const countInRun = (usage: UsageEvent[], runId: string): number => usage.filter((u) => u.runId === runId).length;

/**
 * The whole product: a pure, deterministic judge. No model is ever asked whether an action is allowed.
 * A model proposes, this function disposes. Every problem is reported, not just the first.
 */
export function evaluate(mandate: Mandate, proposal: Proposal, usage: UsageEvent[], now: Date): Verdict {
  const deny: Reason[] = [];
  const hold: Reason[] = [];

  if (mandate.status === "revoked") deny.push({ code: "REVOKED", message: "This mandate was revoked. The agent has no write access." });
  if (mandate.status === "paused") deny.push({ code: "PAUSED", message: "This mandate is paused. Resume it to let the agent write." });
  if (now.getTime() > new Date(mandate.expiresAt).getTime()) deny.push({ code: "EXPIRED", message: "This mandate has expired." });

  if (!mandate.kinds.includes(proposal.kind)) {
    deny.push({ code: "KIND_NOT_ALLOWED", message: `“${proposal.kind}” is not an action this mandate allows.` });
  }
  if (!has(mandate.projects, proposal.projectKey)) {
    deny.push({ code: "PROJECT_NOT_ALLOWED", message: `Project ${proposal.projectKey} is outside this mandate.` });
  }
  const blocked = overlap(mandate.blockedLabels, proposal.labels);
  if (blocked) deny.push({ code: "BLOCKED_LABEL", message: `${proposal.issueKey} carries the blocked label “${blocked}”.` });
  if (has(mandate.protectedTypes, proposal.issueType)) {
    deny.push({ code: "PROTECTED_TYPE", message: `${proposal.issueType} issues are protected from this agent.` });
  }

  const inHour = countWithin(usage, now, HOUR);
  const inDay = countWithin(usage, now, DAY);
  const inRun = countInRun(usage, proposal.runId);
  if (inHour + 1 > mandate.limits.perHour) deny.push({ code: "HOURLY_LIMIT", message: `The hourly limit of ${mandate.limits.perHour} writes is used up (${inHour} so far).` });
  if (inDay + 1 > mandate.limits.perDay) deny.push({ code: "DAILY_LIMIT", message: `The daily limit of ${mandate.limits.perDay} writes is used up (${inDay} so far).` });
  if (inRun + 1 > mandate.limits.perRun) deny.push({ code: "RUN_LIMIT", message: `One run may make at most ${mandate.limits.perRun} writes (${inRun} so far).` });

  if (deny.length > 0) return { decision: "deny", reasons: deny };

  const flagged = overlap(mandate.holdLabels, proposal.labels);
  if (flagged) hold.push({ code: "HOLD_LABEL", message: `${proposal.issueKey} is labelled “${flagged}”: a person approves first.` });
  if (proposal.kind === "set_priority" && proposal.priority && has(mandate.holdPriorities, proposal.priority)) {
    hold.push({ code: "HOLD_PRIORITY", message: `Setting priority to ${proposal.priority} needs approval.` });
  }
  if (proposal.kind === "assign" && proposal.assigneeOutsideProject) {
    hold.push({ code: "HOLD_OUTSIDE_ASSIGNEE", message: "Assigning to someone outside the project needs approval." });
  }
  if (inRun + 1 > mandate.holdAboveRun) {
    hold.push({ code: "HOLD_BIG_RUN", message: `More than ${mandate.holdAboveRun} writes in one run needs approval.` });
  }

  return hold.length > 0 ? { decision: "hold", reasons: hold } : { decision: "allow", reasons: [] };
}
