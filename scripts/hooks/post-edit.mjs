#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
// PostToolUse (Edit|Write): formata e checa só o arquivo editado.
// Silencioso quando passa; em falha, exit 2 envia o erro ao Claude.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CHECKED = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.jsx', '.json', '.css']);

let raw = '';
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', () => {
  try {
    const input = JSON.parse(raw || '{}');
    const file = input?.tool_input?.file_path;
    if (!file || !CHECKED.has(path.extname(file))) process.exit(0);
    const bin = path.join(
      root,
      'node_modules',
      '.bin',
      process.platform === 'win32' ? 'biome.cmd' : 'biome',
    );
    if (!fs.existsSync(bin)) process.exit(0); // Biome ainda não instalado (antes da T01)
    const r = spawnSync(bin, ['check', '--write', '--no-errors-on-unmatched', file], {
      cwd: root,
      encoding: 'utf8',
      shell: process.platform === 'win32',
    });
    if (r.status === 0) process.exit(0);
    const msg = `${r.stdout || ''}${r.stderr || ''}`.trim().split(/\r?\n/).slice(-30).join('\n');
    process.stderr.write(`Biome encontrou problemas em ${path.relative(root, file)}:\n${msg}\n`);
    process.exit(2);
  } catch {
    process.exit(0);
  }
});
