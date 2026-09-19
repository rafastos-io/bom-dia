import { Button } from "@rafastos/ui/button"
import { Input } from "@rafastos/ui/input"
import { NativeSelect, NativeSelectOption } from "@rafastos/ui/native-select"
import { cn } from "cn"
import { FolderPlus, X } from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { openLink } from "@/lib/open"
import { useSaveProject } from "@/lib/queries"
import type { Project, ProjectLink } from "@/lib/types"

export function LinksHub({ project }: { project: Project }) {
  const save = useSaveProject()
  const [kind, setKind] = useState<"web" | "pasta">("web")
  const [grupo, setGrupo] = useState("")
  const [label, setLabel] = useState("")
  const [target, setTarget] = useState("")

  const links = useMemo(() => project.links ?? [], [project.links])

  const groupNames = useMemo(
    () =>
      [...new Set(links.map((link) => (link.grupo || "").trim()).filter(Boolean))].sort(
        (a, b) => a.localeCompare(b, "pt-BR"),
      ),
    [links],
  )

  const persist = async (next: ProjectLink[]) => {
    if (project.id == null) return
    try {
      await save.mutateAsync({ id: project.id, payload: { links: next } })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não deu pra salvar os links")
    }
  }

  async function add() {
    const trimmed = target.trim()
    if (!trimmed) {
      toast.error("Cola um link ou caminho")
      return
    }
    await persist([
      ...links,
      { kind, grupo: grupo.trim(), label: label.trim(), target: trimmed },
    ])
    setTarget("")
    setLabel("")
  }

  const buckets = useMemo(() => {
    const order: string[] = []
    const map = new Map<string, Array<{ link: ProjectLink; index: number }>>()
    links.forEach((link, index) => {
      const group = (link.grupo || "").trim()
      if (!map.has(group)) {
        map.set(group, [])
        order.push(group)
      }
      map.get(group)?.push({ link, index })
    })
    const named = order.filter(Boolean).sort((a, b) => a.localeCompare(b, "pt-BR"))
    if (map.has("")) named.push("")
    return named.map((group) => ({ group, items: map.get(group) ?? [] }))
  }, [links])

  return (
    <div className="space-y-5">
      <div className="rf-content-well grid grid-cols-1 gap-2 p-3 sm:grid-cols-[7rem_10rem_10rem_1fr_auto]">
        <NativeSelect
          aria-label="Tipo"
          size="sm"
          value={kind}
          onChange={(event) => setKind(event.target.value as "web" | "pasta")}
        >
          <NativeSelectOption value="web">Web</NativeSelectOption>
          <NativeSelectOption value="pasta">Pasta</NativeSelectOption>
        </NativeSelect>
        <Input
          className="h-8"
          list="linkhub-groups"
          placeholder="Categoria (ex: Leads)"
          value={grupo}
          onChange={(event) => setGrupo(event.target.value)}
        />
        <datalist id="linkhub-groups">
          {groupNames.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        <Input
          className="h-8"
          placeholder="Apelido (opcional)"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
        />
        <Input
          className="h-8"
          placeholder="Cole o link (https://...) ou o caminho da pasta"
          value={target}
          onChange={(event) => setTarget(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault()
              void add()
            }
          }}
        />
        <Button
          type="button"
          size="sm"
          onClick={() => void add()}
          disabled={save.isPending}
        >
          <FolderPlus aria-hidden /> Adicionar
        </Button>
      </div>

      {!links.length ? (
        <p className="rf-content-well px-6 py-10 text-center text-sm text-muted-foreground">
          Nenhum link ainda. Canalize aqui todos os links deste projeto — organize por
          categoria (Leads, Visitas, Identidade visual…).
        </p>
      ) : (
        <div className="space-y-4">
          {buckets.map(({ group, items }) => (
            <section key={group || "__none"} className="space-y-1.5">
              <h3 className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                <span>{group || "Sem categoria"}</span>
                <span className="font-mono text-[10px]">{items.length}</span>
              </h3>
              <ul className="space-y-1.5">
                {items.map(({ link, index }) => (
                  <li
                    key={`${link.target}-${index}`}
                    className="flex flex-wrap items-center gap-2 rounded-[var(--rf-radius-control)] bg-surface px-3 py-2 shadow-subtle"
                  >
                    <button
                      type="button"
                      onClick={() => void openLink(link.kind, link.target)}
                      title={link.target}
                      className="min-w-0 flex-1 truncate text-left text-sm outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      {link.label || link.target}
                    </button>
                    <NativeSelect
                      size="sm"
                      className="w-40"
                      aria-label="Mover para categoria"
                      value={group}
                      onChange={async (event) => {
                        let value = event.target.value
                        if (value === "__new__") {
                          value = (window.prompt("Nome da nova categoria:") || "").trim()
                          if (!value) return
                        }
                        const next = links.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, grupo: value } : item,
                        )
                        await persist(next)
                      }}
                    >
                      <NativeSelectOption value="">Sem categoria</NativeSelectOption>
                      {groupNames.map((name) => (
                        <NativeSelectOption key={name} value={name}>
                          {name}
                        </NativeSelectOption>
                      ))}
                      <NativeSelectOption value="__new__">+ Nova categoria…</NativeSelectOption>
                    </NativeSelect>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Remover link"
                      onClick={() =>
                        void persist(links.filter((_, itemIndex) => itemIndex !== index))
                      }
                    >
                      <X aria-hidden />
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {save.isPending ? (
        <p className={cn("text-center font-mono text-[10px] text-muted-foreground")}>
          salvando…
        </p>
      ) : null}
    </div>
  )
}
