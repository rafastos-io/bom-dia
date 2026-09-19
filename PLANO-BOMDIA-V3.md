# Plano completo — Bom Dia v3 · VPS-only · stack TypeScript · visual novo

> **Documento vivo.** Atualizado ao fim de cada fase com checkboxes. Nenhuma fase começa
> sem o relatório da anterior: **(1)** explicação, **(2)** evidências, **(3)** este plano
> atualizado, **(4)** riscos/pendências e próxima ação.

## Decisões fechadas (17/09/2026)

- Modo local morre: sem bandeja, `.bat/.vbs`, porta 9463, `/api/open` e pastas do Explorer.
- Stack: TS ponta a ponta. Front: React 19 + Vite 8 + Tailwind 4 + `@rafastos/ui`.
  Back: Node + **Hono** + **Drizzle**. Banco: **Turso/libSQL** (conta pessoal do Rafael).
- Visual: mockups `FINAL - DESKTOP LIGHT` (23 telas) + dark derivado do DS; rail Lucide,
  5 áreas, kanban 3 colunas, sem horários, busca `⌘K`, sem sino.
- Rafael para de usar durante a obra → dados congelados, importação final limpa.
- Deploy/cutover só com autorização explícita.

## Arquitetura alvo

```
BomDia/
├─ web/         SPA React (Vite) — dist/ servido pelo server
├─ server/      API Hono (TS) — /api/*, /login, /health, estáticos
├─ migration/   importador SQLite → Turso (dry-run, relatório, re-executável)
├─ Dockerfile   multi-stage: web build → server build → runtime node:22-slim
└─ PLANO-BOMDIA-V3.md   este plano
Pós-cutover: Python, tray e UI legada removidos; bomdia.db arquivado (rollback)
```

## Stack e dependências

| Camada | Escolha |
|---|---|
| Server | Hono + `@hono/node-server`, Zod, sessão HMAC em cookie |
| DB | Drizzle ORM + `@libsql/client` (Turso prod / arquivo libSQL em dev e testes) |
| Arquivos | Cloudflare R2 via S3 (`aws4fetch`), proxy de download autenticado |
| IA | OpenAI server-side (parse, perguntas, revisão, WhatsApp) — prompts portados |
| Front | `web/` atual + primitivos locais em `web/src/components/app/` |
| Testes | Vitest (unit + rotas em libSQL local) · Playwright (e2e + capturas) |

## Contrato da API (congelado)

`GET/PUT/DELETE /api/tasks{,/{id},/{id}/feito}` · `PUT /api/subtasks/{id}` ·
`POST/PUT/DELETE /api/projects{,/{id}}` · `/api/projects/{id}/notes` ·
`/api/attachments` (+`/{id}/download`) · `GET /api/ai/status` ·
`POST /api/ai/{config,parse,whatsapp}` · `GET/POST /login` · `POST /logout` · `GET /health`.
Só adições. `/api/open` removido.

## Schema (Drizzle espelhando o SQLite atual)

`tasks`(id,title,requested_by,send_to,due_date,priority,description,status,created_at,tipo,projeto,recorrencia,feito_em) ·
`links` · `subtasks` · `projects` · `project_links`(+grupo) · `project_notes` · `idea_links` ·
`attachments` · **novo** `settings`. Ids preservados na importação.

## Fases

### F0 — Fundação ✅ concluída (17/09)
- [x] `opencode.json` anti-travamento (allow no projeto; deny push/PR/ssh/deploy/`rm -rf`/pasta da VPS)
- [x] `PLANO-BOMDIA-V3.md` no repo (este documento)
- [x] Root `package.json` com scripts (sem workspaces — evita hoisting quebrar `@source`/tarball do web)
- [x] Esqueleto `server/` (Hono + TS + ESLint + Vitest) com `/health` — typecheck/lint/build verdes
- [x] Dockerfile multi-stage v3 + `.dockerignore`
- [x] Assets Runway: 6 poses do mascote + 2 ilustrações (PNG com alfa real), manifesto em
      `web/public/brand/generated-assets.json`; avatar reutilizado no header de revisão

### F1 — Backend Hono/Drizzle (paridade total) ✅ concluída (18/09)
- [x] Schema Drizzle + migrações + `settings`
- [x] Middlewares: sessão HMAC, JSON, erros, estáticos da SPA (fallback de rota)
- [x] Auth: `POST /login`, `POST /logout`, cookie `HttpOnly/SameSite/Secure`, rate-limit
- [x] Rotas do contrato + regras portadas (recorrência com semana ISO, `build_gaps`, hierarquia
      de ideias, projeto oculto, limpeza de anexos no delete)
- [x] R2 (upload/download/delete) e IA (status/config/parse/whatsapp)
- [x] Vitest: 16 testes (recorrência, gaps, auth, tasks, projetos, notas, IA sem chave)

### F2 — Importador de dados ✅ concluída (18/09)
- [x] `server/scripts/import-sqlite.ts`: dry-run com contagens, ids preservados, idempotente
- [x] `config.json` → `settings` (chave nunca importada se vier de env)
- [x] Validação: contagens 1:1 + integridade referencial sem órfãos + API nova servindo
      os 39 tasks/7 projetos reais da cópia
- [x] **Importação real no Turso** (`bomdia-rafastos-io.aws-us-east-1`): 39 tasks, 60 links,
      72 subtasks, 7 projetos, 21 project_links, 1 idea_link — 1:1, sem órfãos

### F3 — Front: fundação visual + login ✅ concluída (18/09)
- [x] Tokens do mockup (claro) + dark derivado em `web/src/styles/app-theme.css`
- [x] Primitivos em `web/src/components/app/`: ScreenHeader, Panel, Chip, Dot (+tom por chave),
      Segmented, EmptyState, Mascot/Illustration, SearchField, `lib/utils.ts` (cn)
- [x] **Login React** split-screen com mascote, sessão/erro, sem recursos falsos
- [x] Shell novo: rail escuro só de ícones (Lucide) com contador, topbar com busca `⌘K`,
      avatar do mascote, tab bar mobile mantida

### F4 — Front: áreas ✅ concluída (18/09)
- [x] Hoje: hero com saudação/data + foco do dia + próximo compromisso + "Ver todas"; cards/lista
      (tabela com segmentos Ontem/Hoje/Amanhã)/kanban 3 colunas
- [x] Agenda: calendário em painel + rail "Próximos" (blocos de data) + "Sem data" com mascote
- [x] Rotina: cards de cadência/período com check do período; kanban e lista preservados
- [x] Ideias: composer com "Salvar ideia" (+ atalho ⌘Enter) e empty com mascote
- [x] Projetos: grid com tile colorido, progresso, links e pessoas; "Ocultos" com ilustração;
      central com stats (abertas/concluídas), abas e ações contextuais
- [x] Itens de tarefa, kanban e toolbar reestilizados na linguagem nova

### F5 — Front: popups ✅ concluída (18/09)
- [x] Modais opacos no tema do app (override de `--rf-glass-bg`) e mascotes aplicados
- [x] Tarefa nova/editar: header com subtítulo, labels em rf-caption, dica violeta
      "Dica do Bom Dia", mascote joinha no rodapé; subtarefas/links/vínculos/anexos mantidos
- [x] Poohzera: avatar da IA no header, setup centralizado ("Ativar Poohzera"), chat com
      "Organizar com Poohzera", perguntas/revisão em cards; **datalist de projetos corrigido**
      (bug do inventário) e botão "Criar N itens"
- [x] WhatsApp: layout do mockup (mascote phone/pockets + balão, opções com estado selecionado,
      contador 2000, copiar)
- [x] Ajustes: avatar, **tema Claro/Escuro/Sistema** (novo modo "system") e card da Poohzera
- [x] Projeto: labels padronizados
- [ ] Pendente fino: substituir `window.confirm/prompt` por diálogo do DS e bottom-sheet nos
      demais popups no mobile (entra no polimento F6)

### F6 — Dark + mobile + a11y ✅ concluída (18/09)
- [x] Tema escuro derivado conferido nas 5 áreas (capturas) e mobile 390 px (hoje/projetos)
- [x] **Auditoria automática do DS: 0 estouros e 0 falhas de contraste** nas rotas
      `/`, `/agenda`, `/rotina`, `/ideias`, `/projetos`, nos 2 temas, 390–1440 px
- [x] Correções de contraste: badge do rail, violeta da IA no escuro, muted do claro,
      chips de link/projeto
- [x] 320–1440 px sem rolagem lateral; foco visível e `reduced-*` (herdados do DS)

### F7 — Verificação e aprovação ✅ pronta para sua revisão (18/09)
- [x] `typecheck`/`lint`/`build` do web e do server verdes; **16/16 testes** do server
- [x] Fluxos exercitados via Playwright (login, áreas, tabela, popups, Poohzera com IA mockada)
- [x] **Pacote de capturas em `artifacts/screens-v3/` (+ `.zip`)**: desktop claro, dark, mobile
      e popups (30 PNGs)
- [ ] **Aguardando aprovação de Rafael** para o cutover (F8)

### F8 — Cutover e limpeza ✅ concluída (18–19/09)
- [x] Import no Turso 1:1 e sem órfãos (dados congelados desde então)
- [x] `TURSO_*` cadastradas no Coolify (via model, criptografadas) e deploy da `main`
      (`1377df9` + fix do healthcheck `cc1936f`)
- [x] Validação: container **healthy**, `/health` v3, `/login` 200, `/api/tasks` 401 sem sessão,
      bundle servido; captura `screens-v3/producao-login-v3.png`
- [x] Docs v3 (`README.md`, `DEPLOY.md`) e CENTRAL atualizados
- [x] Legado removido do repositório e arquivado em
      `C:\Users\rafaa\VIBECODING\BomDia-legacy\` (código Python/UI antiga, bandeja e bancos
      SQLite com `bomdia.db`)
- [x] Pendências finas pós-cutover: confirmações nativas → **diálogo do DS**
      (`ConfirmProvider`) e **bottom-sheet universal** no mobile (`AppDialog`) — deploy `c25aae6`
- [x] VPS reiniciada (atualizações de segurança pendentes, autorizado por Rafael em 18/09):
      todos os 13 containers `OK`, Horizon/webhook autorreparo `OK`, bomdia e DS em HTTP 200
- [ ] Backup semanal Turso → R2 (próximo)
- [ ] Rotacionar a chave Runway usada na geração dos assets (manual, quando quiser)

## Protocolo de acompanhamento

Ao concluir cada fase: explicação → evidências → plano atualizado com checks → riscos e
próxima ação. Sem isso, não inicia a fase seguinte (exceto F8, que depende de autorização).

## Segurança e backup

Segredos só no Coolify (`TURSO_*`, `AUTH_*`, `OPENAI_API_KEY`, `R2_*`). Chaves passadas no
chat: uso em memória, rotação recomendada ao fim. Backup: PITR do Turso + export semanal ao R2.

## Riscos e planos B

| Risco | Mitigação |
|---|---|
| Import divergente | dry-run + contagens + ids preservados |
| Turso (latência/limites) | medir; trocar por Postgres na VPS (mesmo Drizzle) |
| Escopo grande | fases pequenas com critério de pronto e relatório |
| Assets Runway | primeiras gerações revisadas antes de espalhar na UI |
| Cutover | dados congelados + subdomínio de validação + rollback |

## Registro de fases concluídas
- **F0 — Fundação (17/09/2026)** · Criados: `opencode.json`, `PLANO-BOMDIA-V3.md`,
  `package.json` raiz, `server/` (Hono + TS + ESLint + Vitest, rota `/health`),
  `Dockerfile` v3 multi-stage, `.dockerignore`, `web/scripts/runway-mascot.mjs` e
  8 assets do mascote/ilustrações em `web/public/brand/` (PNG com transparência real).
  Evidências: `npm run typecheck|lint|build` do server verdes; `/health` respondeu
  `{"ok":true,...}`; alfa=0 conferido nos 8 PNGs; manifesto de proveniência completo.
  Imprevistos: (1) `gpt_image_2` não aceita `1024:1024` — quadrado válido é `1920:1920`;
  (2) TLS da máquina é interceptado (AV/firewall) — o script precisa rodar com
  `node --use-system-ca`; (3) duas tarefas ficaram na fila além do timeout do shell e
  foram resgatadas por task id. Decisão: sem npm workspaces (evita hoisting e mantém
  `@source`/tarball do `web/` intactos). Pendência: rotacionar a chave Runway usada.
  Próximo: F1 — backend Hono/Drizzle com paridade total.
- **F1 — Backend Hono/Drizzle (18/09/2026)** · Portadas todas as rotas e regras do Python para
  `server/` (Hono + Drizzle + libSQL): auth com rate-limit, tasks/subtasks/rotinas (semana ISO),
  projetos (rename propaga), notas, anexos R2, IA (parse com gaps por tipo + WhatsApp).
  Evidências: `typecheck`, `lint`, `build` e **16/16 testes** verdes; smoke HTTP completo
  (health público, 401 sem sessão, login 302 + cookie, CRUD, SPA `/agenda` 200, 404 real).
  Imprevistos: (1) drizzle/libSQL quebra em `.get()` sem linhas — contornado no cliente com
  proxy para `.all()[0]`; (2) `serveStatic` do @hono/node-server não permite responder no
  `onNotFound` — trocado por estático próprio com MIME e fallback da SPA.
- **F2 — Importador (18/09/2026, local)** · `server/scripts/import-sqlite.ts` com dry-run,
  ids preservados, re-executável, relatório e checagem de órfãos. Evidências: dry-run e
  import real na cópia do banco com contagens 1:1 (39 tasks, 60 links, 72 subtasks, 7 projetos,
  21 project_links, 1 idea_link) e a API nova servindo os dados reais (39 tasks e 7 projetos
  via HTTP). Desvio do plano: o importador ficou em `server/scripts/` (sem npm workspaces).
  Pendente: chaves do Turso (conta pessoal de Rafael) para criar `bomdia`/`bomdia-dev` e
  rodar a importação real. Próximo: F3 — fundação visual + login React.
- **F2 (conclusão, 18/09/2026)** · Importação real no Turso `bomdia-rafastos-io.aws-us-east-1`
  concluída com as chaves da conta pessoal de Rafael (usadas só em memória): todas as tabelas
  1:1 e sem órfãos; `settings` recebeu `name`, `model` e a chave OpenAI (o env ainda tem
  prioridade em produção). Próximo: F3 — fundação visual + login React.
- **F3 — Fundação visual + login (18/09/2026)** · Camada de tema própria (`app-theme.css`)
  sobrepondo `--rf-*` com a paleta dos mockups (claro + dark derivado), primitivos do app,
  **login React** split-screen e shell novo (rail escuro + topbar com busca `⌘K` + avatar).
  Evidências: `typecheck/lint/build` do web verdes; capturas reais nos 2 temas com dados do
  Turso (39 tasks) e fluxo de login completo no Playwright. Imprevistos corrigidos:
  (1) o `OverlayProvider` global buscava dados no `/login` e o handler de 401 recarregava a
  página em loop — provider movido para dentro do shell e redirect com guarda;
  (2) `listTasks`/`listProjects` faziam N+1 contra o Turso remoto (timeout de ~10 s) —
  agora 6 queries em lote (~1,1 s a frio). Próximo: F4 — as áreas no padrão novo.
- **F4 — Áreas no padrão novo (18/09/2026)** · Hoje reconstruído (hero com data, "Seu foco hoje",
  "Próximo compromisso", "Ver todas", tabela segmentada Ontem/Hoje/Amanhã na visão de lista,
  kanban 3 colunas), Agenda (calendário em painel + rail Próximos + Sem data com mascote),
  Rotina (card de cadência/período), Ideias (composer + empty com mascote) e Projetos (grid com
  progresso/pessoas, Ocultos com ilustração, central com stats e abas). Evidências: `typecheck`,
  `lint` e `build` verdes; capturas reais nos 2 temas contra o Turso com os dados reais.
  Pendências finas: painéis de Anotações/Links/Anexos herdam os tokens novos (redesenho de
  detalhe junto da F5); visão (cards/lista/kanban) segue global entre áreas — revisão na F6.
  Próximo: F5 — popups (tarefa, Poohzera, WhatsApp, Ajustes, projeto).
- **F5 — Popups no padrão novo (18/09/2026)** · Modais passaram a ser opacos (override de
  `--rf-glass-bg`), e cada popup ganhou a linguagem dos mockups: Tarefa (subtítulo, dica violeta,
  mascote joinha), Poohzera (avatar da IA, setup "Ativar Poohzera", chat, perguntas/revisão),
  WhatsApp (mascote + balão, opções com estado, contador), Ajustes (avatar + tema
  Claro/Escuro/**Sistema** + card da Poohzera) e Projeto. Corrigido no caminho: **datalist de
  projetos da revisão do Poohzera** (apontava para um id inexistente) e modo "system" real no
  provider de tema (com `useSyncExternalStore`). Evidências: `typecheck/lint/build` verdes e
  capturas dos 8 popups no tema claro com dados reais. Pendente fino: confirmações nativas e
  bottom-sheet universal no mobile — entram no polimento F6. Próximo: F6 — dark/mobile/a11y.
- **F6 — Dark, mobile e a11y (18/09/2026)** · Tema escuro conferido por capturas nas 5 áreas e
  mobile a 390 px; **auditoria automática do DS rodou contra o app com sessão injetada e deu
  0/0** (0 estouros de layout, 0 falhas de contraste) em `/`, `/agenda`, `/rotina`, `/ideias`,
  `/projetos`, nos dois temas, 390/768/1024/1440 px. Correções feitas a partir da auditoria:
  badge do rail (ação neutra), violeta da IA mais claro no escuro, muted do claro mais escuro
  e chips de link/projeto com texto forte. Bucket do Turso em us-east segue como único ponto de
  latência (~1 s a frio) — aceitável, com plano B de Postgres na VPS documentado.
- **F7 — Verificação e aprovação (18/09/2026)** · `typecheck/lint/build` verdes no web e no
  server; 16/16 testes; fluxos exercitados por Playwright (login, 5 áreas, tabela segmentada,
  popups, Poohzera com IA mockada). Pacote de aprovação em `artifacts/screens-v3/` (+ zip) com
  30 capturas: desktop claro, dark, mobile e popups. **Aguardando o OK de Rafael para o cutover.**
  Pendências finas registradas: confirmações nativas → diálogo do DS e bottom-sheet universal.
- **F8 — Cutover (18/09/2026)** · Rafael aprovou o pacote de capturas; a `main` recebeu o v3 em
  `1377df9` e o fix de healthcheck em `cc1936f`. O Coolify publicou (Horizon + webhook OK) e a
  produção passou a servir o app novo: `/health` v3, `/login` 200, `/api/tasks` 401 sem sessão,
  container **healthy**, dados 1:1 no Turso. Imprevistos resolvidos no caminho: o healthcheck
  padrão do Coolify exige `curl` (adicionado ao runtime) e as variáveis `TURSO_*` foram
  cadastradas via model do Coolify (valores criptografados pela própria aplicação). Legado
  Python/UI antiga segue no repositório como rollback; remoção e arquivamento do `bomdia.db`
  ficam para depois do monitoramento, junto das pendências finas.
- **F8 — Complementos (18–19/09/2026)** · Legado arquivado em `C:\Users\rafaa\VIBECODING\BomDia-legacy\`
  (código, bandeja e bancos) e removido do repositório; `.env.example` refeito para a v3.
  Pendências finas implementadas e publicadas em `c25aae6`: **ConfirmProvider** (confirmações e
  entrada de texto no padrão do DS, substituindo `window.confirm/prompt` em 7 pontos) e
  **AppDialog** (Ajustes, Projeto, WhatsApp e Poohzera viram bottom-sheet <=619px). VPS reiniciada
  com autorização de Rafael: 13 containers `OK`, Horizon/webhook `OK`, bomdia e Design System em
  HTTP 200. Restam: backup semanal Turso → R2 e rotação da chave Runway.
- **Extras do DS — gráficos e animações (18/09/2026)** · Instalado `recharts@3` (peer do pacote) e
  trazidos os elementos de **chart** (`ChartContainer`/`ChartTooltip`) com dados reais: KPIs na
  Hoje (ativas/atrasadas/concluídas/alta prioridade), "Prazos dos próximos 7 dias",
  "Status das demandas" (donut) e "Carga por projeto" (barras por projeto, na página Projetos).
  **Movimento** com os tokens do DS espelhados em `web/src/lib/motion.ts`: transição de rota no
  shell e entrada escalonada dos cards, sempre com `useReducedMotion`. Auditoria do DS
  **0/0** de novo (as rodadas intermediárias acharam e corrigiram: rolagem lateral na Agenda a
  390 px por `min-width:auto` na cadeia + lista "Próximos", e o verde do "Feito" da Rotina).
  Tudo local, aguardando autorização para publicar.
