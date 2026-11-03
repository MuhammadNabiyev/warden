import csv
import io

import requests


BASE_URL = "http://localhost:4747"


def test_ledger_csv_export_format():
    entries = [
        {
            "id": "decision-hold",
            "at": "2026-11-03T10:02:00Z",
            "source": "rovo",
            "actor": "agent-1",
            "issue": "WARDS-102",
            "action": "transition",
            "change": "Set status to Done",
            "verdict": "hold",
            "reasons": [{"code": "SENSITIVE_STATUS", "message": "Approval required"}],
            "outcome": "approved",
            "approvedBy": "Morgan Admin",
            "approvedAt": "2026-11-03T10:05:00Z",
            "mandateVersion": 3,
            "error": "",
        },
        {
            "id": "decision-deny",
            "at": "2026-11-03T10:03:00Z",
            "source": "rovo",
            "actor": "agent-1",
            "issue": "WARDS-103",
            "action": "transition",
            "change": "Set status to In Progress",
            "verdict": "deny",
            "reasons": [
                {"code": "BLOCKED_LABEL", "message": "Blocked label"},
                {"code": "RUN_LIMIT", "message": "Run limit reached"},
            ],
            "outcome": "refused",
            "approvedBy": "",
            "approvedAt": "",
            "mandateVersion": 3,
            "error": "",
        },
        {
            "id": "decision-allow",
            "at": "2026-11-03T10:01:00Z",
            "source": "rovo",
            "actor": "agent-1",
            "issue": "WARDS-101",
            "action": "comment",
            "change": "Add a progress update",
            "verdict": "allow",
            "reasons": [],
            "outcome": "completed",
            "approvedBy": "",
            "approvedAt": "",
            "mandateVersion": 3,
            "error": "",
        },
    ]

    try:
        response = requests.post(
            f"{BASE_URL}/ledger/csv",
            json={"entries": entries},
            headers={"Content-Type": "application/json"},
            timeout=30,
        )
    except requests.RequestException as exc:
        raise AssertionError(f"Request to /ledger/csv failed: {exc}") from exc

    assert response.status_code == 200, (
        f"Expected HTTP 200, got {response.status_code}: {response.text}"
    )
    assert response.headers.get("Content-Type", "").lower().startswith("text/csv"), (
        f"Expected text/csv content type, got {response.headers.get('Content-Type')!r}"
    )

    csv_text = response.content.decode("utf-8")
    assert "\n" in csv_text, "CSV response must contain CRLF-terminated rows"
    assert "\n" not in csv_text.replace("\r\n", ""), "CSV contains a non-CRLF line ending"
    assert "\r" not in csv_text.replace("\r\n", ""), "CSV contains a stray carriage return"

    expected_header = [
        "decided_at",
        "decision_id",
        "source",
        "actor",
        "issue",
        "action",
        "change",
        "verdict",
        "rules",
        "outcome",
        "approved_by",
        "approved_at",
        "mandate_version",
        "error",
    ]
    parsed_rows = list(csv.reader(io.StringIO(csv_text, newline="")))
    assert parsed_rows, "CSV response is empty"
    assert parsed_rows[0] == expected_header, (
        f"Unexpected CSV header: {parsed_rows[0]!r}"
    )

    data_rows = list(csv.DictReader(io.StringIO(csv_text, newline="")))
    assert [row["decision_id"] for row in data_rows] == [
        "decision-allow",
        "decision-hold",
        "decision-deny",
    ], "CSV rows were not sorted oldest first by at"

    deny_row = next(row for row in data_rows if row["decision_id"] == "decision-deny")
    assert deny_row["rules"] == "BLOCKED_LABEL RUN_LIMIT"


if __name__ == "__main__":
    test_ledger_csv_export_format()