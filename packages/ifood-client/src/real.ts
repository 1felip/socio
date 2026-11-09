import type { IfoodClient } from './client';
import { NotConfiguredError } from './errors';

/** Adapter da API real. Sem CNPJ não há credencial: todos os métodos lançam. */
export class RealIfoodClient implements IfoodClient {
  readonly mode = 'real' as const;

  async listMerchants(): Promise<never> {
    throw new NotConfiguredError('listMerchants');
  }
  async getMerchantStatus(): Promise<never> {
    throw new NotConfiguredError('getMerchantStatus');
  }
  async listCatalogs(): Promise<never> {
    throw new NotConfiguredError('listCatalogs');
  }
  async listCatalog(): Promise<never> {
    throw new NotConfiguredError('listCatalog');
  }
  async upsertItems(): Promise<never> {
    throw new NotConfiguredError('upsertItems');
  }
  async listReviews(): Promise<never> {
    throw new NotConfiguredError('listReviews');
  }
  async replyReview(): Promise<never> {
    throw new NotConfiguredError('replyReview');
  }
  async pollOrderEvents(): Promise<never> {
    throw new NotConfiguredError('pollOrderEvents');
  }
  async acknowledgeOrderEvents(): Promise<never> {
    throw new NotConfiguredError('acknowledgeOrderEvents');
  }
  async getOrder(): Promise<never> {
    throw new NotConfiguredError('getOrder');
  }
  async getFinancialSummary(): Promise<never> {
    throw new NotConfiguredError('getFinancialSummary');
  }
}
