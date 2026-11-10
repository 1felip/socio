/**
 * pnpm llm:smoke — 1 chamada curta por provedor (Anthropic, Google, OpenAI).
 * Pula o provedor sem chave ou sem papel configurado. Com Supabase no env, grava em agent_runs
 * na primeira loja do banco (ou em SMOKE_MERCHANT_ID).
 */
import { createServiceClient } from '@socio/db';
import {
  configureLlm,
  flushTracing,
  generateText,
  MemoryRunStore,
  MODEL_ROLES,
  type ModelRole,
  type Provider,
  resolveModel,
  SupabaseRunStore,
} from '../src/index.ts';
import { hasProviderKey } from '../src/registry.ts';

const PROVIDERS: Provider[] = ['anthropic', 'google', 'openai'];
const env = process.env;

function roleFor(provider: Provider): ModelRole | undefined {
  return MODEL_ROLES.filter((r) => r !== 'embed' && r !== 'audio').find((role) => {
    try {
      return resolveModel(role, env).provider === provider;
    } catch {
      return false;
    }
  });
}

async function setup(): Promise<{ merchantId: string; sink: string }> {
  if (env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    const db = createServiceClient(env);
    let merchantId = env.SMOKE_MERCHANT_ID;
    if (!merchantId) {
      const { data, error } = await db.from('merchants').select('id').limit(1).single();
      if (error || !data)
        throw new Error(`nenhuma loja no banco (rode pnpm seed): ${error?.message}`);
      merchantId = data.id;
    }
    configureLlm({ store: new SupabaseRunStore(db), env });
    return { merchantId, sink: 'agent_runs (Supabase)' };
  }
  configureLlm({ store: new MemoryRunStore(), env });
  return {
    merchantId: '00000000-0000-0000-0000-000000000000',
    sink: 'memória (sem Supabase no env)',
  };
}

async function main(): Promise<void> {
  if (env.LLM_FAKE === '1') console.warn('LLM_FAKE=1 ativo: as chamadas não vão aos provedores.');
  const { merchantId, sink } = await setup();
  console.log(`Gravando em: ${sink}\n`);

  let ok = 0;
  let failed = 0;
  for (const provider of PROVIDERS) {
    const role = roleFor(provider);
    if (!role) {
      console.log(`SKIP ${provider}: nenhum MODEL_* aponta para ele`);
      continue;
    }
    if (!hasProviderKey(provider, env)) {
      console.log(`SKIP ${provider}: chave ausente`);
      continue;
    }
    try {
      const r = await generateText({
        role,
        ctx: { merchantId, agent: 'smoke', step: provider },
        prompt: 'Responda só com a palavra: ok',
        maxOutputTokens: 16,
        timeoutMs: 30_000,
      });
      ok++;
      console.log(
        `OK   ${provider} (${role}: ${r.model}) "${r.text.trim().slice(0, 30)}" ` +
          `${r.usage.inputTokens}+${r.usage.outputTokens} tok · US$ ${r.costUsd.toFixed(6)} · ${Math.round(r.latencyMs)} ms`,
      );
    } catch (err) {
      failed++;
      console.log(`FAIL ${provider} (${role}): ${err instanceof Error ? err.message : err}`);
    }
  }
  await flushTracing();
  console.log(`\n${ok} OK · ${failed} falha(s)`);
  if (failed > 0) process.exitCode = 1;
}

await main();
