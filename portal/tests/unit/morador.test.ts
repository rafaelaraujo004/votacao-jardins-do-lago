/**
 * Área do morador (sem banco): filtros de privacidade (LGPD).
 * Mesmo logado, um morador não vê dados de outras casas.
 */
import { describe, expect, it } from "vitest";
import { eventoSemCasaDaReserva, paraLancamentoDoMorador, paraOcupacaoSemCasa } from "@/server/dados/morador";
import { paraReserva } from "@/server/dados/reservas";

describe("privacidade dos lançamentos vistos pelo morador", () => {
  it("nunca devolve quem lançou, uid ou casa", () => {
    const l = paraLancamentoDoMorador("e1", {
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
    const l = paraLancamentoDoMorador("e2", { valorCentavos: "abc", forma: 7 });
    expect(l.valorCentavos).toBe(0);
    expect(l.forma).toBe("outro");
    expect(l.tipo).toBe("despesa");
  });
});

describe("agenda do morador sem as casas dos outros", () => {
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
    const e = eventoSemCasaDaReserva(reserva("confirmada"));
    expect(e?.titulo).toBe("Salão de festas reservado");
    const texto = JSON.stringify(e);
    expect(texto).not.toContain("45");
    expect(texto).not.toContain("Maria");
  });

  it("pedidos pendentes, recusados e cancelados não viram evento", () => {
    expect(eventoSemCasaDaReserva(reserva("pendente"))).toBeNull();
    expect(eventoSemCasaDaReserva(reserva("recusada"))).toBeNull();
    expect(eventoSemCasaDaReserva(reserva("cancelada"))).toBeNull();
    expect(eventoSemCasaDaReserva(reserva("bloqueada", null))?.titulo).toBe("Salão de festas: fechado");
  });

  it("ocupação não traz a casa; 'minha' só para a casa identificada", () => {
    const o = paraOcupacaoSemCasa(reserva("confirmada"));
    expect(o).toEqual({ data: "2026-11-20", faixaId: "f1", inicio: "14:00", fim: "22:00", status: "confirmada", minha: false });
    expect(paraOcupacaoSemCasa(reserva("confirmada"), "casa-045")?.minha).toBe(true);
    expect(paraOcupacaoSemCasa(reserva("confirmada"), "casa-001")?.minha).toBe(false);
    expect(paraOcupacaoSemCasa(reserva("cancelada"))).toBeNull();
  });
});
