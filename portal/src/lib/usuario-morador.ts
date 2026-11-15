/**
 * USUÁRIO DO MORADOR — ferramentas puras (servem no navegador, no servidor e nos testes).
 *
 * Cada morador entra com:
 * - USUÁRIO: código de 6 caracteres gerado pelo portal (ex.: "K7M4PX"),
 *   só letras maiúsculas e números, sem os que se confundem (0/O, 1/I);
 * - SENHA: provisória (gerada pelo portal) e depois escolhida pelo morador.
 *
 * Por baixo, o Firebase Authentication só entende e-mail + senha. Por isso o
 * usuário vira um e-mail "de mentira" (sintético), sempre do mesmo jeito:
 *   "K7M4PX" no condomínio "jardins-do-lago" → "k7m4px@morador.jardins-do-lago.portal.invalid"
 * O final ".invalid" é reservado na internet (RFC 2606): NUNCA existe de verdade,
 * então nenhum e-mail é enviado para lá e ninguém de fora pode registrar esse domínio.
 * Testado no simulador do Firebase (criar, entrar, maiúsculas/minúsculas).
 * Se um dia o Firebase real recusar, troque só SUFIXO_EMAIL_MORADOR (ex.: "portal.local").
 */

/** Tamanho do código do usuário. */
export const TAMANHO_USUARIO = 6;

/** Letras maiúsculas e números, sem 0, O, 1 e I (32 símbolos: sorteio sem "vício"). */
export const ALFABETO_USUARIO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Final do e-mail sintético. ".invalid" nunca é um domínio real. */
export const SUFIXO_EMAIL_MORADOR = "portal.invalid";

const REGEX_USUARIO = new RegExp(`^[${ALFABETO_USUARIO}]{${TAMANHO_USUARIO}}$`);

/** Sorteia um código como "K7M4PX" com sorteio seguro (crypto). */
export function gerarCodigoUsuario(): string {
  const bytes = new Uint8Array(TAMANHO_USUARIO);
  globalThis.crypto.getRandomValues(bytes);
  // 256 é múltiplo de 32: todos os símbolos têm a mesma chance.
  let codigo = "";
  for (const b of bytes) codigo += ALFABETO_USUARIO[b % ALFABETO_USUARIO.length];
  return codigo;
}

/**
 * Arruma o que a pessoa digitou: tira espaços, hífens e pontos e passa para maiúsculas.
 * " k7m 4px " → "K7M4PX". Devolve null se não for um usuário válido.
 */
export function normalizarUsuario(texto: unknown): string | null {
  if (typeof texto !== "string") return null;
  const limpo = texto.replace(/[\s.\-_]/g, "").toUpperCase();
  return REGEX_USUARIO.test(limpo) ? limpo : null;
}

/** true se já estiver no formato certo (6 caracteres do alfabeto, maiúsculas). */
export function ehUsuarioValido(texto: unknown): texto is string {
  return typeof texto === "string" && REGEX_USUARIO.test(texto);
}

/** Parte do condomínio no e-mail: minúsculas, letras, números e hífen. */
function parteDoCondominio(condominioId: string): string {
  const p = condominioId
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!p) throw new Error("Condomínio inválido.");
  return p;
}

/**
 * E-mail sintético do morador (o mesmo usuário sempre dá o mesmo e-mail).
 * Aceita o usuário digitado de qualquer jeito; erro se não for válido.
 */
export function emailDoMorador(usuario: string, condominioId: string): string {
  const codigo = normalizarUsuario(usuario);
  if (!codigo) throw new Error("Usuário inválido.");
  return `${codigo.toLowerCase()}@morador.${parteDoCondominio(condominioId)}.${SUFIXO_EMAIL_MORADOR}`;
}

/** true se o e-mail for um e-mail sintético de morador (não deve aparecer como "e-mail" na tela). */
export function ehEmailDeMorador(email: string | null | undefined): boolean {
  return typeof email === "string" && /@morador\.[a-z0-9-]+\./.test(email) && email.endsWith(`.${SUFIXO_EMAIL_MORADOR}`);
}

/** "K7M4PX" → "K7M 4PX" (só para leitura; o login aceita com ou sem espaço). */
export function usuarioParaLeitura(usuario: string): string {
  return usuario.length === 6 ? `${usuario.slice(0, 3)} ${usuario.slice(3)}` : usuario;
}

// ---------- Situação do acesso (para etiquetas) ----------

export type SituacaoLoginMorador = "sem-acesso" | "provisoria" | "ativo";

/** Sem usuário → "sem-acesso"; com senha provisória → "provisoria"; senão "ativo". */
export function situacaoLoginMorador(d: { usuario?: unknown; precisaTrocarSenha?: unknown }): SituacaoLoginMorador {
  if (!ehUsuarioValido(d.usuario)) return "sem-acesso";
  return d.precisaTrocarSenha === true ? "provisoria" : "ativo";
}

// ---------- Mensagem para o WhatsApp ----------

/** Primeiro nome, para a saudação ("Maria da Silva" → "Maria"). */
function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? "";
}

/** Mensagem pronta com o acesso do morador. */
export function mensagemAcessoMorador(d: {
  nome: string;
  condominioNome: string;
  linkEntrar: string;
  usuario: string;
  senha: string;
}): string {
  const nome = primeiroNome(d.nome);
  return [
    `Olá${nome ? `, ${nome}` : ""}! Aqui está o seu acesso ao portal do ${d.condominioNome}.`,
    `Entre por este link: ${d.linkEntrar}`,
    `Usuário: ${d.usuario}\nSenha provisória: ${d.senha}`,
    "No primeiro acesso, o portal vai pedir para você escolher a sua própria senha. Não repasse estes dados a ninguém.",
  ].join("\n\n");
}

/**
 * Número no formato do WhatsApp (com 55 do Brasil), ou null se não der.
 * "91999998888" → "5591999998888"; "5591999998888" → igual.
 */
export function numeroParaWhatsApp(telefone: string | null | undefined): string | null {
  const d = (telefone ?? "").replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) return `55${d}`;
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) return d;
  return null;
}

/** Link que abre o WhatsApp com a mensagem pronta (direto na conversa, se houver telefone). */
export function linkWhatsAppAcesso(mensagem: string, telefone?: string | null): string {
  const numero = numeroParaWhatsApp(telefone);
  return `https://wa.me/${numero ?? ""}?text=${encodeURIComponent(mensagem)}`;
}
