import { Button } from "@rafastos/ui/button"
import { Checkbox } from "@rafastos/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@rafastos/ui/dialog"
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@rafastos/ui/drawer"
import { Input } from "@rafastos/ui/input"
import { NativeSelect, NativeSelectOption } from "@rafastos/ui/native-select"
import { Progress } from "@rafastos/ui/progress"
import { Separator } from "@rafastos/ui/separator"
import { Spinner } from "@rafastos/ui/spinner"
import { Textarea } from "@rafastos/ui/textarea"
import {
  Copy,
  Folder,
  GripVertical,
  History,
  Link as LinkIcon,
  Lock,
  MessageCircle,
  Plus,
  Sparkles,
  Tag as TagIcon,
  Trash2,
  X,
} from "lucide-react"
import { Reorder } from "motion/react"
import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { Attachments } from "@/components/attachments"
import { Chip } from "@/components/app/chip"
import { useConfirm } from "@/components/app/confirm"
import { Mascot } from "@/components/app/mascot"
import { useOverlays } from "@/components/overlay-provider"
import { fmtDate, fmtMinutes } from "@/lib/tasks"
import { useIsCompact } from "@/lib/use-media-query"
import {
  useDeleteTask,
  useProjects,
  useSaveTask,
  useTasks,
  useTaskEvents,
} from "@/lib/queries"
import type {
  IdeaLink,
  Prioridade,
  Recorrencia,
  Status,
  Task,
  TaskLink,
  TaskPayload,
  Tipo,
} from "@/lib/types"

type LinkDraft = TaskLink & { uid: number }
type SubtaskDraft = { uid: number; title: string; done: boolean }
type IdeaLinkDraft = IdeaLink

type FormState = {
  title: string
  tipo: Tipo
  priority: Prioridade
  status: Status
  due_date: string
  recorrencia: Recorrencia
  projeto: string
  requested_by: string
  send_to: string
  description: string
  links: LinkDraft[]
  subtasks: SubtaskDraft[]
  ideaLinks: IdeaLinkDraft[]
  estimate_min: number
  tags: string[]
  blocked_by: number[]
}

export type TaskFormPresets = Partial<FormState>

let UID = 0

function isoOffset(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}
const uid = () => ++UID

const draftKey = (taskId: number | null) => `bomdia_draft_${taskId ?? "novo"}`

function emptyState(presets?: Partial<FormState>): FormState {
  return {
    title: "",
    tipo: "tarefa",
    priority: "media",
    status: "aberta",
    due_date: "",
    recorrencia: "",
    projeto: "",
    requested_by: "",
    send_to: "",
    description: "",
    links: [],
    subtasks: [],
    ideaLinks: [],
    estimate_min: 0,
    tags: [],
    blocked_by: [],
    ...presets,
  }
}

function stateFromTask(task: Task): FormState {
  return {
    title: task.title || "",
    tipo: task.tipo || "tarefa",
    priority: task.priority || "media",
    status: task.status || "aberta",
    due_date: task.due_date || "",
    recorrencia: task.recorrencia || "",
    projeto: task.projeto || "",
    requested_by: task.requested_by || "",
    send_to: task.send_to || "",
    description: task.description || "",
    links: (task.links || []).map((l) => ({ ...l, uid: uid() })),
    subtasks: (task.subtasks || []).map((s) => ({
      uid: uid(),
      title: s.title,
      done: Boolean(s.done),
    })),
    ideaLinks: (task.idea_links || []).map((l) => ({ ...l })),
    estimate_min: task.estimate_min ?? 0,
    tags: task.tags ?? [],
    blocked_by: task.blocked_by ?? [],
  }
}

function loadDraft(key: string): FormState | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as FormState
    parsed.links = (parsed.links || []).map((l) => ({ ...l, uid: uid() }))
    parsed.subtasks = (parsed.subtasks || []).map((s) => ({ ...s, uid: uid() }))
    parsed.ideaLinks = parsed.ideaLinks || []
    parsed.tags = Array.isArray(parsed.tags) ? parsed.tags : []
    parsed.blocked_by = Array.isArray(parsed.blocked_by) ? parsed.blocked_by : []
    return parsed
  } catch {
    return null
  }
}

function ideaLinkKey(link: IdeaLinkDraft) {
  return `${link.target_type}:${link.target_id}`
}

function snapshotOf(state: FormState) {
  return {
    title: state.title,
    tipo: state.tipo,
    priority: state.priority,
    status: state.status,
    due_date: state.due_date,
    recorrencia: state.recorrencia,
    projeto: state.projeto,
    requested_by: state.requested_by,
    send_to: state.send_to,
    description: state.description,
    links: state.links.map((l) => ({ kind: l.kind, label: l.label, target: l.target })),
    subtasks: state.subtasks.map((s) => ({ title: s.title, done: s.done })),
    ideaLinks: state.ideaLinks.map(ideaLinkKey).sort(),
    estimate_min: state.estimate_min,
    tags: [...state.tags].sort(),
    blocked_by: [...state.blocked_by].sort(),
  }
}

function buildInitial(task: Task | null, presets?: Partial<FormState>) {
  const base = task ? stateFromTask(task) : emptyState(presets)
  const draft = loadDraft(draftKey(task?.id ?? null))
  if (draft) return { base, form: { ...base, ...draft }, restored: true }
  return { base, form: base, restored: false }
}

type TaskDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  task: Task | null
  presets?: Partial<FormState>
}

export function TaskDialog({ open, onOpenChange, task, presets }: TaskDialogProps) {
  const compact = useIsCompact()
  const tasks = useTasks()
  const projects = useProjects()
  const saveTask = useSaveTask()
  const deleteTask = useDeleteTask()
  const overlays = useOverlays()
  const { confirm } = useConfirm()

  const [{ base, form: initialForm, restored }] = useState(() =>
    buildInitial(task, presets),
  )
  const [form, setForm] = useState<FormState>(initialForm)
  const [draftKept, setDraftKept] = useState(restored)
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const dirty =
    JSON.stringify(snapshotOf(form)) !== JSON.stringify(snapshotOf(initialForm))

  // Autosave do rascunho (debounce), como na UI antiga
  useEffect(() => {
    if (!dirty) return
    draftTimer.current = setTimeout(() => {
      try {
        localStorage.setItem(draftKey(task?.id ?? null), JSON.stringify(form))
      } catch {
        /* sem localStorage */
      }
    }, 800)
    return () => {
      if (draftTimer.current) clearTimeout(draftTimer.current)
    }
  }, [form, dirty, task?.id])

  function discardDraft() {
    try {
      localStorage.removeItem(draftKey(task?.id ?? null))
    } catch {
      /* sem localStorage */
    }
    setForm(base)
    setDraftKept(false)
  }

  function handleOpenChange(next: boolean) {
    const close = () => {
      saveTask.reset()
      deleteTask.reset()
      onOpenChange(next)
    }
    if (!next && dirty) {
      void confirm({
        title: "Descartar alterações não salvas?",
        description: "As mudanças deste formulário serão perdidas.",
        confirmLabel: "Descartar",
        destructive: true,
      }).then((ok) => {
        if (ok) close()
      })
      return
    }
    close()
  }

  const projectNames = useMemo(() => {
    const names = new Set<string>()
    for (const project of projects.data ?? []) names.add(project.name)
    for (const item of tasks.data ?? []) {
      if (item.projeto?.trim()) names.add(item.projeto.trim())
    }
    return [...names].sort((a, b) => a.localeCompare(b, "pt-BR"))
  }, [projects.data, tasks.data])

  const blockCandidates = useMemo(
    () =>
      (tasks.data ?? [])
        .filter((item) => item.id !== task?.id)
        .filter((item) => (item.status || "aberta") !== "concluida")
        .filter((item) => !form.blocked_by.includes(item.id))
        .sort((a, b) => a.title.localeCompare(b.title, "pt-BR")),
    [tasks.data, task?.id, form.blocked_by],
  )

  const titleById = useMemo(
    () => new Map((tasks.data ?? []).map((item) => [item.id, item.title])),
    [tasks.data],
  )

  const ideaTargets = useMemo(() => {
    const projectsList = (projects.data ?? []).map((p) => ({
      value: `projeto:${p.id}`,
      label: p.name,
    }))
    const routines = (tasks.data ?? [])
      .filter((t) => t.tipo === "rotina")
      .map((t) => ({ value: `rotina:${t.id}`, label: t.title }))
    const taskList = (tasks.data ?? [])
      .filter((t) => (t.tipo || "tarefa") === "tarefa")
      .map((t) => ({ value: `tarefa:${t.id}`, label: t.title }))
    return { projectsList, routines, taskList }
  }, [projects.data, tasks.data])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const title = form.title.trim()
    if (!title) {
      toast.error("Dá um título pra tarefa primeiro")
      return
    }
    const payload: TaskPayload = {
      title,
      tipo: form.tipo,
      projeto: form.projeto.trim(),
      priority: form.priority,
      status: form.status,
      due_date: form.due_date,
      requested_by: form.requested_by.trim(),
      send_to: form.send_to.trim(),
      description: form.description,
      links: form.links
        .map((l) => ({ kind: l.kind, label: l.label.trim(), target: l.target.trim() }))
        .filter((l) => l.target),
      subtasks: form.subtasks
        .map((s) => ({ title: s.title.trim(), done: s.done ? (1 as const) : (0 as const) }))
        .filter((s) => s.title),
      recorrencia: form.recorrencia,
      estimate_min: form.estimate_min,
      tags: form.tags,
      blocked_by: form.blocked_by,
    }
    if (form.tipo === "ideia") {
      payload.idea_links = form.ideaLinks.map((l) => ({
        target_type: l.target_type,
        target_id: l.target_id,
      }))
    }
    try {
      await saveTask.mutateAsync({ id: task?.id, payload })
      try {
        localStorage.removeItem(draftKey(task?.id ?? null))
      } catch {
        /* sem localStorage */
      }
      setDraftKept(false)
      toast.success("Salvo ✓")
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não deu pra salvar")
    }
  }

  async function remove() {
    if (!task) return
    const ok = await confirm({
      title: "Excluir esta tarefa?",
      description: "Subtarefas, links e anexos dela também são removidos.",
      destructive: true,
    })
    if (!ok) return
    try {
      await deleteTask.mutateAsync(task.id)
      try {
        localStorage.removeItem(draftKey(task.id))
      } catch {
        /* sem localStorage */
      }
      setDraftKept(false)
      toast("Tarefa excluída")
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não deu pra excluir")
    }
  }

  /** Cria uma cópia da tarefa salva (subtarefas sem check, links e vínculos). */
  async function duplicate() {
    if (!task) return
    try {
      await saveTask.mutateAsync({
        payload: {
          title: `${task.title} (cópia)`,
          tipo: task.tipo,
          projeto: task.projeto || "",
          priority: task.priority,
          status: "aberta",
          due_date: task.due_date || "",
          requested_by: task.requested_by || "",
          send_to: task.send_to || "",
          description: task.description || "",
          recorrencia: task.recorrencia || "",
          subtasks: (task.subtasks ?? []).map((sub) => ({ title: sub.title, done: 0 as const })),
          tags: task.tags ?? [],
          links: (task.links ?? []).map((link) => ({
            kind: link.kind,
            label: link.label ?? "",
            target: link.target,
          })),
          ...(task.tipo === "ideia"
            ? {
                idea_links: (task.idea_links ?? []).map((link) => ({
                  target_type: link.target_type,
                  target_id: link.target_id,
                })),
              }
            : {}),
          estimate_min: task.estimate_min ?? 0,
        },
      })
      toast("Tarefa duplicada")
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não deu pra duplicar")
    }
  }

  function openWhatsapp() {
    if (!task) return
    const project = (projects.data ?? []).find((p) => p.name === form.projeto.trim())
    overlays.openWhatsapp({
      ...task,
      title: form.title.trim(),
      tipo: form.tipo,
      description: form.description.trim(),
      projeto: form.projeto.trim(),
      priority: form.priority,
      due_date: form.due_date,
      requested_by: form.requested_by.trim(),
      send_to: form.send_to.trim(),
      subtasks: form.subtasks.map((s) => ({
        title: s.title,
        done: s.done ? (1 as const) : (0 as const),
      })),
      links: form.links.map((l) => ({
        kind: l.kind,
        label: l.label,
        target: l.target,
      })),
      // campos extras consumidos pela IA (mesma semântica do formulário antigo)
      ...({
        proj_scope: project?.scope ?? "",
        proj_people: project?.people ?? "",
      } as Record<string, unknown>),
    } as Task)
  }

  const formBody = (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 flex flex-col gap-rf-5 overflow-y-auto px-rf-4 py-rf-5 min-[860px]:px-rf-6">
        {draftKept ? (
          <div className="flex items-center gap-3 rounded-[var(--rf-radius-control)] bg-hover px-3 py-2 text-xs">
            <span className="flex-1 text-muted-foreground">
              Rascunho não salvo restaurado automaticamente.
            </span>
            <Button type="button" variant="ghost" size="xs" onClick={discardDraft}>
              Descartar rascunho
            </Button>
          </div>
        ) : null}
        <div className="space-y-1.5">
          <label className="rf-caption font-medium text-foreground" htmlFor="task-title">
            Título
          </label>
          <Input
            id="task-title"
            value={form.title}
            onChange={(event) => set("title", event.target.value)}
            placeholder="Ex: Ajustar relatório do cliente X"
            autoFocus
            required
          />
        </div>

        <div className="grid grid-cols-1 gap-5 min-[860px]:grid-cols-2">
          {/* Coluna esquerda: atributos */}
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label className="rf-caption font-medium text-foreground" htmlFor="task-tipo">
                  Tipo
                </label>
                <NativeSelect
                  id="task-tipo"
                  value={form.tipo}
                  onChange={(event) => set("tipo", event.target.value as Tipo)}
                >
                  <NativeSelectOption value="tarefa">Tarefa</NativeSelectOption>
                  <NativeSelectOption value="ideia">Ideia</NativeSelectOption>
                  <NativeSelectOption value="rotina">Rotina</NativeSelectOption>
                </NativeSelect>
              </div>
              <div className="space-y-1.5">
                <label className="rf-caption font-medium text-foreground" htmlFor="task-prio">
                  Prioridade
                </label>
                <NativeSelect
                  id="task-prio"
                  value={form.priority}
                  onChange={(event) => set("priority", event.target.value as Prioridade)}
                >
                  <NativeSelectOption value="alta">Alta</NativeSelectOption>
                  <NativeSelectOption value="media">Média</NativeSelectOption>
                  <NativeSelectOption value="baixa">Baixa</NativeSelectOption>
                </NativeSelect>
              </div>
              <div className="space-y-1.5">
                <label className="rf-caption font-medium text-foreground" htmlFor="task-due">
                  Prazo
                </label>
                <Input
                  id="task-due"
                  type="date"
                  value={form.due_date}
                  onChange={(event) => set("due_date", event.target.value)}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <span className="rf-caption text-muted-foreground">Prazo rápido:</span>
              <Chip
                active={form.due_date === isoOffset(0)}
                onClick={() => set("due_date", isoOffset(0))}
              >
                Hoje
              </Chip>
              <Chip
                active={form.due_date === isoOffset(1)}
                onClick={() => set("due_date", isoOffset(1))}
              >
                Amanhã
              </Chip>
              <Chip
                active={form.due_date === isoOffset(7)}
                onClick={() => set("due_date", isoOffset(7))}
              >
                Próx. semana
              </Chip>
              {form.due_date ? (
                <Chip onClick={() => set("due_date", "")}>Limpar</Chip>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <label className="rf-caption font-medium text-foreground" htmlFor="task-status">
                Status
              </label>
              <NativeSelect
                id="task-status"
                value={form.status}
                onChange={(event) => set("status", event.target.value as Status)}
              >
                <NativeSelectOption value="aberta">Aberta</NativeSelectOption>
                <NativeSelectOption value="andamento">Em andamento</NativeSelectOption>
                <NativeSelectOption value="concluida">Concluída</NativeSelectOption>
              </NativeSelect>
            </div>

            <div className="space-y-1.5">
              <label className="rf-caption font-medium text-foreground" htmlFor="task-estimate">
                Estimativa <span className="font-normal text-muted-foreground">(opcional)</span>
              </label>
              <NativeSelect
                id="task-estimate"
                value={String(form.estimate_min)}
                onChange={(event) => set("estimate_min", Number(event.target.value))}
              >
                <NativeSelectOption value="0">Sem estimativa</NativeSelectOption>
                <NativeSelectOption value="15">15 min</NativeSelectOption>
                <NativeSelectOption value="30">30 min</NativeSelectOption>
                <NativeSelectOption value="60">1 hora</NativeSelectOption>
                <NativeSelectOption value="120">2 horas</NativeSelectOption>
                <NativeSelectOption value="240">4 horas</NativeSelectOption>
              </NativeSelect>
            </div>

            {form.tipo === "rotina" || form.tipo === "tarefa" ? (
              <div className="space-y-1.5">
                <label className="rf-caption font-medium text-foreground" htmlFor="task-recor">
                  Recorrência{" "}
                  <span className="font-normal text-muted-foreground">
                    {form.tipo === "rotina"
                      ? "(repete sozinha; o check zera na virada)"
                      : "(ao concluir, gera a próxima automaticamente)"}
                  </span>
                </label>
                <NativeSelect
                  id="task-recor"
                  value={form.recorrencia}
                  onChange={(event) =>
                    set("recorrencia", event.target.value as Recorrencia)
                  }
                >
                  <NativeSelectOption value="">Sem recorrência</NativeSelectOption>
                  <NativeSelectOption value="diaria">Diária</NativeSelectOption>
                  <NativeSelectOption value="semanal">Semanal</NativeSelectOption>
                  <NativeSelectOption value="mensal">Mensal</NativeSelectOption>
                </NativeSelect>
              </div>
            ) : null}

            <div className="space-y-1.5">
              <label className="rf-caption font-medium text-foreground" htmlFor="task-projeto">
                Projeto <span className="font-normal text-muted-foreground">(opcional)</span>
              </label>
              <Input
                id="task-projeto"
                list="projetos-datalist"
                value={form.projeto}
                onChange={(event) => set("projeto", event.target.value)}
                placeholder="Ex: Dina, Bellelli..."
              />
              <datalist id="projetos-datalist">
                {projectNames.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </div>

            <TagsEditor tags={form.tags} onChange={(tags) => set("tags", tags)} />

            <div className="space-y-1.5">
              <div className="rf-caption font-medium text-foreground">
                Bloqueada por{" "}
                <span className="font-normal text-muted-foreground">
                  (opcional — só libera quando estas terminarem)
                </span>
              </div>
              {form.blocked_by.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {form.blocked_by.map((id) => (
                    <span
                      key={id}
                      className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-[var(--rf-field)] px-2.5 py-1 text-xs"
                    >
                      <Lock className="size-3 shrink-0" aria-hidden />
                      <span className="truncate">{titleById.get(id) ?? `#${id}`}</span>
                      <button
                        type="button"
                        aria-label="Remover bloqueio"
                        className="text-muted-foreground hover:text-foreground"
                        onClick={() =>
                          set(
                            "blocked_by",
                            form.blocked_by.filter((value) => value !== id),
                          )
                        }
                      >
                        <X className="size-3" aria-hidden />
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Nenhum bloqueio.</p>
              )}
              <NativeSelect
                value=""
                aria-label="Adicionar dependência"
                onChange={(event) => {
                  const id = Number(event.target.value)
                  if (!id) return
                  set("blocked_by", [...form.blocked_by, id])
                }}
              >
                <NativeSelectOption value="" disabled>
                  Adicionar dependência…
                </NativeSelectOption>
                {blockCandidates.map((item) => (
                  <NativeSelectOption key={item.id} value={String(item.id)}>
                    {item.title}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="rf-caption font-medium text-foreground" htmlFor="task-asked">
                  Quem pediu
                </label>
                <Input
                  id="task-asked"
                  value={form.requested_by}
                  onChange={(event) => set("requested_by", event.target.value)}
                  placeholder="Ex: João do financeiro"
                />
              </div>
              <div className="space-y-1.5">
                <label className="rf-caption font-medium text-foreground" htmlFor="task-send">
                  Pra quem enviar
                </label>
                <Input
                  id="task-send"
                  value={form.send_to}
                  onChange={(event) => set("send_to", event.target.value)}
                  placeholder="Ex: Maria / design"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="rf-caption font-medium text-foreground" htmlFor="task-desc">
                Descrição
              </label>
              <Textarea
                id="task-desc"
                rows={5}
                value={form.description}
                onChange={(event) => set("description", event.target.value)}
                placeholder="Detalhes..."
              />
            </div>
          </div>

          {/* Coluna direita: andamento + listas */}
          <div className="space-y-4">
            <SubtaskEditor
              subtasks={form.subtasks}
              onChange={(subtasks) => set("subtasks", subtasks)}
            />

            <div className="space-y-1.5">
              <div className="rf-caption font-medium text-foreground">Links e pastas</div>
              <p className="text-xs text-muted-foreground">
                Link da web (https://...) ou caminho de pasta do PC — a pasta abre no
                Explorer.
              </p>
              <div className="space-y-2">
                {form.links.map((row) => (
                  <div key={row.uid} className="flex items-center gap-2">
                    <NativeSelect
                      className="w-24"
                      value={row.kind}
                      onChange={(event) =>
                        set(
                          "links",
                          form.links.map((l) =>
                            l.uid === row.uid
                              ? { ...l, kind: event.target.value as TaskLink["kind"] }
                              : l,
                          ),
                        )
                      }
                    >
                      <NativeSelectOption value="web">Web</NativeSelectOption>
                      <NativeSelectOption value="pasta">Pasta</NativeSelectOption>
                    </NativeSelect>
                    <Input
                      className="w-32"
                      placeholder="Apelido"
                      value={row.label}
                      onChange={(event) =>
                        set(
                          "links",
                          form.links.map((l) =>
                            l.uid === row.uid ? { ...l, label: event.target.value } : l,
                          ),
                        )
                      }
                    />
                    <Input
                      placeholder="Link ou caminho da pasta"
                      value={row.target}
                      onChange={(event) =>
                        set(
                          "links",
                          form.links.map((l) =>
                            l.uid === row.uid ? { ...l, target: event.target.value } : l,
                          ),
                        )
                      }
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Remover link"
                      onClick={() =>
                        set(
                          "links",
                          form.links.filter((l) => l.uid !== row.uid),
                        )
                      }
                    >
                      <X aria-hidden />
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  set("links", [...form.links, { uid: uid(), kind: "web", label: "", target: "" }])
                }
              >
                <Plus aria-hidden /> Link ou pasta
              </Button>
            </div>

            {form.tipo === "ideia" ? (
              <div className="space-y-2">
                <div className="rf-caption font-medium text-foreground">
                  Vínculos{" "}
                  <span className="font-normal text-muted-foreground">
                    (liga a projetos, rotinas e tarefas)
                  </span>
                </div>
                {form.ideaLinks.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {form.ideaLinks.map((link) => (
                      <span
                        key={ideaLinkKey(link)}
                        className="inline-flex items-center gap-1.5 rounded-full bg-[var(--rf-field)] px-2.5 py-1 text-xs"
                      >
                        {link.target_type === "projeto" ? (
                          <Folder className="size-3" aria-hidden />
                        ) : (
                          <LinkIcon className="size-3" aria-hidden />
                        )}
                        {link.label || `${link.target_type} ${link.target_id}`}
                        <button
                          type="button"
                          aria-label="Remover vínculo"
                          className="text-muted-foreground hover:text-foreground"
                          onClick={() =>
                            set(
                              "ideaLinks",
                              form.ideaLinks.filter((l) => ideaLinkKey(l) !== ideaLinkKey(link)),
                            )
                          }
                        >
                          <X className="size-3" aria-hidden />
                        </button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Nenhum vínculo (opcional).
                  </p>
                )}
                <IdeaLinkPicker
                  targets={ideaTargets}
                  chosen={new Set(form.ideaLinks.map(ideaLinkKey))}
                  onPick={(value, label) => {
                    const [targetType, targetId] = value.split(":")
                    set("ideaLinks", [
                      ...form.ideaLinks,
                      {
                        target_type: targetType as IdeaLink["target_type"],
                        target_id: Number(targetId),
                        label,
                      },
                    ])
                  }}
                />
              </div>
            ) : null}

            <Separator />

            <div className="space-y-1.5">
              <div className="rf-caption font-medium text-foreground">
                Arquivos{" "}
                <span className="font-normal text-muted-foreground">
                  (prints, PDFs, documentos)
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Ficam guardados de forma privada — só quem tem acesso ao Bom Dia baixa.
              </p>
              <Attachments
                ownerType="task"
                ownerId={task?.id ?? null}
                enablePaste
              />
            </div>

            {task ? (
              <>
                <Separator />
                <TaskHistory taskId={task.id} />
              </>
            ) : null}

            <div className="flex items-start gap-rf-2 rounded-[var(--rf-radius-card)] bg-[var(--app-ai-soft)] px-rf-3 py-rf-3">
              <Sparkles className="mt-0.5 size-4 shrink-0 text-[var(--app-ai)]" aria-hidden />
              <p className="rf-caption text-foreground">
                <strong className="font-semibold">Dica do Bom Dia:</strong> tarefas bem
                descritas são mais fáceis de concluir.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 border-t border-[var(--rf-border)] px-4 py-3 min-[860px]:px-6">
        <Mascot name="thumbsup" className="hidden h-14 min-[860px]:block" />
        {task ? (
          <Button type="button" variant="destructive" size="sm" onClick={remove}>
            <Trash2 aria-hidden /> Excluir
          </Button>
        ) : null}
        {task ? (
          <Button type="button" variant="ghost" size="sm" onClick={openWhatsapp}>
            <MessageCircle aria-hidden /> Recado
          </Button>
        ) : null}
        {task ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={saveTask.isPending}
            onClick={() => void duplicate()}
          >
            <Copy aria-hidden /> Duplicar
          </Button>
        ) : null}
        <div className="flex-1" />
        {dirty ? (
          <span className="hidden font-mono text-[10px] text-muted-foreground min-[860px]:inline">
            alterações não salvas
          </span>
        ) : null}
        <Button type="button" variant="ghost" size="sm" onClick={() => handleOpenChange(false)}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={saveTask.isPending}>
          {saveTask.isPending ? <Spinner /> : null}
          Salvar
        </Button>
      </div>
    </form>
  )

  const title = task ? "Editar demanda" : "Nova tarefa"

  if (compact) {
    return (
      <Drawer open={open} onOpenChange={handleOpenChange}>
        <DrawerContent className="max-h-[94dvh]">
          <DrawerHeader className="text-left">
            <DrawerTitle>{title}</DrawerTitle>
          </DrawerHeader>
          {formBody}
        </DrawerContent>
      </Drawer>
    )
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="flex max-h-[92dvh] w-full flex-col gap-0 p-0 sm:max-w-3xl"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <DialogHeader className="px-6 py-4 text-left shadow-[0_1px_0_0_var(--rf-field)]">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="rf-caption">
            Transforme ideias em resultados. Preencha os detalhes abaixo.
          </DialogDescription>
        </DialogHeader>
        {formBody}
      </DialogContent>
    </Dialog>
  )
}

const EVENT_LABEL: Record<string, string> = {
  title: "Título",
  status: "Status",
  priority: "Prioridade",
  due_date: "Prazo",
  projeto: "Projeto",
  tipo: "Tipo",
  recorrencia: "Recorrência",
  estimate_min: "Estimativa",
  tags: "Tags",
  blocked_by: "Bloqueada por",
}

const STATUS_EVENT_LABEL: Record<string, string> = {
  aberta: "Aberta",
  andamento: "Em andamento",
  concluida: "Concluída",
}

const PRIO_EVENT_LABEL: Record<string, string> = {
  alta: "Alta",
  media: "Média",
  baixa: "Baixa",
}

const RECOR_EVENT_LABEL: Record<string, string> = {
  diaria: "Diária",
  semanal: "Semanal",
  mensal: "Mensal",
}

function eventValueText(field: string, value: string): string {
  if (!value) return "—"
  if (field === "status") return STATUS_EVENT_LABEL[value] ?? value
  if (field === "priority") return PRIO_EVENT_LABEL[value] ?? value
  if (field === "recorrencia") return RECOR_EVENT_LABEL[value] ?? value
  if (field === "due_date") return fmtDate(value)
  if (field === "estimate_min") return fmtMinutes(Number(value)) || "sem estimativa"
  return value
}

function eventWhen(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function TaskHistory({ taskId }: { taskId: number }) {
  const events = useTaskEvents(taskId)
  const list = (events.data ?? []).slice(0, 12)
  return (
    <div className="space-y-2">
      <div className="rf-caption font-medium text-foreground">
        Histórico{" "}
        <span className="font-normal text-muted-foreground">(últimas mudanças)</span>
      </div>
      {events.isPending ? (
        <p className="text-xs text-muted-foreground">Carregando…</p>
      ) : list.length ? (
        <ol className="space-y-1.5">
          {list.map((event) => (
            <li
              key={event.id}
              className="flex items-start gap-2 rounded-[var(--rf-radius-control)] bg-[var(--rf-field)] px-2.5 py-1.5"
            >
              <History className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-xs text-foreground">
                  {event.kind === "criada" ? (
                    "Demanda criada"
                  ) : (
                    <>
                      <strong className="font-medium">
                        {EVENT_LABEL[event.field] ?? event.field}
                      </strong>
                      {": "}
                      <span className="text-muted-foreground">
                        {eventValueText(event.field, event.from_value)}
                      </span>
                      {" → "}
                      {eventValueText(event.field, event.to_value)}
                    </>
                  )}
                </p>
                <p className="font-mono text-[10px] text-muted-foreground">
                  {eventWhen(event.created_at)}
                </p>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-xs text-muted-foreground">Sem histórico ainda.</p>
      )}
    </div>
  )
}

function TagsEditor({
  tags,
  onChange,
}: {
  tags: string[]
  onChange: (value: string[]) => void
}) {
  const [draft, setDraft] = useState("")

  function commit() {
    const value = draft.trim().slice(0, 40)
    setDraft("")
    if (!value) return
    if (tags.some((tag) => tag.toLowerCase() === value.toLowerCase())) return
    if (tags.length >= 12) return
    onChange([...tags, value])
  }

  return (
    <div className="space-y-1.5">
      <label className="rf-caption font-medium text-foreground" htmlFor="task-tags">
        Tags{" "}
        <span className="font-normal text-muted-foreground">
          (opcional — Enter adiciona, Backspace remove a última)
        </span>
      </label>
      {tags.length ? (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-[var(--rf-field)] px-2.5 py-1 text-xs"
            >
              <TagIcon className="size-3 shrink-0" aria-hidden />
              <span className="truncate">{tag}</span>
              <button
                type="button"
                aria-label={`Remover tag ${tag}`}
                className="text-muted-foreground hover:text-foreground"
                onClick={() => onChange(tags.filter((value) => value !== tag))}
              >
                <X className="size-3" aria-hidden />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <Input
        id="task-tags"
        value={draft}
        placeholder="Ex: cliente, urgente"
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === ",") {
            event.preventDefault()
            commit()
          } else if (event.key === "Backspace" && !draft && tags.length) {
            onChange(tags.slice(0, -1))
          }
        }}
        onBlur={commit}
      />
    </div>
  )
}

function SubtaskEditor({
  subtasks,
  onChange,
}: {
  subtasks: SubtaskDraft[]
  onChange: (value: SubtaskDraft[]) => void
}) {
  const inputsRef = useRef(new Map<number, HTMLInputElement>())
  const done = subtasks.filter((s) => s.done).length
  const total = subtasks.length
  const percent = total ? Math.round((done / total) * 100) : 0

  function addAfter(index: number) {
    const next = [...subtasks]
    const row: SubtaskDraft = { uid: uid(), title: "", done: false }
    next.splice(index + 1, 0, row)
    onChange(next)
    setTimeout(() => inputsRef.current.get(row.uid)?.focus(), 0)
  }

  function removeAt(index: number) {
    const prev = subtasks[index - 1]
    onChange(subtasks.filter((_, i) => i !== index))
    if (prev) setTimeout(() => inputsRef.current.get(prev.uid)?.focus(), 0)
  }

  function update(index: number, patch: Partial<SubtaskDraft>) {
    onChange(subtasks.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  return (
    <div className="space-y-2">
      <div className="rf-caption font-medium text-foreground">
        Subtarefas <span className="font-normal text-muted-foreground">(passos desta demanda)</span>
      </div>
      <p className="text-xs text-muted-foreground">
        Quebre a demanda em passos. Enter cria a próxima; Backspace no vazio remove.
      </p>

      {total ? (
        <div className="space-y-1 rounded-[var(--rf-radius-control)] bg-[var(--rf-field)] px-3 py-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Andamento</span>
            <span className="font-mono">{percent}%</span>
          </div>
          <Progress value={percent} className="h-1.5" />
          <div className="text-[11px] text-muted-foreground">
            {done} de {total} concluído{done === 1 ? "" : "s"}
          </div>
        </div>
      ) : null}

      <Reorder.Group
        axis="y"
        values={subtasks}
        onReorder={(next) => onChange(next as SubtaskDraft[])}
        className="space-y-1.5"
      >
        {subtasks.map((row, index) => (
          <Reorder.Item
            key={row.uid}
            value={row}
            className="flex items-center gap-2 rounded-[var(--rf-radius-control)] bg-surface px-2 py-1"
          >
            <span className="cursor-grab text-muted-foreground" aria-hidden>
              <GripVertical className="size-3.5" />
            </span>
            <Checkbox
              checked={row.done}
              onCheckedChange={(checked) => update(index, { done: checked === true })}
              aria-label="Concluída"
            />
            <Input
              ref={(node) => {
                if (node) inputsRef.current.set(row.uid, node)
                else inputsRef.current.delete(row.uid)
              }}
              className="h-8 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 dark:bg-transparent"
              value={row.title}
              placeholder="Passo..."
              onChange={(event) => update(index, { title: event.target.value })}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault()
                  if (row.title.trim()) addAfter(index)
                } else if (event.key === "Backspace" && !row.title) {
                  event.preventDefault()
                  removeAt(index)
                }
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="Remover subtarefa"
              onClick={() => removeAt(index)}
            >
              <X aria-hidden />
            </Button>
          </Reorder.Item>
        ))}
      </Reorder.Group>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => {
          const row: SubtaskDraft = { uid: uid(), title: "", done: false }
          onChange([...subtasks, row])
          setTimeout(() => inputsRef.current.get(row.uid)?.focus(), 0)
        }}
      >
        <Plus aria-hidden /> Subtarefa
      </Button>
    </div>
  )
}

function IdeaLinkPicker({
  targets,
  chosen,
  onPick,
}: {
  targets: {
    projectsList: Array<{ value: string; label: string }>
    routines: Array<{ value: string; label: string }>
    taskList: Array<{ value: string; label: string }>
  }
  chosen: Set<string>
  onPick: (value: string, label: string) => void
}) {
  const available = (items: Array<{ value: string; label: string }>) =>
    items.filter((item) => !chosen.has(item.value))

  const projects = available(targets.projectsList)
  const routines = available(targets.routines)
  const taskList = available(targets.taskList)

  return (
    <NativeSelect
      value=""
      onChange={(event) => {
        const value = event.target.value
        if (!value) return
        const all = [...targets.projectsList, ...targets.routines, ...targets.taskList]
        const found = all.find((item) => item.value === value)
        if (found) onPick(value, found.label)
      }}
    >
      <NativeSelectOption value="" disabled>
        Escolher para vincular…
      </NativeSelectOption>
      {projects.length ? (
        <optgroup label="Projetos">
          {projects.map((item) => (
            <NativeSelectOption key={item.value} value={item.value}>
              {item.label}
            </NativeSelectOption>
          ))}
        </optgroup>
      ) : null}
      {routines.length ? (
        <optgroup label="Rotinas">
          {routines.map((item) => (
            <NativeSelectOption key={item.value} value={item.value}>
              {item.label}
            </NativeSelectOption>
          ))}
        </optgroup>
      ) : null}
      {taskList.length ? (
        <optgroup label="Tarefas">
          {taskList.map((item) => (
            <NativeSelectOption key={item.value} value={item.value}>
              {item.label}
            </NativeSelectOption>
          ))}
        </optgroup>
      ) : null}
    </NativeSelect>
  )
}
