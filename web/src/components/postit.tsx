import { cn } from "cn"
import { useOverlays } from "@/components/overlay-provider"
import { IdeaChips } from "@/components/task-items"
import type { Task } from "@/lib/types"

type PostitProps = {
  idea: Task
  mini?: boolean
  exclude?: string | null
}

export function Postit({ idea, mini, exclude }: PostitProps) {
  const overlays = useOverlays()
  const links = (idea.idea_links ?? []).filter(
    (link) => `${link.target_type}:${link.target_id}` !== exclude,
  )

  return (
    <button
      type="button"
      onClick={() => overlays.openTask(idea.id)}
      className={cn(
        "app-card relative flex w-full flex-col gap-rf-2 p-rf-4 text-left outline-none transition-all",
        "hover:-translate-y-0.5 hover:shadow-elevated focus-visible:ring-3 focus-visible:ring-ring/50",
        mini ? "p-2.5" : "min-h-28",
      )}
    >
      <span
        className={cn(
          "absolute top-3 right-3 size-2 rounded-full bg-[var(--app-ai)]",
          mini && "top-2 right-2",
        )}
        aria-hidden
      />
      <span className={cn("pr-4 text-sm font-semibold text-foreground", mini && "text-xs")}>
        {idea.title}
      </span>
      {idea.description && !mini ? (
        <span className="line-clamp-3 rf-caption text-muted-foreground">{idea.description}</span>
      ) : null}
      <IdeaChips links={links} mini={mini} />
    </button>
  )
}
