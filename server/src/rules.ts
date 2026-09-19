export const TIPOS = new Set(["tarefa", "ideia", "rotina"])
export const RECORRENCIAS = new Set(["diaria", "semanal", "mensal"])
export const PRIORIDADES = new Set(["alta", "media", "baixa"])
export const IDEA_TARGET_TIPOS = new Set(["projeto", "rotina", "tarefa"])

export function nowIso(): string {
  return new Date().toISOString().slice(0, 19)
}

/** Ano e semana ISO 8601, como o isocalendar() do Python. */
function isoWeek(date: Date): { year: number; week: number } {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)
  return { year: d.getUTCFullYear(), week }
}

/** Identificador do periodo corrente, conforme a recorrencia. */
export function periodoAtual(recorrencia: string, today = new Date()): string {
  if (recorrencia === "diaria") {
    return today.toISOString().slice(0, 10)
  }
  if (recorrencia === "semanal") {
    const { year, week } = isoWeek(today)
    return `${year}-W${String(week).padStart(2, "0")}`
  }
  if (recorrencia === "mensal") {
    return `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}`
  }
  return ""
}

export function cleanRecorrencia(value: unknown, tipo?: string): string {
  let rec = String(value ?? "").trim()
  if (!RECORRENCIAS.has(rec)) rec = ""
  // recorrência vale para rotina (check por período) e tarefa (gera a próxima ao concluir)
  if (tipo !== undefined && tipo !== "rotina" && tipo !== "tarefa") rec = ""
  return rec
}

/** Próxima data conforme a recorrência (diária/semanal/mensal), a partir de uma data ISO. */
export function advanceDate(iso: string, recorrencia: string): string {
  const base = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00Z`) : new Date()
  if (recorrencia === "diaria") base.setUTCDate(base.getUTCDate() + 1)
  else if (recorrencia === "semanal") base.setUTCDate(base.getUTCDate() + 7)
  else if (recorrencia === "mensal") base.setUTCMonth(base.getUTCMonth() + 1)
  return base.toISOString().slice(0, 10)
}

export type TaskLike = {
  tipo?: string | null
  projeto?: string | null
  due_date?: string | null
  recorrencia?: string | null
  links?: unknown
}

export type Gap = {
  campo: string
  tipo: string
  pergunta: string
  opcoes?: string[]
}

/** O CODIGO decide quais perguntas fazer, conforme o TIPO e os campos vazios. */
export function buildGaps(task: TaskLike, projetos: string[]): Gap[] {
  const tipo = task.tipo || "tarefa"
  const semProjeto = !(task.projeto || "").trim()
  const semLink = !Array.isArray(task.links) || task.links.length === 0
  const projQ = (pergunta: string): Gap => ({
    campo: "projeto",
    tipo: "opcoes",
    opcoes: projetos,
    pergunta,
  })
  const linkQ: Gap = {
    campo: "links",
    tipo: "link",
    pergunta: "Algum link ou pasta? (Canva, Drive, pasta do PC)",
  }
  const gaps: Gap[] = []

  if (tipo === "rotina") {
    if (!(task.recorrencia || "").trim()) {
      gaps.push({ campo: "recorrencia", tipo: "recorrencia", pergunta: "Com que frequencia isso se repete?" })
    }
    if (semProjeto) gaps.push(projQ("De qual projeto e essa rotina?"))
    if (semLink) gaps.push(linkQ)
  } else if (tipo === "ideia") {
    gaps.push({ campo: "vinculos", tipo: "vinculos", pergunta: "Quer amarrar essa ideia a um projeto, rotina ou tarefa?" })
    if (semProjeto) gaps.push(projQ("E de algum projeto?"))
    if (semLink) gaps.push(linkQ)
  } else {
    if (semProjeto) gaps.push(projQ("A que projeto isso pertence?"))
    if (!(task.due_date || "").trim()) {
      gaps.push({ campo: "prazo", tipo: "data", pergunta: "Tem um prazo?" })
    }
    if (semLink) gaps.push(linkQ)
  }
  return gaps
}
