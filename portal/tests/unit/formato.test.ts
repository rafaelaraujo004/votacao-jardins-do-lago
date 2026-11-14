import { describe, expect, it } from "vitest";
import {
  dataBRParaISO,
  dataISOParaBR,
  formatarData,
  formatarDataHora,
  formatarMoeda,
  hojeISO,
  reaisParaCentavos,
} from "@/lib/formato";

const nbsp = (s: string) => s.replace(/ /g, " ");

describe("dinheiro", () => {
  it("formata centavos em reais", () => {
    expect(nbsp(formatarMoeda(123456))).toBe("R$ 1.234,56");
    expect(nbsp(formatarMoeda(5))).toBe("R$ 0,05");
  });

  it("recusa valores quebrados (dinheiro é sempre centavo inteiro)", () => {
    expect(() => formatarMoeda(10.5)).toThrow();
  });

  it("lê valores digitados no jeito brasileiro", () => {
    expect(reaisParaCentavos("1.234,56")).toBe(123456);
    expect(reaisParaCentavos("R$ 10")).toBe(1000);
    expect(reaisParaCentavos("0,5")).toBe(50);
    expect(reaisParaCentavos("12,345")).toBeNull();
    expect(reaisParaCentavos("abc")).toBeNull();
  });
});

describe("datas no fuso America/Belem", () => {
  // 11/11/2026 às 02:30 em UTC = 10/11/2026 às 23:30 em Belém
  const virada = new Date("2026-11-11T02:30:00Z");

  it("usa o dia de Belém, não o do servidor (UTC)", () => {
    expect(formatarData(virada)).toBe("10/11/2026");
    expect(hojeISO(virada)).toBe("2026-11-10");
    expect(formatarDataHora(virada)).toBe("10/11/2026 às 23:30");
  });

  it("converte entre DD/MM/AAAA e o formato do banco", () => {
    expect(dataISOParaBR("2026-03-07")).toBe("07/03/2026");
    expect(dataBRParaISO("07/03/2026")).toBe("2026-03-07");
    expect(dataBRParaISO("31/02/2026")).toBeNull();
    expect(dataBRParaISO("7/3/26")).toBeNull();
  });
});
