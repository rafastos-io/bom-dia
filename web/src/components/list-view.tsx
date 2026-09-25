import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { useLocation } from "react-router"
import type { FilterKey, SortKey, ViewKey } from "@/lib/tasks"
import type { Prioridade } from "@/lib/types"

const VIEWS_STORAGE_KEY = "bomdia_views_v2"
const LEGACY_VIEW_KEY = "bomdia_view"

type AreaKey = "hoje" | "agenda" | "rotina" | "ideias" | "projetos"

export type OrigemFilter = "todas" | "central" | "manuais"

type PersistedView = {
  filter: FilterKey
  prio: "todas" | Prioridade
  sort: SortKey
  lateOnly: boolean
  recurringOnly: boolean
  origem: OrigemFilter
  grupo: string
  view: ViewKey
}

const DEFAULTS: PersistedView = {
  filter: "ativas",
  prio: "todas",
  sort: "prioridade",
  lateOnly: false,
  recurringOnly: false,
  origem: "todas",
  grupo: "todos",
  view: "cards",
}

type ListViewContextValue = PersistedView & {
  setFilter: (value: FilterKey) => void
  setPrio: (value: "todas" | Prioridade) => void
  setSort: (value: SortKey) => void
  setLateOnly: (value: boolean) => void
  setRecurringOnly: (value: boolean) => void
  setOrigem: (value: OrigemFilter) => void
  setGrupo: (value: string) => void
  setSearch: (value: string) => void
  setView: (value: ViewKey) => void
  search: string
  /** Área atual (chave das visões salvas). */
  area: AreaKey
}

const ListViewContext = createContext<ListViewContextValue | null>(null)

function areaFromPath(pathname: string): AreaKey {
  if (pathname.startsWith("/agenda")) return "agenda"
  if (pathname.startsWith("/rotina")) return "rotina"
  if (pathname.startsWith("/ideias")) return "ideias"
  if (pathname.startsWith("/projetos")) return "projetos"
  return "hoje"
}

function defaultView(): ViewKey {
  try {
    const legacy = localStorage.getItem(LEGACY_VIEW_KEY)
    if (legacy === "cards" || legacy === "lista" || legacy === "kanban") return legacy
  } catch {
    /* sem localStorage */
  }
  return DEFAULTS.view
}

function loadViews(): Record<string, PersistedView> {
  const fallback = { ...DEFAULTS, view: defaultView() }
  try {
    const raw = localStorage.getItem(VIEWS_STORAGE_KEY)
    if (!raw) return { hoje: fallback }
    const parsed = JSON.parse(raw) as Record<string, Partial<PersistedView>>
    const out: Record<string, PersistedView> = {}
    for (const [key, value] of Object.entries(parsed)) {
      out[key] = { ...DEFAULTS, ...value }
    }
    return out
  } catch {
    return { hoje: fallback }
  }
}

/** Visão, filtros e ordenação por área (persistidos em localStorage). */
export function ListViewProvider({ children }: { children: ReactNode }) {
  const location = useLocation()
  const area = areaFromPath(location.pathname)

  const [views, setViews] = useState<Record<string, PersistedView>>(loadViews)
  const [search, setSearch] = useState("")

  const current = views[area] ?? DEFAULTS

  const patch = useCallback(
    (changes: Partial<PersistedView>) => {
      setViews((previous) => {
        const next = {
          ...previous,
          [area]: { ...DEFAULTS, ...previous[area], ...changes },
        }
        try {
          localStorage.setItem(VIEWS_STORAGE_KEY, JSON.stringify(next))
        } catch {
          /* sem localStorage */
        }
        return next
      })
    },
    [area],
  )

  const value = useMemo(
    () => ({
      filter: current.filter,
      setFilter: (value: FilterKey) => patch({ filter: value }),
      prio: current.prio,
      setPrio: (value: "todas" | Prioridade) => patch({ prio: value }),
      sort: current.sort,
      setSort: (value: SortKey) => patch({ sort: value }),
      lateOnly: current.lateOnly,
      setLateOnly: (value: boolean) => patch({ lateOnly: value }),
      recurringOnly: current.recurringOnly,
      setRecurringOnly: (value: boolean) => patch({ recurringOnly: value }),
      origem: current.origem,
      setOrigem: (value: OrigemFilter) => patch({ origem: value }),
      grupo: current.grupo,
      setGrupo: (value: string) => patch({ grupo: value }),
      view: current.view,
      setView: (value: ViewKey) => patch({ view: value }),
      search,
      setSearch,
      area,
    }),
    [area, current, patch, search],
  )

  return <ListViewContext.Provider value={value}>{children}</ListViewContext.Provider>
}

export function useListView() {
  const ctx = useContext(ListViewContext)
  if (!ctx) throw new Error("useListView precisa do ListViewProvider")
  return ctx
}
