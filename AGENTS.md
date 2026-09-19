# Operação do repositório Bom Dia

## Branch e deploy de produção

- O Coolify publica **somente o branch `main`**.
- Um `git push` em `codex/*`, `feature/*` ou qualquer outro branch **não atualiza a VPS**.
- Para considerar uma publicação concluída, o agente deve:
  1. validar e enviar o branch;
  2. criar e mergear o PR para `main` (ou fazer push direto na `main` quando explicitamente solicitado);
  3. confirmar que o webhook do Coolify criou uma fila para o SHA da `main`;
  4. aguardar `finished` e validar `https://bomdia.rafastos.com.br`.
- Nunca afirmar que “subiu para produção” apenas porque um feature branch foi enviado ao GitHub.

## Diagnóstico do pipeline

Antes de reiniciar Coolify, Horizon ou alterar firewall, executar:

```bash
ssh vps vps-health
```

Os itens Horizon, SSH interno, webhook público e autorreparo devem estar `OK`. Se estiverem,
compare o branch/SHA enviado com a `main`: a ausência de deploy para feature branch é esperada.

O documento completo de infraestrutura está em `C:\Users\rafaa\VPS\AGENTS.md`.

## Design System (@rafastos/ui)

- Fonte da verdade: `C:\Users\rafaa\VIBECODING\Rafastos.io` — guias `docs/rafastos-ui.md`,
  `docs/versionamento.md`, `docs/Início sistema.md`; contrato `brand/package-exports.json`;
  changelog `packages/ui/CHANGELOG.md`.
- Distribuição: **tarball vendorizado** em `web/vendor/`, versão **exata** no `package.json`
  (nunca `^`), sem Dependabot/Renovate/`npm update`. Atualizar é ato manual, só quando Rafael pedir.
- Versão instalada em 17/09/2026: `0.1.0-tech.0` (tarball SHA-256 `FD5573AE…412437`).
- Registry shadcn configurado em `web/components.json` (`@rafastos` →
  `https://designsystem.rafastos.com.br/r/{name}.json`); usar só para componentes que o
  projeto quer possuir (`npx shadcn@latest add @rafastos/<nome>` → `components/rafastos/`).
  Libs, patterns, charts e tokens ficam no tarball.
- O export raiz `@rafastos/ui` puxa o chunk de charts (recharts, peer opcional); por isso
  `web/src/lib/theme.ts` espelha `dist/lib/theme.js` e o `themeInitScript` está inline no
  `web/index.html`. Não importar a raiz do pacote sem instalar recharts.
- Ritual de atualização (manual): conferir versão/changelog no repo do DS → copiar o `.tgz`
  novo para `web/vendor/` e remover o antigo → `npm install ./vendor/rafastos-ui-<versão>.tgz`
  → `npm run typecheck`, `lint`, `build` → conferir os dois temas e rolagem lateral de 320 px
  a 1440 px → commitar tarball + lockfile.
- Nunca editar `node_modules/@rafastos/ui` nem apontar produção para o repo do DS.
- Auditoria opcional do DS (a partir do repo Rafastos.io, com o app no ar e sessão logada via
  `AUDIT_STORAGE_STATE`): `$env:AUDIT_BASE_URL="http://localhost:5199"`;
  `$env:AUDIT_ROUTES="/,/agenda,/rotina,/ideias,/projetos"`; `npm run audit`.

---

# Continuidade do Bom Dia na CENTRAL

Este repositório (`rafastos-io/bom-dia`, pasta `BomDia`) corresponde ao produto **Bom Dia** na área `Pessoal` da CENTRAL.

- Nota canônica do produto: `C:\Users\rafaa\CENTRAL\Rafael\Pessoal\03 - Produtos\Bom Dia.md`
- Área confirmada: `Pessoal`
- Caminho local: `C:\Users\rafaa\VIBECODING\BomDia`
- Remoto: `https://github.com/rafastos-io/bom-dia.git`

A evolução contínua (captura, Poohzera, cinco áreas, migração da UI) vive na nota de produto. Não crie uma segunda nota para o mesmo caminho ou remoto.

Ao trabalhar neste repositório, mantenha a documentação durável do projeto na CENTRAL.

Local padrão da CENTRAL:
C:\Users\rafaa\CENTRAL\Rafael

Antes de registrar qualquer coisa:
1. Leia `C:\Users\rafaa\CENTRAL\Rafael\CENTRAL.md`.
2. Leia `C:\Users\rafaa\CENTRAL\Rafael\00 - Central\99 - Sistema\Manual da CENTRAL.md`.
3. Leia `C:\Users\rafaa\CENTRAL\Rafael\00 - Central\99 - Sistema\Convenções.md`.
4. Procure uma nota de projeto existente comparando nome, `caminho_local` e `repositorio`. Atualize a nota existente; não crie duplicata.

Classificação:
- As áreas válidas são `Pessoal`, `Estudo`, `Grupo Urban`, `Freelancers` e `Estudio FR3D`.
- A nota de um projeto pertence a `<Área>/02 - Projetos/`.
- Produtos contínuos pertencem a `<Área>/03 - Produtos/`.
- Produto é o hub da evolução contínua; projeto é empreitada finita com encerramento. Se a mudança é evolução do dia a dia, atualize a nota do produto; registre um projeto apenas quando houver entrega e conclusão claras.
- Decisões específicas da área pertencem a `<Área>/05 - Decisões/`.
- Conhecimento reutilizável específico da área pertence a `<Área>/06 - Conhecimento/`.
- Inbox, índices globais, diário, arquivo, sistema e conteúdo realmente compartilhado ficam em `00 - Central/`.
- Só classifique a área quando ela estiver explícita na nota existente, na documentação do repositório ou nas instruções de Rafael. Se houver dúvida, não invente: registre a pendência em `00 - Central/01 - Inbox/Inbox.md` ou peça confirmação.

Quando ainda não existir nota do projeto:
- Crie uma única nota usando `00 - Central/99 - Sistema/Templates/Template - Projeto.md`.
- Use um nome humano, estável e coerente com o projeto.
- Registre objetivo, resultado verificável, estado, próxima ação, caminho local, repositório remoto, branch principal, stack, comandos úteis, ambientes e gestão de segredos sem valores sensíveis.
- Relacione produto e área somente quando forem confirmados.

Ao concluir uma sessão material de trabalho:
- Atualize `atualizado_em`.
- Atualize o estado atual e a próxima ação, se mudaram.
- Acrescente em `Última sessão` uma entrada datada contendo: mudanças realizadas, arquivos ou módulos relevantes, verificações executadas e seus resultados, pendências ou riscos reais e a próxima ação concreta.
- Registre fatos como fatos, hipóteses como hipóteses e ideias como ideias.
- Não transforme a nota em cópia do código, changelog de cada arquivo ou transcrição da conversa.

Decisões:
- Se houve escolha durável de arquitetura, produto, escopo, dados, processo ou operação, crie ou atualize uma nota de decisão usando `00 - Central/99 - Sistema/Templates/Template - Decisão.md`.
- Explique contexto, critérios, alternativas, escolha, consequências, evidências e condição de revisão.
- Crie links nos dois sentidos entre decisão, projeto, produto e área afetados.

Segurança e preservação:
- Nunca registre senhas, tokens, cookies, chaves privadas, valores de variáveis secretas ou dados pessoais sensíveis.
- Registre apenas o nome da variável e onde o segredo é administrado.
- Não mova, renomeie ou apague notas existentes sem necessidade clara e autorização.
- Preserve conteúdo do usuário e links internos do Obsidian.
- Não crie links apenas para aproximar notas no grafo; cada link deve representar uma relação descrita.

Antes de finalizar:
- Verifique se todos os wikilinks alterados resolvem para notas existentes.
- Confirme que não criou uma segunda nota para o mesmo projeto.
- Informe quais notas da CENTRAL foram criadas ou atualizadas, quais verificações foram registradas e qualquer pendência real.
- Se a CENTRAL não estiver acessível, não finja que documentou: entregue um resumo pronto para registro e informe o bloqueio.
