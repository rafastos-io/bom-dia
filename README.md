# Bom Dia

Organizador pessoal de demandas — cinco áreas (**Hoje, Agenda, Rotina, Ideias, Projetos**),
captura com IA (**Poohzera**) e centrais de projeto com notas, links e arquivos.

Aplicação de uso pessoal, publicada na VPS com Coolify em
[bomdia.rafastos.com.br](https://bomdia.rafastos.com.br). O modo local antigo (bandeja/porta
9463 no Windows) foi descontinuado na v3 — existe apenas o ambiente hospedado, além do
ambiente de desenvolvimento.

## Stack (v3)

| Camada | Tecnologia |
| --- | --- |
| Front | React 19 + Vite 8 + TypeScript + Tailwind 4 + `@rafastos/ui` (tarball vendorizado) |
| API | Node 22 + Hono + TypeScript |
| Banco | Turso (libSQL) + Drizzle ORM |
| Arquivos | Cloudflare R2 (privado, entregue por proxy autenticado) |
| IA | OpenAI (extração/perguntas/revisão e recados de WhatsApp) |
| Deploy | Docker multi-stage + Coolify (`main` apenas) |

## Estrutura

```
web/      SPA (Vite) — build gera dist/
server/   API Hono — /api/*, /login, /health e estáticos
           scripts/import-sqlite.ts — importa o SQLite legado para o Turso
Dockerfile  build multi-stage (web -> server -> runtime)
```

## Desenvolvimento

```bash
npm run dev:server     # API em :9463 (tsx watch)
npm run dev:web        # SPA em :5199 (proxy de /api para :9463)
```

Sem `TURSO_DATABASE_URL`, o server usa um arquivo libSQL local (`server/data/bomdia.db`) —
bom para desenvolver e testar. Para usar os dados reais, defina as variáveis do Turso.

```bash
npm run typecheck      # web + server
npm run lint           # web + server
npm run test           # testes do server (Vitest)
npm run build:web      # build da SPA
npm run build:server   # build da API
```

## Variáveis de ambiente (server)

| Variável | Para quê |
| --- | --- |
| `PORT` | Porta HTTP (default 9463) |
| `AUTH_USER` / `AUTH_PASSWORD` / `AUTH_SECRET` | Login e assinatura da sessão (cookie HttpOnly) |
| `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` | Banco em produção |
| `OPENAI_API_KEY` / `OPENAI_MODEL` | IA (a chave de ambiente tem prioridade e nunca é gravada) |
| `R2_ENDPOINT` / `R2_BUCKET` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | Anexos (sem as 4, o upload some da UI) |
| `R2_PREFIX` / `MAX_UPLOAD_MB` | Pasta e limite de upload (default `bomdia`, 25 MB) |

Segredos ficam **somente** no Coolify (produção) ou no ambiente local — nunca no repositório.

## Deploy

Publicação é feita pelo Coolify a partir do branch `main` (ver `DEPLOY.md` e `AGENTS.md`).
Push em qualquer outro branch não publica.

## Importar dados do app antigo

```bash
cd server
npx tsx scripts/import-sqlite.ts --source ../bomdia.db --target file:./data/bomdia.db --dry-run
```

Sem `--dry-run`, importa preservando ids (re-executável). Para o Turso, use
`--target $env:TURSO_DATABASE_URL` com `TURSO_AUTH_TOKEN` no ambiente.
