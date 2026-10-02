"""Iteration 20 — Config Endereço/Bank_accounts + Clientes CRM + Super-Admin + paid_at.

Tests run against the public BASE_URL from /app/frontend/.env.
Pytest fixtures `authed`, `auth_token` come from conftest.py (admin login).

Credentials:
- Admin + Super Admin: denis.ferreira0909@gmail.com / Cobrancas2026! (TechFlow PT)
- Cobrador same company: cobrador@techflow.pt / Cobrador2026!
- Test company for subscription edits: import.teste@example.com / teste123456 (Import Teste Lda)
"""
import os
import re
import time
import pytest
import requests
from datetime import date, timedelta
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or frontend_env["REACT_APP_BACKEND_URL"]).rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"email": "denis.ferreira0909@gmail.com", "password": "Cobrancas2026!"}
COBRADOR = {"email": "cobrador@techflow.pt", "password": "Cobrador2026!"}
IMPORTE = {"email": "import.teste@example.com", "password": "teste123456"}


# ---------- helpers ----------

def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, f"login failed {r.status_code}: {r.text[:200]}"
    return r.json()["token"]


def _s(token):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", "Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="module")
def admin_sess():
    return _s(_login(ADMIN))


@pytest.fixture(scope="module")
def cobrador_sess():
    return _s(_login(COBRADOR))


@pytest.fixture(scope="module")
def imp_sess():
    return _s(_login(IMPORTE))


@pytest.fixture(scope="module")
def imp_company_id(admin_sess):
    """Find Import Teste Lda via super-admin so we can edit subscription."""
    r = admin_sess.get(f"{API}/superadmin/companies", timeout=15)
    assert r.status_code == 200, r.text[:200]
    row = next((c for c in r.json() if c["email"] == IMPORTE["email"]), None)
    assert row, "Import Teste Lda não encontrada"
    return row["id"]


# ============================================================
# BRANDING — endereço + contas bancárias
# ============================================================

class TestBrandingAddressBanks:
    """PUT /api/branding com addr_* e bank_accounts; GET /api/auth/me reflete."""

    def _snapshot(self, sess):
        r = sess.get(f"{API}/auth/me", timeout=10)
        assert r.status_code == 200
        return r.json()

    def test_update_addr_and_bank_accounts(self, admin_sess):
        original = self._snapshot(admin_sess)
        payload = {
            "addr_rua": "Rua Teste QA20",
            "addr_numero": "42",
            "addr_bairro": "Centro",
            "addr_cidade": "Porto",
            "addr_cp": "4000-069",
            "addr_estado": "Porto",
            "bank_accounts": [
                {"banco": "Millennium", "agencia": "0001", "conta": "12345678", "iban_pix": "PT50000212345678900"},
                {"banco": "", "agencia": "", "conta": "", "iban_pix": ""},  # empty should be discarded
                {"banco": "CGD", "agencia": "0002", "conta": "99887766", "iban_pix": ""},
            ],
        }
        r = admin_sess.put(f"{API}/branding", json=payload, timeout=10)
        assert r.status_code == 200, r.text[:300]
        body = r.json()
        # Empty bank account removed
        assert len(body["bank_accounts"]) == 2
        assert body["bank_accounts"][0]["iban_pix"] == "PT50000212345678900"
        # address composto refletido
        assert body["addr_rua"] == "Rua Teste QA20"
        assert body["addr_cp"] == "4000-069"
        assert "Porto" in body["address"]
        # iban = iban_pix da 1ª
        assert body["iban"] == "PT50000212345678900"

        # /auth/me devolve mesmo payload
        me = self._snapshot(admin_sess)
        assert me["addr_rua"] == "Rua Teste QA20"
        assert me["addr_numero"] == "42"
        assert me["addr_bairro"] == "Centro"
        assert me["addr_cidade"] == "Porto"
        assert me["addr_cp"] == "4000-069"
        assert me["addr_estado"] == "Porto"
        assert len(me["bank_accounts"]) == 2
        assert me["iban"] == "PT50000212345678900"
        # subscription fields
        for k in ("plan", "plan_price", "license_id", "license_valid_until", "license_status"):
            assert k in me, f"missing {k} in /auth/me"

        # Restaurar valores originais
        restore = {
            "addr_rua": original.get("addr_rua", ""),
            "addr_numero": original.get("addr_numero", ""),
            "addr_bairro": original.get("addr_bairro", ""),
            "addr_cidade": original.get("addr_cidade", ""),
            "addr_cp": original.get("addr_cp", ""),
            "addr_estado": original.get("addr_estado", ""),
            "bank_accounts": original.get("bank_accounts", []),
        }
        r2 = admin_sess.put(f"{API}/branding", json=restore, timeout=10)
        assert r2.status_code == 200

    def test_bank_account_fallback_display(self, admin_sess):
        """1ª conta sem iban_pix → display 'Banco · Ag. X · Conta Y'."""
        original = self._snapshot(admin_sess)
        r = admin_sess.put(f"{API}/branding", json={"bank_accounts": [
            {"banco": "BPI", "agencia": "0033", "conta": "4567890", "iban_pix": ""}
        ]}, timeout=10)
        assert r.status_code == 200
        body = r.json()
        assert body["iban"] == "BPI · Ag. 0033 · Conta 4567890"
        # restore
        admin_sess.put(f"{API}/branding", json={"bank_accounts": original.get("bank_accounts", [])}, timeout=10)

    def test_too_many_bank_accounts_returns_400(self, admin_sess):
        many = [{"banco": f"B{i}", "agencia": "0", "conta": str(i), "iban_pix": ""} for i in range(11)]
        r = admin_sess.put(f"{API}/branding", json={"bank_accounts": many}, timeout=10)
        assert r.status_code == 400
        assert "10" in r.json().get("detail", "")


# ============================================================
# CLIENTES (CRM) — lista, detalhe, interações, update
# ============================================================

class TestClientsCRM:

    def test_list_clients_admin(self, admin_sess):
        r = admin_sess.get(f"{API}/clients", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list) and len(data) > 0
        row = data[0]
        for k in ("key", "debtor_name", "debtor_nif", "invoice_count", "pending_count",
                  "pending_total", "paid_total", "max_days_overdue", "last_activity_at", "observacoes"):
            assert k in row, f"missing {k}"
        # Keys começam por nif: ou nome:
        assert all(c["key"].startswith(("nif:", "nome:")) for c in data)
        # NIF 505678234 presente
        assert any(c["key"] == "nif:505678234" for c in data), "NIF 505678234 ausente"

    def test_list_clients_cobrador_can_view(self, cobrador_sess):
        r = cobrador_sess.get(f"{API}/clients", timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_get_client_detail(self, admin_sess):
        key = "nif:507654321"
        r = admin_sess.get(f"{API}/clients/{key}", timeout=15)
        assert r.status_code == 200, r.text[:200]
        data = r.json()
        assert data["key"] == key
        assert "profile" in data and "stats" in data and "charges" in data and "interactions" in data
        assert "observacoes" in data
        # cada charge tem days_overdue/bucket/paid_days_late
        for ch in data["charges"]:
            assert "days_overdue" in ch
            assert "bucket" in ch
            assert "paid_days_late" in ch
        # interactions have invoice_number
        for it in data["interactions"]:
            assert "invoice_number" in it

    def test_get_client_404(self, admin_sess):
        r = admin_sess.get(f"{API}/clients/nif:00000000000", timeout=10)
        assert r.status_code == 404

    def test_list_client_interactions_includes_all_charges(self, admin_sess):
        key = "nif:507654321"
        r = admin_sess.get(f"{API}/clients/{key}/interactions", timeout=15)
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        # all have invoice_number key (may be empty for 'Geral')
        for it in items:
            assert "invoice_number" in it

    def test_add_general_note_to_client(self, admin_sess):
        key = "nif:505678234"
        payload = {"type": "nota", "note": f"TEST_QA20_geral_{int(time.time())}"}
        r = admin_sess.post(f"{API}/clients/{key}/interactions", json=payload, timeout=10)
        assert r.status_code == 200, r.text[:200]
        doc = r.json()
        assert doc["charge_id"] is None
        assert doc.get("client_key") == key
        # Confirm in GET
        g = admin_sess.get(f"{API}/clients/{key}/interactions", timeout=10)
        assert any(x["id"] == doc["id"] and x.get("charge_id") in (None, "") for x in g.json())
        # cleanup
        admin_sess.delete(f"{API}/interactions/{doc['id']}", timeout=10)

    def test_add_charge_note_crosses_client_rejected(self, admin_sess):
        """charge_id de outro cliente → 400."""
        # Pick a charge from NIF 505678234
        r = admin_sess.get(f"{API}/clients/nif:505678234", timeout=10)
        assert r.status_code == 200
        other_charge_id = r.json()["charges"][0]["id"]
        # Try to attach it to NIF 507654321
        payload = {"type": "nota", "note": "TEST_QA20_cross", "charge_id": other_charge_id}
        r2 = admin_sess.post(f"{API}/clients/nif:507654321/interactions", json=payload, timeout=10)
        assert r2.status_code == 400
        assert "não pertence" in r2.json().get("detail", "").lower() or "não pertence" in r2.text.lower()

    def test_add_charge_note_valid(self, admin_sess):
        r = admin_sess.get(f"{API}/clients/nif:505678234", timeout=10)
        charge_id = r.json()["charges"][0]["id"]
        payload = {"type": "nota", "note": f"TEST_QA20_fat_{int(time.time())}", "charge_id": charge_id}
        r2 = admin_sess.post(f"{API}/clients/nif:505678234/interactions", json=payload, timeout=10)
        assert r2.status_code == 200
        doc = r2.json()
        assert doc["charge_id"] == charge_id
        # cleanup
        admin_sess.delete(f"{API}/interactions/{doc['id']}", timeout=10)

    def test_update_client_admin_updates_all_charges(self, admin_sess):
        """PUT /api/clients/{key} atualiza TODAS as faturas."""
        key = "nif:507654321"
        r = admin_sess.get(f"{API}/clients/{key}", timeout=10)
        before = r.json()
        original_email = before["profile"]["debtor_email"]
        new_email = f"qa20_{int(time.time())}@test.local"
        r2 = admin_sess.put(f"{API}/clients/{key}", json={"debtor_email": new_email}, timeout=10)
        assert r2.status_code == 200, r2.text[:200]
        after = r2.json()
        assert after["profile"]["debtor_email"] == new_email
        # all charges now have new email
        for ch in after["charges"]:
            assert ch["debtor_email"] == new_email
        # restore
        admin_sess.put(f"{API}/clients/{key}", json={"debtor_email": original_email or ""}, timeout=10)

    def test_update_client_observacoes_only_doesnt_touch_charges(self, admin_sess):
        key = "nif:507654321"
        r = admin_sess.get(f"{API}/clients/{key}", timeout=10)
        before_charges = r.json()["charges"]
        original_obs = r.json().get("observacoes", "")
        note = f"TEST_QA20_obs_{int(time.time())}"
        r2 = admin_sess.put(f"{API}/clients/{key}", json={"observacoes": note}, timeout=10)
        assert r2.status_code == 200
        after = r2.json()
        assert after["observacoes"] == note
        # debtor_* não mudou nas faturas
        for b, a in zip(sorted(before_charges, key=lambda x: x["id"]),
                        sorted(after["charges"], key=lambda x: x["id"])):
            assert b["debtor_name"] == a["debtor_name"]
            assert b["debtor_email"] == a["debtor_email"]
        # restore
        admin_sess.put(f"{API}/clients/{key}", json={"observacoes": original_obs}, timeout=10)

    def test_update_client_cobrador_forbidden(self, cobrador_sess):
        r = cobrador_sess.put(f"{API}/clients/nif:507654321",
                              json={"debtor_email": "x@x.pt"}, timeout=10)
        assert r.status_code == 403


# ============================================================
# CHARGES — paid_at + paid_days_late + lookup-client sem bank1/bank2
# ============================================================

class TestChargePaidAt:

    def _find_charge(self, sess, status="pendente"):
        r = sess.get(f"{API}/charges", timeout=10)
        assert r.status_code == 200
        for c in r.json():
            if c["status"] == status:
                return c
        pytest.skip(f"no charge with status={status}")

    def test_paid_at_ymd_persists_and_days_late(self, admin_sess):
        ch = self._find_charge(admin_sess, "pendente")
        due = date.fromisoformat(ch["due_date"])
        paid_day = (due + timedelta(days=7)).isoformat()
        payload = {k: ch.get(k) for k in (
            "debtor_name", "debtor_email", "debtor_phone", "debtor_nif",
            "debtor_email2", "whatsapp", "addr_rua", "addr_localidade",
            "addr_cp", "addr_estado", "invoice_number", "amount",
            "due_date", "notes", "next_contact_date", "promise_date", "agreed_amount",
        ) if ch.get(k) is not None}
        payload.update({"status": "paga", "paid_at": paid_day})
        r = admin_sess.put(f"{API}/charges/{ch['id']}", json=payload, timeout=10)
        assert r.status_code == 200, r.text[:200]
        body = r.json()
        assert body["paid_at"].startswith(paid_day)
        assert "T12:00:00" in body["paid_at"]
        # GET devolve paid_days_late = 7
        g = admin_sess.get(f"{API}/charges/{ch['id']}", timeout=10)
        assert g.json()["paid_days_late"] == 7

        # Agora REVERTER para pendente → paid_at None
        payload2 = {**payload, "status": "pendente"}
        payload2.pop("paid_at", None)
        r2 = admin_sess.put(f"{API}/charges/{ch['id']}", json=payload2, timeout=10)
        assert r2.status_code == 200
        assert r2.json()["paid_at"] is None
        assert r2.json()["paid_days_late"] is None

    def test_paid_at_invalid_date_400(self, admin_sess):
        ch = self._find_charge(admin_sess, "pendente")
        payload = {k: ch.get(k) for k in (
            "debtor_name", "invoice_number", "amount", "due_date") if ch.get(k) is not None}
        payload.update({"status": "paga", "paid_at": "not-a-date"})
        r = admin_sess.put(f"{API}/charges/{ch['id']}", json=payload, timeout=10)
        assert r.status_code == 400

    def test_lookup_client_no_bank_fields(self, admin_sess):
        r = admin_sess.get(f"{API}/charges/lookup-client", params={"nif": "505678234"}, timeout=10)
        assert r.status_code == 200
        d = r.json()
        if d.get("found"):
            client = d["client"]
            # bank1/bank2 NÃO devem estar presentes
            assert "bank1" not in client
            assert "bank2" not in client


# ============================================================
# SUPER ADMIN
# ============================================================

class TestSuperAdmin:

    def test_overview_super_admin(self, admin_sess):
        r = admin_sess.get(f"{API}/superadmin/overview", timeout=15)
        assert r.status_code == 200, r.text[:200]
        d = r.json()
        for k in ("companies_total", "companies_active", "companies_blocked",
                  "companies_expired", "users_total", "charges_total", "volume_total",
                  "mrr", "arr", "series", "plans"):
            assert k in d
        assert len(d["series"]) == 6
        for p in d["series"]:
            for k in ("month", "mrr", "companies", "new_companies"):
                assert k in p

    def test_overview_forbidden_for_cobrador(self, cobrador_sess):
        r = cobrador_sess.get(f"{API}/superadmin/overview", timeout=10)
        assert r.status_code == 403

    def test_overview_forbidden_for_other_admin(self, imp_sess):
        r = imp_sess.get(f"{API}/superadmin/overview", timeout=10)
        assert r.status_code == 403

    def test_companies_list_has_subscription_fields(self, admin_sess):
        r = admin_sess.get(f"{API}/superadmin/companies", timeout=15)
        assert r.status_code == 200
        rows = r.json()
        assert len(rows) > 0
        for row in rows:
            for k in ("plan", "plan_price", "license_id", "license_valid_until", "license_status", "volume"):
                assert k in row, f"missing {k}"

    def test_update_subscription_and_regenerate(self, admin_sess, imp_company_id):
        # snapshot
        r0 = admin_sess.get(f"{API}/superadmin/companies", timeout=10)
        before = next(c for c in r0.json() if c["id"] == imp_company_id)

        future = (date.today() + timedelta(days=90)).isoformat()
        payload = {"plan": "Profissional", "plan_price": 79.0,
                   "license_valid_until": future, "regenerate_license": True}
        r = admin_sess.put(f"{API}/superadmin/companies/{imp_company_id}/subscription",
                            json=payload, timeout=10)
        assert r.status_code == 200, r.text[:200]
        body = r.json()
        assert body["plan"] == "Profissional"
        assert body["plan_price"] == 79.0
        assert body["license_valid_until"] == future
        assert body["license_id"] != before["license_id"]
        assert re.match(r"^CBP-[A-F0-9]{4}-[A-F0-9]{4}$", body["license_id"]), body["license_id"]
        assert body["license_status"] == "ativa"

        # Vitalícia: license_valid_until ''
        r2 = admin_sess.put(f"{API}/superadmin/companies/{imp_company_id}/subscription",
                             json={"license_valid_until": ""}, timeout=10)
        assert r2.status_code == 200
        assert r2.json()["license_valid_until"] is None

        # Data inválida → 400
        r3 = admin_sess.put(f"{API}/superadmin/companies/{imp_company_id}/subscription",
                             json={"license_valid_until": "not-a-date"}, timeout=10)
        assert r3.status_code == 400

        # 404 para empresa inexistente
        r4 = admin_sess.put(f"{API}/superadmin/companies/does-not-exist/subscription",
                             json={"plan": "X"}, timeout=10)
        assert r4.status_code == 404

        # Restore original (plan/price/validity)
        admin_sess.put(f"{API}/superadmin/companies/{imp_company_id}/subscription",
                       json={"plan": before["plan"], "plan_price": before["plan_price"],
                             "license_valid_until": before["license_valid_until"] or ""},
                       timeout=10)

    def test_subscription_past_date_shows_expired(self, admin_sess, imp_company_id):
        r0 = admin_sess.get(f"{API}/superadmin/companies", timeout=10)
        before = next(c for c in r0.json() if c["id"] == imp_company_id)
        past = (date.today() - timedelta(days=5)).isoformat()
        admin_sess.put(f"{API}/superadmin/companies/{imp_company_id}/subscription",
                        json={"license_valid_until": past}, timeout=10)
        r1 = admin_sess.get(f"{API}/superadmin/companies", timeout=10)
        row = next(c for c in r1.json() if c["id"] == imp_company_id)
        assert row["license_status"] == "expirada"
        # repor
        admin_sess.put(f"{API}/superadmin/companies/{imp_company_id}/subscription",
                        json={"license_valid_until": before["license_valid_until"] or ""},
                        timeout=10)
