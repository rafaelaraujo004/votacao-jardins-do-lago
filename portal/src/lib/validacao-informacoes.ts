/**
 * Informações do condomínio (telefones, horário, aviso, PIX da taxa, ronda,
 * responsável pelas reservas, link da votação) e o convite dos moradores.
 * Lógica pura: valida, normaliza e formata. Usada no servidor e nos testes.
 */
import { z } from "zod";

/** Só os números de um texto. */
function soDigitos(texto: string): string {
  return texto.replace(/\D/g, "");
}

// ---------- Telefones ----------

/**
 * Deixa só os dígitos de um telefone brasileiro com DDD.
 * Aceita "+55", espaços, parênteses e traços. Devolve 10 dígitos (fixo)
 * ou 11 dígitos (celular, começa com 9), ou null se não for válido.
 */
export function normalizarTelefone(texto: string): string | null {
  let d = texto.replace(/\D/g, "");
  // Tira o código do país (55) quando vier junto.
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
  // Tira o zero de discagem (ex.: 094...).
  if ((d.length === 11 || d.length === 12) && d.startsWith("0")) d = d.slice(1);
  if (d.length !== 10 && d.length !== 11) return null;
  // DDD: dois dígitos de 1 a 9 (não existe DDD com zero).
  if (!/^[1-9][1-9]/.test(d)) return null;
  // Celular tem 9 dígitos começando com 9; fixo tem 8 começando de 2 a 5.
  if (d.length === 11 && d[2] !== "9") return null;
  if (d.length === 10 && !/[2-5]/.test(d[2])) return null;
  return d;
}

/** "94991234567" → "(94) 9 9123-4567"; "9433221100" → "(94) 3322-1100". */
export function formatarTelefone(digitos: string): string {
  const d = digitos.replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d[2]} ${d.slice(3, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return digitos;
}

/** Celular tem 11 dígitos (com DDD). Só celular ganha botão de WhatsApp. */
export function ehCelular(digitos: string | null | undefined): boolean {
  return !!digitos && /^\d{11}$/.test(digitos) && digitos[2] === "9";
}

/** Link para ligar: "tel:+5594991234567". */
export function linkLigar(digitos: string): string {
  return `tel:+55${digitos.replace(/\D/g, "")}`;
}

/** Link que abre a conversa no WhatsApp com o número. */
export function linkConversaWhatsApp(digitos: string): string {
  return `https://wa.me/55${digitos.replace(/\D/g, "")}`;
}

// ---------- Formulário ----------

export const LIMITE_AVISO = 200;
export const LIMITE_HORARIO = 80;

/** Campo de telefone opcional: vazio vira null; preenchido precisa ser válido. */
const telefone = (nome: string) =>
  z
    .string()
    .trim()
    .max(30, `O ${nome} está grande demais.`)
    .optional()
    .default("")
    .transform((v, ctx) => {
      if (!v) return null;
      const d = normalizarTelefone(v);
      if (!d) {
        ctx.addIssue({ code: "custom", message: `Confira o ${nome}: use o DDD e o número, ex.: (94) 9 9123-4567.` });
        return z.NEVER;
      }
      return d;
    });

/** Texto curto de uma linha: junta espaços e quebras de linha; vazio vira null. */
const textoCurto = (max: number, mensagem: string) =>
  z
    .string()
    .optional()
    .default("")
    .transform((v) => v.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim())
    .refine((v) => v.length <= max, { message: mensagem })
    .transform((v) => (v ? v : null));

export const esquemaInformacoes = z.object({
  telefonePortaria: telefone("telefone da portaria"),
  telefoneAdministracao: telefone("telefone da administração"),
  whatsappAdministracao: telefone("WhatsApp da administração"),
  horarioAdministracao: textoCurto(LIMITE_HORARIO, `Use no máximo ${LIMITE_HORARIO} caracteres no horário.`),
  aviso: textoCurto(LIMITE_AVISO, `Use no máximo ${LIMITE_AVISO} caracteres no aviso.`),
});
export type DadosInformacoes = z.infer<typeof esquemaInformacoes>;

// ---------- CNPJ e CPF ----------

/** Dígito verificador (CNPJ e CPF usam a mesma conta "módulo 11"). */
function digitoVerificador(base: string, pesos: number[]): number {
  const soma = pesos.reduce((total, peso, i) => total + Number(base[i]) * peso, 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

/** CNPJ com 14 números e os 2 dígitos verificadores corretos. */
export function cnpjValido(texto: string): boolean {
  const d = soDigitos(texto);
  if (!/^\d{14}$/.test(d) || /^(\d)\1{13}$/.test(d)) return false;
  const d1 = digitoVerificador(d, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = digitoVerificador(d, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return Number(d[12]) === d1 && Number(d[13]) === d2;
}

/** CPF com 11 números e os 2 dígitos verificadores corretos. */
export function cpfValido(texto: string): boolean {
  const d = soDigitos(texto);
  if (!/^\d{11}$/.test(d) || /^(\d)\1{10}$/.test(d)) return false;
  const d1 = digitoVerificador(d, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = digitoVerificador(d, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return Number(d[9]) === d1 && Number(d[10]) === d2;
}

/** "29711278000159" → "29.711.278/0001-59". */
export function formatarCnpj(texto: string): string {
  const d = soDigitos(texto);
  if (d.length !== 14) return texto;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

/** "12345678909" → "123.456.789-09". */
export function formatarCpf(texto: string): string {
  const d = soDigitos(texto);
  if (d.length !== 11) return texto;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

// ---------- PIX da taxa condominial ----------

export const TIPOS_CHAVE_PIX = {
  cnpj: "CNPJ",
  cpf: "CPF",
  email: "E-mail",
  telefone: "Celular",
  aleatoria: "Chave aleatória",
} as const;
export type TipoChavePix = keyof typeof TIPOS_CHAVE_PIX;
export const CHAVES_TIPO_PIX = Object.keys(TIPOS_CHAVE_PIX) as [TipoChavePix, ...TipoChavePix[]];

export function ehTipoChavePix(v: unknown): v is TipoChavePix {
  return typeof v === "string" && (CHAVES_TIPO_PIX as string[]).includes(v);
}

/** Como fica gravado: chave já normalizada (CNPJ/CPF/celular só com números). */
export type ChavePix = { chave: string; tipo: TipoChavePix; favorecido: string };

export const LIMITE_FAVORECIDO = 80;
const LIMITE_EMAIL_PIX = 77; // limite do próprio PIX para e-mail

/**
 * Confere e normaliza a chave conforme o tipo. Devolve null se não for válida.
 * - cnpj/cpf: só os números, com dígitos verificadores certos;
 * - telefone: celular com DDD (11 números, sem o +55);
 * - email: minúsculo; aleatoria: o código de 36 caracteres que o banco gera.
 */
export function normalizarChavePix(tipo: TipoChavePix, texto: string): string | null {
  const t = texto.trim();
  switch (tipo) {
    case "cnpj":
      return cnpjValido(t) ? soDigitos(t) : null;
    case "cpf":
      return cpfValido(t) ? soDigitos(t) : null;
    case "telefone": {
      const d = normalizarTelefone(t);
      return ehCelular(d) ? d : null;
    }
    case "email": {
      const e = t.toLowerCase();
      return e.length <= LIMITE_EMAIL_PIX && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
    }
    case "aleatoria": {
      const a = t.toLowerCase();
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(a) ? a : null;
    }
  }
}

/** Chave para MOSTRAR na tela (ex.: CNPJ com pontos, barra e traço). */
export function formatarChavePix(pix: Pick<ChavePix, "tipo" | "chave">): string {
  switch (pix.tipo) {
    case "cnpj":
      return formatarCnpj(pix.chave);
    case "cpf":
      return formatarCpf(pix.chave);
    case "telefone":
      return formatarTelefone(pix.chave);
    default:
      return pix.chave;
  }
}

/**
 * Chave para COPIAR e colar no banco.
 * CNPJ e CPF vão só com números (é o que os bancos aceitam); celular vai com +55.
 */
export function chavePixParaCopiar(pix: Pick<ChavePix, "tipo" | "chave">): string {
  switch (pix.tipo) {
    case "cnpj":
    case "cpf":
      return soDigitos(pix.chave);
    case "telefone":
      return `+55${soDigitos(pix.chave)}`;
    default:
      return pix.chave;
  }
}

const ERRO_CHAVE_PIX: Record<TipoChavePix, string> = {
  cnpj: "Confira o CNPJ: são 14 números e os 2 últimos (dígitos verificadores) precisam bater. Ex.: 29.711.278/0001-59.",
  cpf: "Confira o CPF: são 11 números e os 2 últimos (dígitos verificadores) precisam bater.",
  telefone: "Confira o celular da chave PIX: use o DDD e o número, ex.: (94) 9 9123-4567.",
  email: "Confira o e-mail da chave PIX.",
  aleatoria: "Confira a chave aleatória: são 36 caracteres, ex.: 123e4567-e89b-12d3-a456-426614174000.",
};

/** Formulário do PIX. Tudo em branco = não mostrar PIX (vira null). */
export const esquemaPix = z
  .object({
    pixTipo: z.string().trim().max(20).optional().default(""),
    pixChave: z.string().trim().max(120, "A chave PIX está grande demais.").optional().default(""),
    pixFavorecido: textoCurto(LIMITE_FAVORECIDO, `Use no máximo ${LIMITE_FAVORECIDO} caracteres no favorecido.`),
  })
  .transform((v, ctx): { pix: ChavePix | null } => {
    if (!v.pixChave && !v.pixFavorecido) return { pix: null };
    if (!ehTipoChavePix(v.pixTipo)) {
      ctx.addIssue({ code: "custom", message: "Escolha o tipo da chave PIX." });
      return z.NEVER;
    }
    if (!v.pixChave) {
      ctx.addIssue({ code: "custom", message: "Digite a chave PIX." });
      return z.NEVER;
    }
    const chave = normalizarChavePix(v.pixTipo, v.pixChave);
    if (!chave) {
      ctx.addIssue({ code: "custom", message: ERRO_CHAVE_PIX[v.pixTipo] });
      return z.NEVER;
    }
    if (!v.pixFavorecido) {
      ctx.addIssue({ code: "custom", message: "Digite o favorecido (o nome que aparece no banco na hora de pagar)." });
      return z.NEVER;
    }
    return { pix: { chave, tipo: v.pixTipo, favorecido: v.pixFavorecido } };
  });

// ---------- Ronda noturna e responsável pelas reservas ----------

export const LIMITE_NOME_RESPONSAVEL = 60;

export type ResponsavelReservas = { nome: string; telefone: string; horario: string | null };

/** Formulário da ronda e do responsável pelas reservas. Em branco = não mostrar. */
export const esquemaPlantao = z
  .object({
    telefoneRonda: telefone("telefone da ronda"),
    responsavelNome: textoCurto(LIMITE_NOME_RESPONSAVEL, `Use no máximo ${LIMITE_NOME_RESPONSAVEL} caracteres no nome.`),
    responsavelTelefone: telefone("telefone do responsável pelas reservas"),
    responsavelHorario: textoCurto(LIMITE_HORARIO, `Use no máximo ${LIMITE_HORARIO} caracteres no horário.`),
  })
  .transform((v, ctx): { telefoneRonda: string | null; responsavelReservas: ResponsavelReservas | null } => {
    const algum = v.responsavelNome || v.responsavelTelefone || v.responsavelHorario;
    if (!algum) return { telefoneRonda: v.telefoneRonda, responsavelReservas: null };
    if (!v.responsavelNome) {
      ctx.addIssue({ code: "custom", message: "Digite o nome do responsável pelas reservas." });
      return z.NEVER;
    }
    if (!v.responsavelTelefone) {
      ctx.addIssue({ code: "custom", message: "Digite o telefone do responsável pelas reservas." });
      return z.NEVER;
    }
    return {
      telefoneRonda: v.telefoneRonda,
      responsavelReservas: { nome: v.responsavelNome, telefone: v.responsavelTelefone, horario: v.responsavelHorario },
    };
  });

// ---------- Link da votação oficial ----------

export const LIMITE_LINK = 500;

/** Só aceita link https completo (ex.: https://votacao.exemplo.com/...). Devolve null se não servir. */
export function normalizarLinkHttps(texto: string): string | null {
  const t = texto.trim();
  if (!t || t.length > LIMITE_LINK || /\s/.test(t)) return null;
  let url: URL;
  try {
    url = new URL(t);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  // Nada de usuário/senha dentro do link, e o endereço precisa ter um domínio de verdade.
  if (url.username || url.password) return null;
  if (!url.hostname.includes(".") || url.hostname.endsWith(".")) return null;
  const final = url.toString();
  return final.length <= LIMITE_LINK ? final : null;
}

export const esquemaLinkVotacao = z
  .object({
    linkVotacao: z.string().trim().max(LIMITE_LINK, "O link está grande demais.").optional().default(""),
  })
  .transform((v, ctx): { linkVotacao: string | null } => {
    if (!v.linkVotacao) return { linkVotacao: null };
    const link = normalizarLinkHttps(v.linkVotacao);
    if (!link) {
      ctx.addIssue({ code: "custom", message: "Use o link completo e seguro, começando com https://" });
      return z.NEVER;
    }
    return { linkVotacao: link };
  });

// ---------- Convite dos moradores ----------
// O link de acesso (".../entrar") é montado por linkAcessoMoradores, em src/lib/condominio-id.ts.

/** Mensagem pronta para o síndico convidar os moradores pelo WhatsApp. */
export function mensagemConviteMoradores(nomeCondominio: string, link: string): string {
  return [
    `Olá, moradores do ${nomeCondominio}!`,
    "O portal do condomínio já está no ar. Entre pelo link abaixo com o USUÁRIO e a SENHA que a administração enviou para a sua casa:",
    link,
    "Lá você vê a prestação de contas, os contatos, o mapa e a agenda das áreas de lazer, pede reservas, autoriza visitas e acompanha as encomendas. Não passe o seu usuário e a sua senha para ninguém. Se ainda não recebeu, fale com a administração.",
  ].join("\n\n");
}
