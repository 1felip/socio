import { describe, expect, it } from 'vitest';
import { formatBRL, formatUSD, parsePriceToCents } from './money.ts';

describe('formatBRL', () => {
  it('formata centavos como R$ 12,90', () => {
    expect(formatBRL(1290)).toBe('R$ 12,90');
    expect(formatBRL(123450)).toBe('R$ 1.234,50');
  });
});

describe('formatUSD', () => {
  it('não esconde gasto pequeno como zero', () => {
    expect(formatUSD(0)).toBe('US$ 0,00');
    expect(formatUSD(0.0042)).toBe('menos de US$ 0,01');
    expect(formatUSD(1.5)).toBe('US$ 1,50');
  });
});

describe('parsePriceToCents', () => {
  it.each([
    ['32,90', 3290],
    ['R$ 32,90', 3290],
    ['32.9', 3290],
    ['32', 3200],
    ['1.234,50', 123450],
    ['1.234', 123400],
  ])('%s → %i', (input, cents) => {
    expect(parsePriceToCents(input)).toBe(cents);
  });

  it.each(['', 'abc', '-5', '12,345', '1e3', '99999999'])('rejeita %s', (input) => {
    expect(parsePriceToCents(input)).toBeNull();
  });
});
