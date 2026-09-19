# Deploy — Bom Dia v3

Produção: **https://bomdia.rafastos.com.br** (Coolify na VPS pessoal, container `bomdia`).
Somente o branch **`main`** publica: o webhook do Coolify acompanha a `main` e o Horizon
processa o build. Push em `feature/*`, `codex/*` etc. **não** atualiza a VPS.

## Como o deploy acontece

1. Commit + push na `main` (ou merge de PR para a `main`).
2. Coolify recebe o webhook e enfileira o build do SHA.
3. O build roda o `Dockerfile` (multi-stage): `web` → `server` → runtime Node enxuto.
4. O container sobe servindo a SPA + API na porta `9463` (Traefik faz o TLS do domínio).

Diagnóstico do pipeline:

```bash
ssh vps vps-health
```

Os itens Horizon, SSH interno, webhook público e autorreparo devem estar `OK`; o último
deploy aparece no fim do relatório. Compare o SHA exibido com o commit enviado.

## Variáveis de ambiente (Coolify → app Bomdia)

Obrigatórias: `AUTH_USER`, `AUTH_PASSWORD`, `AUTH_SECRET`, `TURSO_DATABASE_URL`,
`TURSO_AUTH_TOKEN`, `PORT=9463`.

Recomendadas: `OPENAI_API_KEY`, `OPENAI_MODEL`, `APP_ENV=production`,
`R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_PREFIX`,
`MAX_UPLOAD_MB`.

- Sem `TURSO_*`, o app sobe com um banco vazio local no container (não use em produção).
- Sem as quatro `R2_*`, o painel de anexos some (o resto funciona).
- `OPENAI_API_KEY` no ambiente tem prioridade e **nunca** é gravada no banco.
- Segredos são cadastrados apenas no Coolify (ou Shared Variables). Nunca no repositório.

## Banco e backup

- Banco: **Turso** (`bomdia-rafastos-io`, região us-east-1). O SQLite antigo (`bomdia.db`)
  está preservado fora do container como rollback dos dados.
- Importação/reimportação: `server/scripts/import-sqlite.ts` (preserva ids, re-executável).
- Backup: PITR do Turso; export semanal para o R2 é um próximo passo planejado.

## Rollback

1. No Coolify, redeploy da **imagem anterior** do app (histórico de deployments).
2. Os dados: o SQLite antigo está intacto; para voltar de vez ao app Python, faça deploy do
   commit anterior à migração (a `main` guarda todo o histórico).

## Segurança

- Login por sessão (cookie `HttpOnly`, `SameSite=Lax`, `Secure` fora de localhost) com
  rate-limit no `POST /login`.
- Anexos privados no R2, entregues por `/api/attachments/:id/download` atrás da sessão.
- Nenhuma chave no front; uploads com limite de tamanho.
- Camada extra recomendada no domínio: **Cloudflare Access** (policy de e-mail) ou Basic Auth
  do Traefik.

## Modo local

Descontinuado na v3 (sem bandeja/porta 9463 no Windows). Para desenvolvimento, veja o `README.md`.
