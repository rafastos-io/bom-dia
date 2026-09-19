import { Button } from "@rafastos/ui/button"
import { NativeSelect, NativeSelectOption } from "@rafastos/ui/native-select"
import { cn } from "cn"
import {
  CalendarDays,
  Check,
  Folder,
  Link as LinkIcon,
  ListChecks,
  MessageCircle,
  Paperclip,
  Repeat2,
} from "lucide-react"
import { motion } from "motion/react"
import { useMemo, useRef, useState } from "react"
import { Dot, type DotTone } from "@/components/app/dot"
import { useOverlays } from "@/components/overlay-provider"
import { openLink } from "@/lib/open"
import { PRIO_COLOR } from "@/lib/prio"
import { useSetTaskStatus, useToggleFeito } from "@/lib/queries"
import {
  fmtDate,
  isLate,
  PRIO_LABEL,
  RECOR_LABEL,
  PERIODO_LABEL,
  STATUS_LABEL,
  STATUS_ORDER,
  substaskProgress,
  TIPO_LABEL,
} from "@/lib/tasks"
import type { IdeaLink, Prioridade, Status, Task } from "@/lib/types"

const STATUS_TONE: Record<Status, DotTone> = {
  aberta: "muted",
  andamento: "blue",
  concluida: "green",
}

export function PriorityDot({ priority }: { priority: Prioridade }) {
  return (
    <span
      className="size-2 shrink-0 rounded-full"
      style={{ backgroundColor: PRIO_COLOR[priority] }}
      title={PRIO_LABEL[priority]}
      aria-label={`Prioridade ${PRIO_LABEL[priority]}`}
    />
  )
}

function Tag({
  children,
  color,
  className,
}: {
  children: React.ReactNode
  color?: string
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] leading-none",
        className,
      )}
      style={{
        color: color ?? undefined,
        backgroundColor: color
          ? `color-mix(in srgb, ${color} 14%, transparent)`
          : "var(--rf-field)",
      }}
    >
      {children}
    </span>
  )
}

export function MetaTags({
  task,
  hideProjeto,
}: {
  task: Task
  hideProjeto?: boolean
}) {
  const late = isLate(task)
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Tag color={PRIO_COLOR[task.priority]}>{PRIO_LABEL[task.priority]}</Tag>
      {(task.tipo || "tarefa") !== "tarefa" ? (
        <Tag className="text-muted-foreground">
          {TIPO_LABEL[task.tipo]}
          {task.recorrencia && RECOR_LABEL[task.recorrencia]
            ? ` · ${RECOR_LABEL[task.recorrencia]}`
            : ""}
        </Tag>
      ) : null}
      {!hideProjeto && task.projeto?.trim() ? (
        <Tag className="text-foreground">
          <Folder className="size-3" aria-hidden /> {task.projeto}
        </Tag>
      ) : null}
      {task.due_date ? (
        <Tag color={late ? "var(--rf-error)" : undefined} className={late ? undefined : "text-muted-foreground"}>
          <CalendarDays className="size-3" aria-hidden />
          {fmtDate(task.due_date)}
          {late ? " · atrasada" : ""}
        </Tag>
      ) : null}
    </div>
  )
}

export function RoutineCheck({ task }: { task: Task }) {
  const toggle = useToggleFeito()
  if ((task.tipo || "tarefa") !== "rotina" || !task.recorrencia) return null
  const periodo = PERIODO_LABEL[task.recorrencia] || ""
  return (
    <Button
      type="button"
      variant={task.feita ? "secondary" : "ghost"}
      size="xs"
      className={cn(
        "gap-1",
        task.feita && "text-[var(--rf-success)]",
      )}
      title={`Recorrência ${RECOR_LABEL[task.recorrencia]?.toLowerCase()} — clique para ${
        task.feita ? "desfazer" : "marcar"
      }`}
      onClick={(event) => {
        event.stopPropagation()
        toggle.mutate({ id: task.id, done: !task.feita })
      }}
    >
      {task.feita ? <Check aria-hidden /> : <Repeat2 aria-hidden />}
      {task.feita ? `Feito ${periodo}` : `Marcar feito ${periodo}`}
    </Button>
  )
}

export function StatusSelect({ task }: { task: Task }) {
  const setStatus = useSetTaskStatus()
  return (
    <NativeSelect
      size="sm"
      className="ml-auto w-auto"
      aria-label="Status"
      value={task.status || "aberta"}
      onClick={(event) => event.stopPropagation()}
      onChange={(event) =>
        setStatus.mutate({ id: task.id, status: event.target.value as Status })
      }
    >
      {STATUS_ORDER.map((status) => (
        <NativeSelectOption key={status} value={status}>
          {STATUS_LABEL[status]}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  )
}

export function SubtaskProgressBar({ task }: { task: Task }) {
  const { done, total, percent } = substaskProgress(task.subtasks)
  if (!total) return null
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>Subtarefas</span>
        <span className="font-mono">
          {done}/{total}
        </span>
      </div>
      <div
        className="h-1 w-full overflow-hidden rounded-full"
        style={{ backgroundColor: "var(--rf-hover)" }}
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full transition-[width]"
          style={{
            width: `${percent}%`,
            backgroundColor: percent === 100 ? "var(--app-dot-green)" : "var(--app-ai)",
          }}
        />
      </div>
    </div>
  )
}

export function LinksChips({ links }: { links: Task["links"] }) {
  if (!links?.length) return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {links.map((link, index) => (
        <Button
          key={`${link.target}-${index}`}
          type="button"
          variant="ghost"
          size="xs"
          className="max-w-full bg-[var(--rf-field)] text-foreground hover:bg-hover"
          title={link.target}
          onClick={(event) => {
            event.stopPropagation()
            void openLink(link.kind, link.target)
          }}
        >
          {link.kind === "pasta" ? <Folder aria-hidden /> : <LinkIcon aria-hidden />}
          <span className="truncate">{link.label || link.target}</span>
        </Button>
      ))}
    </div>
  )
}

export function IdeaChips({ links, mini }: { links: IdeaLink[]; mini?: boolean }) {
  const overlays = useOverlays()
  if (!links?.length) return null
  return (
    <div className="flex flex-wrap gap-1">
      {links.map((link) => (
        <button
          key={`${link.target_type}-${link.target_id}`}
          type="button"
          className={cn(
            "inline-flex max-w-full items-center gap-1 rounded-full bg-[var(--rf-field)] px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-hover hover:text-foreground",
            mini && "text-[10px]",
          )}
          title={link.label}
          onClick={(event) => {
            event.stopPropagation()
            if (link.target_type === "projeto") {
              window.location.assign(`/projetos?proj=${encodeURIComponent(link.label ?? "")}`)
            } else {
              overlays.openTask(link.target_id)
            }
          }}
        >
          {link.target_type === "projeto" ? (
            <Folder className="size-3" aria-hidden />
          ) : link.target_tipo === "rotina" || link.target_type === "rotina" ? (
            <Repeat2 className="size-3" aria-hidden />
          ) : (
            <ListChecks className="size-3" aria-hidden />
          )}
          <span className="truncate">{link.label}</span>
        </button>
      ))}
    </div>
  )
}

export function AttachBadge({ count }: { count: number }) {
  if (!count) return null
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"
      title={`${count} arquivo${count > 1 ? "s" : ""} anexado${count > 1 ? "s" : ""}`}
    >
      <Paperclip className="size-3.5" aria-hidden />
      {count}
    </span>
  )
}

type TaskCardProps = {
  task: Task
  hideProjeto?: boolean
  drag?: boolean
  onDragEndColumn?: (status: Status) => void
  onDragOverColumn?: (status: Status | null) => void
}

export function TaskCard({
  task,
  hideProjeto,
  drag,
  onDragEndColumn,
  onDragOverColumn,
}: TaskCardProps) {
  const overlays = useOverlays()
  const dragged = useRef(false)
  const done = task.status === "concluida"

  const open = () => {
    if (dragged.current) return
    overlays.openTask(task.id)
  }

  const body = (
    <>
      <div className="flex items-start gap-2">
        <button
          type="button"
          className={cn(
            "min-w-0 flex-1 text-left text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
            done && "text-muted-foreground line-through",
          )}
          onClick={open}
        >
          {task.title}
        </button>
        {drag ? (
          <span className="cursor-grab text-muted-foreground" aria-hidden>
            <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor">
              <circle cx="2" cy="3" r="1.3" />
              <circle cx="8" cy="3" r="1.3" />
              <circle cx="2" cy="8" r="1.3" />
              <circle cx="8" cy="8" r="1.3" />
              <circle cx="2" cy="13" r="1.3" />
              <circle cx="8" cy="13" r="1.3" />
            </svg>
          </span>
        ) : null}
      </div>

      <MetaTags task={task} hideProjeto={hideProjeto} />
      <IdeaChips links={task.idea_links ?? []} />
      {task.description ? (
        <p className="line-clamp-2 text-xs text-muted-foreground">{task.description}</p>
      ) : null}
      <SubtaskProgressBar task={task} />
      <LinksChips links={task.links} />

      <div className={cn("flex items-center gap-2", done && "opacity-80")}>
        <RoutineCheck task={task} />
        <AttachBadge count={task.attach_count} />
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="text-muted-foreground"
          title="Gerar recado pro WhatsApp"
          onClick={(event) => {
            event.stopPropagation()
            overlays.openWhatsapp(task)
          }}
        >
          <MessageCircle aria-hidden />
        </Button>
        <StatusSelect task={task} />
      </div>
    </>
  )

  const className = cn(
    "app-card flex cursor-pointer flex-col gap-2.5 p-4 transition-shadow",
    "hover:shadow-elevated",
    done && "opacity-75",
  )

  if (!drag) {
    return (
      <article className={className} onClick={open}>
        {body}
      </article>
    )
  }

  return (
    <motion.article
      layout
      drag
      dragSnapToOrigin
      dragElastic={0.12}
      whileDrag={{ scale: 1.03, zIndex: 40, cursor: "grabbing" }}
      onDragStart={() => {
        dragged.current = false
        onDragOverColumn?.(null)
      }}
      onDrag={(event) => {
        dragged.current = true
        const point = pointerFromEvent(event)
        if (!point) return
        onDragOverColumn?.(kanbanColumnAt(point.x, point.y))
      }}
      onDragEnd={(event) => {
        const point = pointerFromEvent(event)
        const status = point ? kanbanColumnAt(point.x, point.y) : null
        onDragOverColumn?.(null)
        if (status) onDragEndColumn?.(status)
        setTimeout(() => {
          dragged.current = false
        }, 0)
      }}
      onClick={open}
      className={cn(className, "relative touch-none select-none")}
    >
      {body}
    </motion.article>
  )
}

/** Coluna do kanban sob o ponteiro (por geometria — o card arrastado fica sob o cursor). */
function kanbanColumnAt(x: number, y: number): Status | null {
  const columns = document.querySelectorAll<HTMLElement>("[data-kanban-col]")
  for (const column of columns) {
    const rect = column.getBoundingClientRect()
    if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
      return column.getAttribute("data-kanban-col") as Status
    }
  }
  return null
}

function pointerFromEvent(event: MouseEvent | TouchEvent | PointerEvent) {
  if ("clientX" in event && typeof event.clientX === "number") {
    return { x: event.clientX, y: event.clientY }
  }
  if ("touches" in event && event.touches.length) {
    const touch = event.touches[0]
    return { x: touch.clientX, y: touch.clientY }
  }
  return null
}

export function TaskRow({ task }: { task: Task }) {
  const overlays = useOverlays()
  const done = task.status === "concluida"
  const { done: subsDone, total } = substaskProgress(task.subtasks)
  const late = isLate(task)

  return (
    <div
      className={cn(
        "app-card flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2",
        done && "opacity-70",
      )}
    >
      <PriorityDot priority={task.priority} />
      <button
        type="button"
        className={cn(
          "min-w-0 flex-1 basis-40 truncate text-left text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
          done && "line-through",
        )}
        onClick={() => overlays.openTask(task.id)}
      >
        {task.title}
        {total ? (
          <span className="ml-2 font-mono text-[10px] text-muted-foreground">
            ☑ {subsDone}/{total}
          </span>
        ) : null}
      </button>
      <span className="hidden min-w-0 basis-40 truncate text-xs text-muted-foreground sm:block">
        {[task.requested_by && `de ${task.requested_by}`, task.send_to && `→ ${task.send_to}`]
          .filter(Boolean)
          .join("  ")}
      </span>
      <span
        className={cn(
          "font-mono text-xs text-muted-foreground",
          late && "text-[var(--rf-error)]",
        )}
      >
        {task.due_date ? (late ? "⚠ " : "") + fmtDate(task.due_date) : ""}
      </span>
      <StatusSelect task={task} />
    </div>
  )
}

export function KanbanBoard({ tasks }: { tasks: Task[] }) {
  const setStatus = useSetTaskStatus()
  const [overCol, setOverCol] = useState<Status | null>(null)
  const columns = useMemo(
    () =>
      STATUS_ORDER.map((status) => ({
        status,
        items: tasks.filter((task) => (task.status || "aberta") === status),
      })),
    [tasks],
  )

  return (
    <div className="grid grid-cols-1 gap-4 min-[760px]:grid-cols-3">
      {columns.map((column) => (
        <section
          key={column.status}
          data-kanban-col={column.status}
          className={cn(
            "flex min-h-40 flex-col gap-3 rounded-[var(--rf-radius-panel)] p-3 transition-colors",
            overCol === column.status
              ? "bg-hover ring-2 ring-action/40"
              : "bg-[var(--rf-hover)]/40",
          )}
        >
          <header className="flex items-center gap-2 px-1">
            <Dot tone={STATUS_TONE[column.status]} />
            <h2 className="rf-label text-foreground">{STATUS_LABEL[column.status]}</h2>
            <span className="ml-auto font-mono text-[11px] text-muted-foreground">
              {column.items.length}
            </span>
          </header>
          <div className="flex flex-col gap-3">
            {column.items.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                drag
                onDragOverColumn={setOverCol}
                onDragEndColumn={(status) => {
                  if (status !== task.status) {
                    setStatus.mutate({ id: task.id, status })
                  }
                }}
              />
            ))}
            {!column.items.length ? (
              <p className="rounded-[var(--rf-radius-control)] border border-dashed border-[var(--rf-field)] px-3 py-6 text-center text-xs text-muted-foreground">
                Solte um card aqui
              </p>
            ) : null}
          </div>
        </section>
      ))}
    </div>
  )
}
