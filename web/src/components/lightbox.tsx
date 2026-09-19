import { Dialog, DialogContent, DialogTitle } from "@rafastos/ui/dialog"
import { X } from "lucide-react"

type LightboxProps = {
  src: string | null
  alt?: string
  onClose: () => void
}

export function Lightbox({ src, alt, onClose }: LightboxProps) {
  return (
    <Dialog open={Boolean(src)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="max-h-none w-auto max-w-[96vw] border-0 bg-transparent p-0 shadow-none sm:max-w-[92vw]"
        aria-describedby={undefined}
      >
        <DialogTitle className="sr-only">{alt || "Imagem anexada"}</DialogTitle>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar imagem"
          className="fixed top-[calc(12px+env(safe-area-inset-top))] right-4 z-50 inline-flex size-9 items-center justify-center rounded-full bg-[var(--rf-overlay,rgba(0,0,0,.6))] text-[var(--rf-white)] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <X className="size-5" aria-hidden />
        </button>
        {src ? (
          <img
            src={src}
            alt={alt || ""}
            className="max-h-[86dvh] max-w-full rounded-[var(--rf-radius-card)] object-contain"
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
