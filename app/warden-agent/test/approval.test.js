import { beforeEach, describe, expect, it, vi } from "vitest";

// An in-memory stand-in for KVS that enforces FAIL_IF_EXISTS the way the platform does.
const db = new Map();
vi.mock("@forge/kvs", () => ({
  WhereConditions: { beginsWith: () => ({}) },
  kvs: {
    get: async (key) => db.get(key),
    set: async (key, value, options) => {
      if (options?.keyPolicy === "FAIL_IF_EXISTS" && db.has(key)) throw Object.assign(new Error("Key already exists"), { code: "KEY_ALREADY_EXISTS" });
      db.set(key, value);
    },
    query: () => {
      const chain = { where: () => chain, limit: () => chain, cursor: () => chain, getMany: async () => ({ results: [] }) };
      return chain;
    },
  },
}));

const jira = vi.hoisted(() => ({ issueFacts: vi.fn(), transitionIssue: vi.fn(), setPriority: vi.fn(), assignIssue: vi.fn(), addComment: vi.fn(), findUser: vi.fn(), isAssignable: vi.fn() }));
vi.mock("../src/jira.js", () => jira);
vi.mock("../src/graph.js", () => ({ linkedGoals: vi.fn(), protectedMatch: vi.fn() }));

const { approve, decline } = await import("../src/guard.js");
const { defaultMandate } = await import("../src/policy/defaults.js");

const facts = { issueKey: "PAY-4", issueId: "10", projectKey: "PAY", issueType: "Task", labels: ["release-critical"], priority: "Medium", status: "In Progress", assignee: null };

function seed(mandate = {}) {
  db.clear();
  db.set("mandate:default", { ...defaultMandate(), projects: ["PAY"], ...mandate });
  db.set("approval:a1", { id: "a1", decisionId: "d1", decisionAt: new Date().toISOString(), status: "pending", requestedBy: "agent-user", kind: "transition", issueKey: "PAY-4", args: { toStatus: "Done" }, before: facts, change: "Status: In Progress → Done", reasons: [], mandateVersion: 1 });
}

beforeEach(() => {
  seed();
  vi.clearAllMocks();
  jira.issueFacts.mockResolvedValue(facts);
  jira.transitionIssue.mockResolvedValue("Done");
});

describe("deciding a held change", () => {
  it("writes once when two people approve at the same moment", async () => {
    const results = await Promise.all([approve("a1", "alice"), approve("a1", "bob")]);
    expect(jira.transitionIssue).toHaveBeenCalledTimes(1);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });

  it("does not write when a decline wins the race", async () => {
    const results = await Promise.all([decline("a1", "alice"), approve("a1", "bob")]);
    expect(results[0].ok).toBe(true);
    expect(results[1].ok).toBe(false);
    expect(jira.transitionIssue).not.toHaveBeenCalled();
  });

  it("refuses when the mandate now forbids the change, even after a hold", async () => {
    seed({ blockedLabels: ["release-critical"] });
    const result = await approve("a1", "alice");
    expect(result.ok).toBe(false);
    expect(jira.transitionIssue).not.toHaveBeenCalled();
    expect(db.get("approval:a1").status).toBe("refused");
  });

  it("writes nothing when the issue changed while the request waited", async () => {
    jira.issueFacts.mockResolvedValue({ ...facts, status: "Done" });
    const result = await approve("a1", "alice");
    expect(result.ok).toBe(false);
    expect(jira.transitionIssue).not.toHaveBeenCalled();
    expect(db.get("approval:a1").status).toBe("stale");
  });
});
