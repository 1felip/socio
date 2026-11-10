/**
 * Orquestrador: porta de entrada única para painel e WhatsApp.
 *
 * request → memória curta → roteador → handler da intenção → resposta padrão.
 * Handlers recebem só tools de leitura ou de proposta (approvals.create). Tool de escrita
 * na loja nunca entra no loop: ela exige approval_token, que o modelo não vê.
 */
import {
  type AgentTool,
  CostLimitError,
  defineTool,
  generateWithTools,
  loadPrompt,
  maskPII,
  renderPrompt,
} from '@socio/llm';
import { z } from 'zod';
import type { ApprovalService } from '../approvals/service.ts';
import { type ChatTurn, type ConversationStore, DEFAULT_HISTORY } from './memory.ts';
import { ORCHESTRATOR_AGENT, type RouteDecision, routeIntent } from './router.ts';
import {
  AgentRequest,
  type AgentResponse,
  type ApprovalRef,
  type Attachment,
  type Intent,
} from './schema.ts';

export interface HandlerInput {
  request: AgentRequest;
  intent: Intent;
  conversationId: string;
  history: ChatTurn[];
}

export interface HandlerOutput {
  text: string;
  approvals?: ApprovalRef[];
  attachments?: Attachment[];
}

export type IntentHandler = (input: HandlerInput) => Promise<HandlerOutput>;

export interface LoopLimits {
  maxSteps: number;
  maxCostUsd: number;
  timeoutMs: number;
}

export const DEFAULT_LOOP_LIMITS: LoopLimits = { maxSteps: 5, maxCostUsd: 0.05, timeoutMs: 45_000 };

export interface OrchestratorDeps {
  approvals: ApprovalService;
  conversations: ConversationStore;
  /** Substitui handlers padrão (T14 avaliações, T15 analista, T22 campanhas). */
  handlers?: Partial<Record<Intent, IntentHandler>>;
  historySize?: number;
  limits?: Partial<LoopLimits>;
  now?: () => Date;
}

export interface Orchestrator {
  handle(input: unknown): Promise<AgentResponse>;
}

export const MESSAGES = {
  audioSoon: 'Ainda não consigo ouvir áudio por aqui. Pode me mandar por escrito?',
  menuPhoto:
    'Recebi a foto. Para eu montar o rascunho do cardápio, envie ela pelo painel em Cardápio > Novo. Quer o link?',
  notYet: {
    avaliacoes:
      'Responder avaliações ainda está chegando. Por enquanto eu cuido do cardápio e das aprovações. Quer ver o que está esperando você?',
    analista:
      'Análise de vendas ainda está chegando. Por enquanto eu cuido do cardápio e das aprovações. Quer ver o que está esperando você?',
    campanhas:
      'Criar promoções ainda está chegando. Por enquanto eu cuido do cardápio e das aprovações. Quer ver o que está esperando você?',
  },
  failed: 'Tive um problema aqui e não consegui terminar. Pode tentar de novo daqui a pouco?',
  partial: 'Não consegui terminar de olhar tudo agora. Pode me perguntar de um jeito mais direto?',
} as const;

export class InvalidAgentRequest extends Error {
  override readonly name = 'InvalidAgentRequest';
}

/** Tools de leitura disponíveis para o handler de conversa. */
export function readOnlyTools(approvals: ApprovalService, merchantId: string) {
  return {
    aprovacoes_pendentes: defineTool({
      description: 'Lista o que está esperando aprovação do dono nesta loja (tipo, resumo e data).',
      input: z.object({}),
      execute: async () => {
        const list = await approvals.list(merchantId, 'pending');
        return list.slice(0, 10).map((a) => ({
          id: a.id,
          kind: a.kind,
          summary: a.summary,
          createdAt: a.createdAt.toISOString(),
        }));
      },
    }),
  } satisfies Record<string, AgentTool>;
}

function chatHandler(deps: OrchestratorDeps, limits: LoopLimits): IntentHandler {
  return async ({ request, intent, conversationId, history }) => {
    const prompt = loadPrompt(ORCHESTRATOR_AGENT, 'chat');
    const messages = [
      ...history.map((t) => ({
        role: t.role,
        content: t.role === 'user' ? maskPII(t.text) : t.text,
      })),
      {
        role: 'user' as const,
        content: `<mensagem>\n${maskPII(request.text ?? '').replaceAll('</mensagem>', '')}\n</mensagem>`,
      },
    ];
    const r = await generateWithTools({
      role: prompt.role,
      ctx: {
        merchantId: request.merchantId,
        conversationId,
        agent: ORCHESTRATOR_AGENT,
        step: `chat.${intent}`,
        prompt,
      },
      system: renderPrompt(prompt.body, { intent }),
      messages,
      ...(prompt.temperature !== undefined ? { temperature: prompt.temperature } : {}),
      tools: readOnlyTools(deps.approvals, request.merchantId),
      maxSteps: limits.maxSteps,
      maxCostUsd: limits.maxCostUsd,
      timeoutMs: limits.timeoutMs,
      maxOutputTokens: 600,
    });
    const text = r.text.trim();
    return { text: text || MESSAGES.partial };
  };
}

function defaultHandlers(
  deps: OrchestratorDeps,
  limits: LoopLimits,
): Record<Intent, IntentHandler> {
  const chat = chatHandler(deps, limits);
  const notYet =
    (key: keyof typeof MESSAGES.notYet): IntentHandler =>
    async () => ({ text: MESSAGES.notYet[key] });
  return {
    conversa: chat,
    // Foto por aqui ainda não vira rascunho: baixar mídia do WhatsApp chega na T16.
    cardapio: async (input) =>
      input.request.imageUrl ? { text: MESSAGES.menuPhoto } : chat(input),
    avaliacoes: notYet('avaliacoes'),
    analista: notYet('analista'),
    campanhas: notYet('campanhas'),
  };
}

function userTurnText(req: AgentRequest): string {
  const parts = [
    req.text,
    req.imageUrl ? '[foto]' : undefined,
    req.audioUrl ? '[áudio]' : undefined,
  ];
  return parts.filter(Boolean).join(' ');
}

export function createOrchestrator(deps: OrchestratorDeps): Orchestrator {
  const limits: LoopLimits = { ...DEFAULT_LOOP_LIMITS, ...deps.limits };
  const keep = deps.historySize ?? DEFAULT_HISTORY;
  const now = deps.now ?? (() => new Date());
  const handlers = { ...defaultHandlers(deps, limits), ...deps.handlers };

  return {
    async handle(input) {
      const parsed = AgentRequest.safeParse(input);
      if (!parsed.success) {
        throw new InvalidAgentRequest(parsed.error.issues.map((i) => i.message).join('; '));
      }
      const request = parsed.data;
      const conversation = await deps.conversations.open({
        merchantId: request.merchantId,
        channel: request.channel,
        ...(request.externalRef ? { externalRef: request.externalRef } : {}),
      });
      const userAt = now().toISOString();

      let route: RouteDecision = { intent: 'conversa', source: 'fallback' };
      let out: HandlerOutput;
      try {
        if (request.audioUrl && !request.text) {
          out = { text: MESSAGES.audioSoon };
        } else {
          route = await routeIntent({
            merchantId: request.merchantId,
            conversationId: conversation.id,
            ...(request.text ? { text: request.text } : {}),
            hasImage: Boolean(request.imageUrl),
          });
          out = await handlers[route.intent]({
            request,
            intent: route.intent,
            conversationId: conversation.id,
            history: conversation.history,
          });
        }
      } catch (err) {
        if (err instanceof CostLimitError) out = { text: err.userMessage };
        else {
          console.error('[orchestrator]', err instanceof Error ? err.message : err);
          out = { text: MESSAGES.failed };
        }
      }

      await deps.conversations.append(
        conversation.id,
        [
          { role: 'user', text: userTurnText(request), at: userAt },
          { role: 'assistant', text: out.text, at: now().toISOString() },
        ],
        keep,
      );

      return {
        text: out.text,
        approvals: out.approvals ?? [],
        attachments: out.attachments ?? [],
        intent: route.intent,
      };
    },
  };
}
