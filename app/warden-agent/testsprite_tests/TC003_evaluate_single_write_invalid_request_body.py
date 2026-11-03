import requests


def test_evaluate_single_write_invalid_request_body():
    url = "http://localhost:4747/evaluate"
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    invalid_requests = [
        {"data": "{", "description": "malformed JSON"},
        {"json": {}, "description": "missing proposal"},
    ]

    for invalid_request in invalid_requests:
        description = invalid_request.pop("description")
        try:
            response = requests.post(
                url,
                headers=headers,
                timeout=30,
                **invalid_request,
            )
        except requests.RequestException as exc:
            raise AssertionError(f"Request failed for {description}: {exc}") from exc

        assert response.status_code == 400, (
            f"Expected HTTP 400 for {description}, got {response.status_code}: "
            f"{response.text}"
        )

        try:
            body = response.json()
        except ValueError as exc:
            raise AssertionError(
                f"Expected a JSON error response for {description}, got: {response.text}"
            ) from exc

        assert isinstance(body, dict), f"Expected a JSON object, got {body!r}"
        assert isinstance(body.get("error"), str) and body["error"].strip(), (
            f"Expected a non-empty validation error message for {description}, got {body!r}"
        )


if __name__ == "__main__":
    test_evaluate_single_write_invalid_request_body()