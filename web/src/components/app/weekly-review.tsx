import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@rafastos/ui/chart"
import { useMemo } from "react"
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts"
import type { Project, Task } from "@/lib/types"

const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"] as const

/** Números e gráfico dos últimos 7 dias (criadas, concluídas, tempo médio, origem e grupos). */
export function WeeklyReview({ tasks, projects }: { tasks: Task[]; projects: Project[] }) {
  const review = useMemo(() => {
    const today = new Date()
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(today)
      date.setDate(today.getDate() - 6 + index)
      return {
        iso: date.toISOString().slice(0, 10),
        label: WEEKDAYS[date.getDay()],
      }
    })
    const startIso = days[0]?.iso ?? ""
    const completed = tasks.filter((task) => (task.completed_at || "").slice(0, 10) >= startIso && task.completed_at)
    const created = tasks.filter((task) => (task.created_at || "").slice(0, 10) >= startIso)
    const durations = completed
      .map((task) => {
        const end = Date.parse(task.completed_at || "")
        const start = Date.parse(task.created_at || "")
        if (!Number.isFinite(end) || !Number.isFinite(start)) return null
        const days = (end - start) / 86_400_000
        return days >= 0 ? days : null
      })
      .filter((value): value is number => value != null)
    const average = durations.length
      ? Math.round((durations.reduce((sum, value) => sum + value, 0) / durations.length) * 10) / 10
      : null

    const series = days.map((day) => ({
      dia: day.label,
      concluidas: completed.filter((task) => (task.completed_at || "").slice(0, 10) === day.iso)
        .length,
    }))

    // Origem: o que veio do espelho da CENTRAL x o que foi criado por aqui.
    const centralCompleted = completed.filter((task) => task.central).length
    const centralCreated = created.filter((task) => task.central).length

    // Abertas por grupo macro (via projeto).
    const groupOf = new Map(
      projects.map((project) => [
        project.name.trim().toLowerCase(),
        (project.grupo ?? "").trim() || "Sem grupo",
      ]),
    )
    const byGroup = new Map<string, number>()
    for (const task of tasks) {
      if (task.status === "concluida") continue
      const key = (task.projeto || "").trim().toLowerCase()
      const group = key ? (groupOf.get(key) ?? "Sem grupo") : "Sem projeto"
      byGroup.set(group, (byGroup.get(group) ?? 0) + 1)
    }
    const groups = [...byGroup.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"))

    return {
      completed: completed.length,
      created: created.length,
      average,
      series,
      centralCompleted,
      centralCreated,
      manualCompleted: completed.length - centralCompleted,
      manualCreated: created.length - centralCreated,
      groups,
    }
  }, [tasks, projects])

  const config = {
    concluidas: { label: "Concluídas", color: "var(--app-dot-green)" },
  } satisfies ChartConfig

  return (
    <div className="flex flex-col gap-rf-4">
      <dl className="flex flex-wrap gap-rf-5">
        <div className="flex flex-col">
          <dt className="rf-caption text-muted-foreground">Concluídas (7 dias)</dt>
          <dd className="text-xl font-bold text-foreground">{review.completed}</dd>
        </div>
        <div className="flex flex-col">
          <dt className="rf-caption text-muted-foreground">Criadas (7 dias)</dt>
          <dd className="text-xl font-bold text-foreground">{review.created}</dd>
        </div>
        <div className="flex flex-col">
          <dt className="rf-caption text-muted-foreground">Tempo médio até concluir</dt>
          <dd className="text-xl font-bold text-foreground">
            {review.average == null ? "—" : `${review.average} dia${review.average === 1 ? "" : "s"}`}
          </dd>
        </div>
      </dl>

      <dl className="flex flex-wrap gap-rf-5 border-t border-[var(--rf-border)] pt-rf-3">
        <div className="flex flex-col">
          <dt className="rf-caption text-muted-foreground">Da CENTRAL (7 dias)</dt>
          <dd className="rf-label text-foreground">
            {review.centralCreated} criadas · {review.centralCompleted} concluídas
          </dd>
        </div>
        <div className="flex flex-col">
          <dt className="rf-caption text-muted-foreground">Manuais (7 dias)</dt>
          <dd className="rf-label text-foreground">
            {review.manualCreated} criadas · {review.manualCompleted} concluídas
          </dd>
        </div>
        <div className="flex min-w-44 flex-col">
          <dt className="rf-caption text-muted-foreground">Abertas por grupo</dt>
          <dd className="flex flex-wrap gap-x-rf-3 gap-y-0.5">
            {review.groups.length === 0 ? (
              <span className="rf-caption text-muted-foreground">—</span>
            ) : (
              review.groups.map(([name, count]) => (
                <span key={name} className="rf-caption text-muted-foreground">
                  {name} · <strong className="font-semibold text-foreground">{count}</strong>
                </span>
              ))
            )}
          </dd>
        </div>
      </dl>

      <ChartContainer config={config} className="h-32 w-full">
        <BarChart data={review.series} margin={{ left: -24, right: 4, top: 4 }}>
          <CartesianGrid vertical={false} stroke="var(--rf-border)" />
          <XAxis dataKey="dia" tickLine={false} axisLine={false} tickMargin={6} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Bar dataKey="concluidas" fill="var(--color-concluidas)" radius={4} maxBarSize={28} />
        </BarChart>
      </ChartContainer>
    </div>
  )
}
