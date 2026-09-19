import { cn } from "@/lib/utils"

export type MascotName =
  | "avatar"
  | "thinking"
  | "thumbsup"
  | "checklist"
  | "phone"
  | "pockets"

export const MASCOT_SRC: Record<MascotName, string> = {
  avatar: "/brand/mascot-avatar.png",
  thinking: "/brand/mascot-thinking.png",
  thumbsup: "/brand/mascot-thumbsup.png",
  checklist: "/brand/mascot-checklist.png",
  phone: "/brand/mascot-phone.png",
  pockets: "/brand/mascot-pockets.png",
}

/** Ilustração do Poohzera (asset gerado no Runway). */
export function Mascot({
  name,
  className,
  alt,
}: {
  name: MascotName
  className?: string
  alt?: string
}) {
  return (
    <img
      src={MASCOT_SRC[name]}
      alt={alt ?? ""}
      aria-hidden={alt ? undefined : true}
      draggable={false}
      className={cn("w-auto select-none object-contain", className)}
    />
  )
}

/** Avatar redondo do assistente sobre o círculo violeta da IA. */
export function MascotAvatar({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative inline-flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--app-ai-soft)]",
        className,
      )}
    >
      <img
        src={MASCOT_SRC.avatar}
        alt=""
        draggable={false}
        className="size-[152%] -translate-y-1 object-contain"
      />
    </span>
  )
}

export const ILLUSTRATIONS = {
  archive: "/brand/illus-archive.png",
  document: "/brand/illus-document.png",
} as const

export function Illustration({
  name,
  className,
}: {
  name: keyof typeof ILLUSTRATIONS
  className?: string
}) {
  return (
    <img
      src={ILLUSTRATIONS[name]}
      alt=""
      aria-hidden
      draggable={false}
      className={cn("w-auto select-none object-contain", className)}
    />
  )
}
