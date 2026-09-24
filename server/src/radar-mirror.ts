/**
 * Espelho de demandas da CENTRAL no Bom Dia (Fase 2 — F1).
 *
 * A CENTRAL continua a fonte da verdade; nada aqui escreve no vault. Cada nota
 * ativa de produto/projeto vira um projeto no Bom Dia e suas pendencias viram
 * tarefas; entradas que somem fecham a tarefa e, se o item reaparecer, ela
 * reabre. O diario so fecha (via `**Concluido:**`) ou registra tarefa concluida;
 * notas `decisao` entram como tarefas concluidas (janela de 60 dias no backfill).
 *
 * Regras de identidade: uma entrada e `(note_path, item_hash)`; o mesmo texto em
 * duas notas e uma tarefa por nota. Parafrases viram subtarefas (assembler).
 */

import { sql } from "drizzle-orm"
import type { Database } from "./db/client.js"
import {
  isClosedNoteStatus,
  itemHash,
  type RadarNoteInput,
  type RadarSubtaskInput,
} from "./radar-common.js"

export type MirrorReport = {
  projects: number
  created: number
  updated: number
  closed: number
  reopened: number
  subtasks: number
}

export type RemovedEntry = { kind: string; text: string; section: string; itemHash: string }

export function emptyMirrorReport(): MirrorReport {
  return { projects: 0, created: 0, updated: 0, closed: 0, reopened: 0, subtasks: 0 }
}

export function mergeMirrorReport(target: MirrorReport, part: MirrorReport): void {
  target.projects += part.projects
  target.created += part.created
  target.updated += part.updated
  target.closed += part.closed
  target.reopened += part.reopened
  target.subtasks += part.subtasks
}

/** Similaridade minima para assumir que o texto mudou mas o item e o mesmo. */
const TAKE_OVER_THRESHOLD = 0.75
/** Similaridade minima para juntar parafrases como subtarefa de uma tarefa. */
const MERGE_THRESHOLD = 0.6
/** Janela do backfill de decisoes, em dias. */
export const DECISION_BACKFILL_DAYS = 60

// ---------------------------------------------------------------- similaridade

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function tokens(value: string): Set<string> {
  return new Set(
    normalizeText(value)
      .split(" ")
      .filter((token) => token.length >= 3),
  )
}

function bigrams(value: string): Set<string> {
  const text = normalizeText(value).replaceAll(" ", "")
  const out = new Set<string>()
  for (let index = 0; index < text.length - 1; index += 1) {
    out.add(text.slice(index, index + 2))
  }
  return out
}

function dice(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0
  let common = 0
  for (const value of a) if (b.has(value)) common += 1
  return (2 * common) / (a.size + b.size)
}

/** Coeficiente de Dice (bigramas) ou contencao de tokens — o maior dos dois. */
export function similarity(a: string, b: string): number {
  const ta = tokens(a)
  const tb = tokens(b)
  let common = 0
  for (const value of ta) if (tb.has(value)) common += 1
  const containment = common / Math.max(1, Math.min(ta.size, tb.size))
  return Math.max(dice(bigrams(a), bigrams(b)), containment)
}

// ------------------------------------------------------------------ candidatos

type Candidate = {
  kind: "aberto" | "proxima_acao"
  text: string
  date: string
  section: string
  itemHash: string
  subtasks: RadarSubtaskInput[]
  priority: number
}

const SOURCE_PRIORITY: Array<{ prefix: string; priority: number }> = [
  { prefix: "estado atual", priority: 0 },
  { prefix: "proximas acoes", priority: 1 },
  { prefix: "ultima sessao", priority: 2 },
  { prefix: "marcos", priority: 3 },
  { prefix: "pendencias", priority: 4 },
]

function sourcePriority(section: string): number {
  const key = normalizeText(section)
  for (const source of SOURCE_PRIORITY) {
    if (key.startsWith(source.prefix)) return source.priority
  }
  return 5
}

function openCandidates(note: RadarNoteInput): Candidate[] {
  const out: Candidate[] = []
  for (const entry of note.entries) {
    if (entry.kind !== "aberto" && entry.kind !== "proxima_acao") continue
    out.push({
      kind: entry.kind,
      text: entry.text,
      date: entry.date || note.updatedAt,
      section: entry.section,
      itemHash: itemHash(note.path, entry.kind, entry.text),
      subtasks: entry.subtasks,
      priority: sourcePriority(entry.section),
    })
  }
  // Fonte mais especifica primeiro (estavel: preserva a ordem da nota).
  return out
    .map((candidate, index) => ({ candidate, index }))
    .sort((a, b) => a.candidate.priority - b.candidate.priority || a.index - b.index)
    .map((item) => item.candidate)
}

// --------------------------------------------------------------------- helpers

type LinkRow = {
  id: number
  task_id: number
  note_path: string
  kind: string
  item_hash: string
  state: string | null
  text: string | null
  section: string | null
  entry_date: string | null
  subtasks: string | null
}

async function projectNameById(db: Database, projectId: number): Promise<string> {
  const row = await db.get<{ name: string }>(sql`SELECT name FROM projects WHERE id = ${projectId}`)
  return row?.name ?? ""
}

function buildDescription(candidate: Candidate, note: RadarNoteInput): string {
  const origin = [note.title, candidate.section].filter(Boolean).join(" · ")
  return [candidate.text, "", `— ${origin}`, `CENTRAL: ${note.path}`].join("\n")
}

/** Titulo exibivel: resolve wikilinks (`[[x|y]]` → `y`) e encurta o excesso. */
function displayTitle(value: string): string {
  const cleaned = value
    .replace(
      /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
      (_match, target: string, label?: string) =>
        (label || target.split("/").pop() || target).trim(),
    )
    .replace(/\s+/g, " ")
    .trim()
  return cleaned.length > 180 ? `${cleaned.slice(0, 177)}…` : cleaned
}

function extractUrls(text: string): string[] {
  const matches = text.match(/https?:\/\/[^\s)\]]+/g) ?? []
  return [...new Set(matches)].slice(0, 10)
}

async function insertTaskLinks(db: Database, taskId: number, text: string): Promise<void> {
  for (const target of extractUrls(text)) {
    await db.run(
      sql`INSERT INTO links (task_id, kind, label, target) VALUES (${taskId}, 'web', '', ${target})`,
    )
  }
}

async function insertSubtasks(
  db: Database,
  taskId: number,
  subtasks: RadarSubtaskInput[],
  report: MirrorReport,
): Promise<void> {
  let position = 0
  for (const subtask of subtasks) {
    const title = subtask.text.trim().slice(0, 300)
    if (!title) continue
    await db.run(
      sql`INSERT INTO subtasks (task_id, title, done, position) VALUES (${taskId}, ${title}, ${subtask.done ? 1 : 0}, ${position})`,
    )
    position += 1
    report.subtasks += 1
  }
}

async function insertLink(
  db: Database,
  taskId: number,
  notePath: string,
  candidate: { kind: string; text: string; date: string; section: string; itemHash: string; subtasks: RadarSubtaskInput[] },
  state: string,
  nowText: string,
): Promise<void> {
  await db.run(sql`
    INSERT OR IGNORE INTO central_task_links
      (task_id, note_path, kind, item_hash, state, text, section, entry_date, subtasks, created_at, updated_at)
    VALUES
      (${taskId}, ${notePath}, ${candidate.kind}, ${candidate.itemHash}, ${state}, ${candidate.text.slice(0, 2000)},
       ${candidate.section}, ${candidate.date}, ${JSON.stringify(candidate.subtasks)}, ${nowText}, ${nowText})
  `)
}

/** Substitui as subtarefas que vieram da CENTRAL, preservando as locais. */
async function replaceMirroredSubtasks(
  db: Database,
  link: LinkRow,
  candidate: Candidate,
): Promise<void> {
  if (!candidate.subtasks.length) return
  const previous = JSON.parse(link.subtasks || "[]") as RadarSubtaskInput[]
  const current = await db.all<{ id: number; title: string; done: number; position: number }>(
    sql`SELECT id, title, done, position FROM subtasks WHERE task_id = ${link.task_id} ORDER BY position, id`,
  )
  const keep = current.filter(
    (subtask) =>
      !previous.some((old) => similarity(old.text, subtask.title) >= MERGE_THRESHOLD),
  )
  await db.run(sql`DELETE FROM subtasks WHERE task_id = ${link.task_id}`)
  let position = 0
  for (const subtask of keep) {
    await db.run(
      sql`INSERT INTO subtasks (task_id, title, done, position) VALUES (${link.task_id}, ${subtask.title}, ${subtask.done}, ${position})`,
    )
    position += 1
  }
  for (const subtask of candidate.subtasks) {
    const title = subtask.text.trim().slice(0, 300)
    if (!title) continue
    await db.run(
      sql`INSERT INTO subtasks (task_id, title, done, position) VALUES (${link.task_id}, ${title}, ${subtask.done ? 1 : 0}, ${position})`,
    )
    position += 1
  }
}

async function createMirroredTask(
  db: Database,
  candidate: Candidate,
  note: RadarNoteInput,
  projectName: string,
  today: string,
  report: MirrorReport,
): Promise<number> {
  const result = await db.run(sql`
    INSERT INTO tasks (title, requested_by, send_to, due_date, priority, description, status,
                       created_at, tipo, projeto, recorrencia, feito_em, completed_at, estimate_min)
    VALUES (${displayTitle(candidate.text)}, '', '', '', 'media', ${buildDescription(candidate, note)},
            'aberta', ${candidate.date || note.updatedAt || today}, 'tarefa', ${projectName}, '', '', '', 0)
  `)
  const taskId = Number(result.lastInsertRowid)
  await insertTaskLinks(db, taskId, candidate.text)
  await insertSubtasks(db, taskId, candidate.subtasks, report)
  await insertLink(db, taskId, note.path, candidate, "ativa", today)
  report.created += 1
  return taskId
}

async function updateMirroredTask(
  db: Database,
  taskId: number,
  candidate: Candidate,
  note: RadarNoteInput,
  projectName: string,
): Promise<void> {
  await db.run(
    sql`UPDATE tasks SET title = ${displayTitle(candidate.text)},
        description = ${buildDescription(candidate, note)},
        projeto = ${projectName}
        WHERE id = ${taskId}`,
  )
}

async function closeTask(db: Database, taskId: number, date: string, nowText: string): Promise<void> {
  await db.run(
    sql`UPDATE tasks SET status = 'concluida', completed_at = ${date || nowText} WHERE id = ${taskId}`,
  )
}

async function reopenTask(db: Database, taskId: number, linkId: number, nowText: string): Promise<void> {
  await db.run(sql`UPDATE tasks SET status = 'aberta', completed_at = '' WHERE id = ${taskId}`)
  await db.run(
    sql`UPDATE central_task_links SET state = 'ativa', updated_at = ${nowText} WHERE id = ${linkId}`,
  )
}

async function upsertProject(
  db: Database,
  note: RadarNoteInput,
  nowText: string,
  report: MirrorReport,
): Promise<number> {
  const scope = note.scope.slice(0, 2000)
  const status = normalizeText(note.status) === "em espera" ? "em-espera" : "ativo"
  let row = await db.get<{ id: number; name: string }>(
    sql`SELECT id, name FROM projects WHERE central_note = ${note.path}`,
  )
  if (!row) {
    const byName = await db.get<{ id: number; name: string }>(
      sql`SELECT id, name FROM projects WHERE LOWER(name) = LOWER(${note.title})`,
    )
    if (byName) {
      row = byName
      await db.run(sql`UPDATE projects SET central_note = ${note.path} WHERE id = ${byName.id}`)
    }
  }
  let id: number
  if (row) {
    id = row.id
    if (row.name !== note.title) {
      await db.run(sql`UPDATE tasks SET projeto = ${note.title} WHERE projeto = ${row.name}`)
    }
    await db.run(
      sql`UPDATE projects SET name = ${note.title}, scope = ${scope}, status = ${status} WHERE id = ${id}`,
    )
  } else {
    const result = await db.run(sql`
      INSERT INTO projects (name, scope, people, status, collapsed, position, created_at, central_note)
      VALUES (${note.title}, ${scope}, '', ${status}, 0, 0, ${nowText}, ${note.path})
    `)
    id = Number(result.lastInsertRowid)
  }
  report.projects += 1

  // Links gerenciados pelo espelho (os grupos proprios ficam intactos).
  await db.run(
    sql`DELETE FROM project_links WHERE project_id = ${id} AND grupo IN ('CENTRAL', 'Codigo')`,
  )
  const managed: Array<[string, string, string, string]> = []
  if (note.repositorio) managed.push(["web", "Repositório", note.repositorio, "Código"])
  if (note.caminhoLocal) managed.push(["pasta", "Pasta local", note.caminhoLocal, "Código"])
  for (const [kind, label, target, grupo] of managed) {
    await db.run(
      sql`INSERT INTO project_links (project_id, kind, label, target, grupo)
          VALUES (${id}, ${kind}, ${label}, ${target}, ${grupo})`,
    )
  }
  return id
}

async function archiveProject(db: Database, notePath: string): Promise<void> {
  await db.run(
    sql`UPDATE projects SET status = 'arquivado' WHERE central_note = ${notePath} AND status <> 'arquivado'`,
  )
}

async function closeLinksForNote(
  db: Database,
  notePath: string,
  date: string,
  nowText: string,
  report: MirrorReport,
): Promise<void> {
  const links = await db.all<LinkRow>(
    sql`SELECT * FROM central_task_links WHERE note_path = ${notePath} AND state = 'ativa'`,
  )
  for (const link of links) {
    const task = await db.get<{ id: number; status: string | null }>(
      sql`SELECT id, status FROM tasks WHERE id = ${link.task_id}`,
    )
    if (!task) {
      await db.run(
        sql`UPDATE central_task_links SET state = 'descartada', updated_at = ${nowText} WHERE id = ${link.id}`,
      )
      continue
    }
    if ((task.status || "aberta") !== "concluida") {
      await closeTask(db, task.id, date, nowText)
      report.closed += 1
    }
    await db.run(
      sql`UPDATE central_task_links SET state = 'resolvida', updated_at = ${nowText} WHERE id = ${link.id}`,
    )
  }
}

/** Fecha as tarefas vinculadas a notas removidas e arquiva os projetos. */
export async function closeMirrorForPaths(
  db: Database,
  paths: string[],
  now = new Date(),
): Promise<MirrorReport> {
  const report = emptyMirrorReport()
  const nowText = now.toISOString().slice(0, 19)
  const today = nowText.slice(0, 10)
  for (const path of paths) {
    await closeLinksForNote(db, path, today, nowText, report)
    await archiveProject(db, path)
  }
  return report
}

// ------------------------------------------------------------------ fluxo

function bestMatch<T>(
  items: T[],
  text: string,
  threshold: number,
  textOf: (item: T) => string,
): number | null {
  let bestIndex: number | null = null
  let bestScore = threshold
  items.forEach((item, index) => {
    const score = similarity(textOf(item), text)
    if (score >= bestScore) {
      bestScore = score
      bestIndex = index
    }
  })
  return bestIndex
}

async function mirrorDiary(
  db: Database,
  note: RadarNoteInput,
  today: string,
  nowText: string,
  report: MirrorReport,
): Promise<void> {
  for (const entry of note.entries) {
    if (entry.kind !== "progresso" || entry.section !== "Concluído") continue
    const hash = itemHash(note.path, entry.kind, entry.text)
    const link = await db.get<LinkRow>(
      sql`SELECT * FROM central_task_links WHERE note_path = ${note.path} AND item_hash = ${hash}`,
    )
    if (link) continue

    // Fecha uma tarefa aberta parecida (em qualquer nota)...
    const openRows = await db.all<{ task_id: number; text: string; task_title: string }>(sql`
      SELECT l.task_id, COALESCE(l.text, '') AS text, t.title AS task_title
      FROM central_task_links l
      JOIN tasks t ON t.id = l.task_id
      WHERE l.state = 'ativa' AND COALESCE(t.status, 'aberta') <> 'concluida'
    `)
    const match = bestMatch(openRows, entry.text, TAKE_OVER_THRESHOLD, (row) => row.text || row.task_title)
    const date = entry.date || note.updatedAt || today
    if (match !== null) {
      const row = openRows[match]
      if (row) {
        await closeTask(db, row.task_id, date, nowText)
        await insertLink(
          db,
          row.task_id,
          note.path,
          {
            kind: entry.kind,
            text: entry.text,
            date,
            section: entry.section,
            itemHash: hash,
            subtasks: [],
          },
          "concluida",
          nowText,
        )
        report.closed += 1
      }
      continue
    }

    // ...ou registra a tarefa concluida (sem projeto; o diario nao tem dono).
    const result = await db.run(sql`
      INSERT INTO tasks (title, requested_by, send_to, due_date, priority, description, status,
                         created_at, tipo, projeto, recorrencia, feito_em, completed_at, estimate_min)
      VALUES (${displayTitle(entry.text)}, '', '', '', 'media', ${entry.text}, 'concluida',
              ${date}, 'tarefa', '', '', '', ${date}, 0)
    `)
    await insertLink(
      db,
      Number(result.lastInsertRowid),
      note.path,
      {
        kind: entry.kind,
        text: entry.text,
        date,
        section: entry.section,
        itemHash: hash,
        subtasks: [],
      },
      "concluida",
      nowText,
    )
    report.created += 1
  }
}

async function resolveProjectForNote(db: Database, note: RadarNoteInput): Promise<string> {
  const name = (note.produto || note.projeto || "").trim()
  if (!name) return ""
  const row = await db.get<{ name: string }>(
    sql`SELECT name FROM projects WHERE LOWER(name) = LOWER(${name})`,
  )
  return row?.name ?? ""
}

async function mirrorDecisionNote(
  db: Database,
  note: RadarNoteInput,
  today: string,
  nowText: string,
  report: MirrorReport,
): Promise<void> {
  const cutoff = new Date(Date.parse(`${today}T00:00:00Z`) - DECISION_BACKFILL_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10)
  const projectName = await resolveProjectForNote(db, note)
  for (const entry of note.entries) {
    if (entry.kind !== "decisao") continue
    const date = entry.date || note.updatedAt || today
    if (date && date < cutoff) continue
    const hash = itemHash(note.path, entry.kind, entry.text)
    const link = await db.get<LinkRow>(
      sql`SELECT id FROM central_task_links WHERE note_path = ${note.path} AND item_hash = ${hash}`,
    )
    if (link) continue
    const result = await db.run(sql`
      INSERT INTO tasks (title, requested_by, send_to, due_date, priority, description, status,
                         created_at, tipo, projeto, recorrencia, feito_em, completed_at, estimate_min)
      VALUES (${displayTitle(entry.text)}, '', '', '', 'media',
              ${[entry.text, "", `— Decisão · ${note.title}`, `CENTRAL: ${note.path}`].join("\n")},
              'concluida', ${date}, 'tarefa', ${projectName}, '', '', ${date}, 0)
    `)
    await insertLink(
      db,
      Number(result.lastInsertRowid),
      note.path,
      {
        kind: entry.kind,
        text: entry.text,
        date,
        section: entry.section,
        itemHash: hash,
        subtasks: [],
      },
      "concluida",
      nowText,
    )
    report.created += 1
  }
}

/** Espelha uma nota (chamado pela ingestao e pelo reconcile). */
export async function mirrorNote(
  db: Database,
  note: RadarNoteInput,
  removed: RemovedEntry[],
  now = new Date(),
): Promise<MirrorReport> {
  const report = emptyMirrorReport()
  const nowText = now.toISOString().slice(0, 19)
  const today = nowText.slice(0, 10)

  if (note.tipo === "diario") {
    await mirrorDiary(db, note, today, nowText, report)
    return report
  }
  if (note.tipo === "decisao") {
    await mirrorDecisionNote(db, note, today, nowText, report)
    return report
  }
  if (note.tipo !== "produto" && note.tipo !== "projeto") return report

  if (isClosedNoteStatus(note.status)) {
    await closeLinksForNote(db, note.path, note.updatedAt || today, nowText, report)
    await archiveProject(db, note.path)
    return report
  }

  const projectId = await upsertProject(db, note, nowText, report)
  const projectName = await projectNameById(db, projectId)

  const candidates = openCandidates(note)
  const links = await db.all<LinkRow>(
    sql`SELECT * FROM central_task_links WHERE note_path = ${note.path}`,
  )
  const linkByHash = new Map(links.map((link) => [link.item_hash, link]))
  const pending = [...removed]
  const assembled: Array<{ taskId: number; text: string }> = []

  for (const candidate of candidates) {
    const existing = linkByHash.get(candidate.itemHash)
    if (existing) {
      const task = await db.get<{ id: number; status: string | null }>(
        sql`SELECT id, status FROM tasks WHERE id = ${existing.task_id}`,
      )
      if (!task) {
        await db.run(
          sql`UPDATE central_task_links SET state = 'descartada', updated_at = ${nowText} WHERE id = ${existing.id}`,
        )
        continue
      }
      if (existing.state === "resolvida") {
        await reopenTask(db, task.id, existing.id, nowText)
        report.reopened += 1
      }
      assembled.push({ taskId: task.id, text: candidate.text })
      continue
    }

    // O texto mudou? Assume a entrada removida mais parecida (mesmo item).
    const takeoverIndex = bestMatch(pending, candidate.text, TAKE_OVER_THRESHOLD, (entry) => entry.text)
    if (takeoverIndex !== null) {
      const gone = pending[takeoverIndex]
      const link = gone ? linkByHash.get(gone.itemHash) : undefined
      if (gone) pending.splice(takeoverIndex, 1)
      if (link) {
        const task = await db.get<{ id: number }>(
          sql`SELECT id FROM tasks WHERE id = ${link.task_id}`,
        )
        if (task) {
          await updateMirroredTask(db, task.id, candidate, note, projectName)
          await replaceMirroredSubtasks(db, link, candidate)
          await db.run(sql`
            UPDATE central_task_links
            SET item_hash = ${candidate.itemHash}, kind = ${candidate.kind}, text = ${candidate.text.slice(0, 2000)},
                section = ${candidate.section}, entry_date = ${candidate.date},
                subtasks = ${JSON.stringify(candidate.subtasks)}, state = 'ativa', updated_at = ${nowText}
            WHERE id = ${link.id}
          `)
          report.updated += 1
          assembled.push({ taskId: task.id, text: candidate.text })
          continue
        }
      }
    }

    // Parafrase de uma tarefa ja montada nesta nota? Vira subtarefa dela.
    const twinIndex = bestMatch(assembled, candidate.text, MERGE_THRESHOLD, (item) => item.text)
    const twin = twinIndex === null ? null : assembled[twinIndex]
    if (twin) {
      if (candidate.subtasks.length) {
        await insertSubtasks(db, twin.taskId, candidate.subtasks, report)
      } else {
        await insertSubtasks(db, twin.taskId, [{ text: candidate.text, done: false }], report)
      }
      await insertLink(db, twin.taskId, note.path, candidate, "sub", nowText)
      continue
    }

    const taskId = await createMirroredTask(db, candidate, note, projectName, today, report)
    assembled.push({ taskId, text: candidate.text })
  }

  // Entradas que sumiram de verdade fecham as tarefas vinculadas.
  for (const gone of pending) {
    const link = linkByHash.get(gone.itemHash)
    if (!link || link.state !== "ativa") continue
    const task = await db.get<{ id: number; status: string | null }>(
      sql`SELECT id, status FROM tasks WHERE id = ${link.task_id}`,
    )
    if (!task) continue
    if ((task.status || "aberta") !== "concluida") {
      await closeTask(db, task.id, note.updatedAt || today, nowText)
      report.closed += 1
    }
    await db.run(
      sql`UPDATE central_task_links SET state = 'resolvida', updated_at = ${nowText} WHERE id = ${link.id}`,
    )
  }

  return report
}

// ---------------------------------------------------------------- reconcile

type CentralNoteRow = {
  path: string
  title: string | null
  tipo: string | null
  area: string | null
  produto: string | null
  projeto: string | null
  status: string | null
  updated_at: string | null
  links: string | null
  scope: string | null
  repositorio: string | null
  caminho_local: string | null
}

type CentralEntryRow = {
  note_path: string
  kind: string
  text: string
  date: string | null
  section: string | null
  item_hash: string
  subtasks: string | null
}

/** Reconstroi o espelho a partir das tabelas derivadas (ingestao pula notas iguais). */
export async function reconcileAll(db: Database, now = new Date()): Promise<MirrorReport> {
  const report = emptyMirrorReport()
  const noteRows = await db.all<CentralNoteRow>(
    sql`SELECT path, title, tipo, area, produto, projeto, status, updated_at, links, scope, repositorio, caminho_local
        FROM central_notes WHERE deleted_at = ''`,
  )
  const entryRows = await db.all<CentralEntryRow>(
    sql`SELECT note_path, kind, text, date, section, item_hash, subtasks FROM central_entries`,
  )
  const entriesByPath = new Map<string, CentralEntryRow[]>()
  for (const row of entryRows) {
    const list = entriesByPath.get(row.note_path) ?? []
    list.push(row)
    entriesByPath.set(row.note_path, list)
  }

  const notes: RadarNoteInput[] = noteRows.map((row) => ({
    path: row.path,
    title: row.title ?? "",
    tipo: (row.tipo ?? "").toLowerCase(),
    area: row.area ?? "",
    produto: row.produto ?? "",
    projeto: row.projeto ?? "",
    status: row.status ?? "ativo",
    updatedAt: row.updated_at ?? "",
    mtime: "",
    hash: "",
    links: JSON.parse(row.links || "[]") as string[],
    scope: row.scope ?? "",
    repositorio: row.repositorio ?? "",
    caminhoLocal: row.caminho_local ?? "",
    entries: (entriesByPath.get(row.path) ?? []).map((entry) => ({
      kind: entry.kind as RadarNoteInput["entries"][number]["kind"],
      text: entry.text,
      date: entry.date ?? "",
      section: entry.section ?? "",
      subtasks: JSON.parse(entry.subtasks || "[]") as RadarSubtaskInput[],
    })),
  }))

  // Produto/projeto antes de diario/decisao: o fechamento e o projeto ja existem.
  const order = (tipo: string) => (tipo === "produto" || tipo === "projeto" ? 0 : tipo === "diario" ? 1 : 2)
  notes.sort((a, b) => order(a.tipo) - order(b.tipo))

  for (const note of notes) {
    const hashSet = new Set(
      note.entries.map((entry) => itemHash(note.path, entry.kind, entry.text)),
    )
    const links = await db.all<LinkRow>(
      sql`SELECT * FROM central_task_links WHERE note_path = ${note.path} AND state = 'ativa'`,
    )
    const removed: RemovedEntry[] = links
      .filter((link) => !hashSet.has(link.item_hash))
      .map((link) => ({
        kind: link.kind,
        text: link.text ?? "",
        section: link.section ?? "",
        itemHash: link.item_hash,
      }))
    mergeMirrorReport(report, await mirrorNote(db, note, removed, now))
  }
  return report
}
