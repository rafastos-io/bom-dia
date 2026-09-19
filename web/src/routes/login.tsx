import { Button } from "@rafastos/ui/button"
import { Input } from "@rafastos/ui/input"
import { Loader2, LogIn, Sun } from "lucide-react"
import { useState, type FormEvent } from "react"
import { useNavigate } from "react-router"
import { Mascot, MascotAvatar } from "@/components/app/mascot"

export function LoginPage() {
  const navigate = useNavigate()
  const [username, setUsername] = useState("Rafastos")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError("")
    try {
      const res = await fetch("/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ username, password }),
      })
      if (res.ok) {
        navigate("/", { replace: true })
        return
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      setError(data.error ?? "Não foi possível entrar.")
    } catch {
      setError("Sem conexão com o servidor.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid min-h-dvh grid-cols-1 bg-[var(--rf-bg)] lg:grid-cols-[1.05fr_1fr]">
      {/* Painel editorial — desktop */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-[#0b1220] px-14 py-12 text-white lg:flex">
        <div className="flex items-center gap-rf-3">
          <Sun className="size-8 text-[var(--app-dot-amber)]" strokeWidth={2} aria-hidden />
          <span className="text-xl font-semibold tracking-tight">Bom Dia</span>
        </div>

        <div className="relative z-10 flex max-w-lg flex-col gap-rf-5">
          <h1 className="text-5xl leading-[1.05] font-extrabold tracking-tight">
            Seu dia começa
            <br />
            com clareza.
          </h1>
          <p className="max-w-md text-base text-white/65">
            Organize o que importa, avance com foco e transforme planos em resultados.
          </p>

          <ul className="flex flex-col gap-rf-2 pt-rf-2">
            {[
              { title: "Revisar planejamento", meta: "Hoje · 09:00", done: true },
              { title: "Responder e-mails", meta: "Hoje · 11:00", done: false },
              { title: "Planejar a próxima semana", meta: "Hoje · 16:00", done: false },
            ].map((item) => (
              <li
                key={item.title}
                className="flex w-72 items-center gap-rf-3 rounded-[var(--rf-radius-card)] border border-white/10 bg-white/[0.06] px-rf-3 py-rf-3 backdrop-blur"
              >
                <span
                  className={
                    item.done
                      ? "flex size-5 items-center justify-center rounded-full bg-[var(--app-ai)]"
                      : "flex size-5 rounded-full border-2 border-white/25"
                  }
                  aria-hidden
                />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium">{item.title}</span>
                  <span className="text-xs text-white/55">{item.meta}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative z-10 font-mono text-[11px] tracking-[0.28em] text-white/40 uppercase">
          Mais foco hoje. Um amanhã melhor.
        </p>

        <Mascot
          name="pockets"
          className="pointer-events-none absolute -right-10 bottom-0 h-[78%] opacity-[0.16] blur-[6px] select-none"
        />
      </div>

      {/* Formulário */}
      <div className="flex items-center justify-center px-rf-4 py-12">
        <div className="app-card w-full max-w-md p-rf-6">
          <div className="flex flex-col items-center gap-rf-2 text-center">
            <MascotAvatar className="size-16" />
            <h2 className="text-2xl font-bold tracking-tight text-foreground">Olá de novo</h2>
            <p className="rf-caption text-muted-foreground">
              Entre para continuar seu planejamento.
            </p>
          </div>

          <form onSubmit={submit} className="flex flex-col gap-rf-4 pt-rf-6">
            <div className="flex items-center gap-rf-3 rounded-[var(--rf-radius-card)] bg-[var(--rf-hover)] p-rf-3">
              <MascotAvatar className="size-11" />
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-semibold text-foreground">Rafael F.</span>
                <span className="truncate rf-caption text-muted-foreground">
                  Que bom te ver por aqui!
                </span>
              </div>
            </div>

            <label className="flex flex-col gap-rf-2">
              <span className="rf-caption font-medium text-foreground">Usuário</span>
              <Input
                name="username"
                autoComplete="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                required
              />
            </label>

            <label className="flex flex-col gap-rf-2">
              <span className="rf-caption font-medium text-foreground">Senha</span>
              <Input
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                autoFocus
              />
            </label>

            {error ? (
              <p role="alert" className="rf-caption text-[var(--rf-error)]">
                {error}
              </p>
            ) : null}

            <Button type="submit" size="lg" disabled={loading} className="w-full">
              {loading ? <Loader2 className="animate-spin" aria-hidden /> : <LogIn aria-hidden />}
              Entrar
            </Button>
          </form>

          <p className="pt-rf-4 text-center rf-caption text-muted-foreground">
            Sessão protegida por cookie seguro.
          </p>
        </div>
      </div>
    </div>
  )
}
