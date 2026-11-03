import copy
import requests


BASE_URL = "http://localhost:4747"


def test_mandate_sanitize_invalid_expires_or_limits():
    session = requests.Session()

    try:
        previous_response = session.get(
            f"{BASE_URL}/mandate/default",
            timeout=30,
        )
        assert previous_response.status_code == 200, (
            f"Expected 200 retrieving default mandate, got "
            f"{previous_response.status_code}: {previous_response.text}"
        )
        previous = previous_response.json()
        previous_snapshot = copy.deepcopy(previous)

        invalid_cases = [
            {
                "name": "invalid expiresAt",
                "input": {
                    **copy.deepcopy(previous),
                    "expiresAt": "not-a-valid-date",
                },
            },
            {
                "name": "perHour greater than perDay",
                "input": {
                    **copy.deepcopy(previous),
                    "expiresAt": "2099-01-01T00:00:00.000Z",
                    "limits": {
                        **previous.get("limits", {}),
                        "perHour": 10,
                        "perDay": 2,
                    },
                },
            },
        ]

        for case in invalid_cases:
            response = session.post(
                f"{BASE_URL}/mandate/sanitize",
                json={
                    "input": case["input"],
                    "previous": previous,
                },
                headers={"Content-Type": "application/json"},
                timeout=30,
            )

            assert response.status_code == 400, (
                f"{case['name']}: expected 400, got "
                f"{response.status_code}: {response.text}"
            )

            try:
                body = response.json()
            except ValueError as exc:
                raise AssertionError(
                    f"{case['name']}: expected a JSON error response, "
                    f"got {response.text!r}"
                ) from exc

            assert isinstance(body, dict), (
                f"{case['name']}: expected a JSON object, got {body!r}"
            )
            assert isinstance(body.get("error"), str) and body["error"].strip(), (
                f"{case['name']}: expected a non-empty error message, got {body!r}"
            )
            assert "mandate" not in body, (
                f"{case['name']}: invalid input must not return a sanitized mandate"
            )
            assert previous == previous_snapshot, (
                f"{case['name']}: the previous mandate was modified"
            )

    except requests.RequestException as exc:
        raise AssertionError(f"Request to the mandate API failed: {exc}") from exc
    finally:
        session.close()


if __name__ == "__main__":
    test_mandate_sanitize_invalid_expires_or_limits()