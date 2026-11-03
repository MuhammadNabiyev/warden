import requests


def test_evaluate_plan_bulk_simulation_success():
    url = "http://localhost:4747/evaluate-plan"
    payload = {
        "mandate": {
            "projects": ["TEST"],
            "kinds": ["transition", "assign", "comment", "set_priority"],
            "blockedLabels": ["security"],
            "holdLabels": ["release-critical"],
            "protectedTypes": ["Epic"],
            "status": "active",
            "expiresAt": "2099-12-31T23:59:59.000Z",
        },
        "proposals": [
            {
                "kind": "transition",
                "issueKey": "TEST-101",
                "projectKey": "TEST",
                "issueType": "Story",
                "labels": [],
                "toStatus": "In Progress",
                "runId": "bulk-success-run",
            },
            {
                "kind": "transition",
                "issueKey": "TEST-102",
                "projectKey": "TEST",
                "issueType": "Story",
                "labels": ["release-critical"],
                "toStatus": "In Progress",
                "runId": "bulk-success-run",
            },
            {
                "kind": "transition",
                "issueKey": "TEST-103",
                "projectKey": "TEST",
                "issueType": "Epic",
                "labels": [],
                "toStatus": "In Progress",
                "runId": "bulk-success-run",
            },
        ],
        "usage": [],
        "now": "2026-11-03T12:00:00.000Z",
    }

    try:
        response = requests.post(
            url,
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=30,
        )
    except requests.RequestException as exc:
        raise AssertionError(f"Request to {url} failed: {exc}") from exc

    assert response.status_code == 200, (
        f"Expected HTTP 200, got {response.status_code}: {response.text}"
    )

    try:
        body = response.json()
    except ValueError as exc:
        raise AssertionError(f"Response was not valid JSON: {response.text}") from exc

    assert isinstance(body, dict), f"Expected a JSON object, got {type(body).__name__}"
    assert isinstance(body.get("results"), list), "Response must contain a results array"
    assert len(body["results"]) == 3, "Expected one result for each proposal"

    results = body["results"]
    assert [result.get("issueKey") for result in results] == [
        "TEST-101",
        "TEST-102",
        "TEST-103",
    ], "Results should preserve the proposal order"
    assert [result.get("decision") for result in results] == ["allow", "hold", "deny"]

    for result in results:
        assert isinstance(result.get("reasons"), list), (
            f"Result for {result.get('issueKey')} must include a reasons array"
        )

    assert any(
        reason.get("code") == "PROTECTED_ISSUE_TYPE"
        for reason in results[2]["reasons"]
    ), "The Epic proposal should be denied for its protected issue type"

    summary = body.get("summary")
    assert isinstance(summary, dict), "Response must contain a summary object"
    assert summary.get("allow") == 1
    assert summary.get("hold") == 1
    assert summary.get("deny") == 1


if __name__ == "__main__":
    test_evaluate_plan_bulk_simulation_success()