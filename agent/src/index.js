#!/usr/bin/env node
/**
 * Agente local do radar da CENTRAL.
 *
 * Uso:
 *   node src/index.js once      varredura unica (so o que mudou desde a ultima)
 *   node src/index.js backfill  varredura unica forcando o reenvio de tudo
 *   node src/index.js watch     varredura inicial + observacao em tempo real
 *
 * Config no ambiente: BOMDIA_BASE_URL, BOMDIA_SERVICE_TOKEN, CENTRAL_DIR,
 * STATE_PATH, DEBOUNCE_MS, SCAN_INTERVAL_MS, BATCH_SIZE, DRY_RUN=1.
 */
import { loadConfig } from "./config.js"
import { syncFull } from "./scan.js"
import { loadState, saveState } from "./state.js"
import { startWatch } from "./watch.js"

const command = (process.argv[2] ?? "watch").toLowerCase()
const config = loadConfig()

if (!["once", "backfill", "watch"].includes(command)) {
  console.error(`[radar] comando desconhecido: ${command} (use once, backfill ou watch)`)
  process.exit(1)
}
if (!config.dryRun && !config.token) {
  console.error("[radar] BOMDIA_SERVICE_TOKEN ausente (ou use DRY_RUN=1 para simular).")
  process.exit(1)
}

const state = await loadState(config.statePath)

if (command === "once" || command === "backfill") {
  const report = await syncFull(config, state, { force: command === "backfill" })
  if (!config.dryRun) await saveState(config.statePath, state)
  console.log(
    `[radar] ${command}: ${report.sent} notas, ${report.entries} entradas, ` +
      `${report.deleted} removidas (${report.scanned} arquivos varridos)` +
      (config.dryRun ? " — dry-run" : ""),
  )
} else {
  try {
    const first = await syncFull(config, state)
    if (!config.dryRun) await saveState(config.statePath, state)
    console.log(
      `[radar] varredura inicial: ${first.sent} notas, ${first.entries} entradas, ` +
        `${first.deleted} removidas (${first.scanned} arquivos)` +
        (config.dryRun ? " — dry-run" : ""),
    )
  } catch (error) {
    console.error(`[radar] varredura inicial falhou (o watch tenta de novo): ${error.message}`)
  }
  startWatch(config, state)
  console.log(`[radar] observando ${config.centralDir} (Ctrl+C para sair)`)
}
