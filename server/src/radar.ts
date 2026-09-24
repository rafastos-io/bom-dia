/**
 * Radar da CENTRAL: ingestao (agente local via Bearer) e leitura (app).
 *
 * A CENTRAL continua a fonte da verdade; aqui vive uma copia derivada somente
 * leitura. A ingestao e idempotente por hash do conteudo extraido: reenviar a
 * mesma nota nao muda nada, e o mesmo texto repetido nao duplica entrada.
 */
import { createHash } from "node:crypto"
import { sql } from "drizzle-orm"
import type { Database } from "./db/client.js"
import {
  RADAR_KINDS,
  isClosedNoteStatus,
  itemHash,
  type RadarEntryInput,
  type RadarIngest,
  type RadarKind,
  type RadarNoteInput,
  type RadarSubtaskInput,
} from "./radar-common.js"
import {
  closeMirrorForPaths,
  emptyMirrorReport,
  mergeMirrorReport,
  mirrorNote,
  reconcileAll,
  type MirrorReport,
} from "./radar-mirror.js"

export type {
  RadarEntryInput,
  RadarIngest,
  RadarKind,
  RadarNoteInput,
  RadarSubtaskInput,
} from "./radar-common.js"

const KIND_SET = new Set<string>(RADAR_KINDS)
const MAX_NOTES_PER_BATCH = 200
const MAX_ENTRIES_PER_NOTE = 500
const MAX_TEXT = 2000
const MAX_SUBTASKS_PER_ENTRY = 50
const MAX_SUBTASK_TEXT = 500
const PROGRESS_DAYS = 14

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function asDate(value: unknown): string {
  const text = asString(value).slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : ""
}

function normalizePath(value: unknown): string {
  return asString(value).replaceAll("\\", "/").replace(/^\/+/, "")
}

/** Valida e limpa o payload da ingestao (entradas invalidas sao descartadas). */
export function parseIngest(raw: unknown): RadarIngest {
  const body = (raw ?? {}) as Record<string, unknown>
  const rawNotes = Array.isArray(body.notes) ? body.notes : []
  if (rawNotes.length > MAX_NOTES_PER_BATCH) {
    throw new Error(`lote grande demais (maximo de ${MAX_NOTES_PER_BATCH} notas)`)
  }
  const notes: RadarNoteInput[] = []
  for (const item of rawNotes) {
    const note = (item ?? {}) as Record<string, unknown>
    const path = normalizePath(note.path)
    if (!path) throw new Error("nota sem path")
    const rawEntries = Array.isArray(note.entries) ? note.entries : []
    if (rawEntries.length > MAX_ENTRIES_PER_NOTE) {
      throw new Error(`'${path}' com entradas demais (maximo de ${MAX_ENTRIES_PER_NOTE})`)
    }
    const entries: RadarEntryInput[] = []
    for (const rawEntry of rawEntries) {
      const entry = (rawEntry ?? {}) as Record<string, unknown>
      const kind = asString(entry.kind)
      const text = asString(entry.text).slice(0, MAX_TEXT)
      if (!KIND_SET.has(kind) || !text) continue
      const rawSubtasks = Array.isArray(entry.subtasks) ? entry.subtasks : []
      const subtasks: RadarSubtaskInput[] = []
      for (const rawSubtask of rawSubtasks.slice(0, MAX_SUBTASKS_PER_ENTRY)) {
        const subtask = (rawSubtask ?? {}) as Record<string, unknown>
        const subtaskText = asString(subtask.text).slice(0, MAX_SUBTASK_TEXT)
        if (!subtaskText) continue
        subtasks.push({ text: subtaskText, done: Boolean(subtask.done) })
      }
      entries.push({
        kind: kind as RadarKind,
        text,
        date: asDate(entry.date),
        section: asString(entry.section).slice(0, 120),
        subtasks,
      })
    }
    notes.push({
      path,
      title: asString(note.title).slice(0, 300),
      tipo: asString(note.tipo).slice(0, 40),
      area: asString(note.area).slice(0, 80),
      produto: asString(note.produto).slice(0, 300),
      projeto: asString(note.projeto).slice(0, 300),
      status: asString(note.status).slice(0, 40) || "ativo",
      updatedAt: asDate(note.updatedAt),
      mtime: asString(note.mtime).slice(0, 40),
      hash: asString(note.hash).slice(0, 128),
      links: (Array.isArray(note.links) ? note.links : [])
        .map(asString)
        .filter(Boolean)
        .slice(0, 100),
      scope: asString(note.scope).slice(0, 2000),
      repositorio: asString(note.repositorio).slice(0, 500),
      caminhoLocal: asString(note.caminhoLocal).slice(0, 500),
      entries,
    })
  }
  const deleted = (Array.isArray(body.deleted) ? body.deleted : [])
    .map(normalizePath)
    .filter(Boolean)
    .slice(0, MAX_NOTES_PER_BATCH)
  return { notes, deleted }
}

/** Hash do conteudo extraido (o que importa para o radar), nao do arquivo cru. */
function noteHash(note: RadarNoteInput): string {
  const payload = JSON.stringify({
    title: note.title,
    tipo: note.tipo,
    area: note.area,
    produto: note.produto,
    projeto: note.projeto,
    status: note.status,
    updatedAt: note.updatedAt,
    scope: note.scope,
    repositorio: note.repositorio,
    caminhoLocal: note.caminhoLocal,
    entries: note.entries.map((entry) => [
      entry.kind,
      entry.date,
      entry.section,
      entry.text,
      entry.subtasks.map((subtask) => [subtask.text, subtask.done]),
    ]),
  })
  return `sha256:${createHash("sha256").update(payload).digest("hex")}`
}

export type IngestReport = {
  notes: number
  entries: number
  removed: number
  skipped: number
  mirror: MirrorReport
}

/** Produto/projeto antes de diario/decisao: o espelho fecha e referencia o que ja existe. */
function mirrorOrder(tipo: string): number {
  if (tipo === "produto" || tipo === "projeto") return 0
  if (tipo === "diario") return 1
  return 2
}

type PreviousEntry = { kind: string; text: string; section: string; itemHash: string }

export async function ingestCentral(db: Database, payload: RadarIngest): Promise<IngestReport> {
  const now = new Date()
  const nowText = now.toISOString().slice(0, 19)
  const today = nowText.slice(0, 10)
  let changed = 0
  let entriesCount = 0
  let skipped = 0
  const mirror = emptyMirrorReport()

  // Um SELECT para o lote inteiro evita N+1 contra o Turso remoto.
  const known = new Map<string, string>()
  const previous = new Map<string, PreviousEntry[]>()
  if (payload.notes.length) {
    const paths = payload.notes.map((note) => sql`${note.path}`)
    const rows = await db.all<{ path: string; hash: string | null }>(
      sql`SELECT path, hash FROM central_notes WHERE path IN (${sql.join(paths, sql`, `)})`,
    )
    for (const row of rows) known.set(row.path, row.hash ?? "")
    const entryRows = await db.all<PreviousEntry & { note_path: string }>(
      sql`SELECT note_path, kind, text, section, item_hash AS itemHash FROM central_entries
          WHERE note_path IN (${sql.join(paths, sql`, `)})`,
    )
    for (const row of entryRows) {
      const list = previous.get(row.note_path) ?? []
      list.push({ kind: row.kind, text: row.text, section: row.section, itemHash: row.itemHash })
      previous.set(row.note_path, list)
    }
  }

  // Diario/decisao depois: o fechamento e a atribuicao de projeto dependem do espelho dos produtos.
  const notes = [...payload.notes].sort((a, b) => mirrorOrder(a.tipo) - mirrorOrder(b.tipo))

  for (const note of notes) {
    const hash = noteHash(note)
    if (known.get(note.path) === hash) {
      skipped += 1
      continue
    }
    const old = previous.get(note.path) ?? []
    const fresh = new Set(note.entries.map((entry) => itemHash(note.path, entry.kind, entry.text)))
    const removed = old.filter((entry) => !fresh.has(entry.itemHash))

    await db.run(sql`
      INSERT INTO central_notes
        (path, title, tipo, area, produto, projeto, status, updated_at, mtime, hash, links,
         scope, repositorio, caminho_local, ingested_at, deleted_at)
      VALUES
        (${note.path}, ${note.title}, ${note.tipo}, ${note.area}, ${note.produto}, ${note.projeto},
         ${note.status}, ${note.updatedAt}, ${note.mtime}, ${hash}, ${JSON.stringify(note.links)},
         ${note.scope}, ${note.repositorio}, ${note.caminhoLocal}, ${nowText}, '')
      ON CONFLICT(path) DO UPDATE SET
        title = excluded.title,
        tipo = excluded.tipo,
        area = excluded.area,
        produto = excluded.produto,
        projeto = excluded.projeto,
        status = excluded.status,
        updated_at = excluded.updated_at,
        mtime = excluded.mtime,
        hash = excluded.hash,
        links = excluded.links,
        scope = excluded.scope,
        repositorio = excluded.repositorio,
        caminho_local = excluded.caminho_local,
        ingested_at = excluded.ingested_at,
        deleted_at = ''
    `)
    // A nota atual substitui as entradas anteriores: quem saiu do texto sai do radar.
    await db.run(sql`DELETE FROM central_entries WHERE note_path = ${note.path}`)
    if (note.entries.length) {
      const values = note.entries.map((entry) => {
        const date = entry.date || note.updatedAt || today
        const hash = itemHash(note.path, entry.kind, entry.text)
        return sql`(${note.path}, ${entry.kind}, ${entry.text}, ${date}, ${entry.section}, ${hash}, ${JSON.stringify(entry.subtasks)})`
      })
      await db.run(sql`
        INSERT OR REPLACE INTO central_entries (note_path, kind, text, date, section, item_hash, subtasks)
        VALUES ${sql.join(values, sql`, `)}
      `)
      entriesCount += note.entries.length
    }
    mergeMirrorReport(mirror, await mirrorNote(db, note, removed, now))
    changed += 1
  }

  let removed = 0
  if (payload.deleted.length) {
    const list = sql.join(
      payload.deleted.map((path) => sql`${path}`),
      sql`, `,
    )
    await db.run(sql`DELETE FROM central_entries WHERE note_path IN (${list})`)
    await db.run(sql`DELETE FROM central_notes WHERE path IN (${list})`)
    mergeMirrorReport(mirror, await closeMirrorForPaths(db, payload.deleted, now))
    removed = payload.deleted.length
  }

  return { notes: changed, entries: entriesCount, removed, skipped, mirror }
}

/** Reconstroi o espelho a partir das tabelas derivadas (usado no deploy/backfill). */
export async function reconcileMirror(db: Database): Promise<MirrorReport> {
  return reconcileAll(db)
}

export type RadarItem = {
  text: string
  kind: string
  section: string
  note: string
  path: string
  date: string
}

export type RadarNoArItem = RadarItem & { ageDays: number }

export type RadarDigest = {
  progresso: Array<{ date: string; items: RadarItem[] }>
  noAr: RadarNoArItem[]
  atualizadoEm: string
}

type EntryRow = {
  note_path: string
  note_title: string | null
  note_status: string | null
  kind: string
  text: string
  section: string | null
  date: string | null
}

function daysSince(dateIso: string, now: Date): number {
  const parsed = Date.parse(`${dateIso}T00:00:00Z`)
  if (Number.isNaN(parsed)) return 0
  return Math.max(0, Math.floor((now.getTime() - parsed) / 86_400_000))
}

function toItem(row: EntryRow): RadarItem {
  return {
    text: row.text,
    kind: row.kind,
    section: row.section ?? "",
    note: row.note_title || row.note_path,
    path: row.note_path,
    date: row.date ?? "",
  }
}

const ENTRY_COLUMNS = sql`
  e.note_path, n.title AS note_title, n.status AS note_status,
  e.kind, e.text, e.section, e.date
`

/** Progresso por dia (14 dias) e itens "no ar" derivados (mais velhos primeiro). */
export async function radarDigest(db: Database, now = new Date()): Promise<RadarDigest> {
  const cutoff = new Date(now.getTime() - (PROGRESS_DAYS - 1) * 86_400_000)
    .toISOString()
    .slice(0, 10)
  const progressRows = await db.all<EntryRow>(sql`
    SELECT ${ENTRY_COLUMNS}
    FROM central_entries e
    JOIN central_notes n ON n.path = e.note_path
    WHERE e.kind IN ('progresso', 'decisao') AND e.date >= ${cutoff}
    ORDER BY e.date DESC, e.id
  `)
  const openRows = await db.all<EntryRow>(sql`
    SELECT ${ENTRY_COLUMNS}
    FROM central_entries e
    JOIN central_notes n ON n.path = e.note_path
    WHERE e.kind IN ('aberto', 'proxima_acao')
      AND e.note_path NOT LIKE '09 - Arquivo/%'
      AND e.note_path NOT LIKE '%/09 - Arquivo/%'
    ORDER BY e.date ASC, e.id ASC
  `)

  const days = new Map<string, RadarItem[]>()
  for (const row of progressRows) {
    const date = row.date ?? ""
    const items = days.get(date) ?? []
    items.push(toItem(row))
    days.set(date, items)
  }

  const noAr = openRows
    .filter((row) => !isClosedNoteStatus(row.note_status ?? ""))
    .map((row) => ({ ...toItem(row), ageDays: daysSince(row.date ?? "", now) }))

  const updated = await db.all<{ at: string | null }>(
    sql`SELECT MAX(ingested_at) AS at FROM central_notes`,
  )

  return {
    progresso: [...days.entries()].map(([date, items]) => ({ date, items })),
    noAr,
    atualizadoEm: updated[0]?.at ?? "",
  }
}
