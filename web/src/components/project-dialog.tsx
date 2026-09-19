import { Button } from "@rafastos/ui/button"
import { DialogFooter } from "@rafastos/ui/dialog"
import { Input } from "@rafastos/ui/input"
import { Spinner } from "@rafastos/ui/spinner"
import { Textarea } from "@rafastos/ui/textarea"
import { Trash2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { useDeleteProject, useSaveProject } from "@/lib/queries"
import type { Project } from "@/lib/types"
import { AppDialog } from "./app/app-dialog"
import { useConfirm } from "./app/confirm"

type ProjectDialogProps = {
  project: Project | null | undefined
  open: boolean
  onOpenChange: (open: boolean) => void
  onDeleted?: () => void
}

export function ProjectDialog({
  project,
  open,
  onOpenChange,
  onDeleted,
}: ProjectDialogProps) {
  const save = useSaveProject()
  const remove = useDeleteProject()
  const { confirm } = useConfirm()
  // O diálogo remonta a cada abertura (key no provider), então o estado inicial basta.
  const [name, setName] = useState(project?.name ?? "")
  const [scope, setScope] = useState(project?.scope ?? "")
  const [people, setPeople] = useState(project?.people ?? "")

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      toast.error("Dá um nome ao projeto")
      return
    }
    try {
      await save.mutateAsync({
        id: project?.id,
        payload: { name: trimmed, scope: scope.trim(), people: people.trim() },
      })
      toast.success("Projeto salvo ✓")
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não deu pra salvar")
    }
  }

  async function removeProject() {
    if (!project) return
    const ok = await confirm({
      title: `Excluir o projeto "${project.name}"?`,
      description: "As demandas continuam existindo, mas ficam sem este agrupador.",
      destructive: true,
    })
    if (!ok) return
    try {
      await remove.mutateAsync(project.id)
      toast("Projeto excluído")
      onOpenChange(false)
      onDeleted?.()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não deu pra excluir")
    }
  }

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      title={project ? "Editar projeto" : "Novo projeto"}
      description="Nome, escopo e envolvidos do projeto."
    >
      <form onSubmit={submit} className="flex flex-col gap-rf-4">
        <div className="flex flex-col gap-rf-2">
          <label className="rf-caption font-medium text-foreground" htmlFor="proj-name">
            Nome do projeto
          </label>
            <Input
              id="proj-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ex: GRUPO URBAN"
              required
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-rf-2">
            <label className="rf-caption font-medium text-foreground" htmlFor="proj-scope">
              Escopo <span className="font-normal text-muted-foreground">(o que é este projeto)</span>
            </label>
            <Textarea
              id="proj-scope"
              rows={3}
              value={scope}
              onChange={(event) => setScope(event.target.value)}
              placeholder="Visão geral, objetivo, contexto..."
            />
          </div>
          <div className="flex flex-col gap-rf-2">
            <label className="rf-caption font-medium text-foreground" htmlFor="proj-people">
              Envolvidos{" "}
              <span className="font-normal text-muted-foreground">(pessoas fixas do projeto)</span>
            </label>
            <Input
              id="proj-people"
              value={people}
              onChange={(event) => setPeople(event.target.value)}
              placeholder="Ex: Adriano, Rodrigo, equipe de design"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Os links e pastas ficam na aba Links do projeto, organizados por categoria.
          </p>
          <DialogFooter>
            {project ? (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={removeProject}
              >
                <Trash2 aria-hidden /> Excluir
              </Button>
            ) : null}
            <div className="flex-1" />
            <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" size="sm" disabled={save.isPending}>
              {save.isPending ? <Spinner /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </form>
    </AppDialog>
  )
}
