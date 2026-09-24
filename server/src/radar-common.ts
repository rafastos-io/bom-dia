/**
 * Tipos e helpers compartilhados do radar da CENTRAL.
 *
 * Ficam aqui (e nao em radar.ts) para o espelho de demandas usar o mesmo
 * `item_hash` sem criar ciclo de importacao entre os modulos.
 */

import { createHash } from "node:crypto"

export const RADAR_KINDS = ["progresso", "aberto", "proxima_acao", "decisao"] as const
export type RadarKind = (typeof RADAR_KINDS)[number]

export type RadarSubtaskInput = { text: string; done: boolean }

export type RadarEntryInput = {
  kind: RadarKind
  text: string
  date: string
  section: string
  subtasks: RadarSubtaskInput[]
}

export type RadarNoteInput = {
  path: string
  title: string
  tipo: string
  area: string
  produto: string
  projeto: string
  status: string
  updatedAt: string
  mtime: string
  hash: string
  links: string[]
  scope: string
  repositorio: string
  caminhoLocal: string
  entries: RadarEntryInput[]
}

export type RadarIngest = { notes: RadarNoteInput[]; deleted: string[] }

const CLOSED_STATUS = new Set([
  "concluido",
  "concluida",
  "arquivado",
  "arquivada",
  "encerrado",
  "encerrada",
  "inativo",
  "inativa",
  "substituido",
  "substituida",
])

/** Nota encerrada/arquivada deixa de alimentar o radar e o espelho. */
export function isClosedNoteStatus(value: string): boolean {
  return CLOSED_STATUS.has(
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim(),
  )
}

/** Hash estavel de uma entrada (nota + tipo + texto normalizado). */
export function itemHash(notePath: string, kind: string, text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim()
  return createHash("sha256")
    .update(`${notePath}\u0000${kind}\u0000${normalized}`)
    .digest("hex")
}
