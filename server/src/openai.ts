import { DEFAULT_MODEL, OPENAI_URL, apiKeyOk, loadConfig } from "./config.js"
import type { Database } from "./db/client.js"
import { TIPOS, cleanRecorrencia } from "./rules.js"

export const SYSTEM_PROMPT = `Voce e o assistente do "Bom Dia", um organizador pessoal de demandas.
Sua personalidade: um secretario discreto, inteligente e confiavel. Fala de forma curta,
pessoal e leve - nunca corporativa.

Sua tarefa: ler o texto solto que a pessoa escreveu (pensamentos, recados, conversa) e
transformar em uma ou mais demandas organizadas.

Regras:
- Responda APENAS com JSON valido, sem texto antes ou depois, sem markdown.
- Formato exato:
  {"tarefas": [
    {"title": "titulo curto e direto",
     "description": "resumo util em 1-2 frases, com detalhes que importam",
     "priority": "alta" | "media" | "baixa",
     "due_date": "AAAA-MM-DD" ou "" se nao houver prazo,
     "tipo": "tarefa" | "ideia" | "rotina",
     "recorrencia": "diaria" | "semanal" | "mensal" (SO se tipo="rotina" e o texto indicar
       frequencia, ex.: "todo dia", "toda semana", "mensalmente"; senao ""),
     "projeto": "nome do projeto/cliente a que isso pertence, ou \\"\\" se for avulso",
     "requested_by": "quem pediu, se mencionado, senao \\"\\"",
     "send_to": "para quem enviar, se mencionado, senao \\"\\"",
     "subtasks": ["passo 1", "passo 2"]  (lista de passos desta MESMA demanda; [] se nao houver),
     "links": [{"kind": "web" ou "pasta", "label": "apelido curto", "target": "url ou caminho"}]  ([] se nao houver),
     "motivo": "1 frase curta explicando a prioridade/urgencia ou o fluxo"}
  ]}
- Duas dimensoes independentes:
  * "tipo" = a natureza: "tarefa" (algo a fazer/entregar), "ideia" (pensamento solto pra depois),
    "rotina" (recorrente/habito).
  * "projeto" = o agrupador. Use SO quando houver demandas realmente independentes do mesmo
    cliente/iniciativa (ex.: "Dina", "Bellelli", "campanha X"). Elas se cruzam: pode haver uma
    "ideia" do projeto "Dina" (tipo=ideia, projeto=Dina) ou uma "rotina" de um projeto.
- REGRA IMPORTANTE sobre subtasks vs projeto: se o texto descreve UM entregavel unico com varios
  passos, gere UMA tarefa com esses passos em "subtasks" - NUNCA varias tarefas, e NUNCA invente
  um projeto so pra segurar os passos. Ex.: "preciso finalizar a apresentacao pro Danilo Nunes:
  montar os slides, revisar os numeros e ensaiar" -> UMA tarefa {"title": "Finalizar apresentacao
  pro Danilo Nunes", "projeto": "", "subtasks": ["Montar os slides", "Revisar os numeros",
  "Ensaiar"]}. So separe em varias tarefas quando forem entregas de fato independentes.
- REGRA sobre PROJETO EXPLICITO: quando a pessoa ANUNCIA um projeto - "vou comecar um (novo)
  projeto chamado X", "projeto X:", "novo projeto: X", "iniciar o projeto X" - isso DEFINE UM
  UNICO projeto. TODAS as demandas desse texto recebem "projeto": "X". NUNCA crie dois ou mais
  nomes de projeto a partir de um texto assim - o singular "um projeto" e literal. So use nomes
  de projeto diferentes quando a pessoa citar, ela mesma, iniciativas/clientes claramente
  distintos no mesmo texto.
- HIERARQUIA em 3 niveis: PROJETO (o agrupador) > TAREFA (entregavel/marco que faz sentido
  concluir sozinho e pode ter prazo/responsavel proprio) > SUBTASK (passo de execucao de UMA
  tarefa, sem sentido isolado). Teste rapido: se o item poderia ter prazo proprio e ser
  entregue sozinho, e TAREFA; se so existe pra tocar outra tarefa, e SUBTASK. Nao promova a
  projeto o que e tarefa, nem a tarefa o que e subtask.
- Exemplo do caso "um projeto com varias tarefas": "Vou comecar um novo projeto chamado Aurora.
  Preciso fechar o briefing com o cliente, montar a identidade visual e programar o site." ->
  {"tarefas": [
    {"title": "Fechar briefing com o cliente", "projeto": "Aurora", "tipo": "tarefa", "subtasks": []},
    {"title": "Montar a identidade visual", "projeto": "Aurora", "tipo": "tarefa", "subtasks": []},
    {"title": "Programar o site", "projeto": "Aurora", "tipo": "tarefa", "subtasks": []}
  ]}. Repare: UM projeto ("Aurora") em TODAS, TRES tarefas - nunca dois projetos.
- "links": extraia QUALQUER url (http/https) ou caminho de pasta que a pessoa mencionar e coloque
  no campo "links" da tarefa a que pertence. kind="web" para links da internet (ex.: Canva, Drive,
  YouTube), kind="pasta" para caminhos de pasta do PC (ex.: C:\\...). Nunca descarte um link que a
  pessoa passou - ele quase sempre e o material da demanda.
- Prioridade pela urgencia real: prazo curto ou cobranca = alta.
- Resolva datas relativas ("sexta que vem", "amanha", "semana que vem") usando a data de hoje.
- Se o texto tiver varias demandas, separe em varios itens e ordene do mais importante ao menos.
- Escreva em portugues do Brasil.
`

const WA_SYSTEM_DELEGAR = `Voce e o secretario do "Bom Dia". Sua tarefa: escrever UMA mensagem de
WhatsApp para DELEGAR esta demanda a alguem do time.

Estilo: claro, organizado e completo, mas humano (nada robotico). Escreva em portugues do Brasil.
Estruture com rotulos curtos e quebras de linha, mais ou menos assim:
- 1 linha de abertura pedindo pra assumir a demanda;
- *Tarefa:* o que precisa ser feito;
- *Contexto:* detalhes que importam (projeto, quem pediu) - so se existirem;
- *Prazo:* se houver;
- *Passos:* liste as subtarefas pendentes (as ja feitas pode marcar como ok);
- *Links:* cole os links/pastas, se houver;
- 1 linha curta de fechamento.

Regras:
- Use SO as informacoes fornecidas. NUNCA invente dados, nomes, prazos ou links.
- Se algum item nao existir, simplesmente omita o rotulo.
- Pode usar *negrito* do WhatsApp (asteriscos) nos rotulos. Emojis com muita moderacao.
- Responda APENAS com o texto da mensagem, sem aspas, sem comentarios antes ou depois.`

const WA_SYSTEM_AVISAR = `Voce e o Poohzera, secretario simpatico do "Bom Dia". Sua tarefa: escrever
UMA mensagem de WhatsApp curta pra AVISAR quem pediu a demanda sobre o andamento (um update).

Estilo: leve, pessoal e breve (3 a 5 linhas no maximo). Portugues do Brasil. Emojis discretos, ok.
Traga: uma saudacao curta, em que pe esta a coisa (use o andamento/porcentagem das subtarefas ou o
status), o prazo se houver, e 1 linha de proximo passo. Se houver quem pediu, pode falar direto com
essa pessoa pelo nome.

Regras:
- Use SO as informacoes fornecidas. NUNCA invente dados, prazos ou links.
- Nao vire uma lista longa nem cole todos os links - e so um update rapido.
- Responda APENAS com o texto da mensagem, sem aspas, sem comentarios antes ou depois.`

type OpenAiMessage = { role: "system" | "user"; content: string }

async function callOpenAI(
  db: Database,
  messages: OpenAiMessage[],
  options: { model?: string; temperature?: number; timeout?: number; jsonMode?: boolean } = {},
): Promise<string> {
  const cfg = await loadConfig(db)
  const key = cfg.openaiApiKey.trim()
  if (!apiKeyOk(key)) {
    throw new Error("Chave da OpenAI nao configurada (esperado algo como sk-...).")
  }
  const body: Record<string, unknown> = {
    model: options.model || cfg.model || DEFAULT_MODEL,
    messages,
    temperature: options.temperature ?? 0.2,
    max_tokens: 1024,
  }
  if (options.jsonMode !== false) {
    body.response_format = { type: "json_object" }
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), (options.timeout ?? 45) * 1000)
  try {
    const res = await fetch(OPENAI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 300)
      if (res.status === 401 || res.status === 403) {
        throw new Error("Chave da OpenAI invalida ou sem permissao.")
      }
      throw new Error(`Erro da OpenAI (HTTP ${res.status}): ${detail}`)
    }
    const json = (await res.json()) as {
      choices: { message: { content: string } }[]
    }
    return json.choices[0]?.message?.content ?? ""
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Sem conexao com a OpenAI (tempo esgotado).", { cause: error })
    }
    if (error instanceof Error && error.message.startsWith("Erro da OpenAI")) throw error
    throw new Error(`Sem conexao com a OpenAI: ${(error as Error).message}`, { cause: error })
  } finally {
    clearTimeout(timer)
  }
}

/** Chamada generica que devolve o JSON da resposta (usada pelo matching do radar). */
export async function aiJson(db: Database, system: string, user: string): Promise<unknown> {
  const raw = await callOpenAI(
    db,
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    { temperature: 0, timeout: 60 },
  )
  return extractJson(raw)
}

function extractJson(text: string): unknown {
  let clean = text.trim()
  if (clean.startsWith("```")) {
    clean = clean.replace(/`/g, "")
    if (clean.trimStart().toLowerCase().startsWith("json")) {
      clean = clean.trimStart().slice(4)
    }
  }
  const start = clean.indexOf("{")
  const end = clean.lastIndexOf("}")
  if (start === -1 || end === -1) throw new Error("Resposta da IA nao continha JSON.")
  return JSON.parse(clean.slice(start, end + 1))
}

export type ParsedTask = {
  title: string
  description: string
  priority: string
  due_date: string
  tipo: string
  recorrencia: string
  projeto: string
  requested_by: string
  send_to: string
  subtasks: string[]
  links: { kind: string; label: string; target: string }[]
  motivo: string
}

export async function aiParse(db: Database, text: string): Promise<ParsedTask[]> {
  const hoje = new Date().toISOString().slice(0, 10)
  const messages: OpenAiMessage[] = [
    { role: "system", content: `${SYSTEM_PROMPT}\nHoje e ${hoje}.` },
    { role: "user", content: text.trim() },
  ]
  const raw = await callOpenAI(db, messages)
  const data = extractJson(raw) as { tarefas?: unknown[] }
  const tarefas = Array.isArray(data?.tarefas) ? data.tarefas : []
  const clean: ParsedTask[] = []
  for (const item of tarefas) {
    if (typeof item !== "object" || item === null) continue
    const t = item as Record<string, unknown>
    const title = String(t.title ?? "").trim()
    if (!title) continue
    const tipo = TIPOS.has(String(t.tipo)) ? String(t.tipo) : "tarefa"
    const subs: string[] = []
    for (const s of (t.subtasks as unknown[]) ?? []) {
      if (typeof s === "string" && s.trim()) subs.push(s.trim())
      else if (typeof s === "object" && s !== null) {
        const st = String((s as Record<string, unknown>).title ?? "").trim()
        if (st) subs.push(st)
      }
    }
    const links: { kind: string; label: string; target: string }[] = []
    for (const l of (t.links as unknown[]) ?? []) {
      if (typeof l !== "object" || l === null) continue
      const link = l as Record<string, unknown>
      const target = String(link.target ?? "").trim()
      if (!target) continue
      const kind = link.kind === "pasta" ? "pasta" : "web"
      links.push({ kind, label: String(link.label ?? "").trim(), target })
    }
    clean.push({
      title,
      description: String(t.description ?? "").trim(),
      priority: ["alta", "media", "baixa"].includes(String(t.priority)) ? String(t.priority) : "media",
      due_date: String(t.due_date ?? "").trim(),
      tipo,
      recorrencia: cleanRecorrencia(t.recorrencia, tipo),
      projeto: String(t.projeto ?? "").trim(),
      requested_by: String(t.requested_by ?? "").trim(),
      send_to: String(t.send_to ?? "").trim(),
      subtasks: subs,
      links,
      motivo: String(t.motivo ?? "").trim(),
    })
  }
  return clean
}

const PRIO_TXT: Record<string, string> = { alta: "alta", media: "media", baixa: "baixa" }

function fmtDataBr(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec((iso || "").trim())
  if (!match) return iso
  return `${match[3]}/${match[2]}/${match[1]}`
}

export function waContexto(task: Record<string, unknown>): string {
  const lines: string[] = []
  const add = (line: string) => lines.push(line)
  const str = (v: unknown) => String(v ?? "").trim()
  add(`Titulo: ${str(task.title)}`)
  const tipo = str(task.tipo) || "tarefa"
  if (tipo && tipo !== "tarefa") add(`Tipo: ${tipo}`)
  if (str(task.description)) add(`Descricao: ${str(task.description)}`)
  if (str(task.projeto)) add(`Projeto: ${str(task.projeto)}`)
  if (str(task.proj_scope)) add(`Escopo do projeto: ${str(task.proj_scope)}`)
  if (str(task.proj_people)) add(`Envolvidos no projeto: ${str(task.proj_people)}`)
  if (str(task.priority)) add(`Prioridade: ${PRIO_TXT[str(task.priority)] ?? str(task.priority)}`)
  if (str(task.due_date)) add(`Prazo: ${fmtDataBr(str(task.due_date))}`)
  if (str(task.requested_by)) add(`Quem pediu: ${str(task.requested_by)}`)
  if (str(task.send_to)) add(`Para enviar a: ${str(task.send_to)}`)
  if (str(task.status)) add(`Status: ${str(task.status)}`)
  const subs = (task.subtasks as unknown[]) ?? []
  const norm: { title: string; done: boolean }[] = []
  for (const s of subs) {
    if (typeof s === "string" && s.trim()) norm.push({ title: s.trim(), done: false })
    else if (typeof s === "object" && s !== null) {
      const sub = s as Record<string, unknown>
      const title = str(sub.title)
      if (title) norm.push({ title, done: Boolean(sub.done) })
    }
  }
  if (norm.length) {
    const done = norm.filter((s) => s.done).length
    const pct = Math.round((done * 100) / norm.length)
    add(`Subtarefas (${done}/${norm.length} feitas, ${pct}%):`)
    for (const s of norm) add(`  [${s.done ? "x" : " "}] ${s.title}`)
  }
  const links = (task.links as unknown[]) ?? []
  if (Array.isArray(links) && links.length) {
    add("Links:")
    for (const l of links) {
      if (typeof l !== "object" || l === null) continue
      const link = l as Record<string, unknown>
      const target = str(link.target)
      if (!target) continue
      const label = str(link.label)
      add(`  - ${label ? `${label}: ` : ""}${target}`)
    }
  }
  return lines.join("\n")
}

export async function aiWhatsapp(
  db: Database,
  task: Record<string, unknown>,
  modo: string,
): Promise<string> {
  const mode = modo === "delegar" ? "delegar" : "avisar"
  const system = mode === "delegar" ? WA_SYSTEM_DELEGAR : WA_SYSTEM_AVISAR
  const hoje = new Date().toISOString().slice(0, 10)
  const messages: OpenAiMessage[] = [
    { role: "system", content: `${system}\nHoje e ${hoje}.` },
    { role: "user", content: `Dados da demanda:\n${waContexto(task)}` },
  ]
  const raw = await callOpenAI(db, messages, { jsonMode: false, temperature: 0.4 })
  return (raw || "").trim()
}
