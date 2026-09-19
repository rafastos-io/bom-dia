import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

let app: import("hono").Hono
let dir: string
let client: import("@libsql/client").Client

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "bomdia-test-"))
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

const authHeaders = (cookie: string) => ({ Cookie: cookie, "Content-Type": "application/json" })

describe("auth", () => {
  it("health e publico", async () => {
    const res = await app.request("/health")
    expect(res.status).toBe(200)
    expect(((await res.json()) as { status: string }).status).toBe("ok")
  })

  it("api exige sessao", async () => {
    const res = await app.request("/api/tasks")
    expect(res.status).toBe(401)
  })

  it("login invalido retorna 401", async () => {
    const res = await app.request("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "Rafastos", password: "errada" }),
    })
    expect(res.status).toBe(401)
  })
})

describe("tasks", () => {
  it("cria, lista, atualiza, subtarefa, feito e exclui", async () => {
    const cookie = await login()

    const created = await app.request("/api/tasks", {
      method: "POST",
      headers: authHeaders(cookie),
      body: JSON.stringify({
        title: "Testar a API nova",
        tipo: "rotina",
        recorrencia: "diaria",
        priority: "alta",
        projeto: "QA",
        subtasks: ["passo 1", { title: "passo 2", done: true }],
        links: [{ kind: "web", label: "spec", target: "https://example.com/spec" }],
      }),
    })
    expect(created.status).toBe(201)
    const { id } = (await created.json()) as { id: number }

    const list = (await (
      await app.request("/api/tasks", { headers: authHeaders(cookie) })
    ).json()) as { id: number; feita: boolean; subtasks: { title: string }[]; links: { target: string }[] }[]
    const task = list.find((t) => t.id === id)
    expect(task).toBeTruthy()
    expect(task?.subtasks.map((s) => s.title)).toEqual(["passo 1", "passo 2"])
    expect(task?.feita).toBe(false)

    const done = await app.request(`/api/tasks/${id}/feito`, {
      method: "POST",
      headers: authHeaders(cookie),
      body: JSON.stringify({ done: true }),
    })
    expect(done.status).toBe(200)
    const afterDone = (await (
      await app.request("/api/tasks", { headers: authHeaders(cookie) })
    ).json()) as { id: number; feita: boolean }[]
    expect(afterDone.find((t) => t.id === id)?.feita).toBe(true)

    const updated = await app.request(`/api/tasks/${id}`, {
      method: "PUT",
      headers: authHeaders(cookie),
      body: JSON.stringify({ status: "concluida", tipo: "tarefa", recorrencia: "" }),
    })
    expect(updated.status).toBe(200)

    const removed = await app.request(`/api/tasks/${id}`, {
      method: "DELETE",
      headers: authHeaders(cookie),
    })
    expect(removed.status).toBe(200)
  })

  it("cria projeto, propaga renome e cuida das notas", async () => {
    const cookie = await login()
    const created = await app.request("/api/projects", {
      method: "POST",
      headers: authHeaders(cookie),
      body: JSON.stringify({ name: "Projeto QA", scope: "teste", people: "Rafael" }),
    })
    expect(created.status).toBe(201)
    const { id } = (await created.json()) as { id: number }

    const task = await app.request("/api/tasks", {
      method: "POST",
      headers: authHeaders(cookie),
      body: JSON.stringify({ title: "Dentro do projeto", projeto: "Projeto QA" }),
    })
    expect(task.status).toBe(201)

    const note = await app.request(`/api/projects/${id}/notes`, {
      method: "POST",
      headers: authHeaders(cookie),
      body: JSON.stringify({ title: "Nota", body: "conteudo" }),
    })
    expect(note.status).toBe(201)
    const notes = (await (
      await app.request(`/api/projects/${id}/notes`, { headers: authHeaders(cookie) })
    ).json()) as { title: string }[]
    expect(notes[0]?.title).toBe("Nota")

    const renamed = await app.request(`/api/projects/${id}`, {
      method: "PUT",
      headers: authHeaders(cookie),
      body: JSON.stringify({ name: "Projeto QA 2" }),
    })
    expect(renamed.status).toBe(200)
    const tasks = (await (
      await app.request("/api/tasks", { headers: authHeaders(cookie) })
    ).json()) as { projeto: string }[]
    expect(tasks.some((t) => t.projeto === "Projeto QA 2")).toBe(true)
  })

  it("rotas de IA respondem erro claro sem chave configurada", async () => {
    const cookie = await login()
    const res = await app.request("/api/ai/parse", {
      method: "POST",
      headers: authHeaders(cookie),
      body: JSON.stringify({ text: "teste" }),
    })
    expect(res.status).toBe(502)
    const body = (await res.json()) as { error: string }
    expect(body.error).toContain("Chave da OpenAI")
  })

  it("grava completed_at ao concluir e limpa ao reabrir", async () => {
    const cookie = await login()
    const created = await app.request("/api/tasks", {
      method: "POST",
      headers: authHeaders(cookie),
      body: JSON.stringify({ title: "Fluxo de conclusao", tipo: "tarefa" }),
    })
    const { id } = (await created.json()) as { id: number }

    const list = async () =>
      (await (await app.request("/api/tasks", { headers: authHeaders(cookie) })).json()) as Array<{
        id: number
        completed_at: string | null
      }>

    await app.request(`/api/tasks/${id}`, {
      method: "PUT",
      headers: authHeaders(cookie),
      body: JSON.stringify({ status: "concluida" }),
    })
    expect((await list()).find((task) => task.id === id)?.completed_at).toMatch(
      /^\d{4}-\d{2}-\d{2}T/,
    )

    await app.request(`/api/tasks/${id}`, {
      method: "PUT",
      headers: authHeaders(cookie),
      body: JSON.stringify({ status: "aberta" }),
    })
    expect((await list()).find((task) => task.id === id)?.completed_at).toBe("")
  })

  it("tarefa recorrente gera a proxima ocorrencia ao concluir", async () => {
    const cookie = await login()
    const created = await app.request("/api/tasks", {
      method: "POST",
      headers: authHeaders(cookie),
      body: JSON.stringify({
        title: "Semanal teste",
        tipo: "tarefa",
        recorrencia: "semanal",
        due_date: "2026-09-18",
        subtasks: ["passo"],
      }),
    })
    const { id } = (await created.json()) as { id: number }

    await app.request(`/api/tasks/${id}`, {
      method: "PUT",
      headers: authHeaders(cookie),
      body: JSON.stringify({ status: "concluida" }),
    })

    const list = (await (
      await app.request("/api/tasks", { headers: authHeaders(cookie) })
    ).json()) as Array<{
      id: number
      title: string
      status: string
      due_date: string
      subtasks: { title: string; done: number }[]
    }>
    const next = list.find((task) => task.title === "Semanal teste" && task.id !== id)
    expect(next).toBeTruthy()
    expect(next?.status).toBe("aberta")
    expect(next?.due_date).toBe("2026-09-25")
    expect(next?.subtasks[0]?.title).toBe("passo")
    expect(next?.subtasks[0]?.done).toBe(0)
  })
})
