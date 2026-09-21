import { createHash, createHmac, timingSafeEqual } from "node:crypto"
import type { Context, Next } from "hono"
import { getCookie } from "hono/cookie"
import { AUTH_COOKIE, AUTH_SECRET, AUTH_TTL_SECONDS, AUTH_USER, SERVICE_TOKEN } from "./config.js"

const AUTH_PASSWORD = process.env.AUTH_PASSWORD?.trim() ?? ""
const AUTH_PASSWORD_SHA256 = process.env.AUTH_PASSWORD_SHA256?.trim().toLowerCase() ?? ""

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf-8").digest("hex")
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf-8")
  const bufB = Buffer.from(b, "utf-8")
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

function passwordDigest(): string {
  if (AUTH_PASSWORD) return sha256Hex(AUTH_PASSWORD)
  return AUTH_PASSWORD_SHA256
}

export function authConfigured(): boolean {
  return Boolean(AUTH_PASSWORD || AUTH_PASSWORD_SHA256)
}

export function validCredentials(username: string, password: string): boolean {
  const usernameOk = safeEqual(username, AUTH_USER)
  const passwordOk = safeEqual(sha256Hex(password), passwordDigest())
  return usernameOk && passwordOk
}

export function newSessionToken(now = Date.now()): string {
  const expires = Math.floor(now / 1000) + AUTH_TTL_SECONDS
  const payload = `${AUTH_USER}|${expires}|${passwordDigest()}`
  const signature = createHmac("sha256", AUTH_SECRET).update(payload, "utf-8").digest("hex")
  return `${expires}.${signature}`
}

export function validSessionToken(token: string | undefined, now = Date.now()): boolean {
  if (!token) return false
  const dot = token.indexOf(".")
  if (dot <= 0) return false
  const expires = Number(token.slice(0, dot))
  const supplied = token.slice(dot + 1)
  if (!Number.isFinite(expires) || expires * 1000 < now) return false
  const payload = `${AUTH_USER}|${expires}|${passwordDigest()}`
  const expected = createHmac("sha256", AUTH_SECRET).update(payload, "utf-8").digest("hex")
  return safeEqual(supplied, expected)
}

export function isAuthenticated(c: Context): boolean {
  return validSessionToken(getCookie(c, AUTH_COOKIE))
}

/** Aceita `Authorization: Bearer <SERVICE_TOKEN>` (agente local do radar). */
export function validServiceToken(header: string | undefined): boolean {
  const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : ""
  return Boolean(SERVICE_TOKEN && token && safeEqual(token, SERVICE_TOKEN))
}

const PUBLIC_PATHS = new Set(["/health", "/api/health", "/login", "/logout"])

export async function requireAuth(c: Context, next: Next): Promise<Response | void> {
  const path = c.req.path
  if (PUBLIC_PATHS.has(path) || !path.startsWith("/api/")) {
    if (PUBLIC_PATHS.has(path) || c.req.method !== "GET") return next()
    if (isAuthenticated(c)) return next()
    // Rotas da SPA seguem para o front; a própria SPA cuida do /login.
    return next()
  }
  if (!isAuthenticated(c)) {
    return c.json({ error: "autenticacao necessaria" }, 401)
  }
  return next()
}

export function sessionCookie(token: string, secure: boolean): string {
  let cookie = `${AUTH_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${AUTH_TTL_SECONDS}`
  if (secure) cookie += "; Secure"
  return cookie
}

export function clearSessionCookie(secure: boolean): string {
  let cookie = `${AUTH_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
  if (secure) cookie += "; Secure"
  return cookie
}

export function isSecureRequest(host: string, proto: string): boolean {
  return proto === "https" || (!host.startsWith("localhost") && !host.startsWith("127.0.0.1"))
}

const LOGIN_WINDOW_MS = 5 * 60_000
const LOGIN_MAX_ATTEMPTS = 15
const attempts = new Map<string, { count: number; resetAt: number }>()

/** Rate-limit simples em memoria para POST /login (por IP encaminhado). */
export function loginRateLimited(ip: string, now = Date.now()): boolean {
  const entry = attempts.get(ip)
  if (!entry || entry.resetAt < now) {
    attempts.set(ip, { count: 1, resetAt: now + LOGIN_WINDOW_MS })
    return false
  }
  entry.count += 1
  return entry.count > LOGIN_MAX_ATTEMPTS
}
