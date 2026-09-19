import type { ButtonHTMLAttributes } from "react"
import { Dot, type DotTone } from "./dot"
import { cn } from "@/lib/utils"

export function Chip({
  children,
  active = false,
  tone,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean
  tone?: DotTone
}) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-8 items-center gap-rf-2 rounded-full px-rf-3 rf-caption transition-colors",
        "focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        active
          ? "app-pill-active"
          : "bg-[var(--rf-hover)] text-muted-foreground hover:text-foreground",
        className,
      )}
      {...props}
    >
      {tone ? <Dot tone={tone} /> : null}
      {children}
    </button>
  )
}
