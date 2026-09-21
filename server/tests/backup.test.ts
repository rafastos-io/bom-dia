import { describe, expect, it } from "vitest"
import {
  backupDateOf,
  backupDue,
  backupEnabled,
  backupKeyFor,
  pruneBackups,
  runBackup,
} from "../src/backup.js"
import { parseListXml } from "../src/r2.js"

describe("backupKeyFor / backupDateOf", () => {
  it("gera a chave com a data no nome", () => {
    const key = backupKeyFor(new Date("2026-09-21T07:15:00Z"))
    expect(key).toBe("bomdia/backups/bomdia-2026-09-21T07-15-00Z.db")
  })

  it("le a data de volta", () => {
    expect(backupDateOf("bomdia/backups/bomdia-2026-09-21T07-15-00Z.db")).toBe(
      "2026-09-21T07:15:00Z",
    )
    expect(backupDateOf("bomdia/backups/outro.db")).toBeNull()
    expect(backupDateOf("bomdia/attachments/task/1/x.png")).toBeNull()
  })
})

describe("backupDue", () => {
  const now = new Date("2026-09-21T12:00:00Z")

  it("sem backup anterior vence", () => {
    expect(backupDue(null, now)).toBe(true)
  })

  it("recente nao vence", () => {
    expect(backupDue("2026-09-20T12:00:00Z", now)).toBe(false)
  })

  it("passado da janela vence", () => {
    expect(backupDue("2026-09-10T12:00:00Z", now)).toBe(true)
  })

  it("a folga de 12 h faz vencer no limite", () => {
    // 6 dias e 12 h depois do ultimo.
    expect(backupDue("2026-09-15T00:00:00Z", now)).toBe(true)
    // Ainda dentro da janela.
    expect(backupDue("2026-09-15T12:00:00Z", now)).toBe(false)
  })

  it("data invalida vence", () => {
    expect(backupDue("ontem", now)).toBe(true)
  })
})

describe("pruneBackups", () => {
  const key = (day: string) => backupKeyFor(new Date(`${day}T07:00:00Z`))

  it("remove as copias mais antigas", async () => {
    const removed: string[] = []
    const files = [key("2026-09-07"), key("2026-09-14"), key("2026-09-21")].map((k) => ({
      key: k,
      size: 1,
      lastModified: "",
    }))
    const pruned = await pruneBackups(2, {
      list: async () => files,
      remove: async (k) => {
        removed.push(k)
      },
    })
    expect(pruned).toEqual([key("2026-09-07")])
    expect(removed).toEqual([key("2026-09-07")])
  })

  it("sem excesso nao remove nada", async () => {
    const pruned = await pruneBackups(2, {
      list: async () => [{ key: key("2026-09-21"), size: 1, lastModified: "" }],
      remove: async () => {
        throw new Error("nao deveria remover")
      },
    })
    expect(pruned).toEqual([])
  })
})

describe("parseListXml", () => {
  it("extrai chave, tamanho e data de cada objeto", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <ListBucketResult>
        <Contents>
          <Key>bomdia/backups/bomdia-2026-09-14T07-00-00Z.db</Key>
          <LastModified>2026-09-14T07:00:05.000Z</LastModified>
          <Size>40960</Size>
        </Contents>
        <Contents>
          <Key>bomdia/backups/bomdia-2026-09-21T07-00-00Z.db</Key>
          <LastModified>2026-09-21T07:00:03.000Z</LastModified>
          <Size>43008</Size>
        </Contents>
        <IsTruncated>false</IsTruncated>
      </ListBucketResult>`
    const objects = parseListXml(xml)
    expect(objects).toHaveLength(2)
    expect(objects[0]).toEqual({
      key: "bomdia/backups/bomdia-2026-09-14T07-00-00Z.db",
      size: 40960,
      lastModified: "2026-09-14T07:00:05.000Z",
    })
    expect(objects[1]?.size).toBe(43008)
  })

  it("sem objetos devolve lista vazia", () => {
    expect(parseListXml("<ListBucketResult></ListBucketResult>")).toEqual([])
  })
})

describe("backup desabilitado", () => {
  it("sem TURSO remoto e sem R2 nao esta habilitado", () => {
    expect(backupEnabled()).toBe(false)
  })

  it("rodar sem configuracao falha com mensagem clara", async () => {
    await expect(runBackup()).rejects.toThrow(/desabilitado/)
  })
})
