# Agente local do radar da CENTRAL

Observa `C:\Users\rafaa\CENTRAL\Rafael`, extrai o que andou (progresso) e o que ficou
aberto ("no ar") das notas e envia apenas deltas para o Bom Dia
(`POST /api/radar/ingest`, autenticado por `SERVICE_TOKEN`). **Nada é escrito no vault.**

## Como funciona

- Varredura de `.md` (ignora `.obsidian`, `.trash` e `99 - Sistema`).
- Por tipo de nota:
  - **diário:** `Foco`/`Registro` = progresso; `Encerramento` classifica pelo rótulo
    (`Concluído` = progresso, `Aberto` = aberto, `Próxima ação` = próxima ação).
  - **produto/projeto:** `Última sessão` = progresso (data do heading ou do bold);
    `Próximas ações` = próxima ação; `**Pendências registradas:**` = aberto;
    `- [ ]` de `Marcos` = aberto.
  - **decisão:** seção `Decisão` (data do frontmatter).
- Hash do conteúdo extraído evita reenvio; o servidor também deduplica por hash.
- Watch com debounce de 2 s + revarredura a cada 15 min (rede de segurança).
- Arquivo excluído/renomeado no vault vira `deleted` no envio.

## Primeira execução

```bash
cd agent
npm install
copy .env.example .env      # cole o BOMDIA_SERVICE_TOKEN (Coolify, runtime only)
npm run summary             # confere o que o agente enxerga (nao envia nada)
npm run backfill            # envia tudo (idempotente)
npm run watch               # observa em tempo real
```

`DRY_RUN=1` simula sem enviar (e sem avançar o estado local).

## Rodar como tarefa agendada (Windows)

Opção A — sem admin: atalho na pasta Startup (foi o caminho usado em 21/09/2026).
Crie um atalho para `run-forever.cmd` em `shell:startup` (Win+R → `shell:startup`), com
"Executar: Minimizado". O wrapper reinicia o `watch` se ele cair.

Opção B — com terminal elevado: tarefa no logon via `schtasks` (o `/Create` pede admin):

```powershell
schtasks /Create /TN "BomDia Radar Agent" /SC ONLOGON /RL LIMITED /F `
  /TR "\"C:\Users\rafaa\VIBECODING\BomDia\agent\run-forever.cmd\""
```

O `run-forever.cmd` escreve `radar-agent.log` na própria pasta (não versionado).

## Diagnóstico

- `npm test` — testes do parser (diário, produto, projeto, decisão, hash).
- `npm run summary` — contagem de arquivos/entradas por tipo e seção.
- Log de envio: `[radar] N notas, M entradas` / `envio falhou: ...` (401 = token
  errado ou ausente no Coolify; 5xx/rede = o agente repete e depois reenfileira).
- Estado local: `.state.json` (não versionado). Apague para forçar um backfill completo.
