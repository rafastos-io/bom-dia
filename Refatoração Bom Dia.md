# Refatoração Bom Dia — migrar a UI para React consumindo `@rafastos/ui`

Instruções para o agente que for migrar a interface do **Bom Dia** para React, adotando
a linguagem visual do **Design System Rafastos.io**. Este arquivo vive no repositório do
Bom Dia de propósito: leia-o como instrução permanente da empreitada.

## Resultado esperado

Substituir a UI atual (`index.html` + `styles.css` + `app.js`, sem build) por um app
**React 19 + Vite 8 + Tailwind 4** que consome `@rafastos/ui`, com **paridade funcional
das cinco áreas**, modo local preservado, segurança intacta e aprovação na auditoria
automática de estouro/contraste (AA nos dois temas).

## Estado atual (fatos)

- **Backend:** Python, só biblioteca padrão (`http.server` + `sqlite3` + `urllib`), API REST JSON.
- **Frontend:** `index.html` (~1 arquivo), `styles.css` (~1293 linhas) e `app.js` (~1853 linhas),
  **sem framework e sem build**. Allowlist em `bomdia.py`: `PUBLIC_FILES = {index.html, login.html,
  styles.css, app.js, favicon.ico, robots.txt}` e `PUBLIC_DIRS = ("assets",)`.
- **Visual atual:** cockpit claro/escuro com fonte **Inter** (auto-hospedada em `assets/`), azul
  `#075CA8` para ações, amarelo solar e roxo do Poohzera; vars próprias (`--bg`, `--surface`, `--ink`,
  `--blue`, `--yellow`, `--alta`, `--media`, `--baixa`, `--radius: 18px`, `--pooh-warm`…). Referência
  em `apple-DESIGN.md`.
- **Modalidades:** desktop (barra lateral) e mobile (topo translúcido, **tab bar** fixa embaixo,
  **FAB** de captura, modais em **bottom-sheet**, `safe-area`, sem rolagem lateral desde 320 px).
- **Acessibilidade:** respeita `prefers-reduced-motion`, `prefers-reduced-transparency` e `prefers-contrast`.
- **Semente React:** `prototype-hoje/` já é React 19 + Vite 8 + Tailwind 4 + shadcn/radix (pnpm),
  mas usa **Manrope/Geist Mono** e **Hugeicons** — não é a linguagem Rafastos.
- **Deploy:** Coolify publica **somente `main`** (ver `AGENTS.md` do repo). Modo local: porta 9463,
  ícone na bandeja (`pystray`).

## Alvo

- React 19 + Vite 8 + Tailwind 4 + TypeScript, consumindo `@rafastos/ui`.
- Tokens `--rf-*`, fontes **Space Grotesk** + **IBM Plex Mono**, ícones **Lucide** (16/20/24, traço 2),
  base cromática neutra e material **Liquid Glass "Onyx"**.
- API Python **não muda**: o front consome os mesmos endpoints REST.

## Não negociável

1. **Backend Python permanece.** Nada de reescrever a API agora. O React fala com `/api/*`.
2. **Modo local continua funcionando** (Windows, porta 9463, bandeja, abrir pasta no Explorer via
   `POST /api/open` — que é local-only).
3. **Segurança preservada:** login por sessão (cookie `HttpOnly`), allowlist de arquivos, anexos
   privados no R2 entregues por `/api/attachments/:id/download`, nenhuma chave no front.
4. **Deploy só pela `main`** e só quando Rafael autorizar. Não afirmar "subiu" sem o SHA da `main`
   publicado (regra do `AGENTS.md`).
5. **Nenhum segredo** no código, em prompt ou em commit.

## Distribuição do pacote (sem auto-update)

`@rafastos/ui` **não está em registry**. Regra: versão **fixa**, sem faixa `^`, atualização só
quando Rafael pedir. Detalhes em `C:\Users\rafaa\VIBECODING\Rafastos.io\docs\versionamento.md`.

- **Durante a migração (dev):** pode usar `file:`/workspace apontando para
  `C:\Users\rafaa\VIBECODING\Rafastos.io\packages\ui` para iterar ao vivo.
- **Antes do deploy:** trocar por **tarball vendorizado** — copiar
  `rafastos-ui-<versão>.tgz` para `vendor/` do Bom Dia e instalar pelo caminho exato
  (`"@rafastos/ui": "file:vendor/rafastos-ui-0.1.0-tech.0.tgz"`). Isso funciona no Docker e é
  explícito. **Não** usar `file:` ao vivo em produção.

## Consumo do design system

- Instale o tarball + peers: `react`, `react-dom`, `lucide-react` (obrigatórios);
  `recharts` e `motion` conforme precisar.
- CSS (Tailwind 4):

  ```css
  @import "tailwindcss";
  @source "../node_modules/@rafastos/ui/dist";
  @source "../node_modules/@rafastos/ui/src";
  @import "@rafastos/ui/styles.css";
  @import "tw-animate-css";
  @import "shadcn/tailwind.css";
  ```

- Fontes: trocar **Inter** por **Space Grotesk** + **IBM Plex Mono**, **auto-hospedadas** em
  `assets/` (o modo local roda offline — nada de CDN). Definir `--font-space-grotesk` e
  `--font-ibm-plex-mono`.
- Tema: `themeInitScript` no `<head>` e `applyThemeToDocument("dark" | "light")`
  (`localStorage` `rafastos-theme`). Substituir as vars próprias (`--bg`, `--ink`, `--blue`…) pelos
  papéis `--rf-*`/aliases; remover a paleta Apple avulsa.
- Importe do pacote: `@rafastos/ui/<slug>` (ex.: `@rafastos/ui/button`), padrões em
  `@rafastos/ui/patterns/*`. Ver `brand/package-exports.json` no repo do DS.

### Mapa de componentes sugerido

| Necessidade no Bom Dia | O que usar |
| --- | --- |
| Ações, campos, selects | `button`, `input`, `textarea`, `native-select`, `field`, `label` |
| Cards de demanda, badges | `card`, `badge`, `separator` |
| Subtarefas (checklist) | `checkbox` + `progress` |
| Modais desktop | `dialog` |
| Modais mobile (bottom-sheet) | `drawer` (Vaul) |
| Agenda | `calendar` (react-day-picker) + `popover` |
| Central do projeto (sub-abas) | `tabs` |
| Listas longas / scroll | `scroll-area` |
| Anexos (prints, PDFs) | `attachment` |
| Toasts/feedback | `sonner` (`Toaster` único) |
| Poohzera: thread de mensagens | `message`, `bubble`, `message-scroller` |
| Poohzera: etapa de esclarecimento | `questionnaire` |
| Menu de ações | `dropdown-menu`, `popover`, `tooltip` |
| Estados vazios/carregando | `empty`, `skeleton`, `spinner` |
| Gráficos (se houver) | `chart` (`ChartContainer` + `--rf-chart-*`) |

**Lacunas a resolver (decidir com Rafael):**
- **Kanban com drag-and-drop** não é um primitivo do pacote → usar `motion` (reorder/drag) ou uma
  lib dedicada.
- **Router** de SPA (deep-link `?proj=Nome`, áreas) → react-router ou TanStack Router.
- **Camada de dados** → `fetch` puro ou TanStack Query.
- **Ícones** → trocar Hugeicons por Lucide.

## Identidade — decisões de Rafael (não assumir)

1. Fonte: confirmar a troca **Inter → Space Grotesk** (com IBM Plex Mono para dados).
2. Ação: confirmar **azul `#075CA8` → ação neutra** (`--rf-action`, branco no escuro / obsidian no claro).
3. Poohzera: a base Rafastos tem **um único hue vivo residual** (Violet AI). Onde entram o roxo e o
   amarelo solar do mascote? Ex.: manter só como **ativo de imagem** (avatar), sem colorir a UI.
4. O mascote/avatar permanece como asset — a tipografia da UI não recria logo nem mascote.

## Plano por fases (estrangulamento, sem big-bang)

A interface atual está **em uso diário**. Migre ao lado dela, não por cima.

- **Fase 0 — Preparação:** branch dedicado; inventário de telas/estados/rotas; decidir router, dados,
  DnD e distribuição; congelar a UI antiga como referência.
- **Fase 1 — Fundação:** Vite + Tailwind 4 + `@rafastos/ui`; shell (sidebar desktop, tab bar + FAB
  mobile), tema, tipografia, ícones, rota de áreas (vazias).
- **Fase 2 — Dados:** cliente da API (fetch com credenciais), tipos das entidades, estados de
  carregamento/erro; manter a API Python intacta.
- **Fase 3 — Áreas, uma a uma:** Hoje → Agenda → Rotina → Ideias → Projetos, cada uma com paridade
  funcional e a11y, servindo o React em paralelo à UI antiga.
- **Fase 4 — Superfícies complexas:** bottom-sheets, Kanban DnD, calendário, anexos (`Attachment`),
  modais de IA (`Message`/`Bubble`/`Questionnaire`).
- **Fase 5 — Servir o build:** `Dockerfile` com estágio Node de build + cópia do `dist/`; ajustar a
  allowlist de `bomdia.py` para os assets com hash; garantir `/login`, `/health` e o proxy de anexos.
- **Fase 6 — Verificação e cutover:** auditoria de estouro/contraste nos dois temas, paridade, a11y,
  smoke local + produção; então remover a UI antiga.

## Verificação

- `typecheck`, `lint` e `build` limpos.
- **Auditoria do DS** apontando para o app novo (a partir do repo Rafastos.io):
  `AUDIT_BASE_URL=http://localhost:<porta> npm run audit` → alvo **0 estouros / 0 falhas de contraste**.
  Ver `docs/audit-automatico.md`.
- Sem rolagem lateral de **320 px a 1440 px**; claro/escuro conferidos.
- Modo local (bandeja, porta 9463) e login testados manualmente.

## Critérios de aceite

- [ ] Paridade das **cinco áreas** e dos **três modos** (Cards, Lista, Kanban).
- [ ] Modo local funcionando; porta 9463; abrir pasta só no local.
- [ ] Segurança intacta (sessão, allowlist, R2 por proxy, sem segredo no front).
- [ ] Comportamentos Apple preservados (safe-area, tab bar, FAB, bottom-sheet, reduced-*).
- [ ] AA nos dois temas; auditoria 0/0; sem scroll lateral de 320 px.
- [ ] Deploy só pela `main`, com SHA confirmado e produção validada.
- [ ] Pacote com versão fixa; nenhuma atualização automática.

## Referências

- Repo do DS: `C:\Users\rafaa\VIBECODING\Rafastos.io` — `docs/rafastos-ui.md`,
  `docs/versionamento.md`, `docs/audit-automatico.md`, `brand/guidelines.md`,
  `brand/package-exports.json`.
- Catálogo vivo: <https://designsystem.rafastos.com.br/design-system>
- Regras do repo Bom Dia: `AGENTS.md` (deploy só pela `main`), `DEPLOY.md`, `apple-DESIGN.md`.
- Memória durável: CENTRAL (Pessoal/03 - Produtos/Bom Dia e o projeto de consolidação).

---

## Prompt para copiar

```text
Migre a interface do Bom Dia (index.html + styles.css + app.js, sem build) para React 19 +
Vite 8 + Tailwind 4 + TypeScript, consumindo o design system @rafastos/ui.

Leia primeiro: o repo do DS em C:\Users\rafaa\VIBECODING\Rafastos.io
(docs/rafastos-ui.md, docs/versionamento.md, docs/audit-automatico.md, brand/guidelines.md,
brand/package-exports.json) e, neste repo, AGENTS.md, DEPLOY.md e apple-DESIGN.md.

Princípios:
- Backend Python e API REST não mudam. O React consome /api/*.
- Modo local (porta 9463, bandeja) e segurança (sessão, allowlist, R2 por proxy) permanecem.
- Visual: tokens --rf-*, Space Grotesk + IBM Plex Mono (auto-hospedadas), Lucide 16/20/24 traço 2,
  base neutra, material .rf-glass*. Cor real só em status.
- Ícones Hugeicons -> Lucide. Remover as vars Apple avulsas (--blue, --ink…).
- Pacote com versão FIXA, sem ^ e sem auto-update. Em dev pode usar file:; antes do deploy,
  vendorizar o tarball em vendor/.
- Não editar node_modules/@rafastos/ui.
- Deploy só pela main e só quando Rafael autorizar.

Processo (estrangulamento, a UI atual segue no ar):
Fase 0 inventário e decisões (router, dados, DnD, distribuição)
Fase 1 fundação (Vite+Tailwind+@rafastos/ui, shell, tema, fontes, ícones)
Fase 2 cliente da API e tipos
Fase 3 áreas uma a uma (Hoje, Agenda, Rotina, Ideias, Projetos) com paridade e a11y
Fase 4 bottom-sheets, Kanban DnD, calendário, anexos (Attachment), modais de IA
      (Message/Bubble/Questionnaire)
Fase 5 Docker com estágio Node + allowlist de bomdia.py para os assets com hash
Fase 6 auditoria (0/0, dois temas), smoke local+produção e cutover

Pergunte a Rafael antes de assumir: fonte (Inter -> Space Grotesk), cor de ação (azul -> neutro)
e onde entra o roxo/amarelo do Poohzera.

A cada fase: mostre o diff, rode typecheck/lint/build, e informe o que foi verificado e o que
ficou pendente. Não marque nada como concluído sem prova.
```
