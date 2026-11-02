import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { evaluate } from "../src/policy/evaluate";
import { ACTION_KINDS, type Mandate, type Proposal, type UsageEvent } from "../src/policy/types";

const NOW = new Date("2026-11-10T12:00:00Z");

const mandate = (over: Partial<Mandate> = {}): Mandate => ({
  id: "m1",
  name: "Triage steward",
  agentKey: "triage-steward",
  kinds: ["transition", "comment", "assign", "set_priority"],
  projects: ["WEB", "OPS"],
  blockedLabels: ["security"],
  holdLabels: ["customer-escalation"],
  protectedTypes: ["Epic"],
  limits: { perHour: 10, perDay: 40, perRun: 5 },
  holdPriorities: ["Highest"],
  holdAboveRun: 3,
  expiresAt: "2026-12-31T00:00:00Z",
  status: "active",
  ...over,
});

const proposal = (over: Partial<Proposal> = {}): Proposal => ({
  kind: "transition",
  projectKey: "WEB",
  issueKey: "WEB-12",
  issueType: "Bug",
  labels: [],
  runId: "run-1",
  ...over,
});

const usage = (n: number, minutesAgo = 5, runId = "other"): UsageEvent[] =>
  Array.from({ length: n }, (_, i) => ({ at: new Date(NOW.getTime() - (minutesAgo + i) * 60_000).toISOString(), runId }));

describe("evaluate", () => {
  it("allows an ordinary in-scope write", () => {
    expect(evaluate(mandate(), proposal(), [], NOW)).toEqual({ decision: "allow", reasons: [] });
  });

  it("refuses a revoked, paused or expired mandate", () => {
    expect(evaluate(mandate({ status: "revoked" }), proposal(), [], NOW).reasons[0].code).toBe("REVOKED");
    expect(evaluate(mandate({ status: "paused" }), proposal(), [], NOW).reasons[0].code).toBe("PAUSED");
    expect(evaluate(mandate({ expiresAt: "2026-11-01T00:00:00Z" }), proposal(), [], NOW).reasons[0].code).toBe("EXPIRED");
  });

  it("refuses actions, projects, blocked labels and protected types outside the mandate", () => {
    expect(evaluate(mandate(), proposal({ kind: "create_subtask" }), [], NOW).reasons.map((r) => r.code)).toContain("KIND_NOT_ALLOWED");
    expect(evaluate(mandate(), proposal({ projectKey: "HR" }), [], NOW).reasons.map((r) => r.code)).toContain("PROJECT_NOT_ALLOWED");
    expect(evaluate(mandate(), proposal({ labels: ["Security"] }), [], NOW).reasons.map((r) => r.code)).toContain("BLOCKED_LABEL");
    expect(evaluate(mandate(), proposal({ issueType: "epic" }), [], NOW).reasons.map((r) => r.code)).toContain("PROTECTED_TYPE");
  });

  it("reports every broken rule, not just the first", () => {
    const v = evaluate(mandate(), proposal({ projectKey: "HR", labels: ["security"], issueType: "Epic" }), [], NOW);
    expect(v.decision).toBe("deny");
    expect(v.reasons.map((r) => r.code)).toEqual(expect.arrayContaining(["PROJECT_NOT_ALLOWED", "BLOCKED_LABEL", "PROTECTED_TYPE"]));
  });

  it("enforces rolling hourly, daily and per-run limits", () => {
    expect(evaluate(mandate(), proposal(), usage(10), NOW).reasons.map((r) => r.code)).toContain("HOURLY_LIMIT");
    expect(evaluate(mandate(), proposal(), usage(40, 90), NOW).reasons.map((r) => r.code)).toContain("DAILY_LIMIT");
    expect(evaluate(mandate(), proposal(), usage(5, 5, "run-1"), NOW).reasons.map((r) => r.code)).toContain("RUN_LIMIT");
  });

  it("ignores writes outside the window", () => {
    expect(evaluate(mandate(), proposal(), usage(10, 120), NOW).decision).toBe("allow");
    expect(evaluate(mandate(), proposal(), usage(40, 60 * 25), NOW).decision).toBe("allow");
  });

  it("holds flagged labels, top priority, outside assignees and big runs for a person", () => {
    expect(evaluate(mandate(), proposal({ labels: ["customer-escalation"] }), [], NOW)).toMatchObject({ decision: "hold", reasons: [{ code: "HOLD_LABEL" }] });
    expect(evaluate(mandate(), proposal({ kind: "set_priority", priority: "highest" }), [], NOW).reasons[0].code).toBe("HOLD_PRIORITY");
    expect(evaluate(mandate(), proposal({ kind: "assign", assigneeOutsideProject: true }), [], NOW).reasons[0].code).toBe("HOLD_OUTSIDE_ASSIGNEE");
    expect(evaluate(mandate(), proposal(), usage(3, 5, "run-1"), NOW).reasons[0].code).toBe("HOLD_BIG_RUN");
  });

  it("denies before it holds: a hold never hides a refusal", () => {
    const v = evaluate(mandate(), proposal({ labels: ["customer-escalation", "security"] }), [], NOW);
    expect(v.decision).toBe("deny");
  });
});

describe("evaluate (properties)", () => {
  const arbKind = fc.constantFrom(...ACTION_KINDS);
  const arbProposal = fc.record({
    kind: arbKind,
    projectKey: fc.constantFrom("WEB", "OPS", "HR", "x"),
    issueKey: fc.constant("WEB-1"),
    issueType: fc.constantFrom("Bug", "Task", "Epic"),
    labels: fc.array(fc.constantFrom("security", "customer-escalation", "ui", "Security"), { maxLength: 3 }),
    runId: fc.constant("run-1"),
  });

  it("is deterministic and never allows a revoked mandate", () => {
    fc.assert(
      fc.property(arbProposal, fc.nat(60), (p, n) => {
        const u = usage(n);
        const a = evaluate(mandate({ status: "revoked" }), p, u, NOW);
        const b = evaluate(mandate({ status: "revoked" }), p, u, NOW);
        expect(a).toEqual(b);
        expect(a.decision).toBe("deny");
      }),
    );
  });

  it("never allows a blocked label or a project outside the mandate, whatever else is true", () => {
    fc.assert(
      fc.property(arbProposal, fc.nat(60), (p, n) => {
        const v = evaluate(mandate(), p, usage(n), NOW);
        const blocked = p.labels.some((l) => l.toLowerCase() === "security");
        const outside = !["WEB", "OPS"].includes(p.projectKey);
        if (blocked || outside) expect(v.decision).toBe("deny");
      }),
    );
  });

  it("more past usage can never turn a refusal into an allow", () => {
    fc.assert(
      fc.property(arbProposal, fc.nat(30), fc.nat(30), (p, a, b) => {
        const low = evaluate(mandate(), p, usage(Math.min(a, b)), NOW).decision;
        const high = evaluate(mandate(), p, usage(Math.max(a, b)), NOW).decision;
        if (low === "deny") expect(high).toBe("deny");
      }),
    );
  });
});
