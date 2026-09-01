import os
import re
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL is missing")
BASE_URL = base_url.rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="session")
def test_credentials():
    credentials_path = Path("/app/memory/test_credentials.md")
    if not credentials_path.exists():
        pytest.skip("Missing /app/memory/test_credentials.md")
    content = credentials_path.read_text(encoding="utf-8")
    email_match = re.search(r'(?im)^\s*(?:[-*]\s*)?(?:\*\*)?email(?:\*\*)?\s*:\s*`?([^`\s]+)', content)
    password_match = re.search(r'(?im)^\s*(?:[-*]\s*)?(?:\*\*)?password(?:\*\*)?\s*:\s*`?([^`\s]+)', content)
    if not email_match or not password_match:
        pytest.skip("No email/password found in test_credentials.md")
    return {"email": email_match.group(1), "password": password_match.group(1)}


@pytest.fixture(scope="session")
def api_client():
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="session")
def auth_token(api_client, test_credentials):
    r = api_client.post(f"{API}/auth/login", json=test_credentials)
    if r.status_code != 200:
        pytest.fail(f"Admin login failed {r.status_code}: {r.text[:300]}")
    token = r.json().get("token")
    if not token:
        pytest.fail("No token in login response")
    return token


@pytest.fixture(scope="session")
def authed(auth_token):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", "Authorization": f"Bearer {auth_token}"})
    return s
