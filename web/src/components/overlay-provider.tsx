import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { AssistantDialog } from "./assistant-dialog"
import { ProjectDialog } from "./project-dialog"
import { TaskDialog, type TaskFormPresets } from "./task-dialog"
import { WhatsappDialog } from "./whatsapp-dialog"
import { useTasks } from "@/lib/queries"
import type { Project, Task } from "@/lib/types"

type OverlayContextValue = {
  openTask: (taskId: number | null, presets?: TaskFormPresets) => void
  openWhatsapp: (task: Task) => void
  openProject: (project: Project | null, onDeleted?: () => void) => void
  openAssistant: () => void
}

const OverlayContext = createContext<OverlayContextValue | null>(null)

export function OverlayProvider({ children }: { children: ReactNode }) {
  const tasks = useTasks()
  const [taskState, setTaskState] = useState<{
    open: boolean
    id: number | null
    presets?: TaskFormPresets
    seq: number
  }>({ open: false, id: null, seq: 0 })
  const [whatsappTask, setWhatsappTask] = useState<Task | null>(null)
  const [projectState, setProjectState] = useState<{
    open: boolean
    project: Project | null
    onDeleted?: () => void
    seq: number
  }>({ open: false, project: null, seq: 0 })
  const [assistantState, setAssistantState] = useState({ open: false, seq: 0 })

  const openTask = useCallback(
    (taskId: number | null, presets?: TaskFormPresets) =>
      setTaskState((current) => ({
        open: true,
        id: taskId,
        presets,
        seq: current.seq + 1,
      })),
    [],
  )
  const openWhatsapp = useCallback((task: Task) => setWhatsappTask(task), [])
  const openProject = useCallback(
    (project: Project | null, onDeleted?: () => void) =>
      setProjectState((current) => ({
        open: true,
        project,
        onDeleted,
        seq: current.seq + 1,
      })),
    [],
  )

  const openAssistant = useCallback(
    () => setAssistantState((current) => ({ open: true, seq: current.seq + 1 })),
    [],
  )

  const value = useMemo(
    () => ({ openTask, openWhatsapp, openProject, openAssistant }),
    [openAssistant, openTask, openWhatsapp, openProject],
  )

  const editing =
    taskState.id != null
      ? ((tasks.data ?? []).find((task) => task.id === taskState.id) ?? null)
      : null

  return (
    <OverlayContext.Provider value={value}>
      {children}
      <TaskDialog
        key={`task-${taskState.id ?? "novo"}-${taskState.seq}`}
        open={taskState.open}
        onOpenChange={(open) => setTaskState((current) => ({ ...current, open }))}
        task={editing}
        presets={taskState.presets}
      />
      <WhatsappDialog
        key={`wa-${whatsappTask?.id ?? "none"}`}
        task={whatsappTask}
        onClose={() => setWhatsappTask(null)}
      />
      <ProjectDialog
        key={`proj-${projectState.project?.id ?? "novo"}-${projectState.seq}`}
        open={projectState.open}
        project={projectState.project}
        onOpenChange={(open) => setProjectState((current) => ({ ...current, open }))}
        onDeleted={projectState.onDeleted}
      />
      <AssistantDialog
        key={`assistant-${assistantState.seq}`}
        open={assistantState.open}
        onOpenChange={(open) => setAssistantState((current) => ({ ...current, open }))}
      />
    </OverlayContext.Provider>
  )
}

export function useOverlays() {
  const ctx = useContext(OverlayContext)
  if (!ctx) throw new Error("useOverlays precisa do OverlayProvider")
  return ctx
}
