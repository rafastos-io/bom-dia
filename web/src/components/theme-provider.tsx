import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react"
import {
  applyThemeToDocument,
  isThemeMode,
  systemPrefersDark,
  THEME_STORAGE_KEY,
  type ResolvedTheme,
  type ThemeMode,
} from "@/lib/theme"

type ThemeContextValue = {
  /** Modo escolhido (inclui "system"). */
  theme: ThemeMode
  /** Tema de fato aplicado (dark/light). */
  resolved: ResolvedTheme
  setTheme: (mode: ThemeMode) => void
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function initialTheme(): ThemeMode {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    if (isThemeMode(stored)) return stored
  } catch {
    /* sem localStorage */
  }
  return "system"
}

function subscribeSystemTheme(callback: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {}
  const media = window.matchMedia("(prefers-color-scheme: dark)")
  media.addEventListener("change", callback)
  return () => media.removeEventListener("change", callback)
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(initialTheme)
  const systemDark = useSyncExternalStore(
    subscribeSystemTheme,
    systemPrefersDark,
    () => true,
  )

  const resolved: ResolvedTheme = theme === "system" ? (systemDark ? "dark" : "light") : theme

  useEffect(() => {
    applyThemeToDocument(theme)
  }, [theme, systemDark])

  const setTheme = useCallback((mode: ThemeMode) => {
    setThemeState(mode)
    try {
      localStorage.setItem(THEME_STORAGE_KEY, mode)
    } catch {
      /* sem localStorage */
    }
  }, [])

  const toggleTheme = useCallback(() => {
    setThemeState((current) => {
      const next: ThemeMode = (current === "system" ? (systemDark ? "dark" : "light") : current) === "dark" ? "light" : "dark"
      try {
        localStorage.setItem(THEME_STORAGE_KEY, next)
      } catch {
        /* sem localStorage */
      }
      return next
    })
  }, [systemDark])

  const value = useMemo(
    () => ({ theme, resolved, setTheme, toggleTheme }),
    [theme, resolved, setTheme, toggleTheme],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error("useTheme precisa do ThemeProvider")
  return ctx
}
