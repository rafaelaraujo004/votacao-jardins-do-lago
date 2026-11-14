/**
 * Informações do condomínio (telefones, horário e aviso) e o convite dos moradores.
 * Lógica pura: valida, normaliza e formata. Usada no servidor e nos testes.
 */
import { z } from "zod";

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
