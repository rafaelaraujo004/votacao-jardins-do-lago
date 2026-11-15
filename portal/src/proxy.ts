/**
 * Proxy (antigo "middleware"): roda antes de cada página listada no `matcher`.
 *
 * Faz só uma triagem rápida: TODAS as áreas do portal exigem login. Sem o
 * cookie de sessão, a pessoa vai para /entrar?volta=<onde estava>.
 * Não existe área aberta ao público: os dados do condomínio são sensíveis
 * e quem cria usuários e senhas é o síndico.
 *
 * Com o cookie, anota o caminho pedido no cabeçalho "x-portal-caminho": o servidor usa
 * para levar cada pessoa à versão do módulo do seu perfil (src/lib/modulos.ts).
 * O ?c= do link (outro condomínio, ex.: a demonstração) segue para a tela de entrada,
 * só para montar o login do morador.
 *
 * A conferência DE VERDADE (assinatura do cookie, vínculo, papel, permissões)
 * acontece no servidor, em cada página, via src/server/contexto.ts.
 * Testado em tests/unit/proxy.test.ts.
 */
import { NextResponse, type NextRequest } from "next/server";
import { linkEntrar } from "@/lib/destino-seguro";
import { idValido } from "@/lib/condominio-id";
import { CABECALHO_CAMINHO } from "@/lib/modulos";

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
  "/comunicados",
  "/solicitacoes",
  "/documentos",
  "/enquetes",
  "/classificados",
  "/relatorio",
  // Equipe e conta
  "/admin",
  "/portaria",
  "/conta",
  // Links curtos dos módulos que só encaminham (src/lib/modulos.ts)
  "/sindico",
  "/conselho",
  "/morador",
] as const;

/** true se o caminho é de uma área protegida (ex.: "/financeiro" ou "/admin/pessoas"). */
export function areaProtegida(caminho: string): boolean {
  return AREAS_PROTEGIDAS.some((p) => caminho === p || caminho.startsWith(`${p}/`));
}

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  if (areaProtegida(pathname) && !req.cookies.has(NOME_COOKIE_SESSAO)) {
    // Volta só para o caminho interno de onde a pessoa veio (linkEntrar confere).
    const c = req.nextUrl.searchParams.get("c");
    const volta = `${pathname}${search}`.slice(0, 512);
    return NextResponse.redirect(new URL(linkEntrar(volta, idValido(c) ? c : null), req.url));
  }
  // Sempre sobrescreve (ninguém de fora escolhe este valor).
  const cabecalhos = new Headers(req.headers);
  cabecalhos.set(CABECALHO_CAMINHO, pathname);
  return NextResponse.next({ request: { headers: cabecalhos } });
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
    "/comunicados/:path*",
    "/solicitacoes/:path*",
    "/documentos/:path*",
    "/enquetes/:path*",
    "/classificados/:path*",
    "/relatorio/:path*",
    "/admin/:path*",
    "/portaria/:path*",
    "/conta/:path*",
    "/sindico/:path*",
    "/conselho/:path*",
    "/morador/:path*",
  ],
};
