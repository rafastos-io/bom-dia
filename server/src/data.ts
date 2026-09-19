import { sql, type SQL } from "drizzle-orm"
import type { Database } from "./db/client.js"
import { r2Enabled } from "./config.js"
import { r2Delete } from "./r2.js"
import { IDEA_TARGET_TIPOS, advanceDate, cleanRecorrencia, nowIso, periodoAtual } from "./rules.js"

export type TaskRow = {
  id: number
  title: string
  requested_by: string | null
  send_to: string | null
  due_date: string | null
  priority: string | null
  description: string | null
  status: string | null
  created_at: string | null
  tipo: string | null
  projeto: string | null
  recorrencia: string | null
  feito_em: string | null
}

export type LinkRow = { id: number; task_id: number; kind: string; label: string | null; target: string }
export type SubtaskRow = { id: number; task_id: number; title: string; done: number; position: number }
export type IdeaLinkRow = {
  id: number
  target_type: string
  target_id: number
  label?: string
  target_tipo?: string | null
}

function str(value: unknown): string {
  return String(value ?? "").trim()
}

export function taskToDict(row: TaskRow, links: LinkRow[], subtasks: SubtaskRow[]) {
  const rec = row.recorrencia || ""
  return {
    ...row,
    links,
    subtasks,
    feita: Boolean(rec) && (row.feito_em || "") === periodoAtual(rec),
  }
}

export async function listTasks(db: Database) {
  // Queries em lote (sem N+1): o banco fica remoto (Turso) em producao.
  const tasks = await db.all<TaskRow>(
    sql`SELECT * FROM tasks ORDER BY
        CASE status WHEN 'concluida' THEN 1 ELSE 0 END,
        CASE priority WHEN 'alta' THEN 0 WHEN 'media' THEN 1 ELSE 2 END,
        COALESCE(due_date, '9999-12-31') ASC, id DESC`,
  )
  const allLinks = await db.all<LinkRow>(sql`SELECT * FROM links ORDER BY id`)
  const allSubs = await db.all<SubtaskRow>(
    sql`SELECT id, task_id, title, done, position FROM subtasks ORDER BY position, id`,
  )
  const counts = await db.all<{ owner_id: number; n: number }>(
    sql`SELECT owner_id, COUNT(*) AS n FROM attachments WHERE owner_type = 'task' GROUP BY owner_id`,
  )
  const ideaRows = await db.all<{
    id: number
    idea_id: number
    target_type: string
    target_id: number
  }>(sql`SELECT id, idea_id, target_type, target_id FROM idea_links ORDER BY id`)
  const projectRows = await db.all<{ id: number; name: string }>(
    sql`SELECT id, name FROM projects`,
  )

  const linksByTask = new Map<number, LinkRow[]>()
  for (const link of allLinks) {
    const list = linksByTask.get(Number(link.task_id)) ?? []
    list.push(link)
    linksByTask.set(Number(link.task_id), list)
  }
  const subsByTask = new Map<number, SubtaskRow[]>()
  for (const sub of allSubs) {
    const list = subsByTask.get(Number(sub.task_id)) ?? []
    list.push(sub)
    subsByTask.set(Number(sub.task_id), list)
  }
  const countByTask = new Map(counts.map((c) => [Number(c.owner_id), Number(c.n)]))
  const projectNames = new Map(projectRows.map((p) => [Number(p.id), p.name]))
  const taskById = new Map(tasks.map((t) => [Number(t.id), t]))

  const ideasByIdea = new Map<number, IdeaLinkRow[]>()
  for (const row of ideaRows) {
    const item: IdeaLinkRow = {
      id: row.id,
      target_type: row.target_type,
      target_id: Number(row.target_id),
    }
    if (row.target_type === "projeto") {
      const name = projectNames.get(Number(row.target_id))
      if (!name) continue
      item.label = name
    } else {
      const target = taskById.get(Number(row.target_id))
      if (!target) continue
      item.label = target.title
      item.target_tipo = target.tipo
    }
    const list = ideasByIdea.get(Number(row.idea_id)) ?? []
    list.push(item)
    ideasByIdea.set(Number(row.idea_id), list)
  }

  return tasks.map((task) => ({
    ...taskToDict(task, linksByTask.get(Number(task.id)) ?? [], subsByTask.get(Number(task.id)) ?? []),
    idea_links: (task.tipo || "") === "ideia" ? (ideasByIdea.get(Number(task.id)) ?? []) : [],
    attach_count: countByTask.get(Number(task.id)) ?? 0,
  }))
}

async function replaceSubtasks(db: Database, taskId: number, items: unknown[]): Promise<void> {
  await db.run(sql`DELETE FROM subtasks WHERE task_id = ${taskId}`)
  let position = 0
  for (const item of items ?? []) {
    let title = ""
    let done = 0
    if (typeof item === "string") title = item.trim()
    else if (typeof item === "object" && item !== null) {
      const obj = item as Record<string, unknown>
      title = str(obj.title)
      done = obj.done ? 1 : 0
    }
    if (!title) continue
    await db.run(
      sql`INSERT INTO subtasks (task_id, title, done, position) VALUES (${taskId}, ${title}, ${done}, ${position})`,
    )
    position += 1
  }
}

async function replaceIdeaLinks(db: Database, ideaId: number, items: unknown[]): Promise<void> {
  await db.run(sql`DELETE FROM idea_links WHERE idea_id = ${ideaId}`)
  const seen = new Set<string>()
  for (const item of items ?? []) {
    if (typeof item !== "object" || item === null) continue
    const obj = item as Record<string, unknown>
    const targetType = String(obj.target_type ?? "")
    const targetId = Number(obj.target_id)
    if (!IDEA_TARGET_TIPOS.has(targetType) || !Number.isFinite(targetId) || targetId === ideaId) continue
    const key = `${targetType}:${targetId}`
    if (seen.has(key)) continue
    seen.add(key)
    await db.run(
      sql`INSERT INTO idea_links (idea_id, target_type, target_id) VALUES (${ideaId}, ${targetType}, ${targetId})`,
    )
  }
}

export async function ensureProject(db: Database, name: string): Promise<void> {
  const clean = str(name)
  if (!clean) return
  const existing = await db.get(
    sql`SELECT 1 AS ok FROM projects WHERE LOWER(name) = LOWER(${clean})`,
  )
  if (!existing) {
    await db.run(sql`INSERT INTO projects (name, created_at) VALUES (${clean}, ${nowIso()})`)
  }
}

async function insertLinks(db: Database, taskId: number, links: unknown[]): Promise<void> {
  for (const item of links ?? []) {
    if (typeof item !== "object" || item === null) continue
    const link = item as Record<string, unknown>
    const target = str(link.target)
    if (!target) continue
    await db.run(
      sql`INSERT INTO links (task_id, kind, label, target) VALUES (${taskId}, ${link.kind === "pasta" ? "pasta" : "web"}, ${str(link.label)}, ${target})`,
    )
  }
}

export async function createTask(db: Database, data: Record<string, unknown>): Promise<number> {
  const tipo = TIPOS_HAS(String(data.tipo)) ? String(data.tipo) : "tarefa"
  const projeto = str(data.projeto)
  const recorrencia = cleanRecorrencia(data.recorrencia, tipo)
  const status = str(data.status) || "aberta"
  const result = await db.run(
    sql`INSERT INTO tasks (title, requested_by, send_to, due_date, priority, description, status,
                          created_at, tipo, projeto, recorrencia, feito_em, completed_at, estimate_min)
        VALUES (${str(data.title) || "Sem titulo"}, ${str(data.requested_by)}, ${str(data.send_to)},
                ${str(data.due_date)}, ${str(data.priority) || "media"}, ${str(data.description)},
                ${status}, ${nowIso()}, ${tipo}, ${projeto}, ${recorrencia},
                ${data.feita && recorrencia ? periodoAtual(recorrencia) : ""},
                ${status === "concluida" ? nowIso() : ""},
                ${Number(data.estimate_min) || 0})`,
  )
  const taskId = Number(result.lastInsertRowid)
  await insertLinks(db, taskId, (data.links as unknown[]) ?? [])
  await replaceSubtasks(db, taskId, (data.subtasks as unknown[]) ?? [])
  if (tipo === "ideia") {
    await replaceIdeaLinks(db, taskId, (data.idea_links as unknown[]) ?? [])
  }
  await ensureProject(db, projeto)
  return taskId
}

function TIPOS_HAS(value: string): boolean {
  return value === "tarefa" || value === "ideia" || value === "rotina"
}

const TASK_FIELDS = [
  "title",
  "requested_by",
  "send_to",
  "due_date",
  "priority",
  "description",
  "status",
  "tipo",
  "projeto",
] as const

export async function updateTask(
  db: Database,
  taskId: number,
  data: Record<string, unknown>,
): Promise<void> {
  const current = await db.get<{
    tipo: string | null
    recorrencia: string | null
    status: string | null
  }>(sql`SELECT tipo, recorrencia, status FROM tasks WHERE id = ${taskId}`)

  const sets: SQL[] = []
  for (const field of TASK_FIELDS) {
    if (field in data) sets.push(sql`${sql.raw(field)} = ${data[field]}`)
  }
  if ("estimate_min" in data) {
    sets.push(sql`estimate_min = ${Number(data.estimate_min) || 0}`)
  }
  if ("recorrencia" in data || "tipo" in data) {
    if (current) {
      const tipoFinal = TIPOS_HAS(String(data.tipo ?? current.tipo))
        ? String(data.tipo ?? current.tipo)
        : "tarefa"
      const recFinal =
        "recorrencia" in data
          ? cleanRecorrencia(data.recorrencia, tipoFinal)
          : tipoFinal === "rotina" || tipoFinal === "tarefa"
            ? current.recorrencia || ""
            : ""
      if ("recorrencia" in data || recFinal !== (current.recorrencia || "")) {
        sets.push(sql`recorrencia = ${recFinal}`)
        if (recFinal !== (current.recorrencia || "")) {
          sets.push(sql`feito_em = ${""}`)
        }
      }
    }
  }
  // Data real de conclusão (para o gráfico de fluxo/revisão da semana).
  if ("status" in data && current) {
    const nextStatus = str(data.status)
    const wasDone = (current.status || "aberta") === "concluida"
    if (nextStatus === "concluida" && !wasDone) sets.push(sql`completed_at = ${nowIso()}`)
    else if (nextStatus !== "concluida" && wasDone) sets.push(sql`completed_at = ${""}`)
  }
  if (sets.length) {
    await db.run(sql`UPDATE tasks SET ${sql.join(sets, sql`, `)} WHERE id = ${taskId}`)
  }
  if ("links" in data) {
    await db.run(sql`DELETE FROM links WHERE task_id = ${taskId}`)
    await insertLinks(db, taskId, (data.links as unknown[]) ?? [])
  }
  if ("subtasks" in data) {
    await replaceSubtasks(db, taskId, (data.subtasks as unknown[]) ?? [])
  }
  const tipoRow = await db.get<{ tipo: string | null }>(
    sql`SELECT tipo FROM tasks WHERE id = ${taskId}`,
  )
  if (tipoRow && (tipoRow.tipo || "") !== "ideia") {
    await db.run(sql`DELETE FROM idea_links WHERE idea_id = ${taskId}`)
  } else if ("idea_links" in data) {
    await replaceIdeaLinks(db, taskId, (data.idea_links as unknown[]) ?? [])
  }
  if ("projeto" in data) {
    await ensureProject(db, str(data.projeto))
  }

  // Recorrência de tarefa: ao concluir, gera a próxima ocorrência automaticamente.
  if (current && "status" in data && str(data.status) === "concluida") {
    const wasDone = (current.status || "aberta") === "concluida"
    const tipoFinal = TIPOS_HAS(String(data.tipo ?? current.tipo))
      ? String(data.tipo ?? current.tipo)
      : "tarefa"
    const recFinal =
      "recorrencia" in data
        ? cleanRecorrencia(data.recorrencia, tipoFinal)
        : current.recorrencia || ""
    if (!wasDone && tipoFinal === "tarefa" && recFinal) {
      await spawnNextOccurrence(db, taskId, recFinal)
    }
  }
}

/** Copia a tarefa recorrente para a próxima data (subtarefas sem check, links juntos). */
async function spawnNextOccurrence(
  db: Database,
  taskId: number,
  recorrencia: string,
): Promise<number> {
  const row = await db.get<{ due_date: string | null }>(
    sql`SELECT due_date FROM tasks WHERE id = ${taskId}`,
  )
  const nextDue = advanceDate(str(row?.due_date), recorrencia)
  const result = await db.run(
    sql`INSERT INTO tasks (title, requested_by, send_to, due_date, priority, description, status,
                           created_at, tipo, projeto, recorrencia, feito_em, completed_at, estimate_min)
        SELECT title, requested_by, send_to, ${nextDue}, priority, description, 'aberta',
               ${nowIso()}, tipo, projeto, recorrencia, '', '', estimate_min
        FROM tasks WHERE id = ${taskId}`,
  )
  const newId = Number(result.lastInsertRowid)
  await db.run(
    sql`INSERT INTO links (task_id, kind, label, target)
        SELECT ${newId}, kind, label, target FROM links WHERE task_id = ${taskId}`,
  )
  await db.run(
    sql`INSERT INTO subtasks (task_id, title, done, position)
        SELECT ${newId}, title, 0, position FROM subtasks WHERE task_id = ${taskId}`,
  )
  return newId
}

export async function updateSubtask(
  db: Database,
  subId: number,
  data: Record<string, unknown>,
): Promise<void> {
  if ("done" in data) {
    await db.run(sql`UPDATE subtasks SET done = ${data.done ? 1 : 0} WHERE id = ${subId}`)
  }
  if ("title" in data) {
    await db.run(sql`UPDATE subtasks SET title = ${str(data.title)} WHERE id = ${subId}`)
  }
}

export async function setRoutineDone(db: Database, taskId: number, done: boolean): Promise<void> {
  const row = await db.get<{ recorrencia: string | null }>(
    sql`SELECT recorrencia FROM tasks WHERE id = ${taskId}`,
  )
  if (row && (row.recorrencia || "")) {
    const value = done ? periodoAtual(row.recorrencia || "") : ""
    await db.run(sql`UPDATE tasks SET feito_em = ${value} WHERE id = ${taskId}`)
  }
}

export async function deleteTask(db: Database, taskId: number): Promise<void> {
  await deleteAttachmentsFor(db, "task", taskId)
  await db.run(sql`DELETE FROM links WHERE task_id = ${taskId}`)
  await db.run(sql`DELETE FROM subtasks WHERE task_id = ${taskId}`)
  await db.run(sql`DELETE FROM idea_links WHERE idea_id = ${taskId}`)
  await db.run(
    sql`DELETE FROM idea_links WHERE target_type IN ('rotina','tarefa') AND target_id = ${taskId}`,
  )
  await db.run(sql`DELETE FROM tasks WHERE id = ${taskId}`)
}

// ---------------------------------------------------------------------------
// Projetos
// ---------------------------------------------------------------------------

type ProjectRow = {
  id: number
  name: string
  scope: string | null
  people: string | null
  status: string | null
  collapsed: number | null
  position: number | null
  created_at: string | null
}

export async function listProjects(db: Database) {
  // Em lote: turso fica remoto em producao (sem N+1 por projeto).
  const projects = await db.all<ProjectRow>(
    sql`SELECT * FROM projects ORDER BY position, LOWER(name)`,
  )
  const allLinks = await db.all<{
    id: number
    project_id: number
    kind: string
    label: string | null
    target: string
    grupo: string
  }>(
    sql`SELECT id, project_id, kind, label, target, COALESCE(grupo,'') AS grupo
        FROM project_links ORDER BY id`,
  )
  const counts = await db.all<{ projeto: string | null; total: number; ativas: number | null }>(
    sql`SELECT projeto, COUNT(*) AS total,
               SUM(CASE WHEN status = 'concluida' THEN 0 ELSE 1 END) AS ativas
        FROM tasks GROUP BY projeto`,
  )
  const linksByProject = new Map<number, typeof allLinks>()
  for (const link of allLinks) {
    const list = linksByProject.get(Number(link.project_id)) ?? []
    list.push(link)
    linksByProject.set(Number(link.project_id), list)
  }
  const countByName = new Map(counts.map((c) => [c.projeto ?? "", c]))
  return projects.map((project) => {
    const count = countByName.get(project.name)
    return {
      ...project,
      links: linksByProject.get(Number(project.id)) ?? [],
      task_total: Number(count?.total ?? 0),
      task_ativas: Number(count?.ativas ?? 0),
    }
  })
}

async function replaceProjectLinks(db: Database, projectId: number, links: unknown[]): Promise<void> {
  await db.run(sql`DELETE FROM project_links WHERE project_id = ${projectId}`)
  for (const item of links ?? []) {
    if (typeof item !== "object" || item === null) continue
    const link = item as Record<string, unknown>
    const target = str(link.target)
    if (!target) continue
    await db.run(
      sql`INSERT INTO project_links (project_id, kind, label, target, grupo)
          VALUES (${projectId}, ${link.kind === "pasta" ? "pasta" : "web"}, ${str(link.label)}, ${target}, ${str(link.grupo)})`,
    )
  }
}

export async function createProject(db: Database, data: Record<string, unknown>): Promise<number> {
  const name = str(data.name)
  if (!name) throw new Error("Nome do projeto vazio")
  const existing = await db.get<{ id: number }>(
    sql`SELECT id FROM projects WHERE LOWER(name) = LOWER(${name})`,
  )
  let pid: number
  if (existing) {
    pid = Number(existing.id)
    await db.run(
      sql`UPDATE projects SET scope = ${str(data.scope)}, people = ${str(data.people)} WHERE id = ${pid}`,
    )
  } else {
    const result = await db.run(
      sql`INSERT INTO projects (name, scope, people, created_at) VALUES (${name}, ${str(data.scope)}, ${str(data.people)}, ${nowIso()})`,
    )
    pid = Number(result.lastInsertRowid)
  }
  await replaceProjectLinks(db, pid, (data.links as unknown[]) ?? [])
  return pid
}

export async function updateProject(
  db: Database,
  projectId: number,
  data: Record<string, unknown>,
): Promise<void> {
  const old = await db.get<{ name: string }>(sql`SELECT name FROM projects WHERE id = ${projectId}`)
  if (!old) return
  const sets: SQL[] = []
  for (const field of ["name", "scope", "people", "status"] as const) {
    if (field in data) sets.push(sql`${sql.raw(field)} = ${str(data[field])}`)
  }
  if ("collapsed" in data) sets.push(sql`collapsed = ${data.collapsed ? 1 : 0}`)
  if (sets.length) {
    await db.run(sql`UPDATE projects SET ${sql.join(sets, sql`, `)} WHERE id = ${projectId}`)
  }
  const newName = str(data.name)
  if (newName && newName !== old.name) {
    await db.run(sql`UPDATE tasks SET projeto = ${newName} WHERE projeto = ${old.name}`)
  }
  if ("links" in data) {
    await replaceProjectLinks(db, projectId, (data.links as unknown[]) ?? [])
  }
}

export async function deleteProject(db: Database, projectId: number): Promise<void> {
  await deleteAttachmentsFor(db, "project", projectId)
  const project = await db.get<{ name: string }>(
    sql`SELECT name FROM projects WHERE id = ${projectId}`,
  )
  if (project) {
    await db.run(sql`UPDATE tasks SET projeto = '' WHERE projeto = ${project.name}`)
  }
  await db.run(sql`DELETE FROM idea_links WHERE target_type = 'projeto' AND target_id = ${projectId}`)
  await db.run(sql`DELETE FROM project_links WHERE project_id = ${projectId}`)
  await db.run(sql`DELETE FROM project_notes WHERE project_id = ${projectId}`)
  await db.run(sql`DELETE FROM projects WHERE id = ${projectId}`)
}

// ---------------------------------------------------------------------------
// Anotacoes do projeto
// ---------------------------------------------------------------------------

export async function listNotes(db: Database, projectId: number) {
  return db.all<{
    id: number
    project_id: number
    title: string | null
    body: string | null
    position: number | null
    updated_at: string | null
  }>(
    sql`SELECT id, project_id, title, body, position, updated_at
        FROM project_notes WHERE project_id = ${projectId} ORDER BY position, id`,
  )
}

export async function createNote(
  db: Database,
  projectId: number,
  data: Record<string, unknown>,
): Promise<number> {
  const now = nowIso()
  const title = str(data.title) || "Nova anotação"
  const result = await db.run(
    sql`INSERT INTO project_notes (project_id, title, body, created_at, updated_at)
        VALUES (${projectId}, ${title}, ${String(data.body ?? "")}, ${now}, ${now})`,
  )
  return Number(result.lastInsertRowid)
}

export async function updateNote(
  db: Database,
  noteId: number,
  data: Record<string, unknown>,
): Promise<void> {
  const sets: SQL[] = []
  if ("title" in data) sets.push(sql`title = ${str(data.title) || "Sem título"}`)
  if ("body" in data) sets.push(sql`body = ${String(data.body ?? "")}`)
  if (sets.length) {
    sets.push(sql`updated_at = ${nowIso()}`)
    await db.run(sql`UPDATE project_notes SET ${sql.join(sets, sql`, `)} WHERE id = ${noteId}`)
  }
}

export async function deleteNote(db: Database, noteId: number): Promise<void> {
  await db.run(sql`DELETE FROM project_notes WHERE id = ${noteId}`)
}

// ---------------------------------------------------------------------------
// Anexos
// ---------------------------------------------------------------------------

export type AttachmentRow = {
  id: number
  owner_type: string
  owner_id: number
  filename: string
  key: string
  content_type: string | null
  size: number | null
  created_at: string | null
}

export type PublicAttachment = Omit<AttachmentRow, "key">

export function publicAttachment(row: AttachmentRow | null): PublicAttachment | null {
  if (!row) return null
  const { key: _key, ...rest } = row
  void _key
  return rest
}

export async function listAttachments(db: Database, ownerType: string, ownerId: number) {
  return db.all<PublicAttachment>(
    sql`SELECT id, owner_type, owner_id, filename, content_type, size, created_at
        FROM attachments WHERE owner_type = ${ownerType} AND owner_id = ${ownerId} ORDER BY id DESC`,
  )
}

export async function getAttachment(db: Database, attId: number): Promise<AttachmentRow | null> {
  const row = await db.get<AttachmentRow>(sql`SELECT * FROM attachments WHERE id = ${attId}`)
  return row ?? null
}

export async function createAttachment(
  db: Database,
  ownerType: string,
  ownerId: number,
  filename: string,
  key: string,
  contentType: string,
  size: number,
): Promise<number> {
  const result = await db.run(
    sql`INSERT INTO attachments (owner_type, owner_id, filename, key, content_type, size, created_at)
        VALUES (${ownerType}, ${ownerId}, ${filename}, ${key}, ${contentType}, ${size}, ${nowIso()})`,
  )
  return Number(result.lastInsertRowid)
}

export async function deleteAttachment(
  db: Database,
  attId: number,
  removeObject: (key: string) => Promise<void>,
): Promise<boolean> {
  const att = await getAttachment(db, attId)
  if (!att) return false
  try {
    await removeObject(att.key)
  } catch (error) {
    console.warn(`aviso: falha ao apagar do R2 ${att.key}: ${(error as Error).message}`)
  }
  await db.run(sql`DELETE FROM attachments WHERE id = ${attId}`)
  return true
}

export async function deleteAttachmentsFor(
  db: Database,
  ownerType: string,
  ownerId: number,
): Promise<void> {
  const rows = await db.all<{ id: number; key: string }>(
    sql`SELECT id, key FROM attachments WHERE owner_type = ${ownerType} AND owner_id = ${ownerId}`,
  )
  if (!rows.length) return
  if (r2Enabled()) {
    for (const row of rows) {
      try {
        await r2Delete(row.key)
      } catch (error) {
        console.warn(`aviso: falha ao apagar do R2 ${row.key}: ${(error as Error).message}`)
      }
    }
  }
  await db.run(
    sql`DELETE FROM attachments WHERE owner_type = ${ownerType} AND owner_id = ${ownerId}`,
  )
}

// ---------------------------------------------------------------------------
// Projetos sugeridos (nomes ja usados em tarefas)
// ---------------------------------------------------------------------------

export async function listProjectNames(db: Database): Promise<string[]> {
  const rows = await db.all<{ projeto: string | null }>(
    sql`SELECT DISTINCT projeto FROM tasks WHERE projeto IS NOT NULL AND TRIM(projeto) <> ''`,
  )
  return rows
    .map((row) => str(row.projeto))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }))
}
