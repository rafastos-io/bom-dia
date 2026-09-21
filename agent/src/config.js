import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))

function number(value, fallback) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export function loadConfig(env = process.env) {
  return {
    baseUrl: (env.BOMDIA_BASE_URL ?? "https://bomdia.rafastos.com.br").replace(/\/+$/, ""),
    token: (env.BOMDIA_SERVICE_TOKEN ?? "").trim(),
    centralDir: env.CENTRAL_DIR ?? "C:\\Users\\rafaa\\CENTRAL\\Rafael",
    statePath: env.STATE_PATH ?? join(HERE, "..", ".state.json"),
    debounceMs: number(env.DEBOUNCE_MS, 2000),
    scanIntervalMs: number(env.SCAN_INTERVAL_MS, 15 * 60 * 1000),
    batchSize: number(env.BATCH_SIZE, 25),
    dryRun: env.DRY_RUN === "1",
  }
}
