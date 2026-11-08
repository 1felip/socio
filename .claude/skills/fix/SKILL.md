---
name: fix
description: Corrige um erro específico com o mínimo de leitura
argument-hint: "<mensagem de erro ou comando que falha>"
disable-model-invocation: true
---
Erro: $ARGUMENTS

1. Reproduza com o subagente test-runner (ou rode o comando citado) e pegue só o stack trace relevante.
2. Leia apenas os arquivos e trechos que aparecem no stack trace.
3. Formule a causa em 1 frase antes de editar.
4. Faça a menor correção possível e adicione um teste que falharia sem ela.
5. Rode de novo pelo test-runner. Responda em até 5 linhas: causa, correção, teste.
