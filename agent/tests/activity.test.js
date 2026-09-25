import assert from "node:assert/strict"
import { tmpdir } from "node:os"
import { test } from "node:test"
import { collectActivity, localCandidates } from "../src/activity.js"

const NOTES = [
  {
    path: "Pessoal/03 - Produtos/Bom Dia.md",
    tipo: "produto",
    status: "ativo",
    caminhoLocal: tmpdir(),
  },
  { path: "nota.md", tipo: "nota", status: "ativo", caminhoLocal: tmpdir() },
  { path: "concluido.md", tipo: "projeto", status: "concluido", caminhoLocal: tmpdir() },
  { path: "sem-pasta.md", tipo: "produto", status: "ativo", caminhoLocal: "" },
  {
    path: "sumiu.md",
    tipo: "projeto",
    status: "ativo",
    caminhoLocal: "C:\\caminho\\que\\nao\\existe\\nunca",
  },
]

test("filtra as notas candidatas", () => {
  assert.deepEqual(
    localCandidates(NOTES).map((note) => note.path),
    ["Pessoal/03 - Produtos/Bom Dia.md", "sumiu.md"],
  )
})

test("coleta atividade das pastas que existem", async () => {
  const calls = []
  const items = await collectActivity(NOTES, {
    run: async (dir) => {
      calls.push(dir)
      return { at: "2026-09-24", detail: "feat: andou" }
    },
  })
  assert.equal(calls.length, 1)
  assert.deepEqual(items, [
    {
      path: "Pessoal/03 - Produtos/Bom Dia.md",
      activityAt: "2026-09-24",
      detail: "feat: andou",
    },
  ])
})
