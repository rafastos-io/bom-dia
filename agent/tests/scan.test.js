import assert from "node:assert/strict"
import { test } from "node:test"
import { mirrorOrder } from "../src/scan.js"

test("ordena produto/projeto antes de diario e decisao", () => {
  const notes = [
    { tipo: "decisao", path: "c" },
    { tipo: "diario", path: "b" },
    { tipo: "produto", path: "a" },
    { tipo: "projeto", path: "d" },
    { tipo: "nota", path: "e" },
  ]
  const order = [...notes].sort((a, b) => mirrorOrder(a) - mirrorOrder(b)).map((note) => note.path)
  assert.deepEqual(order, ["a", "d", "b", "c", "e"])
})
