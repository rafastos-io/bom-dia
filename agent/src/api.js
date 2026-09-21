const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Envia um lote ao POST /api/radar/ingest com Bearer token.
 * Repete em erro de rede/5xx; erro 4xx (token/payload) nao adianta repetir.
 */
export async function sendIngest(
  config,
  payload,
  { fetchImpl = fetch, retries = 2, sleep = defaultSleep } = {},
) {
  const url = `${config.baseUrl}/api/radar/ingest`
  if (config.dryRun) {
    return {
      notes: payload.notes.length,
      entries: payload.notes.reduce((total, note) => total + note.entries.length, 0),
      removed: payload.deleted.length,
      skipped: 0,
      dryRun: true,
    }
  }
  let lastError
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (attempt > 0) await sleep(1000 * 4 ** (attempt - 1))
    let res
    try {
      res = await fetchImpl(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${config.token}`,
        },
        body: JSON.stringify(payload),
      })
    } catch (error) {
      lastError = error
      continue
    }
    if (res.ok) return await res.json()
    const body = (await res.text().catch(() => "")).slice(0, 200)
    lastError = new Error(`ingest ${res.status}: ${body}`)
    if (res.status < 500) break
  }
  throw lastError
}
