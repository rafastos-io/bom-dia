import { Button } from "@rafastos/ui/button"
import { CalendarClock, Repeat2 } from "lucide-react"
import { Dot, toneFromKey } from "@/components/app/dot"
import { useOverlays } from "@/components/overlay-provider"
import { useToggleFeito } from "@/lib/queries"
import { PERIODO_LABEL, RECOR_LABEL } from "@/lib/tasks"
import type { Task } from "@/lib/types"

/** Card de rotina no padrão dos mockups: cadência, período e concluir. */
export function RoutineCard({ task }: { task: Task }) {
  const overlays = useOverlays()
  const toggle = useToggleFeito()
  const done = task.feita
  const period = PERIODO_LABEL[task.recorrencia] ?? ""
  const cadence = RECOR_LABEL[task.recorrencia] ?? "Sem recorrência"

  return (
    <article className="app-card flex flex-col gap-rf-3 p-rf-4">
      <header className="flex items-start gap-rf-2">
        <Dot tone={done ? "green" : "violet"} className="mt-1.5" />
        <button
          type="button"
          onClick={() => overlays.openTask(task.id)}
          className="min-w-0 flex-1 text-left text-sm font-semibold text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {task.title}
        </button>
      </header>

      {task.description ? (
        <p className="line-clamp-2 rf-caption text-muted-foreground">{task.description}</p>
      ) : null}

      {task.projeto ? (
        <span className="inline-flex w-fit items-center gap-rf-2 rounded-full bg-[var(--rf-hover)] px-rf-2 py-0.5 rf-caption text-foreground">
          <Dot tone={toneFromKey(task.projeto)} />
          {task.projeto}
        </span>
      ) : null}

      <dl className="flex flex-wrap items-center gap-x-rf-4 gap-y-rf-2 rf-caption text-muted-foreground">
        <div className="flex items-center gap-rf-2">
          <Repeat2 className="size-3.5" aria-hidden />
          <span>
            Cadência · <span className="text-foreground">{cadence}</span>
          </span>
        </div>
        <div className="flex items-center gap-rf-2">
          <CalendarClock className="size-3.5" aria-hidden />
          <span>
            Período ·{" "}
            <span className={done ? "text-[var(--rf-success)]" : "text-foreground"}>
              {done ? `Feito ${period}` : `Pendente ${period}`}
            </span>
          </span>
        </div>
      </dl>

      <div className="mt-auto flex items-center justify-between gap-rf-2 pt-rf-1">
        <span className="flex items-center gap-1" aria-hidden>
          {Array.from({ length: 7 }).map((_, index) => (
            <span
              key={index}
              className="size-1.5 rounded-full"
              style={{
                backgroundColor:
                  index === 3
                    ? done
                      ? "var(--app-dot-green)"
                      : "var(--rf-border)"
                    : "var(--rf-border)",
              }}
            />
          ))}
        </span>
        <Button
          type="button"
          size="sm"
          variant={done ? "secondary" : "default"}
          className={done ? "text-[var(--rf-success)]" : undefined}
          disabled={toggle.isPending}
          onClick={() => toggle.mutate({ id: task.id, done: !done })}
        >
          {done ? `Feito ${period}` : `Concluir ${period}`}
        </Button>
      </div>
    </article>
  )
}
