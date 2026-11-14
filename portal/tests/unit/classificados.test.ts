/**
 * Regras dos classificados (sem banco): prazo de 30 dias, expiração calculada
 * na leitura, nome e WhatsApp, conteúdo proibido e validação dos formulários.
 */
import { describe, expect, it } from "vitest";
import {
  DIAS_VALIDADE,
  calcularExpiraEm,
  contaComoAtivo,
  diasRestantes,
  estaVisivel,
  formatarWhatsapp,
  linkWhatsapp,
  normalizarWhatsapp,
  podeRemover,
  primeiroNome,
  problemaNoConteudo,
  situacaoEfetiva,
} from "@/lib/classificados";
import { esquemaAnuncio, esquemaIdAnuncio, esquemaMotivoAnuncio } from "@/lib/validacao-classificados";

const agora = new Date("2026-11-14T15:00:00Z");
const dias = (n: number) => new Date(agora.getTime() + n * 24 * 60 * 60 * 1000);

describe("prazo e situação", () => {
  it("expira 30 dias depois da aprovação", () => {
    expect(DIAS_VALIDADE).toBe(30);
    expect(calcularExpiraEm(agora).toISOString()).toBe("2026-12-14T15:00:00.000Z");
  });

  it("aprovado dentro do prazo continua publicado e visível", () => {
    expect(situacaoEfetiva("aprovado", dias(1), agora)).toBe("aprovado");
    expect(estaVisivel("aprovado", dias(1), agora)).toBe(true);
  });

  it("aprovado vencido aparece como expirado e some da lista", () => {
    expect(situacaoEfetiva("aprovado", dias(-1), agora)).toBe("expirado");
    expect(situacaoEfetiva("aprovado", agora, agora)).toBe("expirado");
    expect(estaVisivel("aprovado", dias(-1), agora)).toBe(false);
  });

  it("aprovado sem data de expiração (dado estranho) não aparece", () => {
    expect(estaVisivel("aprovado", null, agora)).toBe(false);
  });

  it("pendente, rejeitado e removido nunca aparecem na lista", () => {
    for (const s of ["pendente", "rejeitado", "removido", "expirado"] as const) {
      expect(estaVisivel(s, dias(10), agora)).toBe(false);
    }
  });

  it("só pendente e publicado contam no limite e podem ser removidos", () => {
    expect(contaComoAtivo("pendente", null, agora)).toBe(true);
    expect(contaComoAtivo("aprovado", dias(5), agora)).toBe(true);
    expect(contaComoAtivo("aprovado", dias(-5), agora)).toBe(false);
    expect(contaComoAtivo("rejeitado", null, agora)).toBe(false);
    expect(podeRemover("removido", null, agora)).toBe(false);
    expect(podeRemover("pendente", null, agora)).toBe(true);
  });

  it("dias restantes arredonda para cima e nunca fica negativo", () => {
    expect(diasRestantes(dias(29.5), agora)).toBe(30);
    expect(diasRestantes(dias(-3), agora)).toBe(0);
  });
});

describe("nome e contato", () => {
  it("mostra só o primeiro nome", () => {
    expect(primeiroNome("  Maria José da Silva ")).toBe("Maria");
    expect(primeiroNome("")).toBe("Morador");
  });

  it("normaliza WhatsApp para só dígitos com 55", () => {
    expect(normalizarWhatsapp("(91) 98888-7777")).toBe("5591988887777");
    expect(normalizarWhatsapp("+55 91 98888-7777")).toBe("5591988887777");
    expect(normalizarWhatsapp("91 3222-1111")).toBe("559132221111");
  });

  it("recusa números que não são telefones brasileiros", () => {
    expect(normalizarWhatsapp("12345")).toBeNull();
    expect(normalizarWhatsapp("(01) 98888-7777")).toBeNull();
    expect(normalizarWhatsapp("(91) 88888-7777")).toBeNull(); // celular de 11 dígitos sem o 9
    expect(normalizarWhatsapp("abc")).toBeNull();
  });

  it("formata e monta o link do WhatsApp", () => {
    expect(formatarWhatsapp("5591988887777")).toBe("(91) 98888-7777");
    expect(formatarWhatsapp("559132221111")).toBe("(91) 3222-1111");
    const link = linkWhatsapp("5591988887777", "Bicicleta");
    expect(link.startsWith("https://wa.me/5591988887777?text=")).toBe(true);
    expect(decodeURIComponent(link)).toContain('"Bicicleta"');
  });
});

describe("conteúdo proibido", () => {
  it("barra CPF e número de cartão", () => {
    expect(problemaNoConteudo("Meu CPF é 123.456.789-09")).toMatch(/CPF/);
    expect(problemaNoConteudo("Cartão 4111 1111 1111 1111")).toMatch(/cartão/);
  });

  it("deixa passar texto normal e telefone", () => {
    expect(problemaNoConteudo("Bicicleta aro 26, ligue 55 91 98888 7777")).toBeNull();
    expect(problemaNoConteudo("Bolo de pote por R$ 12,00")).toBeNull();
  });
});

describe("esquemaAnuncio", () => {
  const base = { titulo: "Bicicleta aro 26", texto: "Em ótimo estado, pouco usada.", categoria: "venda" };

  it("aceita anúncio mínimo (sem preço e sem contato)", () => {
    const r = esquemaAnuncio.safeParse(base);
    expect(r.success).toBe(true);
    expect(r.data).toEqual({ ...base, preco: null, contatoWhatsapp: null });
  });

  it("converte preço para centavos", () => {
    const r = esquemaAnuncio.safeParse({ ...base, preco: "1.200,50" });
    expect(r.data?.preco).toBe(120050);
  });

  it("doação nunca tem preço", () => {
    const r = esquemaAnuncio.safeParse({ ...base, categoria: "doacao", preco: "50" });
    expect(r.data?.preco).toBeNull();
  });

  it("recusa preço inválido", () => {
    expect(esquemaAnuncio.safeParse({ ...base, preco: "abc" }).success).toBe(false);
    expect(esquemaAnuncio.safeParse({ ...base, preco: "-10" }).success).toBe(false);
  });

  it("WhatsApp exige a confirmação de que ficará visível", () => {
    const sem = esquemaAnuncio.safeParse({ ...base, whatsapp: "(91) 98888-7777" });
    expect(sem.success).toBe(false);
    expect(sem.error?.issues[0]?.message).toMatch(/visível/);
    const com = esquemaAnuncio.safeParse({ ...base, whatsapp: "(91) 98888-7777", cienteContato: "sim" });
    expect(com.data?.contatoWhatsapp).toBe("5591988887777");
  });

  it("recusa WhatsApp inválido", () => {
    expect(esquemaAnuncio.safeParse({ ...base, whatsapp: "123", cienteContato: "sim" }).success).toBe(false);
  });

  it("recusa categoria desconhecida, título curto e CPF no texto", () => {
    expect(esquemaAnuncio.safeParse({ ...base, categoria: "imovel" }).success).toBe(false);
    expect(esquemaAnuncio.safeParse({ ...base, titulo: "Oi" }).success).toBe(false);
    expect(esquemaAnuncio.safeParse({ ...base, texto: "CPF 123.456.789-09 para nota" }).success).toBe(false);
  });

  it("ignora campos extras como autor e casa (vêm da sessão)", () => {
    const r = esquemaAnuncio.safeParse({ ...base, unitId: "casa-01", autorUid: "outro" });
    expect(r.success).toBe(true);
    expect(r.data).not.toHaveProperty("unitId");
    expect(r.data).not.toHaveProperty("autorUid");
  });
});

describe("esquemas de moderação", () => {
  it("id precisa ser seguro", () => {
    expect(esquemaIdAnuncio.safeParse({ id: "abc123" }).success).toBe(true);
    expect(esquemaIdAnuncio.safeParse({ id: "../x" }).success).toBe(false);
  });

  it("motivo é obrigatório", () => {
    expect(esquemaMotivoAnuncio.safeParse({ id: "abc", motivo: "" }).success).toBe(false);
    expect(esquemaMotivoAnuncio.safeParse({ id: "abc", motivo: "Produto proibido" }).success).toBe(true);
  });
});
