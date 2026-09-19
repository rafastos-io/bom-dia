# Bom Dia — front novo (`web/`)

App React 19 + Vite 8 + TypeScript + Tailwind 4 consumindo o design system
`@rafastos/ui` (tokens `--rf-*`, Space Grotesk + IBM Plex Mono, Lucide, Liquid Glass).

A migração roda **ao lado** da UI antiga (`index.html` + `styles.css` + `app.js`),
que continua no repositório como referência até o cutover.

## Desenvolvimento

```powershell
cd web
npm install
npm run dev     # http://localhost:5199 (proxy de /api, /login, /logout, /health para :9463)
```

O backend Python precisa estar no ar na porta 9463 (modo local normal).

## Verificação

```powershell
npm run typecheck
npm run lint
npm run build     # gera web/dist
```

Auditoria do design system (estouro + contraste, dois temas) — do repo
`Rafastos.io`, com o app no ar:

```powershell
$env:AUDIT_BASE_URL="http://localhost:9463"
$env:AUDIT_ROUTES="/,/agenda,/rotina,/ideias,/projetos"
$env:AUDIT_STORAGE_STATE="<caminho>/state.json"   # sessão logada (apps com login)
npm run audit
```

## Servir o build pelo Python (sem Docker)

Com `web/dist` gerado, aponte o backend para ele:

```powershell
$env:BOMDIA_DIST_DIR="C:\...\BomDia\web\dist"; python bomdia.py
```

Sem essa variável (ou sem build), o `bomdia.py` continua servindo a UI antiga —
o modo local de sempre não muda.

## Pacote de UI

`@rafastos/ui` vem do **tarball vendorizado** (`vendor/rafastos-ui-0.1.0-tech.0.tgz`),
com versão **fixa** (sem `^`, sem auto-update). Para atualizar: gere o pacote no
repo `Rafastos.io` (`npm run pack:ui`), copie para `web/vendor/` e reinstale.
Nunca editar `node_modules/@rafastos/ui`.

## Deploy

Só pela branch `main` (Coolify). O `Dockerfile` da raiz tem o estágio Node que
builda este app e o estágio Python que serve o `dist/`. Regras completas em
`../AGENTS.md` e `../DEPLOY.md`.
