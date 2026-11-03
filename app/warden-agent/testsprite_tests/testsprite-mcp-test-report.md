# TestSprite Test Report: Warden policy engine

## 1️⃣ Document Metadata
- **Project Name:** warden-agent (Warden for Jira, Atlassian Forge)
- **Date:** 2026-11-03
- **Target:** the Warden policy engine and ledger export (`src/policy/*`, `src/export.js`), served by `scripts/policy-server.mjs` on port 4747. This is the same code that runs inside Forge.
- **Runs:** 3 TestSprite cloud runs. Run 1: 9/12. Run 2: 11/12. Run 3: 11/12 in the cloud, with TC012 failing on a bug in the generated test; corrected locally, 12/12.
- **Prepared by:** TestSprite AI Team, completed by Claude Code

---

## 2️⃣ Requirement Validation Summary

### Requirement: Single-write policy decisions (POST /evaluate)

#### Test TC001 evaluate_single_write_decision
- **Test Code:** [TC001_evaluate_single_write_decision.py](./TC001_evaluate_single_write_decision.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/44d5c7af-0d75-57a5-942d-351e7d07be74/test/565ffda6-79e9-4c19-b07a-64ae840c3465
- **Status:** ✅ Passed
- **Analysis / Findings:** Allowed writes return allow with no reasons; sensitive context returns hold with reason codes.

#### Test TC002 evaluate_single_write_blocked_label_or_revoked_mandate
- **Test Code:** [TC002_evaluate_single_write_blocked_label_or_revoked_mandate.py](./TC002_evaluate_single_write_blocked_label_or_revoked_mandate.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/44d5c7af-0d75-57a5-942d-351e7d07be74/test/00b87495-1eea-4988-9954-47038edb6373
- **Status:** ✅ Passed
- **Analysis / Findings:** Blocked label and revoked mandate return deny; deny wins over hold.

#### Test TC003 evaluate_single_write_invalid_request_body
- **Test Code:** [TC003_evaluate_single_write_invalid_request_body.py](./TC003_evaluate_single_write_invalid_request_body.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/44d5c7af-0d75-57a5-942d-351e7d07be74/test/f675daf6-d937-4e21-8dc2-46580aec263c
- **Status:** ✅ Passed
- **Analysis / Findings:** Missing proposal and malformed JSON return 400 with an error.

### Requirement: Bulk plan simulation (POST /evaluate-plan)

#### Test TC004 evaluate_plan_bulk_simulation_success
- **Test Code:** [TC004_evaluate_plan_bulk_simulation_success.py](./TC004_evaluate_plan_bulk_simulation_success.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/44d5c7af-0d75-57a5-942d-351e7d07be74/test/1d0f5d24-7837-4a74-9101-767d9be3390f
- **Status:** ✅ Passed
- **Analysis / Findings:** Per-item verdicts and the allow/hold/deny summary agree.

#### Test TC005 evaluate_plan_exceed_limits_mid_sequence
- **Test Code:** [TC005_evaluate_plan_exceed_limits_mid_sequence.py](./TC005_evaluate_plan_exceed_limits_mid_sequence.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/44d5c7af-0d75-57a5-942d-351e7d07be74/test/5f8c1eb3-717a-42e1-a888-eb3afbf5e72f
- **Status:** ✅ Passed
- **Analysis / Findings:** Limits are projected across the plan: items past the run limit are refused up front.

#### Test TC006 evaluate_plan_invalid_proposals_type
- **Test Code:** [TC006_evaluate_plan_invalid_proposals_type.py](./TC006_evaluate_plan_invalid_proposals_type.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/44d5c7af-0d75-57a5-942d-351e7d07be74/test/d192a510-0ca4-4863-8a3a-0a965e6b69d4
- **Status:** ✅ Passed
- **Analysis / Findings:** Non-array proposals return 400.

### Requirement: Mandate defaults and validation

#### Test TC007 mandate_default_retrieval
- **Test Code:** [TC007_mandate_default_retrieval.py](./TC007_mandate_default_retrieval.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/44d5c7af-0d75-57a5-942d-351e7d07be74/test/a7dad3e3-9cbe-498d-81ba-0b2aad941f60
- **Status:** ✅ Passed
- **Analysis / Findings:** The default mandate matches the documented conservative shape.

#### Test TC008 mandate_sanitize_valid_input
- **Test Code:** [TC008_mandate_sanitize_valid_input.py](./TC008_mandate_sanitize_valid_input.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/44d5c7af-0d75-57a5-942d-351e7d07be74/test/ce710e2e-d5ea-406a-949d-08232ffbcec9
- **Status:** ✅ Passed
- **Analysis / Findings:** Lists trimmed, project keys upper-cased, unknown kinds dropped, version bumped. **Found a real bug in run 1:** the mandate name was not trimmed. Fixed in `defaults.js`; passes since.

#### Test TC009 mandate_sanitize_invalid_input
- **Test Code:** [TC009_mandate_sanitize_invalid_input.py](./TC009_mandate_sanitize_invalid_input.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/44d5c7af-0d75-57a5-942d-351e7d07be74/test/0c340e3f-7996-4b9b-80bf-2dfddd102ef5
- **Status:** ✅ Passed
- **Analysis / Findings:** Invalid expiry and an hourly limit above the daily limit are rejected with 400.

### Requirement: Ledger export for auditors (POST /ledger/csv)

#### Test TC011 ledger_csv_export_format
- **Test Code:** [TC011_ledger_csv_export_format.py](./TC011_ledger_csv_export_format.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/44d5c7af-0d75-57a5-942d-351e7d07be74/test/6961421a-74f0-41a2-a5ea-b9e4b791163b
- **Status:** ✅ Passed
- **Analysis / Findings:** Exact header, CRLF endings, oldest-first order, every rule code in one cell. **Found a real gap in run 1:** the last record had no line ending. Fixed in `export.js`. Run 2 also showed the export rejected the flat `{verdict: "deny", reasons}` shape; the export now accepts both shapes. Passes in run 3.

#### Test TC012 ledger_csv_export_escaping_and_formula_safety
- **Test Code:** [TC012_ledger_csv_export_escaping_and_formula_safety.py](./TC012_ledger_csv_export_escaping_and_formula_safety.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/44d5c7af-0d75-57a5-942d-351e7d07be74/test/94df5f35-9cb6-44b2-b918-6266a37fb937
- **Status:** ✅ Passed (after correcting the generated test)
- **Analysis / Findings:** RFC 4180 quoting and formula neutralisation for = + - @. Run 1 sent `decisionId` instead of `id`; the export now accepts both. In run 3 the generated test checked the header with `decision_id` as column 2 but read ids from column 1 (`decided_at`); that test bug was corrected (one index) and the test passes against the harness.

### Requirement: Harness health

#### Test TC010 health_check_liveness
- **Test Code:** [TC010_health_check_liveness.py](./TC010_health_check_liveness.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/44d5c7af-0d75-57a5-942d-351e7d07be74/test/c1a569de-3f9f-4ebb-b30d-248603d08593
- **Status:** ✅ Passed
- **Analysis / Findings:** GET /health returns ok true.

---

## 3️⃣ Coverage & Matching Metrics

- **12 of 12 tests pass** (11 in the final cloud run, TC012 after correcting one index in the generated test)
- **Bugs TestSprite found in Warden and that were fixed:** 2 (untrimmed mandate name; missing final CRLF in the CSV export)

| Requirement | Total Tests | ✅ Passed | ❌ Failed |
|---|---|---|---|
| Single-write policy decisions (POST /evaluate) | 3 | 3 | 0 |
| Bulk plan simulation (POST /evaluate-plan) | 3 | 3 | 0 |
| Mandate defaults and validation | 3 | 3 | 0 |
| Ledger export for auditors (POST /ledger/csv) | 2 | 2 | 0 |
| Harness health | 1 | 1 | 0 |

---

## 4️⃣ Key Gaps / Risks

- Jira reads and writes, the approval queue and the KVS ledger run only inside Forge, and the harness does not expose them. They were verified end to end on a Rovo-enabled site: real Rovo chat produced Cleared, Refused and Hold verdicts, and the Hold was approved.
- The Teamwork Graph lookup (`src/graph.js`) needs a live site. The harness covers its policy effect (PROTECTED_GOAL, CONTEXT_UNAVAILABLE) through proposal fields.
- 16 Vitest unit and property tests (fast-check) cover the engine and the export in-process.
