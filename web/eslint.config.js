import js from "@eslint/js"
import reactHooks from "eslint-plugin-react-hooks"
import reactRefresh from "eslint-plugin-react-refresh"
import globals from "globals"
import tseslint from "typescript-eslint"
import { defineConfig, globalIgnores } from "eslint/config"

export default defineConfig([
  globalIgnores(["dist"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    // Providers exportam componente + hook de contexto no mesmo módulo (padrão shadcn);
    // helpers do app exportam constantes de estilo junto dos componentes.
    files: [
      "src/components/theme-provider.tsx",
      "src/components/overlay-provider.tsx",
      "src/components/list-view.tsx",
      "src/components/app/dot.tsx",
      "src/components/app/mascot.tsx",
    ],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
])
