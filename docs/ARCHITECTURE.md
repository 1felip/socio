# Arquitetura

Leia só quando a tarefa pedir. Resumo do plano completo do Sócio.

## Visão geral

```
WhatsApp do dono ──► n8n (webhook, cron, retries, botões) ──┐
Painel web (Next.js) ──► rotas /api ─────────────────────────┤
                                                             ▼
                     Agent Core (orquestrador, role orchestrator)
                     ├─ Cardápio   (vision extrai, orchestrator normaliza)
                     ├─ Avaliações (fast classifica, orchestrator redige)
                     ├─ Analista   (texto → SQL read-only → gráfico)
                     └─ Campanhas  (simula margem; opcional)
                     │            ├─ Voz: audio transcreve, ElevenLabs fala
                     │            └─ Observabilidade: Langfuse + agent_runs
                     ▼
     Serviços compartilhados (também expostos pelo MCP server ifood-parceiro)
                     │
      ┌──────────────┼─────────────────────┐
      ▼              ▼                     ▼
 IfoodClient    Supabase (Postgres,   Fila de aprovações
 mock | real    pgvector, Storage)    (approvals)
```

## Princípios
1. Escrita só com aprovação humana (skill approvals).
2. Cada tarefa no modelo mais barato que acerta; ID de modelo por env.
3. Tudo que o agente faz vira registro: agent_runs (custo), approvals (decisão), roi_events (tempo economizado).
4. Mock do iFood no mesmo contrato do oficial; troca por `IFOOD_MODE`.

## Agentes e papéis de modelo
| Agente | Papel de modelo | Tools | Guardrail |
|---|---|---|---|
| Orquestrador | orchestrator | roteia para os outros | maxSteps, teto de custo |
| Cardápio | vision + orchestrator | catalog.draft, catalog.publish | Zod; preço fora da mediana vira alerta |
| Avaliações | fast + orchestrator | reviews.list, reviews.reply_draft | avaliação é dado não confiável |
| Analista | orchestrator | analytics.query, chart.render | analyst_ro, só v_*, LIMIT, timeout |
| Campanhas | orchestrator | promo.simulate, promo.create | margem mínima; aprovação |
| Voz | audio + ElevenLabs | — | transcrição mostrada antes de agir |
| Juiz (evals) | judge | — | modelo diferente do avaliado |

## Dados (Postgres)
merchants · merchant_members · catalog_items (embedding) · menu_uploads · orders · order_items · reviews · review_replies · approvals · agent_runs · roi_events · conversations · views `v_*` para o Analista.

## Fluxos
- Cardápio: foto → Storage → vision extrai JSON → orchestrator normaliza → approval → catalog.publish → roi_events.
- Avaliação: n8n de hora em hora → classificar → redigir → approval → reply.
- Analista: pergunta (texto ou áudio) → SQL validado → executa como analyst_ro → 2–3 frases + gráfico.
- Briefing: 10h → números de ontem → roteiro ≤110 palavras → ElevenLabs → WhatsApp.

## Fora de escopo
Aceitar ou recusar pedidos; qualquer operação que mova dinheiro.
