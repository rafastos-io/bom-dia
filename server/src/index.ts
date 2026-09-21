import { serve } from "@hono/node-server"
import { createApp } from "./app.js"
import { startBackupScheduler } from "./backup.js"
import { PORT, apiKeyOk, loadConfig } from "./config.js"
import { authConfigured } from "./auth.js"
import { createDatabase } from "./db/client.js"
import { ensureSchema } from "./db/migrate.js"

const { client, db } = createDatabase()

await ensureSchema(client)

const app = createApp(db)
startBackupScheduler()

serve({ fetch: app.fetch, port: PORT, hostname: "0.0.0.0" }, async (info) => {
  console.log(`[bomdia] escutando em http://0.0.0.0:${info.port}`)
  if (!authConfigured()) {
    console.warn("[bomdia] aviso: AUTH_PASSWORD/AUTH_PASSWORD_SHA256 nao configurados.")
  }
  if (!process.env.AUTH_SECRET) {
    console.warn("[bomdia] aviso: AUTH_SECRET nao definido; sessoes caem no proximo restart.")
  }
  const cfg = await loadConfig(db)
  console.log(
    `[bomdia] OpenAI configurada: ${apiKeyOk(cfg.openaiApiKey)} | modelo: ${cfg.model}`,
  )
})
