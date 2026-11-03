/**
 * Ledger export for auditors: one CSV row per decision, oldest first, every rule that fired.
 */
const COLUMNS = ["decided_at", "decision_id", "source", "actor", "issue", "action", "change", "verdict", "rules", "outcome", "approved_by", "approved_at", "mandate_version", "error"];

/** RFC 4180 quoting; a leading = + - @ is neutralised so spreadsheets never run a cell as a formula. */
export function csvCell(value) {
  let s = value === undefined || value === null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

export function ledgerCsv(entries) {
  const rows = [...entries]
    .sort((a, b) => String(a.at).localeCompare(String(b.at)))
    .map((e) => [
      e.at,
      e.id,
      e.source,
      e.actor,
      e.issueKey,
      e.kind,
      e.change,
      e.verdict?.decision,
      (e.verdict?.reasons || []).map((r) => r.code).join(" "),
      e.status,
      e.approvedBy,
      e.approvedAt,
      e.mandateVersion,
      e.error,
    ]);
  return [COLUMNS, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
}
