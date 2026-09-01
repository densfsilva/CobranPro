# PRD — CobranPro (Plataforma SaaS de Gestão de Cobranças)

## Problem Statement Original
"Cria uma plataforma SaaS de Gestão de Cobranças Profissional: Multi-Empresa: Cada empresa (cliente) pode ter o seu login, carregar o seu próprio logótipo e definir a sua 'Cor Principal' de branding. Dashboard Financeiro: Interativo, com badges de cores (Verde, Amarelo, Vermelho, Roxo) baseados no atraso. Ficha de Cobrança: Área para ver os dados do devedor e preparar o envio de mensagens. Preparação para Mensagens: botões WhatsApp e Email que abrem uma janela com texto pré-preenchido. Base de Dados: Backend FastAPI/MongoDB para branding de cada empresa."

## Arquitetura
- Backend: FastAPI + Motor (MongoDB) em `/app/backend/server.py`, rotas com prefixo `/api`
- Auth: JWT Bearer (PyJWT, 7 dias) + bcrypt; brute-force lockout (5 falhas → 15 min) indexado por email
- Frontend: React 19 + Tailwind + shadcn/ui + recharts + sonner, tema dark, fontes Outfit/Inter/JetBrains Mono
- Branding dinâmico: CSS var `--brand` aplicada via AuthContext; logótipo em base64 no documento da empresa

## Personas
- Dono/gestor de PME que precisa de recuperar faturas em atraso
- Empresas multi-tenant com identidade visual própria

## Core Requirements (estáticos)
1. Login/registo por empresa (multi-tenant, dados isolados por company_id)
2. Branding por empresa: nome, NIF, IBAN, cor principal (#RRGGBB), logótipo
3. Dashboard com KPIs, gráfico de antiguidade e tabela de cobranças
4. Badges: Verde 1-15d, Amarelo 16-30d, Vermelho 31-60d, Roxo >60d (+Por Vencer, Paga)
5. Ficha de Cobrança com dados do devedor e ações
6. Modal de preparação de mensagem WhatsApp/Email com templates pré-preenchidos ([Nome], [Valor], [Fatura], [IBAN], [Dias])

## Implementado
### 2026-09-01 — Iteração 3: Fluxo, Timeline, Anexos e Relatórios
- Novo status `negociacao` ("Em Negociação"): excluído dos KPIs/buckets de cobrança ativa; página própria (/negociacao, badge laranja); ações na ficha: Em Negociação / Retomar Cobrança / Marcar como Paga
- Timeline de contactos na ficha: coleção `interactions` (chamada/email/whatsapp/nota), GET/POST /api/charges/{id}/interactions
- Campo `next_contact_date` na cobrança: alerta automático no Dashboard (GET /api/dashboard devolve `followups` com contactos vencidos; banner âmbar com links)
- Gestão de Anexos: coleção `documents` (base64, máx 5MB, categorias Nota Fiscal/Comprovativo/Guia de Entrega/Outro), endpoints list/upload/download/delete por cobrança
- Módulo de Relatórios (/relatorios): filtros por cliente, estado (Atrasado/Recebido/Negociando/Por Vencer) e intervalo de datas de vencimento; botão Imprimir/Gerar PDF com layout print-only profissional (logo, filtros aplicados, tabela e totais) via @media print em index.css
- Fix: serialização ObjectId em add_document (500 após insert); badge "Em Negociação" na tabela do Dashboard
- Seed demo: cobrança "Construções Horizonte S.A." em negociação com follow-up vencido + interação + documento de exemplo

### 2026-09-01 — Iteração 2: Localização, White Label e Menu Lateral
- Seletor de País (Portugal/Brasil) nas Configurações: moeda adapta-se automaticamente (€ pt-PT / R$ pt-BR) e o campo de identificação muda (NIF / CNPJ) em todo o app (`/app/frontend/src/lib/format.js`); backend aceita `country` em PUT /api/branding com validação PT/BR
- Ecrã de Configurações unificado (rota /configuracoes): Localização + Identidade (logótipo upload base64, nome, NIF/CNPJ, IBAN/PIX) + Cor de Marca (color picker + presets) — a cor aplica-se a botões e menus de toda a app
- Menu lateral com 4 links: Dashboard, Pendentes, Recebidos, Configurações
- Novas páginas: Pendentes (lista de cobranças por liquidar, ordenada por dias de atraso) e Recebidos (histórico de cobranças pagas com total recuperado)
- Rota antiga /branding redireciona para /configuracoes

### 2026-09-01 — MVP completo
- Auth JWT (register/login/me) com lockout brute-force; admin seed: denis.ferreira0909@gmail.com
- PUT /api/branding (cor, logótipo base64, NIF, IBAN)
- CRUD /api/charges + GET /api/dashboard (KPIs e buckets de atraso calculados server-side)
- Frontend: AuthPage, Dashboard (KPIs, gráfico recharts, pesquisa, filtros), Ficha de Cobrança (marcar paga, eliminar), Branding (color picker + presets + upload de logótipo), MessageModal (3 templates PT-PT, copiar com fallback, wa.me/mailto)
- Novas empresas recebem 6 cobranças de exemplo automaticamente
- Testes: 35/35 pytest backend, 11/12 fluxos frontend na 1ª ronda; corrigidos lockout por IP, clipboard sem try/catch, formatação monetária, aria nos dialogs → 35/35 após fix

## Backlog Priorizado
- P1: Envio real de WhatsApp/Email (integração Twilio/Resend) em vez de apenas modal pré-preenchido
- P1: Edição de cobrança na UI (hoje só criar/eliminar/marcar paga)
- P2: Timeline de comunicações na ficha do devedor (histórico de mensagens preparadas/enviadas)
- P2: Traduzir mensagens de validação 422 do Pydantic para PT-PT
- P2: Date picker shadcn no formulário de Nova Cobrança
- P2: Múltiplas faturas por devedor agregadas numa única ficha
- P3: Exportação CSV/PDF do dashboard; notificações de vencimento agendadas

## Próximas Tarefas
1. Confirmar com o utilizador se pretende envio real de mensagens (Twilio/Resend)
2. Edição inline de cobranças
3. Histórico de contactos por cobrança

## Credenciais de Teste
Ver `/app/memory/test_credentials.md`
