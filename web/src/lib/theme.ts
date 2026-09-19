/**
 * Tema do app — espelha o comportamento do @rafastos/ui (chave e data-theme)
 * com o modo "system" adicional usado nos Ajustes do Bom Dia.
 */
export const THEME_STORAGE_KEY = "rafastos-theme"

export type ThemeMode = "dark" | "light" | "system"
export type ResolvedTheme = "dark" | "light"

export function isThemeMode(value: string | null): value is ThemeMode {
  return value === "dark" || value === "light" || value === "system"
}

export function systemPrefersDark(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return true
  return window.matchMedia("(prefers-color-scheme: dark)").matches
}

export function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode === "system") return systemPrefersDark() ? "dark" : "light"
  return mode
}

export function applyThemeToDocument(mode: ThemeMode) {
  const resolved = resolveTheme(mode)
  document.documentElement.setAttribute("data-theme", resolved)
  document.documentElement.classList.toggle("dark", resolved === "dark")
}
