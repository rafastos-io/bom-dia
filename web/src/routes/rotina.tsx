import { Button } from "@rafastos/ui/button"
import { Plus } from "lucide-react"
import { RecurrencePanel } from "@/components/app/recurrence-panel"
import { ScreenHeader } from "@/components/app/screen-header"
import { BoardSkeleton, QueryError, TaskBoard } from "@/components/area-board"
import { useOverlays } from "@/components/overlay-provider"
import { ViewToolbar } from "@/components/view-toolbar"
import { useAreaTasks } from "@/lib/use-area-tasks"

export function RotinaPage() {
  const { tasks, projects, view, list } = useAreaTasks("rotina")
  const overlays = useOverlays()

  const loading = tasks.isPending || projects.isPending
  const failed = tasks.isError || projects.isError

  return (
    <div className="flex min-w-0 flex-col gap-rf-5">
      <ScreenHeader
        title="Rotina"
        description="Pequenas ações, consistência real."
        actions={
          <Button
            type="button"
            onClick={() => overlays.openTask(null, { tipo: "rotina" })}
          >
            <Plus aria-hidden /> Nova rotina
          </Button>
        }
      />

      <RecurrencePanel />
      <ViewToolbar exportTasks={list} />
      {failed ? (
        <QueryError
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
          cards="routine"
          mascot="pockets"
          emptyMessage="Nenhuma rotina ainda."
          emptyHint="Crie hábitos com recorrência e acompanhe o período atual."
        />
      )}
    </div>
  )
}
