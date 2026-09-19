import { Button } from "@rafastos/ui/button"
import { Skeleton } from "@rafastos/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@rafastos/ui/tabs"
import {
  Archive,
  ArrowRight,
  Eye,
  EyeOff,
  Folder,
  Layers,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react"
import { useMemo, useState } from "react"
import { useSearchParams } from "react-router"
import { toast } from "sonner"
import { Dot, toneFromKey } from "@/components/app/dot"
import { useConfirm } from "@/components/app/confirm"
import { ProjectLoadChart } from "@/components/app/charts"
import { EmptyState } from "@/components/app/empty-state"
import { Panel } from "@/components/app/panel"
import { ScreenHeader } from "@/components/app/screen-header"
import { QueryError, TaskBoard } from "@/components/area-board"
import { Attachments } from "@/components/attachments"
import { LinksHub } from "@/components/links-hub"
import { useListView } from "@/components/list-view"
import { NotesPanel } from "@/components/notes-panel"
import { useOverlays } from "@/components/overlay-provider"
import { Postit } from "@/components/postit"
import { ViewToolbar } from "@/components/view-toolbar"
import { useDeleteProject, useProjects, useSaveProject, useTasks } from "@/lib/queries"
import { useAreaTasks } from "@/lib/use-area-tasks"
import type { Project } from "@/lib/types"

type TabKey = "demandas" | "anotacoes" | "links" | "arquivos"

export function ProjetosPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const openName = searchParams.get("proj")
  const tab = (searchParams.get("ptab") as TabKey | null) ?? "demandas"

  if (openName) {
    return (
      <ProjectCentral
        name={openName}
        tab={tab}
        onTab={(next) => {
          const params = new URLSearchParams(searchParams)
          params.set("ptab", next)
          setSearchParams(params, { replace: true })
        }}
        onBack={() => {
          setSearchParams({}, { replace: true })
        }}
      />
    )
  }

  return <ProjectList onOpen={(name) => setSearchParams({ proj: name })} />
}

function initials(people: string): string[] {
  return people
    .split(/[,;/]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 4)
    .map((part) =>
      part
        .split(/\s+/)
        .slice(0, 2)
        .map((word) => word[0]?.toUpperCase() ?? "")
        .join(""),
    )
}

function ProjectCard({ project, onOpen }: { project: Project; onOpen: (name: string) => void }) {
  const conclused = Math.max(0, project.task_total - project.task_ativas)
  const percent = project.task_total ? Math.round((conclused / project.task_total) * 100) : 0
  const people = initials(project.people || "")
  const tone = toneFromKey(project.name)
  const toneVar = tone === "muted" ? "var(--app-dot-violet)" : `var(--app-dot-${tone})`

  return (
    <article className="app-card flex flex-col gap-rf-4 p-rf-5">
      <header className="flex items-start gap-rf-3">
        <span
          className="flex size-11 shrink-0 items-center justify-center rounded-[var(--rf-radius-card)]"
          style={{ backgroundColor: `color-mix(in srgb, ${toneVar} 18%, transparent)` }}
        >
          <Layers className="size-5 text-foreground" aria-hidden />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-rf-1">
          <button
            type="button"
            onClick={() => onOpen(project.name)}
            className="truncate text-left text-lg font-semibold text-foreground outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {project.name}
          </button>
          <span className="rf-caption text-muted-foreground">
            {project.task_ativas} tarefa{project.task_ativas === 1 ? "" : "s"} ativa
            {project.task_ativas === 1 ? "" : "s"}
            {project.task_total ? ` · ${project.task_total} no total` : ""}
          </span>
        </div>
        {people.length ? (
          <span className="flex -space-x-2" aria-label="Envolvidos">
            {people.map((item) => (
              <span
                key={item}
                className="inline-flex size-7 items-center justify-center rounded-full border-2 border-[var(--rf-surface)] bg-[var(--rf-hover)] font-mono text-[10px] text-muted-foreground"
              >
                {item}
              </span>
            ))}
          </span>
        ) : null}
      </header>

      {project.scope ? (
        <p className="line-clamp-2 rf-caption text-muted-foreground">{project.scope}</p>
      ) : null}

      <div className="flex flex-col gap-rf-2">
        <span
          className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--rf-hover)]"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${percent}% concluído`}
        >
          <span
            className="block h-full rounded-full"
            style={{
              width: `${percent}%`,
              backgroundColor: "var(--app-dot-green)",
            }}
          />
        </span>
        <span className="flex items-center justify-between rf-caption text-muted-foreground">
          <span>{percent}% concluído</span>
          <span className="inline-flex items-center gap-rf-2">
            {project.links?.length ? (
              <>
                <Folder className="size-3" aria-hidden />
                {project.links.length} link{project.links.length === 1 ? "" : "s"}
              </>
            ) : null}
          </span>
        </span>
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-auto w-fit"
        onClick={() => onOpen(project.name)}
      >
        Abrir <ArrowRight aria-hidden />
      </Button>
    </article>
  )
}

function ProjectList({ onOpen }: { onOpen: (name: string) => void }) {
  const projects = useProjects()
  const tasks = useTasks()
  const [showArchived, setShowArchived] = useState(false)
  const overlays = useOverlays()

  const isArchived = (project: Project) => (project.status || "ativo") !== "ativo"
  const showing = (projects.data ?? []).filter((project) =>
    showArchived ? isArchived(project) : !isArchived(project),
  )

  const tones = useMemo(() => {
    const map = new Map<string, string>()
    for (const project of projects.data ?? []) {
      map.set(project.name, `var(--app-dot-${toneFromKey(project.name)})`)
    }
    map.set("Sem projeto", "var(--rf-chart-2)")
    return map
  }, [projects.data])

  return (
    <div className="flex min-w-0 flex-col gap-rf-5">
      <ScreenHeader
        title={showArchived ? "Projetos ocultos" : "Projetos"}
        description={
          showArchived
            ? "Nada se perde — só fica guardado para depois."
            : "Organize seus contextos de trabalho."
        }
        actions={
          showArchived ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowArchived(false)}
            >
              <RotateCcw aria-hidden /> Voltar para projetos
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowArchived(true)}
              >
                <EyeOff aria-hidden /> Ocultos
              </Button>
              <Button type="button" onClick={() => overlays.openProject(null)}>
                <Plus aria-hidden /> Novo projeto
              </Button>
            </>
          )
        }
      />

      {!showArchived && (tasks.data ?? []).length ? (
        <Panel
          title="Carga por projeto"
          description="Demandas não concluídas por projeto, do maior para o menor."
        >
          <ProjectLoadChart tasks={tasks.data ?? []} tones={tones} />
        </Panel>
      ) : null}

      {projects.isPending ? (
        <div className="grid gap-rf-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-56 rounded-[var(--rf-radius-panel)]" />
          ))}
        </div>
      ) : projects.isError ? (
        <QueryError
          message="Não consegui carregar os projetos."
          onRetry={() => void projects.refetch()}
        />
      ) : showing.length ? (
        showArchived ? (
          <div className="flex flex-col gap-rf-3">
            {showing.map((project) => (
              <ArchivedRow key={project.id} project={project} onOpen={onOpen} />
            ))}
          </div>
        ) : (
          <div className="grid gap-rf-4 md:grid-cols-2 xl:grid-cols-3">
            {showing.map((project) => (
              <ProjectCard key={project.id} project={project} onOpen={onOpen} />
            ))}
          </div>
        )
      ) : (
        <EmptyState
          illustration={showArchived ? "archive" : "document"}
          title={showArchived ? "Nenhum projeto oculto" : "Nenhum projeto ainda"}
          description={
            showArchived
              ? "Nada se perde — use o ícone de ocultar num projeto para guardá-lo aqui."
              : "Crie o primeiro projeto para agrupar demandas, notas e links."
          }
        />
      )}
    </div>
  )
}

function ArchivedRow({ project, onOpen }: { project: Project; onOpen: (name: string) => void }) {
  const save = useSaveProject()

  return (
    <div className="app-card flex flex-wrap items-center gap-rf-3 px-rf-4 py-rf-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-[var(--rf-radius-card)] bg-[var(--rf-hover)]">
        <Archive className="size-4 text-muted-foreground" aria-hidden />
      </span>
      <button
        type="button"
        onClick={() => onOpen(project.name)}
        className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-foreground outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {project.name}
      </button>
      <span className="rf-caption text-muted-foreground">
        {project.task_ativas} ativa{project.task_ativas === 1 ? "" : "s"}
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="text-[var(--rf-success)]"
        disabled={save.isPending}
        onClick={() =>
          save.mutate(
            { id: project.id, payload: { status: "ativo" } },
            { onSuccess: () => toast("Projeto restaurado ✓") },
          )
        }
      >
        <RotateCcw aria-hidden /> Restaurar
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => onOpen(project.name)}>
        Abrir
      </Button>
    </div>
  )
}

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "demandas", label: "Demandas" },
  { key: "anotacoes", label: "Anotações" },
  { key: "links", label: "Links" },
  { key: "arquivos", label: "Arquivos" },
]

function ProjectCentral({
  name,
  tab,
  onTab,
  onBack,
}: {
  name: string
  tab: TabKey
  onTab: (tab: TabKey) => void
  onBack: () => void
}) {
  const projects = useProjects()
  const overlays = useOverlays()
  const save = useSaveProject()
  const remove = useDeleteProject()
  const { confirm } = useConfirm()
  const project = (projects.data ?? []).find((item) => item.name === name) ?? null
  const archived = project ? (project.status || "ativo") !== "ativo" : false

  const { list } = useAreaTasks("projetos", name)
  const view = useListView()
  const tasks = useTasks()
  const projIdeas = useMemo(
    () =>
      (tasks.data ?? [])
        .filter((task) => task.tipo === "ideia")
        .filter((idea) => {
          const link = (idea.idea_links ?? []).find(
            (item) => item.target_type === "projeto" && item.label === name,
          )
          const deeper = (idea.idea_links ?? []).find(
            (item) => item.target_type === "tarefa" || item.target_type === "rotina",
          )
          return Boolean(link && !deeper)
        }),
    [tasks.data, name],
  )

  const conclused = project ? Math.max(0, project.task_total - project.task_ativas) : 0

  const addLabel =
    tab === "anotacoes"
      ? "Nova anotação"
      : tab === "links"
        ? "Adicionar link"
        : tab === "arquivos"
          ? "Enviar arquivo"
          : "Nova demanda"

  return (
    <div className="flex min-w-0 flex-col gap-rf-5">
      <div className="flex flex-wrap items-center gap-rf-2">
        <Button type="button" variant="ghost" size="sm" onClick={onBack}>
          ‹ Projetos
        </Button>
        {archived ? (
          <span className="inline-flex items-center gap-rf-2 rounded-full bg-[var(--rf-hover)] px-3 py-1 rf-caption text-muted-foreground">
            <EyeOff className="size-3" aria-hidden /> oculto
          </span>
        ) : null}
      </div>

      {project ? (
        <Panel bodyClassName="flex flex-col gap-rf-4">
          <div className="flex flex-wrap items-start gap-rf-4">
            <span className="flex size-14 shrink-0 items-center justify-center rounded-[var(--rf-radius-card)] bg-[var(--rf-hover)]">
              <Layers className="size-6 text-foreground" aria-hidden />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-rf-1">
              <h1 className="truncate text-2xl font-bold tracking-tight text-foreground">
                {project.name}
              </h1>
              {project.scope ? (
                <p className="line-clamp-2 rf-caption text-muted-foreground">{project.scope}</p>
              ) : null}
              {project.people ? (
                <p className="rf-caption text-muted-foreground">
                  Envolvidos: {project.people}
                </p>
              ) : null}
            </div>
            <div className="flex items-center gap-rf-1">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                title={archived ? "Reativar projeto" : "Ocultar projeto"}
                onClick={() =>
                  save.mutate(
                    { id: project.id, payload: { status: archived ? "ativo" : "arquivado" } },
                    {
                      onSuccess: () => {
                        toast(archived ? "Projeto reativado ✓" : "Projeto oculto")
                        onBack()
                      },
                    },
                  )
                }
              >
                {archived ? <Eye aria-hidden /> : <EyeOff aria-hidden />}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                title="Editar projeto"
                onClick={() => overlays.openProject(project)}
              >
                <Pencil aria-hidden />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                title="Excluir projeto"
                onClick={async () => {
                  const ok = await confirm({
                    title: `Excluir o projeto "${project.name}"?`,
                    description:
                      "As demandas continuam existindo, mas ficam sem este agrupador. Notas, links e arquivos do projeto são removidos.",
                    destructive: true,
                  })
                  if (!ok) return
                  remove.mutate(project.id, {
                    onSuccess: () => {
                      toast("Projeto excluído")
                      onBack()
                    },
                  })
                }}
              >
                <Trash2 aria-hidden />
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-rf-3">
            <span className="flex items-center gap-rf-2 rounded-[var(--rf-radius-card)] bg-[var(--rf-hover)]/60 px-rf-3 py-rf-2">
              <Dot tone="muted" />
              <span className="rf-caption text-foreground">
                <strong className="font-semibold">{project.task_ativas}</strong> abertas
              </span>
            </span>
            <span className="flex items-center gap-rf-2 rounded-[var(--rf-radius-card)] bg-[var(--rf-hover)]/60 px-rf-3 py-rf-2">
              <Dot tone="green" />
              <span className="rf-caption text-foreground">
                <strong className="font-semibold">{conclused}</strong> concluídas
              </span>
            </span>
            <Button
              type="button"
              size="sm"
              className="ml-auto"
              onClick={() => {
                if (tab === "anotacoes") {
                  document.getElementById("notes-new")?.click()
                } else if (tab === "links") {
                  document
                    .querySelector<HTMLInputElement>('input[placeholder^="Cole o link"]')
                    ?.focus()
                } else if (tab === "arquivos") {
                  document
                    .querySelector<HTMLInputElement>('[data-slot="attachments"] input[type=file]')
                    ?.click()
                } else {
                  overlays.openTask(null, { tipo: "tarefa", projeto: name })
                }
              }}
            >
              <Plus aria-hidden /> {addLabel}
            </Button>
          </div>
        </Panel>
      ) : null}

      <Tabs value={tab} onValueChange={(value) => onTab(value as TabKey)}>
        <TabsList>
          {TABS.map((item) => (
            <TabsTrigger key={item.key} value={item.key}>
              {item.label}
              {item.key === "demandas" && project?.task_ativas
                ? ` · ${project.task_ativas}`
                : ""}
              {item.key === "links" && project?.links?.length
                ? ` · ${project.links.length}`
                : ""}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {!project ? (
        <QueryError
          message="Projeto não encontrado (foi excluído?)."
          onRetry={() => void projects.refetch()}
        />
      ) : tab === "anotacoes" ? (
        <NotesPanel project={project} />
      ) : tab === "links" ? (
        <LinksHub project={project} />
      ) : tab === "arquivos" ? (
        <Panel bodyClassName="min-w-0">
          <div data-slot="attachments">
            <Attachments ownerType="project" ownerId={project.id} />
          </div>
        </Panel>
      ) : (
        <div className="flex flex-col gap-rf-4">
          <ViewToolbar />
          <TaskBoard
            tasks={list}
            view={view.view}
            hideProjeto
            emptyMessage="Nenhuma demanda por aqui"
            emptyHint="Adicione a primeira demanda deste projeto."
          />
          {projIdeas.length ? (
            <div className="flex flex-col gap-rf-3">
              <h2 className="rf-label text-muted-foreground">Ideias deste projeto</h2>
              <div className="grid grid-cols-1 gap-rf-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {projIdeas.map((idea) => (
                  <Postit key={idea.id} idea={idea} />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}
