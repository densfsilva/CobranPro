# Auth Testing Playbook

## Step 1: MongoDB Verification
```
mongosh
use test_database
db.companies.find({email: "denis.ferreira0909@gmail.com"}, {password_hash: 1})
```
Verify: bcrypt hash starts with `$2b$`, unique index on companies.email, index on login_attempts.identifier.

## Step 2: API Testing
```
TOKEN=$(curl -s -X POST $REACT_APP_BACKEND_URL/api/auth/login -H "Content-Type: application/json" -d '{"email":"denis.ferreira0909@gmail.com","password":"Cobrancas2026!"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
curl -s $REACT_APP_BACKEND_URL/api/auth/me -H "Authorization: Bearer $TOKEN"
```
Login returns {token, company}; /me returns the same company with Bearer token.

## Brute force
5 failed logins on same email+IP → HTTP 429 with 15-minute lockout; success clears attempts.

## Register
POST /api/auth/register {company_name, email, password(min 6)} → token + company + 6 sample charges auto-seeded.
