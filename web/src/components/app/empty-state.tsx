import type { ReactNode } from "react"
import { Illustration } from "./mascot"
import { Mascot, type MascotName } from "./mascot"

export function EmptyState({
  mascot,
  illustration,
  title,
  description,
  action,
}: {
  mascot?: MascotName
  illustration?: "archive" | "document"
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-rf-3 py-rf-6 text-center">
      {mascot ? <Mascot name={mascot} className="h-28 sm:h-32" /> : null}
      {illustration ? <Illustration name={illustration} className="h-24 sm:h-28" /> : null}
      <p className="rf-label text-foreground">{title}</p>
      {description ? (
        <p className="rf-caption max-w-sm text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="pt-rf-1">{action}</div> : null}
    </div>
  )
}
