/** As três lojas fictícias, seus cardápios e o formato da demanda. */

export type ItemKind = 'main' | 'extra' | 'drink';

export interface ItemSpec {
  key: string;
  name: string;
  category: string;
  kind: ItemKind;
  priceCents: number;
  costCents: number;
  /** Popularidade relativa dentro do mesmo tipo. */
  weight: number;
}

export interface StoreSpec {
  key: 'pizzaria' | 'marmitaria' | 'acai';
  id: string;
  ifoodMerchantId: string;
  name: string;
  voiceTone: string;
  /** Pedidos num dia de fator 1. */
  baseOrders: number;
  /** Fator por dia da semana, 0 = domingo. */
  dowFactor: readonly [number, number, number, number, number, number, number];
  /** Peso por hora local (0–23). */
  hourWeights: Readonly<Record<number, number>>;
  deliveryFeeCents: number;
  neighborhoods: readonly string[];
  /** Quantos itens principais costuma ter um pedido (mín., máx.). */
  mainsPerOrder: readonly [number, number];
  items: ItemSpec[];
}

type Row = readonly [name: string, category: string, price: number, cost: number, weight?: number];

function items(kind: ItemKind, rows: readonly Row[]): ItemSpec[] {
  return rows.map(([name, category, priceCents, costCents, weight = 1]) => ({
    key: slug(name),
    name,
    category,
    kind,
    priceCents,
    costCents,
    weight,
  }));
}

export function slug(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export const pizzaria: StoreSpec = {
  key: 'pizzaria',
  id: '5e3d0000-0000-4000-8000-000000000001',
  ifoodMerchantId: 'demo-forno-da-vila',
  name: 'Pizzaria Forno da Vila',
  voiceTone: 'acolhedor, bem-humorado e direto',
  baseOrders: 32,
  dowFactor: [1.4, 0.7, 0.75, 0.8, 0.95, 1.35, 1.6],
  hourWeights: { 11: 0.6, 12: 1.2, 13: 0.7, 18: 1.2, 19: 4, 20: 6, 21: 5, 22: 2.5, 23: 0.8 },
  deliveryFeeCents: 699,
  neighborhoods: ['Vila Mariana', 'Saúde', 'Ipiranga', 'Cursino', 'Jabaquara', 'Aclimação'],
  mainsPerOrder: [1, 2],
  items: [
    ...items('main', [
      ['Pizza Margherita', 'Pizzas salgadas', 4990, 1500, 3],
      ['Pizza Calabresa', 'Pizzas salgadas', 4790, 1400, 5],
      ['Pizza Mussarela', 'Pizzas salgadas', 4590, 1300, 4],
      ['Pizza Portuguesa', 'Pizzas salgadas', 5290, 1700, 3],
      ['Pizza Frango com Catupiry', 'Pizzas salgadas', 5390, 1750, 4],
      ['Pizza Quatro Queijos', 'Pizzas salgadas', 5690, 2000, 2],
      ['Pizza Pepperoni', 'Pizzas salgadas', 5590, 1900, 2],
      ['Pizza Napolitana', 'Pizzas salgadas', 4990, 1500],
      ['Pizza Atum', 'Pizzas salgadas', 5490, 1900],
      ['Pizza Lombo Canadense', 'Pizzas salgadas', 5590, 1850],
      ['Pizza Bacon com Milho', 'Pizzas salgadas', 5290, 1700],
      ['Pizza Palmito', 'Pizzas salgadas', 5390, 1800],
      ['Pizza Vegetariana', 'Pizzas salgadas', 5190, 1650],
      ['Pizza Toscana', 'Pizzas salgadas', 5390, 1750],
      ['Pizza Moda da Casa', 'Pizzas salgadas', 5990, 2100, 2],
      ['Pizza Brócolis com Bacon', 'Pizzas salgadas', 5390, 1750],
      ['Pizza Carne Seca com Catupiry', 'Pizzas salgadas', 6290, 2300],
      ['Pizza Rúcula com Tomate Seco', 'Pizzas salgadas', 5590, 1850],
      ['Pizza de Chocolate', 'Pizzas doces', 4790, 1500],
      ['Pizza Romeu e Julieta', 'Pizzas doces', 4590, 1400, 0.6],
      ['Pizza Banana com Canela', 'Pizzas doces', 4390, 1300, 0.5],
      ['Pizza Prestígio', 'Pizzas doces', 4890, 1550, 0.6],
      ['Calzone de Calabresa', 'Calzones', 3990, 1300],
      ['Calzone de Frango', 'Calzones', 4190, 1400],
    ]),
    ...items('drink', [
      ['Refrigerante 2 L', 'Bebidas', 1490, 700, 4],
      ['Refrigerante lata', 'Bebidas', 650, 300, 2],
      ['Suco natural 500 ml', 'Bebidas', 990, 350],
      ['Água sem gás', 'Bebidas', 450, 150],
      ['Cerveja long neck', 'Bebidas', 990, 450, 2],
      ['Guaraná 1 L', 'Bebidas', 990, 450],
    ]),
  ],
};

export const marmitaria: StoreSpec = {
  key: 'marmitaria',
  id: '5e3d0000-0000-4000-8000-000000000002',
  ifoodMerchantId: 'demo-dona-cida',
  name: 'Marmitaria Dona Cida',
  voiceTone: 'carinhoso, simples e caseiro',
  baseOrders: 46,
  dowFactor: [1.15, 0.9, 0.95, 0.95, 0.95, 1.05, 1.3],
  hourWeights: { 11: 3, 12: 7, 13: 5, 14: 1.5, 18: 1, 19: 2, 20: 2, 21: 0.8 },
  deliveryFeeCents: 499,
  neighborhoods: ['Pinheiros', 'Butantã', 'Rio Pequeno', 'Jaguaré', 'Vila Sônia', 'Lapa'],
  mainsPerOrder: [1, 1],
  items: [
    ...items('main', [
      ['Marmita de frango grelhado', 'Marmitas', 2490, 1000, 5],
      ['Marmita de bife acebolado', 'Marmitas', 2890, 1250, 3],
      ['Marmita de carne de panela', 'Marmitas', 2790, 1150, 3],
      ['Marmita de filé de peixe', 'Marmitas', 2990, 1300],
      ['Marmita de strogonoff de frango', 'Marmitas', 2690, 1050, 3],
      ['Marmita fitness', 'Marmitas', 2790, 1150, 2],
      ['Marmita de linguiça', 'Marmitas', 2390, 950],
      ['Marmita de frango à parmegiana', 'Marmitas', 2990, 1250, 2],
      ['Marmita vegetariana', 'Marmitas', 2390, 850],
      ['Feijoada', 'Marmitas', 3290, 1400, 1.5],
      ['Escondidinho de carne seca', 'Marmitas', 2890, 1150, 2],
      ['Panqueca de carne', 'Marmitas', 2590, 1000],
      ['Virado à paulista', 'Marmitas', 2890, 1200],
      ['Bisteca de porco', 'Marmitas', 2690, 1100],
      ['Omelete com salada', 'Marmitas', 2190, 800, 0.7],
    ]),
    ...items('extra', [
      ['Porção de arroz', 'Acompanhamentos', 690, 200],
      ['Porção de feijão', 'Acompanhamentos', 690, 200],
      ['Farofa', 'Acompanhamentos', 590, 150],
      ['Salada extra', 'Acompanhamentos', 790, 250],
      ['Ovo frito', 'Acompanhamentos', 300, 80, 2],
      ['Batata frita', 'Acompanhamentos', 1290, 400, 2],
      ['Pudim', 'Sobremesas', 890, 300, 2],
      ['Mousse de maracujá', 'Sobremesas', 790, 250],
      ['Doce de leite', 'Sobremesas', 590, 200],
    ]),
    ...items('drink', [
      ['Suco natural', 'Bebidas', 790, 280, 2],
      ['Refrigerante lata', 'Bebidas', 600, 280, 3],
      ['Água', 'Bebidas', 400, 150],
      ['Chá gelado', 'Bebidas', 650, 220],
    ]),
  ],
};

export const acai: StoreSpec = {
  key: 'acai',
  id: '5e3d0000-0000-4000-8000-000000000003',
  ifoodMerchantId: 'demo-acai-do-porto',
  name: 'Açaí do Porto',
  voiceTone: 'animado, leve e jovem',
  baseOrders: 30,
  dowFactor: [1.5, 0.75, 0.8, 0.85, 0.95, 1.2, 1.55],
  hourWeights: { 12: 1, 13: 1.5, 14: 2, 15: 3, 16: 3, 17: 2, 18: 1, 19: 2, 20: 3, 21: 2.5, 22: 1 },
  deliveryFeeCents: 599,
  neighborhoods: ['Santana', 'Tucuruvi', 'Casa Verde', 'Mandaqui', 'Vila Guilherme'],
  mainsPerOrder: [1, 2],
  items: [
    ...items('main', [
      ['Açaí 300 ml', 'Açaí', 1490, 550, 3],
      ['Açaí 500 ml', 'Açaí', 2190, 800, 5],
      ['Açaí 700 ml', 'Açaí', 2790, 1050, 3],
      ['Açaí 1 L', 'Açaí', 3690, 1400],
      ['Açaí na tigela 500 ml', 'Açaí', 2490, 900, 2],
      ['Açaí com banana 500 ml', 'Açaí', 2390, 880, 2],
      ['Açaí com morango 500 ml', 'Açaí', 2590, 980, 2],
      ['Açaí zero açúcar 500 ml', 'Açaí', 2390, 900],
      ['Cupuaçu 500 ml', 'Cremes', 2290, 850],
      ['Creme de ninho 500 ml', 'Cremes', 2390, 900],
      ['Combo casal (2 açaís de 500 ml)', 'Combos', 3990, 1550, 1.5],
      ['Barca de açaí 1 kg', 'Combos', 5990, 2300, 0.5],
      ['Milk-shake de açaí', 'Bebidas geladas', 1990, 700],
      ['Smoothie de frutas vermelhas', 'Bebidas geladas', 1790, 650],
      ['Vitamina de açaí', 'Bebidas geladas', 1590, 580],
    ]),
    ...items('extra', [
      ['Leite condensado', 'Adicionais', 300, 90, 3],
      ['Granola', 'Adicionais', 250, 70, 3],
      ['Paçoca', 'Adicionais', 300, 90, 2],
      ['Nutella', 'Adicionais', 690, 300, 2],
      ['Leite em pó', 'Adicionais', 300, 90, 2],
      ['Morango extra', 'Adicionais', 400, 150],
      ['Banana extra', 'Adicionais', 250, 70],
      ['Confete', 'Adicionais', 350, 110],
      ['Mel', 'Adicionais', 250, 80],
    ]),
    ...items('drink', [
      ['Água de coco', 'Bebidas', 790, 350],
      ['Água', 'Bebidas', 400, 150],
    ]),
  ],
};

export const stores: readonly StoreSpec[] = [pizzaria, marmitaria, acai];

/** Janela de dados: 90 dias fixos (não relativos a hoje, para ser determinístico). */
export const WINDOW_START = '2026-08-01';
export const WINDOW_DAYS = 90;

/** Padrões plantados (ver evals/datasets/planted-patterns.json). */
export const PLANTED = {
  fridayDelay: { store: 'pizzaria', dow: 5, fromHour: 19, toHour: 22 },
  coldItem: { store: 'marmitaria', itemName: 'Escondidinho de carne seca', shareOfNegative: 0.7 },
  priceRise: {
    store: 'marmitaria',
    itemName: 'Marmita de frango grelhado',
    date: '2026-09-15',
    oldPriceCents: 2490,
    newPriceCents: 2990,
    demandFactorAfter: 0.45,
  },
} as const;
