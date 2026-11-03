import requests


BASE_URL = "http://localhost:4747"


def test_evaluate_plan_invalid_proposals_type():
    url = f"{BASE_URL}/evaluate-plan"
    payload = {"proposals": "not-an-array"}

    try:
        response = requests.post(
            url,
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=30,
        )
    except requests.RequestException as exc:
        raise AssertionError(f"Request to {url} failed: {exc}") from exc

    assert response.status_code == 400, (
        f"Expected HTTP 400, got {response.status_code}: {response.text}"
    )

    try:
        body = response.json()
    except ValueError as exc:
        raise AssertionError(f"Expected a JSON error response, got: {response.text}") from exc

    assert isinstance(body, dict), f"Expected a JSON object, got {type(body).__name__}"
    error = body.get("error")
    assert isinstance(error, str) and error.strip(), (
        f"Expected a non-empty error message, got: {body}"
    )


if __name__ == "__main__":
    test_evaluate_plan_invalid_proposals_type()