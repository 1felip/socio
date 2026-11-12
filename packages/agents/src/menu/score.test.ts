import { describe, expect, it } from 'vitest';
import {
  formatPrice,
  GoldCsvError,
  goldFromCsv,
  parseCsv,
  parsePrice,
  templateRows,
} from './gold-csv.ts';
import type { MenuDraft } from './schema.ts';
import {
  aggregate,
  type MenuGold,
  matchItems,
  nameSimilarity,
  normalizeName,
  scoreMenu,
} from './score.ts';

const item = (name: string, price_cents: number | null, allergens: string[] = []) => ({
  name,
  source_name: name.toUpperCase(),
  description: '',
  price_cents,
  complement_groups: [],
  allergens: allergens as MenuDraft['categories'][number]['items'][number]['allergens'],
  price_outlier: false,
  low_confidence: false,
});

const draft: MenuDraft = {
  categories: [
    {
      name: 'Pizzas',
      items: [
        item('Pizza Calabresa', 4790, ['gluten', 'lactose']),
        item('Pizza Margherita', 4990, ['gluten', 'lactose']),
        item('Pizza Portuguesa', 5400, ['gluten', 'lactose', 'ovo']),
      ],
    },
    { name: 'Bebidas', items: [item('Refrigerante Lata', 650), item('Água com gás', 500)] },
  ],
  warnings: [],
};

const gold: MenuGold = {
  id: 'pizzaria-1',
  image: 'pizzaria-1.jpg',
  items: [
    { category: 'Pizzas', name: 'Calabresa', price_cents: 4790, allergens: ['gluten', 'lactose'] },
    {
      category: 'Pizzas',
      name: 'Pizza Margherita',
      price_cents: 4990,
      allergens: ['gluten', 'lactose'],
    },
    {
      category: 'Pizzas',
      name: 'Pizza Portuguesa',
      price_cents: 5290,
      allergens: ['gluten', 'lactose', 'ovo'],
    },
    { category: 'Bebidas', name: 'Refrigerante lata', price_cents: 650, allergens: [] },
    { category: 'Sobremesas', name: 'Pudim', price_cents: null, allergens: ['ovo', 'lactose'] },
  ],
};

describe('casamento de nomes', () => {
  it('normaliza acento, caixa e pontuação', () => {
    expect(normalizeName('  Pizza  Calabresa (G) ')).toBe('pizza calabresa g');
    expect(normalizeName('Água com Gás')).toBe('agua com gas');
  });

  it('parecido acima do limiar, exato primeiro e 1-para-1', () => {
    expect(nameSimilarity('Calabresa', 'Pizza Calabresa')).toBeCloseTo(0.5);
    expect(nameSimilarity('Pizza Calabresa G', 'Pizza Calabresa')).toBeCloseTo(2 / 3);
    const pairs = matchItems(
      [{ category: '', name: 'Pizza Calabresa', price_cents: 1, allergens: [] }],
      [
        { name: 'Pizza Calabresa G', price_cents: 1, allergens: [] },
        { name: 'pizza calabresa', price_cents: 1, allergens: [] },
      ],
    );
    expect(pairs).toEqual([[0, 1]]);
  });
});

describe('scoreMenu', () => {
  it('F1 de itens, preço exato e alérgenos', () => {
    const s = scoreMenu(gold, draft);
    // "Calabresa" × "Pizza Calabresa" fica abaixo de 0,6: conta como falta e sobra.
    expect(s.matched).toBe(3);
    expect(s.itemPrecision).toBeCloseTo(3 / 5);
    expect(s.itemRecall).toBeCloseTo(3 / 5);
    expect(s.itemF1).toBeCloseTo(0.6);
    expect(s.priceAccuracy).toBeCloseTo(2 / 3);
    expect(s.wrongPrices).toEqual([{ name: 'Pizza Portuguesa', gold: 5290, got: 5400 }]);
    expect(s.misses.sort()).toEqual(['Calabresa', 'Pudim']);
    expect(s.extras.sort()).toEqual(['Pizza Calabresa', 'Água com gás']);
    expect(s.allergenF1).toBe(1);
  });

  it('rascunho igual ao gabarito dá 1 em tudo; agregado é micro', () => {
    const perfect: MenuGold = {
      id: 'x',
      image: 'x.jpg',
      items: draft.categories.flatMap((c) =>
        c.items.map((i) => ({
          category: c.name,
          name: i.name,
          price_cents: i.price_cents,
          allergens: i.allergens,
        })),
      ),
    };
    const s = scoreMenu(perfect, draft);
    expect([s.itemF1, s.priceAccuracy, s.allergenF1]).toEqual([1, 1, 1]);
    const agg = aggregate([s, scoreMenu(gold, draft)]);
    expect(agg.menus).toBe(2);
    expect(agg.goldItems).toBe(10);
    expect(agg.itemF1).toBeCloseTo((2 * 0.8 * 0.8) / 1.6);
  });
});

describe('planilha do gabarito', () => {
  it('preço em pt-BR', () => {
    expect(parsePrice('R$ 32,90')).toBe(3290);
    expect(parsePrice('1.234,50')).toBe(123450);
    expect(parsePrice('7')).toBe(700);
    expect(parsePrice('12.5')).toBe(1250);
    expect(parsePrice('')).toBeNull();
    expect(parsePrice('abc')).toBeUndefined();
    expect(formatPrice(3290)).toBe('32,90');
    expect(formatPrice(null)).toBe('');
  });

  it('CSV com ; aspas e quebra de linha', () => {
    expect(parseCsv('a;"b;c";"d ""e"""\r\n1;"2\n3";4\n')).toEqual([
      ['a', 'b;c', 'd "e"'],
      ['1', '2\n3', '4'],
    ]);
  });

  it('template com prévia → import devolve o mesmo cardápio', () => {
    const csv = templateRows([
      { id: 'pizzaria-1', file: 'pizzaria-1.jpg', draft },
      { id: 'vazia', file: 'vazia.png' },
    ]);
    const golds = goldFromCsv(`﻿${csv}`);
    expect(golds.map((g) => g.id)).toEqual(['pizzaria-1', 'vazia']);
    expect(golds[1]?.items).toEqual([]);
    expect(scoreMenu(golds[0] as MenuGold, draft).itemF1).toBe(1);
    expect(golds[0]?.items[0]).toEqual({
      category: 'Pizzas',
      name: 'Pizza Calabresa',
      price_cents: 4790,
      allergens: ['gluten', 'lactose'],
    });
  });

  it('erros juntos, com linha, e nada é aceito pela metade', () => {
    const csv = [
      'foto_id;arquivo;categoria;item;preco;alergenos;obs',
      'ok;ok.jpg;Pizzas;Pizza;32,90;gluten;',
      'ok;ok.jpg;Pizzas;Outra;trinta;;',
      'ok;ok.jpg;Pizzas;Mais uma;10;glúten, nozes;',
      'id ruim;x.jpg;;Item;1;;',
    ].join('\n');
    expect(() => goldFromCsv(csv)).toThrow(GoldCsvError);
    try {
      goldFromCsv(csv);
    } catch (err) {
      const msg = (err as Error).message;
      expect(msg).toContain('linha 3: preço "trinta" inválido');
      expect(msg).toContain('linha 4: alérgeno "nozes" desconhecido');
      expect(msg).not.toContain('glúten');
      expect(msg).toContain('linha 5: foto_id "id ruim" inválido');
    }
  });

  it('cabeçalho sem coluna obrigatória é recusado', () => {
    expect(() => goldFromCsv('foto_id;item\nx;y')).toThrow(/coluna "arquivo"/);
  });
});
