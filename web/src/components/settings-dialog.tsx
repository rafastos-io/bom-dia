import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@rafastos/ui/dialog"
import { Button } from "@rafastos/ui/button"
import { Input } from "@rafastos/ui/input"
import { Spinner } from "@rafastos/ui/spinner"
import { Brain, Monitor, Moon, Sun } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { Dot } from "@/components/app/dot"
import { MascotAvatar } from "@/components/app/mascot"
import { Segmented } from "@/components/app/segmented"
import { useTheme } from "@/components/theme-provider"
import { useAiStatus, useSaveAiConfig } from "@/lib/queries"
import type { ThemeMode } from "@/lib/theme"

type SettingsDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const status = useAiStatus()
  const save = useSaveAiConfig()
  const { theme, setTheme } = useTheme()
  // O diálogo remonta a cada abertura (key no AppShell), então o estado inicial basta.
  const [name, setName] = useState(status.data?.name ?? "")
  const [key, setKey] = useState("")

  const configured = status.data?.configured ?? false

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const payload: { name?: string; openai_api_key?: string } = { name: name.trim() }
    if (key.trim()) payload.openai_api_key = key.trim()
    try {
      await save.mutateAsync(payload)
      toast.success("Ajustes salvos")
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader className="items-start gap-rf-3 sm:flex-row sm:items-center">
          <MascotAvatar className="size-12" />
          <div className="flex min-w-0 flex-col gap-rf-1">
            <DialogTitle>Ajustes</DialogTitle>
            <DialogDescription>Personalize sua experiência no Bom Dia.</DialogDescription>
          </div>
        </DialogHeader>

        <form onSubmit={submit} className="flex flex-col gap-rf-5">
          <label className="flex flex-col gap-rf-2">
            <span className="rf-caption font-medium text-foreground">
              Seu nome (pra saudação)
            </span>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Rafael"
              autoComplete="off"
            />
          </label>

          <div className="flex flex-col gap-rf-2">
            <span className="rf-caption font-medium text-foreground">Aparência do app</span>
            <Segmented<ThemeMode>
              ariaLabel="Aparência do app"
              value={theme}
              onChange={(value) => setTheme(value)}
              className="w-full justify-between sm:w-fit sm:justify-start"
              items={[
                { value: "light", label: "Claro", icon: <Sun className="size-3.5" aria-hidden /> },
                { value: "dark", label: "Escuro", icon: <Moon className="size-3.5" aria-hidden /> },
                {
                  value: "system",
                  label: "Sistema",
                  icon: <Monitor className="size-3.5" aria-hidden />,
                },
              ]}
            />
          </div>

          <div className="flex flex-col gap-rf-3 rounded-[var(--rf-radius-card)] bg-[var(--rf-hover)]/60 p-rf-4">
            <div className="flex items-center gap-rf-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--app-ai-soft)]">
                <Brain className="size-5 text-[var(--app-ai)]" aria-hidden />
              </span>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="flex items-center gap-rf-2 text-sm font-semibold text-foreground">
                  Poohzera
                  <Dot tone={configured ? "green" : "muted"} />
                </span>
                <span className="rf-caption text-muted-foreground">
                  {configured
                    ? "Conectada"
                    : "Sem chave — a Poohzera não organiza capturas"}
                  {status.data ? ` · ${status.data.model}` : ""}
                </span>
              </div>
            </div>
            <label className="flex flex-col gap-rf-2">
              <span className="rf-caption font-medium text-foreground">Chave da OpenAI</span>
              <Input
                type="password"
                value={key}
                onChange={(event) => setKey(event.target.value)}
                placeholder={configured ? "•••••••• (configurada)" : "sk-…"}
                autoComplete="off"
              />
            </label>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? <Spinner /> : null}
              Salvar alterações
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
