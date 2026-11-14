import "server-only";

/**
 * Cookie de sessão.
 * - httpOnly: o JavaScript da página não consegue lê-lo (protege contra roubo por script).
 * - secure: só trafega por HTTPS (em produção).
 * - sameSite "lax": outros sites não conseguem enviar pedidos de alteração com ele.
 *   Usamos "lax" e não "strict" porque quem abre um link do portal pelo WhatsApp
 *   precisa chegar já logado. A proteção extra contra pedidos forjados é a
 *   conferência de origem (seguranca.ts) e a das Server Actions do Next.js.
 */
export const NOME_COOKIE_SESSAO = "__session";
export const DURACAO_SESSAO_MS = 5 * 24 * 60 * 60 * 1000; // 5 dias
/** O login precisa ter acontecido há pouco para virar sessão (recomendação do Firebase). */
export const IDADE_MAXIMA_LOGIN_S = 5 * 60;

export function opcoesDoCookie(maxAgeSegundos: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSegundos,
  };
}
