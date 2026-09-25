import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import {
  apiAi,
  apiAttachments,
  apiNotes,
  apiProjects,
  apiRadar,
  apiSubtasks,
  apiTasks,
  uploadAttachment,
} from "./api"
import type {
  Attachment,
  Note,
  Prioridade,
  Project,
  Status,
  Task,
  TaskPayload,
  TaskLink,
} from "./types"

export const qk = {
  tasks: ["tasks"] as const,
  projects: ["projects"] as const,
  aiStatus: ["ai-status"] as const,
  radar: ["radar"] as const,
  notes: (projectId: number) => ["notes", projectId] as const,
  attachments: (ownerType: string, ownerId: number) =>
    ["attachments", ownerType, ownerId] as const,
}

function useRefreshData() {
  const qc = useQueryClient()
  return () => {
    void qc.invalidateQueries({ queryKey: qk.tasks })
    void qc.invalidateQueries({ queryKey: qk.projects })
  }
}

export function useTasks() {
  return useQuery({ queryKey: qk.tasks, queryFn: apiTasks.list })
}

/** Ações em lote (concluir/reabrir/prioridade) sobre a seleção da tabela. */
export function useBulkTaskAction() {
  const refresh = useRefreshData()
  return useMutation({
    mutationFn: async ({
      ids,
      patch,
    }: {
      ids: number[]
      patch: { status?: Status; priority?: Prioridade }
    }) => {
      for (const id of ids) {
        await apiTasks.update(id, patch)
      }
    },
    onSuccess: refresh,
  })
}

/** Exclui várias tarefas com uma atualização só no fim. */
export function useBulkDeleteTasks() {
  const refresh = useRefreshData()
  return useMutation({
    mutationFn: async (ids: number[]) => {
      for (const id of ids) {
        await apiTasks.remove(id)
      }
    },
    onSuccess: refresh,
  })
}

export function useProjects() {
  return useQuery({ queryKey: qk.projects, queryFn: apiProjects.list })
}

/** Radar da CENTRAL: leitura derivada (somente leitura no vault). */
export function useRadar() {
  return useQuery({
    queryKey: qk.radar,
    queryFn: apiRadar.digest,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })
}

export function useAiStatus() {
  return useQuery({
    queryKey: qk.aiStatus,
    queryFn: apiAi.status,
    staleTime: 60_000,
  })
}

export function useNotes(projectId: number) {
  return useQuery({
    queryKey: qk.notes(projectId),
    queryFn: () => apiNotes.list(projectId),
    enabled: projectId > 0,
  })
}

export function useAttachments(ownerType: "task" | "project", ownerId: number | null) {
  return useQuery({
    queryKey: qk.attachments(ownerType, ownerId ?? 0),
    queryFn: () => apiAttachments.list(ownerType, ownerId ?? 0),
    enabled: (ownerId ?? 0) > 0,
  })
}

export function useSaveTask() {
  const refresh = useRefreshData()
  return useMutation({
    mutationFn: ({ id, payload }: { id?: number; payload: TaskPayload }) =>
      id ? apiTasks.update(id, payload) : apiTasks.create(payload),
    onSuccess: refresh,
  })
}

export function useDeleteTask() {
  const refresh = useRefreshData()
  return useMutation({
    mutationFn: (id: number) => apiTasks.remove(id),
    onSuccess: refresh,
  })
}

function optimisticTaskPatch(
  qc: ReturnType<typeof useQueryClient>,
  id: number,
  patch: Partial<Task>,
) {
  void qc.cancelQueries({ queryKey: qk.tasks })
  const previous = qc.getQueryData<Task[]>(qk.tasks)
  qc.setQueryData<Task[]>(qk.tasks, (tasks) =>
    tasks?.map((task) => (task.id === id ? { ...task, ...patch } : task)),
  )
  return { previous }
}

function rollbackTasks(
  qc: ReturnType<typeof useQueryClient>,
  ctx: { previous?: Task[] } | undefined,
) {
  if (ctx?.previous) qc.setQueryData(qk.tasks, ctx.previous)
}

function settleTasks(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: qk.tasks })
  void qc.invalidateQueries({ queryKey: qk.projects })
}

export function useSetTaskStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: Task["status"] }) =>
      apiTasks.update(id, { status }),
    onMutate: ({ id, status }) => optimisticTaskPatch(qc, id, { status }),
    onError: (_error, _vars, ctx) => rollbackTasks(qc, ctx),
    onSettled: () => settleTasks(qc),
  })
}

export function useToggleSubtask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, done }: { id: number; done: boolean }) =>
      apiSubtasks.setDone(id, done),
    onMutate: async ({ id, done }) => {
      void qc.cancelQueries({ queryKey: qk.tasks })
      const previous = qc.getQueryData<Task[]>(qk.tasks)
      qc.setQueryData<Task[]>(qk.tasks, (tasks) =>
        tasks?.map((task) => ({
          ...task,
          subtasks: task.subtasks.map((sub) =>
            sub.id === id ? { ...sub, done: done ? 1 : 0 } : sub,
          ),
        })),
      )
      return { previous }
    },
    onError: (_error, _vars, ctx) => rollbackTasks(qc, ctx),
    onSettled: () => settleTasks(qc),
  })
}

export function useToggleFeito() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, done }: { id: number; done: boolean }) =>
      apiTasks.setFeito(id, done),
    onMutate: ({ id, done }) => optimisticTaskPatch(qc, id, { feita: done }),
    onError: (_error, _vars, ctx) => rollbackTasks(qc, ctx),
    onSettled: () => settleTasks(qc),
  })
}

export function useSaveProject() {
  const refresh = useRefreshData()
  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id?: number
      payload: Partial<Pick<Project, "name" | "scope" | "people" | "grupo">> & {
        status?: string
        collapsed?: 0 | 1
        links?: Array<{ kind: string; label: string; target: string; grupo?: string }>
      }
    }) =>
      id
        ? apiProjects.update(id, payload)
        : apiProjects.create(payload as Partial<Pick<Project, "name" | "scope" | "people" | "grupo">>),
    onSuccess: refresh,
  })
}

export function useDeleteProject() {
  const refresh = useRefreshData()
  return useMutation({
    mutationFn: (id: number) => apiProjects.remove(id),
    onSuccess: refresh,
  })
}

export function useSaveNote(projectId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      title,
      body,
    }: {
      id?: number
      title: string
      body: string
    }) =>
      id
        ? apiNotes.update(id, { title, body })
        : apiNotes.create(projectId, { title, body }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.notes(projectId) }),
  })
}

export function useDeleteNote(projectId: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiNotes.remove(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.notes(projectId) }),
  })
}

export function useUploadAttachment(
  ownerType: "task" | "project",
  ownerId: number | null,
) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      file,
      onProgress,
    }: {
      file: File
      onProgress?: (percent: number) => void
    }) => uploadAttachment(ownerType, ownerId ?? 0, file, onProgress),
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: qk.attachments(ownerType, ownerId ?? 0),
      })
      void qc.invalidateQueries({ queryKey: qk.tasks })
    },
  })
}

export function useDeleteAttachment(
  ownerType: "task" | "project",
  ownerId: number | null,
) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiAttachments.remove(id),
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: qk.attachments(ownerType, ownerId ?? 0),
      })
      void qc.invalidateQueries({ queryKey: qk.tasks })
    },
  })
}

export function useSaveAiConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: { openai_api_key?: string; name?: string }) =>
      apiAi.config(payload),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.aiStatus }),
  })
}

export function useAiParse() {
  return useMutation({ mutationFn: (text: string) => apiAi.parse(text) })
}

export function useAiWhatsapp() {
  return useMutation({
    mutationFn: ({ task, modo }: { task: Task; modo: "avisar" | "delegar" }) =>
      apiAi.whatsapp({ task, modo }),
  })
}

export type { Attachment, Note, Project, Task, TaskLink, TaskPayload }
