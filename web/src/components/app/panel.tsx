import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export function Panel({
  title,
  description,
  action,
  children,
  className,
  bodyClassName,
}: {
  title?: string
  description?: string
  action?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <section className={cn("app-card flex min-w-0 flex-col gap-rf-4 p-rf-5", className)}>
      {title || action ? (
        <header className="flex flex-wrap items-start justify-between gap-rf-3">
          <div className="flex min-w-0 flex-col gap-rf-1">
            {title ? <h2 className="rf-label text-foreground">{title}</h2> : null}
            {description ? (
              <p className="rf-caption text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {action}
        </header>
      ) : null}
      <div className={cn("min-w-0", bodyClassName)}>{children}</div>
    </section>
  )
}
