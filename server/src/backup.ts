/**
 * Backup do Turso para o R2.
 *
 * Estrategia: uma replica embutida do libSQL e criada num arquivo temporario,
 * `sync()` baixa o banco remoto inteiro, o arquivo e enviado ao R2 e apagado
 * em seguida. O agendador vive no proprio servidor: checa na subida (um deploy
 * faz o backup atrasado) e a cada 6 h; so executa quando a janela venceu.
 *
 * A retencao mantem as ultimas `BACKUP_RETENTION` copias e poda o resto.
 */
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createClient } from "@libsql/client"
import { R2, r2Enabled } from "./config.js"
import { r2Delete, r2List, r2Put, type R2Object } from "./r2.js"

const BACKUPS_SEGMENT = "backups"

function envNumber(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback)
  return Number.isFinite(value) && value > 0 ? value : fallback
}

export const BACKUP_INTERVAL_DAYS = envNumber("BACKUP_INTERVAL_DAYS", 7)
export const BACKUP_RETENTION = envNumber("BACKUP_RETENTION", 12)

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000
const BOOT_DELAY_MS = 30 * 1000
// Folga para o horario do check nao empurrar o backup uma semana inteira.
const GRACE_MS = 12 * 60 * 60 * 1000

function remoteUrl(): string {
  return process.env.TURSO_DATABASE_URL?.trim() ?? ""
}

/** Backup exige banco remoto e R2 configurados. */
export function backupEnabled(): boolean {
  const url = remoteUrl()
  return r2Enabled() && /^https?:\/\/|^libsql:\/\//.test(url)
}

export function backupPrefix(): string {
  return `${R2.prefix}/${BACKUPS_SEGMENT}/`
}

/** Chave do arquivo: <prefixo>/backups/bomdia-2026-09-21T07-15-00Z.db */
export function backupKeyFor(date: Date): string {
  const stamp = date.toISOString().slice(0, 19).replaceAll(":", "-")
  return `${backupPrefix()}bomdia-${stamp}Z.db`
}

/** Le a data ISO embutida no nome do arquivo (ou null se nao for backup). */
export function backupDateOf(key: string): string | null {
  const match = key.match(/bomdia-(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})Z\.db$/)
  if (!match) return null
  const [, day, hour, minute, second] = match
  if (!day || !hour || !minute || !second) return null
  return `${day}T${hour}:${minute}:${second}Z`
}

/** Vencido quando nunca houve backup ou o ultimo passou da janela. */
export function backupDue(
  lastIso: string | null,
  now: Date,
  intervalDays = BACKUP_INTERVAL_DAYS,
): boolean {
  if (!lastIso) return true
  const last = Date.parse(lastIso)
  if (Number.isNaN(last)) return true
  return now.getTime() - last >= intervalDays * 24 * 60 * 60 * 1000 - GRACE_MS
}

/** Backups existentes no R2, do mais antigo para o mais recente. */
export async function listBackups(): Promise<R2Object[]> {
  const files = (await r2List(backupPrefix())).filter((file) => backupDateOf(file.key) !== null)
  return files.sort((a, b) => a.key.localeCompare(b.key))
}

export async function lastBackupAt(): Promise<string | null> {
  const files = await listBackups()
  const last = files.at(-1)
  if (!last) return null
  return backupDateOf(last.key) ?? (last.lastModified || null)
}

export type PruneDeps = {
  list: () => Promise<R2Object[]>
  remove: (key: string) => Promise<void>
}

/** Mantem as N copias mais recentes e remove as demais. */
export async function pruneBackups(
  retention = BACKUP_RETENTION,
  deps: PruneDeps = { list: listBackups, remove: r2Delete },
): Promise<string[]> {
  const files = [...(await deps.list())].sort((a, b) => a.key.localeCompare(b.key))
  const excess = files.slice(0, Math.max(0, files.length - retention))
  for (const file of excess) await deps.remove(file.key)
  return excess.map((file) => file.key)
}

/** Baixa o banco remoto para um arquivo SQLite local (replica embutida). */
export async function snapshotTo(dest: string): Promise<void> {
  const replica = createClient({
    url: `file:${dest}`,
    syncUrl: remoteUrl(),
    authToken: process.env.TURSO_AUTH_TOKEN,
  })
  try {
    await replica.sync()
  } finally {
    await replica.close()
  }
}

/** Abre o snapshot baixado e confere a integridade antes de enviar. */
export async function verifySnapshot(file: string): Promise<void> {
  const local = createClient({ url: `file:${file}` })
  try {
    const result = await local.execute("PRAGMA integrity_check")
    const verdict = String(result.rows[0]?.integrity_check ?? "")
    if (verdict !== "ok") {
      throw new Error(`integridade do snapshot: ${verdict || "sem resposta"}`)
    }
  } finally {
    await local.close()
  }
}

export type BackupResult = {
  key: string
  size: number
  pruned: string[]
  at: string
}

/** Snapshot + upload + poda. Lanca erro quando o backup esta desabilitado. */
export async function runBackup(now = new Date()): Promise<BackupResult> {
  if (!backupEnabled()) {
    throw new Error("backup desabilitado: TURSO_DATABASE_URL remoto e R2_* sao obrigatorios")
  }
  const dir = await mkdtemp(join(tmpdir(), "bomdia-backup-"))
  try {
    const file = join(dir, "snapshot.db")
    await snapshotTo(file)
    await verifySnapshot(file)
    const bytes = new Uint8Array(await readFile(file))
    const key = backupKeyFor(now)
    await r2Put(key, bytes, "application/vnd.sqlite3")
    const pruned = await pruneBackups()
    return { key, size: bytes.byteLength, pruned, at: now.toISOString() }
  } finally {
    // No Windows o libsql pode segurar o arquivo por um instante apos o close.
    await rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
  }
}

export type BackupState = {
  enabled: boolean
  running: boolean
  lastAt: string | null
  lastKey: string | null
  lastError: string | null
}

const state: BackupState = {
  enabled: backupEnabled(),
  running: false,
  lastAt: null,
  lastKey: null,
  lastError: null,
}

/** Ultimo estado conhecido do agendador (para logs e diagnostico). */
export function backupState(): BackupState {
  return { ...state }
}

async function checkAndRun(): Promise<void> {
  if (state.running) return
  state.running = true
  try {
    const last = await lastBackupAt()
    if (!backupDue(last, new Date())) return
    const result = await runBackup()
    state.lastAt = result.at
    state.lastKey = result.key
    state.lastError = null
    const kb = (result.size / 1024).toFixed(1)
    const pruned = result.pruned.length ? ` | podados: ${result.pruned.join(", ")}` : ""
    console.log(`[backup] ok: ${result.key} (${kb} KB)${pruned}`)
  } catch (error) {
    state.lastError = (error as Error).message
    console.error(`[backup] falhou: ${state.lastError}`)
  } finally {
    state.running = false
  }
}

/** Checa na subida (com atraso) e a cada 6 h; roda o backup se estiver vencido. */
export function startBackupScheduler(): void {
  if (!state.enabled) {
    console.warn("[backup] desabilitado: TURSO_DATABASE_URL remoto e R2_* necessarios")
    return
  }
  const boot = setTimeout(() => void checkAndRun(), BOOT_DELAY_MS)
  boot.unref()
  const timer = setInterval(() => void checkAndRun(), CHECK_INTERVAL_MS)
  timer.unref()
}
