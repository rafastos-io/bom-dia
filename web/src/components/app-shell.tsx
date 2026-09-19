import { Button } from "@rafastos/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@rafastos/ui/popover"
import { Toaster } from "@rafastos/ui/sonner"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@rafastos/ui/tooltip"
import { cn } from "cn"
import { Bell, LogOut, Moon, Settings2, Sun } from "lucide-react"
import { motion, useReducedMotion } from "motion/react"
import { useMemo, useState } from "react"
import { NavLink, Outlet, useLocation, useNavigate } from "react-router"
import { AREAS, type AreaDef, type AreaId } from "@/lib/areas"
import { rfSlideUp, rfTransition } from "@/lib/motion"
import { useProjects, useTasks } from "@/lib/queries"
import { archivedIndex, areaCounts, fmtDate, isTaskHidden } from "@/lib/tasks"
import { CommandPalette } from "./app/command-palette"
import { Dot } from "./app/dot"
import { MascotAvatar } from "./app/mascot"
import { SearchField } from "./app/search-field"
import { ListViewProvider } from "./list-view"
import { useOverlays } from "./overlay-provider"
import { SettingsDialog } from "./settings-dialog"
import { useTheme } from "./theme-provider"

function useAreaCounts(): Record<AreaId, number> {
  const tasks = useTasks()
  const projects = useProjects()
  const archived = useMemo(() => archivedIndex(projects.data ?? []), [projects.data])
  return useMemo(
    () => areaCounts(tasks.data ?? [], archived, "hoje"),
    [tasks.data, archived],
  )
}

function IconTooltip({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  )
}

/** Item do rail escuro (só ícone, com contador em bubble e tooltip). */
function RailItem({ area, count }: { area: AreaDef; count: number }) {
  return (
    <IconTooltip label={area.label}>
      <NavLink
        to={area.path}
        end={area.path === "/"}
        aria-label={`${area.label}${count ? ` (${count})` : ""}`}
        className={({ isActive }) =>
          cn(
            "relative flex size-11 items-center justify-center rounded-[var(--rf-radius-card)] outline-none transition-colors",
            "focus-visible:ring-3 focus-visible:ring-ring/50",
            isActive
              ? "bg-[var(--app-rail-active-bg)] text-[var(--app-rail-active-fg)]"
              : "text-[var(--app-rail-muted)] hover:bg-[var(--app-rail-active-bg)]/60 hover:text-[var(--app-rail-active-fg)]",
          )
        }
      >
        <area.icon className="size-5" strokeWidth={2} aria-hidden />
        {count > 0 ? (
          <span className="absolute top-1.5 right-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-action px-1 font-mono text-[10px] leading-none text-action-foreground">
            {count}
          </span>
        ) : null}
      </NavLink>
    </IconTooltip>
  )
}

function TabBarItem({ area, count }: { area: AreaDef; count: number }) {
  return (
    <NavLink
      to={area.path}
      end={area.path === "/"}
      className={({ isActive }) =>
        cn(
          "relative flex h-16 flex-col items-center justify-center gap-1 outline-none",
          isActive ? "text-foreground" : "text-muted-foreground",
        )
      }
    >
      {({ isActive }) => (
        <>
          <span
            className={cn(
              "absolute top-0 h-0.5 w-8 rounded-full transition-opacity",
              isActive ? "bg-action opacity-100" : "opacity-0",
            )}
            aria-hidden
          />
          <span className="relative">
            <area.icon className="size-6" strokeWidth={2} aria-hidden />
            {count > 0 ? (
              <span className="absolute -top-1.5 -right-2.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-action px-1 font-mono text-[10px] leading-none text-action-foreground">
                {count}
              </span>
            ) : null}
          </span>
          <span className={cn("text-[11px] leading-none", isActive && "font-semibold")}>
            {area.label}
          </span>
        </>
      )}
    </NavLink>
  )
}

/** Sino de prazos: atrasadas + vencendo hoje/amanhã (client-side). */
function DueAlerts() {
  const tasks = useTasks()
  const projects = useProjects()
  const overlays = useOverlays()

  const alerts = useMemo(() => {
    const archived = archivedIndex(projects.data ?? [])
    const active = (tasks.data ?? []).filter(
      (task) => task.status !== "concluida" && !isTaskHidden(task, archived, null),
    )
    const today = new Date().toISOString().slice(0, 10)
    const tomorrowDate = new Date()
    tomorrowDate.setDate(tomorrowDate.getDate() + 1)
    const tomorrow = tomorrowDate.toISOString().slice(0, 10)

    const byDue = (a: { due_date: string }, b: { due_date: string }) =>
      a.due_date.localeCompare(b.due_date)
    const overdue = active
      .filter((task) => task.due_date && task.due_date.slice(0, 10) < today)
      .sort(byDue)
    const dueToday = active.filter((task) => task.due_date?.slice(0, 10) === today)
    const dueTomorrow = active.filter((task) => task.due_date?.slice(0, 10) === tomorrow)
    return { overdue, dueToday, dueTomorrow, count: overdue.length + dueToday.length }
  }, [tasks.data, projects.data])

  const sections = [
    { key: "overdue", title: "Atrasadas", tone: "pink" as const, items: alerts.overdue },
    { key: "today", title: "Vencem hoje", tone: "amber" as const, items: alerts.dueToday },
    { key: "tomorrow", title: "Amanhã", tone: "blue" as const, items: alerts.dueTomorrow },
  ].filter((section) => section.items.length)

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Prazos${alerts.count ? ` (${alerts.count})` : ""}`}
          className="relative"
        >
          <Bell aria-hidden />
          {alerts.count ? (
            <span className="absolute -top-0.5 -right-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-action px-1 font-mono text-[10px] leading-none text-action-foreground">
              {alerts.count}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-rf-4">
        <p className="rf-label text-foreground">Prazos</p>
        {sections.length ? (
          <div className="flex flex-col gap-rf-3 pt-rf-3">
            {sections.map((section) => (
              <div key={section.key} className="flex flex-col gap-rf-1">
                <span className="flex items-center gap-rf-2 rf-caption text-muted-foreground">
                  <Dot tone={section.tone} />
                  {section.title} · {section.items.length}
                </span>
                <ul className="flex flex-col">
                  {section.items.slice(0, 5).map((task) => (
                    <li key={task.id}>
                      <button
                        type="button"
                        onClick={() => overlays.openTask(task.id)}
                        className="flex w-full min-w-0 items-center gap-rf-2 rounded-[var(--rf-radius-control)] px-rf-2 py-rf-1.5 text-left outline-none hover:bg-[var(--rf-hover)]/60 focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        <span className="min-w-0 flex-1 truncate rf-caption text-foreground">
                          {task.title}
                        </span>
                        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                          {fmtDate(task.due_date)}
                        </span>
                      </button>
                    </li>
                  ))}
                  {section.items.length > 5 ? (
                    <li className="px-rf-2 rf-caption text-muted-foreground">
                      +{section.items.length - 5} nesta lista
                    </li>
                  ) : null}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <p className="pt-rf-2 rf-caption text-muted-foreground">
            Nada atrasado e nada vencendo hoje. 🎉
          </p>
        )}
      </PopoverContent>
    </Popover>
  )
}

export function AppShell() {
  const counts = useAreaCounts()
  const { resolved: theme, toggleTheme } = useTheme()
  const location = useLocation()
  const reduceMotion = useReducedMotion()
  const navigate = useNavigate()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsSeq, setSettingsSeq] = useState(0)
  const [query, setQuery] = useState("")

  const openSettings = () => {
    setSettingsSeq((seq) => seq + 1)
    setSettingsOpen(true)
  }

  const submitSearch = (value: string) => {
    const term = value.trim()
    navigate(term ? `/?q=${encodeURIComponent(term)}` : "/")
  }

  const themeButton = () => (
    <IconTooltip label={theme === "dark" ? "Usar tema claro" : "Usar tema escuro"}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={theme === "dark" ? "Usar tema claro" : "Usar tema escuro"}
        onClick={toggleTheme}
      >
        {theme === "dark" ? <Sun aria-hidden /> : <Moon aria-hidden />}
      </Button>
    </IconTooltip>
  )

  return (
    <TooltipProvider delayDuration={400}>
      <ListViewProvider>
        <div className="min-h-dvh bg-[var(--rf-bg)]">
          {/* Rail escuro — desktop */}
          <aside className="app-rail fixed inset-y-0 left-0 z-40 hidden w-[76px] flex-col items-center border-r border-[var(--app-rail-border)] py-rf-4 min-[860px]:flex">
            <NavLink
              to="/"
              aria-label="Bom Dia — Hoje"
              className="mb-rf-5 flex size-11 items-center justify-center rounded-[var(--rf-radius-card)] outline-none transition-colors hover:bg-[var(--app-rail-active-bg)]/60"
            >
              <Sun className="size-6 text-[var(--app-dot-amber)]" strokeWidth={2} aria-hidden />
            </NavLink>

            <nav aria-label="Áreas do Bom Dia" className="flex flex-1 flex-col items-center gap-rf-1">
              {AREAS.map((area) => (
                <RailItem key={area.id} area={area} count={counts[area.id]} />
              ))}
            </nav>

            <div className="flex flex-col items-center gap-rf-1">
              {themeButton()}
              <IconTooltip label="Ajustes">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Ajustes"
                  onClick={openSettings}
                  className="text-[var(--app-rail-muted)] hover:text-[var(--app-rail-active-fg)]"
                >
                  <Settings2 aria-hidden />
                </Button>
              </IconTooltip>
              <IconTooltip label="Sair">
                <form method="post" action="/logout">
                  <Button
                    type="submit"
                    variant="ghost"
                    size="icon"
                    aria-label="Sair"
                    className="text-[var(--app-rail-muted)] hover:text-[var(--app-rail-active-fg)]"
                  >
                    <LogOut aria-hidden />
                  </Button>
                </form>
              </IconTooltip>
            </div>
          </aside>

          {/* Topbar */}
          <header className="sticky top-0 z-30 border-b border-[var(--rf-border)] bg-[color-mix(in_srgb,var(--rf-bg)_82%,transparent)] pt-[env(safe-area-inset-top)] backdrop-blur-xl min-[860px]:pl-[76px]">
            <div className="flex items-center gap-rf-3 px-rf-4 py-rf-3">
              <div className="flex min-w-0 items-center gap-rf-2 min-[860px]:w-[224px]">
                <Sun
                  className="size-5 shrink-0 text-[var(--app-dot-amber)] min-[860px]:hidden"
                  strokeWidth={2}
                  aria-hidden
                />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-semibold tracking-tight text-foreground">
                    Bom Dia
                  </span>
                  <span className="hidden truncate rf-caption text-muted-foreground min-[1100px]:block">
                    Planeje hoje. Construa amanhã.
                  </span>
                </span>
              </div>

              <SearchField
                value={query}
                onChange={setQuery}
                onSubmit={submitSearch}
                placeholder="Buscar tarefas, projetos ou ideias..."
                shortcut="⌘K"
                className="mx-auto hidden max-w-md flex-1 md:flex"
              />

              <div className="ml-auto flex items-center gap-rf-1">
                <DueAlerts />
                <span className="min-[860px]:hidden">{themeButton()}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Ajustes"
                  onClick={openSettings}
                  className="min-[860px]:hidden"
                >
                  <Settings2 aria-hidden />
                </Button>
                <MascotAvatar className="size-9" />
              </div>
            </div>
          </header>

          {/* Conteúdo */}
          <main className="min-[860px]:pl-[76px]">
            <motion.div
              key={location.pathname}
              initial={reduceMotion ? false : "initial"}
              animate="animate"
              variants={rfSlideUp}
              transition={rfTransition.default}
              className="mx-auto flex min-w-0 w-full max-w-[1280px] flex-col gap-rf-5 px-rf-4 pt-rf-5 pb-[calc(96px+env(safe-area-inset-bottom))] min-[860px]:px-rf-6 min-[860px]:py-rf-6"
            >
              <Outlet />
            </motion.div>
          </main>

          {/* Tab bar — mobile */}
          <nav
            aria-label="Áreas do Bom Dia"
            className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-[var(--rf-border)] bg-[color-mix(in_srgb,var(--rf-bg)_88%,transparent)] pb-[env(safe-area-inset-bottom)] backdrop-blur-xl min-[860px]:hidden"
          >
            {AREAS.map((area) => (
              <TabBarItem key={area.id} area={area} count={counts[area.id]} />
            ))}
          </nav>

          <SettingsDialog
            key={`settings-${settingsSeq}`}
            open={settingsOpen}
            onOpenChange={setSettingsOpen}
          />
          <CommandPalette />
          <Toaster position="bottom-center" />
        </div>
      </ListViewProvider>
    </TooltipProvider>
  )
}
