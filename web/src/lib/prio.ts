import type { Prioridade } from "./types"

/** Cores de status por prioridade (únicos lugares com cor viva, além de atrasos). */
export const PRIO_COLOR: Record<Prioridade, string> = {
  alta: "var(--rf-error)",
  media: "var(--rf-warning)",
  baixa: "var(--rf-success)",
}
