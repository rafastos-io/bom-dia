#!/usr/bin/env node
/**
 * Agente local do radar da CENTRAL.
 *
 * Uso:
 *   node src/index.js once       varredura unica (so o que mudou desde a ultima)
 *   node src/index.js backfill   varredura unica forcando o reenvio de tudo
 *   node src/index.js watch      varredura inicial + observacao em tempo real
 *   node src/index.js reconcile  reconstroi o espelho de demandas no servidor
 *
 * O `backfill` tambem dispara o reconcile no fim (a ingestao pula notas
 * inalteradas; o reconcile e o que materializa o espelho de demandas).
 *
 * Config no ambiente: BOMDIA_BASE_URL, BOMDIA_SERVICE_TOKEN, CENTRAL_DIR,
 * STATE_PATH, DEBOUNCE_MS, SCAN_INTERVAL_MS, BATCH_SIZE, DRY_RUN=1.
 */
import { loadConfig } from "./config.js"
import { sendReconcile } from "./api.js"
import { syncActivity, syncFull } from "./scan.js"
import { loadState, saveState } from "./state.js"
import { startWatch } from "./watch.js"

const command = (process.argv[2] ?? "watch").toLowerCase()
const config = loadConfig()

if (!["once", "backfill", "watch", "reconcile"].includes(command)) {
  console.error(`[radar] comando desconhecido: ${command} (use once, backfill, watch ou reconcile)`)
  process.exit(1)
}
if (!config.dryRun && !config.token) {
  console.error("[radar] BOMDIA_SERVICE_TOKEN ausente (ou use DRY_RUN=1 para simular).")
  process.exit(1)
}

const state = await loadState(config.statePath)

if (command === "reconcile") {
  const report = await sendReconcile(config)
  console.log(
    `[radar] reconcile: ${report.projects ?? 0} projetos, ${report.created ?? 0} tarefas criadas, ` +
      `${report.updated ?? 0} atualizadas, ${report.closed ?? 0} fechadas, ` +
      `${report.reopened ?? 0} reabertas, ${report.subtasks ?? 0} subtarefas` +
      (config.dryRun ? " — dry-run" : ""),
  )
} else if (command === "once" || command === "backfill") {
  const report = await syncFull(config, state, { force: command === "backfill" })
  if (!config.dryRun) await saveState(config.statePath, state)
  console.log(
    `[radar] ${command}: ${report.sent} notas, ${report.entries} entradas, ` +
      `${report.deleted} removidas (${report.scanned} arquivos varridos)` +
      (config.dryRun ? " — dry-run" : ""),
  )
  const mirror = report.mirror ?? {}
  console.log(
    `[radar] espelho (ingestao): ${mirror.projects ?? 0} projetos, ${mirror.created ?? 0} tarefas criadas, ` +
      `${mirror.updated ?? 0} atualizadas, ${mirror.closed ?? 0} fechadas, ` +
      `${mirror.reopened ?? 0} reabertas, ${mirror.subtasks ?? 0} subtarefas`,
  )
  const activity = await syncActivity(config)
  console.log(
    `[radar] atividade: ${activity.items} repositorios lidos, ${activity.updated} atualizados`,
  )
  if (command === "backfill") {
    const rest = await sendReconcile(config)
    console.log(
      `[radar] reconcile: ${rest.projects ?? 0} projetos, ${rest.created ?? 0} tarefas criadas, ` +
        `${rest.updated ?? 0} atualizadas, ${rest.closed ?? 0} fechadas, ` +
        `${rest.reopened ?? 0} reabertas, ${rest.subtasks ?? 0} subtarefas` +
        (config.dryRun ? " — dry-run" : ""),
    )
  }
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
  try {
    const activity = await syncActivity(config)
    if (activity.items) {
      console.log(`[radar] atividade: ${activity.items} repositorios lidos`)
    }
  } catch (error) {
    console.error(`[radar] atividade falhou (o rescan tenta de novo): ${error.message}`)
  }
  startWatch(config, state)
  console.log(`[radar] observando ${config.centralDir} (Ctrl+C para sair)`)
}
