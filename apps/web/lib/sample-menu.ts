import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Foto de exemplo do botão "usar foto de exemplo" (T10). Fica em public/, versionada. */
export const SAMPLE_MENU_PATH = join('public', 'samples', 'cardapio-exemplo.jpg');

function resolved(cwd = process.cwd()): string {
  return join(cwd, SAMPLE_MENU_PATH);
}

export function hasSampleMenu(cwd?: string): boolean {
  return existsSync(resolved(cwd));
}

export function readSampleMenu(cwd?: string): Uint8Array | null {
  const file = resolved(cwd);
  return existsSync(file) ? new Uint8Array(readFileSync(file)) : null;
}
