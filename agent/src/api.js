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

/**
 * Envia os sinais de atividade dos repositorios (POST /api/radar/activity).
 * Erro aqui nao derruba o radar: o proximo ciclo tenta de novo.
 */
export async function sendActivity(
  config,
  payload,
  { fetchImpl = fetch, retries = 1, sleep = defaultSleep } = {},
) {
  const url = `${config.baseUrl}/api/radar/activity`
  if (config.dryRun) return { updated: 0, dryRun: true }
  let lastError
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (attempt > 0) await sleep(1500)
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
    lastError = new Error(`activity ${res.status}: ${body}`)
    if (res.status < 500) break
  }
  throw lastError
}

/**
 * Reconstroi o espelho de demandas no servidor (POST /api/radar/reconcile).
 * A ingestao pula notas inalteradas, entao este passo e o que materializa o
 * espelho no primeiro backfill (ou depois de mudar as regras do espelho).
 */
export async function sendReconcile(
  config,
  { fetchImpl = fetch, retries = 2, sleep = defaultSleep } = {},
) {
  const url = `${config.baseUrl}/api/radar/reconcile`
  if (config.dryRun) return { dryRun: true }
  let lastError
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (attempt > 0) await sleep(1000 * 4 ** (attempt - 1))
    let res
    try {
      res = await fetchImpl(url, {
        method: "POST",
        headers: { authorization: `Bearer ${config.token}` },
      })
    } catch (error) {
      lastError = error
      continue
    }
    if (res.ok) return await res.json()
    const body = (await res.text().catch(() => "")).slice(0, 200)
    lastError = new Error(`reconcile ${res.status}: ${body}`)
    if (res.status < 500) break
  }
  throw lastError
}
