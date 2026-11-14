/**
 * Para onde ir depois de entrar (o "?volta=" da tela de entrada).
 *
 * Cuidado com "redirecionamento aberto": alguém poderia mandar um link
 * "/entrar?volta=https://site-falso.com" e, depois do login, a pessoa cairia
 * num site falso. Por isso só aceitamos caminhos INTERNOS do portal.
 * Lógica pura, testada em tests/unit/destino-seguro.test.ts.
 */
import { inicioDoPapel, type Papel } from "./permissoes";

/** Áreas do morador (todas exigem login). */
const AREAS_MORADOR = ["/inicio", "/financeiro", "/mapa", "/contatos", "/mais", "/reservas", "/visitas", "/encomendas", "/relatorio"];

/** Lugares para onde nunca voltamos (evita laços e chamadas diretas de API). */
const PROIBIDOS = ["/entrar", "/api", "/_next"];

function dentroDe(caminho: string, base: string): boolean {
  return caminho === base || caminho.startsWith(`${base}/`);
}

/**
 * Devolve o caminho interno (com ?busca e #) se ele for seguro, ou null.
 * Aceita só textos que começam com UMA barra ("/visitas?filtro=usadas").
 */
export function destinoSeguro(volta: unknown): string | null {
  if (typeof volta !== "string") return null;
  const v = volta.trim();
  if (!v || v.length > 512) return null;
  // "//site.com" e "/\site.com" viram outro site no navegador; barras invertidas e
  // caracteres de controle também ficam de fora.
  if (!v.startsWith("/") || v.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(v)) return null;
  let url: URL;
  try {
    url = new URL(v, "https://portal.local");
  } catch {
    return null;
  }
  if (url.origin !== "https://portal.local") return null;
  const caminho = url.pathname;
  // "/.//site.com" ou "/a/..//site.com" viram "//site.com" depois de arrumados: recusa.
  if (caminho.startsWith("//")) return null;
  if (PROIBIDOS.some((p) => dentroDe(caminho, p))) return null;
  return `${caminho}${url.search}${url.hash}`;
}

/**
 * Decide o destino final depois do login.
 * - `destinoServidor`: o que o servidor mandou (/conta/senha, /inicio, /admin ou /portaria).
 * - Senha provisória (/conta/senha) sempre vence.
 * - O ?volta= só vale se combinar com o perfil: morador volta para áreas do morador;
 *   a equipe volta para dentro da própria área (síndico/conselho também ao /relatorio).
 *   Assim ninguém cai em "sem acesso".
 */
export function destinoDepoisDoLogin(destinoServidor: string, volta: unknown): string {
  if (destinoServidor === "/conta/senha") return destinoServidor;
  const seguro = destinoSeguro(volta);
  if (!seguro) return destinoServidor;
  const caminho = seguro.split(/[?#]/)[0];
  if (destinoServidor === "/inicio") {
    return AREAS_MORADOR.some((a) => dentroDe(caminho, a)) ? seguro : destinoServidor;
  }
  // Síndico e conselho também podem voltar ao relatório (PDF) do financeiro.
  if (destinoServidor === "/admin" && dentroDe(caminho, "/relatorio")) return seguro;
  return dentroDe(caminho, destinoServidor) ? seguro : destinoServidor;
}

/**
 * Endereço principal ("/"): sem sessão → /entrar; senha provisória → troca de senha;
 * com sessão → início do papel (morador /inicio, síndico e conselho /admin, portaria /portaria).
 */
export function destinoDaRaiz(sessao: { papel: Papel; precisaTrocarSenha: boolean } | null): string {
  if (!sessao) return "/entrar";
  if (sessao.precisaTrocarSenha) return "/conta/senha";
  return inicioDoPapel(sessao.papel);
}

/**
 * Monta "/entrar?volta=...".
 * `c`: só para o login do morador de OUTRO condomínio (ex.: a demonstração); nunca escolhe dados.
 */
export function linkEntrar(volta?: string | null, c?: string | null): string {
  const busca = new URLSearchParams();
  if (c) busca.set("c", c);
  const seguro = destinoSeguro(volta);
  if (seguro) busca.set("volta", seguro);
  const texto = busca.toString();
  return texto ? `/entrar?${texto}` : "/entrar";
}
