import requests


def test_evaluate_single_write_policy_decision():
    base_url = "http://localhost:4747"
    now = "2026-11-03T12:00:00.000Z"
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
            "projects": ["WARDEN"],
            "status": "active",
            "expiresAt": "2099-12-31T23:59:59.000Z",
        },
        "usage": [],
        "now": now,
    }

    try:
        response = requests.post(
            f"{base_url}/evaluate",
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=30,
        )
    except requests.RequestException as exc:
        raise AssertionError(f"Request to /evaluate failed: {exc}") from exc

    assert response.status_code == 200, (
        f"Expected HTTP 200, got {response.status_code}: {response.text}"
    )

    try:
        body = response.json()
    except ValueError as exc:
        raise AssertionError("Response body was not valid JSON") from exc

    assert isinstance(body, dict), "Response should be a JSON object"
    assert body.get("decision") in {"allow", "hold", "deny"}
    assert isinstance(body.get("reasons"), list), "reasons should be an array"
    assert body["decision"] == "allow", f"Expected allow, got {body['decision']}"
    assert body["reasons"] == [], f"Expected no reasons for an allowed write, got {body['reasons']}"


if __name__ == "__main__":
    test_evaluate_single_write_policy_decision()