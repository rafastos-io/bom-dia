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

let session: string | null = null

async function login(): Promise<string> {
  // Uma sessao por arquivo: o POST /login tem rate-limit por IP.
  if (session) return session
  const res = await app.request("/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "Rafastos", password: "senha-de-teste" }),
  })
  expect(res.status).toBe(200)
  const cookie = res.headers.get("set-cookie") ?? ""
  session = cookie.split(";")[0] ?? ""
  return session
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
    expect(await first.json()).toMatchObject({
      notes: 1,
      entries: 2,
      removed: 0,
      skipped: 0,
      mirror: { projects: 1, created: 1, updated: 0, closed: 0, reopened: 0, subtasks: 0 },
    })

    const second = await ingest({ notes: [payload] })
    expect(await second.json()).toMatchObject({
      notes: 0,
      entries: 0,
      removed: 0,
      skipped: 1,
      mirror: { created: 0, updated: 0, closed: 0 },
    })
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
    expect(await res.json()).toMatchObject({ notes: 1, entries: 1, removed: 0, skipped: 0 })

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
    expect(await res.json()).toMatchObject({ notes: 1, entries: 1, removed: 0, skipped: 0 })
  })

  it("deleted remove a nota e as entradas", async () => {
    const path = "Testes/removida.md"
    await ingest({ notes: [note({ path, title: "Removida" })] })
    const res = await ingest({ notes: [], deleted: [path] })
    expect(await res.json()).toMatchObject({ notes: 0, entries: 0, removed: 1, skipped: 0 })

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

type TaskDict = {
  id: number
  title: string
  status: string
  projeto: string
  description: string
  completed_at?: string
  links: Array<{ kind: string; target: string }>
  subtasks: Array<{ title: string; done: number }>
  central?: { path: string; title: string; state: string; section: string } | null
}

type ProjectDict = {
  id: number
  name: string
  scope: string
  status: string
  central_note?: string
  grupo?: string
  links: Array<{ kind: string; target: string; grupo: string }>
  task_ativas: number
}

async function listTasks(cookie: string): Promise<TaskDict[]> {
  const res = await app.request("/api/tasks", { headers: { Cookie: cookie } })
  expect(res.status).toBe(200)
  return (await res.json()) as TaskDict[]
}

async function listProjects(cookie: string): Promise<ProjectDict[]> {
  const res = await app.request("/api/projects", { headers: { Cookie: cookie } })
  expect(res.status).toBe(200)
  return (await res.json()) as ProjectDict[]
}

describe("radar: espelho de demandas", () => {
  it("cria projeto e tarefa com subtarefas e links", async () => {
    const path = "Testes/espelho/produto.md"
    const res = await ingest({
      notes: [
        note({
          path,
          title: "Produto Espelho",
          scope: "Espelhar as demandas da CENTRAL.",
          repositorio: "https://github.com/rafastos-io/exemplo",
          caminhoLocal: "C:\\projetos\\exemplo",
          entries: [
            {
              kind: "proxima_acao",
              text: "Executar a F1 do espelho ([[Pessoal/02 - Projetos/Bom Dia - Demandas espelhadas da CENTRAL|projeto]] · ver https://exemplo.com/spec)",
              date: isoDaysAgo(0),
              section: "Próximas ações",
              subtasks: [
                { text: "migração das tabelas", done: false },
                { text: "parser do agente", done: true },
              ],
            },
          ],
        }),
      ],
    })
    expect(res.status).toBe(200)
    const cookie = await login()

    const task = (await listTasks(cookie)).find((item) =>
      item.title.startsWith("Executar a F1 do espelho"),
    )
    expect(task?.projeto).toBe("Produto Espelho")
    expect(task?.status).toBe("aberta")
    expect(task?.description).toContain(path)
    expect(task?.links.some((link) => link.target === "https://exemplo.com/spec")).toBe(true)
    expect(
      task?.links.some(
        (link) => link.kind === "nota" && link.target.includes("Bom Dia - Demandas espelhadas"),
      ),
    ).toBe(true)
    expect(task?.subtasks.map((subtask) => subtask.title)).toEqual([
      "migração das tabelas",
      "parser do agente",
    ])
    expect(task?.subtasks[1]?.done).toBe(1)

    const project = (await listProjects(cookie)).find((item) => item.name === "Produto Espelho")
    expect(project?.central_note).toBe(path)
    expect(project?.grupo).toBe("Pessoal")
    expect(project?.scope).toBe("Espelhar as demandas da CENTRAL.")
    expect(project?.links.some((link) => link.target === "https://github.com/rafastos-io/exemplo")).toBe(true)
    expect(project?.links.some((link) => link.target === "C:\\projetos\\exemplo")).toBe(true)
    expect(
      project?.links.some((link) => link.kind === "nota" && link.target === path),
    ).toBe(true)
  })

  it("limpa wikilinks no titulo da tarefa espelhada", async () => {
    await ingest({
      notes: [
        note({
          path: "Testes/espelho/titulo.md",
          title: "Produto Título",
          entries: [
            {
              kind: "aberto",
              text: "Fechar o funil ([[Freelancers/03 - Produtos/Finance Equity|Finance Equity]] · [[Pessoal/05 - Decisões/DEC-2026-09-19 - Radar de progresso somente leitura da CENTRAL no Bom Dia|decisão]])",
              date: isoDaysAgo(1),
              section: "Pendências",
              subtasks: [],
            },
          ],
        }),
      ],
    })
    const cookie = await login()
    const task = (await listTasks(cookie)).find((item) => item.projeto === "Produto Título")
    expect(task?.title).toBe("Fechar o funil (Finance Equity · decisão)")
  })

  it("fecha a tarefa quando o item sai da nota e reabre quando volta", async () => {
    const path = "Testes/espelho/volta.md"
    const base = note({
      path,
      title: "Produto Volta",
      entries: [
        { kind: "aberto", text: "Item que vai e volta", date: isoDaysAgo(3), section: "Pendências", subtasks: [] },
      ],
    })
    await ingest({ notes: [base] })
    const cookie = await login()
    const before = (await listTasks(cookie)).find((item) => item.title === "Item que vai e volta")
    expect(before?.status).toBe("aberta")

    await ingest({
      notes: [
        note({
          path,
          title: "Produto Volta",
          entries: [
            { kind: "progresso", text: "Item resolvido", date: isoDaysAgo(0), section: "Registro", subtasks: [] },
          ],
        }),
      ],
    })
    const closed = (await listTasks(cookie)).find((item) => item.title === "Item que vai e volta")
    expect(closed?.status).toBe("concluida")
    expect(closed?.completed_at).toBeTruthy()

    await ingest({ notes: [base] })
    const reopened = (await listTasks(cookie)).find((item) => item.title === "Item que vai e volta")
    expect(reopened?.status).toBe("aberta")
  })

  it("mantem a tarefa quando o texto muda com similaridade", async () => {
    const path = "Testes/espelho/muda.md"
    await ingest({
      notes: [
        note({
          path,
          title: "Produto Muda",
          entries: [
            { kind: "aberto", text: "Mudar as cores dos botões", date: isoDaysAgo(2), section: "Pendências", subtasks: [] },
          ],
        }),
      ],
    })
    const cookie = await login()
    const first = (await listTasks(cookie)).find((item) => item.title === "Mudar as cores dos botões")
    expect(first).toBeDefined()

    const res = await ingest({
      notes: [
        note({
          path,
          title: "Produto Muda",
          entries: [
            {
              kind: "aberto",
              text: "Mudar as cores dos botões para azul",
              date: isoDaysAgo(1),
              section: "Pendências",
              subtasks: [],
            },
          ],
        }),
      ],
    })
    expect(await res.json()).toMatchObject({ mirror: { created: 0, updated: 1, closed: 0 } })

    const tasks = await listTasks(cookie)
    const same = tasks.find((item) => item.id === first?.id)
    expect(same?.title).toBe("Mudar as cores dos botões para azul")
    expect(tasks.filter((item) => item.projeto === "Produto Muda")).toHaveLength(1)
  })

  it("marco parecido com a proxima acao vira subtarefa", async () => {
    const path = "Testes/espelho/merge.md"
    await ingest({
      notes: [
        note({
          path,
          title: "Produto Merge",
          entries: [
            {
              kind: "proxima_acao",
              text: "Usar o radar por 2 a 3 dias e ajustar o gosto da tela",
              date: isoDaysAgo(1),
              section: "Próximas ações",
              subtasks: [],
            },
            {
              kind: "aberto",
              text: "Usar por 2 a 3 dias e ajustar o gosto da tela",
              date: isoDaysAgo(1),
              section: "Marcos",
              subtasks: [],
            },
          ],
        }),
      ],
    })
    const cookie = await login()
    const tasks = (await listTasks(cookie)).filter((item) => item.projeto === "Produto Merge")
    expect(tasks).toHaveLength(1)
    expect(tasks[0]?.title).toContain("Usar o radar")
    expect(tasks[0]?.subtasks.some((subtask) => subtask.title.includes("Usar por 2 a 3 dias"))).toBe(true)
  })

  it("Concluido do diario fecha a tarefa parecida", async () => {
    const path = "Testes/espelho/conclui.md"
    await ingest({
      notes: [
        note({
          path,
          title: "Produto Conclui",
          entries: [
            {
              kind: "proxima_acao",
              text: "Pausar o Vercel pontosgrupourban",
              date: isoDaysAgo(2),
              section: "Próximas ações",
              subtasks: [],
            },
          ],
        }),
      ],
    })
    const cookie = await login()
    const before = (await listTasks(cookie)).find((item) => item.title === "Pausar o Vercel pontosgrupourban")
    expect(before?.status).toBe("aberta")

    const res = await ingest({
      notes: [
        {
          ...note({ path: "00 - Central/07 - Diário/2026-09-24.md", title: "2026-09-24", entries: [] }),
          tipo: "diario",
          status: "ativo",
          entries: [
            {
              kind: "progresso",
              text: "Pausar o Vercel pontosgrupourban e acompanhar os crons",
              date: isoDaysAgo(0),
              section: "Concluído",
              subtasks: [],
            },
          ],
        },
      ],
    })
    expect(await res.json()).toMatchObject({ mirror: { closed: 1 } })
    const after = (await listTasks(cookie)).find((item) => item.id === before?.id)
    expect(after?.status).toBe("concluida")
  })

  it("decisao vira tarefa concluida no projeto do produto", async () => {
    await ingest({
      notes: [
        note({
          path: "Testes/espelho/decisao-produto.md",
          title: "Produto Decisão",
          entries: [
            { kind: "progresso", text: "Base criada", date: isoDaysAgo(4), section: "Registro", subtasks: [] },
          ],
        }),
      ],
    })
    const res = await ingest({
      notes: [
        {
          ...note({ path: "Pessoal/05 - Decisões/DEC-2026-09-24 - Teste.md", title: "DEC-2026-09-24 - Teste", entries: [] }),
          tipo: "decisao",
          status: "aceita",
          produto: "Produto Decisão",
          entries: [
            {
              kind: "decisao",
              text: "Espelhar as demandas da CENTRAL",
              date: isoDaysAgo(0),
              section: "Decisão",
              subtasks: [],
            },
          ],
        },
      ],
    })
    expect(await res.json()).toMatchObject({ mirror: { created: 1 } })
    const cookie = await login()
    const task = (await listTasks(cookie)).find((item) => item.title === "Espelhar as demandas da CENTRAL")
    expect(task?.status).toBe("concluida")
    expect(task?.projeto).toBe("Produto Decisão")
    expect(task?.completed_at).toBe(isoDaysAgo(0))
  })

  it("espelha o grupo da area e preserva o local quando a nota nao tem area", async () => {
    const path = "Testes/espelho/grupo.md"
    const base = (area: string, text: string) =>
      note({
        path,
        title: "Produto Grupo",
        area,
        entries: [
          { kind: "progresso", text, date: isoDaysAgo(2), section: "Registro", subtasks: [] },
        ],
      })
    await ingest({ notes: [base("Grupo Urban", "Base")] })
    const cookie = await login()
    let project = (await listProjects(cookie)).find((item) => item.name === "Produto Grupo")
    expect(project?.grupo).toBe("Grupo Urban")

    // Sem area na nota: o grupo local fica como esta.
    await ingest({ notes: [base("", "Base 2")] })
    project = (await listProjects(cookie)).find((item) => item.name === "Produto Grupo")
    expect(project?.grupo).toBe("Grupo Urban")

    // Area mudou na CENTRAL: o grupo acompanha.
    await ingest({ notes: [base("Pessoal", "Base 3")] })
    project = (await listProjects(cookie)).find((item) => item.name === "Produto Grupo")
    expect(project?.grupo).toBe("Pessoal")
  })

  it("nao duplica os links gerenciados do projeto a cada sync", async () => {
    const path = "Testes/espelho/links.md"
    const base = (text: string) =>
      note({
        path,
        title: "Produto Links",
        repositorio: "https://github.com/rafastos-io/links",
        caminhoLocal: "C:\\projetos\\links",
        entries: [
          { kind: "progresso", text, date: isoDaysAgo(2), section: "Registro", subtasks: [] },
        ],
      })
    await ingest({ notes: [base("Base")] })
    await ingest({ notes: [base("Base 2")] })
    const cookie = await login()
    const project = (await listProjects(cookie)).find((item) => item.name === "Produto Links")
    const codigo = (project?.links ?? []).filter((link) => link.grupo === "Código")
    expect(codigo).toHaveLength(2)
    const central = (project?.links ?? []).filter(
      (link) => link.grupo === "CENTRAL" && link.kind === "nota",
    )
    expect(central).toHaveLength(1)
  })

  it("monta a fila de revisoes e aceita divergencia", async () => {
    expect((await app.request("/api/radar/revisoes")).status).toBe(401)

    const path = "Testes/espelho/revisoes.md"
    const base = (entries: Array<Record<string, unknown>>) =>
      note({ path, title: "Produto Revisões", entries })
    await ingest({
      notes: [
        base([
          { kind: "aberto", text: "Item concluido aqui", date: isoDaysAgo(2), section: "Pendências", subtasks: [] },
          { kind: "aberto", text: "Item fechado pela central", date: isoDaysAgo(2), section: "Marcos", subtasks: [] },
        ]),
      ],
    })
    const cookie = await login()
    const tasks = await listTasks(cookie)
    const concluido = tasks.find((item) => item.title === "Item concluido aqui")
    const fechado = tasks.find((item) => item.title === "Item fechado pela central")

    const update = await app.request(`/api/tasks/${concluido?.id}`, {
      method: "PUT",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ status: "concluida" }),
    })
    expect(update.status).toBe(200)

    // Remove o item da nota: o espelho fecha a tarefa vinculada.
    await ingest({
      notes: [
        base([
          { kind: "aberto", text: "Item concluido aqui", date: isoDaysAgo(2), section: "Pendências", subtasks: [] },
        ]),
      ],
    })

    type Reviews = {
      divergentes: Array<{ id: number }>
      semProjeto: Array<{ id: number; title: string }>
      fechadas: Array<{ id: number }>
    }
    const read = async (): Promise<Reviews> => {
      const res = await app.request("/api/radar/revisoes", { headers: { Cookie: cookie } })
      expect(res.status).toBe(200)
      return (await res.json()) as Reviews
    }

    const reviews = await read()
    expect(reviews.divergentes.some((item) => item.id === concluido?.id)).toBe(true)
    expect(reviews.fechadas.some((item) => item.id === fechado?.id)).toBe(true)

    await app.request("/api/tasks", {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Sem dono", tipo: "tarefa" }),
    })
    expect((await read()).semProjeto.some((item) => item.title === "Sem dono")).toBe(true)

    const dismiss = await app.request("/api/radar/revisoes/divergente", {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ taskId: concluido?.id }),
    })
    expect(dismiss.status).toBe(200)
    expect((await read()).divergentes.some((item) => item.id === concluido?.id)).toBe(false)
  })

  it("mantem o link de nota unico ao re-sincronizar a tarefa", async () => {
    const path = "Testes/espelho/nota-link.md"
    const base = (text: string) =>
      note({
        path,
        title: "Produto Nota Link",
        entries: [
          {
            kind: "aberto",
            text: "Demanda com nota ([[Pessoal/03 - Produtos/Bom Dia]])",
            date: isoDaysAgo(1),
            section: "Pendências",
            subtasks: [],
          },
          { kind: "progresso", text, date: isoDaysAgo(1), section: "Registro", subtasks: [] },
        ],
      })
    await ingest({ notes: [base("Base")] })
    await ingest({ notes: [base("Base 2")] })
    const cookie = await login()
    const task = (await listTasks(cookie)).find((item) => item.title.startsWith("Demanda com nota"))
    const notas = (task?.links ?? []).filter((link) => link.kind === "nota")
    expect(notas).toHaveLength(1)
  })

  it("expoe o vinculo com a CENTRAL na tarefa", async () => {
    const path = "Testes/espelho/central-info.md"
    await ingest({
      notes: [
        note({
          path,
          title: "Produto Central Info",
          entries: [
            {
              kind: "aberto",
              text: "Demanda com vínculo",
              date: isoDaysAgo(1),
              section: "Pendências",
              subtasks: [],
            },
          ],
        }),
      ],
    })
    const cookie = await login()
    const task = (await listTasks(cookie)).find((item) => item.title === "Demanda com vínculo")
    expect(task?.central?.path).toBe(path)
    expect(task?.central?.title).toBe("Produto Central Info")
    expect(task?.central?.state).toBe("ativa")
    expect(task?.central?.section).toBe("Pendências")
  })

  it("permite editar o grupo do projeto pela API", async () => {
    const cookie = await login()
    const project = (await listProjects(cookie)).find((item) => item.name === "Produto Grupo")
    expect(project).toBeDefined()
    const res = await app.request(`/api/projects/${project?.id}`, {
      method: "PUT",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ grupo: "Pessoal" }),
    })
    expect(res.status).toBe(200)
    const updated = (await listProjects(cookie)).find((item) => item.id === project?.id)
    expect(updated?.grupo).toBe("Pessoal")
  })

  it("reconcile reconstroi o espelho e exige token", async () => {
    const path = "Testes/espelho/reconcile.md"
    await ingest({
      notes: [
        note({
          path,
          title: "Produto Reconcile",
          entries: [
            { kind: "aberto", text: "Recriar esta demanda", date: isoDaysAgo(5), section: "Pendências", subtasks: [] },
          ],
        }),
      ],
    })
    expect((await app.request("/api/radar/reconcile", { method: "POST" })).status).toBe(401)

    await client.execute("DELETE FROM central_task_links")
    await client.execute("DELETE FROM subtasks")
    await client.execute("DELETE FROM links")
    await client.execute("DELETE FROM tasks")

    const res = await app.request("/api/radar/reconcile", {
      method: "POST",
      headers: { Authorization: TOKEN },
    })
    expect(res.status).toBe(200)
    const cookie = await login()
    const task = (await listTasks(cookie)).find((item) => item.title === "Recriar esta demanda")
    expect(task?.status).toBe("aberta")
    expect(task?.projeto).toBe("Produto Reconcile")
  })
})
