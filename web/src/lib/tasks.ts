import type { AreaId } from "./areas"
import type { Prioridade, Status, Tipo, Task } from "./types"

export const TIPO_LABEL: Record<Tipo, string> = {
  tarefa: "Tarefa",
  ideia: "Ideia",
  rotina: "Rotina",
}

export const PRIO_LABEL: Record<Prioridade, string> = {
  alta: "Alta",
  media: "Média",
  baixa: "Baixa",
}

export const PRIO_RANK: Record<Prioridade, number> = {
  alta: 0,
  media: 1,
  baixa: 2,
}

export const RECOR_LABEL: Record<string, string> = {
  diaria: "Diária",
  semanal: "Semanal",
  mensal: "Mensal",
}

export const PERIODO_LABEL: Record<string, string> = {
  diaria: "hoje",
  semanal: "nesta semana",
  mensal: "neste mês",
}

export const STATUS_LABEL: Record<Status, string> = {
  aberta: "Aberta",
  andamento: "Em andamento",
  concluida: "Concluída",
}

export const STATUS_ORDER: Status[] = ["aberta", "andamento", "concluida"]

export type SortKey = "prioridade" | "prazo" | "criacao" | "az"
export type FilterKey = "ativas" | "todas" | "concluida"
export type ViewKey = "cards" | "lista" | "kanban"

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

export function isLate(task: Task): boolean {
  if (!task.due_date || task.status === "concluida") return false
  return task.due_date < todayISO()
}

export function fmtDate(value: string): string {
  if (!value) return ""
  const [, m, day] = value.split("-")
  return `${day}/${m}`
}

/** Minutos em texto curto: 90 -> "1h30", 45 -> "45min". */
export function fmtMinutes(minutes: number | null | undefined): string {
  const total = Number(minutes) || 0
  if (total <= 0) return ""
  if (total < 60) return `${total}min`
  const hours = Math.floor(total / 60)
  const rest = total % 60
  return rest ? `${hours}h${String(rest).padStart(2, "0")}` : `${hours}h`
}

export function inArea(task: Task, area: AreaId): boolean {
  const tipo = task.tipo || "tarefa"
  if (area === "hoje") return tipo === "tarefa"
  if (area === "agenda") return Boolean((task.due_date || "").trim())
  if (area === "ideias") return tipo === "ideia"
  if (area === "rotina") return tipo === "rotina"
  if (area === "projetos") return Boolean((task.projeto || "").trim())
  return true
}

export type ArchivedIndex = {
  names: Set<string>
  ids: Set<number>
}

export function archivedIndex(projects: Array<{ id: number; name: string; status: string }>): ArchivedIndex {
  const names = new Set<string>()
  const ids = new Set<number>()
  for (const p of projects) {
    if ((p.status || "ativo") !== "ativo") {
      names.add((p.name || "").trim().toLowerCase())
      ids.add(p.id)
    }
  }
  return { names, ids }
}

export function isTaskHidden(
  task: Task,
  archived: ArchivedIndex,
  openProject: string | null,
): boolean {
  const proj = (task.projeto || "").trim().toLowerCase()
  if (openProject && proj && proj === openProject.trim().toLowerCase()) return false
  if (proj && archived.names.has(proj)) return true
  const links = task.idea_links || []
  if (
    links.some(
      (l) => l.target_type === "projeto" && archived.ids.has(l.target_id),
    )
  ) {
    return true
  }
  return false
}

export type FilterOptions = {
  area: AreaId
  openProject: string | null
  archived: ArchivedIndex
  filter: FilterKey
  prio: "todas" | Prioridade
  lateOnly: boolean
  search: string
  /** Origem: espelhada da CENTRAL, criada no Bom Dia ou todas. */
  origem: "todas" | "central" | "manuais"
  /** Grupo macro do projeto da tarefa ("todos" = sem filtro). */
  grupo: string
  /** nome do projeto (minúsculo) -> grupo. */
  groups: Map<string, string>
}

export function matchesFilters(
  task: Task,
  opts: FilterOptions,
  { ignoreStatus = false, ignoreArea = false } = {},
): boolean {
  if (isTaskHidden(task, opts.archived, opts.openProject)) return false

  if (opts.area === "projetos" && opts.openProject) {
    if ((task.tipo || "") === "ideia") return false
    if ((task.projeto || "").trim() !== opts.openProject) return false
  } else if (!ignoreArea && !inArea(task, opts.area)) {
    return false
  }

  if (!ignoreStatus) {
    if (opts.filter === "ativas" && task.status === "concluida") return false
    if (opts.filter === "concluida" && task.status !== "concluida") return false
  }
  if (opts.prio !== "todas" && task.priority !== opts.prio) return false
  if (opts.lateOnly && !isLate(task)) return false
  if (opts.origem !== "todas") {
    const fromCentral = Boolean(task.central)
    if (opts.origem === "central" && !fromCentral) return false
    if (opts.origem === "manuais" && fromCentral) return false
  }
  if (opts.grupo !== "todos") {
    const projeto = (task.projeto || "").trim().toLowerCase()
    if (!projeto || (opts.groups.get(projeto) ?? "") !== opts.grupo) return false
  }
  if (opts.search) {
    const hay = `${task.title} ${task.requested_by} ${task.send_to} ${task.description}`.toLowerCase()
    if (!hay.includes(opts.search.toLowerCase())) return false
  }
  return true
}

export function sortTasks(list: Task[], sort: SortKey): Task[] {
  const arr = [...list]
  const far = "9999-12-31"
  if (sort === "prazo") {
    arr.sort((a, b) => (a.due_date || far).localeCompare(b.due_date || far))
  } else if (sort === "criacao") {
    arr.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""))
  } else if (sort === "az") {
    arr.sort((a, b) => a.title.localeCompare(b.title, "pt"))
  } else {
    arr.sort((a, b) => {
      const done = Number(a.status === "concluida") - Number(b.status === "concluida")
      if (done) return done
      const prio = PRIO_RANK[a.priority] - PRIO_RANK[b.priority]
      if (prio) return prio
      return (a.due_date || far).localeCompare(b.due_date || far)
    })
  }
  return arr
}

export function areaCounts(
  tasks: Task[],
  archived: ArchivedIndex,
  currentArea: AreaId,
): Record<AreaId, number> {
  const counts: Record<AreaId, number> = {
    hoje: 0,
    agenda: 0,
    rotina: 0,
    ideias: 0,
    projetos: 0,
  }
  for (const task of tasks) {
    if (task.status === "concluida") continue
    if (isTaskHidden(task, archived, null)) continue
    for (const area of Object.keys(counts) as AreaId[]) {
      if (inArea(task, area)) counts[area] += 1
    }
  }
  // A área aberta mostra o próprio contador considerando o contexto
  void currentArea
  return counts
}

export function greetWord(): string {
  const hour = new Date().getHours()
  if (hour >= 12 && hour < 18) return "Boa tarde"
  if (hour >= 18 || hour < 5) return "Boa noite"
  return "Bom dia"
}

export function fmtBytes(n: number): string {
  const value = Number(n) || 0
  if (value < 1024) return `${value} B`
  if (value < 1048576) return `${Math.round(value / 1024)} KB`
  return `${(value / 1048576).toFixed(1)} MB`
}

export function isImageAttachment(contentType: string): boolean {
  return (
    (contentType || "").startsWith("image/") && contentType !== "image/svg+xml"
  )
}

export function substaskProgress(subs: Task["subtasks"]): {
  done: number
  total: number
  percent: number
} {
  const total = subs.length
  const done = subs.filter((s) => s.done).length
  return { done, total, percent: total ? Math.round((done / total) * 100) : 0 }
}
