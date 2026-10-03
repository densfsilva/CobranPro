"""Iteração 22 — Ações em lote (bulk) nas listas de cobranças.

Endpoints testados:
- POST /api/charges/bulk {ids, action}  (admin-only)  action ∈ {mark_paid, delete}
- POST /api/charges/bulk-email {ids}    (qualquer role; rate-limit 1h via dispatch_charge_email)
"""
import os
import time
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values(Path("/app/frontend/.env"))
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or frontend_env["REACT_APP_BACKEND_URL"]).rstrip("/")
API = f"{BASE_URL}/api"

IMPORT_ADMIN = {"email": "import.teste@example.com", "password": "teste123456"}
TECHFLOW_ADMIN = {"email": "denis.ferreira0909@gmail.com", "password": "Cobrancas2026!"}
COBRADOR = {"email": "cobrador@techflow.pt", "password": "Cobrador2026!"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


def _h(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _create_charge(token, *, email="", invoice_prefix="IT22", amount=10.0):
    ts = int(time.time() * 1000)
    inv = f"{invoice_prefix}-{ts}-{os.urandom(2).hex()}"
    r = requests.post(f"{API}/charges", json={
        "debtor_name": "QA Bulk",
        "debtor_email": email,
        "invoice_number": inv,
        "amount": amount,
        "due_date": "2026-01-15",
    }, headers=_h(token), timeout=15)
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


# --- bulk-email -----------------------------------------------------------

def test_bulk_email_sent_no_email_and_rate_limited():
    token = _login(IMPORT_ADMIN)
    ts = int(time.time())
    id_ok = _create_charge(token, email=f"delivered+it22-ok-{ts}@resend.dev")
    id_no = _create_charge(token, email="")
    try:
        r = requests.post(f"{API}/charges/bulk-email", json={"ids": [id_ok, id_no]}, headers=_h(token), timeout=60)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["total"] == 2
        assert body["sent_count"] == 1
        assert any(x["id"] == id_ok for x in body["sent"])
        assert any(x["id"] == id_no for x in body["no_email"])

        # Rate-limit: re-enviar o mesmo id_ok deve cair em rate_limited (429 -> bucket)
        r2 = requests.post(f"{API}/charges/bulk-email", json={"ids": [id_ok]}, headers=_h(token), timeout=30)
        assert r2.status_code == 200, r2.text
        b2 = r2.json()
        assert b2["sent_count"] == 0
        assert any(x["id"] == id_ok for x in b2["rate_limited"]), b2
    finally:
        requests.post(f"{API}/charges/bulk", json={"ids": [id_ok, id_no], "action": "delete"}, headers=_h(token), timeout=15)


# --- bulk mark_paid -------------------------------------------------------

def test_bulk_mark_paid_updates_status_and_ignores_already_paid():
    token = _login(IMPORT_ADMIN)
    a = _create_charge(token)
    b = _create_charge(token)
    try:
        r = requests.post(f"{API}/charges/bulk", json={"ids": [a, b], "action": "mark_paid"},
                          headers=_h(token), timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["action"] == "mark_paid"
        assert body["affected"] == 2
        assert body["ignored"] == 0

        for cid in (a, b):
            got = requests.get(f"{API}/charges/{cid}", headers=_h(token), timeout=10)
            assert got.status_code == 200
            assert got.json()["status"] == "paga"
            assert got.json().get("paid_at")

        # Repetir: já estão pagas -> ignoradas
        r2 = requests.post(f"{API}/charges/bulk", json={"ids": [a, b], "action": "mark_paid"},
                           headers=_h(token), timeout=15)
        assert r2.status_code == 200
        assert r2.json()["affected"] == 0
        assert r2.json()["ignored"] == 2
    finally:
        requests.post(f"{API}/charges/bulk", json={"ids": [a, b], "action": "delete"}, headers=_h(token), timeout=15)


# --- bulk delete + isolamento por tenant ---------------------------------

def test_bulk_delete_ignores_charges_from_other_tenant():
    t_import = _login(IMPORT_ADMIN)
    t_tf = _login(TECHFLOW_ADMIN)
    mine = _create_charge(t_import)
    # cria também na empresa TechFlow uma cobrança descartável
    other = _create_charge(t_tf, invoice_prefix="IT22-OTHER")
    try:
        r = requests.post(f"{API}/charges/bulk", json={"ids": [mine, other], "action": "delete"},
                          headers=_h(t_import), timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["action"] == "delete"
        assert body["affected"] == 1
        assert body["ignored"] == 1

        # mine 404, other ainda existe
        assert requests.get(f"{API}/charges/{mine}", headers=_h(t_import), timeout=10).status_code == 404
        assert requests.get(f"{API}/charges/{other}", headers=_h(t_tf), timeout=10).status_code == 200
    finally:
        requests.post(f"{API}/charges/bulk", json={"ids": [other], "action": "delete"}, headers=_h(t_tf), timeout=15)


# --- validações ----------------------------------------------------------

def test_bulk_invalid_action_returns_400_and_empty_ids_422():
    token = _login(IMPORT_ADMIN)
    cid = _create_charge(token)
    try:
        r = requests.post(f"{API}/charges/bulk", json={"ids": [cid], "action": "nuke"},
                          headers=_h(token), timeout=10)
        assert r.status_code == 400, r.text

        r2 = requests.post(f"{API}/charges/bulk", json={"ids": [], "action": "delete"},
                           headers=_h(token), timeout=10)
        assert r2.status_code == 422, r2.text

        r3 = requests.post(f"{API}/charges/bulk-email", json={"ids": []}, headers=_h(token), timeout=10)
        assert r3.status_code == 422, r3.text
    finally:
        requests.post(f"{API}/charges/bulk", json={"ids": [cid], "action": "delete"}, headers=_h(token), timeout=10)


# --- RBAC cobrador -------------------------------------------------------

def test_cobrador_blocked_on_bulk_but_allowed_on_bulk_email():
    cobrador = _login(COBRADOR)
    admin = _login(TECHFLOW_ADMIN)
    # obter 1 id da empresa TechFlow para o cobrador
    pend = requests.get(f"{API}/charges?status=pendente&limit=1", headers=_h(cobrador), timeout=15)
    assert pend.status_code == 200, pend.text
    items = pend.json() if isinstance(pend.json(), list) else pend.json().get("items") or []
    if not items:
        # fallback: cria um via admin
        cid = _create_charge(admin, invoice_prefix="IT22-RBAC")
    else:
        cid = items[0]["id"]

    try:
        r = requests.post(f"{API}/charges/bulk", json={"ids": [cid], "action": "mark_paid"},
                          headers=_h(cobrador), timeout=10)
        assert r.status_code == 403, r.text

        r2 = requests.post(f"{API}/charges/bulk", json={"ids": [cid], "action": "delete"},
                           headers=_h(cobrador), timeout=10)
        assert r2.status_code == 403, r2.text

        # bulk-email é permitido a qualquer role autenticado
        r3 = requests.post(f"{API}/charges/bulk-email", json={"ids": [cid]},
                           headers=_h(cobrador), timeout=30)
        assert r3.status_code == 200, r3.text
    finally:
        # limpa só se foi criado neste teste
        if not items:
            requests.post(f"{API}/charges/bulk", json={"ids": [cid], "action": "delete"},
                          headers=_h(admin), timeout=10)
