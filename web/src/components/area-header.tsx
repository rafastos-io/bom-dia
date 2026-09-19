import type { ReactNode } from "react"
import { cn } from "cn"

type AreaHeaderProps = {
  title: string
  caption?: string
  actions?: ReactNode
  className?: string
}

export function AreaHeader({ title, caption, actions, className }: AreaHeaderProps) {
  return (
    <header
      className={cn(
        "mb-6 flex flex-wrap items-end justify-between gap-x-4 gap-y-3",
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="rf-h3 text-foreground">{title}</h1>
        {caption ? (
          <p className="mt-1 font-mono text-xs text-muted-foreground">{caption}</p>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </header>
  )
}
