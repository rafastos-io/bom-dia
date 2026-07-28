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

## Backup

É só copiar o arquivo `bomdia.db`. Ele guarda todas as suas demandas.
