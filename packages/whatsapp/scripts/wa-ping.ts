/**
 * pnpm wa:ping <numero> [--botoes] — manda uma mensagem de teste pelo número da Cloud API.
 *
 * Número com DDD ("11 98888-7777") ou internacional ("+55 11 98888-7777").
 * No número de teste da Meta, o destino precisa estar na lista de destinatários permitidos.
 * --botoes manda também uma mensagem com 2 botões de resposta rápida.
 */
import {
  configFromEnv,
  WhatsAppApiError,
  WhatsAppClient,
  WhatsAppConfigError,
} from '../src/client.ts';
import { maskPhone, normalizePhone } from '../src/phone.ts';

async function main(): Promise<number> {
  const arg = process.argv.slice(2).find((a) => !a.startsWith('--'));
  if (!arg) {
    console.error('uso: pnpm wa:ping <numero> [--botoes]');
    return 2;
  }
  const to = normalizePhone(arg);
  if (!to) {
    console.error('Número inválido. Use DDD + número (ex.: 11 98888-7777) ou +55...');
    return 2;
  }
  try {
    const wa = new WhatsAppClient(configFromEnv());
    const when = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const r = await wa.sendText(to, `Oi! Aqui é o Sócio. Teste de conexão do WhatsApp (${when}).`);
    console.log(`enviado para ${maskPhone(to)} · id ${r.messageId}`);
    if (process.argv.includes('--botoes')) {
      const b = await wa.sendButtons(to, 'Teste de botões: escolha um.', [
        { id: 'ping:ok', title: 'Chegou' },
        { id: 'ping:painel', title: 'Ver no painel' },
      ]);
      console.log(`botões enviados · id ${b.messageId}`);
    }
    return 0;
  } catch (err) {
    if (err instanceof WhatsAppApiError || err instanceof WhatsAppConfigError) {
      console.error(err.message);
      return 1;
    }
    throw err;
  }
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  },
);
