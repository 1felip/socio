export class NotConfiguredError extends Error {
  override readonly name = 'NotConfiguredError';
  constructor(method: string) {
    super(
      `RealIfoodClient.${method}: API real do iFood não configurada (sem credencial de parceiro). Use IFOOD_MODE=mock.`,
    );
  }
}

export class MissingApprovalError extends Error {
  override readonly name = 'MissingApprovalError';
  constructor(method: string) {
    super(`${method}: escrita na loja exige approvalId.`);
  }
}

export class IfoodNotFoundError extends Error {
  override readonly name = 'IfoodNotFoundError';
  constructor(resource: string, id: string) {
    super(`${resource} não encontrado: ${id}`);
  }
}
