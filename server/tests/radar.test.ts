import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

let app: import("hono").Hono
let dir: string
let client: import("@libsql/client").Client

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "bomdia-radar-"))
  const { createDatabase } = await import("../src/db/client.js")
  const { ensureSchema } = await import("../src/db/migrate.js")
  const { createApp } = await import("../src/app.js")
  const database = createDatabase(`file:${join(dir, "test.db")}`)
  client = database.client
  await ensureSchema(client)
  app = createApp(database.db)
})

afterAll(async () => {
  client?.close()
  await new Promise((resolve) => setTimeout(resolve, 250))
  try {
    rmSync(dir, { recursive: true, force: true })
  } catch {
    // Windows pode manter o arquivo do libSQL preso; o temp resolve depois.
  }
})

const TOKEN = "Bearer token-de-teste"

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)
}

function note(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    path: "Testes/nota.md",
    title: "Nota de teste",
    tipo: "produto",
    area: "Pessoal",
    status: "ativo",
    updatedAt: isoDaysAgo(0),
    entries: [
      {
        kind: "progresso",
        text: "Backup publicado",
        date: isoDaysAgo(0),
        section: "Última sessão",
      },
      {
        kind: "aberto",
        text: "Rotacionar a chave Runway",
        date: isoDaysAgo(5),
        section: "Pendências",
      },
    ],
    ...overrides,
  }
}

async function ingest(body: unknown, token: string | null = TOKEN) {
  return app.request("/api/radar/ingest", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: token } : {}),
    },
    body: JSON.stringify(body),
  })
}

async function login(): Promise<string> {
  const res = await app.request("/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "Rafastos", password: "senha-de-teste" }),
  })
  expect(res.status).toBe(200)
  const cookie = res.headers.get("set-cookie") ?? ""
  return cookie.split(";")[0] ?? ""
}

type Digest = {
  progresso: Array<{ date: string; items: Array<{ text: string; note: string }> }>
  noAr: Array<{ text: string; date: string; ageDays: number; note: string }>
  atualizadoEm: string
}

async function digest(cookie: string): Promise<Digest> {
  const res = await app.request("/api/radar", { headers: { Cookie: cookie } })
  expect(res.status).toBe(200)
  return (await res.json()) as Digest
}

describe("radar: ingestao", () => {
  it("exige token de servico", async () => {
    expect((await ingest({ notes: [] }, null)).status).toBe(401)
    expect((await ingest({ notes: [] }, "Bearer errado")).status).toBe(401)
  })

  it("grava o lote e e idempotente", async () => {
    const payload = note({ path: "Testes/idempotente.md", title: "Idempotente" })
    const first = await ingest({ notes: [payload] })
    expect(first.status).toBe(200)
    expect(await first.json()).toEqual({ notes: 1, entries: 2, removed: 0, skipped: 0 })

    const second = await ingest({ notes: [payload] })
    expect(await second.json()).toEqual({ notes: 0, entries: 0, removed: 0, skipped: 1 })
  })

  it("a nota atual substitui as entradas anteriores", async () => {
    const path = "Testes/substitui.md"
    await ingest({ notes: [note({ path, title: "Substitui" })] })
    const onlyProgress = note({
      path,
      title: "Substitui",
      entries: [{ kind: "progresso", text: "Agora so progresso", date: isoDaysAgo(0) }],
    })
    const res = await ingest({ notes: [onlyProgress] })
    expect(await res.json()).toEqual({ notes: 1, entries: 1, removed: 0, skipped: 0 })

    const cookie = await login()
    const data = await digest(cookie)
    expect(data.noAr.some((item) => item.note === "Substitui")).toBe(false)
  })

  it("descarta entradas invalidas", async () => {
    const res = await ingest({
      notes: [
        note({
          path: "Testes/invalidas.md",
          title: "Invalidas",
          entries: [
            { kind: "qualquer", text: "tipo invalido" },
            { kind: "aberto", text: "   " },
            { kind: "decisao", text: "decisao boa", date: isoDaysAgo(1) },
          ],
        }),
      ],
    })
    expect(await res.json()).toEqual({ notes: 1, entries: 1, removed: 0, skipped: 0 })
  })

  it("deleted remove a nota e as entradas", async () => {
    const path = "Testes/removida.md"
    await ingest({ notes: [note({ path, title: "Removida" })] })
    const res = await ingest({ notes: [], deleted: [path] })
    expect(await res.json()).toEqual({ notes: 0, entries: 0, removed: 1, skipped: 0 })

    const cookie = await login()
    const data = await digest(cookie)
    expect(data.progresso.some((day) => day.items.some((item) => item.note === "Removida"))).toBe(
      false,
    )
  })

  it("rejeita lote grande demais", async () => {
    const { parseIngest } = await import("../src/radar.js")
    const notes = Array.from({ length: 201 }, (_, i) => ({ path: `Testes/n${i}.md` }))
    expect(() => parseIngest({ notes })).toThrow(/lote grande demais/)
  })
})

describe("radar: leitura", () => {
  it("exige sessao", async () => {
    expect((await app.request("/api/radar")).status).toBe(401)
  })

  it("agrupa o progresso por dia e lista o no ar", async () => {
    const path = "Testes/leitura.md"
    await ingest({ notes: [note({ path, title: "Leitura" })] })
    const cookie = await login()
    const data = await digest(cookie)

    const today = data.progresso[0]
    expect(today?.date).toBe(isoDaysAgo(0))
    expect(today?.items.some((item) => item.note === "Leitura")).toBe(true)

    const open = data.noAr.find((item) => item.note === "Leitura")
    expect(open).toBeDefined()
    expect(open?.date).toBe(isoDaysAgo(5))
    expect(open?.ageDays).toBeGreaterThanOrEqual(5)
    expect(data.atualizadoEm).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it("nota encerrada nao alimenta o no ar", async () => {
    await ingest({
      notes: [note({ path: "Testes/encerrada.md", title: "Encerrada", status: "concluido" })],
    })
    const cookie = await login()
    const data = await digest(cookie)
    expect(data.noAr.some((item) => item.note === "Encerrada")).toBe(false)
    expect(
      data.progresso.some((day) => day.items.some((item) => item.note === "Encerrada")),
    ).toBe(true)
  })

  it("ordena o no ar do mais velho para o mais novo", async () => {
    await ingest({
      notes: [
        note({ path: "Testes/velha.md", title: "Velha", entries: [
          { kind: "aberto", text: "Item antigo", date: isoDaysAgo(10), section: "Pendências" },
        ] }),
        note({ path: "Testes/nova.md", title: "Nova", entries: [
          { kind: "aberto", text: "Item recente", date: isoDaysAgo(2), section: "Pendências" },
        ] }),
      ],
    })
    const cookie = await login()
    const data = await digest(cookie)
    const old = data.noAr.findIndex((item) => item.text === "Item antigo")
    const recent = data.noAr.findIndex((item) => item.text === "Item recente")
    expect(old).toBeGreaterThanOrEqual(0)
    expect(recent).toBeGreaterThanOrEqual(0)
    expect(old).toBeLessThan(recent)
  })
})
