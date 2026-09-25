# Agente local do radar da CENTRAL

Observa `C:\Users\rafaa\CENTRAL\Rafael`, extrai o que andou (progresso) e o que ficou
aberto ("no ar") das notas e envia apenas deltas para o Bom Dia
(`POST /api/radar/ingest`, autenticado por `SERVICE_TOKEN`). **Nada é escrito no vault.**
No servidor, o mesmo conteúdo alimenta o **espelho de demandas** (projetos e tarefas do
Bom Dia) — o `backfill` dispara o reconcile no fim para materializá-lo.

## Como funciona

- Varredura de `.md` (ignora `.obsidian`, `.trash` e `99 - Sistema`).
- Por tipo de nota:
  - **diário:** `Foco`/`Registro` = progresso; `Encerramento` classifica pelo rótulo
    (`Concluído` = progresso, `Aberto` = aberto, `Próxima ação` = próxima ação).
  - **produto/projeto:** `Última sessão` = progresso (data do heading ou do bold); na
    sessão mais recente, `Pendências`/`Próxima ação` = aberto/próxima ação;
    `Próximas ações` = próxima ação; `Estado atual → Próxima ação` = próxima ação;
    `**Pendências registradas:**` = aberto (quebradas por `;`); `- [ ]` de `Marcos` = aberto.
  - **decisão:** seção `Decisão` (data do frontmatter).
- Itens de lista aninhados viram `subtasks` do item pai.
- Hash do conteúdo extraído evita reenvio; o servidor também deduplica por hash.
- **Atividade sem registro:** para notas ativas de produto/projeto com `caminho_local`, o
  agente lê o último commit (`git log -1`, timeout de 8 s) e envia por
  `POST /api/radar/activity`; roda no `once`/`backfill` e na revarredura de 15 min.
- Watch com debounce de 2 s + revarredura a cada 15 min (rede de segurança).
- Arquivo excluído/renomeado no vault vira `deleted` no envio (fecha as tarefas espelhadas).

## Primeira execução

```bash
cd agent
npm install
copy .env.example .env      # cole o BOMDIA_SERVICE_TOKEN (Coolify, runtime only)
npm run summary             # confere o que o agente enxerga (nao envia nada)
npm run backfill            # envia tudo (idempotente) e reconcilia o espelho
npm run watch               # observa em tempo real
```

Sem `npm run` (comando direto): `node src/index.js reconcile` reconstroi o espelho a
partir do que ja esta no servidor, sem reenviar notas.

`DRY_RUN=1` simula sem enviar (e sem avançar o estado local).

## Rodar como tarefa agendada (Windows)

Opção A — **bandeja** (usada desde 21/09/2026; em executável desde 22/09/2026):
`tray\BomDiaRadarTray.exe` é um único `.exe` .NET WinForms — **sem PowerShell, sem VBS e
sem `cmd` oculto** — que põe o ícone na área de notificação e cuida do agente (inicia o
`src\index.js watch` direto, reinicia em 10 s se cair e escreve no `radar-agent.log`).

Compile uma vez (ou quando `Tray.cs` mudar) e instale os atalhos (Startup + Área de Trabalho):

```bat
cd agent\tray
build.cmd
BomDiaRadarTray.exe --instalar
```

`--desinstalar` remove os atalhos. No menu do ícone (clique com o botão direito):

- **Agente: ativo / parado** — status ao vivo (checa a cada 5 s);
- **Abrir o Radar** (duplo clique no ícone também);
- **Rodar agora** — dispara um `once` e escreve no log;
- **Iniciar/Parar agente** — liga e desliga o `src\index.js watch`;
- **Abrir log** / **Abrir pasta do agente**;
- **Sair (para o agente)** — fecha a bandeja e para o agente.

Se o ícone não aparecer na barra, procure em "outros ícones do sistema" (o `^`) e fixe.

Por que não PowerShell/VBS: o Kaspersky Premium marcava a cadeia antiga
(`abrir-bandeja.vbs` → PowerShell oculto → `bandeja.ps1`) como `PDM:Trojan.Win32.Generic`
— falso positivo típico de script host escondido. Os scripts antigos ficaram só no
histórico do git (commit `2609695`).

Opção B — sem bandeja: rode `run-forever.cmd` (com terminal elevado, se quiser a tarefa
agendada via `schtasks`, que exige admin):

```powershell
schtasks /Create /TN "BomDia Radar Agent" /SC ONLOGON /RL LIMITED /F `
  /TR "\"C:\Users\rafaa\VIBECODING\BomDia\agent\run-forever.cmd\""
```

O `run-forever.cmd` escreve `radar-agent.log` na própria pasta (não versionado).

## Diagnóstico

- `npm test` — testes do parser (diário, produto, projeto, decisão, hash), da ordem de
  envio e da coleta de atividade (runner injetável).
- `npm run summary` — contagem de arquivos/entradas por tipo e seção.
- Log de envio: `[radar] N notas, M entradas` / `envio falhou: ...` (401 = token
  errado ou ausente no Coolify; 5xx/rede = o agente repete e depois reenfileira).
- Estado local: `.state.json` (não versionado). Apague para forçar um backfill completo.
