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
  Folder,
  GripVertical,
  Link as LinkIcon,
  MessageCircle,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react"
import { Reorder } from "motion/react"
import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { Attachments } from "@/components/attachments"
import { Mascot } from "@/components/app/mascot"
import { useOverlays } from "@/components/overlay-provider"
import { useIsCompact } from "@/lib/use-media-query"
import {
  useDeleteTask,
  useProjects,
  useSaveTask,
  useTasks,
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
}

export type TaskFormPresets = Partial<FormState>

let UID = 0
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
    if (!next && dirty && !window.confirm("Descartar alterações não salvas?")) return
    if (!next) {
      saveTask.reset()
      deleteTask.reset()
    }
    onOpenChange(next)
  }

  const projectNames = useMemo(() => {
    const names = new Set<string>()
    for (const project of projects.data ?? []) names.add(project.name)
    for (const item of tasks.data ?? []) {
      if (item.projeto?.trim()) names.add(item.projeto.trim())
    }
    return [...names].sort((a, b) => a.localeCompare(b, "pt-BR"))
  }, [projects.data, tasks.data])

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
      recorrencia: form.tipo === "rotina" ? form.recorrencia : "",
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
    if (!window.confirm("Excluir esta tarefa?")) return
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

            {form.tipo === "rotina" ? (
              <div className="space-y-1.5">
                <label className="rf-caption font-medium text-foreground" htmlFor="task-recor">
                  Recorrência{" "}
                  <span className="font-normal text-muted-foreground">
                    (repete sozinha; o check zera na virada)
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
