from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import re
import uuid
import logging
from datetime import datetime, timezone, timedelta, date
from typing import Optional, List

import io
import ipaddress
from html import escape
from html.parser import HTMLParser
from urllib.parse import quote, urlparse

import bcrypt
import httpx
import jwt
import pdfplumber
from fastapi import FastAPI, APIRouter, HTTPException, Request, Depends, UploadFile, File
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGORITHM = "HS256"

app = FastAPI()
api_router = APIRouter(prefix="/api")
security = HTTPBearer(auto_error=False)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


# ---------- Helpers ----------

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def create_token(user_id: str, email: str, company_id: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "cid": company_id,
        "type": "access",
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def serialize_user(doc: dict) -> dict:
    return {
        "id": doc["id"],
        "email": doc["email"],
        "role": doc.get("role", "cobrador"),
        "full_name": doc.get("full_name", ""),
        "cargo": doc.get("cargo", ""),
        "departamento": doc.get("departamento", ""),
        "photo_base64": doc.get("photo_base64", ""),
        "created_at": doc.get("created_at"),
    }


def serialize_company(doc: dict) -> dict:
    return {
        "id": doc["id"],
        "email": doc["email"],
        "company_name": doc["company_name"],
        "nif": doc.get("nif", ""),
        "iban": doc.get("iban", ""),
        "country": doc.get("country", "PT"),
        "address": doc.get("address", ""),
        "google_client_id": doc.get("google_client_id", ""),
        "primary_color": doc.get("primary_color", "#2563EB"),
        "logo_base64": doc.get("logo_base64", ""),
        "created_at": doc.get("created_at"),
    }


def compute_aging(charge: dict) -> dict:
    today = date.today()
    due = date.fromisoformat(charge["due_date"])
    days = (today - due).days
    if charge.get("status") == "paga":
        bucket = "paga"
        days = max(days, 0)
    elif charge.get("status") == "negociacao":
        bucket = "negociacao"
        days = max(days, 0)
    elif days <= 0:
        bucket = "por_vencer"
        days = 0
    elif days <= 15:
        bucket = "verde"
    elif days <= 30:
        bucket = "amarelo"
    elif days <= 60:
        bucket = "vermelho"
    else:
        bucket = "roxo"
    charge["days_overdue"] = days
    charge["bucket"] = bucket
    return charge


async def get_current_context(creds: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    if not creds:
        raise HTTPException(status_code=401, detail="Não autenticado")
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
        if not user:
            raise HTTPException(status_code=401, detail="Utilizador não encontrado")
        company = await db.companies.find_one({"id": user["company_id"]}, {"_id": 0})
        if not company:
            raise HTTPException(status_code=401, detail="Empresa não encontrada")
        return {"user": user, "company": company}
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Sessão expirada")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token inválido")


async def get_current_company(ctx: dict = Depends(get_current_context)) -> dict:
    return ctx["company"]


async def get_current_user(ctx: dict = Depends(get_current_context)) -> dict:
    return ctx["user"]


async def require_admin(ctx: dict = Depends(get_current_context)) -> dict:
    if ctx["user"].get("role") != "admin":
        raise HTTPException(status_code=403, detail="Apenas administradores podem realizar esta ação")
    return ctx


# ---------- Schemas ----------

class RegisterInput(BaseModel):
    company_name: str = Field(min_length=2, max_length=120)
    full_name: Optional[str] = None
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)


class LoginInput(BaseModel):
    email: EmailStr
    password: str


class BrandingInput(BaseModel):
    company_name: Optional[str] = None
    nif: Optional[str] = None
    iban: Optional[str] = None
    country: Optional[str] = None
    address: Optional[str] = None
    google_client_id: Optional[str] = None
    primary_color: Optional[str] = None
    logo_base64: Optional[str] = None


class ChargeInput(BaseModel):
    debtor_name: str = Field(min_length=1, max_length=200)
    debtor_email: Optional[str] = ""
    debtor_phone: Optional[str] = ""
    debtor_nif: Optional[str] = ""
    invoice_number: str = Field(min_length=1, max_length=60)
    amount: float = Field(gt=0)
    due_date: str
    status: str = "pendente"
    next_contact_date: Optional[str] = None
    promise_date: Optional[str] = None
    agreed_amount: Optional[float] = None
    notes: Optional[str] = ""


# ---------- Auth ----------

@api_router.post("/auth/register")
async def register(data: RegisterInput):
    email = data.email.lower().strip()
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="Este email já está registado")
    company = {
        "id": str(uuid.uuid4()),
        "email": email,
        "company_name": data.company_name.strip(),
        "nif": "",
        "iban": "",
        "country": "PT",
        "google_client_id": "",
        "primary_color": "#2563EB",
        "logo_base64": "",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.companies.insert_one(company)
    user = {
        "id": str(uuid.uuid4()),
        "company_id": company["id"],
        "email": email,
        "password_hash": hash_password(data.password),
        "role": "admin",
        "full_name": (data.full_name or data.company_name).strip(),
        "cargo": "Administrador",
        "departamento": "",
        "photo_base64": "",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(user)
    await seed_sample_charges(company["id"])
    return {"token": create_token(user["id"], email, company["id"], "admin"), "company": serialize_company(company), "user": serialize_user(user)}


@api_router.post("/auth/login")
async def login(data: LoginInput, request: Request):
    email = data.email.lower().strip()
    identifier = email

    attempts = await db.login_attempts.find_one({"identifier": identifier})
    if attempts and attempts.get("count", 0) >= 5 and attempts.get("locked_at"):
        locked_at = datetime.fromisoformat(attempts["locked_at"])
        if datetime.now(timezone.utc) - locked_at < timedelta(minutes=15):
            raise HTTPException(status_code=429, detail="Conta temporariamente bloqueada. Tente novamente em 15 minutos.")
        await db.login_attempts.delete_one({"identifier": identifier})
        attempts = None

    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user or not verify_password(data.password, user["password_hash"]):
        new_count = (attempts.get("count", 0) if attempts else 0) + 1
        update = {"$inc": {"count": 1}}
        if new_count >= 5:
            update["$set"] = {"locked_at": datetime.now(timezone.utc).isoformat()}
        await db.login_attempts.update_one({"identifier": identifier}, update, upsert=True)
        raise HTTPException(status_code=401, detail="Email ou palavra-passe incorretos")

    await db.login_attempts.delete_one({"identifier": identifier})
    company = await db.companies.find_one({"id": user["company_id"]}, {"_id": 0})
    if not company:
        raise HTTPException(status_code=401, detail="Empresa não encontrada")
    return {"token": create_token(user["id"], email, company["id"], user["role"]), "company": serialize_company(company), "user": serialize_user(user)}


@api_router.get("/auth/me")
async def me(ctx: dict = Depends(get_current_context)):
    return {**serialize_company(ctx["company"]), "user": serialize_user(ctx["user"])}


# ---------- Equipa & Perfil ----------

class InviteInput(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=120)
    password: str = Field(min_length=6, max_length=128)
    role: str = "cobrador"
    cargo: Optional[str] = ""
    departamento: Optional[str] = ""


class RoleInput(BaseModel):
    role: str


class ProfileInput(BaseModel):
    full_name: Optional[str] = None
    cargo: Optional[str] = None
    departamento: Optional[str] = None
    photo_base64: Optional[str] = None


class PasswordInput(BaseModel):
    current_password: str
    new_password: str = Field(min_length=6, max_length=128)


@api_router.get("/team")
async def list_team(ctx: dict = Depends(require_admin)):
    users = await db.users.find({"company_id": ctx["company"]["id"]}, {"_id": 0, "password_hash": 0}).sort("created_at", 1).to_list(200)
    return [serialize_user(u) for u in users]


@api_router.post("/team/invite")
async def invite_member(data: InviteInput, ctx: dict = Depends(require_admin)):
    if data.role not in ("admin", "cobrador"):
        raise HTTPException(status_code=400, detail="Nível de acesso inválido")
    email = data.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Este email já está registado")
    user = {
        "id": str(uuid.uuid4()),
        "company_id": ctx["company"]["id"],
        "email": email,
        "password_hash": hash_password(data.password),
        "role": data.role,
        "full_name": data.full_name.strip(),
        "cargo": data.cargo or "",
        "departamento": data.departamento or "",
        "photo_base64": "",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(user)
    return serialize_user(user)


@api_router.put("/team/{user_id}/role")
async def change_role(user_id: str, data: RoleInput, ctx: dict = Depends(require_admin)):
    if data.role not in ("admin", "cobrador"):
        raise HTTPException(status_code=400, detail="Nível de acesso inválido")
    target = await db.users.find_one({"id": user_id, "company_id": ctx["company"]["id"]}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="Utilizador não encontrado")
    if target["id"] == ctx["user"]["id"] and data.role != "admin":
        raise HTTPException(status_code=400, detail="Não pode alterar o seu próprio nível de acesso")
    await db.users.update_one({"id": user_id}, {"$set": {"role": data.role}})
    target["role"] = data.role
    return serialize_user(target)


@api_router.delete("/team/{user_id}")
async def remove_member(user_id: str, ctx: dict = Depends(require_admin)):
    if user_id == ctx["user"]["id"]:
        raise HTTPException(status_code=400, detail="Não pode remover a sua própria conta")
    result = await db.users.delete_one({"id": user_id, "company_id": ctx["company"]["id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Utilizador não encontrado")
    return {"ok": True}


@api_router.put("/profile")
async def update_profile(data: ProfileInput, user: dict = Depends(get_current_user)):
    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    if "photo_base64" in updates and len(updates["photo_base64"]) > 2_000_000:
        raise HTTPException(status_code=400, detail="Fotografia demasiado grande (máx ~1.5MB)")
    if "full_name" in updates:
        updates["full_name"] = updates["full_name"].strip()
    if updates:
        await db.users.update_one({"id": user["id"]}, {"$set": updates})
    updated = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    return serialize_user(updated)


@api_router.put("/profile/password")
async def change_password(data: PasswordInput, user: dict = Depends(get_current_user)):
    if not verify_password(data.current_password, user["password_hash"]):
        raise HTTPException(status_code=400, detail="Palavra-passe atual incorreta")
    await db.users.update_one({"id": user["id"]}, {"$set": {"password_hash": hash_password(data.new_password)}})
    return {"ok": True}


# ---------- Branding ----------

@api_router.put("/branding")
async def update_branding(data: BrandingInput, ctx: dict = Depends(require_admin)):
    company = ctx["company"]
    updates = {k: v for k, v in data.model_dump().items() if v is not None}
    if "country" in updates and updates["country"] not in ("PT", "BR"):
        raise HTTPException(status_code=400, detail="País inválido (PT ou BR)")
    if "primary_color" in updates:
        if not re.match(r"^#[0-9a-fA-F]{6}$", updates["primary_color"]):
            raise HTTPException(status_code=400, detail="Cor inválida. Use formato #RRGGBB")
    if "logo_base64" in updates and len(updates["logo_base64"]) > 2_000_000:
        raise HTTPException(status_code=400, detail="Logótipo demasiado grande (máx ~1.5MB)")
    if "company_name" in updates:
        updates["company_name"] = updates["company_name"].strip()
    if updates:
        await db.companies.update_one({"id": company["id"]}, {"$set": updates})
    updated = await db.companies.find_one({"id": company["id"]}, {"_id": 0})
    return serialize_company(updated)


# ---------- Charges ----------

@api_router.get("/charges")
async def list_charges(company: dict = Depends(get_current_company)):
    charges = await db.charges.find({"company_id": company["id"]}, {"_id": 0}).sort("due_date", 1).to_list(1000)
    return [compute_aging(c) for c in charges]


@api_router.post("/charges")
async def create_charge(data: ChargeInput, ctx: dict = Depends(require_admin)):
    company = ctx["company"]
    for label, value in (("Data de vencimento", data.due_date), ("Próximo contacto", data.next_contact_date), ("Promessa de pagamento", data.promise_date)):
        if value:
            try:
                date.fromisoformat(value)
            except ValueError:
                raise HTTPException(status_code=400, detail=f"{label} inválida (AAAA-MM-DD)")
    if data.agreed_amount is not None and data.agreed_amount <= 0:
        raise HTTPException(status_code=400, detail="Valor acordado tem de ser positivo")
    if data.status not in ("pendente", "paga", "negociacao"):
        raise HTTPException(status_code=400, detail="Estado inválido")
    charge = data.model_dump()
    charge.update({
        "id": str(uuid.uuid4()),
        "company_id": company["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    await db.charges.insert_one(charge)
    charge.pop("_id", None)
    return compute_aging(charge)


async def get_owned_charge(charge_id: str, company: dict) -> dict:
    charge = await db.charges.find_one({"id": charge_id, "company_id": company["id"]}, {"_id": 0})
    if not charge:
        raise HTTPException(status_code=404, detail="Cobrança não encontrada")
    return charge


@api_router.get("/charges/{charge_id}")
async def get_charge(charge_id: str, company: dict = Depends(get_current_company)):
    return compute_aging(await get_owned_charge(charge_id, company))


@api_router.put("/charges/{charge_id}")
async def update_charge(charge_id: str, data: ChargeInput, ctx: dict = Depends(require_admin)):
    company = ctx["company"]
    existing = await get_owned_charge(charge_id, company)
    if data.status not in ("pendente", "paga", "negociacao"):
        raise HTTPException(status_code=400, detail="Estado inválido")
    updates = data.model_dump()
    if data.status == "paga" and existing.get("status") != "paga":
        updates["paid_at"] = datetime.now(timezone.utc).isoformat()
    elif data.status != "paga":
        updates["paid_at"] = None
    await db.charges.update_one({"id": charge_id}, {"$set": updates})
    updated = await db.charges.find_one({"id": charge_id}, {"_id": 0})
    return compute_aging(updated)


@api_router.delete("/charges/{charge_id}")
async def delete_charge(charge_id: str, ctx: dict = Depends(require_admin)):
    await get_owned_charge(charge_id, ctx["company"])
    await db.charges.delete_one({"id": charge_id})
    await db.interactions.delete_many({"charge_id": charge_id})
    await db.documents.delete_many({"charge_id": charge_id})
    return {"ok": True}


# ---------- Interactions (Timeline) ----------

class InteractionInput(BaseModel):
    type: str = "nota"
    note: str = Field(min_length=1, max_length=1000)


INTERACTION_TYPES = ("chamada", "email", "whatsapp", "nota")


@api_router.get("/charges/{charge_id}/interactions")
async def list_interactions(charge_id: str, company: dict = Depends(get_current_company)):
    await get_owned_charge(charge_id, company)
    return await db.interactions.find({"charge_id": charge_id}, {"_id": 0}).sort("created_at", -1).to_list(500)


@api_router.post("/charges/{charge_id}/interactions")
async def add_interaction(charge_id: str, data: InteractionInput, company: dict = Depends(get_current_company)):
    await get_owned_charge(charge_id, company)
    if data.type not in INTERACTION_TYPES:
        raise HTTPException(status_code=400, detail="Tipo de contacto inválido")
    doc = {
        "id": str(uuid.uuid4()),
        "charge_id": charge_id,
        "company_id": company["id"],
        "type": data.type,
        "note": data.note.strip(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.interactions.insert_one(doc)
    doc.pop("_id", None)
    return doc


# ---------- Documents (Anexos) ----------

class DocumentInput(BaseModel):
    category: str
    filename: str = Field(min_length=1, max_length=200)
    mime: str = "application/octet-stream"
    data_base64: str


DOC_CATEGORIES = ("nota_fiscal", "comprovativo", "guia_entrega", "outro")


@api_router.get("/charges/{charge_id}/documents")
async def list_documents(charge_id: str, company: dict = Depends(get_current_company)):
    await get_owned_charge(charge_id, company)
    return await db.documents.find({"charge_id": charge_id}, {"_id": 0, "data_base64": 0}).sort("created_at", -1).to_list(200)


@api_router.post("/charges/{charge_id}/documents")
async def add_document(charge_id: str, data: DocumentInput, company: dict = Depends(get_current_company)):
    await get_owned_charge(charge_id, company)
    if data.category not in DOC_CATEGORIES:
        raise HTTPException(status_code=400, detail="Categoria inválida")
    if len(data.data_base64) > 7_000_000:
        raise HTTPException(status_code=400, detail="Ficheiro demasiado grande (máx ~5MB)")
    doc = {
        "id": str(uuid.uuid4()),
        "charge_id": charge_id,
        "company_id": company["id"],
        "category": data.category,
        "filename": data.filename,
        "mime": data.mime,
        "data_base64": data.data_base64,
        "size": len(data.data_base64),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.documents.insert_one(doc)
    return {k: v for k, v in doc.items() if k not in ("data_base64", "_id")}


@api_router.get("/documents/{doc_id}/download")
async def download_document(doc_id: str, company: dict = Depends(get_current_company)):
    doc = await db.documents.find_one({"id": doc_id, "company_id": company["id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Documento não encontrado")
    return doc


@api_router.delete("/documents/{doc_id}")
async def delete_document(doc_id: str, ctx: dict = Depends(require_admin)):
    result = await db.documents.delete_one({"id": doc_id, "company_id": ctx["company"]["id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Documento não encontrado")
    return {"ok": True}


# ---------- Email de Cobrança (Resend via Emergent) ----------

EMAIL_BASE_URL = "https://integrations.emergentagent.com"
EMAIL_KEY = os.environ["EMERGENT_EMAIL_KEY"]
EMAIL_FROM_NAME = os.environ["EMAIL_FROM_NAME"]

_SHORTENERS = ("bit.ly", "tinyurl.com", "t.co", "is.gd", "cutt.ly", "goo.gl", "rebrand.ly")
_CRED_ASK = ("reply with your password", "reply with the code", "send your password", "cvv",
             "send us your password", "enter your password below", "confirm your card number",
             "your full card number", "seed phrase", "recovery phrase", "verify your card",
             "social security number", "confirm your bank details")
_HOSTISH = re.compile(r"\b(?:https?://)?((?:[a-z0-9-]+\.)+[a-z]{2,})", re.I)


def _host_ok(host: str) -> bool:
    if not host or "xn--" in host:
        return False
    try:
        ipaddress.ip_address(host)
        return False
    except ValueError:
        pass
    return not any(host == s or host.endswith("." + s) for s in _SHORTENERS)


def _same_site(shown: str, real: str) -> bool:
    return shown == real or real.endswith("." + shown) or shown.endswith("." + real)


class _EmailScan(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags, self.urls, self.anchors = set(), [], []
        self._href, self._text = None, []

    def handle_starttag(self, tag, attrs):
        self.tags.add(tag.lower())
        self.urls += [v for k, v in attrs if k.lower() in ("href", "src") and v]
        if tag.lower() == "a":
            self._href = dict((k.lower(), v) for k, v in attrs).get("href")
            self._text = []

    def handle_data(self, data):
        if self._href is not None:
            self._text.append(data)

    def handle_endtag(self, tag):
        if tag.lower() == "a" and self._href is not None:
            self.anchors.append((self._href, "".join(self._text)))
            self._href, self._text = None, []


def _assert_safe_email(subject: str, html: str) -> None:
    scan = _EmailScan()
    scan.feed(html)
    if scan.tags & {"form", "input", "textarea", "select"}:
        raise ValueError("No forms or input fields in email (G2)")
    body = f"{subject}\n{html}".lower()
    for p in _CRED_ASK:
        if p in body:
            raise ValueError(f"Email asks the recipient for credentials: {p!r} (G2)")
    for url in scan.urls:
        low = url.strip().lower()
        if low.startswith(("mailto:", "tel:", "cid:", "#")):
            continue
        if not low.startswith("https://"):
            raise ValueError(f"Email links/assets must be absolute https: {url!r} (G3)")
        host = urlparse(low).hostname or ""
        if not _host_ok(host) or urlparse(low).username is not None:
            raise ValueError(f"Shortened, numeric-host or credential-bearing URL: {url!r} (G3)")
    for href, text in scan.anchors:
        real = urlparse(href.strip().lower()).hostname or ""
        if not real:
            continue
        for m in _HOSTISH.finditer(text):
            if not _same_site(m.group(1).lower(), real):
                raise ValueError(f"Anchor text {m.group(1)!r} != real link host {real!r} (G3)")


async def send_email(*, to: str, subject: str, html: str, reply_to: str = None):
    _assert_safe_email(subject, html)
    payload = {"to": [to], "subject": subject, "html": html, "from_name": EMAIL_FROM_NAME}
    if reply_to:
        payload["contact_email"] = reply_to
    try:
        async with httpx.AsyncClient(timeout=30) as http:
            resp = await http.post(
                f"{EMAIL_BASE_URL}/api/v1/email/send",
                headers={"X-Email-Key": EMAIL_KEY},
                json=payload,
            )
        resp.raise_for_status()
        return resp.json().get("id")
    except httpx.HTTPStatusError as e:
        logger.error("Email send failed: %s %s", e.response.status_code, e.response.text)
        raise HTTPException(status_code=502, detail="Falha ao enviar o email")
    except Exception as e:
        logger.error("Email send error: %s", str(e))
        raise HTTPException(status_code=500, detail="Falha ao enviar o email")


def _fmt_money_email(v: float, country: str) -> str:
    raw = f"{v:,.2f}"
    if country == "BR":
        return "R$ " + raw.replace(",", "X").replace(".", ",").replace("X", ".")
    return raw.replace(",", " ").replace(".", ",") + " €"


def build_collection_email_html(company: dict, charge: dict) -> str:
    country = company.get("country", "PT")
    inv = "Factura" if country == "PT" else "Fatura"
    brand = company.get("primary_color", "#2563EB")
    initials = escape("".join(w[0] for w in company["company_name"].split()[:2]).upper())
    company_name = escape(company["company_name"])
    debtor = escape(charge["debtor_name"])
    invoice = escape(charge["invoice_number"])
    amount = _fmt_money_email(charge["amount"], country)
    days = max((date.today() - date.fromisoformat(charge["due_date"])).days, 0)
    due = date.fromisoformat(charge["due_date"]).strftime("%d/%m/%Y")
    bank = escape(company.get("iban") or "")
    status_line = (
        f"encontra-se em atraso há <strong>{days} dias</strong>" if days > 0
        else f"tem vencimento a <strong>{due}</strong>"
    )
    mail_subject = quote(f"Comprovativo de pagamento — {inv} {charge['invoice_number']}")
    proof_url = f"mailto:{company.get('email', '')}?subject={mail_subject}"
    bank_row = (
        f'<tr><td style="padding:6px 0;color:#64748b;font-size:13px">Dados para pagamento</td>'
        f'<td style="padding:6px 0;text-align:right;font-size:13px;color:#0f172a">{bank}</td></tr>'
        if bank else ""
    )
    return f'''<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 0">
<tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;font-family:Arial,sans-serif">
  <tr><td style="background:{escape(brand)};padding:24px 32px">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td style="background:rgba(255,255,255,0.18);border-radius:10px;width:44px;height:44px;text-align:center;color:#ffffff;font-size:18px;font-weight:bold;vertical-align:middle">{initials}</td>
      <td style="padding-left:12px;color:#ffffff;font-size:17px;font-weight:bold">{company_name}</td>
    </tr></table>
  </td></tr>
  <tr><td style="padding:32px">
    <p style="margin:0 0 16px;font-size:15px;color:#0f172a">Olá <strong>{debtor}</strong>,</p>
    <p style="margin:0 0 24px;font-size:14px;color:#334155;line-height:1.6">
      A {inv} <strong>{invoice}</strong> no valor de <strong>{amount}</strong> {status_line}.
      Agradecemos a regularização com a maior brevidade possível.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:8px;padding:16px 20px;margin-bottom:24px">
      <tr><td style="padding:6px 0;color:#64748b;font-size:13px">{inv}</td>
          <td style="padding:6px 0;text-align:right;font-size:13px;color:#0f172a;font-weight:bold">{invoice}</td></tr>
      <tr><td style="padding:6px 0;color:#64748b;font-size:13px">Valor em dívida</td>
          <td style="padding:6px 0;text-align:right;font-size:15px;color:#dc2626;font-weight:bold">{amount}</td></tr>
      <tr><td style="padding:6px 0;color:#64748b;font-size:13px">Dias de atraso</td>
          <td style="padding:6px 0;text-align:right;font-size:13px;color:#0f172a">{days}</td></tr>
      <tr><td style="padding:6px 0;color:#64748b;font-size:13px">Vencimento</td>
          <td style="padding:6px 0;text-align:right;font-size:13px;color:#0f172a">{due}</td></tr>
      {bank_row}
    </table>
    <table role="presentation" cellpadding="0" cellspacing="0" align="center"><tr>
      <td style="background:{escape(brand)};border-radius:8px;text-align:center">
        <a href="{proof_url}" style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:14px;font-weight:bold;text-decoration:none">Enviar Comprovativo</a>
      </td>
    </tr></table>
    <p style="margin:24px 0 0;font-size:12px;color:#94a3b8;line-height:1.6">
      Se já efetuou o pagamento, utilize o botão acima para nos enviar o comprovativo.
      Este email foi enviado por {company_name} através da plataforma {escape(EMAIL_FROM_NAME)}.
      Nunca pedimos palavras-passe ou dados de cartão por email.</p>
  </td></tr>
</table>
</td></tr></table>'''


@api_router.post("/charges/{charge_id}/send-email")
async def send_charge_email(charge_id: str, ctx: dict = Depends(get_current_context)):
    company = ctx["company"]
    charge = await get_owned_charge(charge_id, company)
    if not charge.get("debtor_email"):
        raise HTTPException(status_code=400, detail="Esta cobrança não tem email do devedor")

    one_hour_ago = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    recent = await db.interactions.find_one({
        "charge_id": charge_id, "type": "email", "source": "auto",
        "created_at": {"$gte": one_hour_ago},
    })
    if recent:
        raise HTTPException(status_code=429, detail="Já foi enviado um email para esta cobrança na última hora")

    country = company.get("country", "PT")
    inv = "Factura" if country == "PT" else "Fatura"
    subject = f"Lembrete de pagamento — {inv} {charge['invoice_number']}"
    html = build_collection_email_html(company, charge)
    email_id = await send_email(to=charge["debtor_email"], subject=subject, html=html, reply_to=company.get("email"))

    await db.interactions.insert_one({
        "id": str(uuid.uuid4()),
        "charge_id": charge_id,
        "company_id": company["id"],
        "type": "email",
        "note": f"Email de cobrança enviado para {charge['debtor_email']} ({inv} {charge['invoice_number']})",
        "source": "auto",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"status": "success", "email_id": email_id}


# ---------- Importação PDF (Relatório ERP) ----------

DATE_RE = re.compile(r"\b(\d{2})[/-](\d{2})[/-](\d{4})\b")
NIF_RE = re.compile(r"\b\d{9}\b")
CNPJ_RE = re.compile(r"\b\d{2}\.?\d{3}\.?\d{3}/?\d{4}-?\d{2}\b")
CPF_RE = re.compile(r"\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b")
CLIENT_DOC_RE = re.compile(r"(?i)\b(CNPJ|CPF|NIF)\s*[:\-]?\s*(\d{2}\.?\d{3}\.?\d{3}/?\d{4}-?\d{2}|\d{3}\.?\d{3}\.?\d{3}-?\d{2}|\d{9})\b")
AMOUNT_RE = re.compile(r"(?:€|R\$)?\s*(\d{1,3}(?:[.\s ]\d{3})+,\d{2}|\d+,\d{2}|\d{1,3}(?:,\d{3})+\.\d{2}|\d+\.\d{2})")
INVOICE_RE = re.compile(r"\b((?:FT|FAT|FR|NC|INV)[-/\s]?\d[\w/-]*)", re.IGNORECASE)


def parse_amount(raw: str) -> float:
    s = raw.replace(" ", " ").strip()
    if "," in s and "." in s:
        if s.rfind(",") > s.rfind("."):
            s = s.replace(".", "").replace(" ", "").replace(",", ".")
        else:
            s = s.replace(",", "")
    elif "," in s:
        s = s.replace(" ", "").replace(",", ".")
    return float(s)

SKIP_WORDS = ("total", "subtotal", "relatório", "relatorio", "página", "pagina", "período", "periodo", "emitido")


def _extract_client_name(line: str, doc_token: str) -> str:
    name = line.replace(doc_token, " ")
    name = re.sub(r"(?i)\b(cpf|cnpj|nif|cliente|nome|razão|social)\b\s*[:\-]?", " ", name)
    return name


def _clean_name(text: str) -> str:
    text = AMOUNT_RE.sub(" ", text)
    text = re.sub(r"€|R\$", " ", text)
    text = re.sub(r"\s{2,}", " ", text).strip(" -|•·:")
    return text



@api_router.post("/charges/import-pdf")
async def import_charges_pdf(file: UploadFile = File(...), ctx: dict = Depends(require_admin)):
    company = ctx["company"]
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="O ficheiro tem de ser um PDF")
    content = await file.read()
    if len(content) > 10_000_000:
        raise HTTPException(status_code=400, detail="PDF demasiado grande (máx 10MB)")

    try:
        with pdfplumber.open(io.BytesIO(content)) as pdf:
            lines = []
            for page in pdf.pages:
                lines.extend((page.extract_text() or "").splitlines())
    except Exception:
        raise HTTPException(status_code=400, detail="Não foi possível ler o PDF")

    created, skipped = [], []
    existing_invoices = {
        c["invoice_number"] async for c in db.charges.find({"company_id": company["id"]}, {"_id": 0, "invoice_number": 1})
    }
    seen_in_batch = set()
    current_client_name = None
    current_client_doc = None
    pending_name = None

    for raw_line in lines:
        line = raw_line.strip()
        if len(line) < 5:
            continue
        lower = line.lower()
        # Limpeza: ignora Total, Subtotal, Relatório e metadados de página
        if any(w in lower for w in SKIP_WORDS):
            continue
        if "vencimento" in lower and any(h in lower for h in ("doc", "valor", "cliente")):
            continue

        date_matches = list(DATE_RE.finditer(line))
        doc_m = CLIENT_DOC_RE.search(line)
        bare_m = None if doc_m else (CNPJ_RE.search(line) or CPF_RE.search(line) or NIF_RE.search(line))
        doc_token = doc_m.group(2) if doc_m else (bare_m.group(0) if bare_m else None)
        doc_start = doc_m.start() if doc_m else (bare_m.start() if bare_m else None)

        # Estado do Cliente: linha com 'CNPJ:' (ou CPF:/NIF:) → texto anterior = nome, número = documento
        if doc_token and not date_matches:
            name = _clean_name(line[:doc_start])
            if len(name) < 3 and pending_name:
                name = pending_name
            if len(name) >= 3:
                current_client_name, current_client_doc = name, doc_token
                pending_name = None
            continue

        # Extração de Faturas: linha com data + cliente atual definido
        if date_matches:
            rest = line
            for dm in date_matches:
                rest = rest.replace(dm.group(0), " ", 1)
            amounts = AMOUNT_RE.findall(rest)
            if not amounts:
                skipped.append(line[:80])
                continue
            try:
                due_m = date_matches[1] if len(date_matches) > 1 else date_matches[0]
                due = date(int(due_m.group(3)), int(due_m.group(2)), int(due_m.group(1))).isoformat()
                amount = parse_amount(amounts[-1])  # Valor: último número decimal da linha
            except (ValueError, OverflowError):
                skipped.append(line[:80])
                continue
            if amount <= 0:
                skipped.append(line[:80])
                continue

            if doc_token:
                # Formato plano: cliente na própria linha da fatura
                name = _clean_name(line[:doc_start])
                if len(name) >= 3:
                    current_client_name, current_client_doc = name, doc_token
            if not current_client_name:
                skipped.append(line[:80])
                continue

            # Nº doc.
            tmp = rest.replace(doc_token, " ") if doc_token else rest
            inv_m = INVOICE_RE.search(tmp)
            if inv_m:
                ndoc = inv_m.group(0)
            else:
                tokens = [tk for tk in AMOUNT_RE.sub(" ", tmp).split() if any(ch.isdigit() for ch in tk)]
                ndoc = tokens[0] if tokens else None
            invoice_number = (ndoc or f"IMP-{len(created) + 1:03d}").upper().replace(" ", "")

            if invoice_number in existing_invoices or invoice_number in seen_in_batch:
                skipped.append(f"{line[:60]} (já existe)")
                continue
            seen_in_batch.add(invoice_number)

            charge = {
                "id": str(uuid.uuid4()),
                "company_id": company["id"],
                "debtor_name": current_client_name[:200],
                "debtor_email": "",
                "debtor_phone": "",
                "debtor_nif": current_client_doc,
                "invoice_number": invoice_number,
                "amount": round(amount, 2),
                "due_date": due,
                "status": "pendente",
                "next_contact_date": None,
                "promise_date": None,
                "agreed_amount": None,
                "notes": f"Importado de {file.filename}",
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            await db.charges.insert_one(charge)
            charge.pop("_id", None)
            created.append(charge)
        else:
            # Possível linha só com o nome do cliente (aparece acima da linha 'CNPJ:')
            if re.search(r"[A-Za-zÀ-ÿ]{3}", line):
                pending_name = re.sub(r"(?i)^\s*(cliente|nome|empresa)\s*[:\-]\s*", "", line).strip(" -|•·:")
            else:
                skipped.append(line[:80])

    if not created and not skipped:
        raise HTTPException(status_code=400, detail="O PDF não contém texto legível (pode ser um documento digitalizado)")
    return {
        "created_count": len(created),
        "created": [compute_aging(c) for c in created],
        "skipped_count": len(skipped),
        "skipped": skipped[:20],
    }


# ---------- Dashboard ----------

@api_router.get("/dashboard")
async def dashboard(ctx: dict = Depends(require_admin)):
    company = ctx["company"]
    charges = await db.charges.find({"company_id": company["id"]}, {"_id": 0}).to_list(1000)
    charges = [compute_aging(c) for c in charges]

    pendentes = [c for c in charges if c["status"] == "pendente"]
    pagas = [c for c in charges if c["status"] == "paga"]
    negociacao = [c for c in charges if c["status"] == "negociacao"]
    total_debt = sum(c["amount"] for c in pendentes)
    recovered = sum(c["amount"] for c in pagas)
    critical = sum(c["amount"] for c in pendentes if c["bucket"] in ("vermelho", "roxo"))
    success_rate = round(len(pagas) / len(charges) * 100) if charges else 0

    buckets = {"por_vencer": 0, "verde": 0, "amarelo": 0, "vermelho": 0, "roxo": 0}
    for c in pendentes:
        buckets[c["bucket"]] = buckets.get(c["bucket"], 0) + 1

    today_iso = date.today().isoformat()
    followups = []
    for c in charges:
        if c["status"] == "paga":
            continue
        if c.get("next_contact_date") and c["next_contact_date"] <= today_iso:
            followups.append({
                "id": c["id"], "debtor_name": c["debtor_name"], "invoice_number": c["invoice_number"],
                "kind": "contacto", "date": c["next_contact_date"],
            })
        if c["status"] == "negociacao" and c.get("promise_date") and c["promise_date"] <= today_iso:
            followups.append({
                "id": c["id"], "debtor_name": c["debtor_name"], "invoice_number": c["invoice_number"],
                "kind": "promessa", "date": c["promise_date"], "agreed_amount": c.get("agreed_amount"),
            })
    followups.sort(key=lambda a: a["date"])

    recent = await db.interactions.find({"company_id": company["id"]}, {"_id": 0}).sort("created_at", -1).limit(5).to_list(5)
    charge_names = {}
    if recent:
        ids = list({r["charge_id"] for r in recent})
        async for ch in db.charges.find({"id": {"$in": ids}}, {"_id": 0, "id": 1, "debtor_name": 1}):
            charge_names[ch["id"]] = ch["debtor_name"]
    activities = [
        {"id": r["id"], "type": r["type"], "note": r["note"], "created_at": r["created_at"], "debtor_name": charge_names.get(r["charge_id"], "")}
        for r in recent
    ]

    return {
        "total_debt": round(total_debt, 2),
        "recovered": round(recovered, 2),
        "critical_debt": round(critical, 2),
        "success_rate": success_rate,
        "pending_count": len(pendentes),
        "paid_count": len(pagas),
        "negotiation_count": len(negociacao),
        "negotiation_amount": round(sum(c["amount"] for c in negociacao), 2),
        "buckets": buckets,
        "followups": followups,
        "recent_activities": activities,
    }


# ---------- Relatórios de Gestão ----------

@api_router.get("/reports/weekly")
async def weekly_report(ctx: dict = Depends(require_admin)):
    company = ctx["company"]
    since = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()

    interactions = await db.interactions.find(
        {"company_id": company["id"], "created_at": {"$gte": since}}, {"_id": 0}
    ).sort("created_at", -1).to_list(200)
    ids = list({i["charge_id"] for i in interactions})
    names = {}
    if ids:
        async for ch in db.charges.find({"id": {"$in": ids}}, {"_id": 0, "id": 1, "debtor_name": 1}):
            names[ch["id"]] = ch["debtor_name"]

    counts = {"chamada": 0, "email": 0, "whatsapp": 0, "nota": 0}
    for i in interactions:
        counts[i["type"]] = counts.get(i["type"], 0) + 1

    charges = await db.charges.find({"company_id": company["id"]}, {"_id": 0}).to_list(1000)
    paid_week = [c for c in charges if c["status"] == "paga" and c.get("paid_at") and c["paid_at"] >= since]
    negotiations = [
        {
            "debtor_name": c["debtor_name"], "invoice_number": c["invoice_number"], "amount": c["amount"],
            "promise_date": c.get("promise_date"), "agreed_amount": c.get("agreed_amount"), "notes": c.get("notes", ""),
        }
        for c in charges if c["status"] == "negociacao"
    ]

    return {
        "period": {"from": since[:10], "to": date.today().isoformat()},
        "counts": counts,
        "total_activities": len(interactions),
        "activities": [{**i, "debtor_name": names.get(i["charge_id"], "")} for i in interactions],
        "paid_this_week": len(paid_week),
        "recovered_this_week": round(sum(c["amount"] for c in paid_week), 2),
        "negotiations": negotiations,
    }


# ---------- Seed ----------

SAMPLE_CHARGES = [
    {"debtor_name": "Marta Sousa", "debtor_email": "marta.sousa@email.pt", "debtor_phone": "+351912345678", "debtor_nif": "245678901", "invoice_number": "FT-2026/041", "amount": 1250.00, "due_offset": -5, "status": "pendente", "notes": "Cliente habitual, primeiro atraso."},
    {"debtor_name": "Padaria Central Lda", "debtor_email": "geral@padariacentral.pt", "debtor_phone": "+351934567890", "debtor_nif": "508123456", "invoice_number": "FT-2026/033", "amount": 3480.50, "due_offset": -20, "status": "pendente", "notes": "Prometeu pagamento na última chamada."},
    {"debtor_name": "João Ribeiro", "debtor_email": "joao.ribeiro@email.pt", "debtor_phone": "+351967890123", "debtor_nif": "213456789", "invoice_number": "FT-2026/019", "amount": 890.00, "due_offset": -45, "status": "pendente", "notes": "Não atende chamadas desde maio."},
    {"debtor_name": "Auto Oficina São Pedro", "debtor_email": "oficina@saopedro.pt", "debtor_phone": "+351918765432", "debtor_nif": "505678234", "invoice_number": "FT-2025/112", "amount": 7620.75, "due_offset": -80, "status": "pendente", "notes": "Caso encaminhado para advogado."},
    {"debtor_name": "Clínica Vita", "debtor_email": "faturacao@clinicavita.pt", "debtor_phone": "+351210123456", "debtor_nif": "509345671", "invoice_number": "FT-2026/052", "amount": 2100.00, "due_offset": 10, "status": "pendente", "notes": ""},
    {"debtor_name": "Carla Mendes", "debtor_email": "carla.mendes@email.pt", "debtor_phone": "+351925678901", "debtor_nif": "256789012", "invoice_number": "FT-2026/007", "amount": 640.00, "due_offset": -60, "status": "paga", "notes": "Pago após 2º lembrete."},
]


async def seed_sample_charges(company_id: str):
    docs = []
    for s in SAMPLE_CHARGES:
        due = (date.today() + timedelta(days=s["due_offset"])).isoformat()
        doc = {k: v for k, v in s.items() if k != "due_offset"}
        doc.update({
            "id": str(uuid.uuid4()),
            "company_id": company_id,
            "due_date": due,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        docs.append(doc)
    await db.charges.insert_many(docs)


@app.on_event("startup")
async def startup():
    await db.companies.create_index("email", unique=True)
    await db.users.create_index("email", unique=True)
    await db.users.create_index("company_id")
    await db.charges.create_index("company_id")
    await db.login_attempts.create_index("identifier")
    await db.interactions.create_index("charge_id")
    await db.documents.create_index("charge_id")

    # Migração: empresas antigas com credenciais na própria empresa → coleção users
    async for comp in db.companies.find({"password_hash": {"$exists": True}}):
        if not await db.users.find_one({"email": comp["email"]}):
            await db.users.insert_one({
                "id": str(uuid.uuid4()),
                "company_id": comp["id"],
                "email": comp["email"],
                "password_hash": comp["password_hash"],
                "role": "admin",
                "full_name": comp.get("company_name", "Administrador"),
                "cargo": "Administrador",
                "departamento": "",
                "photo_base64": "",
                "created_at": comp.get("created_at", datetime.now(timezone.utc).isoformat()),
            })
        await db.companies.update_one({"id": comp["id"]}, {"$unset": {"password_hash": ""}})

    admin_email = os.environ.get("ADMIN_EMAIL", "").lower()
    admin_password = os.environ.get("ADMIN_PASSWORD", "")
    if admin_email and admin_password:
        company = await db.companies.find_one({"email": admin_email})
        if not company:
            company = {
                "id": str(uuid.uuid4()),
                "email": admin_email,
                "company_name": "TechFlow Solutions Lda",
                "nif": "509876543",
                "iban": "PT50 0010 0000 1234 5678 9017 5",
                "country": "PT",
                "google_client_id": "",
                "primary_color": "#2563EB",
                "logo_base64": "",
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            await db.companies.insert_one(company)
            await seed_sample_charges(company["id"])
            logger.info("Empresa admin criada: %s", admin_email)

        existing_user = await db.users.find_one({"email": admin_email})
        if not existing_user:
            await db.users.insert_one({
                "id": str(uuid.uuid4()),
                "company_id": company["id"],
                "email": admin_email,
                "password_hash": hash_password(admin_password),
                "role": "admin",
                "full_name": "Denis Ferreira",
                "cargo": "Administrador",
                "departamento": "Gestão",
                "photo_base64": "",
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
            logger.info("Utilizador admin criado: %s", admin_email)
        elif not verify_password(admin_password, existing_user["password_hash"]):
            await db.users.update_one({"email": admin_email}, {"$set": {"password_hash": hash_password(admin_password)}})

        cobrador_email = "cobrador@techflow.pt"
        if not await db.users.find_one({"email": cobrador_email}):
            await db.users.insert_one({
                "id": str(uuid.uuid4()),
                "company_id": company["id"],
                "email": cobrador_email,
                "password_hash": hash_password("Cobrador2026!"),
                "role": "cobrador",
                "full_name": "Rui Tavares",
                "cargo": "Cobrador",
                "departamento": "Cobranças",
                "photo_base64": "",
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
            logger.info("Utilizador cobrador demo criado")

        admin = company
        if admin and not await db.charges.find_one({"company_id": admin["id"], "status": "negociacao"}):
            charge = {
                "id": str(uuid.uuid4()),
                "company_id": admin["id"],
                "debtor_name": "Construções Horizonte S.A.",
                "debtor_email": "compras@horizonte.pt",
                "debtor_phone": "+351219876543",
                "debtor_nif": "507654321",
                "invoice_number": "FT-2026/015",
                "amount": 4320.00,
                "due_date": (date.today() - timedelta(days=38)).isoformat(),
                "status": "negociacao",
                "next_contact_date": (date.today() - timedelta(days=3)).isoformat(),
                "notes": "Proposta de pagamento faseado em análise.",
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            await db.charges.insert_one(charge)
            await db.interactions.insert_one({
                "id": str(uuid.uuid4()),
                "charge_id": charge["id"],
                "company_id": admin["id"],
                "type": "chamada",
                "note": "Liguei hoje. Cliente propôs pagamento faseado em 3 prestações.",
                "created_at": (datetime.now(timezone.utc) - timedelta(days=2)).isoformat(),
            })
            logger.info("Cobrança demo em negociação criada")

        if admin:
            neg = await db.charges.find_one({"company_id": admin["id"], "status": "negociacao"})
            if neg and not neg.get("promise_date"):
                await db.charges.update_one(
                    {"id": neg["id"]},
                    {"$set": {"promise_date": (date.today() - timedelta(days=1)).isoformat(), "agreed_amount": neg["amount"]}},
                )


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)
