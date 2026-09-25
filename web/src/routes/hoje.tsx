import { Button } from "@rafastos/ui/button"
import { Plus } from "lucide-react"
import { useRef, useState } from "react"
import { BoardSkeleton, QueryError, TaskBoard } from "@/components/area-board"
import { Chip } from "@/components/app/chip"
import { Dashboard } from "@/components/dashboard"
import { useOverlays } from "@/components/overlay-provider"
import { ViewToolbar } from "@/components/view-toolbar"
import { useAreaTasks } from "@/lib/use-area-tasks"
import { useIsCompact } from "@/lib/use-media-query"

function tomorrowISO() {
  const date = new Date()
  date.setDate(date.getDate() + 1)
  return date.toISOString().slice(0, 10)
}

function isoOffset(days: number) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

type DayWindow = "todas" | "hoje" | "amanha" | "semana"

const DAY_WINDOWS: Array<[DayWindow, string]> = [
  ["todas", "Todas"],
  ["hoje", "Hoje"],
  ["amanha", "Amanhã"],
  ["semana", "Semana"],
]

export function HojePage() {
  const { tasks, projects, view, list } = useAreaTasks("hoje")
  const overlays = useOverlays()
  const compact = useIsCompact()
  const [dayWindow, setDayWindow] = useState<DayWindow>("todas")
  const boardRef = useRef<HTMLDivElement>(null)

  const loading = tasks.isPending || projects.isPending
  const failed = tasks.isError || projects.isError

  const windowed =
    dayWindow === "todas"
      ? list
      : list.filter((task) => {
          const due = (task.due_date || "").slice(0, 10)
          if (!due) return false
          if (dayWindow === "hoje") return due <= isoOffset(0)
          if (dayWindow === "amanha") return due === isoOffset(1)
          return due >= isoOffset(0) && due <= isoOffset(7)
        })

  return (
    <div className="flex min-w-0 flex-col gap-rf-5">
      <Dashboard
        onOpenAssistant={overlays.openAssistant}
        onNewTask={() => overlays.openTask(null, { tipo: "tarefa" })}
        onRemindTomorrow={() =>
          overlays.openTask(null, { tipo: "tarefa", due_date: tomorrowISO() })
        }
        onSeeAll={() => boardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
      />

      <section ref={boardRef} className="flex scroll-mt-24 flex-col gap-rf-4">
        {view.view === "lista" ? null : (
        <div className="flex flex-wrap items-center gap-rf-1">
          {DAY_WINDOWS.map(([key, label]) => (
            <Chip key={key} active={dayWindow === key} onClick={() => setDayWindow(key)}>
              {label}
            </Chip>
          ))}
          <span className="ml-rf-2 rf-caption text-muted-foreground">
            {dayWindow === "todas" ? "tudo em vista" : "filtrando por prazo"}
          </span>
        </div>
        )}
        <ViewToolbar exportTasks={windowed} />
        {failed ? (
          <QueryError
            message="Não consegui carregar as tarefas."
            onRetry={() => {
              void tasks.refetch()
              void projects.refetch()
            }}
          />
        ) : loading ? (
          <BoardSkeleton view={view.view} />
        ) : (
          <TaskBoard
            tasks={windowed}
            view={view.view}
            listMode="table"
            mascot="thinking"
            emptyMessage="Nada por aqui ainda."
            emptyHint="Respire — e adicione quando precisar."
          />
        )}
      </section>

      {compact ? (
        <Button
          type="button"
          size="icon-lg"
          aria-label="Nova tarefa"
          onClick={() => overlays.openTask(null, { tipo: "tarefa" })}
          className="fixed right-4 bottom-[calc(88px+env(safe-area-inset-bottom))] z-40 size-14 rounded-full shadow-elevated"
        >
          <Plus className="size-6" aria-hidden />
        </Button>
      ) : null}
    </div>
  )
}
