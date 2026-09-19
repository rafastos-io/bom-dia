import { Button } from "@rafastos/ui/button"
import {
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@rafastos/ui/dialog"
import { Spinner } from "@rafastos/ui/spinner"
import { Textarea } from "@rafastos/ui/textarea"
import { Check, Copy, MessageSquare, RefreshCw, Users } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { AppDialog } from "@/components/app/app-dialog"
import { Mascot } from "@/components/app/mascot"
import { useAiWhatsapp } from "@/lib/queries"
import type { Task } from "@/lib/types"

type WhatsappDialogProps = {
  task: Task | null
  onClose: () => void
}

type Modo = "avisar" | "delegar"

const MAX_CHARS = 2000

export function WhatsappDialog({ task, onClose }: WhatsappDialogProps) {
  const generate = useAiWhatsapp()
  const [modo, setModo] = useState<Modo>("avisar")
  const [text, setText] = useState("")

  useEffect(() => {
    if (!task) return
    let cancelled = false
    generate
      .mutateAsync({ task, modo: "avisar" })
      .then((result) => {
        if (!cancelled) setText(result.mensagem || "")
      })
      .catch((error) => {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : "Não deu pra gerar o recado")
        }
      })
    return () => {
      cancelled = true
    }
    // Gera uma vez por tarefa aberta (o diálogo remonta a cada abertura).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task])

  async function regenerate(nextModo: Modo) {
    if (!task) return
    setModo(nextModo)
    setText("")
    try {
      const result = await generate.mutateAsync({ task, modo: nextModo })
      if (result.mensagem) setText(result.mensagem)
      else toast.error("Não deu pra gerar. Tenta de novo?")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não deu pra gerar o recado")
    }
  }

  async function copy() {
    if (!text.trim()) {
      toast.error("Nada pra copiar ainda.")
      return
    }
    try {
      await navigator.clipboard.writeText(text)
      toast.success("Copiado ✓")
    } catch {
      toast.error("Não consegui copiar")
    }
  }

  const options: Array<{
    key: Modo
    title: string
    description: string
    icon: typeof MessageSquare
    selectedClass: string
  }> = [
    {
      key: "avisar",
      title: "Avisar solicitante",
      description: "Update direto para quem pediu",
      icon: MessageSquare,
      selectedClass:
        "border-[color-mix(in_srgb,var(--app-dot-green)_55%,transparent)] bg-[color-mix(in_srgb,var(--app-dot-green)_10%,transparent)]",
    },
    {
      key: "delegar",
      title: "Delegar para o time",
      description: "Briefing interno da equipe",
      icon: Users,
      selectedClass:
        "border-[color-mix(in_srgb,var(--app-ai)_55%,transparent)] bg-[var(--app-ai-soft)]",
    },
  ]

  return (
    <AppDialog
      open={Boolean(task)}
      onOpenChange={(open) => !open && onClose()}
      title="Recado pro WhatsApp"
      dialogClassName="sm:max-w-3xl"
      header={
        <>
          <DialogTitle className="flex items-center gap-rf-2">
            <MessageSquare className="size-5 text-[var(--app-dot-green)]" aria-hidden />
            Recado pro WhatsApp
          </DialogTitle>
          <DialogDescription className="sr-only">
            Gere uma mensagem a partir da tarefa e copie.
          </DialogDescription>
        </>
      }
    >
      <div className="grid gap-rf-4 sm:grid-cols-[210px_minmax(0,1fr)]">
          <div className="hidden flex-col items-center justify-center gap-rf-3 sm:flex">
            <Mascot name={modo === "avisar" ? "phone" : "pockets"} className="h-52" />
            <p
              className={
                modo === "avisar"
                  ? "rounded-[var(--rf-radius-card)] bg-[color-mix(in_srgb,var(--app-dot-green)_12%,transparent)] px-rf-3 py-rf-2 text-center rf-caption text-foreground"
                  : "rounded-[var(--rf-radius-card)] bg-[var(--app-ai-soft)] px-rf-3 py-rf-2 text-center rf-caption text-foreground"
              }
            >
              {modo === "avisar"
                ? "Mensagem pronta para enviar!"
                : "Tudo certo! Vou preparar o briefing pro time."}
            </p>
          </div>

          <div className="flex min-w-0 flex-col gap-rf-4">
            <div className="grid gap-rf-2">
              {options.map((option) => {
                const active = modo === option.key
                return (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => regenerate(option.key)}
                    className={`flex items-center gap-rf-3 rounded-[var(--rf-radius-card)] border px-rf-3 py-rf-3 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 ${
                      active ? option.selectedClass : "border-[var(--rf-border)] hover:bg-[var(--rf-hover)]/60"
                    }`}
                  >
                    <option.icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-sm font-medium text-foreground">{option.title}</span>
                      <span className="rf-caption text-muted-foreground">
                        {option.description}
                      </span>
                    </span>
                    {active ? <Check className="size-4 text-foreground" aria-hidden /> : null}
                  </button>
                )
              })}
            </div>

            <div className="flex flex-col gap-rf-2">
              <span className="flex items-center justify-between rf-caption text-muted-foreground">
                <span>Mensagem</span>
                <span className="font-mono">
                  {text.length}/{MAX_CHARS}
                </span>
              </span>
              <Textarea
                rows={9}
                value={text}
                maxLength={MAX_CHARS}
                onChange={(event) => setText(event.target.value)}
                placeholder={generate.isPending ? "Gerando o recado..." : "O recado aparece aqui"}
                aria-busy={generate.isPending}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={generate.isPending}
                onClick={() => regenerate(modo)}
              >
                {generate.isPending ? <Spinner /> : <RefreshCw aria-hidden />}
                Gerar nova versão
              </Button>
              <div className="flex-1" />
              <Button type="button" variant="ghost" size="sm" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="button" size="sm" onClick={copy} disabled={!text.trim()}>
                <Copy aria-hidden /> Copiar mensagem
              </Button>
            </DialogFooter>
          </div>
        </div>
    </AppDialog>
  )
}
