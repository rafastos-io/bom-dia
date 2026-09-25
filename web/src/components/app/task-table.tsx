import { Button } from "@rafastos/ui/button"
import { Checkbox } from "@rafastos/ui/checkbox"
import { cn } from "cn"
import { Check, RotateCcw, Trash2, X } from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { Dot, toneFromKey } from "@/components/app/dot"
import { Segmented } from "@/components/app/segmented"
import { useConfirm } from "@/components/app/confirm"
import { useListView } from "@/components/list-view"
import { useOverlays } from "@/components/overlay-provider"
import { BlockedBadge, StatusSelect } from "@/components/task-items"
import { openLink } from "@/lib/open"
import { useBulkDeleteTasks, useBulkTaskAction } from "@/lib/queries"
import { fmtDate, isLate, substaskProgress } from "@/lib/tasks"
import type { Task } from "@/lib/types"

type DayWindow = "hoje" | "amanha" | "atrasadas" | "todas"

function isoOffset(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

export function TaskTable({ tasks }: { tasks: Task[] }) {
  const overlays = useOverlays()
  const { confirm } = useConfirm()
  const bulk = useBulkTaskAction()
  const bulkDelete = useBulkDeleteTasks()
  const { density } = useListView()
  const compact = density === "compact"
  const cellY = compact ? "py-rf-2" : "py-rf-3"
  const [window, setWindow] = useState<DayWindow>("hoje")
  const [selected, setSelected] = useState<Set<number>>(new Set())

  const rows = useMemo(() => {
    const today = isoOffset(0)
    const tomorrow = isoOffset(1)
    return tasks.filter((task) => {
      const due = (task.due_date || "").slice(0, 10)
      if (window === "todas") return true
      if (!due) return false
      if (window === "atrasadas") return due < today
      if (window === "amanha") return due === tomorrow
      return due <= today
    })
  }, [tasks, window])

  const visibleIds = rows.map((task) => task.id)
  const selectedVisible = visibleIds.filter((id) => selected.has(id))
  const allSelected = rows.length > 0 && selectedVisible.length === rows.length

  const toggle = (id: number) => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    setSelected((current) => {
      const next = new Set(current)
      if (allSelected) visibleIds.forEach((id) => next.delete(id))
      else visibleIds.forEach((id) => next.add(id))
      return next
    })
  }

  const runBulk = (patch: { status?: Task["status"]; priority?: Task["priority"] }) => {
    const ids = selectedVisible
    if (!ids.length) return
    bulk.mutate(
      { ids, patch },
      {
        onSuccess: () => {
          toast(`${ids.length} tarefa${ids.length > 1 ? "s" : ""} atualizada${ids.length > 1 ? "s" : ""}`)
          setSelected(new Set())
        },
        onError: () => toast.error("Não deu pra atualizar a seleção"),
      },
    )
  }

  const runBulkDelete = async () => {
    const ids = selectedVisible
    if (!ids.length) return
    const ok = await confirm({
      title: `Excluir ${ids.length} tarefa${ids.length > 1 ? "s" : ""}?`,
      description: "Subtarefas, links e anexos delas também são removidos.",
      destructive: true,
    })
    if (!ok) return
    bulkDelete.mutate(ids, {
      onSuccess: () => {
        toast("Seleção excluída")
        setSelected(new Set())
      },
      onError: () => toast.error("Não deu pra excluir a seleção"),
    })
  }

  return (
    <div className="flex flex-col gap-rf-4">
      <div className="flex flex-wrap items-center justify-between gap-rf-3">
        <Segmented
          ariaLabel="Janela de prazos"
          value={window}
          onChange={(value) => setWindow(value)}
          items={[
            { value: "hoje", label: "Hoje" },
            { value: "amanha", label: "Amanhã" },
            { value: "atrasadas", label: "Atrasadas" },
            { value: "todas", label: "Todas" },
          ]}
        />
        <span className="rf-caption text-muted-foreground">
          {rows.length} {rows.length === 1 ? "item" : "itens"}
        </span>
      </div>

      {selectedVisible.length ? (
        <div className="app-card flex flex-wrap items-center gap-rf-2 px-rf-3 py-rf-2">
          <span className="rf-caption text-foreground">
            {selectedVisible.length} selecionada{selectedVisible.length > 1 ? "s" : ""}
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-rf-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={bulk.isPending}
              onClick={() => runBulk({ status: "concluida" })}
            >
              <Check aria-hidden /> Concluir
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={bulk.isPending}
              onClick={() => runBulk({ status: "aberta" })}
            >
              <RotateCcw aria-hidden /> Reabrir
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={bulk.isPending}
              onClick={() => runBulk({ priority: "alta" })}
            >
              Alta
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={bulk.isPending}
              onClick={() => runBulk({ priority: "baixa" })}
            >
              Baixa
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-[var(--rf-error)]"
              disabled={bulkDelete.isPending}
              onClick={() => void runBulkDelete()}
            >
              <Trash2 aria-hidden /> Excluir
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Limpar seleção"
              onClick={() => setSelected(new Set())}
            >
              <X aria-hidden />
            </Button>
          </div>
        </div>
      ) : null}

      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] border-separate border-spacing-y-1.5">
            <thead>
              <tr className="text-left">
                <th className="w-9 px-rf-2 pb-rf-1">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={toggleAll}
                    aria-label="Selecionar todas"
                  />
                </th>
                {["Tarefa", "Projeto", "Prazo", "Progresso", "Status"].map((label) => (
                  <th
                    key={label}
                    className="px-rf-3 pb-rf-1 rf-caption font-medium text-muted-foreground"
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((task) => {
                const done = task.status === "concluida"
                const { done: subsDone, total, percent } = substaskProgress(task.subtasks)
                const isSelected = selected.has(task.id)
                return (
                  <tr
                    key={task.id}
                    className={cn("group cursor-pointer", isSelected && "outline-none")}
                    onClick={() => overlays.openTask(task.id)}
                  >
                    <td
                      className={cn(
                        "app-card rounded-l-[var(--rf-radius-card)] pl-rf-2",
                        cellY,
                        isSelected && "bg-[var(--app-ai-soft)]/40",
                      )}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggle(task.id)}
                        aria-label={`Selecionar ${task.title}`}
                      />
                    </td>
                    <td
                      className={cn(
                        "app-card pr-rf-3",
                        cellY,
                        isSelected && "bg-[var(--app-ai-soft)]/40",
                      )}
                    >
                      <span className="flex items-center gap-rf-2">
                        <Dot
                          tone={
                            task.projeto
                              ? toneFromKey(task.projeto)
                              : task.priority === "alta"
                                ? "pink"
                                : "muted"
                          }
                        />
                        <span
                          className={cn(
                            "min-w-0 truncate text-sm font-medium text-foreground",
                            done && "text-muted-foreground line-through",
                          )}
                        >
                          {task.title}
                        </span>
                        {task.tags?.length ? (
                          <span className="hidden max-w-48 shrink-0 truncate font-mono text-[10px] text-muted-foreground min-[900px]:inline">
                            {task.tags.map((tag) => `#${tag}`).join(" ")}
                          </span>
                        ) : null}
                        <BlockedBadge task={task} />
                        {task.central ? (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              void openLink("nota", task.central?.path ?? "")
                            }}
                            title={`Na CENTRAL: ${task.central.title || task.central.path}`}
                            className="inline-flex shrink-0 items-center rounded-full bg-[var(--rf-hover)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
                          >
                            CENTRAL
                          </button>
                        ) : null}
                      </span>
                    </td>
                    <td
                      className={cn(
                        "app-card pr-rf-3",
                        cellY,
                        isSelected && "bg-[var(--app-ai-soft)]/40",
                      )}
                    >
                      <span className="rf-caption text-muted-foreground">
                        {task.projeto || "—"}
                      </span>
                    </td>
                    <td
                      className={cn(
                        "app-card pr-rf-3",
                        cellY,
                        isSelected && "bg-[var(--app-ai-soft)]/40",
                      )}
                    >
                      <span
                        className={cn(
                          "rf-caption",
                          isLate(task) ? "text-[var(--rf-error)]" : "text-muted-foreground",
                        )}
                      >
                        {task.due_date ? fmtDate(task.due_date) : "—"}
                        {isLate(task) ? " · atrasada" : ""}
                      </span>
                    </td>
                    <td
                      className={cn(
                        "app-card pr-rf-3",
                        cellY,
                        isSelected && "bg-[var(--app-ai-soft)]/40",
                      )}
                    >
                      {total ? (
                        <span className="flex min-w-24 items-center gap-rf-2">
                          <span
                            className="h-1.5 w-16 overflow-hidden rounded-full bg-[var(--rf-hover)]"
                            role="progressbar"
                            aria-valuenow={percent}
                            aria-valuemin={0}
                            aria-valuemax={100}
                          >
                            <span
                              className="block h-full rounded-full"
                              style={{
                                width: `${percent}%`,
                                backgroundColor:
                                  percent === 100 ? "var(--app-dot-green)" : "var(--app-ai)",
                              }}
                            />
                          </span>
                          <span className="font-mono text-[11px] text-muted-foreground">
                            {subsDone}/{total}
                          </span>
                        </span>
                      ) : (
                        <span className="rf-caption text-muted-foreground">—</span>
                      )}
                    </td>
                    <td
                      className={cn(
                        "app-card rounded-r-[var(--rf-radius-card)] pr-rf-3",
                        compact ? "py-rf-1.5" : "py-rf-2",
                        isSelected && "bg-[var(--app-ai-soft)]/40",
                      )}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <StatusSelect task={task} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="app-card px-rf-4 py-rf-5 text-center rf-caption text-muted-foreground">
          Nada com prazo nesse dia.
        </p>
      )}
    </div>
  )
}
