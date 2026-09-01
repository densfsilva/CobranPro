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

import bcrypt
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
    await get_owned_charge(charge_id, company)
    if data.status not in ("pendente", "paga", "negociacao"):
        raise HTTPException(status_code=400, detail="Estado inválido")
    await db.charges.update_one({"id": charge_id}, {"$set": data.model_dump()})
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


# ---------- Importação PDF (Relatório ERP) ----------

DATE_RE = re.compile(r"\b(\d{2})[/-](\d{2})[/-](\d{4})\b")
NIF_RE = re.compile(r"\b\d{9}\b")
CNPJ_RE = re.compile(r"\b\d{2}\.?\d{3}\.?\d{3}/?\d{4}-?\d{2}\b")
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
    for line in lines:
        line = line.strip()
        if len(line) < 10:
            continue
        lower = line.lower()
        if any(k in lower for k in ("total", "relatório", "relatorio", "página", "pagina", "vencimento")):
            continue
        date_m = DATE_RE.search(line)
        if not date_m:
            skipped.append(line[:80])
            continue
        rest = line.replace(date_m.group(0), " ")
        nif_m = NIF_RE.search(rest) or CNPJ_RE.search(rest)
        amounts = AMOUNT_RE.findall(rest)
        if not (nif_m and amounts):
            skipped.append(line[:80])
            continue
        try:
            due = date(int(date_m.group(3)), int(date_m.group(2)), int(date_m.group(1))).isoformat()
            amount = max(parse_amount(a) for a in amounts)
        except (ValueError, OverflowError):
            skipped.append(line[:80])
            continue
        if amount <= 0:
            skipped.append(line[:80])
            continue
        inv_m = INVOICE_RE.search(rest)
        name = rest.replace(nif_m.group(0), " ")
        if inv_m:
            name = name.replace(inv_m.group(0), " ")
        name = AMOUNT_RE.sub(" ", name)
        name = re.sub(r"€|R\$", " ", name)
        name = re.sub(r"\s{2,}", " ", name).strip(" -|•·")
        if len(name) < 3:
            skipped.append(line[:80])
            continue
        invoice_number = (inv_m.group(0) if inv_m else f"IMP-{len(created) + 1:03d}").upper().replace(" ", "")
        if invoice_number in existing_invoices or invoice_number in seen_in_batch:
            skipped.append(f"{line[:60]} (já existe)")
            continue
        seen_in_batch.add(invoice_number)
        charge = {
            "id": str(uuid.uuid4()),
            "company_id": company["id"],
            "debtor_name": name[:200],
            "debtor_email": "",
            "debtor_phone": "",
            "debtor_nif": nif_m.group(0),
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
