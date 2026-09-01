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
### 2026-09-01 — Iteração 9: Módulo de Comunicação — Disparo de Cobranças
- Email real via Resend (integração gerida Emergent, EMERGENT_EMAIL_KEY + EMAIL_FROM_NAME="CobranPro" em backend/.env; httpx adicionado): POST /api/charges/{id}/send-email com guard de segurança (_assert_safe_email — sem formulários, links apenas https/mailto, destinatário sempre do registo server-side), rate limit 1 email/hora por cobrança, tenant-scoped por empresa
- Template de email profissional server-side: header com cor de marca + iniciais da empresa, nome do cliente, valor em dívida, dias de atraso, dados de pagamento (IBAN/PIX) e botão "Enviar Comprovativo" (mailto para o email da empresa); texto adapta-se ao país (Factura/Fatura, €/R$)
- WhatsApp direto (wa.me) na lista de devedores (Pendentes + Dashboard): mensagem "Olá [Nome], vimos que a fatura [Nº] com vencimento em [Data] ainda está pendente. Podemos ajudar?" via WhatsAppQuickButton
- Registo automático na Timeline: envio real de email (backend, source "auto") e preparação WhatsApp/Email no modal (frontend) criam atividades; ficha atualiza a timeline em direto (reloadSignal)
- Modal de mensagem (ficha) ganha botão "Enviar Email" (envio real) junto de "Abrir Email" (mailto) e Copiar

### 2026-09-01 — Iteração 8: i18n BR completo, Dados da Instituição, acabamento
- i18n alargado: chaves team (Equipa/Equipe), users (Utilizadores/Usuários), save (Guardar/Salvar), password (Palavra-passe/Senha), registerVerb (Registar/Registrar) — aplicadas ao menu lateral, Gestão de Equipa, Configurações, Perfil e Timeline; grep confirma zero termos hardcoded fora do dicionário
- Dados da Instituição: campo Endereço na empresa (PUT /api/branding + Configurações > Identidade); Nome da Empresa passa a aparecer no topo do Dashboard (overline data-testid=dashboard-company-name) e Endereço entra no cabeçalho do relatório PDF/impressão
- removeChild: correção da iteração 7 mantida (translate=no + spans + refresh ao fechar dialog + keys compostas) — revalidada pelo testing agent

### 2026-09-01 — Iteração 7: Fix do erro 'removeChild' no Importar PDF
- Causa raiz: auto-tradução do browser muta nós de texto → React falha ao removê-los. Fix: `<html lang="pt" class="notranslate" translate="no">` + meta google notranslate em public/index.html; nós de texto mistos (texto + expressões) encapsulados em <span> nas páginas Pendentes/Negociação/Recebidos/Relatórios e no resultado do import
- ImportPdfDialog: atualização da lista da página pai passou a acontecer ao FECHAR o dialog (importedRef), eliminando a condição de corrida entre o render do resultado e o refresh da lista; render defensivo com (result.created || [])
- Dashboard: fix de chaves React duplicadas nos alertas de follow-up (mesma cobrança pode gerar alerta 'contacto' + 'promessa') — key composta `${id}-${kind}-${date}` (vetor residual de removeChild identificado pelo agente de testes)
- Import PDF: deduplicação por invoice_number — reimportar o mesmo PDF devolve as linhas como ignoradas "(já existe)" em vez de criar duplicados
- Moeda: useGrouping "always" (agrupamento consistente em valores de 4 dígitos: "8 510,75 €")
- Verificação: testing_agent confirmou 0 erros de consola/pageerror em 2 imports consecutivos + Escape/reabertura + regressão do Dashboard; 35/35 pytest

### 2026-09-01 — Iteração 6: RBAC, Gestão de Equipa e Perfil
- Nova coleção `users` separada de `companies`: cada empresa tem múltiplos utilizadores com email+senha próprios (bcrypt); migração automática no startup (empresas antigas com password_hash → utilizador admin)
- RBAC com 2 níveis: Administrador (acesso total) e Cobrador (lista pendentes + regista atividades); role re-lido da BD a cada pedido (`require_admin` dependency) — cobrador recebe 403 em Dashboard, Relatórios, Configurações, Equipa, criar/editar/apagar cobranças, importar PDF e apagar documentos
- Endpoints: GET /api/team, POST /api/team/invite, PUT /api/team/{id}/role, DELETE /api/team/{id} (admin only; proteções: não remover/rebaixar a própria conta); PUT /api/profile (nome, cargo, departamento, fotografia base64) e PUT /api/profile/password
- Frontend: página Equipa (/equipa, admin) com convite de membros e gestão de roles; página Perfil (/perfil) com fotografia e alteração de senha; sidebar com card do utilizador, badge de role no topbar, menu filtrado por role; cobrador entra em /pendentes e rotas admin redirecionam
- Contas demo: admin denis.ferreira0909@gmail.com / Cobrancas2026! e cobrador@techflow.pt / Cobrador2026! (mesma empresa)
- Fix: teste bcrypt atualizado para a coleção users; nome do admin migrado corrigido para "Denis Ferreira"

### 2026-09-01 — Iteração 5: i18n PT/BR e revisão ortográfica
- Dicionário dinâmico `/app/frontend/src/lib/i18n.js` (função `t()` + `invoiceWord()`): vocabulário muda com o País — PT: Factura/Utilizador/Ecrã/Telemóvel/NIF; BR: Fatura/Usuário/Tela/Celular/CNPJ. Aplicado a cabeçalhos de tabelas, placeholders de pesquisa, ficha de cobrança, formulário, mensagens WhatsApp/Email (inclui "o IBAN" ↔ "a chave PIX / dados bancários") e relatórios/print
- Pluralização corrigida ("1 factura em negociação" vs "2 facturas")
- Leitura de PDF confirma NIF (9 dígitos) e CNPJ (14 dígitos, com/sem pontuação) — testado com PDF BR: CNPJs 12.345.678/0001-90 e 98765432000155 detetados, valores R$ corretos
- Confirmado: Aba Em Negociação, Promessa de Pagamento (alerta no Dashboard) e Timeline de Atividades já implementados e a funcionar com a linguagem correta

### 2026-09-01 — Iteração 4: Negociação avançada, Atividades, Importação PDF e Google Drive (estrutura)
- Campos `promise_date` (Promessa de Pagamento) e `agreed_amount` (Valor Acordado) na cobrança; card "Negociação" na ficha (visível quando status = Em Negociação); colunas Promessa/Valor Acordado na página Em Negociação
- Alerta de promessa falhada: se `promise_date` vencer sem baixa (status != paga), entra nos `followups` do GET /api/dashboard com kind="promessa" (banner âmbar no Dashboard)
- Timeline renomeada para "Timeline de Atividades": tipos Chamada/WhatsApp/Email + resumo; bloco de notas da ficha removido
- Importar Relatório ERP: POST /api/charges/import-pdf (pdfplumber) extrai Nome, NIF/CNPJ, Valor e Vencimento de cada linha do PDF e cria faturas automaticamente; botão no Dashboard e em Pendentes (ImportPdfDialog com resumo de importação)
- Google Drive (estrutura): campo `google_client_id` na empresa (PUT /api/branding) + card "Integrações" nas Configurações, preparado para guardar anexos no Drive futuramente
- Fix: parser de valores ignorava a data antes de extrair montantes (ex.: "15/09/2026 740,00" lia 26740) — corrigido; dependências pdfplumber + reportlab adicionadas a requirements.txt

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
