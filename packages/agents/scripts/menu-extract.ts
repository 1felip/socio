/**
 * pnpm --filter @socio/agents menu:extract <caminho-da-imagem>
 * Imprime o MenuDraft em JSON no stdout. Custo e avisos vão para o stderr.
 *
 * Sem MENU_MERCHANT_ID, grava agent_runs só em memória. Com LLM_FAKE=1, usa respostas fixas.
 */
import { readFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { configureLlm, flushTracing, isFakeMode, MemoryRunStore } from '@socio/llm';
import { useFakeMenu } from '../src/menu/fixtures.ts';
import { extractMenu, MenuReadError } from '../src/menu/pipeline.ts';

const MEDIA: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

async function main(): Promise<number> {
  const arg = process.argv[2];
  if (!arg) {
    console.error('uso: pnpm --filter @socio/agents menu:extract <caminho-da-imagem>');
    return 2;
  }
  // pnpm --filter roda no diretório do pacote; o caminho é relativo a quem chamou.
  const file = resolve(process.env.INIT_CWD ?? process.cwd(), arg);
  const mediaType = MEDIA[extname(file).toLowerCase()];
  if (!mediaType) {
    console.error(
      `formato não suportado: ${extname(file) || '(sem extensão)'} (use jpg, png ou webp)`,
    );
    return 2;
  }

  const merchantId = process.env.MENU_MERCHANT_ID;
  if (!merchantId) configureLlm({ store: new MemoryRunStore() });
  if (isFakeMode()) {
    console.error('[menu:extract] LLM_FAKE=1: respostas fixas, a foto não é lida.');
    useFakeMenu();
  }

  try {
    const result = await extractMenu(
      { data: readFileSync(file), mediaType },
      { merchantId: merchantId ?? '00000000-0000-0000-0000-000000000000' },
    );
    console.log(JSON.stringify(result.draft, null, 2));
    console.error(
      `[menu:extract] ${result.prompts.extract} + ${result.prompts.refine} · US$ ${result.costUsd.toFixed(4)}`,
    );
    for (const w of result.draft.warnings) console.error(`  ! ${w}`);
    return 0;
  } catch (err) {
    if (err instanceof MenuReadError) {
      console.error(`${err.userMessage}${err.message ? ` (${err.message})` : ''}`);
      return 1;
    }
    throw err;
  } finally {
    await flushTracing();
  }
}

process.exitCode = await main();
