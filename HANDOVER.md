# 🤝 HANDOVER — Bom Dia

Documento de passagem para continuar o projeto em outra ferramenta (ex.: opencode).
Escrito em 2026-07-28. Idioma do projeto: **português do Brasil (PT-BR)** — responda sempre em PT-BR.

> Dica: o opencode lê `AGENTS.md` por convenção. Se quiser que ele carregue isso automaticamente,
> copie/renomeie este arquivo para `AGENTS.md` (ou aponte para ele).

---

## ⚠️ LEIA PRIMEIRO — estado do git

O último commit é **`71dc6e4` (v7 — Fase 2, Rotinas)**. Working tree limpo.

Fim das mensagens de commit deve levar o trailer do agente que fez o trabalho
(ex.: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`).

Remoto: https://github.com/rafastos-io/bom-dia (branch `main`).

---

## O que é o projeto

**Bom Dia** — organizador pessoal de demandas, **100% local** (sem nuvem). O usuário (Rafastos) tem
demandas picadas que caem no esquecimento; ele liga o PC de manhã, abre o Bom Dia e vê o que fazer.
Filosofia dele: **construir o mínimo e ir acrescentando pelo uso real**; valoriza **executar e testar
de verdade** (rodar, `curl`, screenshot) em vez de só planejar; ao fim de um bloco, **oferecer commit**.

## Stack e como roda

- **Back-end:** Python **só stdlib** (`http.server` + `sqlite3`). Sem frameworks.
- **Front-end:** HTML/CSS/JS **puro** (sem build, sem libs). `index.html` + `styles.css` + `app.js`.
- **Banco:** `bomdia.db` (SQLite, na pasta do projeto). **Gitignored** (dados pessoais).
- **Config:** `config.json` (**gitignored**) — guarda `name`, `nvidia_api_key` (`nvapi-...`), `model`.
- **Porta:** `9463` → http://localhost:9463
- **Como iniciar:**
  - Bandeja (recomendado p/ o usuário): `Bom Dia (bandeja).vbs` (usa `pythonw` + `Bom Dia.pyw`, sem console).
  - Debug: `Bom Dia.bat` (janela com logs) ou `py bomdia.py`.
- Dependências extras (só p/ o ícone da bandeja): `pip install pystray pillow`. O servidor em si é stdlib.

### Cache / versão dos assets (IMPORTANTE)
- `index.html` referencia os assets versionados: `styles.css?v=9`, `app.js?v=9`. **Ao editar
  app.js/styles.css, suba o número `?v=` nos dois** (senão o navegador serve cache antigo).
- O servidor manda `Cache-Control: no-cache` (método `end_headers` em `bomdia.py`).
- **Mudou o `bomdia.py`? Precisa REINICIAR o app** (bandeja → Sair → abrir de novo). Mudou só
  front (js/css/html)? Basta **atualizar a página** (o `?v=` cobre).

---

## Arquitetura / modelo de dados

Tabelas (todas criadas idempotentemente em `init_db()`; migrações são `ALTER ... IF NOT EXISTS`-style):

- **tasks** — `id, title, requested_by, send_to, due_date, priority(alta|media|baixa),
  description, status(aberta|andamento|concluida), created_at, tipo(tarefa|ideia|rotina), projeto(TEXT),
  recorrencia(''|diaria|semanal|mensal), feito_em(TEXT)`.
  `area` é coluna legada/ignorada.
  **Rotinas (v7):** `feito_em` guarda o **identificador do período** do último check — diária: dia ISO
  (`2026-07-28`); semanal: `2026-W31` (semana ISO); mensal: `2026-07`. `feita` é **calculado** em
  `task_to_dict` comparando com `periodo_atual()` → o check **reseta sozinho na virada** (sem cron, sem
  histórico). Quem calcula o período é sempre o back-end.
- **links** — links de **tarefa**: `id, task_id, kind(web|pasta), label, target`.
- **subtasks** — checklist de tarefa: `id, task_id, title, done, position`.
- **projects** — projeto como **entidade**: `id, name(UNIQUE), scope, people, status, collapsed, position, created_at`.
- **project_links** — links **do projeto**: `id, project_id, kind, label, target`.
- **project_notes** — anotações do projeto: `id, project_id, title, body, position, created_at, updated_at`.

**Decisões-chave do modelo:**
- `projeto` na tarefa é **chave por NOME** (string), não por id. `projects.name` é UNIQUE.
  Renomear projeto propaga o novo nome pras tarefas (`update_project`). `_ensure_project()` cria a
  entidade quando uma tarefa recebe um projeto novo (sem precisar reiniciar). A migração semeia
  `projects` a partir dos nomes já usados em `tasks.projeto`.
- **Dois eixos** na tarefa: `tipo` (natureza: tarefa/ideia/rotina) + `projeto` (agrupador). Eles se
  cruzam (ex.: uma "ideia" do projeto "Dina").
- SQLite **não força FK** por padrão → deletes limpam manualmente as tabelas filhas
  (`delete_task`, `delete_project` apagam links/subtasks/notes).

### Endpoints HTTP (JSON)
```
GET    /api/tasks
POST   /api/tasks                     {title,tipo,projeto,priority,due_date,description,
                                       requested_by,send_to,links[],subtasks[],recorrencia}
PUT    /api/tasks/<id>                (mesmos campos, parciais; links[]/subtasks[] substituem tudo;
                                       trocar recorrencia/tipo zera feito_em)
DELETE /api/tasks/<id>
POST   /api/tasks/<id>/feito          {done}  -> check da rotina no período atual (v7)
PUT    /api/subtasks/<id>             {done?, title?}
GET    /api/projects                  (com links[], task_total, task_ativas)
POST   /api/projects                  {name,scope,people,links[]}
PUT    /api/projects/<id>             {name?,scope?,people?,status?,collapsed?,links[]?}
DELETE /api/projects/<id>             (tarefas do projeto ficam com projeto='')
GET    /api/projects/<id>/notes
POST   /api/projects/<id>/notes       {title,body}
PUT    /api/notes/<id>                {title?, body?}
DELETE /api/notes/<id>
POST   /api/open                      {path}   -> abre pasta/arquivo no Explorer (Windows)
GET    /api/ai/status                 -> {configured, model, name}
POST   /api/ai/config                 {name?, nvidia_api_key?, model?}
POST   /api/ai/parse                  {text} -> {tarefas[(com perguntas[])], projetos[]}
```

### Front-end (`app.js`) — pontos de orientação
- Estado global: `TASKS, PROJECTS, AREA, VIEW, FILTER/PRIO/SORT/...`, e p/ projetos:
  `PROJ_OPEN` (nome do projeto aberto na central, ou null), `PROJ_TAB` (demandas|anotacoes|links),
  `NOTES, NOTE_OPEN`.
- `render()` é o roteador de UI por `AREA`. Áreas: **hoje** (dashboard), **agenda** (calendário
  mensal), **projetos** (lista OU central isolada), **ideias**, **rotina**. `inArea(t, area)` decide
  a que aba uma tarefa pertence (por `tipo`/`projeto`/`due_date`).
- **Ícones** são SVG inline no objeto `ICONS` + `injectIcons()` (data-icon) — não há libs.
- **Deep-links:** `?area=`, `?proj=Nome`, `?ptab=demandas|anotacoes|links`.
- Padrões visuais: tokens CSS em `:root` (off-white/grafite/azul-profundo + amarelo). Cards, lista,
  kanban (drag-and-drop de status). Subtarefas reordenáveis por drag (puxador). Reuse `card()`,
  `listRow()`, `blankLinkRow()`, `esc()`, `toast()`, `openModal()`, `openLink()`.

---

## Assistente de IA ("Organizar meu dia")

- Provedor: **NVIDIA API Catalog** (endpoint compatível OpenAI:
  `https://integrate.api.nvidia.com/v1/chat/completions`). Chave `nvapi-...` só em `config.json`.
- **Modelo: `meta/llama-3.1-8b-instruct`** — escolhido após teste real (2026-07-28): foi o único
  **rápido (~3s) E com JSON válido**. `llama-3.3-70b` deu timeout (>60s); `nemotron-70b`/`qwen2.5-7b`
  = 404 (indisponíveis na conta); `nemotron-super-49b` = 44s + JSON com comentários; `nemotron-nano-8b`
  = JSON inválido. **Não trocar sem novo teste.** O modelo é campo do `config.json` (trocar = 1 linha).
- **Fluxo (arquitetura híbrida):** texto livre → IA **extrai** (título, tipo, projeto, prioridade,
  due_date, subtasks, **links**) → o **CÓDIGO** detecta lacunas (`build_gaps` em bomdia.py: campos
  vazios) → **passo de perguntas modulares** (`renderQuestions`/`applyAnswersAndReview` em app.js):
  projeto (sugere existentes + Novo/Sem projeto), prazo (Hoje/Amanhã/data/Sem prazo), link (campo
  aberto/Não tem) → revisão editável → cria. Chave: **quem decide as perguntas é o código** (não
  depende da força do modelo); a IA só extrai/propõe. Prompt do sistema fica em `SYSTEM_PROMPT`.
- Regra ensinada à IA: preferir **1 tarefa com subtasks** a inventar um projeto com N tarefas;
  extrair qualquer URL/pasta do texto pro campo `links`; extrair **recorrencia** (diaria/semanal/
  mensal) quando o texto indicar frequência ("todo dia", "toda sexta") — campo confirmável na revisão.

---

## Como testar de VERDADE (padrão usado até aqui)

O usuário valoriza teste real. **Nunca** mexer na instância dele (porta 9463). Padrão:

1. Suba um **2º servidor na porta 9464** contra uma **CÓPIA** do banco:
   ```python
   import sys, shutil; sys.path.insert(0, r"<pasta do projeto>"); import bomdia
   copy = r"<temp>/bomdia_test.db"; shutil.copy(r"<pasta>/bomdia.db", copy)
   bomdia.DB_PATH = copy; bomdia.init_db()
   bomdia.ThreadingServer(("127.0.0.1", 9464), bomdia.Handler).serve_forever()
   ```
2. Exercite via `curl` (rotas) e/ou **screenshot headless** com Edge:
   ```
   "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" --headless=new --disable-gpu \
     --window-size=1300,1000 --virtual-time-budget=4000 --screenshot="<temp>/x.png" \
     "http://localhost:9464/?proj=GRUPO%20URBAN&ptab=links"
   ```
3. **Ao terminar, mate o 9464 e apague os temporários.**

**Gotchas de teste:**
- Edge headless **não escreve screenshot na scratchpad** (acesso negado) → salve em `%TEMP%`.
- `curl` no Git Bash manda `-d` com acento em **latin-1** → dá `UnicodeDecodeError` no servidor.
  Escreva o JSON num arquivo UTF-8 e use `--data-binary @arquivo.json`.
- Windows: shell é PowerShell (primário) + Bash (POSIX). Use caminhos absolutos.

---

## Roadmap — próximas fases (design já decidido com o usuário)

Projetos é o **coração** do sistema. Ideias e rotinas são interligadas a ele.
Ordem **incremental** (uma fase por vez, testando).

### ~~Fase 2 — Rotinas (recorrência + check)~~  ✅ FEITA (v7, commit 71dc6e4)
Implementado como decidido: `recorrencia` + `feito_em` (período), check reseta na virada, botão
"Marcar feito hoje/nesta semana/neste mês" nos cards/linhas/kanban, aparece na central do projeto,
IA extrai recorrência. Ideias de continuação (não decididas): rotinas do dia no dashboard Hoje;
pergunta de lacuna de recorrência no fluxo do assistente.

### Fase 3 — Ideias (post-it linkável)  ← PRÓXIMA
- Ideia = anotação leve, **sem prazo obrigatório**, pegada de post-it.
- **Decidido:** uma ideia **vincula a VÁRIOS** ao mesmo tempo (projeto + rotina + tarefa) — vínculo
  **múltiplo** (tabela de junção, ex.: `idea_links(idea_id, target_type, target_id)`).
- Exemplo real do usuário: ideia "melhorar exportação de leads" → vinculada à **rotina** "exportar
  leads" → do **projeto** GRUPO URBAN. Tudo interligado.
- Hoje "ideia" é só um `tipo` de tarefa; transformar em algo mais leve/visual e com vínculos.

### Fase 4 — Puzeira (persona do assistente)
- Dar **nome e cara** ao assistente de IA: ele se chama **Puzeira**. "Organizar meu dia" ficou raso
  pro que ele faz.
- Avatar/mascote: o usuário vai gerar/mandar a imagem → salvar em `assets/puzeira.png` e usar no
  botão e no modal. (A identidade combina com o app: sol + faísca + órbita.)
- Ensinar o Puzeira a **criar/preencher projeto, rotina (com recorrência) e ideia (com vínculos)** —
  não só tarefa. Ele deve **acompanhar qualquer mudança de conceito** (fonte única = mapa de campos).

---

## Convenções ao trabalhar aqui

- **PT-BR** sempre.
- Incremento pequeno e útil > reescrita. Propor, executar, **testar de verdade**, e oferecer commit.
- Suba `?v=` dos assets ao editar js/css; avise pra reiniciar o app quando mexer no `bomdia.py`.
- Não versione `bomdia.db` nem `config.json` (já no `.gitignore`; backups `bomdia.db.bak-*` também).
- Antes de operações destrutivas no banco (reorganizar/merge), **faça backup** (`copy bomdia.db ...`).

## Estado atual dos dados (referência)
4 projetos: **GRUPO URBAN** (maior), **Market Center**, **Broadcast**, **FREELAS**. Tarefas já têm
subtarefas e links; alguns projetos têm escopo/envolvidos/links/anotações de teste (criados durante
o desenvolvimento — o usuário pode limpar).
