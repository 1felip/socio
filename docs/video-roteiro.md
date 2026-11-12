# Roteiro do vídeo (90 s)

Gravação de tela no celular (ou o painel em largura de celular), com narração. Mostrar o produto, não slides.
Sem logo nem marca do iFood na tela; dizer "app de delivery" ou "portal do parceiro".

| Tempo | Tela | Fala (pt-BR, ritmo calmo) |
|---|---|---|
| 0–10 s | Cardápio impresso na mesa, celular na mão | "Dono de restaurante pequeno perde horas digitando cardápio no app de delivery. O Sócio faz isso a partir de uma foto." |
| 10–22 s | `/cardapio/novo` → tira a foto (ou "Usar foto de exemplo") | "Tiro a foto do cardápio impresso. Em uns segundos ele lê itens, preços e complementos." |
| 22–42 s | Tela de revisão: flags de preço fora do padrão e baixa confiança, corrigir um preço | "Ele não publica nada sozinho. Marca o que parece errado, como esse preço fora do padrão, e eu corrijo aqui." |
| 42–55 s | Enviar para aprovação → `/aprovacoes` → Aprovar (como dono) | "Toda escrita na loja passa por aprovação do dono, com um token de uso único. Aprovei." |
| 55–65 s | Catálogo atualizado (item publicado) + card "minutos economizados" | "Os itens estão no catálogo. Na minha medição, o cadastro manual levou `__` minutos; com o Sócio, `__`." |
| 65–80 s | `/analista`: "Quando acontecem as reclamações de atraso?" → resposta + gráfico | "Também dá para perguntar dos dados: ele gera a consulta, só leitura, e responde com o número e um gráfico." |
| 80–90 s | Tela do repositório / README com os evals | "Por trás: agentes com evals, aprovação humana em toda escrita e custo por loja sob controle. Link na descrição." |

## Checklist antes de gravar

- [ ] Demo restaurada (cron ou `GET /api/cron/demo-reset` com o Bearer).
- [ ] Foto de exemplo em `apps/web/public/samples/cardapio-exemplo.jpg`.
- [ ] Números de `docs/metrics.md` preenchidos (troque os `__` da fala).
- [ ] Notificações do celular desligadas; modo claro; zoom do navegador em 100%.
