"""Helper: create/delete two TEST_ charges for the same client to validate grouping in the UI."""
import sys
import requests
from conftest import API

CREDS = {"email": "denis.ferreira0909@gmail.com", "password": "Cobrancas2026!"}


def session():
    r = requests.post(f"{API}/auth/login", json=CREDS, timeout=30)
    r.raise_for_status()
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {r.json()['token']}", "Content-Type": "application/json"})
    return s


def create():
    s = session()
    ids = []
    for i, (inv, amount) in enumerate([("TEST-QA/001", 100.0), ("TEST-QA/002", 250.5)]):
        payload = {
            "debtor_name": "TEST_QA Grupo Cliente",
            "debtor_nif": "999888777",
            "debtor_email": "qa.grupo@example.com",
            "debtor_phone": "+351911111111",
            "invoice_number": inv,
            "amount": amount,
            "due_date": "2026-06-01",
            "status": "pendente",
        }
        r = s.post(f"{API}/charges", json=payload, timeout=30)
        r.raise_for_status()
        ids.append(r.json()["id"])
    print(" ".join(ids))


def delete(ids):
    s = session()
    for cid in ids:
        r = s.delete(f"{API}/charges/{cid}", timeout=30)
        print(cid, r.status_code)


if __name__ == "__main__":
    if sys.argv[1] == "create":
        create()
    else:
        delete(sys.argv[2:])
