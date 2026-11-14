/**
 * SENHAS DA EQUIPE — regras e ferramentas puras (servem no navegador, no
 * servidor e nos scripts).
 *
 * - Senha provisória: gerada com sorteio seguro (crypto), fácil de ler e de
 *   digitar (sem 0/O, 1/l/I, i/o).
 * - Regras da senha nova: mínimo 10 caracteres e diferente da atual.
 * - Mensagens de erro do login em português, SEM revelar se o e-mail existe.
 */
import { z } from "zod";

/** Tamanho mínimo da senha escolhida pela pessoa. */
export const SENHA_MINIMA = 10;
export const SENHA_MAXIMA = 128;

/** Letras e números sem os que se confundem (0 O o, 1 l I i). */
export const ALFABETO_SENHA = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

const MAIUSCULAS = /[A-Z]/;
const MINUSCULAS = /[a-z]/;
const NUMEROS = /[0-9]/;

/** Sorteia um índice de 0 a (limite - 1) sem "viciar" o resultado. */
function sortearIndice(limite: number): number {
  // Descartamos os bytes do fim da faixa para todos os caracteres terem a mesma chance.
  const teto = 256 - (256 % limite);
  const byte = new Uint8Array(1);
  for (;;) {
    globalThis.crypto.getRandomValues(byte);
    if (byte[0] < teto) return byte[0] % limite;
  }
}

/**
 * Gera uma senha provisória como "Kp7m-Xq3t-Hw9z":
 * `grupos` blocos de 4 caracteres separados por hífen (padrão: 12 caracteres sorteados,
 * cerca de 69 bits de segurança). Sempre tem maiúscula, minúscula e número.
 */
export function gerarSenhaProvisoria(grupos = 3): string {
  if (!Number.isInteger(grupos) || grupos < 3 || grupos > 8) {
    throw new Error("Use de 3 a 8 grupos.");
  }
  for (;;) {
    const blocos: string[] = [];
    for (let g = 0; g < grupos; g++) {
      let bloco = "";
      for (let i = 0; i < 4; i++) bloco += ALFABETO_SENHA[sortearIndice(ALFABETO_SENHA.length)];
      blocos.push(bloco);
    }
    const senha = blocos.join("-");
    if (MAIUSCULAS.test(senha) && MINUSCULAS.test(senha) && NUMEROS.test(senha)) return senha;
  }
}

// ---------- Validações (zod) ----------

/** E-mail da equipe: sem espaços e em minúsculas. */
export const esquemaEmail = z
  .string({ error: "Informe o e-mail." })
  .trim()
  .toLowerCase()
  .min(1, "Informe o e-mail.")
  .max(254, "E-mail muito longo.")
  .pipe(z.email("Confira o e-mail: ele parece incompleto."));

/** Formulário de entrada da equipe. */
export const esquemaLoginEquipe = z.object({
  email: esquemaEmail,
  senha: z.string({ error: "Digite a sua senha." }).min(1, "Digite a sua senha.").max(SENHA_MAXIMA, "Senha muito longa."),
});

/** Senha nova escolhida pela pessoa. */
export const esquemaSenhaNova = z
  .string({ error: "Digite a nova senha." })
  .min(SENHA_MINIMA, `A nova senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`)
  .max(SENHA_MAXIMA, "A nova senha está longa demais.")
  .refine((s) => s.trim().length >= SENHA_MINIMA, "A nova senha não pode ser feita só de espaços.")
  .refine((s) => new Set(s).size > 2, "Escolha uma senha menos repetitiva (não use o mesmo caractere várias vezes).");

/** Formulário "Trocar senha": atual + nova + confirmação. */
export const esquemaTrocaSenha = z
  .object({
    atual: z.string({ error: "Digite a sua senha atual." }).min(1, "Digite a sua senha atual.").max(SENHA_MAXIMA),
    nova: esquemaSenhaNova,
    confirmar: z.string({ error: "Repita a nova senha." }),
  })
  .refine((v) => v.nova !== v.atual, { path: ["nova"], message: "A nova senha precisa ser diferente da atual." })
  .refine((v) => v.confirmar === v.nova, { path: ["confirmar"], message: "A confirmação não é igual à nova senha." });

export type TrocaSenha = z.infer<typeof esquemaTrocaSenha>;

// ---------- Mensagens de erro do Firebase ----------

/** Código de erro do Firebase (ex.: "auth/invalid-credential"), se houver. */
export function codigoDoErro(e: unknown): string {
  if (e && typeof e === "object" && "code" in e && typeof (e as { code: unknown }).code === "string") {
    return (e as { code: string }).code;
  }
  return "";
}

/**
 * Mensagem para a tela de entrada.
 * E-mail inexistente e senha errada dão A MESMA mensagem (não revela quem tem conta).
 */
export function mensagemErroLogin(codigo: string): string {
  switch (codigo) {
    case "auth/invalid-credential":
    case "auth/invalid-login-credentials":
    case "auth/wrong-password":
    case "auth/user-not-found":
    case "auth/invalid-email":
    case "auth/missing-password":
      return "E-mail ou senha incorretos. Confira e tente de novo.";
    case "auth/too-many-requests":
      return "Muitas tentativas seguidas. Por segurança, aguarde alguns minutos e tente de novo.";
    case "auth/user-disabled":
      return "Esta conta está desativada. Fale com a administração do condomínio.";
    case "auth/network-request-failed":
      return "Sem conexão com a internet. Confira o sinal e tente de novo.";
    default:
      return "Não foi possível entrar agora. Tente de novo em instantes.";
  }
}

/** Mensagem para a tela "Trocar senha". */
export function mensagemErroTroca(codigo: string): string {
  switch (codigo) {
    case "auth/invalid-credential":
    case "auth/invalid-login-credentials":
    case "auth/wrong-password":
    case "auth/user-mismatch":
      return "A senha atual não confere. Confira e tente de novo.";
    case "auth/weak-password":
    case "auth/password-does-not-meet-requirements":
      return `A nova senha é fraca. Use pelo menos ${SENHA_MINIMA} caracteres, misturando letras e números.`;
    case "auth/too-many-requests":
      return "Muitas tentativas seguidas. Por segurança, aguarde alguns minutos e tente de novo.";
    case "auth/user-disabled":
      return "Esta conta está desativada. Fale com a administração do condomínio.";
    case "auth/requires-recent-login":
      return "Por segurança, saia e entre de novo antes de trocar a senha.";
    case "auth/network-request-failed":
      return "Sem conexão com a internet. Confira o sinal e tente de novo.";
    default:
      return "Não foi possível trocar a senha agora. Tente de novo em instantes.";
  }
}

/** "joao.silva@gmail.com" → "jo•••@gmail.com" (para auditoria e telas, sem expor o e-mail inteiro). */
export function mascararEmail(email: string): string {
  const [local, dominio] = email.split("@");
  if (!local || !dominio) return "•••";
  return `${local.slice(0, Math.min(2, local.length - 1) || 1)}•••@${dominio}`;
}
