import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

/** Indicador compacto no padrão da vitrine do DS. */
export function KpiCard({
  label,
  value,
  hint,
  tone,
  icon,
  className,
}: {
  label: string
  value: string | number
  hint?: string
  tone?: "green" | "pink" | "violet" | "blue" | "amber" | "muted"
  icon?: ReactNode
  className?: string
}) {
  const toneVar = tone ? `var(--app-dot-${tone})` : "var(--rf-text-muted-foreground)"
  return (
    <article className={cn("app-card flex min-w-0 items-center gap-rf-3 p-rf-4", className)}>
      {icon ? (
        <span
          className="flex size-10 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: `color-mix(in srgb, ${toneVar} 16%, transparent)` }}
        >
          {icon}
        </span>
      ) : null}
      <div className="flex min-w-0 flex-col">
        <p className="rf-caption text-muted-foreground">{label}</p>
        <p className="text-xl font-bold tracking-tight text-foreground">{value}</p>
        {hint ? <p className="truncate rf-caption text-muted-foreground">{hint}</p> : null}
      </div>
    </article>
  )
}
