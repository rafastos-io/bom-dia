import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@rafastos/ui/dialog"
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@rafastos/ui/drawer"
import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { useIsCompact } from "@/lib/use-media-query"

/**
 * Dialog no desktop e bottom-sheet no mobile (mesmo conteudo).
 * Usa o breakpoint compacto (<=619px) igual ao modal de tarefa.
 */
export function AppDialog({
  open,
  onOpenChange,
  title,
  description,
  header,
  children,
  dialogClassName,
  bodyClassName,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  header?: ReactNode
  children: ReactNode
  dialogClassName?: string
  bodyClassName?: string
}) {
  const compact = useIsCompact()

  if (compact) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[94dvh]">
          <DrawerHeader className="text-left">
            <DrawerTitle>{title}</DrawerTitle>
          </DrawerHeader>
          <div
            className={cn(
              "overflow-y-auto px-rf-4 pb-[calc(20px+env(safe-area-inset-bottom))]",
              bodyClassName,
            )}
          >
            {children}
          </div>
        </DrawerContent>
      </Drawer>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("sm:max-w-md", dialogClassName)}>
        <DialogHeader>
          {header ?? (
            <>
              <DialogTitle>{title}</DialogTitle>
              {description ? (
                <DialogDescription>{description}</DialogDescription>
              ) : (
                <DialogDescription className="sr-only">{title}</DialogDescription>
              )}
            </>
          )}
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  )
}
