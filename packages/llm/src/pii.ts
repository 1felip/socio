/**
 * maskPII — mascara dados pessoais de clientes antes de qualquer texto ir a um modelo.
 *
 * Cobre e-mail, CPF, CEP, telefone (formatos BR), endereço (logradouro + número) e nomes.
 * Nomes por regex são frágeis: passe `names` sempre que o nome do cliente for conhecido
 * (pedido, avaliação). Os padrões ("me chamo X", "Sr. X"…) são só uma rede de segurança.
 */

export const PII_TOKENS = {
  name: '[NOME]',
  phone: '[TELEFONE]',
  email: '[EMAIL]',
  address: '[ENDERECO]',
  cep: '[CEP]',
  cpf: '[CPF]',
} as const;

export interface MaskOptions {
  /** Nomes conhecidos (cliente do pedido, autor da avaliação). Casam sem diferenciar maiúsculas. */
  names?: readonly string[];
}

const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/gu;
// Só CPF pontuado: 11 dígitos soltos são ambíguos com celular e caem na regra de telefone.
const CPF = /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g;
const CEP = /\b\d{5}-\d{3}\b/g;
// +55 (11) 98765-4321 · 11 98765 4321 · (11)3456-7890 · 11987654321 · 98765-4321
const PHONE =
  /(?:\+?55[\s.-]?)?(?:\(?\b\d{2}\)?[\s.-]?)?\b9?\d{4}[\s.-]?\d{4}\b|(?:\+?55)?\b\d{2}9\d{8}\b/g;

const STREET_TYPES =
  'rua|r\\.|avenida|av\\.?|travessa|tv\\.|alameda|al\\.|pra[çc]a|estrada|rodovia|largo|viela|servid[ãa]o';
// "Rua das Flores, 123" · "Av. Paulista 1000, ap 52" — até o número (e complemento curto).
const ADDRESS = new RegExp(
  `\\b(?:${STREET_TYPES})\\s+[\\p{L}\\p{N}'. ]{2,60}?,?\\s*(?:n[ºo°.]?\\s*)?\\d{1,6}(?:\\s*[,-]?\\s*(?:ap(?:to|artamento)?|bloco|casa|cj|sala)\\.?\\s*\\w{1,5})?`,
  'giu',
);

const NAME_WORD = "\\p{Lu}[\\p{Ll}'’]+";
const FULL_NAME = `${NAME_WORD}(?:\\s+(?:d[aeo]s?\\s+)?${NAME_WORD}){0,3}`;
// Gatilhos que costumam preceder um nome próprio. Sem flag `i`: o nome precisa ter maiúscula.
const NAME_CONTEXT = new RegExp(
  `((?<![\\p{L}])(?:[Mm]e chamo|[Mm]eu nome [ée]|[Aa]qui [ée]|[Ss]ou [oa]|[Ss]ra?\\.?|[Ss]enhora?|[Dd]ona|[Ss]eu)\\s+)(${FULL_NAME})`,
  'gu',
);

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function maskPII(text: string, options: MaskOptions = {}): string {
  let out = text;

  out = out.replace(EMAIL, PII_TOKENS.email);
  out = out.replace(ADDRESS, PII_TOKENS.address);
  out = out.replace(CPF, PII_TOKENS.cpf);
  out = out.replace(CEP, PII_TOKENS.cep);
  out = out.replace(PHONE, (m) => (m.replace(/\D/g, '').length >= 8 ? PII_TOKENS.phone : m));

  const names = (options.names ?? [])
    .flatMap((n) => {
      const full = n.trim();
      // Nome completo e cada parte com 3+ letras ("Maria Souza" → "Maria", "Souza").
      const parts = full.split(/\s+/).filter((p) => p.length >= 3 && !/^d[aeo]s?$/i.test(p));
      return [full, ...parts];
    })
    .filter((n) => n.length >= 2)
    .sort((a, b) => b.length - a.length);
  for (const name of new Set(names)) {
    out = out.replace(
      new RegExp(`(?<![\\p{L}])${escapeRegExp(name)}(?![\\p{L}])`, 'giu'),
      PII_TOKENS.name,
    );
  }

  out = out.replace(NAME_CONTEXT, (_m, prefix: string) => `${prefix}${PII_TOKENS.name}`);

  return out;
}
