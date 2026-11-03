import { describe, expect, it } from "vitest";
import { csvCell, ledgerCsv } from "../src/export.js";

describe("ledger export", () => {
  it("quotes commas, quotes and newlines", () => {
    expect(csvCell('say "hi", then\nleave')).toBe('"say ""hi"", then\nleave"');
    expect(csvCell(undefined)).toBe("");
  });

  it("neutralises spreadsheet formulas", () => {
    expect(csvCell("=HYPERLINK(\"x\")")).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell("-1")).toBe("'-1");
  });

  it("writes one row per decision, oldest first, with every rule", () => {
    const csv = ledgerCsv([
      { at: "2026-11-03T06:30:00Z", id: "b", issueKey: "PAY-3", kind: "transition", verdict: { decision: "deny", reasons: [{ code: "BLOCKED_LABEL" }, { code: "RUN_LIMIT" }] }, status: "refused" },
      { at: "2026-11-03T06:29:00Z", id: "a", issueKey: "PAY-1", kind: "transition", verdict: { decision: "allow", reasons: [] }, status: "executed" },
    ]).split("\r\n");
    expect(csv).toHaveLength(3);
    expect(csv[0].startsWith("decided_at,decision_id")).toBe(true);
    expect(csv[1]).toContain(",a,");
    expect(csv[2]).toContain("BLOCKED_LABEL RUN_LIMIT");
  });
});
