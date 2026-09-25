import { toast } from "sonner"
import { apiOpen } from "./api"
import type { LinkKind } from "./types"

/** Nome do vault do Obsidian (pasta `CENTRAL\Rafael`). */
const OBSIDIAN_VAULT = "Rafael"

/** URL do Obsidian para uma nota do vault (aceita path com ou sem `.md`). */
export function obsidianUrl(notePath: string): string {
  const file = notePath.replace(/\.md$/i, "")
  return `obsidian://open?vault=${encodeURIComponent(OBSIDIAN_VAULT)}&file=${encodeURIComponent(file)}`
}

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
  if (kind === "nota" && !/^obsidian:\/\//i.test(url)) url = obsidianUrl(url)
  if (/^obsidian:\/\//i.test(url)) {
    // Protocolo customizado pede navegacao direta (window.open costuma ser bloqueado).
    window.location.href = url
    return
  }
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`
  window.open(url, "_blank", "noopener,noreferrer")
}
