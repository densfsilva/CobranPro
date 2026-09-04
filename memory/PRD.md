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
### 2026-09-04 — Iteração 18: Fix crítico de agrupamento, lookups e Super Admin (CONCLUÍDA)
- Agrupamento por cliente passa a usar clientGroupKey (NIF/CNPJ só dígitos; fallback nome normalizado) no Dashboard e Pendentes — elimina grupos duplicados por variações de nome (lib/masks.js)
- Lupa NIF: frontend normaliza input (remove pontos/traços) + backend já normalizava; feedback ao clique ("Cliente não encontrado…") e erro de rede comunicado; verificado: 245.678.901 e 245678-901 → found:true (Marta Sousa), HTTP 200
- CEP lookup: geoapi.pt atingiu limite gratuito; zippopotam avaliado e descartado (dados PT vazios); backend devolve {found:false, unavailable:true} em rate-limit/falha → frontend mostra aviso "Serviço de Código Postal temporariamente indisponível — preencha manualmente" (amarelo); BR (ViaCEP) inalterado
- Super Admin: SUPER_ADMIN_EMAIL com fallback 'denis.ferreira0909@gmail.com' (garante acesso mesmo em envs sem a variável, ex.: produção); JWT passa a transportar claim sa:true; menu lateral mostra "Gestão da Plataforma" logo após login
- Testes: 73 pass + 1 skip (geoapi rate-limit) na suite pytest; curls de verificação OK (sa claim, me, lookup formatado, cep unavailable)

### 2026-09-04 — Iteração 17: UX, máscaras e relatórios executivos (CONCLUÍDA)
- Nova Cobrança: NIF/CNPJ é o 1º campo com lupa (blur ou clique) → auto-preenche cliente via /api/charges/lookup-client; lupa no CEP/CP → GET /api/utils/cep-lookup (ViaCEP BR, geoapi.pt PT, cache 5min só de sucessos) preenche Rua/Localidade/Estado
- Máscaras de telefone automáticas PT (XXX XXX XXX) / BR ((XX) XXXXX-XXXX) em Telemóvel/WhatsApp, incl. dados vindos do lookup; telefones na ficha são links tel: (lib/masks.js)
- Relatórios: cabeçalho PDF executivo (só logo + nome); filtros de período (Vencimento de/até) nas 4 abas via PeriodFilter; gráficos de barras CSS para impressão (PrintBarChart) no PDF do Dashboard (antiguidade) e no Resumo Semanal (contactos por tipo); Resumo Semanal detalha cada ação (Data/Tipo/Cliente/Resumo)
- Recuperação de senha: link 'Esqueceu a sua senha?' no login → POST /api/auth/forgot-password (token secrets 32B, 1h, uso único, user_id, invalida tokens anteriores, sem enumeração) → email Resend branded → /reset-password → POST /api/auth/reset-password; Configurações: aviso 'Tamanho padrão: 400x120px (PNG transparente)' no upload de logo
- Testes: 74/74 pytest (test_iteration17.py) + 8/8 frentes frontend (iteration_7.json); nits corrigidos (máscara no lookup/tel:, tokens reset, cache CEP negativo). Nota: geoapi.pt é gratuito com limite — teste PT faz skip se rate-limited; produção intensiva deve pedir chave em geoapi.pt/request-api-key

### 2026-09-04 — Iteração 16: Consolidação final + Super Admin (CONCLUÍDA)
- Agrupamento por cliente também no Dashboard (dash-group-{i} com total + colapsar); Pendentes já agrupava
- Auto-preenchimento por NIF/CNPJ: GET /api/charges/lookup-client?nif= (admin, compara só dígitos) preenche Nome/Emails/Contactos/Bancos/Endereço no blur do campo NIF em Nova Cobrança
- Coluna "Recebimento" (paid_at) em Recebidos, no ecrã e no PDF
- Gráfico do Dashboard migrado para ResponsiveContainer (altura fixa 260px, cartão self-start, gate rAF elimina warnings width(-1))
- PDFs: estilos de impressão profissionais (th uppercase com fundo, padding maior) + cabeçalhos de valores alinhados à direita (printThRightStyle) em todas as abas e Relatórios
- WhatsApp quick button: mensagem com assinatura "— {Empresa} · Cobranpro"
- Notificações PWA locais: lib/notifications.js notifyDailyTasks (Notification API, 1x/dia por empresa) alerta promessas vencidas/a vencer hoje no Dashboard
- SUPER ADMIN: SUPER_ADMIN_EMAIL em backend/.env; GET /api/superadmin/companies + PUT /api/superadmin/companies/{id}/status {blocked}; empresa bloqueada recebe 403 "A sua conta está suspensa. Atualize o seu plano..." no login e em qualquer API; proteção contra auto-bloqueio; página /super-admin (lista de tenants, pesquisa, AlertDialog de confirmação) visível só para is_super_admin; serialize_user devolve is_super_admin
- Testes: 57/57 backend pytest + 8/8 frentes frontend (iteration_6.json); nits corrigidos (whitespace do cartão, warnings recharts, alinhamento th, window.confirm→AlertDialog, namespace notificações)

### 2026-09-03 — Deployment health check
- deployment_agent: PASS (0 findings) — envs/CORS/compilação/supervisor OK; deployment iniciado de forma assíncrona

### 2026-09-03 — Iteração 15: Branding do sistema, agrupamento, edição, Cancelados (CONCLUÍDA)
- Fix final (iteration_5.json): aging-chart com altura fixa h-[260px] no Dashboard.jsx — gráfico gigante eliminado (medido 260px vs 566px anteriores); validado por screenshot E2E no preview
- Identidade Cobranpro fixa: logo retangular oficial no header e login (/logo-rect.png), logo quadrado como favicon/apple-touch-icon/PWA (manifest.json + /logo-square.png); NÃO são afetados pela customização white label dos clientes (logo da empresa fica na sidebar/dashboard/relatórios)
- Pendentes: lista agrupada por cliente com total do grupo e expandir/colapsar (chevron)
- Edição: ChargeFormDialog ganhou modo de edição (prop charge → PUT) com 15 campos; botão "Editar" na ficha (admin)
- Timeline: registos podem ser editados (PUT /api/interactions/{id}) e apagados (DELETE) com confirmação
- Dados detalhados do cliente: whatsapp, debtor_email2, bank1, bank2, addr_rua/localidade/cp/estado — no formulário e na ficha
- Gráfico do Dashboard: BarChart com dimensões explícitas (ResizeObserver) + YAxis com domínio explícito [0, max(dataMax+1, 5)] — escala corrigida
- Nova aba "Cancelados" (status cancelada): excluída de KPIs, follow-ups e fluxo ativo; badge própria, página com pesquisa e relatório PDF; ações Cancelar/Reabrir na ficha

### 2026-09-02 — Iteração 14: Motor de Importação Universal via IA
- Backend extrai apenas o texto bruto do PDF (pdfplumber) e envia-o ao LLM (gpt-5.4 via EMERGENT_LLM_KEY, streaming) com prompt de especialista em contabilidade; resposta estritamente JSON é parseada, normalizada (datas dd/mm/aaaa↔ISO, valores PT/BR) e cria registos com buckets de atraso calculados — compatível com qualquer ERP (Bling, PHC, SAGE...) sem scripts individuais
- Parser determinístico (iteração 12) mantido como fallback automático se a IA falhar ou não encontrar faturas; resposta inclui campo "engine": "ia" | "regex"
- Dedup por nº de documento mantido no caminho de IA; import.teste validado: 3 faturas com cliente/CNPJ/valor/vencimento corretos via IA
- UI: botão mostra "A processar dados com inteligência..." durante o upload e o resultado exibe badge "Extração por IA"
- Nota: testes de import no pytest agora exercitam o caminho de IA (chave universal); fallback regex preservado

### 2026-09-02 — Iteração 13: Sistema Global de Relatórios
- Componente PrintReport reutilizável (logo/iniciais, nome, NIF/CNPJ, endereço, data de geração, rodapé Cobranpro) com CSS de impressão por classe (.print-report.print-active) — suporta múltiplos relatórios por página
- Botão "Gerar Relatório PDF" em todas as abas: Dashboard (resumo executivo com KPIs + tabela de antiguidade com cores), Pendentes e Recebidos (listagem detalhada com estado, respeita o filtro de pesquisa da aba), Em Negociação (foco em promessas de pagamento, valor acordado e observações)
- Relatórios de Gestão: novo endpoint GET /api/reports/weekly (admin only) que consolida os últimos 7 dias — contagens por tipo de contacto, cobranças recebidas e valor recuperado na semana (novo campo paid_at), acordos em negociação e lista de atividades com nome do devedor; secção "Resumo Semanal" na página Relatórios com impressão própria
- update_charge regista paid_at ao marcar como paga (limpa ao reabrir); backfill na demo (Carla Mendes)

### 2026-09-01 — Iteração 12: Reescrita definitiva do importador PDF Bling
- Algoritmo exato pedido: iteração linha a linha; linha com 'CNPJ:' (ou CPF:/NIF:) define current_client_name (texto anterior) + current_cnpj em memória; linhas com data criam fatura associada ao cliente atual; Vencimento = 2ª data da linha (fallback: 1ª); Valor = último número decimal da linha; ignora Total/Subtotal/Relatório
- Registos individuais por fatura com nome do cliente correto; compatibilidade mantida com formato plano (cliente+doc na mesma linha) e com relatórios de data única
- Testado: PDF Bling com 2 datas por linha → FAT-2001/2002/2003 com vencimento correto (2ª data) e valor correto; regressões data-única e plano PT OK
- Fix teste: bucket_assignment_on_charges passou a calcular dias em atraso dinamicamente (drift de data)

### 2026-09-01 — Iteração 11: Branding e Acabamento (consolidação para apresentação)
- White Label real: logótipo da empresa aparece no menu lateral E no topo do Dashboard (dashboard-logo); brand da app renomeada para "Cobranpro" (login, sidebar, título, EMAIL_FROM_NAME)
- Página de Login premium: wordmark "Cobranpro" com tagline, heading "Bem-vindo de volta" + mensagem de boas-vindas, versão mobile com wordmark no topo (auth-mobile-brand)
- Resumo de Atividades: GET /api/dashboard devolve recent_activities (últimas 5 interações com nome do devedor); cartão "Últimas 5 Ações" no Dashboard com ícone por tipo e hora
- Limpeza técnica: gráfico de antiguidade passou a medir o contentor via ResizeObserver e renderiza BarChart com dimensões explícitas em px (warning width(-1)/height(-1) do Recharts eliminado); removeChild mantido eliminado (translate=no + spans + refresh ao fechar + keys compostas) — revalidado pelo testing agent (0 erros DOM em 4 runs / 14 rotas)
- Logótipo demo "TF" carregado na empresa de demonstração

### 2026-09-01 — Iteração 10: Importação PDF Bling (agrupado por cliente)
- Parser pdfplumber reescrito com estado: deteta linhas de cabeçalho de cliente (Nome + CPF/CNPJ, na mesma linha ou em linhas separadas — variante Bling "Cliente: X" / "CNPJ: Y") e associa todas as linhas de fatura seguintes a esse cliente até ao próximo bloco
- Mapeamento de colunas: Nº doc. → invoice_number, Vencimento → due_date, Valor → amount (formatos PT/BR)
- Filtro: ignora linhas de Total, Subtotal, cabeçalhos de página ("Nº doc. / Vencimento / Valor") e metadados do relatório (Período/Emitido)
- Retrocompatível com o formato plano (cliente+NIF na linha da fatura); CPF_RE adicionado; dedup por invoice_number mantido
- Testado: PDF Bling com 2 clientes (header same-line e linhas separadas) → 3 faturas criadas com cliente/CNPJ/valor/vencimento corretos; 39/39 pytest

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
