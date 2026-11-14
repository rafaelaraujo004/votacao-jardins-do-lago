/**
 * Proxy (antigo "middleware"): roda antes de cada página listada no `matcher`.
 *
 * Faz só uma triagem rápida: TODAS as áreas do portal exigem login. Sem o
 * cookie de sessão, a pessoa vai para /entrar?volta=<onde estava>.
 * Não existe área aberta ao público: os dados do condomínio são sensíveis
 * e quem cria usuários e senhas é o síndico.
 *
 * A conferência DE VERDADE (assinatura do cookie, vínculo, papel, permissões)
 * acontece no servidor, em cada página, via src/server/contexto.ts.
 * Testado em tests/unit/proxy.test.ts.
 */
import { NextResponse, type NextRequest } from "next/server";
import { linkEntrar } from "@/lib/destino-seguro";

const NOME_COOKIE_SESSAO = "__session";

/** Áreas que exigem login (todas as do portal, menos /entrar). */
export const AREAS_PROTEGIDAS = [
  // Morador
  "/inicio",
  "/financeiro",
  "/mapa",
  "/contatos",
  "/mais",
  "/reservas",
  "/visitas",
  "/encomendas",
  "/relatorio",
  // Equipe e conta
  "/admin",
  "/portaria",
  "/conta",
] as const;

/** true se o caminho é de uma área protegida (ex.: "/financeiro" ou "/admin/pessoas"). */
export function areaProtegida(caminho: string): boolean {
  return AREAS_PROTEGIDAS.some((p) => caminho === p || caminho.startsWith(`${p}/`));
}

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  if (areaProtegida(pathname) && !req.cookies.has(NOME_COOKIE_SESSAO)) {
    // Volta só para o caminho interno de onde a pessoa veio (linkEntrar confere).
    return NextResponse.redirect(new URL(linkEntrar(`${pathname}${search}`.slice(0, 512)), req.url));
  }
  return NextResponse.next();
}

export const config = {
  // O Next exige uma lista fixa aqui (não dá para montar a partir de AREAS_PROTEGIDAS).
  // O teste tests/unit/proxy.test.ts confere que as duas listas batem.
  matcher: [
    "/inicio/:path*",
    "/financeiro/:path*",
    "/mapa/:path*",
    "/contatos/:path*",
    "/mais/:path*",
    "/reservas/:path*",
    "/visitas/:path*",
    "/encomendas/:path*",
    "/relatorio/:path*",
    "/admin/:path*",
    "/portaria/:path*",
    "/conta/:path*",
  ],
};
