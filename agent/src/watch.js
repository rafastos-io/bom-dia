import chokidar from "chokidar"
import { relPath, syncActivity, syncDeleted, syncFiles, syncFull } from "./scan.js"
import { saveState } from "./state.js"

const IGNORE = /(^|[\\/])(\.obsidian|\.trash|\.git|node_modules|99 - Sistema)([\\/]|$)/

/**
 * Observa o vault com debounce. Cada evento reprograma um flush curto; o flush
 * junta tudo num lote. Em falha de envio, devolve para a fila e tenta de novo.
 */
export function startWatch(config, state, { log = console } = {}) {
  const pending = new Set()
  const removed = new Set()
  let timer = null

  const schedule = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => void flush(), config.debounceMs)
  }

  async function flush() {
    const files = [...pending]
    const gone = [...removed]
    pending.clear()
    removed.clear()
    try {
      if (files.length) {
        const report = await syncFiles(config, state, files)
        if (report.sent) log.log(`[radar] ${report.sent} notas, ${report.entries} entradas`)
      }
      if (gone.length) {
        const report = await syncDeleted(config, state, gone)
        if (report.deleted) log.log(`[radar] ${report.deleted} notas removidas`)
      }
      await saveState(config.statePath, state)
    } catch (error) {
      log.error(`[radar] envio falhou: ${error.message}`)
      for (const file of files) pending.add(file)
      for (const path of gone) removed.add(path)
      schedule()
    }
  }

  const watcher = chokidar.watch(config.centralDir, {
    ignoreInitial: true,
    ignored: (target) => IGNORE.test(String(target)),
  })
  const isMarkdown = (target) => String(target).toLowerCase().endsWith(".md")
  watcher.on("add", (target) => {
    if (!isMarkdown(target)) return
    pending.add(String(target))
    schedule()
  })
  watcher.on("change", (target) => {
    if (!isMarkdown(target)) return
    pending.add(String(target))
    schedule()
  })
  watcher.on("unlink", (target) => {
    if (!isMarkdown(target)) return
    removed.add(relPath(config.centralDir, String(target)))
    schedule()
  })
  watcher.on("error", (error) => log.error(`[radar] watcher: ${error.message}`))

  const interval = setInterval(() => void rescan(), config.scanIntervalMs)
  async function rescan() {
    try {
      const report = await syncFull(config, state)
      if (report.sent || report.deleted) {
        log.log(`[radar] revarredura: ${report.sent} notas, ${report.deleted} removidas`)
      }
      await saveState(config.statePath, state)
    } catch (error) {
      log.error(`[radar] revarredura falhou: ${error.message}`)
    }
    try {
      const activity = await syncActivity(config)
      if (activity.items) {
        log.log(`[radar] atividade: ${activity.items} repositorios lidos`)
      }
    } catch (error) {
      log.error(`[radar] atividade falhou: ${error.message}`)
    }
  }

  return {
    watcher,
    close: () => {
      clearInterval(interval)
      return watcher.close()
    },
  }
}
