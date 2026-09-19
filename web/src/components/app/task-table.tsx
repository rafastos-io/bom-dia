import { cn } from "cn"
import { useMemo, useState } from "react"
import { Dot, toneFromKey } from "@/components/app/dot"
import { Segmented } from "@/components/app/segmented"
import { useOverlays } from "@/components/overlay-provider"
import { StatusSelect } from "@/components/task-items"
import { fmtDate, isLate, substaskProgress } from "@/lib/tasks"
import type { Task } from "@/lib/types"

type DayWindow = "ontem" | "hoje" | "amanha"

function isoOffset(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

export function TaskTable({ tasks }: { tasks: Task[] }) {
  const overlays = useOverlays()
  const [window, setWindow] = useState<DayWindow>("hoje")
  const target = useMemo(
    () => ({ ontem: isoOffset(-1), hoje: isoOffset(0), amanha: isoOffset(1) })[window],
    [window],
  )

  const rows = useMemo(
    () => tasks.filter((task) => (task.due_date || "").slice(0, 10) === target),
    [tasks, target],
  )

  return (
    <div className="flex flex-col gap-rf-4">
      <div className="flex flex-wrap items-center justify-between gap-rf-3">
        <Segmented
          ariaLabel="Janela de prazos"
          value={window}
          onChange={(value) => setWindow(value)}
          items={[
            { value: "ontem", label: "Ontem" },
            { value: "hoje", label: "Hoje" },
            { value: "amanha", label: "Amanhã" },
          ]}
        />
        <span className="rf-caption text-muted-foreground">
          {rows.length} {rows.length === 1 ? "item" : "itens"}
        </span>
      </div>

      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-separate border-spacing-y-1.5">
            <thead>
              <tr className="text-left">
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
                return (
                  <tr
                    key={task.id}
                    className="group cursor-pointer"
                    onClick={() => overlays.openTask(task.id)}
                  >
                    <td className="app-card rounded-l-[var(--rf-radius-card)] py-rf-3 pr-rf-3 pl-rf-3">
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
                      </span>
                    </td>
                    <td className="app-card py-rf-3 pr-rf-3">
                      <span className="rf-caption text-muted-foreground">
                        {task.projeto || "—"}
                      </span>
                    </td>
                    <td className="app-card py-rf-3 pr-rf-3">
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
                    <td className="app-card py-rf-3 pr-rf-3">
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
                      className="app-card rounded-r-[var(--rf-radius-card)] py-rf-2 pr-rf-3"
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
