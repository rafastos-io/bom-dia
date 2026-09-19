import { Navigate, Route, Routes } from "react-router"
import { AppShell } from "@/components/app-shell"
import { ConfirmProvider } from "@/components/app/confirm"
import { OverlayProvider } from "@/components/overlay-provider"
import { AgendaPage } from "@/routes/agenda"
import { HojePage } from "@/routes/hoje"
import { IdeiasPage } from "@/routes/ideias"
import { LoginPage } from "@/routes/login"
import { ProjetosPage } from "@/routes/projetos"
import { RotinaPage } from "@/routes/rotina"

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <ConfirmProvider>
            <OverlayProvider>
              <AppShell />
            </OverlayProvider>
          </ConfirmProvider>
        }
      >
        <Route index element={<HojePage />} />
        <Route path="agenda" element={<AgendaPage />} />
        <Route path="rotina" element={<RotinaPage />} />
        <Route path="ideias" element={<IdeiasPage />} />
        <Route path="projetos" element={<ProjetosPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
