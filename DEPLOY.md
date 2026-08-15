# Deploy do Bom Dia (VPS Ubuntu + Coolify + Docker + Traefik)

Guia para hospedar em `https://bomdia.rafastos.com.br` mantendo o banco entre
redeploys. O mesmo código roda localmente no Windows sem alteração.

---

## 1. Como o app decide "local" x "produção"

Uma única variável manda: **`APP_ENV`**.

| Comportamento            | `APP_ENV=local` (default)     | `APP_ENV=production`        |
|--------------------------|-------------------------------|-----------------------------|
| Bind (HOST)              | `127.0.0.1`                   | `0.0.0.0`                   |
| Abre navegador no start  | Sim                           | Não                         |
| Banco/config (DATA_DIR)  | pasta do projeto              | `/data` (volume)            |
| Abrir pasta no Explorer  | Funciona                      | Desativado (aviso amigável) |

Sem `APP_ENV`, o app é **local** — por isso seu Windows continua igual.

---

## 2. Configuração no Coolify

**Tipo de recurso:** Application → **Dockerfile** (o repositório já tem um).

**Build:** o `Dockerfile` na raiz. Nada mais a configurar.

**Porta exposta / Ports:** `9463`
> O Traefik do Coolify faz o TLS e encaminha a porta 443 pública para a 9463 do container. Você **não** publica a 9463 na internet diretamente.

**Domínio (FQDN):** `https://bomdia.rafastos.com.br`
(aponte o DNS `bomdia` para o IP da VPS; o Coolify/Traefik emite o certificado Let's Encrypt).

**Healthcheck:** path `/health` (ou `/api/health`) → responde `{"status":"ok"}`.
O `Dockerfile` já traz um `HEALTHCHECK` interno também.

### Variáveis de ambiente (aba Environment Variables)

```
APP_ENV=production
HOST=0.0.0.0
PORT=9463
DATA_DIR=/data
OPENAI_API_KEY=sk-...          # marque como secret/build-secret
OPENAI_MODEL=gpt-4.1-mini
APP_NAME=Bom Dia
AUTH_USER=Rafastos
AUTH_PASSWORD=<senha-temporaria>
AUTH_SECRET=<string-aleatoria-longa> # marque como secret
```

> `HOST`, `PORT` e `DATA_DIR` já vêm com esses valores no `Dockerfile`; deixá-los
> aqui é redundante mas explícito. `OPENAI_API_KEY` é obrigatória para a IA e
> **nunca** é gravada em disco quando vem do ambiente.

---

## 3. Volume persistente (OBRIGATÓRIO)

Sem volume, o `bomdia.db` vive dentro do container e **some a cada redeploy**.

No Coolify, aba **Storages / Persistent Storage**, adicione:

- **Tipo:** Volume (nomeado) — recomendado
- **Nome:** `bomdia-data` (ou o que preferir)
- **Destino (Mount Path):** `/data`   ← **exatamente este caminho**

O app grava `/data/bomdia.db` e `/data/config.json`. Como o volume é externo à
imagem, **redeploys/rebuilds não apagam os dados**.

---

## 4. Redeploy sem perder dados

O Coolify acompanha **somente o branch `main`**. Push em branch de trabalho não é deploy.

1. Faça commit/push no branch de trabalho.
2. Crie e mergeie o PR para `main` (ou envie diretamente para `main` quando esse for o fluxo
   explicitamente escolhido).
3. O webhook GitHub → Coolify cria automaticamente o deploy do novo SHA da `main`.
4. O container novo sobe montando o **mesmo volume** em `/data`.
5. `init_db()` roda `CREATE TABLE IF NOT EXISTS` + migrações idempotentes:
   nada é recriado nem apagado. Seus dados continuam lá.

Para considerar a publicação concluída, confirme que o deploy do SHA da `main` chegou a
`finished`. Diagnóstico do pipeline:

```bash
ssh vps vps-health
```

Se Horizon, SSH interno, webhook e autorreparo estiverem `OK`, mas não houver deploy novo,
compare o branch enviado com a `main` antes de reiniciar qualquer serviço.

Nunca remova/reset o volume `bomdia-data` a menos que queira zerar tudo.

---

## 5. Migrar seu `bomdia.db` atual (Windows → VPS)

O banco é um arquivo único. Passo a passo seguro:

1. **No Windows, feche o Bom Dia** (feche a bandeja / a janela) para não copiar
   com escrita a meio. Ideal: gere uma cópia consistente:
   ```bash
   python -c "import sqlite3; s=sqlite3.connect('bomdia.db'); d=sqlite3.connect('bomdia-backup.db'); s.backup(d); d.close(); s.close()"
   ```
   Isso cria `bomdia-backup.db` íntegro (mesmo com o app aberto).

2. **Envie o arquivo para a VPS** (via `scp` do PowerShell/terminal):
   ```bash
   scp bomdia-backup.db usuario@IP_DA_VPS:/tmp/bomdia.db
   ```

3. **Copie para dentro do volume** do container. Descubra o nome/servico e
   copie para `/data`:
   ```bash
   # no host da VPS:
   docker ps                      # ache o container do bomdia
   docker cp /tmp/bomdia.db <container_id>:/data/bomdia.db
   ```
   Alternativa (direto no volume nomeado):
   ```bash
   docker volume inspect bomdia-data   # veja o Mountpoint
   sudo cp /tmp/bomdia.db /var/lib/docker/volumes/<mountpoint>/_data/bomdia.db
   ```

4. **Reinicie o container** (Restart no Coolify) para reabrir o banco novo.
   Confira em `https://bomdia.rafastos.com.br` que suas tarefas apareceram.

> Se existirem `bomdia.db-wal`/`bomdia.db-shm` no Windows, o comando de backup
> do passo 1 já consolida tudo no arquivo — copie só o `.db`.

---

## 6. Backup do banco em produção

Banco em `/data/bomdia.db`. Fazer cópia **consistente** (sem parar o app):

```bash
# no host da VPS, gera um snapshot integro do banco em uso:
docker exec <container_id> python -c \
  "import sqlite3; s=sqlite3.connect('/data/bomdia.db'); d=sqlite3.connect('/data/backup.db'); s.backup(d); d.close(); s.close()"
docker cp <container_id>:/data/backup.db ./bomdia-$(date +%F).db
```

**Restaurar:** pare o container, substitua `/data/bomdia.db` pela cópia, suba de novo.

**Periódico:** agende um cron no host rodando o comando acima e envie o arquivo
para armazenamento externo (ex.: Cloudflare R2, S3, `rclone`). O projeto já
deixa o banco como arquivo único e portátil — basta copiá-lo.

---

## 7. Segurança / exposição pública (IMPORTANTE)

O Bom Dia é um organizador **pessoal** e agora inclui um login temporário no
próprio servidor. Todas as páginas e APIs de dados exigem sessão; apenas
`/health` e a página de login ficam públicas. A senha não é enviada ao
JavaScript e o cookie é `HttpOnly`, `SameSite=Lax` e `Secure` em produção.

Cadastre `AUTH_SECRET` como segredo no Coolify. Se ele não for definido, o app
gera um segredo novo ao iniciar e todas as sessões abertas são encerradas a cada
restart. Troque `AUTH_PASSWORD` assim que quiser revogar os acessos existentes.

Como essa é uma barreira provisória, uma camada adicional continua recomendada:

- **Cloudflare Access** (recomendado): coloque o domínio atrás do Cloudflare e
  crie uma policy de e-mail (só `raafastos@gmail.com` entra). Simples e forte.
- **Basic Auth do Traefik/Coolify:** pode ser habilitado como segunda barreira
  pelo middleware do serviço.

O app já ajuda: serve **apenas** os arquivos públicos (`index.html`, `styles.css`,
`app.js`, `assets/`). Código, banco e `config.json` **não são baixáveis**.

---

## 8. Checklist rápido

- [ ] DNS `bomdia` → IP da VPS
- [ ] App no Coolify via Dockerfile, porta `9463`
- [ ] Domínio `https://bomdia.rafastos.com.br` com TLS (Traefik)
- [ ] Volume `bomdia-data` montado em `/data`
- [ ] Variáveis de ambiente cadastradas (com `OPENAI_API_KEY` como secret)
- [ ] Healthcheck `/health`
- [ ] `AUTH_SECRET` e credenciais cadastrados como secrets
- [ ] Proteção adicional (Cloudflare Access / Basic Auth), se desejada
- [ ] `bomdia.db` migrado para `/data` e testado
- [ ] Alterações mergeadas na `main` (push em feature branch não publica)
- [ ] Deploy automático do SHA da `main` concluído como `finished`
