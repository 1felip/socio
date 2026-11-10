# T02 · Banco Supabase: schema, RLS e tipos
Fase 0 · Quem: CLAUDE · Depende: T00, T01 · Estimativa: 2–3 h · Skills: supabase-db · Revisão: segurança

## Objetivo
Schema inicial versionado em migrations, com RLS, role read-only do Analista e tipos gerados.

## Entregar
- [ ] Extensão `vector`. Tabelas: `merchants` (tom de voz, margem mínima, timezone), `merchant_members`, `catalog_items`, `menu_uploads`, `orders`, `order_items`, `reviews`, `review_replies`, `approvals`, `agent_runs`, `roi_events`, `conversations`.
- [ ] Dinheiro em centavos; `approvals` com kind, payload jsonb, payload_hash, status, token_hash, expires_at, approved_by, executed_at.
- [ ] Dimensão do embedding conforme `MODEL_EMBED` (registre em DECISIONS).
- [ ] RLS em todas as tabelas via `merchant_members`.
- [ ] Role `analyst_ro` + views `v_sales_daily`, `v_item_performance`, `v_reviews` (sem nome nem telefone de cliente), com `statement_timeout` de 5 s.
- [ ] Bucket privado `menu-photos`.
- [ ] `packages/db`: `createServerClient`, `createServiceClient`, tipos gerados.
- [ ] Teste: `analyst_ro` não consegue INSERT nem ler tabelas fora de `v_*`.

## Aceite
```
pnpm supabase db push      # pede confirmação
pnpm db:types
pnpm check
```

## Estado (2026-11-09, sem contas)
Feito offline: migrations em `supabase/migrations`, testes de RLS/analyst_ro em PGlite (`packages/db/src/schema.test.ts`),
clientes em `packages/db`, `database.types.ts` escrito à mão (será sobrescrito).
Pendente após a T00:
1. `pnpm supabase link --project-ref <ref>` e `pnpm supabase db push` (pede confirmação).
2. Login da role do Analista (fora da migration, no SQL Editor):
   `alter role analyst_ro with login password '<senha forte>';` → montar `SUPABASE_DB_URL_ANALYST_RO` no `.env`.
3. `pnpm db:types` e `pnpm check`. Conferir `get_advisors` (segurança) no Supabase.
4. Dados demo (T03): `pnpm seed` e depois `pnpm supabase db reset --linked` (migrations + `supabase/seed.sql`; pede confirmação).
