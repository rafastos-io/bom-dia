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

1. `git push` das alterações → Coolify faz rebuild da imagem.
2. O container novo sobe montando o **mesmo volume** em `/data`.
3. `init_db()` roda `CREATE TABLE IF NOT EXISTS` + migrações idempotentes:
   nada é recriado nem apagado. Seus dados continuam lá.

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

O Bom Dia é um organizador **pessoal**. Ele **não tem login próprio** — qualquer
pessoa com a URL poderia criar/apagar tarefas. **Não deixe aberto na internet.**
Proteja com autenticação **na frente** do app (nenhuma mudança de código):

- **Cloudflare Access** (recomendado): coloque o domínio atrás do Cloudflare e
  crie uma policy de e-mail (só `raafastos@gmail.com` entra). Simples e forte.
- **Basic Auth do Traefik/Coolify:** o Coolify permite habilitar Basic Auth por
  middleware no serviço — barreira mínima com usuário/senha.

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
- [ ] Proteção de acesso (Cloudflare Access / Basic Auth) ligada
- [ ] `bomdia.db` migrado para `/data` e testado
