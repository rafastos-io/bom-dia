export type Tipo = "tarefa" | "ideia" | "rotina"
export type Prioridade = "alta" | "media" | "baixa"
export type Status = "aberta" | "andamento" | "concluida"
export type Recorrencia = "" | "diaria" | "semanal" | "mensal"
export type LinkKind = "web" | "pasta" | "nota"

export type TaskLink = {
  id?: number
  kind: LinkKind
  label: string
  target: string
}

export type Subtask = {
  id?: number
  title: string
  done: 0 | 1
  position?: number
}

export type IdeaLink = {
  id?: number
  target_type: "projeto" | "rotina" | "tarefa"
  target_id: number
  label?: string
  target_tipo?: Tipo
}

/** Vinculo derivado da CENTRAL exposto junto da tarefa (somente leitura). */
export type TaskCentral = { path: string; title: string; state: string; section: string }

export type Task = {
  id: number
  title: string
  requested_by: string
  send_to: string
  due_date: string
  priority: Prioridade
  description: string
  status: Status
  created_at: string
  area: string
  tipo: Tipo
  projeto: string
  recorrencia: Recorrencia
  feito_em: string
  feita: boolean
  links: TaskLink[]
  subtasks: Subtask[]
  idea_links: IdeaLink[]
  attach_count: number
  completed_at?: string
  estimate_min?: number
  /** Etiquetas livres da demanda. */
  tags: string[]
  /** Ids das demandas que precisam terminar antes desta. */
  blocked_by: number[]
  /** Vínculo com a CENTRAL (espelho), quando existir. */
  central?: TaskCentral | null
}

/** Evento do histórico/atividade da demanda. */
export type TaskEvent = {
  id: number
  task_id: number
  kind: "criada" | "alterou" | string
  field: string
  from_value: string
  to_value: string
  created_at: string
}

export type TaskPayload = {
  title: string
  tipo: Tipo
  projeto: string
  priority: Prioridade
  status: Status
  due_date: string
  requested_by: string
  send_to: string
  description: string
  links: TaskLink[]
  subtasks: Subtask[]
  recorrencia: Recorrencia
  idea_links?: Pick<IdeaLink, "target_type" | "target_id">[]
  estimate_min?: number
  tags?: string[]
  blocked_by?: number[]
}

export type ProjectLink = {
  id?: number
  kind: LinkKind
  label: string
  target: string
  grupo: string
}

export type Project = {
  id: number
  name: string
  scope: string
  people: string
  status: "ativo" | "arquivado" | string
  collapsed: 0 | 1
  position: number
  created_at: string
  /** Grupo macro espelhado da CENTRAL (area da nota). */
  grupo?: string
  links: ProjectLink[]
  task_total: number
  task_ativas: number
}

export type Note = {
  id: number
  project_id: number
  title: string
  body: string
  position: number
  updated_at: string
}

export type Attachment = {
  id: number
  owner_type: "task" | "project"
  owner_id: number
  filename: string
  content_type: string
  size: number
  created_at: string
}

export type AiStatus = {
  configured: boolean
  model: string
  name: string
  env: string
  local: boolean
  storage: boolean
  max_upload_mb: number
}

export type ParsedQuestion = {
  campo: "projeto" | "prazo" | "links" | "recorrencia" | "vinculos" | string
  pergunta: string
  opcoes?: string[]
}

export type ParsedTask = {
  title: string
  tipo?: Tipo
  projeto?: string
  priority?: Prioridade
  due_date?: string
  description?: string
  requested_by?: string
  send_to?: string
  recorrencia?: Recorrencia
  motivo?: string
  links?: Array<{ kind?: LinkKind; label?: string; target: string }>
  subtasks?: Array<string | { title: string; done?: 0 | 1 }>
  perguntas?: ParsedQuestion[]
  idea_links?: Array<{
    target_type: "projeto" | "rotina" | "tarefa"
    target_id: number
    label?: string
    target_tipo?: Tipo
  }>
  [key: string]: unknown
}

export type ParsedPayload = {
  tarefas: ParsedTask[]
  projetos?: Array<{ name: string; scope?: string; people?: string }>
  error?: string
  [key: string]: unknown
}

export type WhatsappPayload = {
  task: Task
  modo: "avisar" | "delegar"
}

export type WhatsappResult = {
  mensagem: string
}

export type RadarItem = {
  text: string
  kind: "progresso" | "aberto" | "proxima_acao" | "decisao" | string
  section: string
  note: string
  path: string
  date: string
}

export type RadarNoArItem = RadarItem & { ageDays: number }

/** Leitura derivada da CENTRAL (somente leitura; ver PLANO-RADAR-CENTRAL.md). */
export type RadarDigest = {
  progresso: Array<{ date: string; items: RadarItem[] }>
  noAr: RadarNoArItem[]
  atualizadoEm: string
}

/** Item da fila de revisões do espelho. */
export type RadarReviewItem = {
  id: number
  title: string
  status: string
  projeto: string
  completedAt: string
  path: string
  note: string
  section: string
}

/** Atividade detectada no repositório depois da última atualização da nota. */
export type RadarActivityItem = {
  path: string
  title: string
  updatedAt: string
  activityAt: string
  detail: string
}

/** Fechamento sugerido pela IA a partir de texto livre (revisão humana). */
export type RadarSuggestionItem = {
  id: number
  taskId: number
  taskTitle: string
  note: string
  entryText: string
  entryDate: string
  confidence: number
}

export type RadarReviews = {
  divergentes: RadarReviewItem[]
  semProjeto: RadarReviewItem[]
  fechadas: RadarReviewItem[]
  semRegistro: RadarActivityItem[]
  sugestoes: RadarSuggestionItem[]
}
