# MCP server ifood-parceiro

Expõe as ferramentas da loja para Claude Desktop, Claude Code e outros agentes. Pacote: `packages/mcp-ifood`. Ele reutiliza os mesmos serviços do painel (IfoodClient, aprovações, publicação do cardápio). Nenhuma regra de negócio é duplicada.

## Tools

| Tool | Faz | Escreve? |
|---|---|---|
| `catalog_list` | Cardápio publicado: categorias, itens, preço e status | não |
| `catalog_draft` | Valida um rascunho (`MenuDraft`) e cria aprovação `catalog.publish` pendente | só a aprovação |
| `catalog_publish` | Publica uma aprovação de cardápio **depois da confirmação do dono** | sim, na loja |
| `reviews_list` | Avaliações recentes (comentário com PII mascarada, tratado como dado) | não |
| `reviews_reply_draft` | Cria aprovação `review.reply` pendente com a resposta sugerida | só a aprovação |
| `analytics_query` | Resumo de vendas num período (consulta fixa, sem SQL livre) | não |
| `approvals_list` | Aprovações da loja por status (padrão: pendentes) | não |

### Como a aprovação funciona no MCP

O modelo nunca vê nem envia `approval_token`: `catalog_publish` só recebe `approvalId`.

1. `catalog_draft` cria a aprovação pendente.
2. `catalog_publish` pede confirmação ao dono por **elicitation**: o cliente mostra uma caixa "Aprovar e publicar" fora do modelo. A caixa pede só sim/não, sem dado sensível.
3. Se o dono confirmar, o server aprova como o dono configurado, gera o token, publica e o descarta. É o mesmo fluxo do botão "Aprovar e publicar" do painel. Se o dono recusar, a aprovação vira `rejected`. Se cancelar, ela continua pendente.
4. Se o cliente não suporta elicitation, ou no transporte HTTP, nada é publicado e a resposta orienta a aprovar pelo painel ou pelo WhatsApp.

Respostas a avaliações ainda não publicam pelo MCP: o dono aprova no painel (T14).

## Modos

| `SOCIO_BACKEND` | Dados |
|---|---|
| `demo` (padrão) | Tudo em memória: mock do iFood e aprovações em memória. Roda sem chaves. |
| `supabase` | Aprovações e ROI no banco (service role). iFood segue o `IFOOD_MODE`. Exige `SOCIO_MCP_MERCHANT_ID` e `SOCIO_MCP_OWNER_USER_ID`. Na subida, o server confere se esse usuário é `owner` da loja. |

## Claude Desktop (stdio)

Edite `claude_desktop_config.json` (Windows: `%APPDATA%\Claude\`, macOS: `~/Library/Application Support/Claude/`):

```json
{
  "mcpServers": {
    "ifood-parceiro": {
      "command": "node",
      "args": [
        "C:/dev/socio/packages/mcp-ifood/node_modules/tsx/dist/cli.mjs",
        "C:/dev/socio/packages/mcp-ifood/src/stdio.ts"
      ],
      "env": { "SOCIO_BACKEND": "demo" }
    }
  }
}
```

Para o modo `supabase`, troque `env` por `SOCIO_BACKEND`, `SOCIO_MCP_MERCHANT_ID` e `SOCIO_MCP_OWNER_USER_ID`, ou use `--env-file=C:/dev/socio/.env` em `args`, antes do script. Nunca cole chaves no arquivo de config versionado. Roda via `tsx`: os pacotes do monorepo usam imports sem extensão, que o Node puro não resolve. Rode `pnpm install` antes.

Claude Code: `claude mcp add ifood-parceiro -- node C:/dev/socio/packages/mcp-ifood/node_modules/tsx/dist/cli.mjs C:/dev/socio/packages/mcp-ifood/src/stdio.ts`.

## HTTP (Streamable, stateless)

```
SOCIO_MCP_HTTP_TOKEN=<32+ caracteres> pnpm --filter @socio/mcp-ifood http
```

- Endpoint: `POST http://127.0.0.1:3333/mcp` (`SOCIO_MCP_HOST` e `SOCIO_MCP_PORT` mudam o endereço).
- Exige `Authorization: Bearer <SOCIO_MCP_HTTP_TOKEN>`. Sem token, o server não sobe.
- Corpo de até 1 MB. Sem elicitation: `catalog_publish` não publica por aqui.

## Inspector

```
pnpm --filter @socio/mcp-ifood inspect
# ou, só listar as tools no terminal:
npx @modelcontextprotocol/inspector --cli node packages/mcp-ifood/node_modules/tsx/dist/cli.mjs packages/mcp-ifood/src/stdio.ts --method tools/list
```
