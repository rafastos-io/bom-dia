#!/usr/bin/env node
/**
 * Resumo do que o agente enxerga no vault, sem enviar nada:
 *   npm --prefix agent run summary
 */
import { loadConfig } from "./config.js"
import { collectMarkdown, readNote } from "./scan.js"

const config = loadConfig()
const files = await collectMarkdown(config.centralDir)
const byTipo = new Map()
const byKind = new Map()
const bySection = new Map()
let totalEntries = 0
let withEntries = 0

for (const file of files) {
  let note
  try {
    note = await readNote(config.centralDir, file)
  } catch (error) {
    console.warn(`[radar] falha lendo ${file}: ${error.message}`)
    continue
  }
  const tipo = note.tipo || "(sem tipo)"
  byTipo.set(tipo, (byTipo.get(tipo) ?? 0) + 1)
  if (note.entries.length) withEntries += 1
  for (const entry of note.entries) {
    totalEntries += 1
    byKind.set(entry.kind, (byKind.get(entry.kind) ?? 0) + 1)
    bySection.set(entry.section, (bySection.get(entry.section) ?? 0) + 1)
  }
}

console.log(`arquivos .md: ${files.length} | com entradas: ${withEntries} | entradas: ${totalEntries}`)
console.log("\npor tipo de nota:")
for (const [key, value] of [...byTipo.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(value).padStart(4)}  ${key}`)
}
console.log("\npor kind:")
for (const [key, value] of [...byKind.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(value).padStart(4)}  ${key}`)
}
console.log("\npor secao:")
for (const [key, value] of [...bySection.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(value).padStart(4)}  ${key || "(sem secao)"}`)
}
