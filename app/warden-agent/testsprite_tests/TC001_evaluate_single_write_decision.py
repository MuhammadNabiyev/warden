import requests


def test_evaluate_single_write_decision():
    url = "http://localhost:4747/evaluate"
    now = "2026-11-03T12:00:00Z"
    payload = {
        "proposal": {
            "kind": "transition",
            "issueKey": "WARDEN-1",
            "projectKey": "WARDEN",
            "issueType": "Task",
            "labels": [],
            "toStatus": "In Progress",
            "runId": "tc001-run",
        },
        "mandate": {
            "status": "active",
            "projects": ["WARDEN"],
            "kinds": ["transition"],
            "blockedLabels": ["security"],
            "holdLabels": ["release-critical", "customer-escalation"],
            "protectedTypes": ["Epic"],
            "holdPriorities": ["Highest"],
            "holdStatuses": ["Done", "Closed"],
            "limits": {"perHour": 20, "perDay": 60, "perRun": 10},
            "holdAboveRun": 5,
            "expiresAt": "2027-12-31T23:59:59Z",
        },
        "usage": [],
        "now": now,
    }

    try:
        response = requests.post(
            url,
            json=payload,
            headers={"Content-Type": "application/json", "Accept": "application/json"},
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
    assert body.get("decision") == "allow", f"Expected decision 'allow', got {body.get('decision')!r}"
    assert body.get("reasons") == [], f"Expected no reasons for the allowed proposal, got {body.get('reasons')!r}"


if __name__ == "__main__":
    test_evaluate_single_write_decision()