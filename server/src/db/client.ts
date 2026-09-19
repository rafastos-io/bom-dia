import { mkdirSync } from "node:fs"
import { dirname } from "node:path"
import { createClient, type Client } from "@libsql/client"
import type { SQL } from "drizzle-orm"
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql"
import * as schema from "./schema.js"

export type Database = LibSQLDatabase<typeof schema>

export function createDatabase(url = process.env.TURSO_DATABASE_URL ?? "file:./data/bomdia.db"): {
  client: Client
  db: Database
} {
  if (url.startsWith("file:")) {
    const filePath = url.slice("file:".length)
    mkdirSync(dirname(filePath), { recursive: true })
  }
  const client = createClient({
    url,
    authToken: process.env.TURSO_AUTH_TOKEN,
  })
  const base = drizzle(client, { schema })
  // O driver libsql do drizzle quebra em .get() quando a consulta nao retorna
  // linhas (normalizeRow recebe undefined). Usamos .all() e pegamos a primeira.
  const db = new Proxy(base, {
    get(target, prop, receiver) {
      if (prop === "get") {
        return async (query: SQL) => (await target.all(query))[0]
      }
      return Reflect.get(target, prop, receiver)
    },
  }) as Database
  return { client, db }
}
