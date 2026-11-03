import requests


def test_evaluate_plan_exceed_limits_mid_sequence():
    base_url = "http://localhost:4747"
    run_id = "tc005-run"
    payload = {
        "mandate": {
            "projects": ["PROJ"],
            "blockedLabels": ["security"],
            "limits": {
                "perHour": 20,
                "perDay": 60,
                "perRun": 2,
            },
            "holdAboveRun": 10,
        },
        "proposals": [
            {
                "kind": "transition",
                "issueKey": "PROJ-1",
                "projectKey": "PROJ",
                "issueType": "Task",
                "labels": [],
                "runId": run_id,
            },
            {
                "kind": "transition",
                "issueKey": "PROJ-2",
                "projectKey": "PROJ",
                "issueType": "Task",
                "labels": ["security"],
                "runId": run_id,
            },
            {
                "kind": "transition",
                "issueKey": "PROJ-3",
                "projectKey": "PROJ",
                "issueType": "Task",
                "labels": [],
                "runId": run_id,
            },
            {
                "kind": "transition",
                "issueKey": "PROJ-4",
                "projectKey": "PROJ",
                "issueType": "Task",
                "labels": [],
                "runId": run_id,
            },
        ],
        "usage": [],
        "now": "2026-11-03T12:00:00.000Z",
    }

    try:
        response = requests.post(
            f"{base_url}/evaluate-plan",
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=30,
        )
    except requests.RequestException as exc:
        raise AssertionError(f"Request to /evaluate-plan failed: {exc}") from exc

    assert response.status_code == 200, (
        f"Expected HTTP 200, got {response.status_code}: {response.text}"
    )

    try:
        body = response.json()
    except ValueError as exc:
        raise AssertionError("Response body was not valid JSON") from exc

    assert isinstance(body, dict), "Response should be a JSON object"
    results = body.get("results")
    summary = body.get("summary")
    assert isinstance(results, list) and len(results) == 4, (
        "Expected one result for each of the four proposals"
    )
    assert isinstance(summary, dict), "Response should include a summary object"

    assert [result.get("issueKey") for result in results] == [
        "PROJ-1",
        "PROJ-2",
        "PROJ-3",
        "PROJ-4",
    ]
    assert [result.get("decision") for result in results] == [
        "allow",
        "deny",
        "allow",
        "deny",
    ], "The blocked proposal should not consume run budget; the final proposal should exceed it"

    blocked_codes = {
        reason.get("code")
        for reason in results[1].get("reasons", [])
        if isinstance(reason, dict)
    }
    assert "BLOCKED_LABEL" in blocked_codes

    limit_codes = {
        reason.get("code")
        for reason in results[3].get("reasons", [])
        if isinstance(reason, dict)
    }
    assert "RUN_LIMIT" in limit_codes

    assert summary.get("allow") == 2
    assert summary.get("hold") == 0
    assert summary.get("deny") == 2


if __name__ == "__main__":
    test_evaluate_plan_exceed_limits_mid_sequence()