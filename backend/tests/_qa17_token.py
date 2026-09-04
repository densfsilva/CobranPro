import sys
import requests
from dotenv import dotenv_values
from pymongo import MongoClient

env = dotenv_values("/app/backend/.env")
fenv = dotenv_values("/app/frontend/.env")
API = fenv["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"
EMAIL = "import.teste@example.com"

cmd = sys.argv[1] if len(sys.argv) > 1 else "token"
cli = MongoClient(env["MONGO_URL"])
db = cli[env["DB_NAME"]]

if cmd == "token":
    requests.post(f"{API}/auth/forgot-password", json={"email": EMAIL, "origin": fenv["REACT_APP_BACKEND_URL"]})
    rec = db.password_resets.find_one({"email": EMAIL, "used": False}, sort=[("created_at", -1)])
    print(rec["token"])
elif cmd == "restore":
    requests.post(f"{API}/auth/forgot-password", json={"email": EMAIL, "origin": fenv["REACT_APP_BACKEND_URL"]})
    rec = db.password_resets.find_one({"email": EMAIL, "used": False}, sort=[("created_at", -1)])
    r = requests.post(f"{API}/auth/reset-password", json={"token": rec["token"], "password": "teste123456"})
    login = requests.post(f"{API}/auth/login", json={"email": EMAIL, "password": "teste123456"})
    print("restore", r.status_code, "login", login.status_code)
elif cmd == "cleanup":
    res = db.password_resets.delete_many({"email": EMAIL})
    print("deleted", res.deleted_count)
cli.close()
