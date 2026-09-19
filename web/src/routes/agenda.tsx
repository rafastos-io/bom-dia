import { Button } from "@rafastos/ui/button"
import { cn } from "cn"
import { CalendarPlus, ChevronLeft, ChevronRight } from "lucide-react"
import { useMemo, useState } from "react"
import { Dot, toneFromKey, type DotTone } from "@/components/app/dot"
import { EmptyState } from "@/components/app/empty-state"
import { Panel } from "@/components/app/panel"
import { ScreenHeader } from "@/components/app/screen-header"
import { QueryError } from "@/components/area-board"
import { useOverlays } from "@/components/overlay-provider"
import { useProjects, useTasks } from "@/lib/queries"
import { archivedIndex, isTaskHidden, PRIO_RANK } from "@/lib/tasks"
import type { Prioridade, Task } from "@/lib/types"

const MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
]
const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"]
const SHORT_WEEKDAYS = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"]

const PRIO_TONE: Record<Prioridade, DotTone> = {
  alta: "pink",
  media: "amber",
  baixa: "green",
}

function localIso(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`
}

export function AgendaPage() {
  const tasks = useTasks()
  const projects = useProjects()
  const overlays = useOverlays()
  const [month, setMonth] = useState(() => new Date())

  const failed = tasks.isError || projects.isError
  const loading = tasks.isPending || projects.isPending

  const { cells, semanas, semPrazo, proximos } = useMemo(() => {
    const archived = archivedIndex(projects.data ?? [])
    const byDay = new Map<string, Task[]>()
    const visible: Task[] = []
    for (const task of tasks.data ?? []) {
      if (isTaskHidden(task, archived, null)) continue
      visible.push(task)
      const due = (task.due_date || "").trim()
      if (!due) continue
      const bucket = byDay.get(due) ?? []
      bucket.push(task)
      byDay.set(due, bucket)
    }

    const year = month.getFullYear()
    const monthIndex = month.getMonth()
    const todayIso = localIso(new Date())
    const first = new Date(year, monthIndex, 1)
    const startWeekday = first.getDay()
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()
    const weeks = Math.ceil((startWeekday + daysInMonth) / 7)
    const gridStart = new Date(year, monthIndex, 1 - startWeekday)

    const cells = Array.from({ length: weeks * 7 }, (_, index) => {
      const date = new Date(gridStart)
      date.setDate(gridStart.getDate() + index)
      const iso = localIso(date)
      const inMonth = date.getMonth() === monthIndex
      const isToday = iso === todayIso
      const items = (byDay.get(iso) ?? [])
        .slice()
        .sort(
          (a, b) =>
            PRIO_RANK[a.priority] - PRIO_RANK[b.priority] ||
            a.title.localeCompare(b.title, "pt"),
        )
      return { iso, day: date.getDate(), inMonth, isToday, items }
    })

    const semPrazo = visible.filter(
      (task) => !(task.due_date || "").trim() && task.status !== "concluida",
    )

    const proximos = visible
      .filter((task) => task.due_date && task.status !== "concluida")
      .sort((a, b) => a.due_date.localeCompare(b.due_date))
      .slice(0, 5)

    return { cells, semanas: weeks, semPrazo, proximos }
  }, [tasks.data, projects.data, month])

  return (
    <div className="flex min-w-0 flex-col gap-rf-5">
      <ScreenHeader
        title="Agenda"
        description={`${MESES[month.getMonth()]} ${month.getFullYear()} · prazos no calendário`}
      />

      {failed ? (
        <QueryError
          onRetry={() => {
            void tasks.refetch()
            void projects.refetch()
          }}
        />
      ) : loading ? (
        <div className="app-card h-96 animate-pulse" />
      ) : (
        <div className="grid gap-rf-5 xl:grid-cols-[minmax(0,1fr)_320px]">
          <Panel bodyClassName="flex flex-col gap-rf-2">
            <div className="mb-rf-1 flex flex-wrap items-center justify-between gap-rf-3">
              <div className="flex items-center gap-rf-2">
                <CalendarPlus className="size-5 text-[var(--app-ai)]" aria-hidden />
                <span className="rf-label text-foreground">
                  {MESES[month.getMonth()]}{" "}
                  <span className="font-mono text-muted-foreground">{month.getFullYear()}</span>
                </span>
              </div>
              <div className="flex items-center gap-rf-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Mês anterior"
                  onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
                >
                  <ChevronLeft aria-hidden />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setMonth(new Date())}
                >
                  Hoje
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Próximo mês"
                  onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
                >
                  <ChevronRight aria-hidden />
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-[repeat(7,minmax(0,1fr))]">
              {WEEKDAYS.map((weekday) => (
                <div
                  key={weekday}
                  className="px-1 py-rf-2 text-center rf-caption tracking-wide text-muted-foreground uppercase"
                >
                  {weekday}
                </div>
              ))}
            </div>

            <div
              className="grid grid-cols-[repeat(7,minmax(0,1fr))] overflow-hidden rounded-[var(--rf-radius-card)] border border-[var(--rf-border)]"
              style={{ gridTemplateRows: `repeat(${semanas}, minmax(92px, 1fr))` }}
            >
              {cells.map((cell) => (
                <button
                  key={cell.iso}
                  type="button"
                  onClick={() => overlays.openTask(null, { due_date: cell.iso })}
                  className={cn(
                    "flex min-h-23 min-w-0 flex-col gap-1 border-r border-b border-[var(--rf-border)] p-1.5 text-left transition-colors outline-none last:border-r-0 hover:bg-[var(--rf-hover)]/60 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset",
                    !cell.inMonth && "opacity-40",
                    cell.isToday && "bg-[var(--app-ai-soft)]/40",
                  )}
                >
                  <span
                    className={cn(
                      "inline-flex size-5 items-center justify-center rounded-full font-mono text-[11px]",
                      cell.isToday
                        ? "app-pill-active"
                        : cell.inMonth
                          ? "text-foreground"
                          : "text-muted-foreground",
                    )}
                  >
                    {cell.day}
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    {cell.items.slice(0, 3).map((task) => (
                      <span
                        key={task.id}
                        role="button"
                        tabIndex={0}
                        onClick={(event) => {
                          event.stopPropagation()
                          overlays.openTask(task.id)
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault()
                            event.stopPropagation()
                            overlays.openTask(task.id)
                          }
                        }}
                        title={task.title}
                        className={cn(
                          "flex min-w-0 items-center gap-1 truncate rounded-[6px] px-1 py-0.5 text-[10px] leading-tight",
                          task.status === "concluida" &&
                            "text-muted-foreground line-through opacity-70",
                        )}
                        style={{
                          backgroundColor: `color-mix(in srgb, ${
                            task.projeto
                              ? "var(--app-dot-violet)"
                              : task.priority === "alta"
                                ? "var(--app-dot-pink)"
                                : task.priority === "media"
                                  ? "var(--app-dot-amber)"
                                  : "var(--app-dot-green)"
                          } 16%, transparent)`,
                        }}
                      >
                        <span
                          className="size-1.5 shrink-0 rounded-full"
                          style={{
                            backgroundColor: task.projeto
                              ? "var(--app-dot-violet)"
                              : task.priority === "alta"
                                ? "var(--app-dot-pink)"
                                : task.priority === "media"
                                  ? "var(--app-dot-amber)"
                                  : "var(--app-dot-green)",
                          }}
                          aria-hidden
                        />
                        <span className="truncate">{task.title}</span>
                      </span>
                    ))}
                    {cell.items.length > 3 ? (
                      <span className="px-1 font-mono text-[10px] text-muted-foreground">
                        +{cell.items.length - 3}
                      </span>
                    ) : null}
                  </span>
                </button>
              ))}
            </div>
          </Panel>

          <div className="flex min-w-0 flex-col gap-rf-5">
            <Panel title="Próximos" description="Os próximos prazos com data.">
              {proximos.length ? (
                <ol className="flex min-w-0 flex-col gap-rf-2">
                  {proximos.map((task) => {
                    const [, monthNum, day] = task.due_date.split("-")
                    const weekday = SHORT_WEEKDAYS[new Date(task.due_date + "T12:00:00").getDay()]
                    return (
                      <li key={task.id} className="min-w-0">
                        <button
                          type="button"
                          onClick={() => overlays.openTask(task.id)}
                          className="flex w-full items-center gap-rf-3 rounded-[var(--rf-radius-card)] px-rf-2 py-rf-2 text-left transition-colors outline-none hover:bg-[var(--rf-hover)]/60 focus-visible:ring-3 focus-visible:ring-ring/50"
                        >
                          <span className="flex w-9 shrink-0 flex-col items-center">
                            <span className="rf-caption text-muted-foreground">{weekday}</span>
                            <span className="text-lg font-bold text-foreground">{day}</span>
                          </span>
                          <span className="flex min-w-0 flex-1 flex-col gap-rf-1">
                            <span className="flex min-w-0 items-center gap-rf-2">
                              <Dot tone={PRIO_TONE[task.priority]} />
                              <span className="truncate text-sm font-medium text-foreground">
                                {task.title}
                              </span>
                            </span>
                            <span className="min-w-0 truncate rf-caption text-muted-foreground">
                              {task.projeto || "Sem projeto"} · {monthNum}/{day}
                            </span>
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ol>
              ) : (
                <p className="rf-caption text-muted-foreground">Nenhum prazo futuro.</p>
              )}
            </Panel>

            <Panel title="Sem data" description="Demandas que ainda não têm prazo.">
              {semPrazo.length ? (
                <ul className="flex min-w-0 flex-col gap-rf-2">
                  {semPrazo.slice(0, 5).map((task) => (
                    <li key={task.id} className="min-w-0">
                      <button
                        type="button"
                        onClick={() => overlays.openTask(task.id)}
                        className="flex w-full items-center gap-rf-2 rounded-[var(--rf-radius-card)] px-rf-2 py-rf-2 text-left transition-colors outline-none hover:bg-[var(--rf-hover)]/60 focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        <Dot tone={task.projeto ? toneFromKey(task.projeto) : PRIO_TONE[task.priority]} />
                        <span className="min-w-0 truncate rf-caption text-foreground">
                          {task.title}
                        </span>
                      </button>
                    </li>
                  ))}
                  {semPrazo.length > 5 ? (
                    <li className="px-rf-2 font-mono text-[11px] text-muted-foreground">
                      +{semPrazo.length - 5} sem data
                    </li>
                  ) : null}
                </ul>
              ) : (
                <EmptyState
                  mascot="checklist"
                  title="Nenhuma tarefa sem data"
                  description="Tudo em dia por aqui! Se surgir algo, defina um prazo para aparecer no calendário."
                  action={
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => overlays.openTask(null, { tipo: "tarefa" })}
                    >
                      Adicionar tarefa
                    </Button>
                  }
                />
              )}
            </Panel>

            <p className="px-rf-2 rf-caption text-muted-foreground">
              Clique num dia para criar; clique num item para abrir.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
