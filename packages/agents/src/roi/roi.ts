/**
 * ROI: quanto tempo o dono economizou em cada execução aprovada.
 *
 * Minutos manuais são estimativas por tipo (base + por unidade, ex.: por item do cardápio).
 * Ficam marcados com `estimate_source` até a medição real com o restaurante na T11.
 */
import type { DbClient } from '@socio/db';
import type { ApprovalKind } from '../approvals/service.ts';

export const ROI_ESTIMATE_SOURCE = 'a medir na T11';

export interface ManualMinutes {
  base: number;
  perUnit: number;
}

/** Estimativas iniciais. Sobrescreva por tipo em `estimateManualMinutes(kind, units, config)`. */
export const DEFAULT_MANUAL_MINUTES: Record<ApprovalKind, ManualMinutes> = {
  'catalog.publish': { base: 10, perUnit: 3 },
  'review.reply': { base: 4, perUnit: 0 },
  'promo.create': { base: 15, perUnit: 0 },
  'message.send': { base: 2, perUnit: 0 },
};

export type RoiConfig = Partial<Record<ApprovalKind, ManualMinutes>>;

export function estimateManualMinutes(
  kind: ApprovalKind,
  units: number,
  config: RoiConfig = {},
): number {
  const m = config[kind] ?? DEFAULT_MANUAL_MINUTES[kind];
  return Math.max(0, Math.round(m.base + m.perUnit * Math.max(0, units)));
}

export interface RoiEvent {
  merchantId: string;
  /** Tarefa: o kind da aprovação executada. */
  kind: ApprovalKind;
  refId: string | null;
  manualMinutesEstimate: number;
  estimateSource: string;
  flowDurationMs: number;
  /** max(0, estimativa manual − duração real), em minutos inteiros. */
  minutesSaved: number;
}

export function buildRoiEvent(input: {
  merchantId: string;
  kind: ApprovalKind;
  refId: string | null;
  units: number;
  flowDurationMs: number;
  config?: RoiConfig;
}): RoiEvent {
  const manual = estimateManualMinutes(input.kind, input.units, input.config);
  const duration = Math.max(0, Math.round(input.flowDurationMs));
  return {
    merchantId: input.merchantId,
    kind: input.kind,
    refId: input.refId,
    manualMinutesEstimate: manual,
    estimateSource: ROI_ESTIMATE_SOURCE,
    flowDurationMs: duration,
    minutesSaved: Math.max(0, Math.floor(manual - duration / 60_000)),
  };
}

export interface RoiStore {
  record(event: RoiEvent): Promise<void>;
}

export class MemoryRoiStore implements RoiStore {
  readonly events: RoiEvent[] = [];

  async record(event: RoiEvent): Promise<void> {
    this.events.push(event);
  }
}

export class SupabaseRoiStore implements RoiStore {
  private readonly db: DbClient;

  constructor(db: DbClient) {
    this.db = db;
  }

  async record(e: RoiEvent): Promise<void> {
    const { error } = await this.db.from('roi_events').insert({
      merchant_id: e.merchantId,
      kind: e.kind,
      ref_id: e.refId,
      minutes_saved: e.minutesSaved,
      manual_minutes_estimate: e.manualMinutesEstimate,
      estimate_source: e.estimateSource,
      flow_duration_ms: e.flowDurationMs,
    });
    if (error) throw new Error(`roi_events insert: ${error.message}`);
  }
}
