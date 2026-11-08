---
name: ifood-api
description: Contrato da API de parceiros do iFood (Catalog, Review, Order, Merchant, Financial), o adapter IfoodClient e o mock. Use ao integrar com catálogo, avaliações, pedidos ou financeiro.
---
# API iFood

TODO (T04): substituir por um resumo de até 60 linhas feito a partir da documentação oficial (developer.ifood.com.br), com URLs.

Já sabido:
- Módulos usados: Authentication, Merchant, Catalog, Review, Order, Financial.
- O portal de desenvolvedor exige CNPJ. Este projeto roda com `IFOOD_MODE=mock`.
- Todo acesso passa por `getIfoodClient()` em packages/ifood-client. O mock segue o mesmo formato do contrato oficial.
- Contrato espelhado em `packages/ifood-client/openapi.yaml`. Resumo completo em `docs/research/ifood-api.md`.
