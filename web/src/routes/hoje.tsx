import { Button } from "@rafastos/ui/button"
import { Plus } from "lucide-react"
import { useRef, useState } from "react"
import { BoardSkeleton, QueryError, TaskBoard } from "@/components/area-board"
import { AssistantDialog } from "@/components/assistant-dialog"
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

export function HojePage() {
  const { tasks, projects, view, list } = useAreaTasks("hoje")
  const overlays = useOverlays()
  const compact = useIsCompact()
  const [assistantOpen, setAssistantOpen] = useState(false)
  const [assistantSeq, setAssistantSeq] = useState(0)
  const boardRef = useRef<HTMLDivElement>(null)

  const openAssistant = () => {
    setAssistantSeq((seq) => seq + 1)
    setAssistantOpen(true)
  }

  const loading = tasks.isPending || projects.isPending
  const failed = tasks.isError || projects.isError

  return (
    <div className="flex flex-col gap-rf-5">
      <Dashboard
        onOpenAssistant={openAssistant}
        onNewTask={() => overlays.openTask(null, { tipo: "tarefa" })}
        onRemindTomorrow={() =>
          overlays.openTask(null, { tipo: "tarefa", due_date: tomorrowISO() })
        }
        onSeeAll={() => boardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
      />

      <section ref={boardRef} className="flex flex-col gap-rf-4 scroll-mt-24">
        <ViewToolbar />
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
            tasks={list}
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

      <AssistantDialog
        key={`assistant-${assistantSeq}`}
        open={assistantOpen}
        onOpenChange={setAssistantOpen}
      />
    </div>
  )
}
