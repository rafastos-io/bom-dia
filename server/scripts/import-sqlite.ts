/**
 * Importa o SQLite legado do Bom Dia (bomdia.db) para o banco novo (Turso/libSQL).
 *
 * Uso:
 *   npx tsx scripts/import-sqlite.ts --source ../bomdia.db --target file:./data/bomdia.db
 *   npx tsx scripts/import-sqlite.ts --source ../bomdia.db --target libsql://... --dry-run
 *   TURSO_DATABASE_URL/TURSO_AUTH_TOKEN podem substituir --target.
 *
 * Seguro: INSERT OR REPLACE com ids preservados; re-executavel; --dry-run nao escreve.
 */
import { readFileSync } from "node:fs"
import { createClient, type Client } from "@libsql/client"
import { ensureSchema } from "../src/db/migrate.js"

type TableSpec = { name: string; columns: string[] }

const TABLES: TableSpec[] = [
  {
    name: "tasks",
    columns: [
      "id",
      "title",
      "requested_by",
      "send_to",
      "due_date",
      "priority",
      "description",
      "status",
      "created_at",
      "tipo",
      "projeto",
      "recorrencia",
      "feito_em",
    ],
  },
  { name: "links", columns: ["id", "task_id", "kind", "label", "target"] },
  { name: "subtasks", columns: ["id", "task_id", "title", "done", "position"] },
  {
    name: "projects",
    columns: ["id", "name", "scope", "people", "status", "collapsed", "position", "created_at"],
  },
  { name: "project_links", columns: ["id", "project_id", "kind", "label", "target", "grupo"] },
  {
    name: "project_notes",
    columns: ["id", "project_id", "title", "body", "position", "created_at", "updated_at"],
  },
  { name: "idea_links", columns: ["id", "idea_id", "target_type", "target_id"] },
  {
    name: "attachments",
    columns: ["id", "owner_type", "owner_id", "filename", "key", "content_type", "size", "created_at"],
  },
]

function parseArgs(argv: string[]) {
  const args: { source?: string; target?: string; config?: string; dryRun: boolean } = {
    dryRun: false,
  }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === "--source") args.source = argv[++i]
    else if (arg === "--target") args.target = argv[++i]
    else if (arg === "--config") args.config = argv[++i]
    else if (arg === "--dry-run") args.dryRun = true
  }
  return args
}

async function count(client: Client, table: string): Promise<number> {
  const result = await client.execute(`SELECT COUNT(*) AS n FROM ${table}`)
  return Number(result.rows[0]?.n ?? 0)
}

async function ensureTargetSchema(target: Client) {
  await ensureSchema(target)
}

async function importTable(
  source: Client,
  target: Client,
  spec: TableSpec,
  dryRun: boolean,
): Promise<{ table: string; source: number; target: number; written: number }> {
  const before = await count(target, spec.name)
  const rows = await source.execute(`SELECT * FROM ${spec.name}`)
  const columns = spec.columns
  const placeholders = columns.map(() => "?").join(", ")
  const statements = rows.rows.map((row) => ({
    sql: `INSERT OR REPLACE INTO ${spec.name} (${columns.join(", ")}) VALUES (${placeholders})`,
    args: columns.map((column) => {
      const value = (row as Record<string, unknown>)[column]
      if (value === undefined || value === null) return null
      if (typeof value === "bigint") return Number(value)
      return value as string | number | ArrayBuffer
    }),
  }))
  let written = 0
  if (!dryRun && statements.length) {
    const CHUNK = 200
    for (let i = 0; i < statements.length; i += CHUNK) {
      await target.batch(statements.slice(i, i + CHUNK), "write")
      written += Math.min(CHUNK, statements.length - i)
    }
  }
  const after = dryRun ? before : await count(target, spec.name)
  return { table: spec.name, source: rows.rows.length, target: after, written }
}

async function importConfig(target: Client, configPath: string, dryRun: boolean) {
  let config: { name?: string; model?: string; openai_api_key?: string }
  try {
    config = JSON.parse(readFileSync(configPath, "utf-8"))
  } catch {
    console.log(`config: ${configPath} nao encontrado; pulando.`)
    return
  }
  const entries: [string, string][] = []
  if (typeof config.name === "string") entries.push(["name", config.name])
  if (typeof config.model === "string" && config.model) entries.push(["model", config.model])
  // A chave so e importada se nao houver OPENAI_API_KEY no ambiente (ela manda).
  if (typeof config.openai_api_key === "string" && config.openai_api_key && !process.env.OPENAI_API_KEY) {
    entries.push(["openai_api_key", config.openai_api_key])
  }
  if (!entries.length) return
  if (!dryRun) {
    await target.batch(
      entries.map(([key, value]) => ({
        sql: `INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`,
        args: [key, value],
      })),
      "write",
    )
  }
  console.log(`config: ${entries.map(([key]) => key).join(", ")} ${dryRun ? "(dry-run)" : "importados"}`)
}

async function integrityChecks(target: Client): Promise<string[]> {
  const issues: string[] = []
  const checks: [string, string][] = [
    ["links orfaos", "SELECT COUNT(*) AS n FROM links WHERE task_id NOT IN (SELECT id FROM tasks)"],
    [
      "subtasks orfas",
      "SELECT COUNT(*) AS n FROM subtasks WHERE task_id NOT IN (SELECT id FROM tasks)",
    ],
    [
      "idea_links orfaos",
      "SELECT COUNT(*) AS n FROM idea_links WHERE idea_id NOT IN (SELECT id FROM tasks)",
    ],
    [
      "project_links orfaos",
      "SELECT COUNT(*) AS n FROM project_links WHERE project_id NOT IN (SELECT id FROM projects)",
    ],
    [
      "notes orfas",
      "SELECT COUNT(*) AS n FROM project_notes WHERE project_id NOT IN (SELECT id FROM projects)",
    ],
  ]
  for (const [label, sql] of checks) {
    const result = await target.execute(sql)
    const n = Number(result.rows[0]?.n ?? 0)
    if (n > 0) issues.push(`${label}: ${n}`)
  }
  return issues
}

const args = parseArgs(process.argv.slice(2))
const sourceUrl = args.source ? `file:${args.source}` : null
const targetUrl = args.target ?? process.env.TURSO_DATABASE_URL ?? null

if (!sourceUrl || !targetUrl) {
  console.error("Informe --source <bomdia.db> e --target <libsql://... | file:...> (ou TURSO_DATABASE_URL).")
  process.exit(1)
}

console.log(`origem: ${sourceUrl}`)
console.log(`destino: ${targetUrl.replace(/\/\/.*@/, "//***@")}`)
if (args.dryRun) console.log("modo: DRY-RUN (nao escreve)")

const source = createClient({ url: sourceUrl })
const target = createClient({ url: targetUrl, authToken: process.env.TURSO_AUTH_TOKEN })

await ensureTargetSchema(target)

const report = []
for (const spec of TABLES) {
  report.push(await importTable(source, target, spec, args.dryRun))
}
if (args.config) await importConfig(target, args.config, args.dryRun)

console.log("\ntabela              origem  destino")
for (const row of report) {
  const status = args.dryRun ? "" : row.target === row.source ? " ok" : " DIVERGENTE"
  console.log(
    `${row.table.padEnd(18)} ${String(row.source).padStart(6)} ${String(row.target).padStart(8)}${status}`,
  )
}

const issues = await integrityChecks(target)
if (issues.length) {
  console.warn(`\nintegridade: ${issues.join(" | ")}`)
} else {
  console.log("\nintegridade: sem orfaos")
}

const divergences = report.filter((row) => !args.dryRun && row.target !== row.source)
if (divergences.length) {
  console.error(`\nATENCAO: ${divergences.length} tabela(s) divergentes.`)
  process.exitCode = 1
} else {
  console.log(`\nimportacao ${args.dryRun ? "simulada" : "concluida"} com sucesso.`)
}
