import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@rafastos/ui/chart"
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from "recharts"
import type { Task } from "@/lib/types"

function isoOffset(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"] as const

/** Prazos dos próximos 7 dias (tarefas não concluídas com data). */
export function WeeklyDueChart({ tasks }: { tasks: Task[] }) {
  const days = Array.from({ length: 7 }, (_, index) => {
    const iso = isoOffset(index)
    const weekday = new Date(`${iso}T12:00:00`)
    return {
      dia: index === 0 ? "hoje" : WEEKDAYS[weekday.getDay()],
      iso,
      prazos: tasks.filter(
        (task) => task.status !== "concluida" && (task.due_date || "").slice(0, 10) === iso,
      ).length,
    }
  })

  const config = {
    prazos: { label: "Prazos", color: "var(--rf-chart-1)" },
  } satisfies ChartConfig

  return (
    <ChartContainer config={config} className="h-44 w-full">
      <BarChart data={days} margin={{ left: -28, right: 4, top: 8 }}>
        <CartesianGrid vertical={false} stroke="var(--rf-border)" />
        <XAxis dataKey="dia" tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={44} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="prazos" fill="var(--color-prazos)" radius={6} maxBarSize={36} />
      </BarChart>
    </ChartContainer>
  )
}

/** Distribuição por status (todas as demandas visíveis). */
export function StatusDonut({ tasks }: { tasks: Task[] }) {
  const counts = {
    aberta: tasks.filter((task) => (task.status || "aberta") === "aberta").length,
    andamento: tasks.filter((task) => task.status === "andamento").length,
    concluida: tasks.filter((task) => task.status === "concluida").length,
  }
  const data = [
    { status: "aberta", value: counts.aberta },
    { status: "andamento", value: counts.andamento },
    { status: "concluida", value: counts.concluida },
  ].filter((item) => item.value > 0)

  const config = {
    aberta: { label: "Aberta", color: "var(--rf-chart-2)" },
    andamento: { label: "Em andamento", color: "var(--app-dot-blue)" },
    concluida: { label: "Concluída", color: "var(--app-dot-green)" },
  } satisfies ChartConfig

  return (
    <ChartContainer config={config} className="mx-auto h-44 w-full max-w-56">
      <PieChart>
        <ChartTooltip content={<ChartTooltipContent nameKey="status" hideLabel />} />
        <Pie
          data={data}
          dataKey="value"
          nameKey="status"
          innerRadius="62%"
          outerRadius="92%"
          paddingAngle={3}
          strokeWidth={0}
        >
          {data.map((item) => (
            <Cell key={item.status} fill={`var(--color-${item.status})`} />
          ))}
        </Pie>
      </PieChart>
    </ChartContainer>
  )
}

/** Carga por projeto (demandas não concluídas), top 5. */
export function ProjectLoadChart({
  tasks,
  tones,
}: {
  tasks: Task[]
  tones: Map<string, string>
}) {
  const byProject = new Map<string, number>()
  for (const task of tasks) {
    if (task.status === "concluida") continue
    const name = (task.projeto || "").trim() || "Sem projeto"
    byProject.set(name, (byProject.get(name) ?? 0) + 1)
  }
  const data = [...byProject.entries()]
    .map(([projeto, demandas]) => ({
      projeto,
      demandas,
      fill: tones.get(projeto) ?? "var(--rf-chart-1)",
    }))
    .sort((a, b) => b.demandas - a.demandas)
    .slice(0, 5)

  const config = {
    demandas: { label: "Demandas abertas", color: "var(--rf-chart-1)" },
  } satisfies ChartConfig

  return (
    <ChartContainer config={config} className="h-52 w-full">
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 12 }}>
        <CartesianGrid horizontal={false} stroke="var(--rf-border)" />
        <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} />
        <YAxis
          type="category"
          dataKey="projeto"
          tickLine={false}
          axisLine={false}
          width={104}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="demandas" radius={6} maxBarSize={18}>
          {data.map((item) => (
            <Cell key={item.projeto} fill={item.fill} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}
