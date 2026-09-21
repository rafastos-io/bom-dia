import { sql } from "drizzle-orm"
import type { Database } from "./db/client.js"

export const DEFAULT_MODEL = "gpt-4.1-mini"

export const APP_ENV = process.env.APP_ENV?.trim() || "production"

export const PORT = Number(process.env.PORT ?? 9463)

export const AUTH_USER = process.env.AUTH_USER?.trim() || "Rafastos"

export const AUTH_SECRET =
  process.env.AUTH_SECRET?.trim() || "dev-secret-troque-em-producao"

export const AUTH_TTL_SECONDS = 60 * 60 * 24 * 7

export const AUTH_COOKIE = "bomdia_session"

/** Token do agente local do radar (Bearer); vazio desabilita a ingestao. */
export const SERVICE_TOKEN = process.env.SERVICE_TOKEN?.trim() ?? ""

export const OPENAI_URL = "https://api.openai.com/v1/chat/completions"

export const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB ?? 25)
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024

export const R2 = {
  endpoint: (process.env.R2_ENDPOINT ?? "").replace(/\/+$/, ""),
  bucket: process.env.R2_BUCKET ?? "",
  accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
  prefix: process.env.R2_PREFIX ?? "bomdia",
  region: process.env.R2_REGION ?? "auto",
}

export function r2Enabled(): boolean {
  return Boolean(R2.endpoint && R2.bucket && R2.accessKeyId && R2.secretAccessKey)
}

export const DIST_DIR = process.env.BOMDIA_DIST_DIR?.trim() || "public"

export type AppConfig = {
  name: string
  openaiApiKey: string
  model: string
}

const ENV_KEY = process.env.OPENAI_API_KEY?.trim() ?? ""

export async function loadConfig(db: Database): Promise<AppConfig> {
  const rows = await db.all<{ key: string; value: string | null }>(
    sql`SELECT key, value FROM settings`,
  )
  const settings = new Map(rows.map((row) => [row.key, row.value ?? ""]))
  return {
    name: settings.get("name") ?? "",
    openaiApiKey: ENV_KEY || (settings.get("openai_api_key") ?? ""),
    model: process.env.OPENAI_MODEL?.trim() || settings.get("model") || DEFAULT_MODEL,
  }
}

async function upsertSetting(db: Database, key: string, value: string): Promise<void> {
  await db.run(
    sql`INSERT INTO settings (key, value) VALUES (${key}, ${value})
        ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  )
}

export async function saveConfig(
  db: Database,
  data: { name?: string; openai_api_key?: string; model?: string },
): Promise<void> {
  if (typeof data.name === "string") await upsertSetting(db, "name", data.name)
  if (typeof data.model === "string" && data.model.trim()) {
    await upsertSetting(db, "model", data.model.trim())
  }
  // Se a chave veio do ambiente, ela manda em runtime e NUNCA e gravada em disco.
  if (typeof data.openai_api_key === "string" && !ENV_KEY) {
    await upsertSetting(db, "openai_api_key", data.openai_api_key)
  }
}

export function apiKeyOk(key: string | undefined | null): boolean {
  return Boolean(key && key.trim().startsWith("sk-"))
}
