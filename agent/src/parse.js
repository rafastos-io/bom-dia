/**
 * Parser das notas da CENTRAL para o radar.
 *
 * Cada nota vira metadados + entradas:
 *   - diário: Foco e Registro (progresso); Encerramento por rótulo
 *     (Concluído = progresso/`Concluído`, Aberto = aberto, Próxima ação = proxima_acao).
 *   - produto/projeto: "Última sessão" (progresso, data do heading ou do bold;
 *     na sessão mais recente, "Pendências" e "Próxima ação" viram aberto/proxima_acao),
 *     "Próximas ações" (proxima_acao), "Estado atual → Próxima ação", "Pendências
 *     registradas" (aberto, quebradas por `;`) e checkboxes `- [ ]` de "Marcos" (aberto).
 *   - decisão: seção "Decisão" (decisao, data do frontmatter).
 *
 * Itens de lista aninhados viram `subtasks` do item pai; o espelho de demandas
 * usa isso para montar a hierarquia no Bom Dia.
 *
 * O hash e do conteudo extraido (nao do arquivo cru): reescrever espaco em
 * branco nao muda nada para o radar.
 */
import { createHash } from "node:crypto"
import { basename } from "node:path"
import matter from "gray-matter"

function text(value) {
  if (value instanceof Date) return value.toISOString()
  return typeof value === "string" ? value.trim() : ""
}

function isoDate(value) {
  const match = text(value).match(/\d{4}-\d{2}-\d{2}/)
  return match ? match[0] : ""
}

function stripAccents(value) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
}

function normalizeHeading(value) {
  return stripAccents(text(value)).toLowerCase().trim()
}

/** Nome humano de um valor de frontmatter que pode ser wikilink. */
function linkName(value) {
  const raw = text(value)
  const match = raw.match(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/)
  if (!match) return raw
  const target = match[2] || match[1] || ""
  return target.split("/").pop().trim()
}

/** Limpa marcacao de lista e bold, preservando wikilinks. */
export function clean(value) {
  return text(value)
    .replace(/^\s*(?:[-*+]|\d+\.)\s+/, "")
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

/** Divide o corpo em secoes `## <heading>`. */
function splitSections(content) {
  const sections = [{ heading: "", lines: [] }]
  let current = sections[0]
  for (const line of content.split(/\r?\n/)) {
    const heading = line.match(/^##\s+(.+?)\s*$/)
    if (heading) {
      current = { heading: heading[1]?.trim() ?? "", lines: [] }
      sections.push(current)
      continue
    }
    current?.lines.push(line)
  }
  return sections
}

/** Itens de lista de um bloco de linhas (junta continuacao indentada). */
function bullets(lines) {
  const out = []
  for (const line of lines) {
    const item = line.match(/^\s*(?:[-*+]|\d+\.)\s+(.*)$/)
    if (item) {
      out.push(item[1] ?? "")
      continue
    }
    if (/^\s{2,}\S/.test(line) && out.length) {
      out[out.length - 1] += ` ${line.trim()}`
    }
  }
  return out
}

/** Arvore de itens de lista (bullets aninhados viram `children`). */
function bulletTree(lines) {
  const items = []
  const stack = []
  for (const line of lines) {
    const match = line.match(/^(\s*)(?:[-*+]|\d+\.)\s+(.*)$/)
    if (match) {
      const indent = (match[1] ?? "").replace(/\t/g, "  ").length
      const item = { indent, text: match[2] ?? "", children: [] }
      while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop()
      if (stack.length) stack[stack.length - 1].children.push(item)
      else items.push(item)
      stack.push(item)
      continue
    }
    if (/^\s{2,}\S/.test(line) && stack.length) {
      const last = stack[stack.length - 1]
      last.text += ` ${line.trim()}`
    }
  }
  return items
}

/** Descendentes de um item, em ordem de leitura. */
function descendants(item) {
  const out = []
  for (const child of item.children ?? []) {
    out.push(child)
    out.push(...descendants(child))
  }
  return out
}

function splitCheckbox(value) {
  const match = text(value).match(/^\[( |x|X)\]\s*(.*)$/)
  if (!match) return { text: value, done: false, checkbox: false }
  return { text: match[2] ?? "", done: match[1] !== " ", checkbox: true }
}

/** Item de lista → entrada (texto limpo, estado do checkbox e subtarefas). */
function entryFromItem(item) {
  const box = splitCheckbox(item.text)
  const subtasks = descendants(item)
    .map((child) => {
      const childBox = splitCheckbox(child.text)
      return { text: clean(childBox.text), done: childBox.done }
    })
    .filter((subtask) => subtask.text)
  return { text: clean(box.text), checkbox: box.checkbox, done: box.done, subtasks }
}

const LABELS = [
  { re: /^conclu[ií]do\s*:\s*/i, kind: "progresso" },
  { re: /^aberto\s*:\s*/i, kind: "aberto" },
  { re: /^pr[óo]xima\s+a[çc][ãa]o\s*:\s*/i, kind: "proxima_acao" },
]

function entryKind(value) {
  for (const label of LABELS) {
    if (label.re.test(value)) return { kind: label.kind, rest: value.replace(label.re, "") }
  }
  return null
}

const PENDENCIAS_RE = /^pend[êe]ncias(?:\s*e\s*riscos)?\s*:\s*(.*)$/i
const PROXIMA_RE = /^pr[óo]xima\s+a[çc][ãa]o\s*:\s*(.*)$/i

function headingDate(line) {
  const match = line.match(/^###\s+(.*)$/)
  if (!match) return null
  return { date: isoDate(match[1]), title: clean(match[1]) }
}

/** Primeiro paragrafo de uma secao (usado como escopo do projeto). */
function firstParagraph(section) {
  if (!section) return ""
  const out = []
  for (const line of section.lines) {
    if (/^#{2,6}\s/.test(line)) break
    if (!line.trim()) {
      if (out.length) break
      continue
    }
    if (/^\s*(?:[-*+]|\d+\.)\s+/.test(line)) {
      if (out.length) break
      return ""
    }
    out.push(line.trim())
  }
  return clean(out.join(" "))
}

export function parseNote(raw, relPath) {
  const { data, content } = matter(raw)
  const tipo = text(data.tipo).toLowerCase()
  const updatedAt = isoDate(data.atualizado_em) || isoDate(data.data) || isoDate(data.criado_em)
  const entries = []

  const push = (kind, value, date, section, subtasks = []) => {
    const item = clean(value)
    if (item) entries.push({ kind, text: item, date: date || updatedAt, section, subtasks })
  }

  const sections = splitSections(content)
  const byHeading = new Map(sections.map((section) => [normalizeHeading(section.heading), section]))

  for (const heading of ["foco", "registro"]) {
    const section = byHeading.get(heading)
    if (!section) continue
    for (const item of bullets(section.lines)) {
      push("progresso", item, updatedAt, heading === "foco" ? "Foco" : "Registro")
    }
  }

  const encerramento = byHeading.get("encerramento")
  if (encerramento) {
    for (const item of bullets(encerramento.lines)) {
      const labeled = entryKind(clean(item))
      if (!labeled) push("progresso", item, updatedAt, "Encerramento")
      else if (labeled.kind === "progresso") push("progresso", labeled.rest, updatedAt, "Concluído")
      else push(labeled.kind, labeled.rest, updatedAt, "Encerramento")
    }
  }

  const ultima = sections.find((section) => normalizeHeading(section.heading).startsWith("ultima sess"))
  if (ultima) {
    // Arvore por data: `### <data>` ou prefixo em negrito `**<data> ...**`.
    const treeItems = []
    const stack = []
    let currentDate = ""
    for (const line of ultima.lines) {
      const heading = headingDate(line)
      if (heading) {
        stack.length = 0
        currentDate = heading.date
        continue
      }
      const match = line.match(/^(\s*)(?:[-*+]|\d+\.)\s+(.*)$/)
      if (match) {
        const indent = (match[1] ?? "").replace(/\t/g, "  ").length
        const boldDate = (match[2] ?? "").match(/^\*\*(\d{4}-\d{2}-\d{2})/)
        const item = {
          indent,
          text: match[2] ?? "",
          date: boldDate ? boldDate[1] : currentDate || updatedAt,
          children: [],
        }
        while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop()
        if (stack.length) stack[stack.length - 1].children.push(item)
        else treeItems.push(item)
        stack.push(item)
        continue
      }
      if (/^\s{2,}\S/.test(line) && stack.length) {
        const last = stack[stack.length - 1]
        last.text += ` ${line.trim()}`
      }
    }

    const flattened = []
    const walk = (items) => {
      for (const item of items) {
        flattened.push(item)
        walk(item.children ?? [])
      }
    }
    walk(treeItems)
    const latestDate = flattened.map((item) => item.date).filter(Boolean).sort().at(-1) ?? updatedAt

    for (const item of flattened) {
      const value = clean(item.text)
      if (item.date === latestDate) {
        const pendencias = value.match(PENDENCIAS_RE)
        if (pendencias) {
          push("aberto", pendencias[1] ?? "", item.date, "Última sessão · Pendências", entryFromItem(item).subtasks)
          continue
        }
        const proxima = value.match(PROXIMA_RE)
        if (proxima) {
          push("proxima_acao", proxima[1] ?? "", item.date, "Última sessão · Próxima ação", entryFromItem(item).subtasks)
          continue
        }
      }
      push("progresso", item.text, item.date, "Última sessão")
    }
  }

  for (const section of sections) {
    const heading = normalizeHeading(section.heading)
    const tree = bulletTree(section.lines)
    if (heading === "proximas acoes") {
      for (const item of tree) {
        const entry = entryFromItem(item)
        if (entry.checkbox && entry.done) continue
        push("proxima_acao", entry.text, updatedAt, "Próximas ações", entry.subtasks)
      }
    }
    if (heading === "estado atual") {
      for (const item of tree) {
        const value = clean(item.text)
        const match = value.match(PROXIMA_RE)
        if (match) push("proxima_acao", match[1] ?? "", updatedAt, "Estado atual", entryFromItem(item).subtasks)
      }
    }
    if (heading === "marcos") {
      for (const item of tree) {
        const entry = entryFromItem(item)
        if (!entry.checkbox || entry.done) continue
        push("aberto", entry.text, updatedAt, "Marcos", entry.subtasks)
      }
    }
  }

  // "**Pendências registradas:** ..." e um paragrafo; cada `;` vira uma entrada.
  const lines = content.split(/\r?\n/)
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index]?.match(/^\*\*Pend[êe]ncias registradas:\*\*\s*(.*)$/i)
    if (!match) continue
    let value = match[1] ?? ""
    for (let next = index + 1; next < lines.length; next += 1) {
      const line = lines[next] ?? ""
      if (!line.trim() || /^#{2,6}\s/.test(line)) break
      value += ` ${line.trim()}`
    }
    for (const part of value.split(";")) {
      push("aberto", part, updatedAt, "Pendências")
    }
  }

  if (tipo === "decisao") {
    const decisionDate = isoDate(data.data) || isoDate(data.criado_em) || updatedAt
    const section = byHeading.get("decisao")
    if (section) {
      for (const item of bullets(section.lines)) push("decisao", item, decisionDate, "Decisão")
    }
  }

  const scope =
    firstParagraph(byHeading.get("sintese")) ||
    firstParagraph(byHeading.get("resultado esperado")) ||
    firstParagraph(byHeading.get("proposta de valor"))

  const title = content.match(/^#\s+(.+?)\s*$/m)?.[1]?.trim() || basename(relPath, ".md")
  const links = [
    ...new Set(
      [...content.matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)].map((match) => match[1] ?? ""),
    ),
  ]
    .filter(Boolean)
    .slice(0, 100)

  const note = {
    path: relPath.replaceAll("\\", "/").replace(/^\/+/, ""),
    title: clean(title),
    tipo,
    area: linkName(data.area),
    produto: linkName(data.produto),
    projeto: linkName(data.projeto),
    status: text(data.status) || "ativo",
    updatedAt,
    links,
    scope,
    repositorio: text(data.repositorio),
    caminhoLocal: text(data.caminho_local),
    entries,
  }
  note.hash = noteHash(note)
  return note
}

/** Hash canonico do conteudo extraido (mesma base usada no diff local). */
export function noteHash(note) {
  const payload = JSON.stringify({
    title: note.title,
    tipo: note.tipo,
    area: note.area,
    produto: note.produto,
    projeto: note.projeto,
    status: note.status,
    updatedAt: note.updatedAt,
    scope: note.scope,
    repositorio: note.repositorio,
    caminhoLocal: note.caminhoLocal,
    entries: note.entries.map((entry) => [
      entry.kind,
      entry.date,
      entry.section,
      entry.text,
      (entry.subtasks ?? []).map((subtask) => [subtask.text, subtask.done]),
    ]),
  })
  return createHash("sha256").update(payload).digest("hex")
}
