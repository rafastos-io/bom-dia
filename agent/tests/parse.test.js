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
  assert.equal(concluido?.section, "Encerramento")

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

  const pendencias = note.entries.find((entry) => entry.kind === "aberto" && entry.section === "Pendências")
  assert.ok(pendencias?.text.includes("rotacionar a chave Runway"))

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
