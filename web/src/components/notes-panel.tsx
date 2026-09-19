import { Button } from "@rafastos/ui/button"
import { Input } from "@rafastos/ui/input"
import { Skeleton } from "@rafastos/ui/skeleton"
import { Textarea } from "@rafastos/ui/textarea"
import { cn } from "cn"
import { Plus, X } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { useDeleteNote, useNotes, useSaveNote } from "@/lib/queries"
import type { Note, Project } from "@/lib/types"
import { useConfirm } from "./app/confirm"

export function NotesPanel({ project }: { project: Project }) {
  const notes = useNotes(project.id ?? 0)
  const save = useSaveNote(project.id ?? 0)
  const remove = useDeleteNote(project.id ?? 0)
  const { confirm } = useConfirm()
  const [pickedId, setPickedId] = useState<number | null>(null)

  const list = notes.data ?? []
  const activeId = pickedId ?? list[0]?.id ?? null
  const current = list.find((note) => note.id === activeId) ?? null

  async function createNote() {
    if (project.id == null) {
      toast.error("Salve o projeto antes.")
      return
    }
    try {
      const result = await save.mutateAsync({ title: "Nova anotação", body: "" })
      const created = result as { id?: number }
      await notes.refetch()
      if (created?.id) setPickedId(created.id)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não deu pra criar")
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 min-[720px]:grid-cols-[240px_1fr]">
      <div className="space-y-1.5">
        <Button
          type="button"
          id="notes-new"
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => void createNote()}
        >
          <Plus aria-hidden /> Nova anotação
        </Button>
        {notes.isPending ? (
          <Skeleton className="h-24 rounded-[var(--rf-radius-card)]" />
        ) : list.length ? (
          <ul className="space-y-1">
            {list.map((note) => (
              <li key={note.id}>
                <button
                  type="button"
                  onClick={() => setPickedId(note.id)}
                  className={cn(
                    "w-full truncate rounded-[var(--rf-radius-control)] px-3 py-2 text-left text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                    note.id === activeId
                      ? "bg-action text-action-foreground"
                      : "text-muted-foreground hover:bg-hover hover:text-foreground",
                  )}
                >
                  {note.title || "Sem título"}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-1 py-2 text-xs text-muted-foreground">
            Sem anotações ainda. Crie a primeira.
          </p>
        )}
      </div>

      <div className="rf-content-well flex min-h-80 flex-col gap-2 p-3">
        {current ? (
          <NoteEditor
            key={current.id}
            note={current}
          onDelete={async () => {
            const ok = await confirm({
              title: "Excluir esta anotação?",
              destructive: true,
            })
            if (!ok) return
            remove.mutate(current.id, {
                onSuccess: () => {
                  setPickedId(null)
                  toast("Anotação excluída")
                },
              })
            }}
          />
        ) : (
          <p className="m-auto text-sm text-muted-foreground">
            Selecione uma anotação ou crie uma nova.
          </p>
        )}
      </div>
    </div>
  )
}

function NoteEditor({
  note,
  onDelete,
}: {
  note: Note
  onDelete: () => void
}) {
  const save = useSaveNote(note.project_id)
  const [title, setTitle] = useState(note.title)
  const [body, setBody] = useState(note.body)
  const [savedFlash, setSavedFlash] = useState(false)

  async function persist() {
    if (title === note.title && body === note.body) return
    try {
      await save.mutateAsync({ id: note.id, title, body })
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 1500)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não deu pra salvar")
    }
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <Input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={() => void persist()}
          placeholder="Título da anotação"
          className="h-9 flex-1 border-0 bg-transparent px-1 font-medium shadow-none focus-visible:ring-0 dark:bg-transparent"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Excluir anotação"
          onClick={onDelete}
        >
          <X aria-hidden />
        </Button>
      </div>
      <Textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        onBlur={() => void persist()}
        placeholder="Despeje aqui suas ideias, links, rascunhos..."
        className="min-h-64 flex-1 resize-none border-0 bg-transparent px-1 shadow-none focus-visible:ring-0 dark:bg-transparent"
      />
      <div className="h-4 text-right font-mono text-[10px] text-muted-foreground">
        {savedFlash ? "salvo ✓" : ""}
      </div>
    </>
  )
}
