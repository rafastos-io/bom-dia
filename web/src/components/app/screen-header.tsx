import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export function ScreenHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string
  description?: string
  actions?: ReactNode
  className?: string
}) {
  return (
    <header className={cn("flex flex-wrap items-end justify-between gap-rf-4", className)}>
      <div className="flex min-w-0 flex-col gap-rf-1">
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
          {title}
        </h1>
        {description ? (
          <p className="rf-caption max-w-2xl text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-rf-2">{actions}</div> : null}
    </header>
  )
}
