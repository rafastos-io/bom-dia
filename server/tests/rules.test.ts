import { describe, expect, it } from "vitest"
import { buildGaps, cleanRecorrencia, periodoAtual } from "../src/rules.js"

describe("periodoAtual", () => {
  it("diaria usa a data ISO", () => {
    expect(periodoAtual("diaria", new Date("2026-09-18T12:00:00Z"))).toBe("2026-09-18")
  })

  it("semanal usa a semana ISO 8601", () => {
    expect(periodoAtual("semanal", new Date("2026-09-18T12:00:00Z"))).toBe("2026-W38")
    // 1º de janeiro de 2027 cai na semana 53 de 2026 (regra ISO).
    expect(periodoAtual("semanal", new Date("2027-01-01T12:00:00Z"))).toBe("2026-W53")
  })

  it("mensal usa ano-mes", () => {
    expect(periodoAtual("mensal", new Date("2026-09-18T12:00:00Z"))).toBe("2026-09")
  })

  it("sem recorrencia retorna vazio", () => {
    expect(periodoAtual("", new Date("2026-09-18T12:00:00Z"))).toBe("")
    expect(periodoAtual("qualquer", new Date("2026-09-18T12:00:00Z"))).toBe("")
  })
})

describe("cleanRecorrencia", () => {
  it("aceita apenas valores validos", () => {
    expect(cleanRecorrencia("diaria")).toBe("diaria")
    expect(cleanRecorrencia("semanal")).toBe("semanal")
    expect(cleanRecorrencia("mensal")).toBe("mensal")
    expect(cleanRecorrencia("anual")).toBe("")
  })

  it("zera quando o tipo nao e rotina", () => {
    expect(cleanRecorrencia("diaria", "tarefa")).toBe("")
    expect(cleanRecorrencia("diaria", "rotina")).toBe("diaria")
  })
})

describe("buildGaps", () => {
  const projetos = ["Campanhas", "GRUPO URBAN"]

  it("tarefa sem projeto, sem prazo e sem link", () => {
    const gaps = buildGaps({ tipo: "tarefa" }, projetos)
    expect(gaps.map((g) => g.campo)).toEqual(["projeto", "prazo", "links"])
    expect(gaps[0]?.opcoes).toEqual(projetos)
  })

  it("tarefa completa nao gera perguntas", () => {
    const gaps = buildGaps(
      { tipo: "tarefa", projeto: "X", due_date: "2026-09-20", links: [{ target: "https://x" }] },
      projetos,
    )
    expect(gaps).toEqual([])
  })

  it("rotina pergunta recorrencia antes de projeto", () => {
    const gaps = buildGaps({ tipo: "rotina" }, projetos)
    expect(gaps.map((g) => g.campo)).toEqual(["recorrencia", "projeto", "links"])
  })

  it("ideia pergunta vinculos sempre", () => {
    const gaps = buildGaps({ tipo: "ideia", projeto: "X", links: [{ target: "u" }] }, projetos)
    expect(gaps.map((g) => g.campo)).toEqual(["vinculos"])
  })
})
