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
