import requests

BASE_URL = "http://localhost:4747"


def test_evaluate_single_write_invalid_request_body():
    headers = {"Content-Type": "application/json"}

    try:
        invalid_json_response = requests.post(
            f"{BASE_URL}/evaluate",
            data='{"proposal":',
            headers=headers,
            timeout=30,
        )
        assert invalid_json_response.status_code == 400, (
            f"Expected 400 for invalid JSON, got {invalid_json_response.status_code}: "
            f"{invalid_json_response.text}"
        )
        invalid_json_body = invalid_json_response.json()
        assert isinstance(invalid_json_body, dict), "Expected a JSON error response"
        assert isinstance(invalid_json_body.get("error"), str) and invalid_json_body["error"], (
            f"Expected a non-empty validation error, got: {invalid_json_body}"
        )

        missing_proposal_response = requests.post(
            f"{BASE_URL}/evaluate",
            json={},
            timeout=30,
        )
        assert missing_proposal_response.status_code == 400, (
            f"Expected 400 when proposal is missing, got "
            f"{missing_proposal_response.status_code}: {missing_proposal_response.text}"
        )
        missing_proposal_body = missing_proposal_response.json()
        assert isinstance(missing_proposal_body, dict), "Expected a JSON error response"
        assert isinstance(missing_proposal_body.get("error"), str) and missing_proposal_body["error"], (
            f"Expected a non-empty validation error, got: {missing_proposal_body}"
        )
    except requests.RequestException as exc:
        raise AssertionError(f"Request to the policy harness failed: {exc}") from exc


if __name__ == "__main__":
    test_evaluate_single_write_invalid_request_body()