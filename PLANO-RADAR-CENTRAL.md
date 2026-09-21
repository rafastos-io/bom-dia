# Plano — Radar de progresso da CENTRAL no Bom Dia (somente leitura)

> **Documento vivo.** Empreitada finita; evolução contínua pertence à nota do produto na CENTRAL.
> Projeto: `CENTRAL\Rafael\Pessoal\02 - Projetos\Bom Dia - Radar de progresso da CENTRAL.md` ·
> Decisão: `DEC-2026-09-19 - Radar de progresso somente leitura da CENTRAL no Bom Dia`.
> Desenho fechado em 19/09/2026; este plano foi montado em 21/09/2026 **sem escrever código**.
> As 5 decisões em aberto estão marcadas com **recomendação** — aguardando o OK de Rafael.

## Objetivo e recorte

O Bom Dia passa a **mostrar** o que a CENTRAL registra, sem nunca escrever nela:

- **Progresso:** o que andou, agrupado por dia (diário + "Última sessão" de produtos/projetos).
- **No ar:** itens abertos que não reapareceram como concluídos, os mais velhos no topo.
- **Digest matinal** (fim do MVP): ontem (progresso + aberto) + hoje (tarefas do Bom Dia + no ar antigo).

Fora do escopo: write-back, mineração de texto antigo (universo A), sincronização bidirecional,
e — na primeira versão — sinais de atividade (`git log`/mtime) e promoção de item para tarefa.

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

### R3 — Front (uma sessão)
- [ ] Rota `/radar` + item no rail (ícone Lucide próprio; fora de `AREAS`/contagens).
- [ ] Tela com as views **Progresso** (agrupado por dia) e **No ar** (idade), seguindo
      `Panel`/`ScreenHeader`/`EmptyState` e os tokens do DS.
- [ ] Estados: carregando, erro, vazio ("nada no ar — bom sinal").
- [ ] (Fim do MVP) card-resumo na Hoje se o uso pedir.
- [ ] Volume real medido no backfill (21/09): 614 itens de progresso em 12 dias e 151 no ar —
      agrupar por dia com recolhimento e limitar a lista inicial.

### R4 — Verificação e publicação
- [ ] `typecheck`/`lint`/`test` verdes; auditoria DS 0/0 nos 2 temas (390–1440 px); capturas.
- [ ] Deploy pela `main`; token no Coolify; agente rodando na máquina de Rafael.
- [ ] Uso real por 2–3 dias e ajuste de ruído/gosto.

### Fase opcional (depois do MVP)
- [ ] Sinais de atividade sem registro (`git log`/mtime dos `caminho_local`).
- [ ] Promoção de item "no ar" para tarefa/ideia com um clique (revisão do Poohzera).

## Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Parser quebra quando uma seção muda | Fixtures reais por tipo + teste unitário; radar vazio é visível na tela |
| Obsidian escrevendo durante o watch | Debounce + leitura tolerante + revarredura periódica |
| Token de serviço vazando | Só no ambiente (agente e Coolify); nunca no repo; log sem token |
| Payload grande por lote | Lotes de 50 notas/500 entradas; ingestão idempotente re-executável |
| Itens "no ar" zumbis | Nota atual substitui entradas; nota encerrada deixa de alimentar |
| Vault renomeado/movido | `deleted` por deltas + backfill re-executável |
