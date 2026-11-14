import { describe, expect, it } from "vitest";
import {
  esquemaInformacoes,
  formatarTelefone,
  linkConversaWhatsApp,
  linkLigar,
  linkPublicoMoradores,
  mensagemConviteMoradores,
  normalizarTelefone,
} from "@/lib/validacao-informacoes";

describe("telefones", () => {
  it("aceita celular e fixo com DDD em vários formatos", () => {
    expect(normalizarTelefone("(94) 9 9123-4567")).toBe("94991234567");
    expect(normalizarTelefone("+55 94 99123-4567")).toBe("94991234567");
    expect(normalizarTelefone("094 3322-1100")).toBe("9433221100");
    expect(normalizarTelefone("94 3322 1100")).toBe("9433221100");
  });

  it("recusa números sem DDD, curtos ou inválidos", () => {
    expect(normalizarTelefone("99123-4567")).toBeNull();
    expect(normalizarTelefone("(04) 9 9123-4567")).toBeNull();
    expect(normalizarTelefone("(94) 8 9123-4567")).toBeNull(); // celular sem o 9
    expect(normalizarTelefone("(94) 9322-1100")).toBeNull(); // fixo não começa com 9
    expect(normalizarTelefone("abc")).toBeNull();
  });

  it("formata para exibir e monta os links", () => {
    expect(formatarTelefone("94991234567")).toBe("(94) 9 9123-4567");
    expect(formatarTelefone("9433221100")).toBe("(94) 3322-1100");
    expect(linkLigar("94991234567")).toBe("tel:+5594991234567");
    expect(linkConversaWhatsApp("94991234567")).toBe("https://wa.me/5594991234567");
  });
});

describe("formulário de informações", () => {
  it("normaliza telefones, junta espaços e lê a caixa do portal", () => {
    const r = esquemaInformacoes.parse({
      telefonePortaria: "(94) 9 9123-4567",
      telefoneAdministracao: "",
      whatsappAdministracao: "+55 94 98888-7777",
      horarioAdministracao: "  Seg. a sex.,\n 8h às 18h ",
      aviso: "",
      portalPublico: "on",
    });
    expect(r).toEqual({
      telefonePortaria: "94991234567",
      telefoneAdministracao: null,
      whatsappAdministracao: "94988887777",
      horarioAdministracao: "Seg. a sex., 8h às 18h",
      aviso: null,
      portalPublico: true,
    });
  });

  it("sem a caixa marcada o portal fica desligado", () => {
    expect(esquemaInformacoes.parse({}).portalPublico).toBe(false);
  });

  it("recusa telefone inválido e aviso grande demais", () => {
    expect(esquemaInformacoes.safeParse({ telefonePortaria: "123" }).success).toBe(false);
    expect(esquemaInformacoes.safeParse({ aviso: "a".repeat(201) }).success).toBe(false);
    expect(esquemaInformacoes.safeParse({ aviso: "a".repeat(200) }).success).toBe(true);
  });
});

describe("link público dos moradores", () => {
  it("condomínio padrão usa só a raiz", () => {
    expect(linkPublicoMoradores("https://portal.exemplo.com/", "jardins-do-lago")).toBe("https://portal.exemplo.com/");
  });

  it("outro condomínio leva ?c=", () => {
    expect(linkPublicoMoradores("https://portal.exemplo.com", "jardins-do-lago-demo")).toBe(
      "https://portal.exemplo.com/?c=jardins-do-lago-demo",
    );
    expect(linkPublicoMoradores("https://p.com", "outro", "outro")).toBe("https://p.com/");
  });

  it("mensagem de convite traz o nome e o link", () => {
    const m = mensagemConviteMoradores("Residencial Jardins do Lago", "https://p.com/");
    expect(m).toContain("Residencial Jardins do Lago");
    expect(m).toContain("https://p.com/");
  });
});
