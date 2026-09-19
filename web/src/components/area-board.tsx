import { Button } from "@rafastos/ui/button"
import { Skeleton } from "@rafastos/ui/skeleton"
import { RotateCcw } from "lucide-react"
import { EmptyState } from "@/components/app/empty-state"
import { RoutineCard } from "@/components/app/routine-card"
import { TaskTable } from "@/components/app/task-table"
import { KanbanBoard, TaskCard, TaskRow } from "./task-items"
import type { Task } from "@/lib/types"
import type { ViewKey } from "@/lib/tasks"

type TaskBoardProps = {
  tasks: Task[]
  view: ViewKey
  hideProjeto?: boolean
  emptyMessage: string
  emptyHint?: string
  /** "table" troca a visão de lista por uma tabela (usada no Hoje). */
  listMode?: "rows" | "table"
  /** "routine" usa o card de cadência/período na visão de cards. */
  cards?: "task" | "routine"
  mascot?: "thinking" | "thumbsup" | "checklist" | "avatar" | "phone" | "pockets"
}

export function TaskBoard({
  tasks,
  view,
  hideProjeto,
  emptyMessage,
  emptyHint,
  listMode = "rows",
  cards = "task",
  mascot,
}: TaskBoardProps) {
  if (!tasks.length) {
    return <EmptyState mascot={mascot} title={emptyMessage} description={emptyHint} />
  }

  if (view === "kanban") return <KanbanBoard tasks={tasks} />

  if (view === "lista") {
    if (listMode === "table") return <TaskTable tasks={tasks} />
    return (
      <div className="flex flex-col gap-2">
        {tasks.map((task) => (
          <TaskRow key={task.id} task={task} />
        ))}
      </div>
    )
  }

  if (cards === "routine") {
    return (
      <div className="grid grid-cols-1 gap-rf-4 min-[700px]:grid-cols-2 min-[1100px]:grid-cols-3">
        {tasks.map((task) => (
          <RoutineCard key={task.id} task={task} />
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-rf-4 min-[700px]:grid-cols-2 min-[1100px]:grid-cols-3">
      {tasks.map((task) => (
        <TaskCard key={task.id} task={task} hideProjeto={hideProjeto} />
      ))}
    </div>
  )
}

export function BoardSkeleton({ view = "cards" }: { view?: ViewKey }) {
  if (view === "lista") {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-12 rounded-[var(--rf-radius-control)]" />
        ))}
      </div>
    )
  }
  return (
    <div className="grid grid-cols-1 gap-rf-4 min-[700px]:grid-cols-2 min-[1100px]:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <Skeleton key={index} className="h-40 rounded-[var(--rf-radius-card)]" />
      ))}
    </div>
  )
}

export function QueryError({
  message,
  onRetry,
}: {
  message?: string
  onRetry: () => void
}) {
  return (
    <div className="app-card flex flex-col items-center gap-rf-3 px-rf-6 py-rf-8 text-center">
      <p className="rf-caption text-muted-foreground">
        {message || "Não consegui carregar agora."}
      </p>
      <Button type="button" variant="outline" size="sm" onClick={onRetry}>
        <RotateCcw aria-hidden /> Tentar de novo
      </Button>
    </div>
  )
}
