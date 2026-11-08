---
name: supabase-db
description: Convenções de banco Supabase - migrations, RLS, role read-only do Analista, views v_*, geração de tipos. Use ao mexer em schema, queries ou seed.
---
# Banco (Supabase)

- Schema só por migration: `pnpm supabase migration new <nome>` → editar SQL → `pnpm supabase db push` (pede confirmação). Nunca altere o banco à mão.
- Depois de mudar schema: `pnpm db:types` (gera packages/db/src/types.ts). Não edite esse arquivo.
- RLS ligado em todas as tabelas. Acesso por `merchant_members(user_id, merchant_id)`. Service role só no servidor.
- Analista: role `analyst_ro` com SELECT apenas em views `v_*` (sem nome/telefone de cliente). Conexão própria `SUPABASE_DB_URL_ANALYST_RO` e `statement_timeout` de 5 s.
- Dinheiro em centavos (`integer`). Datas em `timestamptz`. IDs `uuid`.
- Storage: bucket privado `menu-photos`, caminho `<merchant_id>/<upload_id>.jpg`, URLs assinadas.
- Seed determinístico: `pnpm seed` (scripts/seed). Padrões plantados em `evals/datasets/planted-patterns.json`.
