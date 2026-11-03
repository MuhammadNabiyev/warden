import requests
from datetime import datetime, timedelta, timezone


def test_mandate_sanitize_valid_input():
    base_url = "http://localhost:4747"
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    timeout = 30

    try:
        previous_response = requests.get(
            f"{base_url}/mandate/default",
            headers=headers,
            timeout=timeout,
        )
        assert previous_response.status_code == 200, (
            f"GET /mandate/default failed: {previous_response.status_code} "
            f"{previous_response.text}"
        )
        previous = previous_response.json()
        assert isinstance(previous, dict), "Default mandate should be a JSON object"
        previous_version = previous.get("version")
        assert isinstance(previous_version, int), "Default mandate should include an integer version"

        expires_at = (
            datetime.now(timezone.utc) + timedelta(days=365)
        ).isoformat().replace("+00:00", "Z")

        payload = {
            "previous": previous,
            "input": {
                "name": "  Admin Test Mandate  ",
                "kinds": " transition, assign, not-a-kind ",
                "projects": " proj , another ",
                "blockedLabels": " security, custom-block ",
                "holdLabels": " release-critical, customer-escalation ",
                "protectedTypes": " Epic, Story ",
                "holdPriorities": " Highest ",
                "holdStatuses": " Done, Closed ",
                "protectedGoals": " goal-one, goal-two ",
                "limits": {
                    "perHour": 5,
                    "perDay": 20,
                    "perRun": 3,
                },
                "holdAboveRun": 2,
                "expiresAt": expires_at,
            },
        }

        response = requests.post(
            f"{base_url}/mandate/sanitize",
            json=payload,
            headers=headers,
            timeout=timeout,
        )
        assert response.status_code == 200, (
            f"POST /mandate/sanitize failed: {response.status_code} {response.text}"
        )

        body = response.json()
        assert isinstance(body, dict), "Response should be a JSON object"
        mandate = body.get("mandate")
        assert isinstance(mandate, dict), "Response should contain a mandate object"

        assert mandate.get("version") == previous_version + 1, (
            "Sanitized mandate version should be incremented from the previous mandate"
        )
        assert set(mandate.get("projects", [])) == {"PROJ", "ANOTHER"}, (
            "Project keys should be trimmed and upper-cased"
        )
        assert set(mandate.get("kinds", [])) == {"transition", "assign"}, (
            "Kinds should be trimmed and restricted to known values"
        )
        assert set(mandate.get("blockedLabels", [])) == {"security", "custom-block"}, (
            "Blocked labels should be trimmed"
        )
        assert set(mandate.get("holdLabels", [])) == {
            "release-critical",
            "customer-escalation",
        }, "Hold labels should be trimmed"
        assert mandate.get("limits") == {
            "perHour": 5,
            "perDay": 20,
            "perRun": 3,
        }, "Sanitized mandate should preserve valid limits"
        assert mandate.get("holdAboveRun") == 2
        assert mandate.get("expiresAt"), "Sanitized mandate should include an expiry"

    except requests.RequestException as exc:
        raise AssertionError(f"Request to the policy harness failed: {exc}") from exc


if __name__ == "__main__":
    test_mandate_sanitize_valid_input()