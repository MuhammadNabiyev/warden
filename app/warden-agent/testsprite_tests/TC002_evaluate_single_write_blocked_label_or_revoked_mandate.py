import requests


BASE_URL = "http://localhost:4747"


def test_evaluate_single_write_blocked_label_or_revoked_mandate():
    payload = {
        "mandate": {
            "projects": ["TEST"],
            "blockedLabels": ["security"],
            "status": "active",
        },
        "proposal": {
            "kind": "transition",
            "issueKey": "TEST-1",
            "projectKey": "TEST",
            "issueType": "Story",
            "labels": ["security"],
        },
        "usage": [],
        "now": "2026-11-03T12:00:00Z",
    }

    try:
        response = requests.post(
            f"{BASE_URL}/evaluate",
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
        raise AssertionError(f"Response was not valid JSON: {response.text}") from exc

    assert body.get("decision") == "deny", f"Expected deny decision, got: {body}"
    reasons = body.get("reasons")
    assert isinstance(reasons, list), f"Expected reasons to be a list, got: {body}"
    reason_codes = {reason.get("code") for reason in reasons if isinstance(reason, dict)}
    assert "BLOCKED_LABEL" in reason_codes, (
        f"Expected BLOCKED_LABEL reason code, got: {reason_codes}"
    )


if __name__ == "__main__":
    test_evaluate_single_write_blocked_label_or_revoked_mandate()