/**
 * Parser das notas da CENTRAL para o radar.
 *
 * Cada nota vira metadados + entradas:
 *   - diário: Foco e Registro (progresso); Encerramento por rótulo
 *     (Concluído = progresso, Aberto = aberto, Próxima ação = proxima_acao).
 *   - produto/projeto: "Última sessão" (progresso, data do heading ou do bold),
 *     "Próximas ações" (proxima_acao), "Pendências registradas" (aberto) e
 *     checkboxes `- [ ]` de "Marcos" (aberto).
 *   - decisão: seção "Decisão" (decisao, data do frontmatter).
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

/** Checkboxes `- [ ]` / `- [x]` de um bloco. */
function checkboxes(lines) {
  const open = []
  const done = []
  for (const line of lines) {
    const match = line.match(/^\s*-\s+\[( |x|X)\]\s+(.*)$/)
    if (!match) continue
    const item = clean(match[2])
    if (!item) continue
    if (match[1] === " ") open.push(item)
    else done.push(item)
  }
  return { open, done }
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

function headingDate(line) {
  const match = line.match(/^###\s+(.*)$/)
  if (!match) return null
  return { date: isoDate(match[1]), title: clean(match[1]) }
}

export function parseNote(raw, relPath) {
  const { data, content } = matter(raw)
  const tipo = text(data.tipo).toLowerCase()
  const updatedAt = isoDate(data.atualizado_em) || isoDate(data.data) || isoDate(data.criado_em)
  const entries = []

  const push = (kind, value, date, section) => {
    const item = clean(value)
    if (item) entries.push({ kind, text: item, date: date || updatedAt, section })
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
      else push(labeled.kind, labeled.rest, updatedAt, "Encerramento")
    }
  }

  const ultima = sections.find((section) => normalizeHeading(section.heading).startsWith("ultima sess"))
  if (ultima) {
    let currentDate = ""
    for (const line of ultima.lines) {
      const heading = headingDate(line)
      if (heading) {
        currentDate = heading.date
        continue
      }
      const item = line.match(/^\s*(?:[-*+]|\d+\.)\s+(.*)$/)
      if (!item) continue
      const value = item[1] ?? ""
      const boldDate = value.match(/^\*\*(\d{4}-\d{2}-\d{2})/)
      push("progresso", value, boldDate ? boldDate[1] : currentDate || updatedAt, "Última sessão")
    }
  }

  for (const section of sections) {
    const heading = normalizeHeading(section.heading)
    if (heading === "proximas acoes") {
      for (const item of bullets(section.lines)) push("proxima_acao", item, updatedAt, "Próximas ações")
    }
    if (heading === "marcos") {
      for (const item of checkboxes(section.lines).open) push("aberto", item, updatedAt, "Marcos")
    }
  }

  // "**Pendências registradas:** ..." e um paragrafo, nao lista.
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
    push("aberto", value, updatedAt, "Pendências")
  }

  if (tipo === "decisao") {
    const decisionDate = isoDate(data.data) || isoDate(data.criado_em) || updatedAt
    const section = byHeading.get("decisao")
    if (section) {
      for (const item of bullets(section.lines)) push("decisao", item, decisionDate, "Decisão")
    }
  }

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
    entries: note.entries.map((entry) => [entry.kind, entry.date, entry.section, entry.text]),
  })
  return createHash("sha256").update(payload).digest("hex")
}
