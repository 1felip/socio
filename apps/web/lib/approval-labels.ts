import type { ApprovalKind, ApprovalStatus } from '@socio/agents';

export const KIND_LABEL: Record<ApprovalKind, string> = {
  'catalog.publish': 'Publicar no cardápio',
  'review.reply': 'Responder avaliação',
  'promo.create': 'Criar promoção',
  'message.send': 'Enviar mensagem',
};

export const STATUS_LABEL: Record<ApprovalStatus, string> = {
  pending: 'Esperando você',
  approved: 'Aprovado',
  rejected: 'Recusado',
  expired: 'Expirou',
  executed: 'Publicado',
};

export const STATUS_VARIANT: Record<ApprovalStatus, 'default' | 'warning' | 'danger' | 'success'> =
  {
    pending: 'warning',
    approved: 'default',
    rejected: 'danger',
    expired: 'default',
    executed: 'success',
  };

const dt = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Sao_Paulo',
});

export function formatDateTime(d: Date): string {
  return dt.format(d);
}
