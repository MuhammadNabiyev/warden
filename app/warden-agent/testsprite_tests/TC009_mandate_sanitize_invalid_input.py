import copy
import requests


def test_mandate_sanitize_invalid_input():
    base_url = "http://localhost:4747"
    session = requests.Session()

    try:
        default_response = session.get(
            f"{base_url}/mandate/default",
            timeout=30,
        )
        assert default_response.status_code == 200, (
            f"Expected 200 retrieving the default mandate, got "
            f"{default_response.status_code}: {default_response.text}"
        )
        previous = default_response.json()
        previous_snapshot = copy.deepcopy(previous)

        input_fields = (
            "name",
            "kinds",
            "projects",
            "blockedLabels",
            "holdLabels",
            "protectedTypes",
            "holdPriorities",
            "holdStatuses",
            "protectedGoals",
            "limits",
            "holdAboveRun",
            "expiresAt",
        )
        valid_input = {
            key: copy.deepcopy(previous[key])
            for key in input_fields
            if key in previous
        }

        invalid_expiry_input = copy.deepcopy(valid_input)
        invalid_expiry_input["expiresAt"] = "not-a-valid-date"
        response = session.post(
            f"{base_url}/mandate/sanitize",
            json={
                "input": invalid_expiry_input,
                "previous": previous,
            },
            headers={"Content-Type": "application/json"},
            timeout=30,
        )
        assert response.status_code == 400, (
            f"Expected 400 for invalid expiresAt, got "
            f"{response.status_code}: {response.text}"
        )
        error_body = response.json()
        assert isinstance(error_body, dict) and error_body.get("error"), (
            f"Expected an error message for invalid expiresAt, got {error_body}"
        )
        assert "mandate" not in error_body, (
            "Invalid input should be rejected without returning a sanitized mandate"
        )

        invalid_limits_input = copy.deepcopy(valid_input)
        invalid_limits_input["expiresAt"] = previous["expiresAt"]
        invalid_limits_input["limits"] = copy.deepcopy(previous["limits"])
        invalid_limits_input["limits"]["perHour"] = (
            invalid_limits_input["limits"]["perDay"] + 1
        )
        response = session.post(
            f"{base_url}/mandate/sanitize",
            json={
                "input": invalid_limits_input,
                "previous": previous,
            },
            headers={"Content-Type": "application/json"},
            timeout=30,
        )
        assert response.status_code == 400, (
            f"Expected 400 when perHour exceeds perDay, got "
            f"{response.status_code}: {response.text}"
        )
        error_body = response.json()
        assert isinstance(error_body, dict) and error_body.get("error"), (
            f"Expected an error message for invalid limits, got {error_body}"
        )
        assert "mandate" not in error_body, (
            "Invalid input should be rejected without returning a sanitized mandate"
        )

        assert previous == previous_snapshot, (
            "The previous mandate must remain unchanged after rejected submissions"
        )
    except requests.RequestException as exc:
        assert False, f"Request to the policy harness failed: {exc}"
    finally:
        session.close()


if __name__ == "__main__":
    test_mandate_sanitize_invalid_input()