import { Button } from "@rafastos/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@rafastos/ui/dialog"
import { Input } from "@rafastos/ui/input"
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react"

type ConfirmOptions = {
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
}

type PromptOptions = {
  title: string
  description?: string
  placeholder?: string
  initialValue?: string
  confirmLabel?: string
  cancelLabel?: string
}

type ConfirmContextValue = {
  confirm: (options: ConfirmOptions) => Promise<boolean>
  prompt: (options: PromptOptions) => Promise<string | null>
}

type DialogState =
  | { kind: "confirm"; options: ConfirmOptions; resolve: (value: boolean) => void }
  | { kind: "prompt"; options: PromptOptions; resolve: (value: string | null) => void }

const ConfirmContext = createContext<ConfirmContextValue | null>(null)

/** Diálogos de confirmação/entrada no padrão do app (substituem confirm/prompt nativos). */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DialogState | null>(null)
  const [text, setText] = useState("")

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => setState({ kind: "confirm", options, resolve })),
    [],
  )

  const prompt = useCallback(
    (options: PromptOptions) =>
      new Promise<string | null>((resolve) => {
        setText(options.initialValue ?? "")
        setState({ kind: "prompt", options, resolve })
      }),
    [],
  )

  const settle = useCallback((result: boolean | string | null) => {
    setState((current) => {
      if (!current) return null
      if (current.kind === "confirm") current.resolve(result === true)
      else current.resolve(typeof result === "string" ? result : null)
      return null
    })
  }, [])

  const ctxValue = useMemo(() => ({ confirm, prompt }), [confirm, prompt])

  const close = (result: boolean | string | null) => settle(result)

  return (
    <ConfirmContext.Provider value={ctxValue}>
      {children}
      <Dialog
        open={Boolean(state)}
        onOpenChange={(open) => {
          if (open) return
          close(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          {state ? (
            <>
              <DialogHeader>
                <DialogTitle>{state.options.title}</DialogTitle>
                {state.options.description ? (
                  <DialogDescription>{state.options.description}</DialogDescription>
                ) : null}
              </DialogHeader>

              {state.kind === "prompt" ? (
                <Input
                  autoFocus
                  value={text}
                  placeholder={state.options.placeholder}
                  onChange={(event) => setText(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault()
                      close(text.trim())
                    }
                  }}
                />
              ) : null}

              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => close(null)}>
                  {state.options.cancelLabel ?? "Cancelar"}
                </Button>
                <Button
                  type="button"
                  variant={
                    state.kind === "confirm" && state.options.destructive
                      ? "destructive"
                      : "default"
                  }
                  onClick={() => close(state.kind === "prompt" ? text.trim() : true)}
                >
                  {state.options.confirmLabel ??
                    (state.kind === "prompt"
                      ? "Salvar"
                      : state.options.destructive
                        ? "Excluir"
                        : "Confirmar")}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  )
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error("useConfirm precisa do ConfirmProvider")
  return ctx
}
