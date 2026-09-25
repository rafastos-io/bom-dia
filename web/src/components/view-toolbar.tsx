import { NativeSelect, NativeSelectOption } from "@rafastos/ui/native-select"
import { cn } from "cn"
import { Columns3, LayoutGrid, List, Repeat2, TriangleAlert } from "lucide-react"
import { useMemo } from "react"
import { Chip } from "@/components/app/chip"
import { SearchField } from "@/components/app/search-field"
import { useProjects } from "@/lib/queries"
import { useListView, type OrigemFilter } from "./list-view"
import { PRIO_LABEL, type FilterKey, type SortKey, type ViewKey } from "@/lib/tasks"
import type { Prioridade } from "@/lib/types"

const STATUS_FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: "ativas", label: "Ativas" },
  { key: "todas", label: "Todas" },
  { key: "concluida", label: "Concluídas" },
]

const ORIGENS: Array<{ key: OrigemFilter; label: string }> = [
  { key: "todas", label: "Tudo" },
  { key: "central", label: "Da CENTRAL" },
  { key: "manuais", label: "Manuais" },
]

const VIEWS: Array<{ key: ViewKey; label: string; icon: typeof LayoutGrid }> = [
  { key: "cards", label: "Cards", icon: LayoutGrid },
  { key: "lista", label: "Lista", icon: List },
  { key: "kanban", label: "Kanban", icon: Columns3 },
]

const PRIOS: Array<"todas" | Prioridade> = ["todas", "alta", "media", "baixa"]

const SORTS: Array<{ key: SortKey; label: string }> = [
  { key: "prioridade", label: "Prioridade & prazo" },
  { key: "prazo", label: "Prazo" },
  { key: "criacao", label: "Mais recentes" },
  { key: "az", label: "A-Z" },
]

export function ViewToolbar({
  className,
  hideViewToggle,
}: {
  className?: string
  hideViewToggle?: boolean
}) {
  const view = useListView()
  const projects = useProjects()
  const grupos = useMemo(() => {
    const names = new Set<string>()
    for (const project of projects.data ?? []) {
      const grupo = (project.grupo ?? "").trim()
      if (grupo) names.add(grupo)
    }
    return [...names].sort((a, b) => a.localeCompare(b, "pt-BR"))
  }, [projects.data])

  return (
    <div className={cn("flex flex-col gap-rf-3", className)}>
      <div className="flex flex-wrap items-center gap-rf-2">
        <div
          className={cn(
            "flex flex-wrap items-center gap-rf-1",
            view.view === "kanban" && "pointer-events-none opacity-40",
          )}
          aria-disabled={view.view === "kanban"}
        >
          {STATUS_FILTERS.map((item) => (
            <Chip
              key={item.key}
              active={view.filter === item.key}
              onClick={() => view.setFilter(item.key)}
            >
              {item.label}
            </Chip>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-rf-1">
          {ORIGENS.map((item) => (
            <Chip
              key={item.key}
              active={view.origem === item.key}
              onClick={() => view.setOrigem(item.key)}
            >
              {item.label}
            </Chip>
          ))}
        </div>

        <div
          id="viewToggle"
          className={cn(
            "ml-auto items-center gap-1 rounded-full bg-[var(--rf-hover)] p-1",
            view.view === "kanban" && "pointer-events-none opacity-40",
            hideViewToggle ? "hidden" : "inline-flex",
          )}
          role="group"
          aria-label="Modo de visualização"
        >
          {VIEWS.map((item) => (
            <button
              key={item.key}
              type="button"
              aria-label={item.label}
              aria-pressed={view.view === item.key}
              title={item.label}
              onClick={() => view.setView(item.key)}
              className={cn(
                "inline-flex size-7 items-center justify-center rounded-full transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                view.view === item.key
                  ? "app-pill-active"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <item.icon className="size-3.5" aria-hidden />
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-rf-2">
        <div className="flex flex-wrap items-center gap-rf-1">
          {PRIOS.map((prio) => (
            <Chip
              key={prio}
              active={view.prio === prio}
              tone={
                prio === "todas"
                  ? undefined
                  : prio === "alta"
                    ? "pink"
                    : prio === "media"
                      ? "amber"
                      : "green"
              }
              onClick={() => view.setPrio(prio)}
            >
              {prio === "todas" ? "Todas" : PRIO_LABEL[prio]}
            </Chip>
          ))}
          <Chip active={view.lateOnly} onClick={() => view.setLateOnly(!view.lateOnly)}>
            <TriangleAlert
              className={cn("size-3.5", view.lateOnly && "text-[var(--rf-error)]")}
              aria-hidden
            />
            Atrasadas
          </Chip>
          <Chip
            active={view.recurringOnly}
            onClick={() => view.setRecurringOnly(!view.recurringOnly)}
          >
            <Repeat2 className="size-3.5" aria-hidden />
            Recorrentes
          </Chip>
        </div>

        {grupos.length ? (
          <NativeSelect
            size="sm"
            className="w-44 shrink-0"
            aria-label="Filtrar por grupo"
            value={view.grupo}
            onChange={(event) => view.setGrupo(event.target.value)}
          >
            <NativeSelectOption value="todos">Todos os grupos</NativeSelectOption>
            {grupos.map((name) => (
              <NativeSelectOption key={name} value={name}>
                {name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        ) : null}

        <NativeSelect
          size="sm"
          className="ml-auto w-44 shrink-0"
          aria-label="Ordenar por"
          value={view.sort}
          onChange={(event) => view.setSort(event.target.value as SortKey)}
        >
          {SORTS.map((item) => (
            <NativeSelectOption key={item.key} value={item.key}>
              {item.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>

        <SearchField
          value={view.search}
          onChange={(value) => view.setSearch(value)}
          placeholder="Buscar..."
          className="w-full min-w-40 flex-1 sm:max-w-64"
        />
      </div>
    </div>
  )
}
