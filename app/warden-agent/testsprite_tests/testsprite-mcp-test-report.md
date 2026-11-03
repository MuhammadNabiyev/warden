# TestSprite Test Report: Warden policy engine

## 1️⃣ Document Metadata
- **Project Name:** warden-agent (Warden for Jira, Atlassian Forge)
- **Date:** 2026-11-03
- **Target:** the Warden policy engine (`src/policy/*`) served by the local harness `scripts/policy-server.mjs` on port 4747. This is the same code that runs inside Forge.
- **Prepared by:** TestSprite AI Team, completed by Claude Code

---

## 2️⃣ Requirement Validation Summary

### Requirement: Single-write policy decisions (POST /evaluate)

#### Test TC001 evaluate_single_write_policy_decision
- **Test Code:** [TC001_evaluate_single_write_policy_decision.py](./TC001_evaluate_single_write_policy_decision.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/44d5c7af-0d75-57a5-942d-351e7d07be74/test/b165f291-df2f-44b7-b270-2a9aeb48b584
- **Status:** ✅ Passed
- **Analysis / Findings:** Allowed writes return allow with no reasons; sensitive context returns hold with codes.

#### Test TC002 evaluate_single_write_blocked_label_or_revoked_mandate
- **Test Code:** [TC002_evaluate_single_write_blocked_label_or_revoked_mandate.py](./TC002_evaluate_single_write_blocked_label_or_revoked_mandate.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/44d5c7af-0d75-57a5-942d-351e7d07be74/test/00b87495-1eea-4988-9954-47038edb6373
- **Status:** ✅ Passed
- **Analysis / Findings:** Blocked label and revoked mandate return deny; deny wins over hold.

#### Test TC003 evaluate_single_write_invalid_request_body
- **Test Code:** [TC003_evaluate_single_write_invalid_request_body.py](./TC003_evaluate_single_write_invalid_request_body.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/44d5c7af-0d75-57a5-942d-351e7d07be74/test/f675daf6-d937-4e21-8dc2-46580aec263c
- **Status:** ✅ Passed
- **Analysis / Findings:** Missing proposal / malformed JSON return 400 with an error message.

### Requirement: Bulk plan simulation (POST /evaluate-plan)

#### Test TC004 evaluate_plan_bulk_simulation_success
- **Test Code:** [TC004_evaluate_plan_bulk_simulation_success.py](./TC004_evaluate_plan_bulk_simulation_success.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/44d5c7af-0d75-57a5-942d-351e7d07be74/test/1d0f5d24-7837-4a74-9101-767d9be3390f
- **Status:** ✅ Passed
- **Analysis / Findings:** Per-item verdicts and the allow/hold/deny summary match the items.

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
- **Analysis / Findings:** Default mandate matches the documented conservative shape.

#### Test TC008 mandate_sanitize_valid_input
- **Test Code:** [TC008_mandate_sanitize_valid_input.py](./TC008_mandate_sanitize_valid_input.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/44d5c7af-0d75-57a5-942d-351e7d07be74/test/ce710e2e-d5ea-406a-949d-08232ffbcec9
- **Status:** ✅ Passed
- **Analysis / Findings:** Comma lists trimmed, project keys upper-cased, unknown kinds dropped, version bumped.

#### Test TC009 mandate_sanitize_invalid_expires_or_limits
- **Test Code:** [TC009_mandate_sanitize_invalid_expires_or_limits.py](./TC009_mandate_sanitize_invalid_expires_or_limits.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/44d5c7af-0d75-57a5-942d-351e7d07be74/test/65e25d4f-9cee-4860-90e4-b7671c893c6d
- **Status:** ✅ Passed
- **Analysis / Findings:** Invalid expiry and perHour > perDay are rejected with 400.

### Requirement: Harness health

#### Test TC010 health_endpoint_liveness_check
- **Test Code:** [TC010_health_endpoint_liveness_check.py](./TC010_health_endpoint_liveness_check.py)
- **Test Visualization and Result:** https://www.testsprite.com/dashboard/mcp/tests/44d5c7af-0d75-57a5-942d-351e7d07be74/test/4152173c-753e-4d64-ab26-b08be2bc9ad5
- **Status:** ✅ Passed
- **Analysis / Findings:** GET /health returns ok true.

---

## 3️⃣ Coverage & Matching Metrics

- **10 of 10 tests passed (100%)**

| Requirement | Total Tests | ✅ Passed | ❌ Failed |
|---|---|---|---|
| Single-write policy decisions (POST /evaluate) | 3 | 3 | 0 |
| Bulk plan simulation (POST /evaluate-plan) | 3 | 3 | 0 |
| Mandate defaults and validation | 3 | 3 | 0 |
| Harness health | 1 | 1 | 0 |

---

## 4️⃣ Key Gaps / Risks

- Jira reads and writes, the approval queue and the KVS ledger run only inside Forge; the harness does not expose them. They are covered by manual end-to-end checks on a Forge site.
- The Teamwork Graph lookup (`src/graph.js`) needs a live site; the harness covers its policy effect (PROTECTED_GOAL, CONTEXT_UNAVAILABLE) through proposal fields.
- 13 Vitest unit and property tests (fast-check) cover the engine in-process alongside these black-box API tests.
