"""Iteração 21 — Email de boas-vindas automático no registo de nova empresa."""
import os
import time
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values(Path("/app/frontend/.env"))
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or frontend_env["REACT_APP_BACKEND_URL"]).rstrip("/")
API = f"{BASE_URL}/api"
SUPER = {"email": "denis.ferreira0909@gmail.com", "password": "Cobrancas2026!"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


def _sa_companies(token):
    r = requests.get(f"{API}/superadmin/companies", headers={"Authorization": f"Bearer {token}"}, timeout=20)
    assert r.status_code == 200, r.text
    return {c["id"]: c for c in r.json()}


def _wait_welcome(token, company_id, timeout=25):
    deadline = time.time() + timeout
    while time.time() < deadline:
        c = _sa_companies(token)[company_id]
        if c.get("welcome_email_sent_at") or c.get("welcome_email_error"):
            return c
        time.sleep(2)
    pytest.fail("welcome email status never recorded")


def test_register_sends_welcome_email_to_deliverable_address():
    ts = int(time.time())
    email = f"delivered+it21-{ts}@resend.dev"
    r = requests.post(f"{API}/auth/register", json={
        "company_name": f"IT21 Welcome {ts}", "full_name": "Ana Teste",
        "email": email, "password": "teste123456", "origin": BASE_URL,
    }, timeout=30)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["token"] and body["company"]["plan"] == "Trial"
    company_id = body["company"]["id"]

    sa = _login(SUPER)
    c = _wait_welcome(sa, company_id)
    assert c["welcome_email_sent_at"], c
    assert not c.get("welcome_email_error"), c


def test_register_still_succeeds_when_recipient_undeliverable():
    ts = int(time.time())
    r = requests.post(f"{API}/auth/register", json={
        "company_name": f"IT21 Blocked {ts}", "full_name": "Rui Teste",
        "email": f"blocked.it21.{ts}@example.com", "password": "teste123456", "origin": "http://localhost:3000",
    }, timeout=30)
    assert r.status_code == 200, r.text
    company_id = r.json()["company"]["id"]

    sa = _login(SUPER)
    c = _wait_welcome(sa, company_id)
    assert c.get("welcome_email_error"), c
    assert not c.get("welcome_email_sent_at"), c


def test_register_without_origin_is_accepted():
    ts = int(time.time())
    r = requests.post(f"{API}/auth/register", json={
        "company_name": f"IT21 NoOrigin {ts}", "email": f"delivered+it21noorigin-{ts}@resend.dev", "password": "teste123456",
    }, timeout=30)
    assert r.status_code == 200, r.text
    assert r.json()["user"]["role"] == "admin"
