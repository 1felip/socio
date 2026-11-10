# Handoff
Última tarefa: T05 Camada LLM: modelos, custo e tracing (parcial, segue doing)
O que mudou: packages/llm/src/{registry,models,client,fake,limits,pricing,pii,prompts,runs,trace}.ts + testes; scripts/smoke.ts (`pnpm llm:smoke`).
env.example com IDs de modelo e LLM_FAKE; @socio/db importa ./clients.ts (Node roda TS direto). D10 e D11 em DECISIONS.md.
Atenção na próxima: aceite da T05 pendente só pelo smoke real (precisa de .env da T00). Preço de cache write da Anthropic é estimativa (1,25× input).
Gemini com preço promocional até 31/12/2026. MODEL_EMBED: OpenAI no env.example x Gemini no D7, decidir na T00.
T02 também espera T00 (db reset --linked + MockStore no Supabase). CLAUDE.md/README.md/tsbuildinfo seguem fora dos commits.
Próxima tarefa sugerida: T00 [HUMANO] destrava T02 e T05; offline, a próxima que dependa só de T05/T04 (ver roadmap.mjs status).
