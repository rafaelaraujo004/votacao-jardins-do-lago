/**
 * Proxy (antigo "middleware"): roda antes de cada página.
 *
 * Faz só uma triagem rápida: quem não tem o cookie de sessão e tenta abrir
 * uma área interna vai para a tela de entrada. A conferência DE VERDADE
 * (assinatura do cookie, vínculo, papel, permissões) acontece no servidor,
 * em cada página, via src/server/contexto.ts.
 */
import { NextResponse, type NextRequest } from "next/server";

const NOME_COOKIE_SESSAO = "__session";

export function proxy(req: NextRequest) {
  if (!req.cookies.has(NOME_COOKIE_SESSAO)) {
    return NextResponse.redirect(new URL("/entrar", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/inicio/:path*",
    "/financeiro/:path*",
    "/contatos/:path*",
    "/portaria/:path*",
    "/admin/:path*",
    "/relatorio/:path*",
    "/conta/:path*",
    "/visitas/:path*",
    "/encomendas/:path*",
    "/reservas/:path*",
  ],
};
