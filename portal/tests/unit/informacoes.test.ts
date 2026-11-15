import { describe, expect, it } from "vitest";
import {
  chavePixParaCopiar,
  cnpjValido,
  cpfValido,
  ehCelular,
  esquemaInformacoes,
  esquemaLinkVotacao,
  esquemaPix,
  esquemaPlantao,
  formatarChavePix,
  formatarCnpj,
  normalizarChavePix,
  normalizarLinkHttps,
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

describe("CNPJ e CPF", () => {
  it("aceita o CNPJ do condomínio com ou sem pontuação", () => {
    expect(cnpjValido("29.711.278/0001-59")).toBe(true);
    expect(cnpjValido("29711278000159")).toBe(true);
  });

  it("recusa CNPJ com dígito verificador errado, curto ou repetido", () => {
    expect(cnpjValido("29.711.278/0001-58")).toBe(false);
    expect(cnpjValido("29.711.278/0001-95")).toBe(false);
    expect(cnpjValido("2971127800015")).toBe(false);
    expect(cnpjValido("11.111.111/1111-11")).toBe(false);
    expect(cnpjValido("")).toBe(false);
  });

  it("formata o CNPJ para exibir", () => {
    expect(formatarCnpj("29711278000159")).toBe("29.711.278/0001-59");
  });

  it("confere o CPF", () => {
    expect(cpfValido("529.982.247-25")).toBe(true);
    expect(cpfValido("529.982.247-24")).toBe(false);
    expect(cpfValido("111.111.111-11")).toBe(false);
  });
});

describe("chave PIX", () => {
  it("normaliza cada tipo de chave", () => {
    expect(normalizarChavePix("cnpj", "29.711.278/0001-59")).toBe("29711278000159");
    expect(normalizarChavePix("cnpj", "29.711.278/0001-50")).toBeNull();
    expect(normalizarChavePix("cpf", "529.982.247-25")).toBe("52998224725");
    expect(normalizarChavePix("telefone", "(94) 9 9123-4567")).toBe("94991234567");
    expect(normalizarChavePix("telefone", "(94) 3322-1100")).toBeNull(); // fixo não serve
    expect(normalizarChavePix("email", " Financeiro@Exemplo.com ")).toBe("financeiro@exemplo.com");
    expect(normalizarChavePix("email", "sem-arroba")).toBeNull();
    expect(normalizarChavePix("aleatoria", "123E4567-E89B-12D3-A456-426614174000")).toBe("123e4567-e89b-12d3-a456-426614174000");
    expect(normalizarChavePix("aleatoria", "123")).toBeNull();
  });

  it("mostra formatado e copia só os números para CNPJ/CPF", () => {
    const pix = { tipo: "cnpj" as const, chave: "29711278000159" };
    expect(formatarChavePix(pix)).toBe("29.711.278/0001-59");
    expect(chavePixParaCopiar(pix)).toBe("29711278000159");
    expect(chavePixParaCopiar({ tipo: "cpf", chave: "52998224725" })).toBe("52998224725");
    expect(chavePixParaCopiar({ tipo: "telefone", chave: "94991234567" })).toBe("+5594991234567");
    expect(formatarChavePix({ tipo: "telefone", chave: "94991234567" })).toBe("(94) 9 9123-4567");
    expect(chavePixParaCopiar({ tipo: "email", chave: "a@b.com" })).toBe("a@b.com");
  });

  it("formulário do PIX: completo, em branco (remove) e com erros", () => {
    expect(
      esquemaPix.parse({ pixTipo: "cnpj", pixChave: "29.711.278/0001-59", pixFavorecido: "  Residencial   Jardins do Lago " }),
    ).toEqual({ pix: { tipo: "cnpj", chave: "29711278000159", favorecido: "Residencial Jardins do Lago" } });
    expect(esquemaPix.parse({ pixTipo: "cnpj", pixChave: "", pixFavorecido: "" })).toEqual({ pix: null });

    const cnpjErrado = esquemaPix.safeParse({ pixTipo: "cnpj", pixChave: "29.711.278/0001-58", pixFavorecido: "X" });
    expect(cnpjErrado.success).toBe(false);
    expect(cnpjErrado.error?.issues[0]?.message).toMatch(/dígitos verificadores/);

    expect(esquemaPix.safeParse({ pixTipo: "cnpj", pixChave: "29711278000159", pixFavorecido: "" }).success).toBe(false);
    expect(esquemaPix.safeParse({ pixTipo: "boleto", pixChave: "29711278000159", pixFavorecido: "X" }).success).toBe(false);
    expect(esquemaPix.safeParse({ pixTipo: "cnpj", pixChave: "", pixFavorecido: "X" }).success).toBe(false);
  });
});

describe("ronda e responsável pelas reservas", () => {
  it("só celular ganha WhatsApp", () => {
    expect(ehCelular("94991234567")).toBe(true);
    expect(ehCelular("9433221100")).toBe(false);
    expect(ehCelular(null)).toBe(false);
  });

  it("normaliza os telefones e monta o responsável", () => {
    expect(
      esquemaPlantao.parse({
        telefoneRonda: "+55 (94) 9 8888-7777",
        responsavelNome: " Maria ",
        responsavelTelefone: "94 99123-4567",
        responsavelHorario: "",
      }),
    ).toEqual({
      telefoneRonda: "94988887777",
      responsavelReservas: { nome: "Maria", telefone: "94991234567", horario: null },
    });
  });

  it("tudo em branco não mostra nada; responsável pela metade é recusado", () => {
    expect(esquemaPlantao.parse({})).toEqual({ telefoneRonda: null, responsavelReservas: null });
    expect(esquemaPlantao.safeParse({ responsavelNome: "Maria" }).success).toBe(false);
    expect(esquemaPlantao.safeParse({ responsavelTelefone: "(94) 9 9123-4567" }).success).toBe(false);
    expect(esquemaPlantao.safeParse({ telefoneRonda: "123" }).success).toBe(false);
  });
});

describe("link da votação", () => {
  it("aceita só https completo", () => {
    expect(normalizarLinkHttps("https://votacao.exemplo.com/assembleia?id=1")).toBe("https://votacao.exemplo.com/assembleia?id=1");
    expect(normalizarLinkHttps("http://votacao.exemplo.com")).toBeNull();
    expect(normalizarLinkHttps("javascript:alert(1)")).toBeNull();
    expect(normalizarLinkHttps("votacao.exemplo.com")).toBeNull();
    expect(normalizarLinkHttps("https://usuario:senha@exemplo.com")).toBeNull();
    expect(normalizarLinkHttps("https://localhost")).toBeNull();
    expect(normalizarLinkHttps("https://exemplo.com/" + "a".repeat(600))).toBeNull();
  });

  it("formulário: vazio tira o link; inválido explica", () => {
    expect(esquemaLinkVotacao.parse({ linkVotacao: "" })).toEqual({ linkVotacao: null });
    expect(esquemaLinkVotacao.parse({ linkVotacao: " https://exemplo.com/votar " })).toEqual({ linkVotacao: "https://exemplo.com/votar" });
    const r = esquemaLinkVotacao.safeParse({ linkVotacao: "http://exemplo.com" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toMatch(/https:\/\//);
  });
});
