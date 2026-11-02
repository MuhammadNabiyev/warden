import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { defaultMandate, sanitizeMandate } from "../src/policy/defaults.js";
import { ACTION_KINDS, evaluate, evaluatePlan } from "../src/policy/evaluate.js";

const NOW = new Date("2026-11-10T12:00:00Z");

const mandate = (over = {}) => ({ ...defaultMandate(new Date("2026-11-01T00:00:00Z")), projects: ["PAY", "WEB"], ...over });

const proposal = (over = {}) => ({
  kind: "transition",
  projectKey: "PAY",
  issueKey: "PAY-12",
  issueType: "Bug",
  labels: [],
  toStatus: "In Progress",
  runId: "run-1",
  ...over,
});

const usage = (n, minutesAgo = 5, runId = "other") =>
  Array.from({ length: n }, (_, i) => ({ at: new Date(NOW.getTime() - (minutesAgo + i) * 60_000).toISOString(), runId }));

const codes = (v) => v.reasons.map((r) => r.code);

describe("evaluate", () => {
  it("clears an ordinary in-scope write", () => {
    expect(evaluate(mandate(), proposal(), [], NOW)).toEqual({ decision: "allow", reasons: [] });
  });

  it("refuses a revoked, paused or expired mandate", () => {
    expect(codes(evaluate(mandate({ status: "revoked" }), proposal(), [], NOW))).toContain("MANDATE_REVOKED");
    expect(codes(evaluate(mandate({ status: "paused" }), proposal(), [], NOW))).toContain("MANDATE_PAUSED");
    expect(codes(evaluate(mandate({ expiresAt: "2026-11-01T00:00:00Z" }), proposal(), [], NOW))).toContain("MANDATE_EXPIRED");
  });

  it("refuses actions, projects, blocked labels and protected types outside the mandate", () => {
    expect(codes(evaluate(mandate({ kinds: ["comment"] }), proposal(), [], NOW))).toContain("ACTION_NOT_ALLOWED");
    expect(codes(evaluate(mandate(), proposal({ projectKey: "HR" }), [], NOW))).toContain("PROJECT_OUTSIDE_MANDATE");
    expect(codes(evaluate(mandate(), proposal({ labels: ["Security"] }), [], NOW))).toContain("BLOCKED_LABEL");
    expect(codes(evaluate(mandate(), proposal({ issueType: "epic" }), [], NOW))).toContain("PROTECTED_ISSUE_TYPE");
  });

  it("reports every broken rule at once", () => {
    const v = evaluate(mandate(), proposal({ projectKey: "HR", labels: ["security"], issueType: "Epic" }), [], NOW);
    expect(v.decision).toBe("deny");
    expect(codes(v)).toEqual(expect.arrayContaining(["PROJECT_OUTSIDE_MANDATE", "BLOCKED_LABEL", "PROTECTED_ISSUE_TYPE"]));
  });

  it("enforces rolling hourly, daily and per-run limits from real timestamps", () => {
    expect(codes(evaluate(mandate(), proposal(), usage(20), NOW))).toContain("HOURLY_LIMIT");
    expect(codes(evaluate(mandate(), proposal(), usage(60, 90), NOW))).toContain("DAILY_LIMIT");
    expect(codes(evaluate(mandate(), proposal(), usage(10, 5, "run-1"), NOW))).toContain("RUN_LIMIT");
    expect(evaluate(mandate(), proposal(), usage(20, 120), NOW).decision).not.toBe("deny");
  });

  it("holds sensitive labels, priorities, statuses, outside assignees and big runs", () => {
    expect(codes(evaluate(mandate(), proposal({ labels: ["release-critical"] }), [], NOW))).toEqual(["SENSITIVE_LABEL"]);
    expect(codes(evaluate(mandate(), proposal({ kind: "set_priority", priority: "highest" }), [], NOW))).toEqual(["SENSITIVE_PRIORITY"]);
    expect(codes(evaluate(mandate(), proposal({ toStatus: "done" }), [], NOW))).toEqual(["SENSITIVE_STATUS"]);
    expect(codes(evaluate(mandate(), proposal({ kind: "assign", assigneeOutsideProject: true }), [], NOW))).toEqual(["OUTSIDE_ASSIGNEE"]);
    expect(codes(evaluate(mandate(), proposal(), usage(5, 5, "run-1"), NOW))).toEqual(["LARGE_RUN"]);
    expect(codes(evaluate(mandate(), proposal({ protectedGoal: "Q4 launch" }), [], NOW))).toEqual(["PROTECTED_GOAL"]);
    expect(codes(evaluate(mandate(), proposal({ contextUnavailable: true }), [], NOW))).toEqual(["CONTEXT_UNAVAILABLE"]);
  });

  it("a refusal always wins over a hold", () => {
    expect(evaluate(mandate(), proposal({ labels: ["release-critical", "security"] }), [], NOW).decision).toBe("deny");
  });
});

describe("evaluatePlan", () => {
  it("refuses a 40-item bulk plan past the per-run limit before anything runs", () => {
    const plan = evaluatePlan(mandate({ holdAboveRun: 100 }), Array.from({ length: 40 }, (_, i) => proposal({ issueKey: `PAY-${i + 1}` })), [], NOW);
    expect(plan.filter((p) => p.verdict.decision === "allow")).toHaveLength(10);
    expect(plan.slice(10).every((p) => codes(p.verdict).includes("RUN_LIMIT"))).toBe(true);
  });

  it("refused items do not consume budget for the rest of the plan", () => {
    const items = [proposal({ labels: ["security"] }), ...Array.from({ length: 10 }, () => proposal())];
    const plan = evaluatePlan(mandate({ holdAboveRun: 100 }), items, [], NOW);
    expect(plan.filter((p) => p.verdict.decision === "allow")).toHaveLength(10);
  });
});

describe("sanitizeMandate", () => {
  it("normalises lists and rejects impossible limits", () => {
    const prev = mandate();
    const ok = sanitizeMandate({ ...prev, projects: "pay, web ,", kinds: ["comment", "drop_database"] }, prev);
    expect(ok.mandate.projects).toEqual(["PAY", "WEB"]);
    expect(ok.mandate.kinds).toEqual(["comment"]);
    expect(ok.mandate.version).toBe(prev.version + 1);
    expect(sanitizeMandate({ ...prev, limits: { perHour: 100, perDay: 10, perRun: 5 } }, prev).error).toMatch(/hourly/);
    expect(sanitizeMandate({ ...prev, expiresAt: "soon" }, prev).error).toMatch(/expiry/);
  });
});

describe("evaluate (properties)", () => {
  const arbProposal = fc.record({
    kind: fc.constantFrom(...ACTION_KINDS),
    projectKey: fc.constantFrom("PAY", "WEB", "HR", "x"),
    issueKey: fc.constant("PAY-1"),
    issueType: fc.constantFrom("Bug", "Task", "Epic"),
    labels: fc.array(fc.constantFrom("security", "release-critical", "ui", "SECURITY"), { maxLength: 3 }),
    toStatus: fc.constantFrom("In Progress", "Done"),
    priority: fc.constantFrom("High", "Highest"),
    runId: fc.constant("run-1"),
  });

  it("is deterministic and never clears a revoked mandate", () => {
    fc.assert(
      fc.property(arbProposal, fc.nat(80), (p, n) => {
        const a = evaluate(mandate({ status: "revoked" }), p, usage(n), NOW);
        expect(a).toEqual(evaluate(mandate({ status: "revoked" }), p, usage(n), NOW));
        expect(a.decision).toBe("deny");
      }),
    );
  });

  it("never clears or holds a blocked label or a project outside the mandate", () => {
    fc.assert(
      fc.property(arbProposal, fc.nat(80), (p, n) => {
        const v = evaluate(mandate(), p, usage(n), NOW);
        if (p.labels.some((l) => l.toLowerCase() === "security") || !["PAY", "WEB"].includes(p.projectKey)) expect(v.decision).toBe("deny");
      }),
    );
  });

  it("more past usage never turns a refusal into anything else", () => {
    fc.assert(
      fc.property(arbProposal, fc.nat(40), fc.nat(40), (p, a, b) => {
        const low = evaluate(mandate(), p, usage(Math.min(a, b)), NOW).decision;
        const high = evaluate(mandate(), p, usage(Math.max(a, b)), NOW).decision;
        if (low === "deny") expect(high).toBe("deny");
      }),
    );
  });
});
