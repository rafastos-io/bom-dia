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

export const RADAR_KINDS = ["progresso", "aberto", "proxima_acao", "decisao"] as const
export type RadarKind = (typeof RADAR_KINDS)[number]

const KIND_SET = new Set<string>(RADAR_KINDS)
const MAX_NOTES_PER_BATCH = 200
const MAX_ENTRIES_PER_NOTE = 500
const MAX_TEXT = 2000
const PROGRESS_DAYS = 14

const CLOSED_STATUS = new Set([
  "concluido",
  "concluida",
  "arquivado",
  "arquivada",
  "encerrado",
  "encerrada",
  "inativo",
  "inativa",
])

export type RadarEntryInput = {
  kind: RadarKind
  text: string
  date: string
  section: string
}

export type RadarNoteInput = {
  path: string
  title: string
  tipo: string
  area: string
  produto: string
  projeto: string
  status: string
  updatedAt: string
  mtime: string
  hash: string
  links: string[]
  entries: RadarEntryInput[]
}

export type RadarIngest = { notes: RadarNoteInput[]; deleted: string[] }

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
      entries.push({
        kind: kind as RadarKind,
        text,
        date: asDate(entry.date),
        section: asString(entry.section).slice(0, 120),
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
      entries,
    })
  }
  const deleted = (Array.isArray(body.deleted) ? body.deleted : [])
    .map(normalizePath)
    .filter(Boolean)
    .slice(0, MAX_NOTES_PER_BATCH)
  return { notes, deleted }
}

function itemHash(notePath: string, kind: string, text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim()
  return createHash("sha256").update(`${notePath}\u0000${kind}\u0000${normalized}`).digest("hex")
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
    entries: note.entries.map((entry) => [entry.kind, entry.date, entry.section, entry.text]),
  })
  return `sha256:${createHash("sha256").update(payload).digest("hex")}`
}

export type IngestReport = { notes: number; entries: number; removed: number; skipped: number }

export async function ingestCentral(db: Database, payload: RadarIngest): Promise<IngestReport> {
  const now = new Date().toISOString()
  const today = now.slice(0, 10)
  let changed = 0
  let entriesCount = 0
  let skipped = 0

  // Um SELECT para o lote inteiro evita N+1 contra o Turso remoto.
  const known = new Map<string, string>()
  if (payload.notes.length) {
    const paths = payload.notes.map((note) => sql`${note.path}`)
    const rows = await db.all<{ path: string; hash: string | null }>(
      sql`SELECT path, hash FROM central_notes WHERE path IN (${sql.join(paths, sql`, `)})`,
    )
    for (const row of rows) known.set(row.path, row.hash ?? "")
  }

  for (const note of payload.notes) {
    const hash = noteHash(note)
    if (known.get(note.path) === hash) {
      skipped += 1
      continue
    }
    await db.run(sql`
      INSERT INTO central_notes
        (path, title, tipo, area, produto, projeto, status, updated_at, mtime, hash, links, ingested_at, deleted_at)
      VALUES
        (${note.path}, ${note.title}, ${note.tipo}, ${note.area}, ${note.produto}, ${note.projeto},
         ${note.status}, ${note.updatedAt}, ${note.mtime}, ${hash}, ${JSON.stringify(note.links)}, ${now}, '')
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
        ingested_at = excluded.ingested_at,
        deleted_at = ''
    `)
    // A nota atual substitui as entradas anteriores: quem saiu do texto sai do radar.
    await db.run(sql`DELETE FROM central_entries WHERE note_path = ${note.path}`)
    if (note.entries.length) {
      const values = note.entries.map((entry) => {
        const date = entry.date || note.updatedAt || today
        const hash = itemHash(note.path, entry.kind, entry.text)
        return sql`(${note.path}, ${entry.kind}, ${entry.text}, ${date}, ${entry.section}, ${hash})`
      })
      await db.run(sql`
        INSERT OR REPLACE INTO central_entries (note_path, kind, text, date, section, item_hash)
        VALUES ${sql.join(values, sql`, `)}
      `)
      entriesCount += note.entries.length
    }
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
    removed = payload.deleted.length
  }

  return { notes: changed, entries: entriesCount, removed, skipped }
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

function statusKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
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
    .filter((row) => !CLOSED_STATUS.has(statusKey(row.note_status ?? "")))
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
