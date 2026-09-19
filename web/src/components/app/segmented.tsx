import { cn } from "@/lib/utils"

export function Segmented<T extends string>({
  items,
  value,
  onChange,
  className,
  ariaLabel,
}: {
  items: { value: T; label: string; icon?: React.ReactNode }[]
  value: T
  onChange: (value: T) => void
  className?: string
  ariaLabel?: string
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-[var(--rf-hover)] p-1",
        className,
      )}
    >
      {items.map((item) => {
        const active = item.value === value
        return (
          <button
            key={item.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(item.value)}
            className={cn(
              "inline-flex h-7 items-center gap-rf-2 rounded-full px-rf-3 rf-caption transition-colors",
              "focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              active
                ? "app-pill-active"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {item.icon}
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
