/**
 * "?volta=" da tela de entrada: só caminhos internos (sem redirecionamento aberto).
 */
import { describe, expect, it } from "vitest";
import { destinoDaRaiz, destinoDepoisDoLogin, destinoSeguro, linkEntrar } from "@/lib/destino-seguro";

describe("destinoSeguro", () => {
  it("aceita caminhos internos, com busca", () => {
    expect(destinoSeguro("/visitas")).toBe("/visitas");
    expect(destinoSeguro("/visitas?filtro=usadas")).toBe("/visitas?filtro=usadas");
    expect(destinoSeguro("/reservas?area=salao&mes=2026-11&c=demo")).toBe("/reservas?area=salao&mes=2026-11&c=demo");
  });

  it("recusa outros sites e truques conhecidos", () => {
    for (const ruim of [
      "https://site-falso.com",
      "//site-falso.com",
      "/\\site-falso.com",
      "\\\\site-falso.com",
      "javascript:alert(1)",
      "visitas",
      "/visitas\nSet-Cookie: x",
      "/\tsite-falso.com",
      "",
      "   ",
      `/${"a".repeat(600)}`,
    ]) {
      expect(destinoSeguro(ruim), ruim).toBeNull();
    }
    expect(destinoSeguro(undefined)).toBeNull();
    expect(destinoSeguro(["/visitas"])).toBeNull();
  });

  it("não volta para a própria entrada nem para APIs", () => {
    expect(destinoSeguro("/entrar")).toBeNull();
    expect(destinoSeguro("/entrar?volta=/visitas")).toBeNull();
    expect(destinoSeguro("/api/sessao")).toBeNull();
  });

  it("resolve ../ sem sair do portal", () => {
    expect(destinoSeguro("/visitas/../api/sessao")).toBeNull();
    expect(destinoSeguro("/a/../visitas")).toBe("/visitas");
    // Depois de arrumados, estes virariam "//site-falso.com" (outro site).
    for (const ruim of ["/.//site-falso.com", "/a/..//site-falso.com", "/%2e//site-falso.com", "/inicio/..//site-falso.com/x"]) {
      expect(destinoSeguro(ruim), ruim).toBeNull();
    }
  });
});

describe("destinoDepoisDoLogin", () => {
  it("senha provisória sempre vai para a troca", () => {
    expect(destinoDepoisDoLogin("/conta/senha", "/visitas")).toBe("/conta/senha");
  });

  it("morador volta para áreas do morador", () => {
    expect(destinoDepoisDoLogin("/inicio", "/visitas")).toBe("/visitas");
    expect(destinoDepoisDoLogin("/inicio", "/reservas?area=salao")).toBe("/reservas?area=salao");
    expect(destinoDepoisDoLogin("/inicio", "/admin")).toBe("/inicio");
    expect(destinoDepoisDoLogin("/inicio", "https://site-falso.com")).toBe("/inicio");
    expect(destinoDepoisDoLogin("/inicio", undefined)).toBe("/inicio");
  });

  it("equipe volta só para dentro da própria área", () => {
    expect(destinoDepoisDoLogin("/admin", "/admin/pessoas")).toBe("/admin/pessoas");
    expect(destinoDepoisDoLogin("/admin", "/admin/auditoria")).toBe("/admin/auditoria");
    expect(destinoDepoisDoLogin("/portaria", "/admin")).toBe("/portaria");
    expect(destinoDepoisDoLogin("/admin", "/administrador")).toBe("/admin");
  });

  it("link de módulo leva para a versão do módulo na área da pessoa", () => {
    // Reservas
    expect(destinoDepoisDoLogin("/inicio", "/reservas")).toBe("/reservas");
    expect(destinoDepoisDoLogin("/admin", "/reservas")).toBe("/admin/reservas");
    expect(destinoDepoisDoLogin("/portaria", "/reservas")).toBe("/portaria");
    // Visitas e encomendas
    expect(destinoDepoisDoLogin("/admin", "/visitas")).toBe("/admin/portaria");
    expect(destinoDepoisDoLogin("/portaria", "/encomendas")).toBe("/portaria");
    expect(destinoDepoisDoLogin("/inicio", "/visitas?filtro=usadas")).toBe("/visitas?filtro=usadas");
    // Links da equipe
    expect(destinoDepoisDoLogin("/admin", "/sindico")).toBe("/admin");
    expect(destinoDepoisDoLogin("/admin", "/conselho")).toBe("/admin");
    expect(destinoDepoisDoLogin("/portaria", "/portaria")).toBe("/portaria");
    expect(destinoDepoisDoLogin("/inicio", "/sindico")).toBe("/inicio");
    expect(destinoDepoisDoLogin("/portaria", "/sindico")).toBe("/portaria");
    // Portal do morador
    expect(destinoDepoisDoLogin("/inicio", "/morador")).toBe("/inicio");
    expect(destinoDepoisDoLogin("/admin", "/morador")).toBe("/admin");
    // Morador que recebeu um link da gestão vai para a versão dele
    expect(destinoDepoisDoLogin("/inicio", "/admin/financeiro")).toBe("/financeiro");
    // Detalhe com o mesmo formato leva o item junto
    expect(destinoDepoisDoLogin("/admin", "/comunicados/abc123")).toBe("/admin/comunicados/abc123");
    expect(destinoDepoisDoLogin("/inicio", "/admin/solicitacoes/xyz")).toBe("/solicitacoes/xyz");
    // Módulo sem versão para a área → início
    expect(destinoDepoisDoLogin("/portaria", "/financeiro")).toBe("/portaria");
  });

  it("síndico/conselho podem voltar ao relatório do financeiro; portaria não", () => {
    expect(destinoDepoisDoLogin("/admin", "/relatorio/financeiro?mes=2026-10")).toBe("/relatorio/financeiro?mes=2026-10");
    expect(destinoDepoisDoLogin("/portaria", "/relatorio/financeiro?mes=2026-10")).toBe("/portaria");
  });
});

describe("linkEntrar", () => {
  it("monta o link com volta e condomínio", () => {
    expect(linkEntrar()).toBe("/entrar");
    expect(linkEntrar("/visitas")).toBe("/entrar?volta=%2Fvisitas");
    expect(linkEntrar("/visitas", "demo")).toBe("/entrar?c=demo&volta=%2Fvisitas");
    expect(linkEntrar("https://site-falso.com")).toBe("/entrar");
  });
});

describe("endereço principal (/)", () => {
  it("sem sessão vai para a tela de entrada (nada abre sem login)", () => {
    expect(destinoDaRaiz(null)).toBe("/entrar");
  });

  it("com sessão vai para o início do papel", () => {
    expect(destinoDaRaiz({ papel: "morador", precisaTrocarSenha: false })).toBe("/inicio");
    expect(destinoDaRaiz({ papel: "admin", precisaTrocarSenha: false })).toBe("/admin");
    expect(destinoDaRaiz({ papel: "conselheiro", precisaTrocarSenha: false })).toBe("/admin");
    expect(destinoDaRaiz({ papel: "portaria", precisaTrocarSenha: false })).toBe("/portaria");
  });

  it("senha provisória vai primeiro para a troca de senha", () => {
    expect(destinoDaRaiz({ papel: "morador", precisaTrocarSenha: true })).toBe("/conta/senha");
  });
});
