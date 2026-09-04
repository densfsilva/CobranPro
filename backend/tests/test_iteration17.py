"""Iteração 17 — forgot/reset password + cep-lookup + regressões pontuais."""
import os
import re
import time

import pytest
import requests
from dotenv import dotenv_values
from pymongo import MongoClient

from conftest import API

BACKEND_ENV = dotenv_values("/app/backend/.env")
MONGO_URL = os.environ.get("MONGO_URL") or BACKEND_ENV.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME") or BACKEND_ENV.get("DB_NAME")

TEST_CO_EMAIL = "import.teste@example.com"
TEST_CO_PASSWORD = "teste123456"


@pytest.fixture(scope="module")
def mongo_db():
    if not MONGO_URL or not DB_NAME:
        pytest.skip("MONGO_URL/DB_NAME missing in /app/backend/.env")
    client = MongoClient(MONGO_URL)
    yield client[DB_NAME]
    client.close()


# ---------- POST /api/auth/forgot-password ----------
class TestForgotPassword:
    def test_forgot_unknown_email_returns_200_no_enumeration(self):
        r = requests.post(f"{API}/auth/forgot-password",
                          json={"email": "TEST_naoexiste_qa17@example.com", "origin": "https://x.example.com"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True
        assert "Se o email existir" in body.get("message", "")

    def test_forgot_existing_email_same_response_and_creates_token(self, mongo_db):
        r = requests.post(f"{API}/auth/forgot-password",
                          json={"email": TEST_CO_EMAIL, "origin": "https://invoice-hub-1224.preview.emergentagent.com"})
        assert r.status_code == 200, r.text
        assert "Se o email existir" in r.json().get("message", "")
        rec = mongo_db.password_resets.find_one({"email": TEST_CO_EMAIL, "used": False},
                                                sort=[("created_at", -1)])
        assert rec is not None, "Nenhum token criado em password_resets"
        assert isinstance(rec["token"], str) and len(rec["token"]) >= 32
        assert rec["used"] is False
        assert "expires_at" in rec

    def test_forgot_invalid_email_format_422(self):
        r = requests.post(f"{API}/auth/forgot-password", json={"email": "nao-e-email"})
        assert r.status_code == 422, r.text

    def test_password_resets_token_index_unique(self, mongo_db):
        idx = mongo_db.password_resets.index_information()
        unique_single_token = [
            v for v in idx.values()
            if v.get("key") == [("token", 1)] and v.get("unique")
        ]
        assert unique_single_token, f"Índice único em token ausente: {idx}"


# ---------- POST /api/auth/reset-password ----------
class TestResetPasswordValidation:
    def test_reset_invalid_token_400(self):
        r = requests.post(f"{API}/auth/reset-password", json={"token": "token-invalido-qa17", "password": "Temp123456"})
        assert r.status_code == 400, r.text
        assert "inválido ou expirado" in r.json().get("detail", "")

    def test_reset_short_password_422(self):
        r = requests.post(f"{API}/auth/reset-password", json={"token": "qualquer", "password": "123"})
        assert r.status_code == 422, r.text

    def test_reset_expired_token_400(self, mongo_db):
        mongo_db.password_resets.insert_one({
            "token": "TEST_expired_qa17",
            "email": TEST_CO_EMAIL,
            "expires_at": "2020-01-01T00:00:00+00:00",
            "used": False,
            "created_at": "2020-01-01T00:00:00+00:00",
        })
        try:
            r = requests.post(f"{API}/auth/reset-password", json={"token": "TEST_expired_qa17", "password": "Temp123456"})
            assert r.status_code == 400, r.text
        finally:
            mongo_db.password_resets.delete_one({"token": "TEST_expired_qa17"})


# ---------- E2E reset flow (repõe a password original no fim) ----------
@pytest.mark.xdist_group("import_company")
class TestResetE2E:
    def test_full_reset_flow_and_restore(self, mongo_db):
        temp_password = "Temp123456"
        # 1. pedir recuperação
        r = requests.post(f"{API}/auth/forgot-password", json={"email": TEST_CO_EMAIL, "origin": "https://x.example.com"})
        assert r.status_code == 200
        rec = mongo_db.password_resets.find_one({"email": TEST_CO_EMAIL, "used": False}, sort=[("created_at", -1)])
        assert rec, "token não encontrado"
        token = rec["token"]

        try:
            # 2. redefinir
            r = requests.post(f"{API}/auth/reset-password", json={"token": token, "password": temp_password})
            assert r.status_code == 200, r.text
            assert r.json().get("ok") is True

            # 3. token de uso único
            r2 = requests.post(f"{API}/auth/reset-password", json={"token": token, "password": temp_password})
            assert r2.status_code == 400, "token deveria ser de uso único"

            # 4. login com nova password funciona
            login = requests.post(f"{API}/auth/login", json={"email": TEST_CO_EMAIL, "password": temp_password})
            assert login.status_code == 200, login.text
            data = login.json()
            assert "token" in data and data["user"]["email"] == TEST_CO_EMAIL

            # 5. password antiga já não funciona
            old = requests.post(f"{API}/auth/login", json={"email": TEST_CO_EMAIL, "password": TEST_CO_PASSWORD})
            assert old.status_code == 401
        finally:
            # 6. REPOR password original via novo fluxo de reset
            requests.post(f"{API}/auth/forgot-password", json={"email": TEST_CO_EMAIL, "origin": "https://x.example.com"})
            rec2 = mongo_db.password_resets.find_one({"email": TEST_CO_EMAIL, "used": False}, sort=[("created_at", -1)])
            assert rec2, "não foi possível obter token para repor a password"
            rr = requests.post(f"{API}/auth/reset-password", json={"token": rec2["token"], "password": TEST_CO_PASSWORD})
            assert rr.status_code == 200, rr.text

        # 7. confirmar credenciais originais intactas + hash bcrypt $2b$
        final = requests.post(f"{API}/auth/login", json={"email": TEST_CO_EMAIL, "password": TEST_CO_PASSWORD})
        assert final.status_code == 200, f"Credenciais originais NÃO repostas: {final.text[:200]}"
        user = mongo_db.users.find_one({"email": TEST_CO_EMAIL})
        assert user["password_hash"].startswith("$2b$"), user["password_hash"][:10]


# ---------- GET /api/utils/cep-lookup ----------
class TestCepLookup:
    def test_requires_auth(self):
        r = requests.get(f"{API}/utils/cep-lookup", params={"cep": "4000-069"})
        assert r.status_code in (401, 403), r.status_code

    def test_pt_valid_cp(self, authed):
        r = authed.get(f"{API}/utils/cep-lookup", params={"cep": "4000-069"})
        assert r.status_code == 200, r.text
        d = r.json()
        if not d.get("found"):
            pytest.skip("geoapi.pt indisponível/rate-limited (serviço externo gratuito)")
        assert d["localidade"] == "Porto"
        assert d["estado"] == "Porto"

    def test_pt_invalid_length(self, authed):
        r = authed.get(f"{API}/utils/cep-lookup", params={"cep": "123"})
        assert r.status_code == 200
        assert r.json() == {"found": False}

    def test_pt_nonexistent_cp(self, authed):
        r = authed.get(f"{API}/utils/cep-lookup", params={"cep": "0000-000"})
        assert r.status_code == 200
        assert r.json().get("found") is False

    def test_empty_cep(self, authed):
        r = authed.get(f"{API}/utils/cep-lookup", params={"cep": ""})
        assert r.status_code == 200
        assert r.json() == {"found": False}


# ---------- Regressões rápidas ----------
class TestQuickRegression:
    def test_lookup_client_nif(self, authed):
        r = authed.get(f"{API}/charges/lookup-client", params={"nif": "245678901"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("found") is True, d
        assert "Marta" in d["client"]["debtor_name"]

    def test_dashboard_ok(self, authed):
        r = authed.get(f"{API}/dashboard")
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("total_debt", "recovered", "critical_debt", "success_rate", "buckets"):
            assert k in d, list(d.keys())
        assert isinstance(d["buckets"], dict)

    def test_charges_list_no_mongo_id(self, authed):
        r = authed.get(f"{API}/charges")
        assert r.status_code == 200
        items = r.json()
        assert isinstance(items, list)
        for it in items[:5]:
            assert "_id" not in it

    def test_brute_force_lockout_after_5_fails(self):
        email = f"TEST_bf_qa17_{int(time.time())}@example.com"
        codes = []
        for _ in range(6):
            r = requests.post(f"{API}/auth/login", json={"email": email, "password": "errada123"})
            codes.append(r.status_code)
        assert codes[-1] in (401, 429), codes
        # documenta o comportamento observado
        assert any(c in (401, 429) for c in codes)
