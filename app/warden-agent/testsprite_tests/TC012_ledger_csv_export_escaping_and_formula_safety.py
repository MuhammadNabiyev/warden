import csv
import io

import requests


def test_ledger_csv_export_escaping_and_formula_safety():
    base_url = "http://localhost:4747"
    headers = {"Content-Type": "application/json", "Accept": "text/csv, application/json"}
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

    entries = [
        {
            "id": "decision-complex",
            "at": "2026-11-03T10:00:00.000Z",
            "source": "agent",
            "actor": "csv-test",
            "issue": "TEST-1",
            "action": "transition",
            "change": 'A comma, a "double quote", and\na newline',
            "verdict": "allow",
            "reasons": [],
            "outcome": "executed",
            "mandateVersion": 1,
        }
    ]

    formula_prefixes = ("=", "+", "-", "@")
    for index, prefix in enumerate(formula_prefixes):
        entries.append(
            {
                "id": f"decision-formula-{index}",
                "at": f"2026-11-03T10:0{index + 1}:00.000Z",
                "source": "agent",
                "actor": "csv-test",
                "issue": f"TEST-{index + 2}",
                "action": "comment",
                "change": f"{prefix}1+1",
                "verdict": "deny",
                "reasons": [],
                "outcome": "rejected",
                "error": f"{prefix}formula-like error",
                "mandateVersion": 1,
            }
        )

    try:
        response = requests.post(
            f"{base_url}/ledger/csv",
            json={"entries": entries},
            headers=headers,
            timeout=30,
        )
        assert response.status_code == 200, (
            f"Expected 200 from POST /ledger/csv, got {response.status_code}: "
            f"{response.text}"
        )
        assert response.headers.get("Content-Type", "").lower().startswith("text/csv"), (
            f"Expected text/csv content type, got "
            f"{response.headers.get('Content-Type')!r}"
        )

        csv_text = response.text
        assert '"A comma, a ""double quote"", and\na newline"' in csv_text, (
            "The change field was not RFC 4180-quoted with embedded quotes doubled"
        )

        rows = list(csv.reader(io.StringIO(csv_text, newline="")))
        assert rows, "CSV response was empty"
        assert rows[0] == expected_header, f"Unexpected CSV header: {rows[0]!r}"
        assert len(rows) == len(entries) + 1, (
            f"Expected one header and {len(entries)} data rows, got {len(rows)} rows"
        )

        change_index = expected_header.index("change")
        error_index = expected_header.index("error")
        for row in rows[1:]:
            assert len(row) == len(expected_header), (
                f"CSV row has {len(row)} columns instead of {len(expected_header)}: {row!r}"
            )
            for column_index in (change_index, error_index):
                value = row[column_index]
                if value.startswith(("=", "+", "-", "@")):
                    raise AssertionError(
                        f"Formula-like CSV cell was not prefixed with a single quote: {value!r}"
                    )

        id_index = expected_header.index("decision_id")
        formula_rows = {
            row[id_index]: row
            for row in rows[1:]
            if row[id_index].startswith("decision-formula-")
        }
        assert len(formula_rows) == len(formula_prefixes), (
            "Expected all formula-safety test entries in the CSV response"
        )
        for index, prefix in enumerate(formula_prefixes):
            row = formula_rows[f"decision-formula-{index}"]
            assert row[change_index] == f"'{prefix}1+1", (
                f"Formula-like change value was not prefixed safely: {row[change_index]!r}"
            )
            assert row[error_index] == f"'{prefix}formula-like error", (
                f"Formula-like error value was not prefixed safely: {row[error_index]!r}"
            )

        invalid_response = requests.post(
            f"{base_url}/ledger/csv",
            json={"entries": {"not": "an array"}},
            headers=headers,
            timeout=30,
        )
        assert invalid_response.status_code == 400, (
            f"Expected 400 for non-array entries, got {invalid_response.status_code}: "
            f"{invalid_response.text}"
        )
        try:
            invalid_body = invalid_response.json()
            assert isinstance(invalid_body, dict) and invalid_body.get("error"), (
                f"Expected an error in the 400 response, got {invalid_body!r}"
            )
        except ValueError:
            assert "error" in invalid_response.text.lower(), (
                f"Expected an error message in the 400 response: {invalid_response.text!r}"
            )

        empty_response = requests.post(
            f"{base_url}/ledger/csv",
            json={"entries": []},
            headers=headers,
            timeout=30,
        )
        assert empty_response.status_code == 200, (
            f"Expected 200 for empty entries, got {empty_response.status_code}: "
            f"{empty_response.text}"
        )
        assert empty_response.headers.get("Content-Type", "").lower().startswith("text/csv"), (
            f"Expected text/csv content type, got "
            f"{empty_response.headers.get('Content-Type')!r}"
        )
        empty_rows = list(csv.reader(io.StringIO(empty_response.text, newline="")))
        assert empty_rows == [expected_header], (
            f"Expected only the CSV header row for empty entries, got {empty_rows!r}"
        )
    except requests.RequestException as exc:
        raise AssertionError(f"Request to the ledger CSV endpoint failed: {exc}") from exc


if __name__ == "__main__":
    test_ledger_csv_export_escaping_and_formula_safety()