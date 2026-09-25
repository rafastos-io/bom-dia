/**
 * Sinais de atividade sem registro.
 *
 * Olha o `caminho_local` das notas ativas de produto/projeto e pega o ultimo
 * commit do repositorio (data + assunto). O servidor guarda isso e o radar
 * mostra "atividade detectada sem registro" quando o repo andou depois da
 * ultima atualizacao da nota. Nada e escrito no vault.
 */
import { execFile } from "node:child_process"
import { existsSync } from "node:fs"

const EMPTY = { at: "", detail: "" }

/** Ultimo commit do repositorio (data curta + assunto). */
export function gitLastCommit(dir) {
  return new Promise((resolve) => {
    execFile(
      "git",
      ["-C", dir, "log", "-1", "--format=%cs%x09%s"],
      { timeout: 8000, windowsHide: true },
      (error, stdout) => {
        if (error) {
          resolve(EMPTY)
          return
        }
        const [at = "", detail = ""] = String(stdout).trim().split("\t")
        resolve({ at, detail: detail.slice(0, 200) })
      },
    )
  })
}

/** Notas candidatas: produto/projeto ativas com `caminho_local`. */
export function localCandidates(notes) {
  return notes.filter(
    (note) =>
      (note.tipo === "produto" || note.tipo === "projeto") &&
      (note.status || "").toLowerCase() === "ativo" &&
      (note.caminhoLocal || "").trim(),
  )
}

/** Coleta a atividade das notas (runner injetavel para os testes). */
export async function collectActivity(notes, { run = gitLastCommit, concurrency = 4 } = {}) {
  const candidates = localCandidates(notes)
  const items = []
  let next = 0
  async function worker() {
    while (next < candidates.length) {
      const current = candidates[next]
      next += 1
      const dir = current.caminhoLocal.replace(/^"|"$/g, "").trim()
      if (!existsSync(dir)) continue
      const activity = await run(dir)
      if (activity.at) {
        items.push({ path: current.path, activityAt: activity.at, detail: activity.detail })
      }
    }
  }
  const workers = Math.max(1, Math.min(concurrency, candidates.length))
  await Promise.all(Array.from({ length: workers }, worker))
  return items
}
