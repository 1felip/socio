import { describe, expect, it } from 'vitest';
import { maskPII } from './pii.ts';

describe('maskPII', () => {
  it('mascara e-mails', () => {
    expect(maskPII('me manda em joana.silva+ifood@gmail.com ok?')).toBe('me manda em [EMAIL] ok?');
  });

  it.each([
    ['+55 (11) 98765-4321'],
    ['(11) 98765-4321'],
    ['11 98765 4321'],
    ['11987654321'],
    ['98765-4321'],
    ['(21)3456-7890'],
  ])('mascara telefone %s', (phone) => {
    expect(maskPII(`liga no ${phone} por favor`)).toBe('liga no [TELEFONE] por favor');
  });

  it('mascara CPF e CEP', () => {
    expect(maskPII('CPF 123.456.789-09, CEP 01310-100')).toBe('CPF [CPF], CEP [CEP]');
  });

  it.each([
    ['Rua das Flores, 123'],
    ['Av. Paulista 1000, ap 52'],
    ['avenida Brasil nº 45'],
    ['Travessa São José, 7'],
  ])('mascara endereço %s', (addr) => {
    expect(maskPII(`entregar na ${addr} hoje`)).toBe('entregar na [ENDERECO] hoje');
  });

  it('mascara nomes conhecidos, inteiros e em partes', () => {
    const out = maskPII('Maria Souza reclamou. A maria disse que a Souza da loja ajudou.', {
      names: ['Maria Souza'],
    });
    expect(out).toBe('[NOME] reclamou. A [NOME] disse que a [NOME] da loja ajudou.');
  });

  it('não mascara pedaço de palavra', () => {
    expect(maskPII('Anabela pediu', { names: ['Ana'] })).toBe('Anabela pediu');
  });

  it('mascara nomes após gatilhos comuns', () => {
    expect(maskPII('Oi, me chamo Carlos Eduardo e o pedido atrasou')).toBe(
      'Oi, me chamo [NOME] e o pedido atrasou',
    );
    expect(maskPII('falei com a Dona Cida ontem')).toBe('falei com a Dona [NOME] ontem');
  });

  it('não mexe em texto sem PII nem em preços e quantidades', () => {
    const text = 'A pizza de calabresa custa R$ 45,90 e veio fria. Pedi 2 unidades às 21h30.';
    expect(maskPII(text)).toBe(text);
  });

  it('não confunde gatilho com palavra comum em minúscula', () => {
    expect(maskPII('meu nome é importante pra vocês?')).toBe('meu nome é importante pra vocês?');
  });
});
