/**
 * Roteador de intenção: regras determinísticas primeiro (custo zero, sem latência) e
 * modelo `fast` só quando as regras não decidem (nenhum sinal ou empate).
 */
import { generateObject, loadPrompt, renderPrompt, untrusted } from '@socio/llm';
import { z } from 'zod';
import { INTENTS, type Intent } from './schema.ts';

export const ORCHESTRATOR_AGENT = 'orchestrator';

/** Minúsculas e sem acento: "Promoção" → "promocao". */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

type Rule = [RegExp, number];

const RULES: Record<Intent, Rule[]> = {
  cardapio: [
    [/\b(cardapio|menu)\b/, 2],
    [
      /\b(prato|pratos|item|itens|categoria|categorias|complemento|complementos|sabor|sabores)\b/,
      1,
    ],
    [/\bprecos?\b/, 1],
    [/\b(esgot\w*|pausa\w*|acabou|indisponivel)\b/, 1],
    [/\bdescric(ao|oes)\b/, 1],
  ],
  analista: [
    [/\bvend(i|eu|emos|eram|as|a|ido|idos|ida|idas)\b/, 2],
    [/\bmais vendid/, 2],
    [/\b(faturament\w*|faturei|faturou|ticket medio|lucro|receita)\b/, 2],
    [/\b(pedidos|cancelament\w*|relatorio|horario de pico)\b/, 1],
    [/\b(quanto|quantos|quantas|compar\w*)\b/, 1],
  ],
  avaliacoes: [
    [/\b(avaliac(ao|oes)|review|reviews|estrelas?|comentarios?)\b/, 2],
    [/\b(reclam\w*|elogi\w*)\b/, 2],
    [/\bnota\b/, 1],
  ],
  campanhas: [
    [/\b(promoc(ao|oes)|promo|cupom|cupons|desconto|descontos|campanhas?|ofertas?)\b/, 2],
    [/\bfrete gratis\b/, 2],
    [/\bdia d(os|as) (pais|maes|namorados)\b/, 1],
  ],
  conversa: [
    [/^\s*(oi|ola|opa|bom dia|boa tarde|boa noite|e ai)\b/, 1],
    [/\b(obrigad\w*|valeu|brigad\w*)\b/, 1],
    [/\b(o que voce (consegue|sabe|faz)|quem e voce|me ajuda|ajuda)\b/, 1],
  ],
};

export interface RuleScore {
  intent: Intent | null;
  scores: Record<Intent, number>;
}

/** Soma os pesos por intenção. `intent` é null quando ninguém pontua ou há empate no topo. */
export function scoreRules(text: string, hasImage = false): RuleScore {
  const t = normalize(text);
  const scores = Object.fromEntries(INTENTS.map((i) => [i, 0])) as Record<Intent, number>;
  for (const intent of INTENTS) {
    for (const [re, weight] of RULES[intent]) if (re.test(t)) scores[intent] += weight;
  }
  if (hasImage) scores.cardapio += 3;

  const ranked = [...INTENTS].sort((a, b) => scores[b] - scores[a]);
  const [first, second] = ranked as [Intent, Intent];
  const top = scores[first];
  if (top === 0 || top === scores[second]) return { intent: null, scores };
  return { intent: first, scores };
}

const RouterOutput = z.object({ intent: z.enum(INTENTS) });

export interface RouteDecision {
  intent: Intent;
  source: 'rules' | 'model' | 'fallback';
}

export interface RouteInput {
  merchantId: string;
  conversationId?: string;
  text?: string;
  hasImage?: boolean;
}

export async function routeIntent(input: RouteInput): Promise<RouteDecision> {
  const text = input.text ?? '';
  const rules = scoreRules(text, input.hasImage);
  if (rules.intent) return { intent: rules.intent, source: 'rules' };
  if (!text.trim()) return { intent: input.hasImage ? 'cardapio' : 'conversa', source: 'fallback' };

  const prompt = loadPrompt(ORCHESTRATOR_AGENT, 'router');
  try {
    const r = await generateObject({
      role: prompt.role,
      ctx: {
        merchantId: input.merchantId,
        agent: ORCHESTRATOR_AGENT,
        step: 'route',
        prompt,
        ...(input.conversationId ? { conversationId: input.conversationId } : {}),
      },
      ...(prompt.temperature !== undefined ? { temperature: prompt.temperature } : {}),
      prompt: renderPrompt(prompt.body, { message: untrusted('mensagem', text) }),
      schema: RouterOutput,
      schemaName: 'route',
      maxOutputTokens: 50,
      timeoutMs: 10_000,
    });
    return { intent: r.object.intent, source: 'model' };
  } catch (err) {
    // Teto de custo sobe para o orquestrador responder com a mensagem certa.
    if (err instanceof Error && err.name === 'CostLimitError') throw err;
    return { intent: 'conversa', source: 'fallback' };
  }
}
