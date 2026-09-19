import { Repeat2 } from "lucide-react"
import { useMemo } from "react"
import { Dot, toneFromKey } from "@/components/app/dot"
import { Panel } from "@/components/app/panel"
import { useOverlays } from "@/components/overlay-provider"
import { useProjects, useTasks } from "@/lib/queries"
import { archivedIndex, fmtDate, isTaskHidden, PERIODO_LABEL, RECOR_LABEL } from "@/lib/tasks"

/** Central das recorrências: rotinas (check por período) e tarefas que geram a próxima. */
export function RecurrencePanel() {
  const tasks = useTasks()
  const projects = useProjects()
  const overlays = useOverlays()

  const items = useMemo(() => {
    const archived = archivedIndex(projects.data ?? [])
    return (tasks.data ?? [])
      .filter(
        (task) =>
          task.recorrencia && task.status !== "concluida" && !isTaskHidden(task, archived, null),
      )
      .sort((a, b) => {
        const byKind = (a.tipo || "").localeCompare(b.tipo || "")
        if (byKind !== 0) return byKind
        return a.title.localeCompare(b.title, "pt-BR")
      })
  }, [tasks.data, projects.data])

  if (!items.length) return null

  return (
    <Panel
      title="Todas as recorrências"
      description="Rotinas e tarefas que se repetem — com a próxima ocorrência."
    >
      <ul className="flex flex-col gap-rf-2">
        {items.map((task) => {
          const isRotina = (task.tipo || "tarefa") === "rotina"
          const periodo = PERIODO_LABEL[task.recorrencia] ?? ""
          return (
            <li key={task.id}>
              <button
                type="button"
                onClick={() => overlays.openTask(task.id)}
                className="flex w-full min-w-0 items-center gap-rf-3 rounded-[var(--rf-radius-card)] px-rf-2 py-rf-2 text-left outline-none transition-colors hover:bg-[var(--rf-hover)]/60 focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <Repeat2 className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="flex min-w-0 flex-1 flex-col gap-rf-1">
                  <span className="flex min-w-0 items-center gap-rf-2">
                    <Dot tone={task.projeto ? toneFromKey(task.projeto) : "violet"} />
                    <span className="truncate text-sm font-medium text-foreground">
                      {task.title}
                    </span>
                  </span>
                  <span className="truncate rf-caption text-muted-foreground">
                    {isRotina ? "Rotina" : "Tarefa"} · {RECOR_LABEL[task.recorrencia] ?? ""}
                    {task.projeto ? ` · ${task.projeto}` : ""}
                  </span>
                </span>
                <span className="shrink-0 rf-caption text-muted-foreground">
                  {isRotina
                    ? task.feita
                      ? `Feito ${periodo}`
                      : `Pendente ${periodo}`
                    : task.due_date
                      ? `Próxima ${fmtDate(task.due_date)}`
                      : "Sem data"}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </Panel>
  )
}
