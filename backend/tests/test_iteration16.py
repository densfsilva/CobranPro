"""Iteration 16 backend tests: client lookup by NIF, Super Admin tenants, blocked-company enforcement, paid_at."""
import requests
import pytest

from conftest import API

SUPER_EMAIL = "denis.ferreira0909@gmail.com"
SUPER_PASS = "Cobrancas2026!"
COBRADOR = {"email": "cobrador@techflow.pt", "password": "Cobrador2026!"}
IMPORT_CO = {"email": "import.teste@example.com", "password": "teste123456"}
BLOCKED_MESSAGE = "A sua conta está suspensa. Atualize o seu plano para continuar a utilizar o Cobranpro."


def login(creds):
    return requests.post(f"{API}/auth/login", json=creds, timeout=30)


def client_for(creds):
    r = login(creds)
    assert r.status_code == 200, f"login failed for {creds['email']}: {r.status_code} {r.text[:200]}"
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {r.json()['token']}", "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def super_client():
    return client_for({"email": SUPER_EMAIL, "password": SUPER_PASS})


@pytest.fixture(scope="module")
def cobrador_client():
    return client_for(COBRADOR)


# ---------- serialize_user is_super_admin ----------
class TestSuperAdminFlag:
    def test_login_returns_is_super_admin_true(self):
        r = login({"email": SUPER_EMAIL, "password": SUPER_PASS})
        assert r.status_code == 200
        assert r.json()["user"]["is_super_admin"] is True

    def test_cobrador_is_not_super_admin(self):
        r = login(COBRADOR)
        assert r.status_code == 200
        assert r.json()["user"]["is_super_admin"] is False

    def test_me_returns_flag(self, super_client):
        r = super_client.get(f"{API}/auth/me")
        assert r.status_code == 200
        assert r.json()["user"]["is_super_admin"] is True


# ---------- GET /api/charges/lookup-client ----------
class TestLookupClient:
    def test_lookup_existing_nif(self, super_client):
        r = super_client.get(f"{API}/charges/lookup-client", params={"nif": "245678901"})
        assert r.status_code == 200
        data = r.json()
        assert data["found"] is True
        c = data["client"]
        assert c["debtor_name"] == "Marta Sousa"
        assert c["debtor_nif"].replace(" ", "") == "245678901"
        for k in ("debtor_email", "debtor_phone", "whatsapp", "addr_rua", "addr_localidade", "addr_cp", "addr_estado", "bank1", "bank2", "debtor_email2"):
            assert k in c

    def test_lookup_ignores_non_digits(self, super_client):
        r = super_client.get(f"{API}/charges/lookup-client", params={"nif": "245.678.901"})
        assert r.status_code == 200
        assert r.json()["found"] is True

    def test_lookup_unknown_nif(self, super_client):
        r = super_client.get(f"{API}/charges/lookup-client", params={"nif": "999999999"})
        assert r.status_code == 200
        assert r.json() == {"found": False}

    def test_lookup_short_nif_not_found(self, super_client):
        r = super_client.get(f"{API}/charges/lookup-client", params={"nif": "24"})
        assert r.status_code == 200
        assert r.json()["found"] is False

    def test_lookup_requires_admin(self, cobrador_client):
        r = cobrador_client.get(f"{API}/charges/lookup-client", params={"nif": "245678901"})
        assert r.status_code == 403

    def test_lookup_requires_auth(self):
        r = requests.get(f"{API}/charges/lookup-client", params={"nif": "245678901"}, timeout=30)
        assert r.status_code in (401, 403)


# ---------- Super Admin tenants ----------
class TestSuperAdminCompanies:
    def test_list_companies_shape(self, super_client):
        r = super_client.get(f"{API}/superadmin/companies")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list) and len(data) > 0
        c = data[0]
        for k in ("id", "company_name", "email", "country", "created_at", "blocked", "user_count", "charge_count"):
            assert k in c, f"missing {k}"
        assert "_id" not in c
        assert "logo_base64" not in c
        assert isinstance(c["user_count"], int)
        assert isinstance(c["charge_count"], int)

    def test_forbidden_for_cobrador(self, cobrador_client):
        r = cobrador_client.get(f"{API}/superadmin/companies")
        assert r.status_code == 403

    def test_forbidden_for_other_admin(self):
        s = client_for(IMPORT_CO)
        r = s.get(f"{API}/superadmin/companies")
        assert r.status_code == 403

    def test_requires_auth(self):
        r = requests.get(f"{API}/superadmin/companies", timeout=30)
        assert r.status_code in (401, 403)

    def test_cannot_block_own_company(self, super_client):
        companies = super_client.get(f"{API}/superadmin/companies").json()
        own = next(c for c in companies if c["email"].lower() == SUPER_EMAIL)
        r = super_client.put(f"{API}/superadmin/companies/{own['id']}/status", json={"blocked": True})
        assert r.status_code == 400
        # verify still active
        companies = super_client.get(f"{API}/superadmin/companies").json()
        own = next(c for c in companies if c["email"].lower() == SUPER_EMAIL)
        assert own["blocked"] is False

    def test_unknown_company_404(self, super_client):
        r = super_client.put(f"{API}/superadmin/companies/does-not-exist/status", json={"blocked": True})
        assert r.status_code == 404

    def test_invalid_payload_422(self, super_client):
        companies = super_client.get(f"{API}/superadmin/companies").json()
        r = super_client.put(f"{API}/superadmin/companies/{companies[0]['id']}/status", json={})
        assert r.status_code == 422


# ---------- Block / unblock E2E ----------
@pytest.mark.xdist_group("import_company")
class TestBlockEnforcement:
    @pytest.fixture(scope="class", autouse=True)
    def ensure_unblocked(self, super_client):
        yield
        companies = super_client.get(f"{API}/superadmin/companies").json()
        target = next((c for c in companies if c["email"] == IMPORT_CO["email"]), None)
        if target and target["blocked"]:
            super_client.put(f"{API}/superadmin/companies/{target['id']}/status", json={"blocked": False})

    def test_block_then_login_and_api_denied_then_restore(self, super_client):
        # pre: token from target company while active
        target_session = client_for(IMPORT_CO)
        companies = super_client.get(f"{API}/superadmin/companies").json()
        target = next(c for c in companies if c["email"] == IMPORT_CO["email"])
        assert target["blocked"] is False

        # BLOCK
        r = super_client.put(f"{API}/superadmin/companies/{target['id']}/status", json={"blocked": True})
        assert r.status_code == 200
        assert r.json()["blocked"] is True

        # persisted
        after = next(c for c in super_client.get(f"{API}/superadmin/companies").json() if c["id"] == target["id"])
        assert after["blocked"] is True

        # login blocked with plan message
        lr = login(IMPORT_CO)
        assert lr.status_code == 403
        assert lr.json()["detail"] == BLOCKED_MESSAGE

        # existing token also blocked on authenticated calls
        ar = target_session.get(f"{API}/charges")
        assert ar.status_code == 403
        assert ar.json()["detail"] == BLOCKED_MESSAGE

        # UNBLOCK / restore
        r = super_client.put(f"{API}/superadmin/companies/{target['id']}/status", json={"blocked": False})
        assert r.status_code == 200
        assert r.json()["blocked"] is False

        lr = login(IMPORT_CO)
        assert lr.status_code == 200
        assert lr.json()["company"]["company_name"] == "Import Teste Lda"

        ar = target_session.get(f"{API}/charges")
        assert ar.status_code == 200


# ---------- paid_at exposure for Recebidos column ----------
class TestPaidAt:
    def test_paid_charges_expose_paid_at(self, super_client):
        r = super_client.get(f"{API}/charges")
        assert r.status_code == 200
        charges = r.json()
        paid = [c for c in charges if c["status"] == "paga"]
        assert len(paid) > 0, "no paid charges in demo data"
        for c in paid:
            assert "paid_at" in c, f"paid charge {c['invoice_number']} missing paid_at"
            assert c["paid_at"], f"paid charge {c['invoice_number']} has empty paid_at"
