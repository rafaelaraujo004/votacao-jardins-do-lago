/**
 * Área pública dos moradores (sem banco): escolha do condomínio pelo ?c=,
 * links que mantêm o ?c= e os filtros de privacidade (LGPD).
 */
import { describe, expect, it } from "vitest";
import { comC, escolherIdPublico, idPublicoPadrao, idValido, ID_PUBLICO_PADRAO, sufixoDoId } from "@/server/publico";
import { eventoPublicoDaReserva, paraLancamentoPublico, paraOcupacaoPublica } from "@/server/dados/publico";
import { paraReserva } from "@/server/dados/reservas";

describe("escolha do condomínio público", () => {
  it("usa a variável de ambiente quando válida e o padrão quando não", () => {
    expect(idPublicoPadrao(undefined)).toBe(ID_PUBLICO_PADRAO);
    expect(idPublicoPadrao("")).toBe(ID_PUBLICO_PADRAO);
    expect(idPublicoPadrao(" outro-condominio ")).toBe("outro-condominio");
    expect(idPublicoPadrao("../segredo")).toBe(ID_PUBLICO_PADRAO);
  });

  it("sem ?c= usa o padrão; ?c= válido é usado; inválido dá null", () => {
    expect(escolherIdPublico(undefined, "padrao")).toBe("padrao");
    expect(escolherIdPublico("", "padrao")).toBe("padrao");
    expect(escolherIdPublico("jardins-do-lago-demo", "padrao")).toBe("jardins-do-lago-demo");
    expect(escolherIdPublico(["jardins-do-lago-demo", "x"], "padrao")).toBe("jardins-do-lago-demo");
    expect(escolherIdPublico("Jardins/../x", "padrao")).toBeNull();
    expect(escolherIdPublico("a".repeat(80), "padrao")).toBeNull();
  });

  it("só aceita ids simples", () => {
    expect(idValido("jardins-do-lago")).toBe(true);
    expect(idValido("-comeca-com-hifen")).toBe(false);
    expect(idValido("com espaco")).toBe(false);
    expect(idValido(42)).toBe(false);
  });
});

describe("links que mantêm o ?c=", () => {
  it("sufixo vazio para o padrão e ?c= para outro", () => {
    expect(sufixoDoId("jardins-do-lago", "jardins-do-lago")).toBe("");
    expect(sufixoDoId("jardins-do-lago-demo", "jardins-do-lago")).toBe("?c=jardins-do-lago-demo");
  });

  it("junta com ? ou & conforme o caminho", () => {
    expect(comC("/financeiro", "")).toBe("/financeiro");
    expect(comC("/financeiro", "?c=demo")).toBe("/financeiro?c=demo");
    expect(comC("/relatorio/financeiro?mes=2026-10", "?c=demo")).toBe("/relatorio/financeiro?mes=2026-10&c=demo");
  });
});

describe("privacidade dos lançamentos públicos", () => {
  it("nunca devolve quem lançou, uid ou casa", () => {
    const l = paraLancamentoPublico("e1", {
      tipo: "receita",
      categoriaId: "taxa",
      categoriaNome: "Taxa condominial",
      valorCentavos: 35000,
      data: "2026-10-05",
      forma: "pix",
      descricao: "Taxas de outubro",
      publicado: true,
      criadoPor: "uid-secreto",
      criadoPorNome: "Fulano Síndico",
      unitId: "casa-012",
      unidadeRotulo: "Casa 12",
    });
    expect(l.criadoPorNome).toBe("");
    expect(l.criadoEm).toBeNull();
    const texto = JSON.stringify(l);
    expect(texto).not.toContain("uid-secreto");
    expect(texto).not.toContain("Fulano");
    expect(texto).not.toContain("casa-012");
    expect(texto).not.toContain("Casa 12");
    expect(l).toMatchObject({ descricao: "Taxas de outubro", categoriaNome: "Taxa condominial", valorCentavos: 35000, forma: "pix" });
  });

  it("valores estranhos viram padrões seguros", () => {
    const l = paraLancamentoPublico("e2", { valorCentavos: "abc", forma: 7 });
    expect(l.valorCentavos).toBe(0);
    expect(l.forma).toBe("outro");
    expect(l.tipo).toBe("despesa");
  });
});

describe("agenda pública sem casas", () => {
  const reserva = (status: string, unitId: string | null = "casa-045") =>
    paraReserva("r1", {
      amenityId: "salao",
      areaNome: "Salão de festas",
      unitId,
      unidadeRotulo: unitId ? "Casa 45" : null,
      data: "2026-11-20",
      mes: "2026-11",
      faixaId: "f1",
      faixaRotulo: "Tarde",
      inicio: "14:00",
      fim: "22:00",
      status,
      criadoPorNome: "Maria Moradora",
    });

  it("evento mostra só a área, sem casa nem nome", () => {
    const e = eventoPublicoDaReserva(reserva("confirmada"));
    expect(e?.titulo).toBe("Salão de festas reservado");
    const texto = JSON.stringify(e);
    expect(texto).not.toContain("45");
    expect(texto).not.toContain("Maria");
  });

  it("pedidos pendentes, recusados e cancelados não viram evento", () => {
    expect(eventoPublicoDaReserva(reserva("pendente"))).toBeNull();
    expect(eventoPublicoDaReserva(reserva("recusada"))).toBeNull();
    expect(eventoPublicoDaReserva(reserva("cancelada"))).toBeNull();
    expect(eventoPublicoDaReserva(reserva("bloqueada", null))?.titulo).toBe("Salão de festas: fechado");
  });

  it("ocupação não traz a casa; 'minha' só para a casa identificada", () => {
    const o = paraOcupacaoPublica(reserva("confirmada"));
    expect(o).toEqual({ data: "2026-11-20", faixaId: "f1", inicio: "14:00", fim: "22:00", status: "confirmada", minha: false });
    expect(paraOcupacaoPublica(reserva("confirmada"), "casa-045")?.minha).toBe(true);
    expect(paraOcupacaoPublica(reserva("confirmada"), "casa-001")?.minha).toBe(false);
    expect(paraOcupacaoPublica(reserva("cancelada"))).toBeNull();
  });
});
