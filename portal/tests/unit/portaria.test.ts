/**
 * Regras puras da portaria: código de acesso, validade, uso único,
 * WhatsApp, busca de casa, retenção LGPD e validação dos formulários.
 */
import { describe, expect, it } from "vitest";
import {
  ALFABETO_CODIGO,
  codigoValido,
  dataISOValida,
  diasEntre,
  ehUsoUnico,
  erroNoPeriodo,
  filtrarCasas,
  formatarCodigo,
  gerarCodigo,
  hashDoCodigo,
  limiteDeRetencao,
  linkWhatsApp,
  mensagemWhatsApp,
  motivoParaRecusarEntrada,
  normalizarCodigo,
  situacaoDaVisita,
  somarDias,
} from "@/lib/portaria";
import {
  esquemaAutorizarVisita,
  esquemaCodigo,
  esquemaEncomenda,
  esquemaEntradaSemCodigo,
  esquemaEntregaEncomenda,
  esquemaFiltroHistorico,
} from "@/lib/validacao-portaria";

describe("código de acesso", () => {
  it("gera 6 símbolos, só do alfabeto sem ambíguos", () => {
    for (let i = 0; i < 200; i++) {
      const c = gerarCodigo();
      expect(c).toHaveLength(6);
      expect(codigoValido(c)).toBe(true);
    }
    for (const ambiguo of ["0", "O", "1", "I", "L"]) expect(ALFABETO_CODIGO).not.toContain(ambiguo);
  });

  it("não repete códigos à toa", () => {
    const vistos = new Set(Array.from({ length: 500 }, gerarCodigo));
    expect(vistos.size).toBeGreaterThan(495);
  });

  it("normaliza o que a portaria digita e formata para ditar", () => {
    expect(normalizarCodigo(" k7m-4px ")).toBe("K7M4PX");
    expect(formatarCodigo("k7m4px")).toBe("K7M-4PX");
    expect(formatarCodigo("K7")).toBe("K7");
  });

  it("recusa códigos com tamanho errado ou símbolos ambíguos", () => {
    expect(codigoValido("K7M4P")).toBe(false);
    expect(codigoValido("K7M4PO")).toBe(false); // O não existe no alfabeto
    expect(codigoValido("K7M4P1")).toBe(false);
  });

  it("HMAC: mesmo código e segredo → mesmo hash; muda com segredo, condomínio ou código", async () => {
    const a = await hashDoCodigo("segredo-1", "cond-a", "K7M-4PX");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashDoCodigo("segredo-1", "cond-a", "k7m4px")).toBe(a);
    expect(await hashDoCodigo("segredo-2", "cond-a", "K7M4PX")).not.toBe(a);
    expect(await hashDoCodigo("segredo-1", "cond-b", "K7M4PX")).not.toBe(a);
    expect(await hashDoCodigo("segredo-1", "cond-a", "K7M4PY")).not.toBe(a);
    // o hash não contém o código
    expect(a).not.toContain("k7m4px");
  });

  it("HMAC sem segredo é erro (nunca grava hash fraco)", async () => {
    await expect(hashDoCodigo("", "cond-a", "K7M4PX")).rejects.toThrow();
  });
});

describe("datas e período", () => {
  it("soma e conta dias, inclusive virando mês e ano", () => {
    expect(somarDias("2026-11-14", 1)).toBe("2026-11-15");
    expect(somarDias("2026-12-31", 1)).toBe("2027-01-01");
    expect(somarDias("2026-03-01", -1)).toBe("2026-02-28");
    expect(diasEntre("2026-11-14", "2026-12-14")).toBe(30);
  });

  it("recusa datas que não existem", () => {
    expect(dataISOValida("2026-02-31")).toBe(false);
    expect(dataISOValida("2026-02-28")).toBe(true);
  });

  const hoje = "2026-11-14";

  it("aceita hoje, um período de até 30 dias e agendamento até 30 dias à frente", () => {
    expect(erroNoPeriodo(hoje, hoje, hoje)).toBeNull();
    expect(erroNoPeriodo(hoje, somarDias(hoje, 29), hoje)).toBeNull();
    expect(erroNoPeriodo(somarDias(hoje, 30), somarDias(hoje, 30), hoje)).toBeNull();
  });

  it("recusa passado, fim antes do início, mais de 30 dias e agendamento longe demais", () => {
    expect(erroNoPeriodo("2026-11-13", "2026-11-14", hoje)).toMatch(/passado/);
    expect(erroNoPeriodo("2026-11-16", "2026-11-15", hoje)).toMatch(/antes/);
    expect(erroNoPeriodo(hoje, somarDias(hoje, 30), hoje)).toMatch(/30 dias/);
    expect(erroNoPeriodo(somarDias(hoje, 31), somarDias(hoje, 31), hoje)).toMatch(/antecedência/);
    expect(erroNoPeriodo("2026-02-31", "2026-02-31", hoje)).toMatch(/dia da visita/);
  });

  it("um dia = uso único; período = vários usos", () => {
    expect(ehUsoUnico("2026-11-14", "2026-11-14")).toBe(true);
    expect(ehUsoUnico("2026-11-14", "2026-11-20")).toBe(false);
  });
});

describe("situação da autorização e recusa na portaria", () => {
  const hoje = "2026-11-14";
  const v = (status: "ativa" | "usada" | "cancelada", data: string, validaAte: string) => ({ status, data, validaAte });

  it("calcula a situação no dia", () => {
    expect(situacaoDaVisita(v("ativa", hoje, hoje), hoje)).toBe("valida_hoje");
    expect(situacaoDaVisita(v("ativa", "2026-11-10", "2026-11-20"), hoje)).toBe("valida_hoje");
    expect(situacaoDaVisita(v("ativa", "2026-11-15", "2026-11-15"), hoje)).toBe("agendada");
    expect(situacaoDaVisita(v("ativa", "2026-11-13", "2026-11-13"), hoje)).toBe("vencida");
    expect(situacaoDaVisita(v("usada", hoje, hoje), hoje)).toBe("usada");
    expect(situacaoDaVisita(v("cancelada", hoje, hoje), hoje)).toBe("cancelada");
  });

  it("só libera quem vale hoje, explicando o motivo nos outros casos", () => {
    expect(motivoParaRecusarEntrada(v("ativa", hoje, hoje), hoje)).toBeNull();
    expect(motivoParaRecusarEntrada(v("usada", hoje, hoje), hoje)).toMatch(/já foi usado/);
    expect(motivoParaRecusarEntrada(v("cancelada", hoje, hoje), hoje)).toMatch(/cancelada/);
    expect(motivoParaRecusarEntrada(v("ativa", "2026-11-01", "2026-11-13"), hoje)).toMatch(/venceu em 13\/11\/2026/);
    expect(motivoParaRecusarEntrada(v("ativa", "2026-11-20", "2026-11-20"), hoje)).toMatch(/a partir de 20\/11\/2026/);
  });
});

describe("WhatsApp", () => {
  it("monta a mensagem com endereço, casa e código formatado", () => {
    const m = mensagemWhatsApp({
      nomeVisitante: "Maria",
      codigo: "K7M4PX",
      data: "2026-11-14",
      validaAte: "2026-11-14",
      unidadeRotulo: "Casa 12",
      endereco: "Residencial X, Rua Y",
    });
    expect(m).toContain("Maria");
    expect(m).toContain("14/11/2026");
    expect(m).toContain("Residencial X, Rua Y");
    expect(m).toContain("Casa 12");
    expect(m).toContain("K7M-4PX");
  });

  it("gera o link wa.me com o texto codificado", () => {
    const l = linkWhatsApp("Olá & código: K7M-4PX");
    expect(l.startsWith("https://wa.me/?text=")).toBe(true);
    expect(decodeURIComponent(l.split("text=")[1])).toBe("Olá & código: K7M-4PX");
  });
});

describe("busca de casa", () => {
  const casas = [
    { id: "casa-001", rotulo: "Casa 1", numero: 1, quadra: null },
    { id: "casa-012", rotulo: "Casa 12", numero: 12, quadra: null },
    { id: "casa-120", rotulo: "Casa 120", numero: 120, quadra: null },
    { id: "qb-12", rotulo: "Quadra B · Casa 12", numero: 12, quadra: "B" },
    { id: "casa-045", rotulo: "Casa 45", numero: 45, quadra: null },
  ];

  it("número: exatos primeiro, depois os que começam igual", () => {
    expect(filtrarCasas(casas, "12").map((c) => c.id)).toEqual(["casa-012", "qb-12", "casa-120"]);
    expect(filtrarCasas(casas, "1").map((c) => c.id)).toEqual(["casa-001", "casa-012", "casa-120", "qb-12"]);
  });

  it("texto: procura no rótulo, sem ligar para acento e maiúsculas", () => {
    expect(filtrarCasas(casas, "quadra b").map((c) => c.id)).toEqual(["qb-12"]);
    expect(filtrarCasas(casas, "99")).toEqual([]);
  });
});

describe("LGPD", () => {
  it("limite de retenção é 90 dias antes de hoje", () => {
    expect(limiteDeRetencao("2026-11-14")).toBe("2026-08-16");
  });
});

describe("validação dos formulários", () => {
  it("autorizar visita: 'só um dia' usa a mesma data como validade", () => {
    const r = esquemaAutorizarVisita.parse({ nome: "  Maria   Souza ", tipo: "visita", data: "2026-11-14", duracao: "dia", validaAte: "" });
    expect(r).toMatchObject({ nome: "Maria Souza", validaAte: "2026-11-14", observacao: "" });
  });

  it("autorizar visita: período precisa da data final; tipo e nome são obrigatórios", () => {
    expect(esquemaAutorizarVisita.safeParse({ nome: "Ana", tipo: "prestador", data: "2026-11-14", duracao: "periodo" }).success).toBe(false);
    expect(
      esquemaAutorizarVisita.safeParse({ nome: "Ana", tipo: "prestador", data: "2026-11-14", duracao: "periodo", validaAte: "2026-11-20" }).success,
    ).toBe(true);
    expect(esquemaAutorizarVisita.safeParse({ nome: "A", tipo: "visita", data: "2026-11-14", duracao: "dia" }).success).toBe(false);
    expect(esquemaAutorizarVisita.safeParse({ nome: "Ana", tipo: "festa", data: "2026-11-14", duracao: "dia" }).success).toBe(false);
  });

  it("código: aceita digitado de qualquer jeito, recusa inválido", () => {
    expect(esquemaCodigo.parse({ codigo: "k7m 4px" }).codigo).toBe("K7M4PX");
    expect(esquemaCodigo.safeParse({ codigo: "K7M4" }).success).toBe(false);
  });

  it("visitante sem código exige a confirmação por telefone", () => {
    const base = { unitId: "casa-012", nome: "João", tipo: "entrega" };
    expect(esquemaEntradaSemCodigo.safeParse(base).success).toBe(false);
    expect(esquemaEntradaSemCodigo.safeParse({ ...base, confirmado: "on" }).success).toBe(true);
    expect(esquemaEntradaSemCodigo.safeParse({ ...base, unitId: "", confirmado: "on" }).success).toBe(false);
    expect(esquemaEntradaSemCodigo.safeParse({ ...base, unitId: "../outra", confirmado: "on" }).success).toBe(false);
  });

  it("encomenda e entrega", () => {
    expect(esquemaEncomenda.safeParse({ unitId: "casa-012", destinatario: "Ana", tipo: "caixa" }).success).toBe(true);
    expect(esquemaEncomenda.safeParse({ unitId: "casa-012", destinatario: "Ana", tipo: "geladeira" }).success).toBe(false);
    expect(esquemaEntregaEncomenda.safeParse({ id: "abc", retiradoPor: "Ana" }).success).toBe(false);
    expect(esquemaEntregaEncomenda.safeParse({ id: "abc", retiradoPor: "Ana", confirmado: "on" }).success).toBe(true);
  });

  it("filtro do histórico ignora valores estranhos em vez de quebrar a página", () => {
    expect(esquemaFiltroHistorico.parse({ data: "ontem", casa: "../x", aba: "tudo" })).toEqual({});
    expect(esquemaFiltroHistorico.parse({ data: "2026-11-14", casa: "casa-012", aba: "encomendas" })).toEqual({
      data: "2026-11-14",
      casa: "casa-012",
      aba: "encomendas",
    });
  });
});
