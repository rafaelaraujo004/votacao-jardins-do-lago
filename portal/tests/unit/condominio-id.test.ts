/**
 * Id do condomínio na tela de entrada: o ?c= só monta o login do morador
 * de outro condomínio (ex.: a demonstração). Nunca escolhe dados.
 */
import { describe, expect, it } from "vitest";
import { ID_CONDOMINIO_PADRAO, idCondominioPadrao, idDoLogin, idValido, linkAcessoMoradores, sufixoDoId } from "@/lib/condominio-id";

describe("condomínio do login", () => {
  it("usa a variável de ambiente quando válida e o padrão quando não", () => {
    expect(idCondominioPadrao(undefined)).toBe(ID_CONDOMINIO_PADRAO);
    expect(idCondominioPadrao("")).toBe(ID_CONDOMINIO_PADRAO);
    expect(idCondominioPadrao(" outro-condominio ")).toBe("outro-condominio");
    expect(idCondominioPadrao("../segredo")).toBe(ID_CONDOMINIO_PADRAO);
  });

  it("sem ?c= ou com ?c= inválido usa o padrão; válido é usado", () => {
    expect(idDoLogin(undefined, "padrao")).toBe("padrao");
    expect(idDoLogin("", "padrao")).toBe("padrao");
    expect(idDoLogin("jardins-do-lago-demo", "padrao")).toBe("jardins-do-lago-demo");
    expect(idDoLogin(["jardins-do-lago-demo", "x"], "padrao")).toBe("jardins-do-lago-demo");
    expect(idDoLogin("Jardins/../x", "padrao")).toBe("padrao");
    expect(idDoLogin("a".repeat(80), "padrao")).toBe("padrao");
  });

  it("só aceita ids simples", () => {
    expect(idValido("jardins-do-lago")).toBe(true);
    expect(idValido("-comeca-com-hifen")).toBe(false);
    expect(idValido("com espaco")).toBe(false);
    expect(idValido(42)).toBe(false);
  });
});

describe("link de acesso dos moradores", () => {
  it("leva sempre para a tela de entrada", () => {
    expect(linkAcessoMoradores("https://portal.exemplo.com/", "jardins-do-lago", "jardins-do-lago")).toBe(
      "https://portal.exemplo.com/entrar",
    );
  });

  it("outro condomínio leva ?c= (só para o login)", () => {
    expect(sufixoDoId("jardins-do-lago", "jardins-do-lago")).toBe("");
    expect(linkAcessoMoradores("https://p.com", "jardins-do-lago-demo", "jardins-do-lago")).toBe(
      "https://p.com/entrar?c=jardins-do-lago-demo",
    );
  });
});
