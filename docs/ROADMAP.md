# Roadmap

Fonte da verdade do progresso. Edite o status com `node scripts/roadmap.mjs set <ID> <todo|doing|done|skip>`.
Quem: CLAUDE (Claude Code faz sozinho) · HUMANO (só você) · AMBOS (tem passos seus e do Claude).
Fases: 0 Setup · 1 MVP (até a inscrição, 17/11) · 2 Agente · 3 Prova.

| ID | Fase | Tarefa | Depende | Quem | Status |
|---|---|---|---|---|---|
| T00 | 0 | Contas e chaves | — | HUMANO | todo |
| T01 | 0 | Monorepo e ferramentas | — | CLAUDE | done |
| T02 | 0 | Banco Supabase: schema, RLS e tipos | T00, T01 | CLAUDE | doing |
| T03 | 0 | Dados sintéticos com padrões plantados | T02 | CLAUDE | done |
| T04 | 0 | Contrato iFood: pesquisa, mock e adapter | T01 | CLAUDE | done |
| T05 | 1 | Camada LLM: modelos, custo e tracing | T02 | CLAUDE | doing |
| T06 | 1 | Agente Cardápio: foto para rascunho | T05 | CLAUDE | doing |
| T07 | 1 | Aprovações e publicação no catálogo | T04, T06 | CLAUDE | done |
| T08 | 1 | Painel: upload, revisão e aprovação | T07 | CLAUDE | done |
| T09 | 1 | Gabarito e eval do cardápio | T06 | AMBOS | todo |
| T10 | 1 | Deploy e demo para recrutador | T08 | AMBOS | todo |
| T11 | 1 | README, vídeo e inscrição | T09, T10 | AMBOS | todo |
| T12 | 2 | Orquestrador e roteamento | T07 | CLAUDE | done |
| T13 | 2 | MCP server ifood-parceiro | T07 | CLAUDE | done |
| T14 | 2 | Agente Avaliações | T03, T12 | CLAUDE | doing |
| T15 | 2 | Agente Analista: texto para SQL | T03, T12 | CLAUDE | todo |
| T16 | 2 | WhatsApp Cloud API | T12 | AMBOS | todo |
| T17 | 2 | n8n: entrada, botões e rotinas | T16 | AMBOS | todo |
| T18 | 2 | Voz e briefing diário | T15, T17 | CLAUDE | todo |
| T19 | 3 | Evals completos no CI | T14, T15 | CLAUDE | todo |
| T20 | 3 | Observabilidade e custos no painel | T12 | CLAUDE | todo |
| T21 | 3 | Revisão de segurança e PII | T14, T15, T17 | CLAUDE | todo |
| T22 | 3 | Campanhas (opcional) | T12 | CLAUDE | todo |
| T23 | 3 | Teste com restaurante real | T11 | AMBOS | todo |
| T24 | 3 | Case study, README final e vídeo | T19, T20, T21, T23 | AMBOS | todo |
