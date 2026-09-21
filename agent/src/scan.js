import { readdir, readFile, stat } from "node:fs/promises"
import { join, relative } from "node:path"
import { sendIngest } from "./api.js"
import { parseNote } from "./parse.js"

const SKIP_DIRS = new Set([".obsidian", ".trash", ".git", "node_modules", "99 - Sistema"])

export function relPath(root, file) {
  return relative(root, file).replaceAll("\\", "/")
}

/** Todos os `.md` do vault, ignorando pastas de sistema e templates. */
export async function collectMarkdown(root) {
  const files = []
  async function walk(dir) {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue
        await walk(full)
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
        files.push(full)
      }
    }
  }
  await walk(root)
  return files
}

export async function readNote(root, file) {
  const raw = await readFile(file, "utf-8")
  const note = parseNote(raw, relPath(root, file))
  note.mtime = (await stat(file)).mtime.toISOString()
  return note
}

function chunk(items, size) {
  const out = []
  for (let index = 0; index < items.length; index += size) {
    out.push(items.slice(index, index + size))
  }
  return out
}

async function sendPayload(config, state, notes, deleted, { send, log }) {
  // Em dry-run nada e enviado e o estado local NAO avanca (o primeiro sync real
  // ainda precisa mandar tudo).
  const remember = !config.dryRun
  let sent = 0
  let entries = 0
  let skipped = 0
  for (const batch of chunk(notes, config.batchSize)) {
    const result = await send(config, { notes: batch, deleted: [] })
    sent += batch.length
    entries += batch.reduce((total, note) => total + note.entries.length, 0)
    skipped += Number(result?.skipped ?? 0)
    if (remember) for (const note of batch) state.notes[note.path] = note.hash
  }
  let removed = 0
  for (const batch of chunk(deleted, config.batchSize)) {
    await send(config, { notes: [], deleted: batch })
    removed += batch.length
    if (remember) for (const path of batch) delete state.notes[path]
  }
  if (skipped) log.log(`[radar] ${skipped} notas ja estavam iguais no servidor`)
  return { sent, entries, skipped, deleted: removed }
}

/** Varredura completa: envia o que mudou e remove o que sumiu do vault. */
export async function syncFull(config, state, { force = false, send = sendIngest, log = console } = {}) {
  const files = await collectMarkdown(config.centralDir)
  const seen = new Set()
  const notes = []
  for (const file of files) {
    const rel = relPath(config.centralDir, file)
    seen.add(rel)
    let note
    try {
      note = await readNote(config.centralDir, file)
    } catch (error) {
      log.warn(`[radar] falha lendo ${rel}: ${error.message}`)
      continue
    }
    if (!force && state.notes[rel] === note.hash) continue
    notes.push(note)
  }
  const deleted = Object.keys(state.notes).filter((rel) => !seen.has(rel))
  const report = await sendPayload(config, state, notes, deleted, { send, log })
  return { ...report, scanned: files.length }
}

/** Delta do watch: envia so os arquivos tocados. */
export async function syncFiles(config, state, files, { send = sendIngest, log = console } = {}) {
  const notes = []
  for (const file of files) {
    try {
      notes.push(await readNote(config.centralDir, file))
    } catch {
      // sumiu entre o evento e a leitura: o unlink do watcher trata.
    }
  }
  return sendPayload(config, state, notes, [], { send, log })
}

/** Notas removidas do vault (unlink/rename). */
export async function syncDeleted(config, state, paths, { send = sendIngest, log = console } = {}) {
  return sendPayload(config, state, [], paths, { send, log })
}
