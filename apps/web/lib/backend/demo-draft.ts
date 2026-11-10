import type { MenuDraft } from '@socio/agents';

/**
 * Rascunho que o modo demo devolve para qualquer foto (sem chamar modelo).
 * Traz de propósito um preço fora do padrão e um item lido com pouca confiança,
 * para a tela de revisão mostrar as flags.
 */
export function demoDraft(): MenuDraft {
  return {
    categories: [
      {
        name: 'Pizzas',
        items: [
          {
            name: 'Pizza Portuguesa',
            source_name: 'PIZZA PORTUGUESA',
            description: 'Molho de tomate, muçarela, presunto, ovo, cebola e azeitona.',
            price_cents: 5490,
            complement_groups: [
              {
                name: 'Borda recheada',
                min: 0,
                max: 1,
                options: [
                  { name: 'Catupiry', price_cents: 900 },
                  { name: 'Cheddar', price_cents: 900 },
                ],
              },
            ],
            allergens: ['lactose', 'ovo', 'gluten'],
            price_outlier: false,
            low_confidence: false,
          },
          {
            name: 'Pizza Quatro Queijos',
            source_name: 'PIZZA 4 QUEIJOS',
            description: 'Muçarela, provolone, parmesão e gorgonzola.',
            price_cents: 5890,
            complement_groups: [],
            allergens: ['lactose', 'gluten'],
            price_outlier: false,
            low_confidence: false,
          },
          {
            name: 'Pizza Frango com Catupiry',
            source_name: 'PIZZA FRANGO C/ CATUPIRY',
            description: 'Frango desfiado temperado com catupiry.',
            price_cents: 549,
            complement_groups: [],
            allergens: ['lactose', 'gluten'],
            price_outlier: true,
            low_confidence: false,
          },
        ],
      },
      {
        name: 'Bebidas',
        items: [
          {
            name: 'Suco de Laranja 500 ml',
            source_name: 'SUCO LARANJA 500ML',
            description: 'Natural, feito na hora.',
            price_cents: 1200,
            complement_groups: [],
            allergens: [],
            price_outlier: false,
            low_confidence: false,
          },
          {
            name: 'Água com Gás',
            source_name: 'AGUA C/ G?S',
            description: '',
            price_cents: 500,
            complement_groups: [],
            allergens: [],
            price_outlier: false,
            low_confidence: true,
          },
        ],
      },
    ],
    warnings: [
      '"Pizza Frango com Catupiry" está por R$ 5,49, bem abaixo das outras pizzas. Confere?',
      'Não deu para ler direito o nome de um item em Bebidas.',
    ],
  };
}
