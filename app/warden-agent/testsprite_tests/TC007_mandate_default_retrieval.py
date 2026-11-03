import requests
from datetime import datetime, timezone


def test_mandate_default_retrieval():
    url = "http://localhost:4747/mandate/default"

    try:
        response = requests.get(url, timeout=30)
    except requests.RequestException as exc:
        raise AssertionError(f"Request to {url} failed: {exc}") from exc

    assert response.status_code == 200, (
        f"Expected HTTP 200, got {response.status_code}: {response.text}"
    )

    try:
        mandate = response.json()
    except ValueError as exc:
        raise AssertionError("Response body is not valid JSON") from exc

    assert isinstance(mandate, dict), "Expected the default mandate to be a JSON object"
    assert mandate.get("projects") == [], "Expected default projects to be empty"
    assert mandate.get("blockedLabels") == ["security"]
    assert mandate.get("holdLabels") == ["release-critical", "customer-escalation"]
    assert mandate.get("protectedTypes") == ["Epic"]
    assert mandate.get("holdPriorities") == ["Highest"]
    assert mandate.get("holdStatuses") == ["Done", "Closed"]
    assert mandate.get("status") == "active"
    assert mandate.get("version") == 1
    assert mandate.get("holdAboveRun") == 5

    limits = mandate.get("limits")
    assert isinstance(limits, dict), "Expected limits to be an object"
    assert limits.get("perHour") == 20
    assert limits.get("perDay") == 60
    assert limits.get("perRun") == 10

    expires_at = mandate.get("expiresAt")
    assert isinstance(expires_at, str) and expires_at, "Expected expiresAt to be a non-empty string"
    try:
        expiry = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
    except ValueError as exc:
        raise AssertionError(f"expiresAt is not a valid ISO date string: {expires_at}") from exc

    if expiry.tzinfo is None:
        expiry = expiry.replace(tzinfo=timezone.utc)

    days_until_expiry = (expiry - datetime.now(timezone.utc)).total_seconds() / 86400
    assert 29 <= days_until_expiry <= 31, (
        f"Expected expiry to be about 30 days from now, got {days_until_expiry:.2f} days"
    )


if __name__ == "__main__":
    test_mandate_default_retrieval()