import requests


def test_evaluate_plan_bulk_simulation_success():
    endpoint = "http://localhost:4747/evaluate-plan"
    payload = {
        "mandate": {
            "status": "active",
            "projects": ["TEST"],
            "kinds": ["transition", "assign", "comment", "set_priority"],
            "blockedLabels": ["security"],
            "holdLabels": ["release-critical"],
            "protectedTypes": ["Epic"],
            "holdPriorities": ["Highest"],
            "holdStatuses": ["Done", "Closed"],
            "limits": {"perHour": 20, "perDay": 60, "perRun": 10},
            "holdAboveRun": 5,
        },
        "proposals": [
            {
                "kind": "comment",
                "issueKey": "TEST-1",
                "projectKey": "TEST",
                "issueType": "Task",
                "labels": [],
            },
            {
                "kind": "comment",
                "issueKey": "TEST-2",
                "projectKey": "TEST",
                "issueType": "Task",
                "labels": ["release-critical"],
            },
            {
                "kind": "comment",
                "issueKey": "TEST-3",
                "projectKey": "TEST",
                "issueType": "Task",
                "labels": ["security"],
            },
        ],
        "usage": [],
        "now": "2026-11-03T12:00:00.000Z",
    }

    try:
        response = requests.post(
            endpoint,
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=30,
        )
    except requests.RequestException as exc:
        raise AssertionError(f"Request to {endpoint} failed: {exc}") from exc

    assert response.status_code == 200, (
        f"Expected HTTP 200, got {response.status_code}: {response.text}"
    )

    try:
        body = response.json()
    except ValueError as exc:
        raise AssertionError("Response was not valid JSON") from exc

    assert isinstance(body, dict), "Response body should be a JSON object"
    results = body.get("results")
    summary = body.get("summary")

    assert isinstance(results, list), "Response should include a results array"
    assert len(results) == 3, f"Expected 3 results, got {len(results)}"
    assert isinstance(summary, dict), "Response should include a summary object"

    expected = [
        ("TEST-1", "allow"),
        ("TEST-2", "hold"),
        ("TEST-3", "deny"),
    ]
    for result, (issue_key, decision) in zip(results, expected):
        assert result.get("issueKey") == issue_key
        assert result.get("decision") == decision
        assert isinstance(result.get("reasons"), list)

    assert summary.get("allow") == 1
    assert summary.get("hold") == 1
    assert summary.get("deny") == 1


if __name__ == "__main__":
    test_evaluate_plan_bulk_simulation_success()