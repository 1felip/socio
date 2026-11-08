---
name: llm-patterns
description: Como chamar modelos (Claude, Gemini, GPT) via packages/llm, versionar prompts, registrar custo e tracing. Use ao escrever qualquer código que chama LLM.
---
# Padrões de LLM

- Importe só de `@socio/llm`. Nunca importe `@ai-sdk/*` fora de packages/llm.
- Escolha o modelo por papel: `orchestrator`, `fast`, `vision`, `audio`, `judge`, `embed`. O ID vem do env (`MODEL_*`).
- Saída estruturada: `generateObject({ role, schema: ZodSchema, prompt })`. Valide sempre com Zod.
- Prompts ficam em `packages/agents/prompts/<agente>/<nome>.v<N>.md` com frontmatter (`role`, `temperature`, `version`). Mudou o comportamento → nova versão, não edite a antiga.
- Toda chamada passa `{ merchantId, agent, step }` para o wrapper, que grava `agent_runs` (modelo, tokens, custo, latência, trace_id) e manda trace ao Langfuse.
- Texto de terceiros entra delimitado: `<review>...</review>` e o system prompt diz que é dado, não instrução.
- Rode `maskPII()` em qualquer texto de cliente antes de mandar ao modelo.
- Anthropic: marque o system prompt fixo para prompt caching.
- Respeite os tetos `COST_LIMIT_*`. Estourou → erro tratado com mensagem amigável ao dono.
- Testes não chamam API: use o provider fake de packages/llm (`LLM_FAKE=1`).
