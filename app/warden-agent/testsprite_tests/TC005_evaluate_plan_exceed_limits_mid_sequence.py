import requests
from datetime import datetime, timezone


def test_evaluate_plan_exceed_limits_mid_sequence():
    endpoint = "http://localhost:4747/evaluate-plan"
    now = datetime.now(timezone.utc).isoformat()

    def proposal(issue_key, labels=None):
        return {
            "kind": "transition",
            "issueKey": issue_key,
            "projectKey": "TEST",
            "issueType": "Task",
            "labels": labels or [],
            "toStatus": "In Progress",
            "runId": "tc005-run",
        }

    payload = {
        "mandate": {
            "status": "active",
            "projects": ["TEST"],
            "kinds": ["transition"],
            "blockedLabels": ["security"],
            "protectedTypes": ["Epic"],
            "limits": {
                "perRun": 2,
                "perHour": 100,
                "perDay": 100,
            },
        },
        "proposals": [
            proposal("TEST-501"),
            proposal("TEST-502", ["security"]),
            proposal("TEST-503"),
            proposal("TEST-504"),
        ],
        "usage": [],
        "now": now,
    }

    try:
        response = requests.post(endpoint, json=payload, timeout=30)
    except requests.RequestException as exc:
        assert False, f"Request to {endpoint} failed: {exc}"

    assert response.status_code == 200, (
        f"Expected HTTP 200, got {response.status_code}: {response.text}"
    )

    try:
        body = response.json()
    except ValueError as exc:
        assert False, f"Response was not valid JSON: {exc}"

    assert isinstance(body, dict), "Expected a JSON object response"
    results = body.get("results")
    summary = body.get("summary")
    assert isinstance(results, list), "Expected results to be a list"
    assert len(results) == 4, f"Expected 4 results, got {len(results)}"
    assert isinstance(summary, dict), "Expected summary to be an object"

    assert [item.get("issueKey") for item in results] == [
        "TEST-501",
        "TEST-502",
        "TEST-503",
        "TEST-504",
    ]
    assert [item.get("decision") for item in results] == [
        "allow",
        "deny",
        "allow",
        "deny",
    ]

    blocked_reasons = [reason.get("code") for reason in results[1].get("reasons", [])]
    assert "BLOCKED_LABEL" in blocked_reasons, (
        f"Expected BLOCKED_LABEL for TEST-502, got {blocked_reasons}"
    )

    limit_reasons = [reason.get("code") for reason in results[3].get("reasons", [])]
    assert "RUN_LIMIT" in limit_reasons, (
        f"Expected RUN_LIMIT for TEST-504, got {limit_reasons}"
    )

    assert summary.get("allow") == 2, f"Unexpected summary: {summary}"
    assert summary.get("hold") == 0, f"Unexpected summary: {summary}"
    assert summary.get("deny") == 2, f"Unexpected summary: {summary}"


if __name__ == "__main__":
    test_evaluate_plan_exceed_limits_mid_sequence()