# T00 · Contas e chaves
Fase 0 · Quem: HUMANO · Depende: — · Estimativa: 1–2 h

## Objetivo
Criar as contas e preencher `.env` a partir de `env.example`. O Claude não lê `.env`.

## Checklist humano
- [ ] Node 20+, `corepack enable` (pnpm), Git, Claude Code. Opcional: GitHub CLI (`gh auth login`).
- [ ] Anthropic Console: API key e limite de gasto mensal. (O plano Pro do Claude Code não inclui API.)
- [ ] Google AI Studio: API key do Gemini.
- [ ] OpenAI: API key (juiz dos evals; pode esperar até a T19).
- [ ] Supabase: projeto `socio-dev` (região São Paulo). Anote URL, anon key, service role e project ref. Rode `npx supabase login`.
- [ ] Langfuse Cloud: projeto e chaves.
- [ ] ElevenLabs: API key e uma voz (VOICE_ID).
- [ ] Vercel: conta ligada ao GitHub (pode esperar até a T10).
- [ ] Meta for Developers (T16) e n8n (T17) podem esperar.
- [ ] Confira os IDs atuais dos modelos Gemini e GPT e preencha `MODEL_*` no `.env`.

## Aceite
Você roda `node scripts/roadmap.mjs set T00 done`.
