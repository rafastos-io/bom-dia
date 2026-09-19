import { Input } from "@rafastos/ui/input"
import { Search } from "lucide-react"
import { cn } from "@/lib/utils"

export function SearchField({
  value,
  onChange,
  onSubmit,
  placeholder = "Buscar...",
  className,
  shortcut,
}: {
  value: string
  onChange: (value: string) => void
  onSubmit?: (value: string) => void
  placeholder?: string
  className?: string
  shortcut?: string
}) {
  return (
    <span className={cn("relative flex min-w-0 items-center", className)}>
      <Search
        className="pointer-events-none absolute left-3 size-4 text-muted-foreground"
        strokeWidth={2}
        aria-hidden
      />
      <Input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && onSubmit) onSubmit(value)
        }}
        placeholder={placeholder}
        aria-label={placeholder}
        className={cn("h-9 rounded-full pl-9", shortcut && "pr-12")}
      />
      {shortcut ? (
        <kbd className="pointer-events-none absolute right-3 hidden rounded border border-border px-1.5 py-0.5 rf-caption text-muted-foreground sm:block">
          {shortcut}
        </kbd>
      ) : null}
    </span>
  )
}
