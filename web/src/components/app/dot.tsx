import { cn } from "@/lib/utils"

export type DotTone = "green" | "violet" | "pink" | "amber" | "blue" | "muted"

const TONE_VAR: Record<DotTone, string> = {
  green: "var(--app-dot-green)",
  violet: "var(--app-dot-violet)",
  pink: "var(--app-dot-pink)",
  amber: "var(--app-dot-amber)",
  blue: "var(--app-dot-blue)",
  muted: "color-mix(in srgb, var(--rf-text-muted-foreground) 60%, transparent)",
}

export function Dot({ tone = "muted", className }: { tone?: DotTone; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-2 shrink-0 rounded-full", className)}
      style={{ backgroundColor: TONE_VAR[tone] }}
    />
  )
}

/** Tom estável por string (projeto vira sempre a mesma cor). */
export function toneFromKey(key: string): DotTone {
  const tones: DotTone[] = ["green", "violet", "pink", "amber", "blue"]
  let hash = 0
  for (const ch of key) hash = (hash * 31 + ch.charCodeAt(0)) % 997
  return tones[hash % tones.length] ?? "muted"
}
