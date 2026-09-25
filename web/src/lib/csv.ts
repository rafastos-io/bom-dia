import { PRIO_LABEL, STATUS_LABEL, TIPO_LABEL, substaskProgress } from "./tasks"
import type { Task } from "./types"

const HEADERS = [
  "ID",
  "Título",
  "Tipo",
  "Status",
  "Prioridade",
  "Prazo",
  "Projeto",
  "Tags",
  "Bloqueada por",
  "Quem pediu",
  "Prazo enviar",
  "Estimativa (min)",
  "Subtarefas",
  "Links",
  "Criada em",
  "Concluída em",
]

function fullDate(value: string | null | undefined): string {
  const iso = (value || "").slice(0, 10)
  if (!iso) return ""
  const [year, month, day] = iso.split("-")
  return `${day}/${month}/${year}`
}

function cell(value: unknown): string {
  return `"${String(value ?? "").replace(/"/g, '""')}"`
}

/** CSV com `;` e BOM (abre direto no Excel pt-BR). */
export function tasksToCsv(rows: Task[], allTasks: Task[] = rows): string {
  const titleById = new Map(allTasks.map((task) => [task.id, task.title]))
  const lines = [HEADERS.map(cell).join(";")]
  for (const task of rows) {
    const subs = substaskProgress(task.subtasks)
    const blockers = (task.blocked_by ?? [])
      .map((id) => titleById.get(id) ?? `#${id}`)
      .join(", ")
    const cells = [
      task.id,
      task.title,
      TIPO_LABEL[task.tipo] ?? task.tipo,
      STATUS_LABEL[task.status] ?? task.status,
      PRIO_LABEL[task.priority] ?? task.priority,
      fullDate(task.due_date),
      task.projeto || "",
      (task.tags ?? []).join(", "),
      blockers,
      task.requested_by || "",
      task.send_to || "",
      Number(task.estimate_min) || "",
      subs.total ? `${subs.done}/${subs.total}` : "",
      (task.links ?? []).map((link) => link.target).join(" "),
      fullDate(task.created_at),
      fullDate(task.completed_at),
    ]
    lines.push(cells.map(cell).join(";"))
  }
  return `\uFEFF${lines.join("\r\n")}`
}

export function downloadTasksCsv(rows: Task[], allTasks: Task[], filename: string): void {
  const blob = new Blob([tasksToCsv(rows, allTasks)], {
    type: "text/csv;charset=utf-8",
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1_000)
}
