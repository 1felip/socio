/**
 * Respostas fixas do provider fake para o Agente Cardápio (testes e `menu:extract` com LLM_FAKE=1).
 */
import { type FakeResponder, setFakeResponder } from '@socio/llm';
import type { MenuExtraction, MenuRefinement } from './schema.ts';

export const FAKE_EXTRACTION: MenuExtraction = {
  is_menu: true,
  notes: null,
  categories: [
    {
      name: 'LANCHES',
      items: [
        {
          name: 'X-BURGUER',
          description: null,
          price_text: 'R$ 22,00',
          price_cents: 2200,
          complement_groups: [
            {
              name: 'Adicionais',
              min: 0,
              max: 3,
              options: [
                { name: 'Bacon', price_cents: 400 },
                { name: 'Ovo', price_cents: 200 },
              ],
            },
          ],
          confidence: 0.95,
        },
        {
          name: 'X-SALADA',
          description: 'pão, hamburguer, queijo, alface e tomate',
          price_text: 'R$ 24,00',
          price_cents: 2400,
          complement_groups: [],
          confidence: 0.9,
        },
        {
          name: 'X-TUDO',
          description: null,
          price_text: 'R$ 280,00',
          price_cents: 28000,
          complement_groups: [],
          confidence: 0.7,
        },
        {
          name: 'MISTO QUENTE',
          description: null,
          price_text: null,
          price_cents: null,
          complement_groups: [],
          confidence: 0.4,
        },
      ],
    },
    {
      name: 'BEBIDAS',
      items: [
        {
          name: 'Refri lata',
          description: null,
          price_text: 'R$ 6,00',
          price_cents: 600,
          complement_groups: [],
          confidence: 1,
        },
      ],
    },
  ],
};

export const FAKE_REFINEMENT: MenuRefinement = {
  categories: [
    { index: 0, name: 'Lanches' },
    { index: 1, name: 'Bebidas' },
  ],
  items: [
    {
      category_index: 0,
      item_index: 0,
      name: 'X-Burguer',
      description: 'Pão, hambúrguer e queijo.',
      allergens: ['gluten', 'lactose'],
    },
    {
      category_index: 0,
      item_index: 1,
      name: 'X-Salada',
      description: 'Pão, hambúrguer, queijo, alface e tomate.',
      allergens: ['gluten', 'lactose'],
    },
    {
      category_index: 0,
      item_index: 2,
      name: 'X-Tudo',
      description: 'Pão, hambúrguer, queijo, presunto, ovo e bacon.',
      allergens: ['gluten', 'lactose', 'ovo'],
    },
    {
      category_index: 0,
      item_index: 3,
      name: 'Misto Quente',
      description: 'Pão de forma, presunto e queijo na chapa.',
      allergens: ['gluten', 'lactose'],
    },
    {
      category_index: 1,
      item_index: 0,
      name: 'Refrigerante Lata',
      description: 'Lata de 350 ml.',
      allergens: [],
    },
  ],
};

export const fakeMenuResponder: FakeResponder = (req) => {
  if (!req.json) return '';
  if (req.role === 'vision') return JSON.stringify(FAKE_EXTRACTION);
  return JSON.stringify(FAKE_REFINEMENT);
};

export function useFakeMenu(): void {
  setFakeResponder(fakeMenuResponder);
}
