import assert from "node:assert/strict"
import { test } from "node:test"
import { parseNote } from "../src/parse.js"

const DIARIO = `---
tipo: diario
status: ativo
data: 2026-09-21
criado_em: 2026-09-21
atualizado_em: 2026-09-21
---

# 2026-09-21

## Foco

- Conferir o Tracking Urban depois do fim de semana.

## Registro

- Tracking \`/status\` de 21/09: **76** ciclos sem restart (+11 vs sexta), 0 erro.

## Encerramento

- **Concluído:** leitura do fim de semana do Tracking.
- **Aberto:** quatro Instant Forms de 18/09 ainda sem nome no Turso; default 6 h/BRT no Git.
- **Próxima ação:** Tracking ~09:22 (tick imediato) e depois ~15:22.

Voltar para [[CENTRAL]].
`

const PRODUTO = `---
tipo: produto
status: ativo
atualizado_em: 2026-09-21
area: "[[Pessoal/Pessoal]]"
---

# Bom Dia

## Estado

- v3 em produção.

## Próximas ações

- Cadastrar \`AUTH_SECRET\` no Coolify e reiniciar o app.

**Pendências registradas:** \`AUTH_SECRET\` no Coolify (ação do Rafael); rotacionar a chave Runway
dos assets.

## Marcos

- [x] Fechar o desenho e a direção
- [ ] Página Radar (Progresso + No ar) no Bom Dia

## Última sessão

- **2026-09-21 (radar da CENTRAL — R1)** — servidor publicado com ingestão e leitura.
- **2026-09-19 (desenho)** — ponte escolhida como radar somente leitura.
`

const PROJETO = `---
tipo: projeto
status: ativo
atualizado_em: 2026-09-21
produto: "[[Pessoal/03 - Produtos/Bom Dia]]"
area: "[[Pessoal/Pessoal]]"
---

# Bom Dia — Radar de progresso da CENTRAL

## Última sessão

### 2026-09-21 — R1 (servidor do radar)

- **Mudanças:** servidor publicado.

### 2026-09-19 — desenho da ponte

- **Mudanças:** desenho aprovado.

## Marcos

- [ ] Agente local rodando como tarefa agendada
`

const PROJETO_ESPELHO = `---
tipo: projeto
status: ativo
atualizado_em: 2026-09-24
produto: "[[Pessoal/03 - Produtos/Bom Dia]]"
area: "[[Pessoal/Pessoal]]"
repositorio: https://github.com/rafastos-io/bom-dia
caminho_local: "C:\\\\Users\\\\rafaa\\\\VIBECODING\\\\BomDia"
---

# Bom Dia — Demandas espelhadas da CENTRAL

## Resultado esperado

Espelhar as demandas da CENTRAL no Bom Dia.

**Condição de conclusão:** publicar.

## Estado atual

- **Estado:** desenho aprovado.
- **Prazo:** sem data.
- **Próxima ação:** F1 — migração e parser.

## Próximas ações

- Executar a F1 do espelho
  - migração das tabelas
  - parser do agente
- Ligar o backfill

## Última sessão

### 2026-09-21 — R1

- **Mudanças:** servidor publicado.

### 2026-09-24 — desenho aprovado

- **Mudanças:** desenho fechado.
- **Pendências:** calibrar o limiar de similaridade; revisar o merge
- **Próxima ação:** começar a F1
`

const DECISAO = `---
tipo: decisao
status: aceita
data: 2026-09-19
criado_em: 2026-09-19
atualizado_em: 2026-09-19
---

# DEC-2026-09-19 — Radar somente leitura

## Decisão

1. Direção única: CENTRAL → Bom Dia, somente leitura.
2. Universo B + metadados; começa do agora.
`

test("diario mapeia foco, registro e encerramento por rotulo", () => {
  const note = parseNote(DIARIO, "00 - Central/07 - Diário/2026-09-21.md")
  assert.equal(note.tipo, "diario")
  assert.equal(note.title, "2026-09-21")
  assert.equal(note.updatedAt, "2026-09-21")
  assert.equal(note.area, "")
  assert.deepEqual(note.links, ["CENTRAL"])

  const texts = note.entries.map((entry) => entry.text)
  assert.ok(texts.includes("Conferir o Tracking Urban depois do fim de semana."))
  assert.ok(texts.some((value) => value.startsWith("Tracking `/status` de 21/09")))

  const concluido = note.entries.find((entry) => entry.text.includes("leitura do fim de semana"))
  assert.equal(concluido?.kind, "progresso")
  assert.equal(concluido?.section, "Concluído")

  const aberto = note.entries.find((entry) => entry.kind === "aberto")
  assert.equal(aberto?.text, "quatro Instant Forms de 18/09 ainda sem nome no Turso; default 6 h/BRT no Git.")
  assert.equal(aberto?.date, "2026-09-21")

  const proxima = note.entries.find((entry) => entry.kind === "proxima_acao")
  assert.ok(proxima?.text.startsWith("Tracking ~09:22"))
})

test("produto: ultima sessao, proximas acoes, pendencias e marcos", () => {
  const note = parseNote(PRODUTO, "Pessoal/03 - Produtos/Bom Dia.md")
  assert.equal(note.tipo, "produto")
  assert.equal(note.title, "Bom Dia")
  assert.equal(note.area, "Pessoal")
  assert.equal(note.status, "ativo")

  const radar = note.entries.find((entry) => entry.text.includes("servidor publicado com ingestão"))
  assert.equal(radar?.kind, "progresso")
  assert.equal(radar?.date, "2026-09-21")
  assert.equal(radar?.section, "Última sessão")

  const antiga = note.entries.find((entry) => entry.text.includes("ponte escolhida"))
  assert.equal(antiga?.date, "2026-09-19")

  const proxima = note.entries.find((entry) => entry.kind === "proxima_acao")
  assert.ok(proxima?.text.includes("AUTH_SECRET"))
  assert.equal(proxima?.date, "2026-09-21")

  const pendencias = note.entries
    .filter((entry) => entry.kind === "aberto" && entry.section === "Pendências")
    .map((entry) => entry.text)
  assert.equal(pendencias.length, 2)
  assert.ok(pendencias.some((value) => value.includes("AUTH_SECRET")))
  assert.ok(pendencias.some((value) => value.includes("rotacionar a chave Runway")))

  const marcos = note.entries.filter((entry) => entry.kind === "aberto" && entry.section === "Marcos")
  assert.deepEqual(
    marcos.map((entry) => entry.text),
    ["Página Radar (Progresso + No ar) no Bom Dia"],
  )
})

test("projeto usa a data do heading da ultima sessao", () => {
  const note = parseNote(PROJETO, "Pessoal/02 - Projetos/Radar.md")
  assert.equal(note.produto, "Bom Dia")
  const datas = note.entries.filter((entry) => entry.kind === "progresso").map((entry) => entry.date)
  assert.deepEqual(datas, ["2026-09-21", "2026-09-19"])
})

test("decisao usa a data do frontmatter", () => {
  const note = parseNote(DECISAO, "Pessoal/05 - Decisões/DEC.md")
  assert.equal(note.tipo, "decisao")
  assert.equal(note.entries.length, 2)
  assert.ok(note.entries.every((entry) => entry.kind === "decisao" && entry.date === "2026-09-19"))
  assert.ok(note.entries[0]?.text.startsWith("Direção única"))
})

test("espacos e formatacao extra nao mudam o hash; conteudo muda", () => {
  const original = parseNote(DIARIO, "diario.md")
  const reformatado = parseNote(`${DIARIO.replaceAll("\n", "  \n")}\n\n`, "diario.md")
  assert.equal(original.hash, reformatado.hash)

  const mudado = parseNote(DIARIO.replace("76", "77"), "diario.md")
  assert.notEqual(original.hash, mudado.hash)
})

test("projeto: Estado atual, subtarefas e sessao mais recente", () => {
  const note = parseNote(PROJETO_ESPELHO, "Pessoal/02 - Projetos/Espelho.md")
  assert.equal(note.scope, "Espelhar as demandas da CENTRAL no Bom Dia.")
  assert.equal(note.repositorio, "https://github.com/rafastos-io/bom-dia")
  assert.equal(note.caminhoLocal, "C:\\Users\\rafaa\\VIBECODING\\BomDia")

  const estado = note.entries.find((entry) => entry.section === "Estado atual")
  assert.equal(estado?.kind, "proxima_acao")
  assert.equal(estado?.text, "F1 — migração e parser.")
  assert.equal(estado?.date, "2026-09-24")

  const proximas = note.entries.find((entry) => entry.section === "Próximas ações")
  assert.equal(proximas?.kind, "proxima_acao")
  assert.equal(proximas?.text, "Executar a F1 do espelho")
  assert.deepEqual(
    proximas?.subtasks.map((subtask) => subtask.text),
    ["migração das tabelas", "parser do agente"],
  )

  const antiga = note.entries.find((entry) => entry.text.includes("servidor publicado"))
  assert.equal(antiga?.section, "Última sessão")
  assert.equal(antiga?.kind, "progresso")

  const pendencias = note.entries.find((entry) => entry.section === "Última sessão · Pendências")
  assert.equal(pendencias?.kind, "aberto")
  assert.equal(pendencias?.text, "calibrar o limiar de similaridade; revisar o merge")
  assert.equal(pendencias?.date, "2026-09-24")

  const proxima = note.entries.find((entry) => entry.section === "Última sessão · Próxima ação")
  assert.equal(proxima?.kind, "proxima_acao")
  assert.equal(proxima?.text, "começar a F1")

  // A sessao anterior nao alimenta o "no ar": o rotulo dela vira progresso.
  const antigaMudanca = note.entries.find((entry) => entry.text.includes("servidor publicado"))
  assert.equal(antigaMudanca?.kind, "progresso")
})

test("subtarefa muda o hash da nota", () => {
  const original = parseNote(PROJETO_ESPELHO, "Pessoal/02 - Projetos/Espelho.md")
  const mudado = parseNote(
    PROJETO_ESPELHO.replace("  - parser do agente", "  - parser do agente (novo)"),
    "Pessoal/02 - Projetos/Espelho.md",
  )
  assert.notEqual(original.hash, mudado.hash)
})
