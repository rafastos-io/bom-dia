import { Button } from "@rafastos/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@rafastos/ui/dialog"
import { Input } from "@rafastos/ui/input"
import { NativeSelect, NativeSelectOption } from "@rafastos/ui/native-select"
import { Spinner } from "@rafastos/ui/spinner"
import { Textarea } from "@rafastos/ui/textarea"
import { cn } from "cn"
import { Folder, Link as LinkIcon, Plus, Sparkles, Trash2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { MascotAvatar } from "@/components/app/mascot"
import { apiTasks } from "@/lib/api"
import {
  useAiParse,
  useAiStatus,
  useProjects,
  useSaveAiConfig,
  useTasks,
} from "@/lib/queries"
import type { ParsedTask, TaskLink, TaskPayload } from "@/lib/types"

type Step = "setup" | "chat" | "questions" | "review"

type AssistantDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

let ROW_ID = 0

export function AssistantDialog({ open, onOpenChange }: AssistantDialogProps) {
  const status = useAiStatus()
  const saveConfig = useSaveAiConfig()
  const parse = useAiParse()
  const tasksQuery = useTasks()
  const projectsQuery = useProjects()

  // Remonta a cada abertura (key na página), então o estado inicial basta.
  const [step, setStep] = useState<Step>(
    status.data?.configured ? "chat" : "setup",
  )
  const [key, setKey] = useState("")
  const [text, setText] = useState("")
  const [pending, setPending] = useState<ParsedTask[]>([])

  async function submitKey(event: React.FormEvent) {
    event.preventDefault()
    if (!key.trim()) return
    try {
      await saveConfig.mutateAsync({ openai_api_key: key.trim() })
      toast.success("Chave salva ✓")
      setKey("")
      setStep("chat")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não deu pra salvar a chave")
    }
  }

  async function organize() {
    const value = text.trim()
    if (!value) {
      toast.error("Escreve alguma coisa primeiro")
      return
    }
    try {
      const result = await parse.mutateAsync(value)
      if (result.error) {
        toast.error(result.error)
        return
      }
      const items = result.tarefas ?? []
      if (!items.length) {
        toast.error("Não consegui extrair tarefas. Tenta detalhar mais?")
        return
      }
      setPending(items)
      const anyGaps = items.some((item) => (item.perguntas || []).length)
      setStep(anyGaps ? "questions" : "review")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não consegui organizar")
    }
  }

  async function createAll() {
    if (!pending.length) {
      toast("Nada pra criar.")
      return
    }
    try {
      for (const item of pending) {
        const tipo = item.tipo ?? "tarefa"
        const payload: TaskPayload = {
          title: item.title,
          tipo,
          projeto: (item.projeto || "").trim(),
          priority: item.priority ?? "media",
          status: "aberta",
          due_date: item.due_date ?? "",
          requested_by: item.requested_by ?? "",
          send_to: item.send_to ?? "",
          description: item.description ?? "",
          recorrencia: tipo === "rotina" ? (item.recorrencia ?? "") : "",
          subtasks: (item.subtasks ?? []).map((sub) =>
            typeof sub === "string"
              ? { title: sub, done: 0 as const }
              : { title: sub.title, done: (sub.done ?? 0) as 0 | 1 },
          ),
          links: (item.links ?? []).map(
            (link): TaskLink => ({
              kind: link.kind ?? "web",
              label: link.label ?? "",
              target: link.target,
            }),
          ),
        }
        if (tipo === "ideia") {
          payload.idea_links = (item.idea_links ?? []).map((link) => ({
            target_type: link.target_type,
            target_id: link.target_id,
          }))
        }
        await apiTasks.create(payload)
      }
      toast.success(
        `${pending.length} tarefa${pending.length > 1 ? "s" : ""} criada${
          pending.length > 1 ? "s" : ""
        } ✓`,
      )
      setPending([])
      setText("")
      onOpenChange(false)
      void tasksQuery.refetch()
      void projectsQuery.refetch()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não deu pra criar as tarefas")
    }
  }

  const title =
    step === "setup"
      ? "Poohzera — configurar chave"
      : step === "questions"
        ? "Poohzera — confirmar lacunas"
        : step === "review"
          ? "Poohzera — revisar"
          : "Poohzera"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92dvh] flex-col overflow-hidden sm:max-w-2xl">
        <DialogHeader className="items-start gap-rf-3 sm:flex-row sm:items-center">
          <MascotAvatar className="size-12" />
          <div className="flex min-w-0 flex-col gap-rf-1">
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              {step === "setup"
                ? "Seu assistente para transformar ideias soltas em ações."
                : step === "chat"
                  ? "Me conte o que chegou. Eu organizo o próximo passo."
                  : step === "questions"
                    ? "Quase lá! Só me confirma o que ficou em aberto."
                    : `Organizei em ${pending.length} ${pending.length === 1 ? "item" : "itens"} — revise e confirme.`}
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto pr-0.5">
          {step === "setup" ? (
            <form onSubmit={submitKey} className="flex flex-col items-center gap-rf-4 py-rf-3 text-center">
              <MascotAvatar className="size-20" />
              <div className="flex flex-col gap-rf-1">
                <p className="text-lg font-bold text-foreground">Ativar Poohzera</p>
                <p className="rf-caption text-muted-foreground">
                  Cole sua chave da OpenAI — ela fica somente neste dispositivo.
                </p>
              </div>
              <div className="flex w-full max-w-sm flex-col gap-rf-3 text-left">
                <label className="flex flex-col gap-rf-2">
                  <span className="rf-caption font-medium text-foreground">Chave de acesso</span>
                  <Input
                    type="password"
                    value={key}
                    onChange={(event) => setKey(event.target.value)}
                    placeholder="sk-..."
                    autoComplete="off"
                  />
                </label>
                <div className="flex items-center gap-rf-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => onOpenChange(false)}
                  >
                    Agora não
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1"
                    disabled={saveConfig.isPending || !key.trim()}
                  >
                    {saveConfig.isPending ? <Spinner /> : null} Conectar
                  </Button>
                </div>
              </div>
            </form>
          ) : step === "chat" ? (
            <div className="flex flex-col gap-rf-4">
              <div className="flex items-start gap-rf-3">
                <MascotAvatar className="size-11" />
                <p className="text-sm text-muted-foreground">
                  Manda o que chegou — recado, ideia, tarefa solta, uma rotina. Eu monto
                  tudo e só te pergunto o que faltar.
                </p>
              </div>
              <Textarea
                rows={6}
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="Cole aqui um recado, uma ideia ou uma demanda..."
                autoFocus
              />
              <div className="flex justify-end">
                <Button type="button" onClick={() => void organize()} disabled={parse.isPending}>
                  {parse.isPending ? <Spinner /> : <Sparkles aria-hidden />} Organizar com
                  Poohzera
                </Button>
              </div>
            </div>
          ) : step === "questions" ? (
            <QuestionsStep
              pending={pending}
              setPending={setPending}
              onBack={() => setStep("chat")}
              onNext={() => setStep("review")}
            />
          ) : (
            <ReviewStep
              pending={pending}
              setPending={setPending}
              onBack={() => setStep("chat")}
              onCreate={() => void createAll()}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function QuestionsStep({
  pending,
  setPending,
  onBack,
  onNext,
}: {
  pending: ParsedTask[]
  setPending: (items: ParsedTask[]) => void
  onBack: () => void
  onNext: () => void
}) {
  const tasks = useTasks()
  const projects = useProjects()

  const update = (index: number, patch: Partial<ParsedTask>) => {
    setPending(
      pending.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    )
  }

  const cards = pending.filter((item) => (item.perguntas || []).length)

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Quase lá. Só me confirma o que ficou em aberto:
      </p>

      {cards.map((item) => {
        const index = pending.indexOf(item)
        return (
          <div key={index} className="app-card flex flex-col gap-rf-3 p-rf-4">
            <div className="text-sm font-semibold">{item.title}</div>
            {(item.perguntas || []).map((question, questionIndex) => (
              <div key={questionIndex} className="space-y-2">
                <div className="text-sm">{question.pergunta}</div>

                {question.campo === "projeto" ? (
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-1.5">
                      {(question.opcoes || []).map((option) => (
                        <Chip
                          key={option}
                          active={item.projeto === option}
                          onClick={() => update(index, { projeto: option })}
                        >
                          {option}
                        </Chip>
                      ))}
                      <Chip onClick={() => update(index, { projeto: "" })}>
                        Sem projeto
                      </Chip>
                    </div>
                    <Input
                      placeholder="Nome do novo projeto"
                      value={item.projeto ?? ""}
                      onChange={(event) => update(index, { projeto: event.target.value })}
                    />
                  </div>
                ) : null}

                {question.campo === "prazo" ? (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Chip
                      active={item.due_date === isoDaysFromNow(0)}
                      onClick={() => update(index, { due_date: isoDaysFromNow(0) })}
                    >
                      Hoje
                    </Chip>
                    <Chip
                      active={item.due_date === isoDaysFromNow(1)}
                      onClick={() => update(index, { due_date: isoDaysFromNow(1) })}
                    >
                      Amanhã
                    </Chip>
                    <Chip active={item.due_date === ""} onClick={() => update(index, { due_date: "" })}>
                      Sem prazo
                    </Chip>
                    <Input
                      type="date"
                      className="h-8 w-40"
                      value={item.due_date ?? ""}
                      onChange={(event) => update(index, { due_date: event.target.value })}
                    />
                  </div>
                ) : null}

                {question.campo === "links" ? (
                  <QuestionLinks
                    links={item.links ?? []}
                    onChange={(links) => update(index, { links })}
                  />
                ) : null}

                {question.campo === "recorrencia" ? (
                  <div className="flex flex-wrap gap-1.5">
                    {["diaria", "semanal", "mensal"].map((option) => (
                      <Chip
                        key={option}
                        active={item.recorrencia === option}
                        onClick={() =>
                          update(index, { recorrencia: option as ParsedTask["recorrencia"] })
                        }
                      >
                        {option === "diaria" ? "Diária" : option === "semanal" ? "Semanal" : "Mensal"}
                      </Chip>
                    ))}
                    <Chip active={item.recorrencia === ""} onClick={() => update(index, { recorrencia: "" })}>
                      Sem recorrência
                    </Chip>
                  </div>
                ) : null}

                {question.campo === "vinculos" ? (
                  <QuestionLinks
                    targets
                    chosen={item.idea_links ?? []}
                    tasks={tasks.data ?? []}
                    projects={projects.data ?? []}
                    onChange={(links) => update(index, { idea_links: links })}
                  />
                ) : null}
              </div>
            ))}
          </div>
        )
      })}

      <div className="flex items-center">
        <Button type="button" variant="ghost" size="sm" onClick={onBack}>
          Voltar
        </Button>
        <div className="flex-1" />
        <Button type="button" size="sm" onClick={onNext}>
          Continuar
        </Button>
      </div>
    </div>
  )
}

function ReviewStep({
  pending,
  setPending,
  onBack,
  onCreate,
}: {
  pending: ParsedTask[]
  setPending: (items: ParsedTask[]) => void
  onBack: () => void
  onCreate: () => void
}) {
  const update = (index: number, patch: Partial<ParsedTask>) => {
    setPending(
      pending.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    )
  }

  const projetosExistentes = useProjects()
  const sugestoes = [
    ...new Set([
      ...(projetosExistentes.data ?? []).map((project) => project.name),
      ...pending.map((item) => (item.projeto || "").trim()).filter(Boolean),
    ]),
  ].sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }))

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Organizei em {pending.length} tarefa{pending.length > 1 ? "s" : ""}. Ajuste o que
        quiser e confirme:
      </p>

      {pending.map((item, index) => (
        <div key={index} className="app-card flex flex-col gap-rf-2 p-rf-4">
          <div className="flex items-center gap-2">
            <Input
              value={item.title}
              onChange={(event) => update(index, { title: event.target.value })}
              className="h-8 flex-1 font-medium"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Descartar"
              onClick={() =>
                setPending(pending.filter((_, itemIndex) => itemIndex !== index))
              }
            >
              <Trash2 aria-hidden />
            </Button>
          </div>
          {item.description ? (
            <p className="text-xs text-muted-foreground">{item.description}</p>
          ) : null}
          {item.motivo ? (
            <p className="font-mono text-[11px] text-muted-foreground">{item.motivo}</p>
          ) : null}
          {item.subtasks?.length ? (
            <ul className="list-disc pl-5 text-xs text-muted-foreground">
              {item.subtasks.map((sub, subIndex) => (
                <li key={subIndex}>{typeof sub === "string" ? sub : sub.title}</li>
              ))}
            </ul>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <NativeSelect
              size="sm"
              className="w-28"
              aria-label="Tipo"
              value={item.tipo ?? "tarefa"}
              onChange={(event) =>
                update(index, { tipo: event.target.value as ParsedTask["tipo"] })
              }
            >
              <NativeSelectOption value="tarefa">Tarefa</NativeSelectOption>
              <NativeSelectOption value="ideia">Ideia</NativeSelectOption>
              <NativeSelectOption value="rotina">Rotina</NativeSelectOption>
            </NativeSelect>
            {(item.tipo ?? "tarefa") === "rotina" ? (
              <NativeSelect
                size="sm"
                className="w-32"
                aria-label="Recorrência"
                value={item.recorrencia ?? ""}
                onChange={(event) =>
                  update(index, {
                    recorrencia: event.target.value as ParsedTask["recorrencia"],
                  })
                }
              >
                <NativeSelectOption value="">Sem recorrência</NativeSelectOption>
                <NativeSelectOption value="diaria">Diária</NativeSelectOption>
                <NativeSelectOption value="semanal">Semanal</NativeSelectOption>
                <NativeSelectOption value="mensal">Mensal</NativeSelectOption>
              </NativeSelect>
            ) : null}
            <NativeSelect
              size="sm"
              className="w-24"
              aria-label="Prioridade"
              value={item.priority ?? "media"}
              onChange={(event) =>
                update(index, { priority: event.target.value as ParsedTask["priority"] })
              }
            >
              <NativeSelectOption value="alta">Alta</NativeSelectOption>
              <NativeSelectOption value="media">Média</NativeSelectOption>
              <NativeSelectOption value="baixa">Baixa</NativeSelectOption>
            </NativeSelect>
            <Input
              type="date"
              className="h-8 w-38"
              value={item.due_date ?? ""}
              onChange={(event) => update(index, { due_date: event.target.value })}
            />
            <Input
              className="h-8 w-40"
              placeholder="Projeto"
              list="assistant-projects"
              aria-label="Projeto"
              value={item.projeto ?? ""}
              onChange={(event) => update(index, { projeto: event.target.value })}
            />
          </div>
        </div>
      ))}

      <datalist id="assistant-projects">
        {sugestoes.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>

      <div className="flex items-center">
        <Button type="button" variant="ghost" size="sm" onClick={onBack}>
          Voltar
        </Button>
        <div className="flex-1" />
        <Button type="button" size="sm" onClick={onCreate}>
          Criar {pending.length} {pending.length === 1 ? "item" : "itens"}
        </Button>
      </div>
    </div>
  )
}

function QuestionLinks({
  links,
  onChange,
  targets,
  chosen,
  tasks,
  projects,
}: {
  links?: Array<{ kind?: string; label?: string; target: string }>
  onChange: (value: never) => void
  targets?: boolean
  chosen?: ParsedTask["idea_links"]
  tasks?: Array<{ id: number; title: string; tipo: string }>
  projects?: Array<{ id: number; name: string }>
}) {
  const [rows, setRows] = useState(() =>
    (links ?? []).map((link) => ({ uid: ++ROW_ID, ...link })),
  )

  const publish = (next: Array<{ uid: number; kind?: string; label?: string; target: string }>) => {
    setRows(next)
    onChange(next as never)
  }

  if (targets) {
    const all = [
      ...(projects ?? []).map((project) => ({
        value: `projeto:${project.id}`,
        label: project.name,
        type: "projeto" as const,
      })),
      ...(tasks ?? [])
        .filter((task) => task.tipo === "rotina")
        .map((task) => ({ value: `rotina:${task.id}`, label: task.title, type: "rotina" as const })),
      ...(tasks ?? [])
        .filter((task) => (task.tipo || "tarefa") === "tarefa")
        .map((task) => ({ value: `tarefa:${task.id}`, label: task.title, type: "tarefa" as const })),
    ]
    const chosenSet = new Set(
      (chosen ?? []).map((link) => `${link.target_type}:${link.target_id}`),
    )
    return (
      <div className="space-y-2">
        {(chosen ?? []).length ? (
          <div className="flex flex-wrap gap-1.5">
            {(chosen ?? []).map((link) => (
              <span
                key={`${link.target_type}:${link.target_id}`}
                className="inline-flex items-center gap-1.5 rounded-full bg-[var(--rf-field)] px-2.5 py-1 text-xs"
              >
                {link.label || `${link.target_type} ${link.target_id}`}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Nenhum vínculo (opcional).</p>
        )}
        <NativeSelect
          size="sm"
          value=""
          onChange={(event) => {
            const value = event.target.value
            if (!value) return
            const [targetType, targetId] = value.split(":")
            const found = all.find((item) => item.value === value)
            onChange(
              [
                ...(chosen ?? []),
                {
                  target_type: targetType as "projeto" | "rotina" | "tarefa",
                  target_id: Number(targetId),
                  label: found?.label,
                },
              ] as never,
            )
          }}
        >
          <NativeSelectOption value="" disabled>
            Escolher para vincular…
          </NativeSelectOption>
          {all
            .filter((item) => !chosenSet.has(item.value))
            .map((item) => (
              <NativeSelectOption key={item.value} value={item.value}>
                {item.label}
              </NativeSelectOption>
            ))}
        </NativeSelect>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={row.uid} className="flex items-center gap-2">
          <NativeSelect
            size="sm"
            className="w-24"
            value={row.kind ?? "web"}
            onChange={(event) =>
              publish(
                rows.map((item) =>
                  item.uid === row.uid ? { ...item, kind: event.target.value } : item,
                ),
              )
            }
          >
            <NativeSelectOption value="web">Web</NativeSelectOption>
            <NativeSelectOption value="pasta">Pasta</NativeSelectOption>
          </NativeSelect>
          <Input
            className="h-8 w-32"
            placeholder="Apelido"
            value={row.label ?? ""}
            onChange={(event) =>
              publish(
                rows.map((item) =>
                  item.uid === row.uid ? { ...item, label: event.target.value } : item,
                ),
              )
            }
          />
          <Input
            className="h-8 flex-1"
            placeholder="Link ou pasta"
            value={row.target}
            onChange={(event) =>
              publish(
                rows.map((item) =>
                  item.uid === row.uid ? { ...item, target: event.target.value } : item,
                ),
              )
            }
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Remover"
            onClick={() => publish(rows.filter((item) => item.uid !== row.uid))}
          >
            <Trash2 aria-hidden />
          </Button>
        </div>
      ))}
      <div className="flex gap-1.5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() =>
            publish([...rows, { uid: ++ROW_ID, kind: "web", label: "", target: "" }])
          }
        >
          <Plus aria-hidden /> Link ou pasta
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => publish([])}>
          Não tem
        </Button>
      </div>
      {rows.length ? (
        <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <Folder className="size-3" aria-hidden />
          <LinkIcon className="size-3" aria-hidden />
          {rows.length} link{rows.length > 1 ? "s" : ""}
        </p>
      ) : null}
    </div>
  )
}

function Chip({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode
  active?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-7 rounded-full border px-3 text-xs transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        active
          ? "border-transparent bg-action text-action-foreground"
          : "bg-[var(--rf-field)] text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  )
}

function isoDaysFromNow(days: number) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}
