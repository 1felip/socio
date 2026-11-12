# Medição: cadastro manual × Sócio (T11)

> Preencha os campos marcados com `__`. Depois disso eu atualizo `DEFAULT_MANUAL_MINUTES` em
> `packages/agents/src/roi/roi.ts` (hoje `catalog.publish` = 10 min + 3 min por item, estimativa)
> e troco `estimate_source` de "a medir na T11" para a referência desta medição.

## Método

- Mesmo cardápio nas duas medições: foto `__` (arquivo em `evals/datasets/menus/images/`), `__` itens, `__` categorias, `__` itens com complementos.
- **Manual:** cronômetro do primeiro clique no Portal do Parceiro até o último item salvo. Digitação de nome, descrição, preço, categoria e complementos. Sem copiar e colar de outro lugar.
- **Sócio:** cronômetro da escolha da foto até o "Aprovar" (inclui ler o rascunho, corrigir o que for preciso e aprovar). O tempo do modelo conta.
- Quem mediu: `__`. Data: `__`. Aparelho: `__` (o dono usa celular; medir no celular se possível).

## Resultado

| | Minutos | Correções feitas | Observações |
|---|---|---|---|
| Manual | `__` | — | `__` |
| Sócio | `__` | `__` itens corrigidos | `__` |
| **Economia** | `__` min (`__`%) | | |

Por item: manual `__` min/item · Sócio `__` min/item.

## Como entra no produto

- `roi_events.manual_minutes_estimate` passa a usar: base `__` min + `__` min por item.
- O painel ("minutos economizados no mês") e o README citam este arquivo como fonte.
