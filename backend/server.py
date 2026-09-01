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

import bcrypt
import jwt
from fastapi import FastAPI, APIRouter, HTTPException, Request, Depends
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


def create_token(company_id: str, email: str) -> str:
    payload = {
        "sub": company_id,
        "email": email,
        "type": "access",
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def serialize_company(doc: dict) -> dict:
    return {
        "id": doc["id"],
        "email": doc["email"],
        "company_name": doc["company_name"],
        "nif": doc.get("nif", ""),
        "iban": doc.get("iban", ""),
        "country": doc.get("country", "PT"),
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


async def get_current_company(creds: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    if not creds:
        raise HTTPException(status_code=401, detail="Não autenticado")
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        company = await db.companies.find_one({"id": payload["sub"]}, {"_id": 0})
        if not company:
            raise HTTPException(status_code=401, detail="Empresa não encontrada")
        return company
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Sessão expirada")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token inválido")


# ---------- Schemas ----------

class RegisterInput(BaseModel):
    company_name: str = Field(min_length=2, max_length=120)
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
    notes: Optional[str] = ""


# ---------- Auth ----------

@api_router.post("/auth/register")
async def register(data: RegisterInput):
    email = data.email.lower().strip()
    existing = await db.companies.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="Este email já está registado")
    company = {
        "id": str(uuid.uuid4()),
        "email": email,
        "password_hash": hash_password(data.password),
        "company_name": data.company_name.strip(),
        "nif": "",
        "iban": "",
        "country": "PT",
        "primary_color": "#2563EB",
        "logo_base64": "",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.companies.insert_one(company)
    await seed_sample_charges(company["id"])
    return {"token": create_token(company["id"], email), "company": serialize_company(company)}


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

    company = await db.companies.find_one({"email": email}, {"_id": 0})
    if not company or not verify_password(data.password, company["password_hash"]):
        new_count = (attempts.get("count", 0) if attempts else 0) + 1
        update = {"$inc": {"count": 1}}
        if new_count >= 5:
            update["$set"] = {"locked_at": datetime.now(timezone.utc).isoformat()}
        await db.login_attempts.update_one({"identifier": identifier}, update, upsert=True)
        raise HTTPException(status_code=401, detail="Email ou palavra-passe incorretos")

    await db.login_attempts.delete_one({"identifier": identifier})
    return {"token": create_token(company["id"], email), "company": serialize_company(company)}


@api_router.get("/auth/me")
async def me(company: dict = Depends(get_current_company)):
    return serialize_company(company)


# ---------- Branding ----------

@api_router.put("/branding")
async def update_branding(data: BrandingInput, company: dict = Depends(get_current_company)):
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
async def create_charge(data: ChargeInput, company: dict = Depends(get_current_company)):
    for label, value in (("Data de vencimento", data.due_date), ("Próximo contacto", data.next_contact_date)):
        if value:
            try:
                date.fromisoformat(value)
            except ValueError:
                raise HTTPException(status_code=400, detail=f"{label} inválida (AAAA-MM-DD)")
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
async def update_charge(charge_id: str, data: ChargeInput, company: dict = Depends(get_current_company)):
    await get_owned_charge(charge_id, company)
    if data.status not in ("pendente", "paga", "negociacao"):
        raise HTTPException(status_code=400, detail="Estado inválido")
    await db.charges.update_one({"id": charge_id}, {"$set": data.model_dump()})
    updated = await db.charges.find_one({"id": charge_id}, {"_id": 0})
    return compute_aging(updated)


@api_router.delete("/charges/{charge_id}")
async def delete_charge(charge_id: str, company: dict = Depends(get_current_company)):
    await get_owned_charge(charge_id, company)
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
async def delete_document(doc_id: str, company: dict = Depends(get_current_company)):
    result = await db.documents.delete_one({"id": doc_id, "company_id": company["id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Documento não encontrado")
    return {"ok": True}


# ---------- Dashboard ----------

@api_router.get("/dashboard")
async def dashboard(company: dict = Depends(get_current_company)):
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
    followups = sorted(
        [c for c in charges if c["status"] != "paga" and c.get("next_contact_date") and c["next_contact_date"] <= today_iso],
        key=lambda c: c["next_contact_date"],
    )

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
        "followups": [
            {"id": c["id"], "debtor_name": c["debtor_name"], "invoice_number": c["invoice_number"], "next_contact_date": c["next_contact_date"], "bucket": c["bucket"]}
            for c in followups
        ],
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
    await db.charges.create_index("company_id")
    await db.login_attempts.create_index("identifier")
    await db.interactions.create_index("charge_id")
    await db.documents.create_index("charge_id")

    admin_email = os.environ.get("ADMIN_EMAIL", "").lower()
    admin_password = os.environ.get("ADMIN_PASSWORD", "")
    if admin_email and admin_password:
        existing = await db.companies.find_one({"email": admin_email})
        if not existing:
            company = {
                "id": str(uuid.uuid4()),
                "email": admin_email,
                "password_hash": hash_password(admin_password),
                "company_name": "TechFlow Solutions Lda",
                "nif": "509876543",
                "iban": "PT50 0010 0000 1234 5678 9017 5",
                "country": "PT",
                "primary_color": "#2563EB",
                "logo_base64": "",
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            await db.companies.insert_one(company)
            await seed_sample_charges(company["id"])
            logger.info("Empresa admin criada: %s", admin_email)
        elif not verify_password(admin_password, existing["password_hash"]):
            await db.companies.update_one({"email": admin_email}, {"$set": {"password_hash": hash_password(admin_password)}})

        admin = await db.companies.find_one({"email": admin_email})
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
