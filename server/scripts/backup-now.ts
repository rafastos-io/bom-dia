/**
 * Roda um backup do Turso para o R2 agora (mesmo caminho do agendador).
 *
 * Uso:
 *   npm run backup        (usa TURSO_DATABASE_URL/TURSO_AUTH_TOKEN e R2_* do ambiente)
 *
 * O agendador do servidor ja faz isso sozinho; este script e para rodar sob
 * demanda (ex.: antes de uma migracao) e conferir o resultado no terminal.
 */
import { backupEnabled, backupState, runBackup } from "../src/backup.js"

if (!backupEnabled()) {
  console.error("[backup] desabilitado: TURSO_DATABASE_URL remoto e R2_* sao obrigatorios")
  process.exit(1)
}

try {
  const result = await runBackup()
  console.log(`[backup] ok: ${result.key} (${(result.size / 1024).toFixed(1)} KB)`)
  for (const key of result.pruned) console.log(`[backup] podado: ${key}`)
  console.log(`[backup] estado: ${JSON.stringify(backupState())}`)
} catch (error) {
  console.error(`[backup] falhou: ${(error as Error).message}`)
  process.exit(1)
}
