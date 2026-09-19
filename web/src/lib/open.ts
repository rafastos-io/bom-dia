import { toast } from "sonner"
import { apiOpen } from "./api"
import type { LinkKind } from "./types"

export async function openLink(kind: LinkKind | string, target: string) {
  if (kind === "pasta") {
    try {
      const result = await apiOpen.path(target)
      if (result.ok) toast("Abrindo pasta...")
      else toast.error(result.message || "Não consegui abrir a pasta")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não consegui abrir a pasta")
    }
    return
  }
  let url = target
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`
  window.open(url, "_blank", "noopener,noreferrer")
}
