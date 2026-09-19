import { Button } from "@rafastos/ui/button"
import { CalendarDays, ChevronRight, Plus, Sparkles } from "lucide-react"
import { useMemo } from "react"
import { Dot, toneFromKey } from "@/components/app/dot"
import { Panel } from "@/components/app/panel"
import { ScreenHeader } from "@/components/app/screen-header"
import { useOverlays } from "@/components/overlay-provider"
import { useAiStatus, useProjects, useTasks } from "@/lib/queries"
import {
  archivedIndex,
  fmtDate,
  greetWord,
  isLate,
  isTaskHidden,
  sortTasks,
} from "@/lib/tasks"

const WEEKDAYS = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
] as const

const MONTHS = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
] as const

function todayLabel(): string {
  const now = new Date()
  return `${WEEKDAYS[now.getDay()]}, ${now.getDate()} de ${MONTHS[now.getMonth()]}`
}

type DashboardProps = {
  onOpenAssistant: () => void
  onNewTask: () => void
  onRemindTomorrow: () => void
  onSeeAll: () => void
}

export function Dashboard({
  onOpenAssistant,
  onNewTask,
  onRemindTomorrow,
  onSeeAll,
}: DashboardProps) {
  const tasks = useTasks()
  const projects = useProjects()
  const status = useAiStatus()
  const overlays = useOverlays()

  const { greeting, subtitle, top, next, activeCount } = useMemo(() => {
    const archived = archivedIndex(projects.data ?? [])
    const all = tasks.data ?? []
    const active = all.filter(
      (task) => task.status !== "concluida" && !isTaskHidden(task, archived, null),
    )
    const late = all.filter((task) => isLate(task) && !isTaskHidden(task, archived, null))
    const name = status.data?.name
    const greetingText = greetWord() + (name ? `, ${name}` : "")

    const count = active.length
    let subtitleText =
      count === 0
        ? "Tudo tranquilo por aqui."
        : `Você tem ${count} tarefa${count > 1 ? "s" : ""} ativa${count > 1 ? "s" : ""}`
    if (late.length > 0) {
      subtitleText += ` · ${late.length} atrasada${late.length > 1 ? "s" : ""}`
    }

    const top3 = sortTasks(
      active.filter((task) => (task.tipo || "tarefa") === "tarefa"),
      "prioridade",
    ).slice(0, 3)

    const upcoming = active
      .filter((task) => task.due_date)
      .sort((a, b) => a.due_date.localeCompare(b.due_date))

    return {
      greeting: greetingText,
      subtitle: subtitleText,
      top: top3,
      next: upcoming[0] ?? null,
      activeCount: count,
    }
  }, [tasks.data, projects.data, status.data?.name])

  return (
    <section className="flex flex-col gap-rf-5">
      <ScreenHeader
        title={greeting}
        description={`${todayLabel()} · ${subtitle}`}
        actions={
          <>
            <Button type="button" onClick={onNewTask}>
              <Plus aria-hidden /> Nova tarefa
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onOpenAssistant}
              className="border-[color-mix(in_srgb,var(--app-ai)_45%,transparent)] text-[var(--app-ai)] hover:bg-[var(--app-ai-soft)] hover:text-[var(--app-ai)]"
            >
              <Sparkles aria-hidden /> Abrir Poohzera
            </Button>
          </>
        }
      />

      <div className="grid gap-rf-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <Panel
          title="Seu foco hoje"
          description="As três demandas que merecem sua energia primeiro."
          action={
            <button
              type="button"
              onClick={onRemindTomorrow}
              className="rf-caption text-muted-foreground transition-colors hover:text-foreground"
            >
              Lembrar amanhã
            </button>
          }
        >
          {top.length ? (
            <ol className="flex flex-col gap-rf-2">
              {top.map((task, index) => (
                <li key={task.id}>
                  <button
                    type="button"
                    onClick={() => overlays.openTask(task.id)}
                    className="group flex w-full items-center gap-rf-3 rounded-[var(--rf-radius-card)] bg-[var(--rf-hover)]/60 px-rf-3 py-rf-3 text-left outline-none transition-colors hover:bg-[var(--rf-hover)] focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-[var(--rf-surface)] font-mono text-xs font-semibold text-muted-foreground">
                      {index + 1}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-rf-1">
                      <span className="truncate text-sm font-medium text-foreground">
                        {task.title}
                      </span>
                      <span className="truncate rf-caption text-muted-foreground">
                        {task.projeto || "Sem projeto"}
                        {task.due_date
                          ? isLate(task)
                            ? ` · atrasada desde ${fmtDate(task.due_date)}`
                            : ` · ${fmtDate(task.due_date)}`
                          : ""}
                      </span>
                    </span>
                    {task.projeto ? <Dot tone={toneFromKey(task.projeto)} /> : null}
                    <ChevronRight
                      className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                      aria-hidden
                    />
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <p className="py-rf-2 rf-caption text-muted-foreground">
              Sem prioridades definidas.
            </p>
          )}
        </Panel>

        <Panel title="Próximo compromisso" description="O prazo mais perto de você.">
          {next ? (
            <button
              type="button"
              onClick={() => overlays.openTask(next.id)}
              className="flex w-full items-center gap-rf-3 rounded-[var(--rf-radius-card)] bg-[var(--rf-hover)]/60 px-rf-3 py-rf-4 text-left outline-none transition-colors hover:bg-[var(--rf-hover)] focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[var(--app-ai-soft)]">
                <CalendarDays className="size-5 text-[var(--app-ai)]" aria-hidden />
              </span>
              <span className="flex min-w-0 flex-col gap-rf-1">
                <span className="truncate text-sm font-semibold text-foreground">
                  {fmtDate(next.due_date)}
                  {isLate(next) ? " · atrasada" : ""}
                </span>
                <span className="truncate rf-caption text-muted-foreground">{next.title}</span>
              </span>
            </button>
          ) : (
            <p className="py-rf-2 rf-caption text-muted-foreground">Nenhum prazo à vista.</p>
          )}
        </Panel>
      </div>

      <div className="flex justify-center">
        <button
          type="button"
          onClick={onSeeAll}
          className="inline-flex items-center gap-rf-2 rf-caption text-muted-foreground transition-colors hover:text-foreground"
        >
          Ver todas as {activeCount} tarefa{activeCount === 1 ? "" : "s"}
          <ChevronRight className="size-4" aria-hidden />
        </button>
      </div>
    </section>
  )
}
