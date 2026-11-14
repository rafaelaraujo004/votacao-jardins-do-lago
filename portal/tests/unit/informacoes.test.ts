import { describe, expect, it } from "vitest";
import {
  esquemaInformacoes,
  formatarTelefone,
  linkConversaWhatsApp,
  linkLigar,
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
  it("normaliza telefones e junta espaços", () => {
    const r = esquemaInformacoes.parse({
      telefonePortaria: "(94) 9 9123-4567",
      telefoneAdministracao: "",
      whatsappAdministracao: "+55 94 98888-7777",
      horarioAdministracao: "  Seg. a sex.,\n 8h às 18h ",
      aviso: "",
      portalPublico: "on", // campo antigo: é ignorado
    });
    expect(r).toEqual({
      telefonePortaria: "94991234567",
      telefoneAdministracao: null,
      whatsappAdministracao: "94988887777",
      horarioAdministracao: "Seg. a sex., 8h às 18h",
      aviso: null,
    });
  });

  it("não existe mais a chave de portal público", () => {
    expect(esquemaInformacoes.parse({ portalPublico: "on" })).not.toHaveProperty("portalPublico");
  });

  it("recusa telefone inválido e aviso grande demais", () => {
    expect(esquemaInformacoes.safeParse({ telefonePortaria: "123" }).success).toBe(false);
    expect(esquemaInformacoes.safeParse({ aviso: "a".repeat(201) }).success).toBe(false);
    expect(esquemaInformacoes.safeParse({ aviso: "a".repeat(200) }).success).toBe(true);
  });
});

describe("convite dos moradores", () => {
  it("mensagem traz o nome, o link de entrada e fala de usuário e senha (nada sem login)", () => {
    const m = mensagemConviteMoradores("Residencial Jardins do Lago", "https://p.com/entrar");
    expect(m).toContain("Residencial Jardins do Lago");
    expect(m).toContain("https://p.com/entrar");
    expect(m).toContain("USUÁRIO");
    expect(m).toContain("SENHA");
    expect(m).not.toMatch(/sem precisar de senha/i);
  });
});
