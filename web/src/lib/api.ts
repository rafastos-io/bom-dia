import type {
  AiStatus,
  Attachment,
  Note,
  ParsedPayload,
  Project,
  Task,
  TaskPayload,
  WhatsappPayload,
  WhatsappResult,
} from "./types"

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** Sessão expirada: manda para o login — sem loop quando já estamos nele. */
function redirectToLogin() {
  if (!window.location.pathname.startsWith("/login")) {
    window.location.assign("/login")
  }
}

export async function api<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {  const res = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  if (res.status === 401) {
    redirectToLogin()
    throw new ApiError(401, "Sessão expirada")
  }

  if (!res.ok) {
    let detail = ""
    try {
      const data = (await res.json()) as { error?: string }
      detail = data.error ?? ""
    } catch {
      /* corpo não-JSON */
    }
    throw new ApiError(res.status, detail || `Erro ${res.status}`)
  }

  const text = await res.text()
  return (text ? JSON.parse(text) : undefined) as T
}

export const apiTasks = {
  list: () => api<Task[]>("GET", "/api/tasks"),
  create: (payload: TaskPayload) => api<Task>("POST", "/api/tasks", payload),
  update: (id: number, payload: Partial<TaskPayload> & { status?: string }) =>
    api<Task>("PUT", `/api/tasks/${id}`, payload),
  remove: (id: number) => api<void>("DELETE", `/api/tasks/${id}`),
  setFeito: (id: number, done: boolean) =>
    api<Task>("POST", `/api/tasks/${id}/feito`, { done }),
}

export const apiSubtasks = {
  setDone: (id: number, done: boolean) =>
    api<unknown>("PUT", `/api/subtasks/${id}`, { done: done ? 1 : 0 }),
}

export const apiProjects = {
  list: () => api<Project[]>("GET", "/api/projects"),
  create: (payload: Partial<Pick<Project, "name" | "scope" | "people">>) =>
    api<{ id: number }>("POST", "/api/projects", payload),
  update: (
    id: number,
    payload: Partial<{
      name: string
      scope: string
      people: string
      status: string
      collapsed: 0 | 1
      links: Array<{ kind: string; label: string; target: string; grupo?: string }>
    }>,
  ) => api<unknown>("PUT", `/api/projects/${id}`, payload),
  remove: (id: number) => api<void>("DELETE", `/api/projects/${id}`),
}

export const apiNotes = {
  list: (projectId: number) => api<Note[]>("GET", `/api/projects/${projectId}/notes`),
  create: (projectId: number, payload: { title: string; body: string }) =>
    api<{ id: number }>("POST", `/api/projects/${projectId}/notes`, payload),
  update: (id: number, payload: { title?: string; body?: string }) =>
    api<unknown>("PUT", `/api/notes/${id}`, payload),
  remove: (id: number) => api<void>("DELETE", `/api/notes/${id}`),
}

export const apiAttachments = {
  list: (ownerType: "task" | "project", ownerId: number) =>
    api<{ attachments: Attachment[] }>(
      "GET",
      `/api/attachments?owner_type=${ownerType}&owner_id=${ownerId}`,
    ).then((res) => res.attachments ?? []),
  remove: (id: number) => api<void>("DELETE", `/api/attachments/${id}`),
  downloadUrl: (id: number) => `/api/attachments/${id}/download`,
}

export function uploadAttachment(
  ownerType: "task" | "project",
  ownerId: number,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<Attachment> {
  return new Promise((resolve, reject) => {
    const form = new FormData()
    form.append("owner_type", ownerType)
    form.append("owner_id", String(ownerId))
    form.append("file", file)

    const xhr = new XMLHttpRequest()
    xhr.open("POST", "/api/attachments")
    xhr.withCredentials = true
    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100))
      }
    })
    xhr.addEventListener("load", () => {
      if (xhr.status === 401) {
        redirectToLogin()
        return
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as Attachment)
        } catch {
          reject(new ApiError(xhr.status, "Resposta inválida do upload"))
        }
        return
      }
      let detail = ""
      try {
        detail = (JSON.parse(xhr.responseText) as { error?: string }).error ?? ""
      } catch {
        /* corpo não-JSON */
      }
      reject(new ApiError(xhr.status, detail || `Erro ${xhr.status} no upload`))
    })
    xhr.addEventListener("error", () =>
      reject(new ApiError(0, "Falha de rede no upload")),
    )
    xhr.send(form)
  })
}

export const apiAi = {
  status: () => api<AiStatus>("GET", "/api/ai/status"),
  config: (payload: { openai_api_key?: string; name?: string }) =>
    api<{ ok?: boolean; configured: boolean; name: string }>(
      "POST",
      "/api/ai/config",
      payload,
    ),
  parse: (text: string) => api<ParsedPayload>("POST", "/api/ai/parse", { text }),
  whatsapp: (payload: WhatsappPayload) =>
    api<WhatsappResult>("POST", "/api/ai/whatsapp", payload),
}

export const apiOpen = {
  path: (target: string) =>
    api<{ ok: boolean; message?: string }>("POST", "/api/open", { path: target }),
}
