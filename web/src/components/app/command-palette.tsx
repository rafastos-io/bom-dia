import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@rafastos/ui/dialog"
import { Input } from "@rafastos/ui/input"
import {
  CalendarDays,
  Folder,
  LayoutGrid,
  Lightbulb,
  ListChecks,
  Moon,
  Plus,
  Repeat2,
  Search,
  Sparkles,
  Sun,
} from "lucide-react"
import { useEffect, useMemo, useRef, useState, type ComponentType } from "react"
import { useNavigate } from "react-router"
import { useOverlays } from "@/components/overlay-provider"
import { useTheme } from "@/components/theme-provider"
import { AREAS, RADAR } from "@/lib/areas"
import { useProjects, useTasks } from "@/lib/queries"
import { cn } from "@/lib/utils"

type PaletteItem = {
  id: string
  label: string
  hint?: string
  group: string
  icon: ComponentType<{ className?: string; strokeWidth?: number; "aria-hidden"?: boolean }>
  run: () => void
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
}

/** ⌘K: busca global e ações rápidas. */
export function CommandPalette() {
  const navigate = useNavigate()
  const overlays = useOverlays()
  const tasks = useTasks()
  const projects = useProjects()
  const { resolved, toggleTheme } = useTheme()

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setOpen((current) => !current)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  const items = useMemo<PaletteItem[]>(() => {
    const actions: PaletteItem[] = [
      {
        id: "action-new-task",
        label: "Nova tarefa",
        group: "Ações",
        icon: Plus,
        run: () => overlays.openTask(null, { tipo: "tarefa" }),
      },
      {
        id: "action-assistant",
        label: "Abrir Poohzera",
        group: "Ações",
        icon: Sparkles,
        run: () => overlays.openAssistant(),
      },
      {
        id: "action-theme",
        label: resolved === "dark" ? "Usar tema claro" : "Usar tema escuro",
        group: "Ações",
        icon: resolved === "dark" ? Sun : Moon,
        run: toggleTheme,
      },
    ]

    const areas: PaletteItem[] = [
      ...AREAS.map((area) => ({
        id: `area-${area.id}`,
        label: area.label,
        hint: "Ir para",
        group: "Áreas",
        icon: LayoutGrid,
        run: () => navigate(area.path),
      })),
      {
        id: "area-radar",
        label: RADAR.label,
        hint: "Ir para",
        group: "Áreas",
        icon: RADAR.icon,
        run: () => navigate(RADAR.path),
      },
    ]

    const taskItems: PaletteItem[] = (tasks.data ?? []).map((task) => ({
      id: `task-${task.id}`,
      label: task.title,
      hint: task.tipo === "ideia" ? "Ideia" : task.tipo === "rotina" ? "Rotina" : "Tarefa",
      group: "Tarefas",
      icon: task.tipo === "ideia" ? Lightbulb : task.tipo === "rotina" ? Repeat2 : ListChecks,
      run: () => overlays.openTask(task.id),
    }))

    const projectItems: PaletteItem[] = (projects.data ?? []).map((project) => ({
      id: `project-${project.id}`,
      label: project.name,
      hint: `${project.task_ativas} ativa${project.task_ativas === 1 ? "" : "s"}`,
      group: "Projetos",
      icon: Folder,
      run: () => navigate(`/projetos?proj=${encodeURIComponent(project.name)}`),
    }))

    return [...actions, ...areas, ...taskItems, ...projectItems]
  }, [navigate, overlays, projects.data, resolved, tasks.data, toggleTheme])

  const filtered = useMemo(() => {
    const term = normalize(query.trim())
    if (!term) return items.slice(0, 24)
    return items.filter((item) => normalize(`${item.label} ${item.hint ?? ""}`).includes(term)).slice(0, 24)
  }, [items, query])

  const activeIndex = Math.min(active, Math.max(0, filtered.length - 1))

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" })
  }, [activeIndex])

  const execute = (item: PaletteItem) => {
    setOpen(false)
    item.run()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) {
          setQuery("")
          setActive(0)
        }
      }}
    >
      <DialogContent
        className="top-[12%] max-w-lg translate-y-0 gap-0 p-0 sm:max-w-lg"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">Busca e ações</DialogTitle>
        <DialogDescription className="sr-only">
          Busque tarefas, projetos e áreas ou execute ações rápidas
        </DialogDescription>

        <div className="relative border-b border-[var(--rf-border)]">
          <Search
            className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground"
            strokeWidth={2}
            aria-hidden
          />
          <Input
            autoFocus
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setActive(0)
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault()
                setActive((current) => Math.min(current + 1, filtered.length - 1))
              } else if (event.key === "ArrowUp") {
                event.preventDefault()
                setActive((current) => Math.max(current - 1, 0))
              } else if (event.key === "Enter") {
                event.preventDefault()
                const item = filtered[activeIndex]
                if (item) execute(item)
              }
            }}
            placeholder="Buscar tarefas, projetos, áreas ou ações..."
            aria-label="Busca e ações"
            className="h-12 rounded-none border-0 bg-transparent pl-11 text-base shadow-none focus-visible:ring-0"
          />
        </div>

        <ul ref={listRef} className="max-h-[52vh] overflow-y-auto p-rf-2" role="listbox">
          {filtered.map((item, index) => (
            <li key={item.id}>
              <button
                type="button"
                data-index={index}
                role="option"
                aria-selected={index === activeIndex}
                onMouseEnter={() => setActive(index)}
                onClick={() => execute(item)}
                className={cn(
                  "flex w-full items-center gap-rf-3 rounded-[var(--rf-radius-control)] px-rf-3 py-rf-2 text-left outline-none",
                  index === activeIndex ? "bg-[var(--rf-hover)]" : "hover:bg-[var(--rf-hover)]/60",
                )}
              >
                <item.icon className="size-4 shrink-0 text-muted-foreground" strokeWidth={2} aria-hidden />
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">{item.label}</span>
                {item.hint ? (
                  <span className="shrink-0 rf-caption text-muted-foreground">{item.hint}</span>
                ) : null}
              </button>
            </li>
          ))}
          {!filtered.length ? (
            <li className="px-rf-3 py-rf-4 text-center rf-caption text-muted-foreground">
              Nada encontrado para “{query}”.
            </li>
          ) : null}
        </ul>

        <div className="flex items-center gap-rf-3 border-t border-[var(--rf-border)] px-rf-4 py-rf-2 rf-caption text-muted-foreground">
          <span className="flex items-center gap-rf-1">
            <CalendarDays className="size-3.5" aria-hidden /> ↑↓ navegar
          </span>
          <span>Enter abrir</span>
          <span className="ml-auto">⌘K fecha</span>
        </div>
      </DialogContent>
    </Dialog>
  )
}
