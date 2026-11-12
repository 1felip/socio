import type { ValueUnit } from '@socio/agents';
import { formatBRL } from './money.ts';

const num = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });

/** Valor do gráfico no formato do dono: R$ 1.234,56 · 51,5% · 1.412. */
export function formatChartValue(value: number, unit: ValueUnit): string {
  switch (unit) {
    case 'cents':
      return formatBRL(Math.round(value));
    case 'percent':
      return `${num.format(Math.round(value * 10) / 10)}%`;
    default:
      return num.format(value);
  }
}

/** Versão curta para rótulo de eixo. */
export function formatAxisValue(value: number, unit: ValueUnit): string {
  if (unit === 'cents') return `R$ ${compact.format(value / 100)}`;
  if (unit === 'percent') return `${compact.format(value)}%`;
  return compact.format(value);
}

/** 2026-09-26 → 26/09; outros rótulos passam direto. */
export function formatChartLabel(label: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(label);
  return m ? `${m[3]}/${m[2]}` : label;
}
