import { readFile } from "node:fs/promises"
import { join, normalize } from "node:path"
import { Hono, type Context } from "hono"
import { getMimeType } from "hono/utils/mime"
import {
  APP_ENV,
  DIST_DIR,
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_MB,
  apiKeyOk,
  loadConfig,
  r2Enabled,
  saveConfig,
} from "./config.js"
import {
  clearSessionCookie,
  isAuthenticated,
  isSecureRequest,
  loginRateLimited,
  newSessionToken,
  requireAuth,
  sessionCookie,
  validCredentials,
  validServiceToken,
} from "./auth.js"
import type { Database } from "./db/client.js"
import {
  createAttachment,
  createNote,
  createProject,
  createTask,
  deleteAttachment,
  deleteNote,
  deleteProject,
  deleteTask,
  getAttachment,
  listAttachments,
  listNotes,
  listProjectNames,
  listProjects,
  listTasks,
  publicAttachment,
  setRoutineDone,
  updateNote,
  updateProject,
  updateSubtask,
  updateTask,
} from "./data.js"
import { buildGaps } from "./rules.js"
import { aiParse, aiWhatsapp } from "./openai.js"
import {
  ingestCentral,
  parseIngest,
  radarDigest,
  reconcileMirror,
  type RadarIngest,
} from "./radar.js"
import { buildKey, r2Delete, r2Get, r2Put, safeName } from "./r2.js"

async function readJson(c: Context): Promise<Record<string, unknown>> {
  return (await c.req.json().catch(() => ({}))) as Record<string, unknown>
}

async function serveIndex(c: Context): Promise<Response> {
  const html = await readFile(join(DIST_DIR, "index.html"), "utf-8")
  return c.html(html)
}

export function createApp(db: Database): Hono {
  const app = new Hono()

  app.use("*", async (c, next) => {
    await next()
    c.header("Cache-Control", "no-cache, no-store, must-revalidate")
    c.header("X-Content-Type-Options", "nosniff")
    c.header("X-Frame-Options", "DENY")
    c.header("Referrer-Policy", "same-origin")
  })

  // ------------------------------------------------------------------ radar ---
  // Ingestao do agente local (Bearer de servico). Registrada ANTES do guard de
  // sessao de /api/* porque o agente nao tem cookie; a leitura usa sessao.
  app.post("/api/radar/ingest", async (c) => {
    if (!validServiceToken(c.req.header("authorization"))) {
      return c.json({ error: "token de servico invalido" }, 401)
    }
    let payload: RadarIngest
    try {
      payload = parseIngest(await readJson(c))
    } catch (error) {
      return c.json({ error: (error as Error).message }, 400)
    }
    return c.json(await ingestCentral(db, payload))
  })

  // Reconstroi o espelho de demandas a partir das tabelas derivadas. A ingestao
  // pula notas inalteradas, entao este passo e o que materializa o backfill.
  app.post("/api/radar/reconcile", async (c) => {
    if (!validServiceToken(c.req.header("authorization"))) {
      return c.json({ error: "token de servico invalido" }, 401)
    }
    return c.json(await reconcileMirror(db))
  })

  app.use("/api/*", requireAuth)

  app.onError((error, c) => {
    if (error instanceof SyntaxError) {
      return c.json({ error: `requisicao invalida: ${error.message}` }, 400)
    }
    console.error(`erro interno em ${c.req.method} ${c.req.path}:`, error)
    return c.json({ error: "erro interno do servidor" }, 500)
  })

  const health = (c: Context) =>
    c.json({ status: "ok", ok: true, service: "bomdia", version: "3.0.0-dev" })

  app.get("/health", health)
  app.get("/api/health", health)

  // ---------------------------------------------------------------- login ---
  app.get("/login", (c) => {
    if (isAuthenticated(c)) return c.redirect("/")
    return serveIndex(c)
  })

  app.post("/login", async (c) => {
    const ip =
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
      c.req.header("x-real-ip") ||
      "local"
    if (loginRateLimited(ip)) {
      return c.json({ error: "Muitas tentativas. Tente de novo em alguns minutos." }, 429)
    }
    const contentType = c.req.header("content-type") ?? ""
    const isJson = contentType.includes("application/json")
    let username: string
    let password: string
    if (isJson) {
      const body = await readJson(c)
      username = String(body.username ?? "")
      password = String(body.password ?? "")
    } else {
      const form = await c.req.parseBody()
      username = String(form.username ?? "")
      password = String(form.password ?? "")
    }
    const secure = isSecureRequest(
      c.req.header("host") ?? "",
      c.req.header("x-forwarded-proto") ?? "",
    )
    if (!validCredentials(username, password)) {
      if (isJson) return c.json({ error: "Usuário ou senha incorretos." }, 401)
      return c.redirect("/login?erro=1")
    }
    c.header("Set-Cookie", sessionCookie(newSessionToken(), secure))
    if (isJson) return c.json({ ok: true })
    return c.redirect("/")
  })

  app.post("/logout", (c) => {
    const isJson = (c.req.header("content-type") ?? "").includes("application/json")
    const secure = isSecureRequest(
      c.req.header("host") ?? "",
      c.req.header("x-forwarded-proto") ?? "",
    )
    c.header("Set-Cookie", clearSessionCookie(secure))
    if (isJson) return c.json({ ok: true })
    return c.redirect("/login")
  })

  // ---------------------------------------------------------------- tasks ---
  app.get("/api/tasks", async (c) => c.json(await listTasks(db)))

  app.post("/api/tasks", async (c) => {
    const id = await createTask(db, await readJson(c))
    return c.json({ id }, 201)
  })

  app.put("/api/tasks/:id", async (c) => {
    await updateTask(db, Number(c.req.param("id")), await readJson(c))
    return c.json({ ok: true })
  })

  app.delete("/api/tasks/:id", async (c) => {
    await deleteTask(db, Number(c.req.param("id")))
    return c.json({ ok: true })
  })

  app.post("/api/tasks/:id/feito", async (c) => {
    const data = await readJson(c)
    await setRoutineDone(db, Number(c.req.param("id")), Boolean(data.done))
    return c.json({ ok: true })
  })

  app.put("/api/subtasks/:id", async (c) => {
    await updateSubtask(db, Number(c.req.param("id")), await readJson(c))
    return c.json({ ok: true })
  })

  // ------------------------------------------------------------- projects ---
  app.get("/api/projects", async (c) => c.json(await listProjects(db)))

  app.post("/api/projects", async (c) => {
    try {
      const id = await createProject(db, await readJson(c))
      return c.json({ id }, 201)
    } catch (error) {
      return c.json({ error: (error as Error).message }, 400)
    }
  })

  app.put("/api/projects/:id", async (c) => {
    await updateProject(db, Number(c.req.param("id")), await readJson(c))
    return c.json({ ok: true })
  })

  app.delete("/api/projects/:id", async (c) => {
    await deleteProject(db, Number(c.req.param("id")))
    return c.json({ ok: true })
  })

  app.get("/api/projects/:id/notes", async (c) =>
    c.json(await listNotes(db, Number(c.req.param("id")))),
  )

  app.post("/api/projects/:id/notes", async (c) => {
    const id = await createNote(db, Number(c.req.param("id")), await readJson(c))
    return c.json({ id }, 201)
  })

  app.put("/api/notes/:id", async (c) => {
    await updateNote(db, Number(c.req.param("id")), await readJson(c))
    return c.json({ ok: true })
  })

  app.delete("/api/notes/:id", async (c) => {
    await deleteNote(db, Number(c.req.param("id")))
    return c.json({ ok: true })
  })

  // ---------------------------------------------------------- attachments ---
  app.get("/api/attachments", async (c) => {
    const ownerType = (c.req.query("owner_type") ?? "").trim()
    const ownerId = (c.req.query("owner_id") ?? "").trim()
    if (!["task", "project"].includes(ownerType) || !/^\d+$/.test(ownerId)) {
      return c.json({ error: "parametros invalidos" }, 400)
    }
    return c.json({ attachments: await listAttachments(db, ownerType, Number(ownerId)) })
  })

  app.get("/api/attachments/:id/download", async (c) => {
    const att = await getAttachment(db, Number(c.req.param("id")))
    if (!att) return c.json({ error: "anexo nao encontrado" }, 404)
    if (!r2Enabled()) return c.json({ error: "armazenamento indisponivel" }, 503)
    let upstream: Response
    try {
      upstream = await r2Get(att.key)
    } catch (error) {
      console.error(`erro download R2 ${att.key}: ${(error as Error).message}`)
      return c.json({ error: "arquivo indisponivel" }, 502)
    }
    const contentType = att.content_type || "application/octet-stream"
    const inlineOk = contentType.startsWith("image/") && contentType !== "image/svg+xml"
    const filename = (att.filename || "arquivo").replaceAll('"', "")
    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `${inlineOk ? "inline" : "attachment"}; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(att.filename || "arquivo")}`,
      },
    })
  })

  app.post("/api/attachments", async (c) => {
    if (!r2Enabled()) {
      return c.json({ error: "Armazenamento de arquivos nao configurado no servidor." }, 503)
    }
    const length = Number(c.req.header("content-length") ?? 0)
    if (length > MAX_UPLOAD_BYTES + 1_000_000) {
      return c.json({ error: `envio acima do limite de ${MAX_UPLOAD_MB} MB` }, 413)
    }
    const body = await c.req.parseBody()
    const ownerType = String(body.owner_type ?? "").trim()
    const ownerId = String(body.owner_id ?? "").trim()
    if (!["task", "project"].includes(ownerType) || !/^\d+$/.test(ownerId)) {
      return c.json({ error: "destino invalido" }, 400)
    }
    const files = Object.values(body).filter((value): value is File => value instanceof File)
    const incoming = files.filter((file) => file.name.trim() && file.size > 0)
    if (!incoming.length) return c.json({ error: "Nenhum arquivo recebido." }, 400)
    const saved = []
    for (const file of incoming) {
      if (file.size > MAX_UPLOAD_BYTES) {
        return c.json({ error: `'${file.name}' passa de ${MAX_UPLOAD_MB} MB.` }, 413)
      }
      const contentType = file.type || "application/octet-stream"
      const key = buildKey(ownerType, Number(ownerId), file.name)
      try {
        await r2Put(key, new Uint8Array(await file.arrayBuffer()), contentType)
      } catch (error) {
        console.error(`erro upload R2: ${(error as Error).message}`)
        return c.json({ error: "Falha ao enviar ao armazenamento." }, 502)
      }
      const attId = await createAttachment(
        db,
        ownerType,
        Number(ownerId),
        safeName(file.name),
        key,
        contentType,
        file.size,
      )
      saved.push(publicAttachment(await getAttachment(db, attId)))
    }
    return c.json({ attachments: saved }, 201)
  })

  app.delete("/api/attachments/:id", async (c) => {
    await deleteAttachment(db, Number(c.req.param("id")), r2Delete)
    return c.json({ ok: true })
  })

  // ------------------------------------------------------------------- ai ---
  app.get("/api/ai/status", async (c) => {
    const cfg = await loadConfig(db)
    return c.json({
      configured: apiKeyOk(cfg.openaiApiKey),
      model: cfg.model,
      name: cfg.name,
      env: APP_ENV,
      local: false,
      storage: r2Enabled(),
      max_upload_mb: MAX_UPLOAD_MB,
    })
  })

  app.post("/api/ai/config", async (c) => {
    const data = await readJson(c)
    const incoming =
      data.nvidia_api_key && !data.openai_api_key
        ? { ...data, openai_api_key: data.nvidia_api_key }
        : data
    await saveConfig(db, {
      name: typeof incoming.name === "string" ? incoming.name : undefined,
      openai_api_key:
        typeof incoming.openai_api_key === "string" ? incoming.openai_api_key : undefined,
      model: typeof incoming.model === "string" ? incoming.model : undefined,
    })
    const cfg = await loadConfig(db)
    return c.json({ configured: apiKeyOk(cfg.openaiApiKey), name: cfg.name })
  })

  app.post("/api/ai/parse", async (c) => {
    const data = await readJson(c)
    const text = String(data.text ?? "").trim()
    if (!text) return c.json({ error: "Escreva algo para eu organizar." }, 400)
    let tarefas
    try {
      tarefas = await aiParse(db, text)
    } catch (error) {
      console.error(`erro OpenAI (parse): ${(error as Error).message}`)
      return c.json({ error: (error as Error).message }, 502)
    }
    const projetos = await listProjectNames(db)
    return c.json({
      tarefas: tarefas.map((t) => ({ ...t, perguntas: buildGaps(t, projetos) })),
      projetos,
    })
  })

  app.post("/api/ai/whatsapp", async (c) => {
    const data = await readJson(c)
    const task = (data.task ?? {}) as Record<string, unknown>
    if (!String(task.title ?? "").trim()) {
      return c.json({ error: "Preciso de uma tarefa com titulo pra montar o recado." }, 400)
    }
    try {
      const mensagem = await aiWhatsapp(db, task, String(data.modo ?? "avisar"))
      return c.json({ mensagem })
    } catch (error) {
      console.error(`erro OpenAI (whatsapp): ${(error as Error).message}`)
      return c.json({ error: (error as Error).message }, 502)
    }
  })

  // ------------------------------------------------------------------- radar ---
  app.get("/api/radar", async (c) => c.json(await radarDigest(db)))

  app.all("/api/*", (c) => c.json({ error: "rota nao encontrada" }, 404))

  // ------------------------------------------------------------- estaticos ---
  app.on(["GET", "HEAD"], "*", async (c) => {
    const urlPath = decodeURIComponent(c.req.path)
    const rel = normalize(urlPath.replace(/^\/+/, "") || "index.html").replaceAll("\\", "/")
    if (rel.split("/").includes("..")) return c.json({ error: "nao encontrado" }, 404)
    const full = join(DIST_DIR, rel)
    try {
      const data = await readFile(full)
      const headers = { "Content-Type": getMimeType(full) || "application/octet-stream" }
      if (c.req.method === "HEAD") return c.body(null, 200, headers)
      return c.body(data, 200, headers)
    } catch {
      const lastSegment = rel.split("/").pop() ?? ""
      if (urlPath !== "/" && lastSegment.includes(".")) {
        return c.json({ error: "nao encontrado" }, 404)
      }
      return serveIndex(c)
    }
  })

  return app
}
