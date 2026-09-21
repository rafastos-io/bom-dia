import { readFile, writeFile } from "node:fs/promises"

/** Estado local do agente: hash da ultima versao enviada de cada nota. */
export async function loadState(statePath) {
  try {
    const parsed = JSON.parse(await readFile(statePath, "utf-8"))
    return {
      notes: parsed?.notes && typeof parsed.notes === "object" ? parsed.notes : {},
      updatedAt: typeof parsed?.updatedAt === "string" ? parsed.updatedAt : "",
    }
  } catch {
    return { notes: {}, updatedAt: "" }
  }
}

export async function saveState(statePath, state) {
  state.updatedAt = new Date().toISOString()
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf-8")
}
