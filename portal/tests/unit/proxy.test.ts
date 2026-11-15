/**
 * Proxy: TODAS as rotas do portal (morador, equipe e conta) exigem login.
 * Sem o cookie de sessão, a pessoa vai para /entrar?volta=<onde estava>.
 */
import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { AREAS_PROTEGIDAS, areaProtegida, config, proxy } from "@/proxy";
import { CABECALHO_CAMINHO, MODULOS } from "@/lib/modulos";

const ROTAS_DO_MORADOR = [
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
];

function pedido(caminho: string, comCookie = false): NextRequest {
  const cabecalhos = comCookie ? { cookie: "__session=abc" } : undefined;
  return new NextRequest(new URL(caminho, "https://portal.exemplo.com"), { headers: cabecalhos });
}

describe("proxy", () => {
  it("o matcher cobre exatamente as áreas protegidas", () => {
    expect(config.matcher).toEqual(AREAS_PROTEGIDAS.map((a) => `${a}/:path*`));
    for (const rota of [...ROTAS_DO_MORADOR, "/relatorio", "/admin", "/portaria", "/conta"]) {
      expect(AREAS_PROTEGIDAS).toContain(rota);
    }
  });

  it("manda para /entrar todas as rotas do morador sem cookie", () => {
    for (const rota of ROTAS_DO_MORADOR) {
      const r = proxy(pedido(rota));
      expect(r.status, rota).toBe(307);
      const destino = new URL(r.headers.get("location") ?? "");
      expect(destino.pathname).toBe("/entrar");
      expect(destino.searchParams.get("volta")).toBe(rota);
    }
  });

  it("guarda a página com a busca no ?volta= e leva o ?c= para a tela de entrada", () => {
    const r = proxy(pedido("/financeiro?mes=2026-10&c=outro-condominio"));
    const destino = new URL(r.headers.get("location") ?? "");
    expect(destino.pathname).toBe("/entrar");
    expect(destino.searchParams.get("volta")).toBe("/financeiro?mes=2026-10&c=outro-condominio");
    // ?c= só monta o login do morador de outro condomínio (ex.: a demonstração).
    expect(destino.searchParams.get("c")).toBe("outro-condominio");
  });

  it("?c= inválido não segue para a tela de entrada", () => {
    for (const c of ["../x", "MAIUSCULO", "a b", "https://site.com"]) {
      const r = proxy(pedido(`/reservas?c=${encodeURIComponent(c)}`));
      expect(new URL(r.headers.get("location") ?? "").searchParams.get("c"), c).toBeNull();
    }
  });

  it("protege os links curtos dos módulos", () => {
    for (const rota of ["/sindico", "/conselho", "/morador"]) {
      const r = proxy(pedido(rota));
      const destino = new URL(r.headers.get("location") ?? "");
      expect(destino.pathname, rota).toBe("/entrar");
      expect(destino.searchParams.get("volta")).toBe(rota);
    }
  });

  it("com o cookie anota o caminho pedido no cabeçalho (e ninguém de fora escolhe o valor)", () => {
    const req = new NextRequest(new URL("/reservas", "https://portal.exemplo.com"), {
      headers: { cookie: "__session=abc", [CABECALHO_CAMINHO]: "/admin/financeiro" },
    });
    const r = proxy(req);
    expect(r.headers.get("x-middleware-request-x-portal-caminho")).toBe("/reservas");
  });

  it("também protege subpáginas, relatório, equipe e conta", () => {
    for (const rota of [
      "/reservas/x",
      "/comunicados/abc",
      "/solicitacoes/abc",
      "/enquetes/abc",
      "/classificados/moderar",
      "/relatorio/financeiro?mes=2026-10",
      "/admin/pessoas",
      "/admin/relatorios/csv?assunto=reservas&ano=2026",
      "/portaria",
      "/conta/senha",
    ]) {
      const r = proxy(pedido(rota));
      expect(new URL(r.headers.get("location") ?? "").pathname, rota).toBe("/entrar");
    }
  });

  it("com o cookie deixa passar (a conferência de verdade é no servidor)", () => {
    const r = proxy(pedido("/inicio", true));
    expect(r.headers.get("location")).toBeNull();
    expect(r.headers.get("x-middleware-next")).toBe("1");
  });

  it("todo link de módulo exige login", () => {
    for (const m of MODULOS) expect(areaProtegida(m.link), m.link).toBe(true);
  });

  it("não confunde caminhos parecidos", () => {
    expect(areaProtegida("/inicio")).toBe(true);
    expect(areaProtegida("/inicio/qualquer")).toBe(true);
    expect(areaProtegida("/entrar")).toBe(false);
    expect(areaProtegida("/inicioX")).toBe(false);
  });
});
