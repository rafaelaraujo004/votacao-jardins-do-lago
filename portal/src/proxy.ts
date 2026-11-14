/**
 * Proxy (antigo "middleware"): roda antes de cada página listada no `matcher`.
 *
 * Faz só uma triagem rápida:
 * 1. Copia o ?c= da URL (condomínio do link público) para o cabeçalho interno
 *    "x-portal-c", que o layout dos moradores lê. Qualquer "x-portal-c" vindo
 *    do navegador é APAGADO antes (ninguém consegue forjar).
 * 2. Áreas PRIVADAS sem o cookie de sessão vão para /entrar?volta=<onde estava>.
 *    As áreas PÚBLICAS (informações gerais) passam sem login.
 *
 * A conferência DE VERDADE (assinatura do cookie, vínculo, papel, permissões)
 * acontece no servidor, em cada página, via src/server/contexto.ts.
 */
import { NextResponse, type NextRequest } from "next/server";

const NOME_COOKIE_SESSAO = "__session";
const CABECALHO_C = "x-portal-c";

/** Precisam de login. Todo o resto do matcher é público (só leitura). */
const PRIVADAS = ["/visitas", "/encomendas", "/admin", "/portaria", "/conta"];

function privada(caminho: string): boolean {
  return PRIVADAS.some((p) => caminho === p || caminho.startsWith(`${p}/`));
}

export function proxy(req: NextRequest) {
  const { pathname, search, searchParams } = req.nextUrl;

  if (privada(pathname) && !req.cookies.has(NOME_COOKIE_SESSAO)) {
    const destino = new URL("/entrar", req.url);
    const c = searchParams.get("c");
    if (c) destino.searchParams.set("c", c.slice(0, 64));
    // Volta só para o caminho interno de onde a pessoa veio (a tela /entrar confere de novo).
    destino.searchParams.set("volta", `${pathname}${search}`.slice(0, 512));
    return NextResponse.redirect(destino);
  }

  const cabecalhos = new Headers(req.headers);
  cabecalhos.delete(CABECALHO_C);
  const c = searchParams.get("c")?.trim();
  if (c) cabecalhos.set(CABECALHO_C, c.slice(0, 64));
  return NextResponse.next({ request: { headers: cabecalhos } });
}

export const config = {
  matcher: [
    // Públicas (informações gerais do condomínio)
    "/inicio/:path*",
    "/financeiro/:path*",
    "/mapa/:path*",
    "/contatos/:path*",
    "/mais/:path*",
    "/reservas/:path*",
    "/relatorio/:path*",
    // Privadas (exigem login)
    "/visitas/:path*",
    "/encomendas/:path*",
    "/admin/:path*",
    "/portaria/:path*",
    "/conta/:path*",
  ],
};
