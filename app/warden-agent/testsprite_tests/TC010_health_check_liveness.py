import requests


def test_health_check_liveness():
    url = "http://localhost:4747/health"

    try:
        response = requests.get(url, timeout=30)
    except requests.RequestException as exc:
        raise AssertionError(f"Health check request failed: {exc}") from exc

    assert response.status_code == 200, (
        f"Expected HTTP 200, received {response.status_code}: {response.text}"
    )

    try:
        payload = response.json()
    except ValueError as exc:
        raise AssertionError("Health check response was not valid JSON") from exc

    assert payload == {"ok": True}, f"Expected {{'ok': True}}, received {payload!r}"


if __name__ == "__main__":
    test_health_check_liveness()