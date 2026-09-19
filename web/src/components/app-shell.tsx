import { Button } from "@rafastos/ui/button"
import { Toaster } from "@rafastos/ui/sonner"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@rafastos/ui/tooltip"
import { cn } from "cn"
import { LogOut, Moon, Settings2, Sun } from "lucide-react"
import { useMemo, useState } from "react"
import { NavLink, Outlet, useNavigate } from "react-router"
import { AREAS, type AreaDef, type AreaId } from "@/lib/areas"
import { useProjects, useTasks } from "@/lib/queries"
import { archivedIndex, areaCounts } from "@/lib/tasks"
import { MascotAvatar } from "./app/mascot"
import { SearchField } from "./app/search-field"
import { ListViewProvider } from "./list-view"
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

export function AppShell() {
  const counts = useAreaCounts()
  const { resolved: theme, toggleTheme } = useTheme()
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
            <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-rf-5 px-rf-4 pt-rf-5 pb-[calc(96px+env(safe-area-inset-bottom))] min-[860px]:px-rf-6 min-[860px]:py-rf-6">
              <Outlet />
            </div>
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
          <Toaster position="bottom-center" />
        </div>
      </ListViewProvider>
    </TooltipProvider>
  )
}
