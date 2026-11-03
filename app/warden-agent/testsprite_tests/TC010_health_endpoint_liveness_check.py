import requests


def test_health_endpoint_liveness_check():
    url = "http://localhost:4747/health"

    try:
        response = requests.get(url, timeout=30)
    except requests.RequestException as exc:
        raise AssertionError(f"Health endpoint request failed: {exc}") from exc

    assert response.status_code == 200, (
        f"Expected HTTP 200, got {response.status_code}: {response.text}"
    )

    try:
        body = response.json()
    except ValueError as exc:
        raise AssertionError("Health endpoint did not return valid JSON") from exc

    assert body == {"ok": True}, f"Expected {{'ok': True}}, got {body!r}"


if __name__ == "__main__":
    test_health_endpoint_liveness_check()