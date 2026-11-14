import { describe, expect, it } from "vitest";
import {
  ALFABETO_USUARIO,
  ehEmailDeMorador,
  ehUsuarioValido,
  emailDoMorador,
  gerarCodigoUsuario,
  linkWhatsAppAcesso,
  mensagemAcessoMorador,
  normalizarUsuario,
  numeroParaWhatsApp,
  situacaoLoginMorador,
  TAMANHO_USUARIO,
  usuarioParaLeitura,
} from "@/lib/usuario-morador";

describe("código do usuário", () => {
  it("tem 6 caracteres, só maiúsculas e números, sem os que se confundem", () => {
    for (let i = 0; i < 300; i++) {
      const c = gerarCodigoUsuario();
      expect(c).toHaveLength(TAMANHO_USUARIO);
      expect(c).toMatch(/^[A-Z2-9]{6}$/);
      expect(c).not.toMatch(/[01OI]/);
      expect(ehUsuarioValido(c)).toBe(true);
    }
  });

  it("o alfabeto tem 32 símbolos (sorteio sem vício) e nenhum ambíguo", () => {
    expect(ALFABETO_USUARIO).toHaveLength(32);
    expect(new Set(ALFABETO_USUARIO).size).toBe(32);
    expect(ALFABETO_USUARIO).not.toMatch(/[01OI]/);
  });

  it("sorteia códigos diferentes", () => {
    const codigos = new Set(Array.from({ length: 200 }, () => gerarCodigoUsuario()));
    expect(codigos.size).toBeGreaterThan(195);
  });
});

describe("normalizarUsuario", () => {
  it("aceita minúsculas, espaços e hífen", () => {
    expect(normalizarUsuario("k7m4px")).toBe("K7M4PX");
    expect(normalizarUsuario("  K7M 4PX ")).toBe("K7M4PX");
    expect(normalizarUsuario("k7m-4px")).toBe("K7M4PX");
  });

  it("recusa tamanho errado, símbolos ambíguos e outros tipos", () => {
    expect(normalizarUsuario("K7M4P")).toBeNull();
    expect(normalizarUsuario("K7M4PXX")).toBeNull();
    expect(normalizarUsuario("K0M4PX")).toBeNull();
    expect(normalizarUsuario("KOM4PX")).toBeNull();
    expect(normalizarUsuario("K7M4P@")).toBeNull();
    expect(normalizarUsuario("")).toBeNull();
    expect(normalizarUsuario(undefined)).toBeNull();
    expect(normalizarUsuario(123456)).toBeNull();
  });

  it("ehUsuarioValido só aceita o formato já arrumado", () => {
    expect(ehUsuarioValido("K7M4PX")).toBe(true);
    expect(ehUsuarioValido("k7m4px")).toBe(false);
    expect(ehUsuarioValido(null)).toBe(false);
  });
});

describe("e-mail sintético", () => {
  it("é sempre o mesmo para o mesmo usuário (digitado de qualquer jeito)", () => {
    const esperado = "k7m4px@morador.jardins-do-lago.portal.invalid";
    expect(emailDoMorador("K7M4PX", "jardins-do-lago")).toBe(esperado);
    expect(emailDoMorador(" k7m 4px", "jardins-do-lago")).toBe(esperado);
  });

  it("muda de condomínio para condomínio", () => {
    expect(emailDoMorador("K7M4PX", "outro")).not.toBe(emailDoMorador("K7M4PX", "jardins-do-lago"));
  });

  it("arruma o id do condomínio para virar parte do domínio", () => {
    expect(emailDoMorador("K7M4PX", "Jardins_Demo")).toBe("k7m4px@morador.jardins-demo.portal.invalid");
  });

  it("recusa usuário ou condomínio inválidos", () => {
    expect(() => emailDoMorador("abc", "jardins-do-lago")).toThrow();
    expect(() => emailDoMorador("K7M4PX", "___")).toThrow();
  });

  it("reconhece e-mail de morador e não confunde com e-mail real", () => {
    expect(ehEmailDeMorador(emailDoMorador("K7M4PX", "jardins-do-lago"))).toBe(true);
    expect(ehEmailDeMorador("sindico@gmail.com")).toBe(false);
    expect(ehEmailDeMorador("x@morador.com")).toBe(false);
    expect(ehEmailDeMorador(null)).toBe(false);
  });
});

describe("situação do login", () => {
  it("sem usuário, com senha provisória e ativo", () => {
    expect(situacaoLoginMorador({})).toBe("sem-acesso");
    expect(situacaoLoginMorador({ usuario: "lixo", precisaTrocarSenha: true })).toBe("sem-acesso");
    expect(situacaoLoginMorador({ usuario: "K7M4PX", precisaTrocarSenha: true })).toBe("provisoria");
    expect(situacaoLoginMorador({ usuario: "K7M4PX", precisaTrocarSenha: false })).toBe("ativo");
    expect(situacaoLoginMorador({ usuario: "K7M4PX" })).toBe("ativo");
  });
});

describe("mensagem e link do WhatsApp", () => {
  const dados = {
    nome: "Maria da Silva",
    condominioNome: "Residencial Jardins do Lago",
    linkEntrar: "https://portal.exemplo.com/entrar",
    usuario: "K7M4PX",
    senha: "Kp7m-Xq3t-Hw9z",
  };

  it("tem saudação, link, usuário, senha e o aviso da troca", () => {
    const m = mensagemAcessoMorador(dados);
    expect(m).toContain("Olá, Maria!");
    expect(m).toContain("https://portal.exemplo.com/entrar");
    expect(m).toContain("Usuário: K7M4PX");
    expect(m).toContain("Senha provisória: Kp7m-Xq3t-Hw9z");
    expect(m).toMatch(/escolher a sua própria senha/);
  });

  it("número com DDD ganha o 55; com 55 fica igual; inválido vira null", () => {
    expect(numeroParaWhatsApp("91999998888")).toBe("5591999998888");
    expect(numeroParaWhatsApp("(91) 3222-1111")).toBe("559132221111");
    expect(numeroParaWhatsApp("5591999998888")).toBe("5591999998888");
    expect(numeroParaWhatsApp("123")).toBeNull();
    expect(numeroParaWhatsApp("")).toBeNull();
    expect(numeroParaWhatsApp(null)).toBeNull();
  });

  it("monta o link com ou sem telefone, com o texto codificado", () => {
    const m = mensagemAcessoMorador(dados);
    expect(linkWhatsAppAcesso(m, "91999998888")).toBe(`https://wa.me/5591999998888?text=${encodeURIComponent(m)}`);
    expect(linkWhatsAppAcesso(m, "")).toBe(`https://wa.me/?text=${encodeURIComponent(m)}`);
    expect(linkWhatsAppAcesso("a b&c")).toBe("https://wa.me/?text=a%20b%26c");
  });

  it("usuário para leitura separa em 3 + 3", () => {
    expect(usuarioParaLeitura("K7M4PX")).toBe("K7M 4PX");
  });
});
