import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import type { FilterKey, SortKey, ViewKey } from "@/lib/tasks"
import type { Prioridade } from "@/lib/types"

const VIEW_STORAGE_KEY = "bomdia_view"

type ListViewContextValue = {
  filter: FilterKey
  setFilter: (value: FilterKey) => void
  prio: "todas" | Prioridade
  setPrio: (value: "todas" | Prioridade) => void
  sort: SortKey
  setSort: (value: SortKey) => void
  lateOnly: boolean
  setLateOnly: (value: boolean) => void
  search: string
  setSearch: (value: string) => void
  view: ViewKey
  setView: (value: ViewKey) => void
}

const ListViewContext = createContext<ListViewContextValue | null>(null)

function initialView(): ViewKey {
  try {
    const stored = localStorage.getItem(VIEW_STORAGE_KEY)
    if (stored === "cards" || stored === "lista" || stored === "kanban") return stored
  } catch {
    /* sem localStorage */
  }
  return "cards"
}

export function ListViewProvider({ children }: { children: ReactNode }) {
  const [filter, setFilter] = useState<FilterKey>("ativas")
  const [prio, setPrio] = useState<"todas" | Prioridade>("todas")
  const [sort, setSort] = useState<SortKey>("prioridade")
  const [lateOnly, setLateOnly] = useState(false)
  const [search, setSearch] = useState("")
  const [view, setViewState] = useState<ViewKey>(initialView)

  const setView = useCallback((value: ViewKey) => {
    setViewState(value)
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, value)
    } catch {
      /* sem localStorage */
    }
  }, [])

  const value = useMemo(
    () => ({
      filter,
      setFilter,
      prio,
      setPrio,
      sort,
      setSort,
      lateOnly,
      setLateOnly,
      search,
      setSearch,
      view,
      setView,
    }),
    [filter, prio, sort, lateOnly, search, view, setView],
  )

  return <ListViewContext.Provider value={value}>{children}</ListViewContext.Provider>
}

export function useListView() {
  const ctx = useContext(ListViewContext)
  if (!ctx) throw new Error("useListView precisa do ListViewProvider")
  return ctx
}
