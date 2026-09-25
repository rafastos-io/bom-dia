import { Button } from "@rafastos/ui/button"
import { Textarea } from "@rafastos/ui/textarea"
import { Loader2, Send, Sparkles } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { EmptyState } from "@/components/app/empty-state"
import { Panel } from "@/components/app/panel"
import { ScreenHeader } from "@/components/app/screen-header"
import { BoardSkeleton, QueryError } from "@/components/area-board"
import { useOverlays } from "@/components/overlay-provider"
import { Postit } from "@/components/postit"
import { ViewToolbar } from "@/components/view-toolbar"
import { useSaveTask } from "@/lib/queries"
import { useAreaTasks } from "@/lib/use-area-tasks"

export function IdeiasPage() {
  const { tasks, projects, list } = useAreaTasks("ideias")
  const overlays = useOverlays()
  const save = useSaveTask()
  const [text, setText] = useState("")

  const loading = tasks.isPending || projects.isPending
  const failed = tasks.isError || projects.isError

  async function submitIdea() {
    const title = text.trim()
    if (!title) return
    try {
      await save.mutateAsync({
        payload: {
          title,
          tipo: "ideia",
          projeto: "",
          priority: "media",
          status: "aberta",
          due_date: "",
          requested_by: "",
          send_to: "",
          description: "",
          links: [],
          subtasks: [],
          recorrencia: "",
        },
      })
      setText("")
      toast.success("Ideia salva.")
    } catch {
      toast.error("Não consegui salvar a ideia.")
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-rf-5">
      <ScreenHeader title="Ideias" description="Guarde o que não pode se perder." />

      <Panel
        title="Escreva uma ideia"
        description="Uma frase basta — depois você conecta a projetos, rotinas ou tarefas."
      >
        <div className="flex flex-col gap-rf-3">
          <Textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                event.preventDefault()
                void submitIdea()
              }
            }}
            rows={3}
            placeholder="Escreva uma ideia..."
            className="resize-none"
          />
          <div className="flex flex-wrap items-center gap-rf-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => overlays.openTask(null, { tipo: "ideia" })}
            >
              <Sparkles aria-hidden /> Abrir formulário completo
            </Button>
            <Button
              type="button"
              size="sm"
              className="ml-auto"
              disabled={!text.trim() || save.isPending}
              onClick={() => void submitIdea()}
            >
              {save.isPending ? (
                <Loader2 className="animate-spin" aria-hidden />
              ) : (
                <Send aria-hidden />
              )}
              Salvar ideia
            </Button>
          </div>
        </div>
      </Panel>

      <ViewToolbar hideViewToggle exportTasks={list} />
      {failed ? (
        <QueryError
          onRetry={() => {
            void tasks.refetch()
            void projects.refetch()
          }}
        />
      ) : loading ? (
        <BoardSkeleton />
      ) : list.length ? (
        <div className="grid grid-cols-1 gap-rf-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {list.map((idea) => (
            <Postit key={idea.id} idea={idea} />
          ))}
        </div>
      ) : (
        <EmptyState
          mascot="thinking"
          title="Sua próxima boa ideia começa aqui."
          description="Anote agora e organize depois — nenhuma ideia precisa se perder."
        />
      )}
    </div>
  )
}
