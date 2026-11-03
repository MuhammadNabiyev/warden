import requests
from datetime import datetime, timedelta, timezone


def test_mandate_sanitize_valid_input():
    base_url = "http://localhost:4747"
    try:
        previous_response = requests.get(
            f"{base_url}/mandate/default",
            timeout=30,
        )
        assert previous_response.status_code == 200, (
            f"Expected 200 fetching default mandate, got "
            f"{previous_response.status_code}: {previous_response.text}"
        )
        previous = previous_response.json()
        previous_version = previous.get("version")
        assert isinstance(previous_version, int), (
            f"Expected the default mandate to have an integer version: {previous}"
        )

        expires_at = (
            datetime.now(timezone.utc) + timedelta(days=30)
        ).isoformat().replace("+00:00", "Z")

        payload = {
            "input": {
                "name": "Sanitize Test Mandate",
                "kinds": " transition, assign, comment ",
                "projects": " abc, DEF ",
                "blockedLabels": " security, custom-label ",
                "holdLabels": " release-critical, customer-escalation ",
                "protectedTypes": " Epic ",
                "holdPriorities": " Highest ",
                "holdStatuses": " Done, Closed ",
                "protectedGoals": " production-safety ",
                "limits": {
                    "perHour": 5,
                    "perDay": 20,
                    "perRun": 3,
                },
                "holdAboveRun": 2,
                "expiresAt": expires_at,
            },
            "previous": previous,
        }

        response = requests.post(
            f"{base_url}/mandate/sanitize",
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=30,
        )
        assert response.status_code == 200, (
            f"Expected 200 sanitizing valid mandate, got "
            f"{response.status_code}: {response.text}"
        )

        body = response.json()
        assert isinstance(body, dict) and isinstance(body.get("mandate"), dict), (
            f"Expected response to contain a normalized mandate: {body}"
        )
        mandate = body["mandate"]

        assert mandate.get("version") == previous_version + 1, (
            f"Expected mandate version {previous_version + 1}, got "
            f"{mandate.get('version')}"
        )
        assert mandate.get("projects") == ["ABC", "DEF"], (
            f"Expected trimmed, upper-cased projects, got {mandate.get('projects')}"
        )
        assert mandate.get("kinds") == ["transition", "assign", "comment"], (
            f"Expected normalized known kinds, got {mandate.get('kinds')}"
        )
        assert mandate.get("blockedLabels") == ["security", "custom-label"], (
            f"Expected trimmed blocked labels, got {mandate.get('blockedLabels')}"
        )
        assert mandate.get("limits") == {
            "perHour": 5,
            "perDay": 20,
            "perRun": 3,
        }, f"Unexpected normalized limits: {mandate.get('limits')}"
    except requests.RequestException as exc:
        raise AssertionError(f"HTTP request failed: {exc}") from exc


if __name__ == "__main__":
    test_mandate_sanitize_valid_input()