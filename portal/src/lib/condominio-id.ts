/**
 * ID DO CONDOMÍNIO NA TELA DE ENTRADA (lógica pura, testada em tests/unit/condominio-id.test.ts).
 *
 * Para que serve: o login do MORADOR usa um e-mail sintético que depende do
 * condomínio (ex.: "k7m4px@<condomínio>..."). O condomínio padrão é o da
 * variável CONDOMINIO_PADRAO (ou "jardins-do-lago"). Outro condomínio (ex.: a
 * demonstração) usa "/entrar?c=<id>".
 *
 * IMPORTANTE: o ?c= serve SÓ para montar esse e-mail na tela /entrar. Ele
 * nunca escolhe quais dados aparecem: depois de entrar, o condomínio vem
 * sempre da sessão (src/server/contexto.ts).
 */

/** Condomínio usado quando a variável CONDOMINIO_PADRAO não está definida. */
export const ID_CONDOMINIO_PADRAO = "jardins-do-lago";

/** Formato aceito para o id (letras minúsculas, números e hífen). Evita caminhos estranhos. */
const REGEX_ID = /^[a-z0-9][a-z0-9-]{0,62}$/;

export function idValido(id: unknown): id is string {
  return typeof id === "string" && REGEX_ID.test(id);
}

/**
 * Id do condomínio padrão (variável de ambiente, se for válida).
 * CONDOMINIO_PUBLICO é o nome antigo da mesma variável (ainda aceito).
 */
export function idCondominioPadrao(
  valorDaVariavel: string | undefined = process.env.CONDOMINIO_PADRAO ?? process.env.CONDOMINIO_PUBLICO,
): string {
  const v = valorDaVariavel?.trim();
  return idValido(v) ? v : ID_CONDOMINIO_PADRAO;
}

/**
 * Escolhe o condomínio do login a partir do ?c= da tela /entrar.
 * Sem ?c=, vazio ou inválido → o padrão (nunca tentamos adivinhar).
 */
export function idDoLogin(c: string | string[] | undefined | null, padrao: string): string {
  const bruto = Array.isArray(c) ? c[0] : c;
  const id = bruto?.trim();
  return idValido(id) ? id : padrao;
}

/** "" quando o id é o padrão; "?c=<id>" quando é outro (para montar o link de /entrar). */
export function sufixoDoId(id: string, padrao: string): string {
  return id === padrao ? "" : `?c=${encodeURIComponent(id)}`;
}

/**
 * Link de acesso que o síndico manda aos moradores: "<base>/entrar"
 * (+ "?c=<id>" quando não é o condomínio padrão). Cada morador entra com
 * o usuário e a senha criados pelo síndico.
 */
export function linkAcessoMoradores(base: string, condominioId: string, padrao: string): string {
  return `${base.replace(/\/+$/, "")}/entrar${sufixoDoId(condominioId, padrao)}`;
}
