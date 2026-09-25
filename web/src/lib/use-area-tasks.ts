import { useMemo } from "react"
import { useListView } from "@/components/list-view"
import { useProjects, useTasks } from "@/lib/queries"
import {
  archivedIndex,
  matchesFilters,
  sortTasks,
} from "@/lib/tasks"
import type { AreaId } from "@/lib/areas"

export function useAreaTasks(area: AreaId, openProject: string | null = null) {
  const tasks = useTasks()
  const projects = useProjects()
  const view = useListView()

  const archived = useMemo(
    () => archivedIndex(projects.data ?? []),
    [projects.data],
  )

  const groups = useMemo(
    () =>
      new Map(
        (projects.data ?? []).map((project) => [
          project.name.trim().toLowerCase(),
          (project.grupo ?? "").trim(),
        ]),
      ),
    [projects.data],
  )

  const list = useMemo(() => {
    const filtered = (tasks.data ?? [])
      .filter((task) =>
        matchesFilters(
          task,
          {
            area,
            openProject,
            archived,
            filter: view.filter,
            prio: view.prio,
            lateOnly: view.lateOnly,
            search: view.search,
            origem: view.origem,
            grupo: view.grupo,
            groups,
            tag: view.tag,
          },
          { ignoreStatus: view.view === "kanban" },
        ),
      )
      .filter((task) => !view.recurringOnly || Boolean(task.recorrencia))
    return sortTasks(filtered, view.sort)
  }, [
    tasks.data,
    archived,
    area,
    openProject,
    view.filter,
    view.prio,
    view.lateOnly,
    view.recurringOnly,
    view.origem,
    view.grupo,
    view.tag,
    groups,
    view.search,
    view.sort,
    view.view,
  ])

  return { tasks, projects, view, list, archived }
}
