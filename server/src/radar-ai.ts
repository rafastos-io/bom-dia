/**
 * Matching com IA: sugere fechamento de demandas a partir de registros de
 * progresso em texto livre (parafrases de "concluido").
 *
 * A IA nunca age sozinha: ela so cria sugestoes na fila de revisoes e o usuario
 * confirma (conclui a demanda) ou ignora. Roda sob demanda, em cima de registros
 * recentes que ainda nao tem vinculo nem sugestao.
 */

import { sql } from "drizzle-orm"
import type { Database } from "./db/client.js"
import { aiJson } from "./openai.js"

export type AiAsk = (db: Database, system: string, user: string) => Promise<unknown>

const WINDOW_DAYS = 7
const MAX_ENTRIES = 20
const MAX_CANDIDATES = 25
const MIN_CONFIDENCE = 0.6

const SYSTEM = `Voce compara registros de progresso de um vault de notas com demandas abertas de um app.
Para cada registro, diga se ele indica que alguma das demandas listadas foi CONCLUIDA.
Responda SOMENTE JSON no formato {"matches":[{"entry": <indice>, "task": <id>, "confidence": <0..1>}]}.
Regras:
- use apenas ids de demandas listadas para aquele registro;
- nao invente; se nada casar, nao inclua o registro;
- registros que sao resumo, contexto, planos ou proximos passos NAO sao conclusao;
- rotulos de sessao (Mudancas, Verificacoes, Riscos, Fatos, Ajustes, Refino, Imagens,
  Continuacao, Pendencias, Proxima acao) descrevem o trabalho, nao provam que UMA
  demanda especifica foi concluida: na duvida, nao sugira;
- confidence alta somente com evidencia clara (mesma acao e mesmo objeto, ainda que com palavras diferentes);
- no maximo uma sugestao por registro.`

/** Rotulos de sessao que descrevem o trabalho, mas nao provam conclusao de demanda. */
const LABEL_PREFIXES = [
  "Mudanças",
  "Verificações",
  "Fatos registrados",
  "Riscos",
  "Ajustes",
  "Refino",
  "Imagens",
  "Continuação",
  "Pendências",
  "Próxima ação",
]

type EntryRow = {
  note_path: string
  item_hash: string
  text: string
  date: string
  tipo: string
}

type Candidate = { id: number; title: string }

type Batch = { entry: number; text: string; candidates: Candidate[] }

type Match = { entry: number; task: number; confidence: number }

async function candidatesFor(db: Database, entry: EntryRow): Promise<Candidate[]> {
  const sameNote = await db.all<Candidate>(sql`
    SELECT t.id, t.title FROM central_task_links l JOIN tasks t ON t.id = l.task_id
    WHERE l.state = 'ativa' AND t.status <> 'concluida' AND l.note_path = ${entry.note_path}
    ORDER BY t.id DESC LIMIT ${MAX_CANDIDATES}
  `)
  if (sameNote.length) return sameNote
  if (entry.tipo !== "diario") return []
  return db.all<Candidate>(sql`
    SELECT t.id, t.title FROM central_task_links l JOIN tasks t ON t.id = l.task_id
    WHERE l.state = 'ativa' AND t.status <> 'concluida'
    ORDER BY t.id DESC LIMIT ${MAX_CANDIDATES}
  `)
}

function parseMatches(answer: unknown): Match[] {
  const data = answer as { matches?: unknown[] }
  const out: Match[] = []
  for (const raw of Array.isArray(data?.matches) ? data.matches : []) {
    if (typeof raw !== "object" || raw === null) continue
    const item = raw as Record<string, unknown>
    out.push({
      entry: Number(item.entry),
      task: Number(item.task),
      confidence: Number(item.confidence),
    })
  }
  return out
}

/** Analisa os registros recentes e grava sugestoes pendentes (idempotente). */
export async function analyzeSuggestions(
  db: Database,
  {
    ask = aiJson,
    limit = MAX_ENTRIES,
    now = new Date(),
  }: { ask?: AiAsk; limit?: number; now?: Date } = {},
): Promise<{ analyzed: number; suggested: number }> {
  const cutoff = new Date(now.getTime() - WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10)
  const labelFilter = sql.join(
    LABEL_PREFIXES.map((label) => sql`e.text NOT LIKE ${`${label}%`}`),
    sql` AND `,
  )
  const entries = await db.all<EntryRow>(sql`
    SELECT e.note_path, e.item_hash, e.text, e.date, n.tipo
    FROM central_entries e JOIN central_notes n ON n.path = e.note_path
    WHERE e.kind = 'progresso' AND e.section IN ('Concluído', 'Última sessão')
      AND e.date >= ${cutoff} AND n.deleted_at = ''
      AND n.tipo IN ('produto', 'projeto', 'diario')
      AND ${labelFilter}
      AND NOT EXISTS (
        SELECT 1 FROM central_task_links l WHERE l.note_path = e.note_path AND l.item_hash = e.item_hash
      )
      AND NOT EXISTS (
        SELECT 1 FROM radar_suggestions s
        WHERE s.item_hash = e.item_hash AND s.status = 'pendente'
      )
    ORDER BY e.date DESC, e.id DESC
    LIMIT ${limit}
  `)
  if (!entries.length) return { analyzed: 0, suggested: 0 }

  const batches: Batch[] = []
  const kept: EntryRow[] = []
  for (const entry of entries) {
    const candidates = await candidatesFor(db, entry)
    if (!candidates.length) continue
    batches.push({ entry: batches.length, text: entry.text.slice(0, 400), candidates })
    kept.push(entry)
  }
  if (!batches.length) return { analyzed: 0, suggested: 0 }

  const answer = await ask(db, SYSTEM, JSON.stringify(batches))
  const best = new Map<number, Match>()
  for (const match of parseMatches(answer)) {
    if (!Number.isInteger(match.entry) || !Number.isInteger(match.task)) continue
    if (!(match.confidence >= MIN_CONFIDENCE)) continue
    const batch = batches[match.entry]
    if (!batch || !batch.candidates.some((candidate) => candidate.id === match.task)) continue
    const current = best.get(match.entry)
    if (!current || match.confidence > current.confidence) best.set(match.entry, match)
  }

  const nowText = now.toISOString().slice(0, 19)
  let suggested = 0
  for (const [index, match] of best) {
    const entry = kept[index]
    if (!entry) continue
    const result = await db.run(sql`
      INSERT OR IGNORE INTO radar_suggestions
        (task_id, path, item_hash, entry_text, entry_date, confidence, status, created_at, updated_at)
      VALUES (${match.task}, ${entry.note_path}, ${entry.item_hash}, ${entry.text.slice(0, 500)},
              ${entry.date}, ${match.confidence}, 'pendente', ${nowText}, ${nowText})
    `)
    suggested += result.rowsAffected
  }
  return { analyzed: kept.length, suggested }
}

/** Aceita (conclui a demanda) ou ignora a sugestao. */
export async function decideSuggestion(
  db: Database,
  id: number,
  action: "aceitar" | "ignorar",
  now = new Date(),
): Promise<{ ok: boolean }> {
  const row = await db.get<{
    task_id: number
    path: string
    item_hash: string
    entry_date: string
    status: string
  }>(
    sql`SELECT task_id, path, item_hash, entry_date, status FROM radar_suggestions WHERE id = ${id}`,
  )
  if (!row || row.status !== "pendente") return { ok: false }
  const nowText = now.toISOString().slice(0, 19)
  if (action === "aceitar") {
    const date = row.entry_date || nowText.slice(0, 10)
    await db.run(
      sql`UPDATE tasks SET status = 'concluida', completed_at = ${date} WHERE id = ${row.task_id}`,
    )
    await db.run(
      sql`UPDATE central_task_links SET state = 'concluida', updated_at = ${nowText}
          WHERE task_id = ${row.task_id} AND note_path = ${row.path}`,
    )
    await db.run(
      sql`UPDATE radar_suggestions SET status = 'aceita', updated_at = ${nowText} WHERE id = ${id}`,
    )
  } else {
    await db.run(
      sql`UPDATE radar_suggestions SET status = 'ignorada', updated_at = ${nowText} WHERE id = ${id}`,
    )
  }
  return { ok: true }
}
