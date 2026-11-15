/** Áreas reais do Jardins do Lago (usadas pelo script de configuração e pela demonstração). */
import { describe, expect, it } from "vitest";
import { AREAS_JARDINS_DO_LAGO, problemasDasAreasJardins } from "@/lib/areas-jardins";
import { idDaFaixa } from "@/lib/reservas";

const area = (id: string) => AREAS_JARDINS_DO_LAGO.find((a) => a.id === id)!;

describe("áreas reais do Jardins do Lago", () => {
  it("tem as 4 áreas com ids fixos e faixas válidas", () => {
    expect(AREAS_JARDINS_DO_LAGO.map((a) => a.id)).toEqual(["area-de-lazer", "quadra", "rocadeira", "carrinho-de-mao"]);
    expect(problemasDasAreasJardins()).toEqual([]);
    for (const a of AREAS_JARDINS_DO_LAGO) {
      expect(a.nome.length).toBeLessThanOrEqual(60); // limite do formulário do síndico
      for (const f of a.faixas) expect(f.id).toBe(idDaFaixa(f.inicio, f.fim));
    }
  });

  it("área de lazer: dia 8h–20h, 48 h de antecedência, aprovação, desistência 24 h, 1 por dia", () => {
    const a = area("area-de-lazer");
    expect(a.faixas.map((f) => [f.inicio, f.fim])).toEqual([["08:00", "20:00"]]);
    expect(a).toMatchObject({ tipo: "area", exigeAprovacao: true, antecedenciaMinimaHoras: 48, prazoDesistenciaHoras: 24, limitePorCasaPorDia: 1, permitirExtraSeDiaLivre: false });
    expect(a.exigencias).toHaveLength(6);
    expect(a.avisos).toHaveLength(3);
  });

  it("quadra: 3 faixas de 1 h à noite, uso livre 17h–19h, sem aprovação, extra se o dia estiver livre", () => {
    const q = area("quadra");
    expect(q.faixas.map((f) => f.inicio)).toEqual(["19:00", "20:00", "21:00"]);
    expect(q.faixasLivres).toEqual([{ rotulo: "Uso livre para todos os moradores", inicio: "17:00", fim: "19:00" }]);
    expect(q).toMatchObject({ exigeAprovacao: false, antecedenciaMinimaHoras: 0, prazoDesistenciaHoras: 0, limitePorCasaPorDia: 1, permitirExtraSeDiaLivre: true });
  });

  it("equipamentos: dia inteiro 8h–20h, 24 h de antecedência e aprovação", () => {
    for (const id of ["rocadeira", "carrinho-de-mao"]) {
      const e = area(id);
      expect(e.tipo).toBe("equipamento");
      expect(e.faixas.map((f) => [f.rotulo, f.inicio, f.fim])).toEqual([["Dia inteiro", "08:00", "20:00"]]);
      expect(e).toMatchObject({ exigeAprovacao: true, antecedenciaMinimaHoras: 24, prazoDesistenciaHoras: 0, limitePorCasaPorDia: 1 });
      expect(e.avisos).toEqual([]);
    }
  });
});
