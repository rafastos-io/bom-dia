import { Button } from "@rafastos/ui/button"
import { Progress } from "@rafastos/ui/progress"
import { cn } from "cn"
import {
  Download,
  FileText,
  Image as ImageIcon,
  Paperclip,
  Trash2,
  Upload,
} from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { apiAttachments } from "@/lib/api"
import {
  useAiStatus,
  useAttachments,
  useDeleteAttachment,
  useUploadAttachment,
} from "@/lib/queries"
import { fmtBytes, isImageAttachment } from "@/lib/tasks"
import type { Attachment } from "@/lib/types"
import { useConfirm } from "./app/confirm"
import { Lightbox } from "./lightbox"

type PendingUpload = { id: string; name: string; percent: number }

type AttachmentsProps = {
  ownerType: "task" | "project"
  ownerId: number | null
  /** Ctrl+V cola prints como anexo (só no modal de tarefa). */
  enablePaste?: boolean
}

export function Attachments({ ownerType, ownerId, enablePaste }: AttachmentsProps) {
  const status = useAiStatus()
  const list = useAttachments(ownerType, ownerId)
  const upload = useUploadAttachment(ownerType, ownerId)
  const remove = useDeleteAttachment(ownerType, ownerId)
  const { confirm } = useConfirm()
  const inputRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<PendingUpload[]>([])
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null)
  const [dragging, setDragging] = useState(false)

  const maxMb = status.data?.max_upload_mb ?? 25
  const storageOff = status.data?.storage === false

  const send = useCallback(
    (files: FileList | File[]) => {
      const arr = [...files]
      if (!arr.length || !ownerId) return
      for (const file of arr) {
        if (file.size > maxMb * 1024 * 1024) {
          toast.error(`"${file.name}" passa de ${maxMb} MB`)
          continue
        }
        const id = `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2)}`
        setPending((current) => [...current, { id, name: file.name, percent: 0 }])
        upload
          .mutateAsync({
            file,
            onProgress: (percent) =>
              setPending((current) =>
                current.map((item) => (item.id === id ? { ...item, percent } : item)),
              ),
          })
          .catch((error) => {
            toast.error(error instanceof Error ? error.message : "Falha no upload")
          })
          .finally(() => {
            setPending((current) => current.filter((item) => item.id !== id))
          })
      }
    },
    [ownerId, maxMb, upload],
  )

  useEffect(() => {
    if (!enablePaste || !ownerId) return
    const onPaste = (event: ClipboardEvent) => {
      const items = event.clipboardData?.items
      if (!items) return
      const files: File[] = []
      for (const item of items) {
        if (item.kind === "file" && (item.type || "").startsWith("image/")) {
          const file = item.getAsFile()
          if (file) {
            const ext = (file.type.split("/")[1] || "png").replace("jpeg", "jpg")
            files.push(
              new File([file], `colado-${Date.now()}.${ext}`, { type: file.type }),
            )
          }
        }
      }
      if (!files.length) return
      event.preventDefault()
      toast("Enviando imagem colada…")
      send(files)
    }
    document.addEventListener("paste", onPaste)
    return () => document.removeEventListener("paste", onPaste)
  }, [enablePaste, ownerId, send])

  if (!ownerId) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Paperclip className="size-3.5" aria-hidden />
        Salve primeiro para anexar arquivos.
      </p>
    )
  }

  if (storageOff) {
    return (
      <p className="text-xs text-muted-foreground">
        Anexos indisponíveis neste ambiente.
      </p>
    )
  }

  const items = list.data ?? []

  return (
    <div className="space-y-3">
      <div
        role="button"
        tabIndex={0}
        aria-label="Adicionar arquivos"
        onClick={() => inputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault()
            inputRef.current?.click()
          }
        }}
        onDragEnter={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          if (event.dataTransfer?.files) send(event.dataTransfer.files)
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center gap-1.5 rounded-[var(--rf-radius-card)] border border-dashed border-[var(--rf-field)] px-4 py-5 text-center text-xs text-muted-foreground transition-colors outline-none",
          "hover:border-action/40 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
          dragging && "border-action bg-hover text-foreground",
        )}
      >
        <Upload className="size-4" aria-hidden />
        <span>
          Arraste aqui ou <u>escolha arquivos</u>
        </span>
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          onChange={(event) => {
            if (event.target.files) send(event.target.files)
            event.target.value = ""
          }}
        />
      </div>

      {pending.length ? (
        <ul className="space-y-2" aria-live="polite">
          {pending.map((item) => (
            <li
              key={item.id}
              className="space-y-1 rounded-[var(--rf-radius-control)] bg-[var(--rf-field)] px-3 py-2"
            >
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate">{item.name}</span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {item.percent}%
                </span>
              </div>
              <Progress value={item.percent} className="h-1" />
            </li>
          ))}
        </ul>
      ) : null}

      {items.length ? (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2" aria-live="polite">
          {items.map((attachment) => (
            <AttachmentCard
              key={attachment.id}
              attachment={attachment}
              onOpenImage={(src, alt) => setLightbox({ src, alt })}
              onRemove={async () => {
                const ok = await confirm({
                  title: "Remover este arquivo?",
                  description: "O arquivo sai do R2 e não pode ser recuperado.",
                  destructive: true,
                  confirmLabel: "Remover",
                })
                if (!ok) return
                remove.mutate(attachment.id, {
                  onSuccess: () => toast("Arquivo removido"),
                  onError: (error) =>
                    toast.error(error instanceof Error ? error.message : "Falha ao remover"),
                })
              }}
            />
          ))}
        </ul>
      ) : pending.length ? null : (
        <p className="text-xs text-muted-foreground">Nenhum arquivo ainda.</p>
      )}

      <Lightbox
        src={lightbox?.src ?? null}
        alt={lightbox?.alt}
        onClose={() => setLightbox(null)}
      />
    </div>
  )
}

function AttachmentCard({
  attachment,
  onOpenImage,
  onRemove,
}: {
  attachment: Attachment
  onOpenImage: (src: string, alt: string) => void
  onRemove: () => void
}) {
  const url = apiAttachments.downloadUrl(attachment.id)
  const image = isImageAttachment(attachment.content_type)
  const isPdf =
    attachment.content_type?.includes("pdf") ||
    attachment.filename.toLowerCase().endsWith(".pdf")

  const thumb = image ? (
    <img src={url} alt="" loading="lazy" className="size-11 shrink-0 rounded-md object-cover" />
  ) : (
    <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-hover text-muted-foreground">
      {isPdf ? <FileText className="size-5" aria-hidden /> : <ImageIcon className="size-5" aria-hidden />}
    </span>
  )

  return (
    <li className="flex items-center gap-3 rounded-[var(--rf-radius-card)] bg-surface px-3 py-2 shadow-subtle">
      {image ? (
        <button
          type="button"
          className="shrink-0 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          onClick={() => onOpenImage(url, attachment.filename)}
          title="Abrir"
        >
          {thumb}
        </button>
      ) : (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          title="Abrir"
          className="shrink-0 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {thumb}
        </a>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm" title={attachment.filename}>
          {attachment.filename}
        </div>
        <div className="font-mono text-[10px] text-muted-foreground">
          {fmtBytes(attachment.size)}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        <Button asChild variant="ghost" size="icon-sm" title="Baixar">
          <a href={url} download={attachment.filename}>
            <Download aria-hidden />
          </a>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          title="Remover"
          onClick={onRemove}
        >
          <Trash2 aria-hidden />
        </Button>
      </div>
    </li>
  )
}
