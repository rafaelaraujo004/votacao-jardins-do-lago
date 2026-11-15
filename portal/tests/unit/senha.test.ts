import { describe, expect, it } from "vitest";
import {
  ALFABETO_SENHA,
  codigoDoErro,
  esquemaEmail,
  esquemaLoginEquipe,
  esquemaTrocaSenha,
  gerarSenhaProvisoria,
  mascararEmail,
  mensagemErroLogin,
  mensagemErroTroca,
  SENHA_MINIMA,
} from "@/lib/senha";

describe("senha provisória", () => {
  it("tem o formato XXXX-XXXX-XXXX com 12 caracteres sorteados", () => {
    const s = gerarSenhaProvisoria();
    expect(s).toMatch(/^[A-Za-z0-9]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$/);
    expect(s.replace(/-/g, "")).toHaveLength(12);
  });

  it("não usa caracteres que se confundem", () => {
    for (let i = 0; i < 300; i++) {
      expect(gerarSenhaProvisoria()).not.toMatch(/[0O1lIio]/);
    }
    expect(ALFABETO_SENHA).not.toMatch(/[0O1lIio]/);
  });

  it("sempre tem maiúscula, minúscula e número", () => {
    for (let i = 0; i < 300; i++) {
      const s = gerarSenhaProvisoria();
      expect(s).toMatch(/[A-Z]/);
      expect(s).toMatch(/[a-z]/);
      expect(s).toMatch(/[0-9]/);
    }
  });

  it("só usa caracteres do alfabeto e não se repete", () => {
    const vistas = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const s = gerarSenhaProvisoria();
      for (const c of s.replace(/-/g, "")) expect(ALFABETO_SENHA).toContain(c);
      vistas.add(s);
    }
    expect(vistas.size).toBe(500);
  });

  it("aceita mais grupos e recusa valores fora da faixa", () => {
    expect(gerarSenhaProvisoria(4).split("-")).toHaveLength(4);
    expect(() => gerarSenhaProvisoria(2)).toThrow();
    expect(() => gerarSenhaProvisoria(9)).toThrow();
  });

  it("serve como senha nova válida (passa na regra de tamanho)", () => {
    expect(gerarSenhaProvisoria().length).toBeGreaterThanOrEqual(SENHA_MINIMA);
  });
});

describe("validação do e-mail e do login", () => {
  it("normaliza o e-mail (espaços e maiúsculas)", () => {
    expect(esquemaEmail.parse("  Sindico@Exemplo.COM ")).toBe("sindico@exemplo.com");
  });

  it("recusa e-mail incompleto ou vazio", () => {
    expect(esquemaEmail.safeParse("sindico@").success).toBe(false);
    expect(esquemaEmail.safeParse("").success).toBe(false);
    expect(esquemaEmail.safeParse(undefined).success).toBe(false);
  });

  it("login exige e-mail e senha", () => {
    expect(esquemaLoginEquipe.safeParse({ email: "a@b.com", senha: "x" }).success).toBe(true);
    expect(esquemaLoginEquipe.safeParse({ email: "a@b.com", senha: "" }).success).toBe(false);
    expect(esquemaLoginEquipe.safeParse({ email: "a@b.com", senha: null }).success).toBe(false);
  });
});

describe("troca de senha", () => {
  const valida = { atual: "Kp7m-Xq3t-Hw9z", nova: "minha casa azul 2026", confirmar: "minha casa azul 2026" };

  it("aceita uma troca correta", () => {
    expect(esquemaTrocaSenha.safeParse(valida).success).toBe(true);
  });

  it(`exige pelo menos ${SENHA_MINIMA} caracteres`, () => {
    const r = esquemaTrocaSenha.safeParse({ ...valida, nova: "curta123", confirmar: "curta123" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(["nova"]);
  });

  it("aceita exatamente o mínimo", () => {
    const s = "abcdefghij";
    expect(s).toHaveLength(SENHA_MINIMA);
    expect(esquemaTrocaSenha.safeParse({ ...valida, nova: s, confirmar: s }).success).toBe(true);
  });

  it("não pode ser igual à atual", () => {
    const r = esquemaTrocaSenha.safeParse({ atual: valida.nova, nova: valida.nova, confirmar: valida.nova });
    expect(r.success).toBe(false);
    expect(r.error?.issues.some((i) => i.path[0] === "nova" && /diferente/.test(i.message))).toBe(true);
  });

  it("a confirmação precisa ser igual", () => {
    const r = esquemaTrocaSenha.safeParse({ ...valida, confirmar: "outra coisa qualquer" });
    expect(r.success).toBe(false);
    expect(r.error?.issues.some((i) => i.path[0] === "confirmar")).toBe(true);
  });

  it("recusa senha só de espaços ou muito repetitiva", () => {
    const espacos = "            ";
    expect(esquemaTrocaSenha.safeParse({ ...valida, nova: espacos, confirmar: espacos }).success).toBe(false);
    const repetida = "aaaaaaaaaaaa";
    expect(esquemaTrocaSenha.safeParse({ ...valida, nova: repetida, confirmar: repetida }).success).toBe(false);
  });

  it("exige a senha atual", () => {
    expect(esquemaTrocaSenha.safeParse({ ...valida, atual: "" }).success).toBe(false);
  });

  it("recusa senha longa demais", () => {
    const longa = "a1".repeat(80);
    expect(esquemaTrocaSenha.safeParse({ ...valida, nova: longa, confirmar: longa }).success).toBe(false);
  });
});

describe("mensagens de erro", () => {
  it("senha errada e e-mail inexistente dão a MESMA mensagem", () => {
    const m = mensagemErroLogin("auth/invalid-credential");
    expect(mensagemErroLogin("auth/user-not-found")).toBe(m);
    expect(mensagemErroLogin("auth/wrong-password")).toBe(m);
    expect(mensagemErroLogin("auth/invalid-email")).toBe(m);
  });

  it("explica muitas tentativas e conta desativada", () => {
    expect(mensagemErroLogin("auth/too-many-requests")).toMatch(/Muitas tentativas/);
    expect(mensagemErroLogin("auth/user-disabled")).toMatch(/desativada/);
  });

  it("erro desconhecido vira mensagem genérica, sem detalhes técnicos", () => {
    const m = mensagemErroLogin("auth/qualquer-coisa");
    expect(m).not.toMatch(/auth\//);
    expect(mensagemErroTroca("")).not.toMatch(/auth\//);
  });

  it("na troca, senha atual errada é explicada", () => {
    expect(mensagemErroTroca("auth/invalid-credential")).toMatch(/senha atual/);
    expect(mensagemErroTroca("auth/weak-password")).toMatch(String(SENHA_MINIMA));
  });

  it("lê o código do erro do Firebase com segurança", () => {
    expect(codigoDoErro({ code: "auth/user-disabled" })).toBe("auth/user-disabled");
    expect(codigoDoErro(new Error("x"))).toBe("");
    expect(codigoDoErro(null)).toBe("");
    expect(codigoDoErro({ code: 42 })).toBe("");
  });
});

describe("e-mail mascarado (auditoria)", () => {
  it("esconde a maior parte do nome", () => {
    expect(mascararEmail("joao.silva@gmail.com")).toBe("jo•••@gmail.com");
    expect(mascararEmail("ab@x.com")).toBe("a•••@x.com");
    expect(mascararEmail("a@x.com")).toBe("a•••@x.com");
  });

  it("não quebra com valor estranho", () => {
    expect(mascararEmail("sem-arroba")).toBe("•••");
  });
});
