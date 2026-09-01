"""CobranPro backend API regression tests."""
import time
import uuid
from datetime import date, timedelta

import pytest
import requests

from conftest import API


# ---------- Auth ----------
class TestAuth:
    def test_login_success_returns_company(self, api_client, test_credentials):
        r = api_client.post(f"{API}/auth/login", json=test_credentials)
        assert r.status_code == 200, r.text
        data = r.json()
        assert isinstance(data.get("token"), str) and len(data["token"]) > 20
        comp = data["company"]
        assert comp["email"] == test_credentials["email"].lower()
        assert comp["company_name"] == "TechFlow Solutions Lda"
        assert comp["iban"]
        assert "_id" not in comp and "password_hash" not in comp

    def test_login_wrong_password(self, api_client, test_credentials):
        r = api_client.post(f"{API}/auth/login",
                            json={"email": test_credentials["email"], "password": "WrongPass123!"})
        assert r.status_code == 401, r.text
        assert "detail" in r.json()
        # restore counter by logging in successfully
        ok = api_client.post(f"{API}/auth/login", json=test_credentials)
        assert ok.status_code == 200

    def test_login_unknown_email(self, api_client):
        r = api_client.post(f"{API}/auth/login",
                            json={"email": f"nobody_{uuid.uuid4().hex[:6]}@example.com", "password": "x"})
        assert r.status_code == 401

    def test_login_invalid_email_format(self, api_client):
        r = api_client.post(f"{API}/auth/login", json={"email": "not-an-email", "password": "abcdef"})
        assert r.status_code == 422

    def test_brute_force_lockout_after_5_fails(self, api_client):
        email = f"TEST_lock_{uuid.uuid4().hex[:8]}@example.com"
        statuses = []
        for _ in range(6):
            r = api_client.post(f"{API}/auth/login", json={"email": email, "password": "bad"})
            statuses.append(r.status_code)
        assert statuses[:5] == [401] * 5, statuses
        assert statuses[5] == 429, f"expected lockout on 6th attempt, got {statuses}"

    def test_me_requires_token(self, api_client):
        r = api_client.get(f"{API}/auth/me")
        assert r.status_code == 401

    def test_me_rejects_bad_token(self, api_client):
        r = requests.get(f"{API}/auth/me", headers={"Authorization": "Bearer abc.def.ghi"})
        assert r.status_code == 401

    def test_me_with_valid_token(self, authed, test_credentials):
        r = authed.get(f"{API}/auth/me")
        assert r.status_code == 200
        assert r.json()["email"] == test_credentials["email"].lower()


# ---------- Registration + multi-tenancy ----------
@pytest.fixture(scope="class")
def new_company():
    email = f"TEST_co_{uuid.uuid4().hex[:8]}@example.com"
    r = requests.post(f"{API}/auth/register",
                      json={"company_name": "TEST_Nova Empresa Lda", "email": email, "password": "Teste12345!"})
    assert r.status_code == 200, r.text
    data = r.json()
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", "Authorization": f"Bearer {data['token']}"})
    return {"email": email, "company": data["company"], "session": s}


class TestRegistrationAndTenancy:
    def test_register_creates_company_with_defaults(self, new_company):
        c = new_company["company"]
        assert c["company_name"] == "TEST_Nova Empresa Lda"
        assert c["primary_color"] == "#2563EB"
        assert c["logo_base64"] == ""
        assert "_id" not in c

    def test_register_seeds_six_sample_charges(self, new_company):
        r = new_company["session"].get(f"{API}/charges")
        assert r.status_code == 200
        assert len(r.json()) == 6

    def test_duplicate_email_rejected(self, new_company):
        r = requests.post(f"{API}/auth/register", json={
            "company_name": "Outra", "email": new_company["email"], "password": "Teste12345!"})
        assert r.status_code == 400
        assert "já está registado" in r.json()["detail"]

    def test_short_password_rejected(self):
        r = requests.post(f"{API}/auth/register", json={
            "company_name": "TEST_x", "email": f"TEST_{uuid.uuid4().hex[:6]}@example.com", "password": "123"})
        assert r.status_code == 422

    def test_tenant_isolation_charges(self, new_company, authed):
        admin_ids = {c["id"] for c in authed.get(f"{API}/charges").json()}
        new_ids = {c["id"] for c in new_company["session"].get(f"{API}/charges").json()}
        assert admin_ids and new_ids
        assert admin_ids.isdisjoint(new_ids)

    def test_tenant_cannot_read_other_charge(self, new_company, authed):
        other_id = authed.get(f"{API}/charges").json()[0]["id"]
        r = new_company["session"].get(f"{API}/charges/{other_id}")
        assert r.status_code == 404

    def test_tenant_cannot_delete_other_charge(self, new_company, authed):
        other_id = authed.get(f"{API}/charges").json()[0]["id"]
        r = new_company["session"].delete(f"{API}/charges/{other_id}")
        assert r.status_code == 404


# ---------- Dashboard / aging buckets ----------
class TestDashboard:
    def test_dashboard_requires_auth(self, api_client):
        assert api_client.get(f"{API}/dashboard").status_code == 401

    def test_seeded_kpis(self, authed):
        r = authed.get(f"{API}/dashboard")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["total_debt"] == 15341.25, d
        assert d["recovered"] == 640.0, d
        assert d["critical_debt"] == 8510.75, d
        assert d["success_rate"] == 17, d
        assert d["pending_count"] == 5 and d["paid_count"] == 1
        assert d["buckets"] == {"por_vencer": 1, "verde": 1, "amarelo": 1, "vermelho": 1, "roxo": 1}, d["buckets"]

    def test_bucket_assignment_on_charges(self, authed):
        charges = authed.get(f"{API}/charges").json()
        by_days = {c["debtor_name"]: (c["days_overdue"], c["bucket"], c["status"]) for c in charges}
        assert by_days["Marta Sousa"] == (5, "verde", "pendente")
        assert by_days["Padaria Central Lda"] == (20, "amarelo", "pendente")
        assert by_days["João Ribeiro"] == (45, "vermelho", "pendente")
        assert by_days["Auto Oficina São Pedro"] == (80, "roxo", "pendente")
        assert by_days["Clínica Vita"] == (0, "por_vencer", "pendente")
        assert by_days["Carla Mendes"][1:] == ("paga", "paga")


# ---------- Charges CRUD ----------
@pytest.fixture(scope="class")
def created_ids():
    return []


@pytest.fixture(scope="class", autouse=True)
def cleanup(authed, created_ids):
    yield
    for cid in created_ids:
        authed.delete(f"{API}/charges/{cid}")


class TestChargesCRUD:
    def _payload(self, **over):
        p = {
            "debtor_name": "TEST_Devedor QA",
            "debtor_email": "qa@example.test",
            "debtor_phone": "+351911111111",
            "debtor_nif": "500000001",
            "invoice_number": f"TEST-{uuid.uuid4().hex[:6]}",
            "amount": 123.45,
            "due_date": (date.today() - timedelta(days=40)).isoformat(),
            "status": "pendente",
            "notes": "TEST note",
        }
        p.update(over)
        return p

    def test_create_and_get_persistence(self, authed, created_ids):
        payload = self._payload()
        r = authed.post(f"{API}/charges", json=payload)
        assert r.status_code == 200, r.text
        c = r.json()
        assert "_id" not in c
        created_ids.append(c["id"])
        assert c["amount"] == 123.45
        assert c["bucket"] == "vermelho" and c["days_overdue"] == 40

        g = authed.get(f"{API}/charges/{c['id']}")
        assert g.status_code == 200
        got = g.json()
        assert got["debtor_name"] == payload["debtor_name"]
        assert got["invoice_number"] == payload["invoice_number"]
        assert got["notes"] == "TEST note"

    def test_update_status_paid_persists(self, authed, created_ids):
        payload = self._payload()
        c = authed.post(f"{API}/charges", json=payload).json()
        created_ids.append(c["id"])
        upd = {**payload, "status": "paga"}
        r = authed.put(f"{API}/charges/{c['id']}", json=upd)
        assert r.status_code == 200, r.text
        assert r.json()["bucket"] == "paga"
        g = authed.get(f"{API}/charges/{c['id']}").json()
        assert g["status"] == "paga" and g["bucket"] == "paga"

    def test_update_invalid_status(self, authed, created_ids):
        payload = self._payload()
        c = authed.post(f"{API}/charges", json=payload).json()
        created_ids.append(c["id"])
        r = authed.put(f"{API}/charges/{c['id']}", json={**payload, "status": "xpto"})
        assert r.status_code == 400, r.text

    def test_delete_then_404(self, authed):
        c = authed.post(f"{API}/charges", json=self._payload()).json()
        d = authed.delete(f"{API}/charges/{c['id']}")
        assert d.status_code == 200 and d.json() == {"ok": True}
        assert authed.get(f"{API}/charges/{c['id']}").status_code == 404

    def test_invalid_amount_rejected(self, authed):
        r = authed.post(f"{API}/charges", json=self._payload(amount=-5))
        assert r.status_code == 422

    def test_invalid_due_date_rejected(self, authed):
        r = authed.post(f"{API}/charges", json=self._payload(due_date="31-12-2026"))
        assert r.status_code == 400, r.text

    def test_missing_required_field(self, authed):
        p = self._payload()
        p.pop("debtor_name")
        assert authed.post(f"{API}/charges", json=p).status_code == 422

    def test_charges_require_auth(self, api_client):
        assert api_client.get(f"{API}/charges").status_code == 401

    def test_dashboard_reflects_new_charge(self, authed, created_ids):
        before = authed.get(f"{API}/dashboard").json()
        c = authed.post(f"{API}/charges", json=self._payload(amount=1000.0)).json()
        created_ids.append(c["id"])
        after = authed.get(f"{API}/dashboard").json()
        assert round(after["total_debt"] - before["total_debt"], 2) == 1000.0
        assert after["pending_count"] == before["pending_count"] + 1


# ---------- Branding ----------
class TestBranding:
    def test_requires_auth(self, api_client):
        assert api_client.put(f"{API}/branding", json={"primary_color": "#111111"}).status_code == 401

    def test_invalid_color_rejected(self, authed):
        r = authed.put(f"{API}/branding", json={"primary_color": "red"})
        assert r.status_code == 400
        assert "Cor inválida" in r.json()["detail"]

    def test_update_color_and_persist(self, authed):
        original = authed.get(f"{API}/auth/me").json()["primary_color"]
        try:
            r = authed.put(f"{API}/branding", json={"primary_color": "#D97706"})
            assert r.status_code == 200, r.text
            assert r.json()["primary_color"] == "#D97706"
            assert authed.get(f"{API}/auth/me").json()["primary_color"] == "#D97706"
        finally:
            authed.put(f"{API}/branding", json={"primary_color": original})
            assert authed.get(f"{API}/auth/me").json()["primary_color"] == original

    def test_update_logo_and_iban(self, authed):
        me = authed.get(f"{API}/auth/me").json()
        logo = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AAAwAB/AF/AAAAAElFTkSuQmCC"
        try:
            r = authed.put(f"{API}/branding", json={"logo_base64": logo, "iban": "PT50 0002 0123 1234 5678 9015 4"})
            assert r.status_code == 200, r.text
            assert r.json()["logo_base64"] == logo
            fetched = authed.get(f"{API}/auth/me").json()
            assert fetched["logo_base64"] == logo
            assert fetched["iban"] == "PT50 0002 0123 1234 5678 9015 4"
        finally:
            authed.put(f"{API}/branding", json={"logo_base64": me.get("logo_base64", ""), "iban": me["iban"]})

    def test_oversized_logo_rejected(self, authed):
        r = authed.put(f"{API}/branding", json={"logo_base64": "x" * 2_000_001})
        assert r.status_code == 400


# ---------- Security / bcrypt storage ----------
def test_password_hash_format_bcrypt():
    import asyncio
    import os
    from motor.motor_asyncio import AsyncIOMotorClient
    from dotenv import dotenv_values

    env = dotenv_values("/app/backend/.env")
    mongo_url = os.environ.get("MONGO_URL") or env.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME") or env.get("DB_NAME")
    admin_email = (env.get("ADMIN_EMAIL") or "").lower()
    if not admin_email:
        pytest.skip("ADMIN_EMAIL not set in backend/.env")

    async def run():
        cl = AsyncIOMotorClient(mongo_url)
        doc = await cl[db_name].companies.find_one({"email": admin_email})
        cl.close()
        return doc

    doc = asyncio.run(run())
    assert doc is not None, "admin company not seeded"
    assert doc["password_hash"].startswith("$2b$"), doc["password_hash"][:10]


def test_cors_allows_credentials_with_explicit_origin(api_client):
    origin = "https://invoice-hub-1224.preview.emergentagent.com"
    r = api_client.options(f"{API}/auth/login", headers={
        "Origin": origin,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
    })
    assert r.status_code in (200, 204), r.status_code
    allow_origin = r.headers.get("access-control-allow-origin")
    allow_creds = r.headers.get("access-control-allow-credentials")
    assert allow_origin is not None
    # Wildcard + credentials is an invalid combination for browsers
    assert not (allow_origin == "*" and allow_creds == "true"), \
        f"CORS misconfig: allow-origin={allow_origin}, allow-credentials={allow_creds}"


def test_response_time_dashboard(authed):
    t0 = time.time()
    r = authed.get(f"{API}/dashboard")
    assert r.status_code == 200
    assert time.time() - t0 < 5
