import { describe, expect, it } from "vitest";
import { indiceMaisProximo, variacaoDoMes } from "@/lib/grafico-saldo";

/** O Intl separa "R$" do número com espaço não separável. */
const texto = (pontos: Parameters<typeof variacaoDoMes>[0], i: number) => variacaoDoMes(pontos, i)?.texto.replace(/ /g, " ");

describe("indiceMaisProximo", () => {
  // 3 meses entre x=100 e x=300: pontos em 100, 200 e 300.
  it("acha o mês mais perto do dedo", () => {
    expect(indiceMaisProximo(100, 100, 300, 3)).toBe(0);
    expect(indiceMaisProximo(149, 100, 300, 3)).toBe(0);
    expect(indiceMaisProximo(151, 100, 300, 3)).toBe(1);
    expect(indiceMaisProximo(260, 100, 300, 3)).toBe(2);
  });

  it("fora do desenho fica no primeiro ou no último mês", () => {
    expect(indiceMaisProximo(-50, 100, 300, 3)).toBe(0);
    expect(indiceMaisProximo(999, 100, 300, 3)).toBe(2);
  });

  it("com um mês só, é sempre ele", () => {
    expect(indiceMaisProximo(250, 100, 300, 1)).toBe(0);
  });
});

describe("variacaoDoMes", () => {
  const pontos = [
    { mes: "2025-12", saldoCentavos: 250_000 },
    { mes: "2026-01", saldoCentavos: 308_100 },
    { mes: "2026-02", saldoCentavos: 349_228 },
    { mes: "2026-03", saldoCentavos: 300_000 },
    { mes: "2026-04", saldoCentavos: 300_000 },
  ];

  it("o primeiro mês não tem com o que comparar", () => {
    expect(variacaoDoMes(pontos, 0)).toBeNull();
  });

  it("subiu: diz quanto a mais e em relação a qual mês", () => {
    expect(variacaoDoMes(pontos, 2)?.centavos).toBe(41_128);
    expect(texto(pontos, 2)).toBe("R$ 411,28 a mais que em janeiro");
  });

  it("caiu: diz quanto a menos", () => {
    expect(variacaoDoMes(pontos, 3)?.centavos).toBe(-49_228);
    expect(texto(pontos, 3)).toBe("R$ 492,28 a menos que em fevereiro");
  });

  it("igual ao anterior", () => {
    expect(texto(pontos, 4)).toBe("Igual a março");
  });

  it("na virada do ano, o mês anterior leva o ano", () => {
    expect(texto(pontos, 1)).toBe("R$ 581,00 a mais que em dezembro de 2025");
  });

  it("índice fora da lista não quebra", () => {
    expect(variacaoDoMes(pontos, 9)).toBeNull();
  });
});
