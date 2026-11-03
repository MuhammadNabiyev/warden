import datetime
import requests


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

    assert mandate.get("projects") == [], "Default projects should be an empty list"
    assert mandate.get("blockedLabels") == ["security"]
    assert mandate.get("holdLabels") == ["release-critical", "customer-escalation"]
    assert mandate.get("protectedTypes") == ["Epic"]
    assert mandate.get("holdPriorities") == ["Highest"]
    assert mandate.get("holdStatuses") == ["Done", "Closed"]
    assert mandate.get("limits") == {"perHour": 20, "perDay": 60, "perRun": 10}
    assert mandate.get("holdAboveRun") == 5
    assert mandate.get("status") == "active"
    assert mandate.get("version") == 1

    expires_at = mandate.get("expiresAt")
    assert isinstance(expires_at, str) and expires_at, "Expected an expiresAt timestamp"

    try:
        parsed_expiry = datetime.datetime.fromisoformat(
            expires_at.replace("Z", "+00:00")
        )
    except ValueError as exc:
        raise AssertionError(f"expiresAt is not a valid ISO timestamp: {expires_at}") from exc

    assert parsed_expiry.tzinfo is not None, "expiresAt should include a timezone"
    now = datetime.datetime.now(datetime.timezone.utc)
    remaining = parsed_expiry.astimezone(datetime.timezone.utc) - now
    assert datetime.timedelta(days=29) <= remaining <= datetime.timedelta(days=31), (
        f"Expected default expiry to be approximately 30 days in the future; "
        f"got {expires_at}"
    )


if __name__ == "__main__":
    test_mandate_default_retrieval()