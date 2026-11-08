# Sócio

Agente de IA que opera a loja de um pequeno restaurante parceiro do iFood pelo WhatsApp: cadastra o cardápio por foto, responde avaliações, explica as vendas e manda um briefing diário em áudio, sempre com aprovação do dono.

> Projeto independente de portfólio. Não é afiliado ao iFood.

Este repositório começa **sem código**: ele traz o roadmap e a configuração para o Claude Code construir o projeto inteiro pelo terminal, uma tarefa por sessão.

## Pré-requisitos
- Node 20+ e pnpm (`corepack enable`)
- Git e, opcionalmente, GitHub CLI (`gh`)
- Claude Code instalado e logado
- Contas da tarefa T00 (veja `docs/tasks/T00-contas-e-chaves.md`)

## Como trabalhar

```
claude            # abre a sessão; o hook já mostra o estado do roadmap
/next             # pega a próxima tarefa liberada, planeja e implementa
/done             # roda o aceite, atualiza o roadmap, escreve o handoff e commita
/clear            # limpa o contexto antes da próxima tarefa
```

Para começar direto: `claude "/next"`. Para retomar uma tarefa específica: `/next T07`.

Se o contexto encher no meio de uma tarefa: `/handoff`, depois `/clear` e `/next T07`.
Para um erro pontual: `/fix <mensagem do erro>`.

Ver o progresso **sem gastar tokens** (direto no terminal, fora do Claude):

```
node scripts/roadmap.mjs status
```

Tarefas marcadas como HUMANO ou AMBOS têm passos que só você pode fazer (criar contas, fotografar cardápios, gravar vídeo). O `/next` mostra esses passos e para. Quando terminar, rode `node scripts/roadmap.mjs set T00 done`.

## Como este repo economiza tokens

| Técnica | Onde | Efeito |
|---|---|---|
| CLAUDE.md curto | `CLAUDE.md` | Carregado em toda sessão; detalhes ficam fora dele |
| 1 tarefa = 1 sessão + `/clear` | `/next`, `/done` | O contexto nunca acumula tarefas antigas |
| Tarefas autocontidas | `docs/tasks/` | Cada sessão lê só um arquivo de ~40 linhas |
| Handoff curto | `docs/SESSION.md` | ≤15 linhas no lugar do histórico inteiro |
| Script de roadmap | `scripts/roadmap.mjs` | Estado em 5 linhas em vez de ler o roadmap |
| Hook de início | `scripts/hooks/session-start.mjs` | Injeta o estado sem nenhuma leitura de arquivo |
| Comandos com `disable-model-invocation` | `.claude/skills/next`, `done`… | Não ocupam contexto até você chamar |
| Skills de conhecimento sob demanda | `.claude/skills/*` | Só a descrição fica no contexto; o corpo carrega quando é preciso |
| Subagentes Haiku | `.claude/agents/` | Logs de teste, eval e documentação ficam fora do contexto principal |
| Hook pós-edição silencioso | `scripts/hooks/post-edit.mjs` | Só fala quando o lint falha |
| Leitura bloqueada | `.claude/settings.json` | Impede ler node_modules, builds, lockfile e imagens |
| Saída de Bash e MCP limitada | `env` em `settings.json` | Corta logs gigantes |
| MCPs ligados por fase | `.mcp.json` + `/mcp` | Só 2 MCPs ativos por padrão; os outros você liga quando a tarefa pedir |

Mais dicas:
- Use Sonnet no dia a dia (`/model`). Deixe modelos maiores ou o modo plano para tarefas de arquitetura (T05, T12).
- Rode `/context` de vez em quando para ver o que está ocupando espaço.
- Não peça "leia o projeto". Peça a tarefa.

## Estrutura

```
CLAUDE.md                 regras e mapa (carregado sempre)
docs/ROADMAP.md           tabela de tarefas (fonte da verdade)
docs/tasks/T00..T24       uma tarefa por arquivo
docs/SESSION.md           handoff da última sessão
docs/PROGRESS.md          log de 1 linha por tarefa
docs/DECISIONS.md         decisões de arquitetura
docs/ARCHITECTURE.md      visão completa (sob demanda)
.claude/settings.json     permissões, hooks, limites de saída
.claude/skills/           comandos (/next, /done, /handoff, /fix) e conhecimento
.claude/agents/           subagentes
.mcp.json                 MCPs do projeto
scripts/                  roadmap e hooks (Node, funciona no Windows)
```

## MCPs
Ativos por padrão: `context7` (documentação de bibliotecas) e `supabase`. Ligue os outros com `/mcp` quando a tarefa pedir: `playwright` (T08, T10), `n8n` (T17), `firecrawl` (T04, opcional). Chaves vão no seu ambiente, nunca no repositório.

## Windows
Os hooks e scripts são Node puro. Se um hook não rodar, troque `$CLAUDE_PROJECT_DIR` por caminho relativo em `.claude/settings.json`.
