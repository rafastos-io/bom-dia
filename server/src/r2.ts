import { randomBytes } from "node:crypto"
import { AwsClient } from "aws4fetch"
import { R2, r2Enabled } from "./config.js"

let client: AwsClient | null = null

function aws(): AwsClient {
  if (!client) {
    client = new AwsClient({
      accessKeyId: R2.accessKeyId,
      secretAccessKey: R2.secretAccessKey,
      service: "s3",
      region: R2.region,
    })
  }
  return client
}

function objectUrl(key: string): string {
  const encodedKey = key.split("/").map(encodeURIComponent).join("/")
  return `${R2.endpoint}/${encodeURIComponent(R2.bucket)}/${encodedKey}`
}

export async function r2Put(key: string, data: Uint8Array, contentType: string): Promise<void> {
  if (!r2Enabled()) throw new Error("R2 nao configurado")
  const res = await aws().fetch(objectUrl(key), {
    method: "PUT",
    body: data,
    headers: { "content-type": contentType },
  })
  if (!res.ok) throw new Error(`R2 PUT ${res.status} ${res.statusText}`)
}

export async function r2Get(key: string): Promise<Response> {
  if (!r2Enabled()) throw new Error("R2 nao configurado")
  const res = await aws().fetch(objectUrl(key), { method: "GET" })
  if (!res.ok) throw new Error(`R2 GET ${res.status} ${res.statusText}`)
  return res
}

export async function r2Delete(key: string): Promise<void> {
  if (!r2Enabled()) throw new Error("R2 nao configurado")
  const res = await aws().fetch(objectUrl(key), { method: "DELETE" })
  // 404 = objeto ja nao existe; sucesso idempotente.
  if (!res.ok && res.status !== 404) throw new Error(`R2 DELETE ${res.status}`)
}

/** Higieniza o nome do arquivo para exibicao e para compor a chave no R2. */
export function safeName(filename: string): string {
  const base = filename.replaceAll("\\", "/").split("/").pop() || "arquivo"
  const cleaned = [...base].map((ch) => (/[\p{L}\p{N}.\-_ ]/u.test(ch) ? ch : "_")).join("")
  return (cleaned.trim() || "arquivo").slice(0, 120)
}

/** Caminho unico no bucket: <prefixo>/<tipo>/<id>/<aleatorio>-<nome>. */
export function buildKey(ownerType: string, ownerId: number, filename: string): string {
  const uid = randomBytes(8).toString("hex")
  return `${R2.prefix}/${ownerType}/${ownerId}/${uid}-${safeName(filename)}`
}
