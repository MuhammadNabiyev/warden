import requests


def test_evaluate_single_write_blocked_label_or_revoked_mandate():
    endpoint = "http://localhost:4747/evaluate"
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    proposal_base = {
        "kind": "transition",
        "issueKey": "TEST-1",
        "projectKey": "TEST",
        "issueType": "Task",
        "labels": [],
    }

    cases = [
        (
            {
                "status": "active",
                "projects": ["TEST"],
                "kinds": ["transition"],
                "blockedLabels": ["security"],
            },
            {**proposal_base, "labels": ["security"]},
            "BLOCKED_LABEL",
        ),
        (
            {
                "status": "revoked",
                "projects": ["TEST"],
                "kinds": ["transition"],
                "blockedLabels": ["security"],
            },
            proposal_base,
            "MANDATE_REVOKED",
        ),
    ]

    for mandate, proposal, expected_reason in cases:
        payload = {"mandate": mandate, "proposal": proposal, "usage": []}

        try:
            response = requests.post(
                endpoint,
                json=payload,
                headers=headers,
                timeout=30,
            )
        except requests.RequestException as exc:
            raise AssertionError(f"POST {endpoint} failed: {exc}") from exc

        assert response.status_code == 200, (
            f"Expected HTTP 200, got {response.status_code}: {response.text}"
        )

        try:
            result = response.json()
        except ValueError as exc:
            raise AssertionError("Response body was not valid JSON") from exc

        assert result.get("decision") == "deny", (
            f"Expected deny decision, got {result.get('decision')!r}"
        )
        reasons = result.get("reasons")
        assert isinstance(reasons, list), f"Expected reasons to be a list, got {reasons!r}"
        reason_codes = {reason.get("code") for reason in reasons if isinstance(reason, dict)}
        assert expected_reason in reason_codes, (
            f"Expected reason {expected_reason!r}, got {reason_codes!r}"
        )


if __name__ == "__main__":
    test_evaluate_single_write_blocked_label_or_revoked_mandate()