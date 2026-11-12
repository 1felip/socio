import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

// O bundle não guarda o caminho de packages/llm: apontamos os prompts explicitamente.
const promptsDir = fileURLToPath(new URL('../../packages/agents/prompts', import.meta.url));

const nextConfig: NextConfig = {
  transpilePackages: ['@socio/llm', '@socio/agents', '@socio/db', '@socio/ifood-client'],
  // Parser do Postgres (WASM) e driver do Analista: carregam do node_modules, fora do bundle.
  serverExternalPackages: ['libpg-query', 'postgres'],
  env: { SOCIO_PROMPTS_DIR: process.env.SOCIO_PROMPTS_DIR || promptsDir },
  outputFileTracingIncludes: { '/**': ['../../packages/agents/prompts/**/*.md'] },
  experimental: {
    // Foto do cardápio vai por Server Action (até 10 MB + multipart).
    serverActions: { bodySizeLimit: '11mb' },
  },
};

export default nextConfig;
