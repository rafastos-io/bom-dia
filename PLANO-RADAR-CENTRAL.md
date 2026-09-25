# Plano — Radar de progresso da CENTRAL no Bom Dia (somente leitura)

> **Documento vivo.** Empreitada finita; evolução contínua pertence à nota do produto na CENTRAL.
> Projeto: `CENTRAL\Rafael\Pessoal\02 - Projetos\Bom Dia - Radar de progresso da CENTRAL.md` ·
> Decisão: `DEC-2026-09-19 - Radar de progresso somente leitura da CENTRAL no Bom Dia`.
> Desenho fechado em 19/09/2026; este plano foi montado em 21/09/2026 **sem escrever código**.
> As 5 decisões em aberto estão marcadas com **recomendação** — aprovadas em 21/09/2026.
> **Fase 2 (espelho de demandas) desenhada e aprovada em 24/09/2026** — ver a seção no fim do documento.

## Objetivo e recorte

O Bom Dia passa a **mostrar** o que a CENTRAL registra, sem nunca escrever nela:

- **Progresso:** o que andou, agrupado por dia (diário + "Última sessão" de produtos/projetos).
- **No ar:** itens abertos que não reapareceram como concluídos, os mais velhos no topo.
- **Digest matinal** (fim do MVP): ontem (progresso + aberto) + hoje (tarefas do Bom Dia + no ar antigo).

Fora do escopo: write-back, mineração de texto antigo (universo A) e sincronização bidirecional.
A **Fase 2** (abaixo) espelha automaticamente as demandas no Bom Dia; sinais de atividade
(`git log`/mtime) seguem opcionais.

## Arquitetura

```
Windows (vault local)                         VPS (Coolify)
┌──────────────────────────┐                 ┌──────────────────────────────┐
│ agent/  (Node)           │  POST /api/radar/ingest                │
│  chokidar + gray-matter  │ ───────────────▶│  Hono + Drizzle + Turso      │
│  hash + deltas           │  Bearer token   │  central_notes/central_entries│
│  backfill de metadados   │                 │  GET /api/radar (sessão)      │
└──────────────────────────┘                 └───────────────┬──────────────┘
                                                             │ SPA
                                                     /radar (React)
```

- Direção única **CENTRAL → Bom Dia**; o Obsidian segue a fonte da verdade.
- Nenhum segredo no agente: token de serviço em variável de ambiente.

## Decisões em aberto — com recomendação

### D1 · Onde vive o agente

- **Recomendação: `agent/` no próprio repositório** (`BomDia/agent/`, fora do build do server).
  Motivos: uma empreitada, um repo; tipos/contrato compartilhados por cópia explícita; o Docker
  do app ignora a pasta. Alternativa descartada: projeto separado (dois lugares para versionar e
  documentar por um agente de ~200 linhas).

### D2 · Tabela derivada e representação do "no ar"

- **Recomendação:** duas tabelas, com o "no ar" **derivado na consulta** (não em linha própria):
  - `central_notes` — `path` (PK), `title`, `tipo`, `area`, `produto`, `projeto`, `status`,
    `updated_at` (`atualizado_em`), `mtime`, `hash`, `links` (JSON), `ingested_at`, `deleted_at`.
  - `central_entries` — `id`, `note_path` (FK), `kind` (`progresso|aberto|proxima_acao|decisao`),
    `text`, `date`, `section`, `item_hash`; único por (`note_path`, `item_hash`).
- **Regra do "no ar" (determinística, sem IA):** um item `aberto`/`proxima_acao` continua no radar
  enquanto existir na **versão atual** da nota; a ingestão substitui as entradas da nota (quem sai
  do texto sai do radar). Se o mesmo texto (hash normalizado) aparecer numa nota mais nova, só a
  ocorrência mais nova conta. Nota com `status` encerrado (`concluido`, `arquivado`) deixa de
  alimentar o radar. Idade = hoje − `date`; ordena do mais velho para o mais novo.
- **Limite conhecido:** "concluído" citado em texto livre não é detectado na v1 (é a fase
  opcional com IA). O item sai quando o texto sai ou quando a nota encerra.

### D3 · Corte das views (o que alimenta cada uma)

- **Progresso** (agrupado por dia, últimos 14 dias):
  - diário: bullets de `## Foco` e `## Registro`; itens de `**Concluído:**` no `## Encerramento`.
  - produto/projeto: bullets de `## Última sessão` → `### <data> — <título>` (data do heading).
  - decisão: `## Decisão` (data = frontmatter `data`).
- **No ar** (idade, mais velhos primeiro):
  - diário: `**Aberto:**` e `**Próxima ação:**` do `## Encerramento`.
  - produto/projeto: bullets de `## Próximas ações`, `**Pendências registradas:**` e
    checkboxes `- [ ]` de `## Marcos`.
- **Digest matinal** (Hoje): reusa as duas consultas com corte de 24 h/7 dias (fase R3, opcional).

### D4 · Navegação: rota `/radar` ou painel na Hoje

- **Recomendação: rota `/radar` com item próprio no rail**, e um card-resumo na Hoje só depois do
  uso real. Motivos: o conteúdo tem volume (lista por dia + lista de pendências) e o Radar é uma
  tela "de serviço", não uma 6ª área de tarefas — assim não mexe em `AreaId`, `areaCounts` nem
  nas contagens do rail. Depois do MVP, se o uso pedir, entra o resumo na Hoje.

### D5 · Token de serviço

- **Recomendação:** `SERVICE_TOKEN` (32+ bytes aleatórios) no Coolify como **secret, runtime only**;
  header `Authorization: Bearer <token>` na rota `POST /api/radar/ingest`; comparação com
  `crypto.timingSafeEqual`; no agente, `BOMDIA_SERVICE_TOKEN` no ambiente (nunca em arquivo
  versionado). A rota continua negando sem token; `GET /api/radar` segue só com a sessão do app.
  Validação do payload: manual, no padrão atual das rotas (Zod fica fora no MVP).

## Contrato do endpoint (proposta)

```
POST /api/radar/ingest          Authorization: Bearer <SERVICE_TOKEN>
{
  "notes": [{
    "path": "Pessoal/03 - Produtos/Bom Dia.md",
    "title": "Bom Dia", "tipo": "produto", "area": "Pessoal",
    "produto": null, "projeto": null, "status": "ativo",
    "updatedAt": "2026-09-21", "mtime": "2026-09-21T13:40:00Z",
    "hash": "sha256:...", "links": ["Pessoal/02 - ..."],
    "entries": [
      { "kind": "progresso", "text": "...", "date": "2026-09-21", "section": "Registro" },
      { "kind": "aberto", "text": "...", "date": "2026-09-19", "section": "Encerramento" }
    ]
  }],
  "deleted": ["Pessoal/09 - Arquivo/Nota antiga.md"]
}
→ 200 { "notes": 1, "entries": 2, "removed": 0, "skipped": 0 }
```

- Idempotente: `hash` igual ao da última ingestão → nada muda (conta em `skipped`).
- Lote por requisição (ex.: até 50 notas / 500 entradas por vez) para não estourar o Turso.

```
GET /api/radar                  (sessão do app)
→ 200 {
  "progresso": [{ "date": "2026-09-21", "items": [{ "text": "...", "note": "Bom Dia", "kind": "progresso" }] }],
  "noAr":      [{ "text": "...", "note": "Bom Dia", "section": "Encerramento", "date": "2026-09-19", "ageDays": 2 }],
  "atualizadoEm": "2026-09-21T13:45:00Z"
}
```

## Fases

### R0 — Aprovação e token (sem código)
- [ ] Rafael confirma as 5 decisões (D1–D5) e cadastra `SERVICE_TOKEN` no Coolify (runtime only).

### R1 — Servidor (uma sessão) ✅ concluída (21/09)
- [x] Migração idempotente: `central_notes` + `central_entries` (+ índices por `date` e `kind`)
- [x] `POST /api/radar/ingest` com Bearer + `timingSafeEqual`, lote, idempotência por hash do
      conteúdo extraído, remoção de notas em `deleted`
- [x] `GET /api/radar` (sessão) com "progresso por dia" (14 dias) e "no ar" derivado
- [x] Testes: 401 sem token/sessão, token errado 401, ingest idempotente, entradas inválidas
      descartadas, nota atual substitui entradas, nota removida, nota encerrada fora do "no ar",
      ordenação por idade, lote grande rejeitado — **10 testes novos, 44/44 no server**

Publicado em `dd670da` (21/09/2026): deploy `finished`, `/health` ok, `POST /api/radar/ingest` e
`GET /api/radar` respondem 401 sem credencial; a ingestão real depende do `SERVICE_TOKEN` (R0).

### R2 — Agente local (uma sessão) ✅ concluída (21/09)
- [x] `agent/` em Node: `chokidar` + `gray-matter`, debounce (2 s), hash do conteúdo extraído
      e estado local (`agent/.state.json`, gitignored) para enviar só deltas
- [x] Parser por tipo de nota com fixtures (diário, produto, projeto, decisão) — 5 testes
- [x] `backfill` (reenvio forçado), `once` (deltas) e `watch` (tempo real) como comandos
- [x] Revarredura periódica (15 min) e `deleted` para notas removidas/renomeadas
- [x] `run-forever.cmd` + instruções `schtasks` no `agent/README.md`; `.env.example` próprio
- [ ] Ativar a tarefa agendada no Windows (depende do `SERVICE_TOKEN` no Coolify — Rafael)

Publicado em `7844f44` (21/09/2026). Verificação real: `summary` no vault → **287 arquivos,
1.472 entradas** (1.123 progresso, 187 aberto, 96 próxima ação, 66 decisão); ponta a ponta contra
um servidor local (banco de teste) → `once` enviou 287 notas, a segunda passada mandou **0**
(idempotência) e o `GET /api/radar` devolveu **12 dias / 614 itens** de progresso e **151 itens
no ar** (mais velho com 19 dias). Nota: nada foi enviado à produção ainda.

### R3 — Front (uma sessão) ✅ concluída (21/09)
- [x] Rota `/radar` + item próprio no rail (fora de `AREAS`/contagens; 6º item na tab bar mobile)
- [x] Views **Progresso** (por dia, 14 dias, dia atual aberto) e **No ar** (mais velhos primeiro,
      com idade e tom por faixa), via `Panel`/`ScreenHeader`/`Segmented`/`EmptyState` do app
- [x] Estados: carregando (skeleton), erro com retry, vazio ("nada no ar") e **sem sincronização**
      ("o agente ainda não sincronizou a CENTRAL")
- [x] Volume real tratado: dia recolhível, `line-clamp-3` no texto com tooltip, "ver os outros N"
      por dia e paginação de 20 em 20 no "No ar"
- [ ] (Fim do MVP) card-resumo na Hoje se o uso pedir

Publicado em `da7ed35` (21/09/2026): auditoria do DS **0/0** na rota `/radar` (2 temas,
390/768/1024/1440 px, sessão real), console limpo e capturas em `artifacts/screens-radar/`
(5 PNGs: progresso e no ar, claro/escuro, desktop e mobile). Em produção a página abre no estado
"agente ainda não sincronizou" até o `SERVICE_TOKEN` existir.

### R4 — Verificação e publicação ✅ ligado em produção (21/09)
- [x] `typecheck`/`lint`/`build` verdes; auditoria 0/0; capturas conferidas
- [x] Deploy pela `main` (`da7ed35`), `/health` ok e bundle novo servido
- [x] `SERVICE_TOKEN` e `AUTH_SECRET` no Coolify (produção + preview, runtime only) — o save da UI
      não persistia; cadastradas via Eloquent dentro do container e aplicadas com Redeploy
- [x] Backfill real: **288 notas / 1.483 entradas**; reexecução forçada devolveu `skipped=288`
      (idempotente)
- [x] Agente rodando no Windows: wrapper `run-forever.cmd` destacado + atalho na pasta Startup
      (sem admin; `schtasks` exigia elevação)
- [ ] Usar por 2–3 dias e ajustar ruído/gosto da tela

Evidências de 21/09/2026: `POST /api/radar/ingest` respondendo 200 com o token real, log do container
sem o aviso de `AUTH_SECRET` e sem erro de migração. Nota operacional: o Kaspersky Premium acusou
falso positivo (detecção comportamental PDM) contra o binário do opencode — assinatura digital válida
da Anomaly Innovations; o caminho ficou fora do escaneamento.

## Fase 2 — Espelho de demandas (aprovada em 24/09/2026)

> Substitui a promoção manual ("um clique") pela regra de **espelho automático**: o que está na
> CENTRAL como pendência vira demanda no Bom Dia, e a atualização da nota atualiza a demanda.
> Direção única CENTRAL → Bom Dia; **nada escreve no vault**.

### Decisões fechadas com Rafael (24/09/2026)

- **D6 · Espelho automático.** Itens `aberto`/`proxima_acao` de notas ativas de produto/projeto viram
  tarefas do Bom Dia; mudanças na CENTRAL criam, atualizam, fecham e reabrem as tarefas. Sem clique.
- **D7 · Projeto por nota.** Cada nota ativa `produto`/`projeto` vira um projeto do Bom Dia (flat),
  identificado por `central_note` (path da nota). Produto e projeto da empreitada aparecem os dois;
  empreitada concluída → projeto arquivado.
- **D8 · Hierarquia.** Fontes de tarefa: "Próximas ações", "Estado atual → Próxima ação",
  "Marcos `- [ ]`", "Última sessão (só a mais recente) → **Pendências**/**Próxima ação**" e
  `**Pendências registradas:**`. Um *assembler* por similaridade junta paráfrases: o candidato mais
  específico vira a tarefa e os parecidos (ex.: o mesmo marco) viram **subtarefas**, não tarefas novas.
- **D9 · Diário e decisões.** O diário não cria tarefa; `**Concluído:**` fecha a tarefa
  correspondente ou cria uma tarefa concluída. Notas `decisao` viram tarefas **concluídas** (data do
  frontmatter; backfill com janela de 60 dias, ajustável).
- **D10 · Campos.** A CENTRAL manda em título, status e conclusão; o Bom Dia manda em prazo,
  prioridade, estimativa, subtarefas locais, envolvidos e anotações. Subtarefas vindas da CENTRAL são
  substituídas; as locais, preservadas.
- **D11 · Links.** Wikilinks/URLs do item viram links (`nota`/`web`); `repositorio` e `caminho_local`
  da nota viram links do projeto (grupos "CENTRAL" e "Código"). Requer kind `nota` no app e suporte a
  `obsidian://` (F2 do front).

### Regras determinísticas (F1)

- Entrada sumiu da nota → fecha a tarefa vinculada (`completed_at` = `atualizado_em` da nota), com
  selo "fechada pela CENTRAL"; entrada reaparece → reabre.
- Texto mudou com similaridade ≥ limiar (mesma nota, mesmo kind ou compatível) → mesma tarefa,
  atualiza título/descrição; sem similaridade → fecha a antiga e cria a nova.
- Nota encerrada/arquivada/removida → fecha as tarefas vinculadas; status volta a ativo → reabre as
  que ainda existem.
- **Reconcile:** a ingestão pula notas inalteradas, então um `POST /api/radar/reconcile` (Bearer)
  reconstrói o espelho a partir das tabelas derivadas; o `agent backfill` passa a chamar
  ingest + reconcile.

### Volume medido (24/09/2026, escopo ativo)

- 26 notas ativas (16 produtos, 10 projetos) → 26 projetos; 20 com `caminho_local`, 17 com `repositorio`.
- 142 candidatos: 40 "Próximas ações", 37 Marcos, 10 "Estado atual", 24 "Última sessão", 33 do diário
  (fora da criação). ~110 tarefas abertas no backfill + decisões recentes concluídas.
- Itens com wikilink: 6; com URL: 3; texto médio 96 caracteres.
- Subtarefas aninhadas praticamente não existem (4 casos em 307 arquivos) — a convenção entra nos
  templates da CENTRAL.

### Fases

- **F1 — dados (servidor + agente).** ✅ implementada em 24/09/2026 (working tree, **não publicada**):
  migração `central_task_links` + `projects.central_note`; payload com `scope`, `repositorio`,
  `caminhoLocal` e `subtasks`; parser do agente ("Estado atual", sessão mais recente, sub-bullets,
  hash); diff na ingestão; assembler por similaridade; espelho no ingest + `POST /api/radar/reconcile`;
  agente com `reconcile` e ordem produto/projeto → diário → decisão.
  Verificações: `typecheck`/`lint`/`build` verdes; **52/52 testes** do server e **8/8** do agente;
  ponta a ponta local contra o vault real (296 notas / 1.685 entradas) → **27 projetos**,
  **97 tarefas abertas**, 101 concluídas (83 decisões com projeto + 18 `Concluído` do diário sem
  projeto), **29 subtarefas** fundidas, zero títulos duplicados; segunda passada forçada e `reconcile`
  sem novidades (idempotente). **Publicada em 24/09/2026** (`c0e41ee`, deploy `finished`; rota
  `reconcile` negando sem token, container sem erro) e o backfill real rodou em produção
  (**27 projetos, 197 tarefas, 31 subtarefas**); `once` e `reconcile` seguintes sem novidades.
  **Grupo macro (24/09/2026):** `projects.grupo` espelhado do `area` da nota (vazio preserva o
  local), tela Projetos em seções colapsáveis por grupo (ordem dos 5 + extras + "Sem grupo") e
  grupo visível no detalhe/arquivados — publicado em `06909d4`; reconcile preencheu os 27.
  **Legados direcionados (24/09/2026):** os 4 projetos antigos que ficavam em "Sem grupo" ganharam
  grupo (Grupo Urban, FREELAS→Freelancers) e os duplicados foram fundidos e arquivados
  (Market Center→MarketCenter; Estúdio FR3D→Produção personalizada do Estudio FR3D) — zero
  projetos sem grupo. **Grupo editável no diálogo do projeto** e na API (`045d256`); nos espelhados
  a área da nota continua mandando.
- **F2 — app.** ✅ F2a publicada em 24/09/2026: vínculo da CENTRAL exposto no `GET /api/tasks`
  (nota, título, estado e seção), **selo "CENTRAL"** na tabela que abre a nota no Obsidian
  (`obsidian://`, kind `nota` no app e na API), link "Nota na CENTRAL" no projeto e wikilinks dos
  itens viram links de nota (reconcile completa sem duplicar; corrigido também o delete dos links
  gerenciados que duplicava `Código`).
  ✅ **F2b publicada em 24/09/2026**: filtros por **origem** (Da CENTRAL / Manuais) e por **grupo**
  na barra de views (persistidos por área) e **fila de revisões** na página Radar — divergências
  (concluída local × aberta na CENTRAL, com reabrir/manter), tarefas **sem projeto** (select para
  amarrar) e **fechadas pela CENTRAL** (reabrir), com `GET /api/radar/revisoes` e
  `POST /api/radar/revisoes/divergente`. Em produção: 0 divergências, 19 sem projeto e 6 fechadas
  para revisar. Pendente da F2: matching com IA (fica para depois).
- **F3 — relatórios.** ✅ publicada em 24/09/2026: a **Revisão da semana** passou a mostrar o fluxo
  por **origem** (Da CENTRAL × Manuais: criadas/concluídas) e as **abertas por grupo** (via projeto),
  sobre todas as demandas; a F2a/F2b já entregaram selos, filtros e a fila.
- **F4 — atividade sem registro.** ✅ publicada em 24/09/2026: o agente lê o **último commit** dos
  `caminho_local` (produto/projeto ativos, runner com timeout de 8 s) e envia por
  `POST /api/radar/activity` (Bearer); o Radar ganhou o painel **Atividade sem registro** (com abrir
  nota e dispensar) quando o repositório andou depois da última atualização da nota (`activity_at >
  atualizado_em`, dia a dia). Em produção: 18 repositórios lidos, 3 sem registro para revisar.
- **Evolução opcional — matching com IA.** Paráfrases de "concluído" em texto livre (uma linha de
  sessão que fecha uma demanda semelhante) podem ser sugeridas pela IA do servidor e confirmadas na
  fila de revisões; nunca automático. Avaliar depois de um período de uso.

### Fase opcional (depois)
- [ ] Sinais de atividade sem registro (`git log`/mtime dos `caminho_local`).

## Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Parser quebra quando uma seção muda | Fixtures reais por tipo + teste unitário; radar vazio é visível na tela |
| Obsidian escrevendo durante o watch | Debounce + leitura tolerante + revarredura periódica |
| Token de serviço vazando | Só no ambiente (agente e Coolify); nunca no repo; log sem token |
| Payload grande por lote | Lotes de 50 notas/500 entradas; ingestão idempotente re-executável |
| Itens "no ar" zumbis | Nota atual substitui entradas; nota encerrada deixa de alimentar |
| Vault renomeado/movido | `deleted` por deltas + backfill re-executável |
