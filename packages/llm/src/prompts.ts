/**
 * Loader de prompts versionados: packages/agents/prompts/<agente>/<nome>.v<N>.md
 *
 * Frontmatter obrigatório: role, version. Opcional: temperature, description.
 * Mudou o comportamento → crie <nome>.v<N+1>.md; nunca edite uma versão publicada.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isModelRole, type ModelRole } from './registry.ts';

export const DEFAULT_PROMPTS_DIR = fileURLToPath(new URL('../../agents/prompts', import.meta.url));

export interface Prompt {
  /** "<agente>/<nome>@v<N>", gravado em agent_runs.prompt_version. */
  id: string;
  agent: string;
  name: string;
  version: number;
  role: ModelRole;
  temperature?: number;
  description?: string;
  body: string;
}

export interface LoadPromptOptions {
  /** Versão exata. Sem ela, carrega a maior. */
  version?: number;
  dir?: string;
}

const FILE = /^(?<name>[a-z0-9-]+)\.v(?<version>\d+)\.md$/;

export function parseFrontmatter(raw: string): { data: Record<string, string>; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  if (!match) throw new Error('prompt sem frontmatter (--- ... ---)');
  const data: Record<string, string> = {};
  for (const line of (match[1] ?? '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf(':');
    if (idx <= 0) throw new Error(`linha de frontmatter inválida: "${trimmed}"`);
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed
      .slice(idx + 1)
      .trim()
      .replace(/^(['"])(.*)\1$/, '$2');
    data[key] = value;
  }
  return { data, body: (match[2] ?? '').trim() };
}

export function listPromptVersions(agent: string, name: string, dir = DEFAULT_PROMPTS_DIR) {
  let files: string[];
  try {
    files = readdirSync(join(dir, agent));
  } catch {
    return [];
  }
  return files
    .map((f) => FILE.exec(f)?.groups)
    .filter((g): g is { name: string; version: string } => g?.name === name)
    .map((g) => Number(g.version))
    .sort((a, b) => a - b);
}

export function loadPrompt(agent: string, name: string, options: LoadPromptOptions = {}): Prompt {
  const dir = options.dir ?? DEFAULT_PROMPTS_DIR;
  const versions = listPromptVersions(agent, name, dir);
  const version = options.version ?? versions.at(-1);
  if (version === undefined || !versions.includes(version)) {
    throw new Error(
      `prompt não encontrado: ${agent}/${name}${options.version ? `.v${options.version}` : ''}`,
    );
  }
  const file = join(dir, agent, `${name}.v${version}.md`);
  const { data, body } = parseFrontmatter(readFileSync(file, 'utf8'));

  if (!data.role || !isModelRole(data.role)) {
    throw new Error(`${file}: frontmatter "role" inválido (${data.role ?? 'ausente'})`);
  }
  if (Number(data.version) !== version) {
    throw new Error(
      `${file}: frontmatter "version" (${data.version}) difere do arquivo (v${version})`,
    );
  }
  const prompt: Prompt = {
    id: `${agent}/${name}@v${version}`,
    agent,
    name,
    version,
    role: data.role,
    body,
  };
  if (data.temperature !== undefined) {
    const t = Number(data.temperature);
    if (!Number.isFinite(t) || t < 0 || t > 2) throw new Error(`${file}: temperature inválida`);
    prompt.temperature = t;
  }
  if (data.description) prompt.description = data.description;
  return prompt;
}

/** Substitui {{chave}}. Chave ausente é erro: prompt incompleto não vai ao modelo. */
export function renderPrompt(body: string, vars: Record<string, string | number> = {}): string {
  return body.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key: string) => {
    const value = vars[key];
    if (value === undefined) throw new Error(`variável de prompt ausente: ${key}`);
    return String(value);
  });
}
