# ☀️ Bom Dia

Organizador pessoal de demandas — 100% local, banco no próprio computador, sem nuvem.

Feito pra resolver um problema específico: demandas picadas do dia a dia que caem no esquecimento
e só são feitas quando cobradas. Você liga o PC, abre o **Bom Dia**, e ele já te mostra o que tem
pra fazer.

## Recursos

- **Nova demanda** com título, prioridade, prazo, quem pediu, pra quem enviar e descrição.
- **Links importantes** de dois tipos:
  - 🔗 **Web** — abre no navegador.
  - 📁 **Pasta** — cola o caminho de uma pasta do PC e, ao clicar, ela **abre no Explorer**.
    (Só funciona por rodar localmente.)
- **3 modos de visualização**: Cards, Lista e Kanban (com arrastar-e-soltar entre colunas).
- **Agenda (calendário)**: visão mensal das demandas pelos prazos. Clique numa demanda para editar,
  ou num dia vazio para criar já com aquela data. Hoje em destaque, atrasadas marcadas em vermelho.
- **Subtarefas**: quebre uma demanda em passos (checklist). O card mostra o progresso e deixa marcar
  cada passo direto; a lista mostra um selo `☑ 2/3`. O assistente de IA agrupa passos de um mesmo
  entregável como subtarefas — em vez de criar vários itens ou um projeto só pra segurá-los.
- **Assistente que pergunta o que faltou**: no "Organizar meu dia", depois de ler seu texto a IA
  mostra só as perguntas do que ficou em aberto — projeto (sugerindo os existentes), prazo, links —
  antes de criar. Você completa o cadastro numa rodada rápida, estilo assistente de verdade.
- **Projetos como entidade**: cada projeto tem vida própria — **escopo**, **envolvidos** e **links
  fixos**. Na aba Projetos você cria projetos (não só tarefas), **minimiza** cada um, e **abre** a
  central isolada: um espaço só daquele projeto, com tudo à mão e só as demandas dele. Deep-link
  `?proj=Nome`. Dentro da central, sub-abas **Demandas · Anotações · Links**:
  - **Anotações** — bloco de notas do projeto, separado por “arquivos” (várias anotações nomeadas).
  - **Canalizador de links** — reúne todos os links do projeto num lugar só, à mão.
- **Filtros**: status, prioridade, só atrasadas, e ordenação (prioridade & prazo / prazo / recentes / A–Z).
- **Roda na bandeja do Windows** — ícone de sol ao lado do relógio, sem janela de terminal.

## Stack

Python puro (biblioteca padrão: `http.server` + `sqlite3`) no back-end, HTML/CSS/JS na interface.
Único extra: `pystray` + `pillow` para o ícone da bandeja.

```bash
pip install pystray pillow
```

## Como usar

- **Bandeja (recomendado):** duplo clique em `Bom Dia (bandeja).vbs`. Aparece o ícone de sol ☀️
  ao lado do relógio. Clique nele (ou botão direito → *Abrir Bom Dia*) para abrir. *Sair* encerra.
- **Modo terminal (debug):** `Bom Dia.bat` — abre com janela preta mostrando logs/erros.

O app sobe em `http://localhost:9463`. O banco fica em `bomdia.db` (na mesma pasta).

Na VPS, o acesso passa por um login temporário validado pelo servidor. Configure
`AUTH_USER`, `AUTH_PASSWORD` e `AUTH_SECRET` nas variáveis de ambiente; consulte
`DEPLOY.md` para o passo a passo do Coolify.

## Backup

É só copiar o arquivo `bomdia.db`. Ele guarda todas as suas demandas.
