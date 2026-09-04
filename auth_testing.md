# Auth Testing Playbook — Cobranpro

## Credenciais
Ver /app/memory/test_credentials.md (admin, cobrador, empresa de import).

## Verificação MongoDB
```
mongosh
use test_database
db.users.find({role: "admin"}, {email: 1, password_hash: 1})
db.users.getIndexes()   // email unique
db.password_resets.getIndexes()  // token unique
```
password_hash começa por `$2b$` (bcrypt).

## API (curl)
```
# login
curl -X POST $API/api/auth/login -H "Content-Type: application/json" -d '{"email":"...","password":"..."}'
# me
curl $API/api/auth/me -H "Authorization: Bearer $TOKEN"
# forgot (sempre 200, sem enumeração)
curl -X POST $API/api/auth/forgot-password -H "Content-Type: application/json" -d '{"email":"x@y.z","origin":"https://<frontend>"}'
# reset (token vem do email / coleção password_resets)
curl -X POST $API/api/auth/reset-password -H "Content-Type: application/json" -d '{"token":"<token>","password":"nova123456"}'
```

## Regras
- Reset token: `secrets.token_urlsafe(32)`, validade 1h, `used` após consumo.
- forgot-password nunca revela se o email existe.
- Empresa com `blocked: true` recebe 403 no login e em toda a API.
