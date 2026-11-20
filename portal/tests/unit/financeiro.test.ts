import { describe, expect, it } from "vitest";
import {
  agruparPorCategoria,
  calcularSaldos,
  dataPadraoDoLancamento,
  lerQuadroCasas,
  pontosDoSaldo,
  type TipoLancamento,
} from "@/lib/financeiro";
import { esquemaNovaCategoria, esquemaQuadroCasas, idDaCategoria } from "@/lib/validacao-financeiro";

type L = { id: string; tipo: TipoLancamento; categoriaId: string; categoriaNome: string; valorCentavos: number };
const l = (id: string, tipo: TipoLancamento, categoriaId: string, valorCentavos: number): L => ({
  id,
  tipo,
  categoriaId,
  categoriaNome: categoriaId === "despesas-ordinarias" ? "Despesas ordinárias" : categoriaId === "despesas-extraordinarias" ? "Despesas extraordinárias" : categoriaId,
  valorCentavos,
});

describe("lançamentos agrupados como o relatório em papel", () => {
  // As telas recebem do mais novo para o mais antigo: o último da lista foi o 1º lançado.
  const maisNovosPrimeiro = [
    l("e2", "despesa", "despesas-extraordinarias", 1_200_00),
    l("o2", "despesa", "despesas-ordinarias", 2_000_00),
    l("e1", "despesa", "despesas-extraordinarias", 100_00),
    l("r1", "receita", "contribuicoes", 10_000_00),
    l("o1", "despesa", "despesas-ordinarias", 500_00),
  ];

  it("receitas primeiro, depois ordinárias e extraordinárias, com subtotal", () => {
    const g = agruparPorCategoria(maisNovosPrimeiro);
    expect(g.map((x) => x.categoriaId)).toEqual(["contribuicoes", "despesas-ordinarias", "despesas-extraordinarias"]);
    expect(g.map((x) => x.totalCentavos)).toEqual([10_000_00, 2_500_00, 1_300_00]);
  });

  it("dentro do grupo, na ordem em que foram lançados (Nº 1, 2…)", () => {
    const g = agruparPorCategoria(maisNovosPrimeiro);
    expect(g[1].itens.map((x) => x.id)).toEqual(["o1", "o2"]);
    expect(g[2].itens.map((x) => x.id)).toEqual(["e1", "e2"]);
  });

  it("estorno (valor negativo) desconta do subtotal", () => {
    const g = agruparPorCategoria([l("x", "despesa", "despesas-ordinarias", -500_00), ...maisNovosPrimeiro]);
    expect(g.find((x) => x.categoriaId === "despesas-ordinarias")?.totalCentavos).toBe(2_000_00);
  });

  it("categoria criada pela administração entra depois das conhecidas, ou na ordem informada", () => {
    const lista = [l("n", "despesa", "fundo-de-obras", 100), l("o", "despesa", "despesas-ordinarias", 100)];
    expect(agruparPorCategoria(lista).map((x) => x.categoriaId)).toEqual(["despesas-ordinarias", "fundo-de-obras"]);
    const ordem = new Map([["fundo-de-obras", 1], ["despesas-ordinarias", 4]]);
    expect(agruparPorCategoria(lista, ordem).map((x) => x.categoriaId)).toEqual(["fundo-de-obras", "despesas-ordinarias"]);
  });
});

describe("quadro de casas", () => {
  it("lê os números gravados e ignora o que não é número inteiro", () => {
    expect(lerQuadroCasas({ total: 100, pagas: 90, isentas: "4", inadimplentes: -1, observacao: "ref. mês anterior" })).toEqual({
      total: 100,
      pagas: 90,
      pagasSemExtra: null,
      acordos: null,
      isentas: null,
      inadimplentes: null,
      boletosVencidos: null,
      observacao: "ref. mês anterior",
    });
  });

  it("sem nenhum dado → null (não mostra o quadro)", () => {
    expect(lerQuadroCasas(undefined)).toBeNull();
    expect(lerQuadroCasas({ total: null, observacao: "" })).toBeNull();
  });

  const formulario = { mes: "2026-10", total: "100", pagas: "90", pagasSemExtra: "3", acordos: "", isentas: "4", inadimplentes: "20", boletosVencidos: "", observacao: "" };

  it("aceita campos em branco (não informado) e ponto de milhar", () => {
    const r = esquemaQuadroCasas.parse({ ...formulario, total: "1.220" });
    expect(r.total).toBe(1220);
    expect(r.boletosVencidos).toBeNull();
  });

  it("recusa número que passa do total de casas e texto que não é número", () => {
    expect(esquemaQuadroCasas.safeParse({ ...formulario, inadimplentes: "300" }).success).toBe(false);
    expect(esquemaQuadroCasas.safeParse({ ...formulario, pagas: "cento e noventa" }).success).toBe(false);
    expect(esquemaQuadroCasas.safeParse({ ...formulario, mes: "2026-13" }).success).toBe(false);
  });
});

describe("gráfico do saldo", () => {
  const meses = calcularSaldos(
    [{ mes: "2026-10", receitasCentavos: 10_000_00, despesasCentavos: 9_000_00, publicado: true, quantidade: 3 }],
    1_000_00,
  );

  it("com um mês só, começa no saldo do mês anterior (o gráfico já aparece)", () => {
    expect(pontosDoSaldo(meses)).toEqual([
      { mes: "2026-09", saldoCentavos: 1_000_00 },
      { mes: "2026-10", saldoCentavos: 2_000_00 },
    ]);
  });

  it("com vários meses, só os meses de verdade (no máximo os últimos N)", () => {
    const tres = calcularSaldos(
      ["2026-10", "2026-11", "2026-12"].map((mes) => ({ mes, receitasCentavos: 100, despesasCentavos: 0, publicado: true, quantidade: 1 })),
      0,
    );
    expect(pontosDoSaldo(tres, 2).map((p) => p.mes)).toEqual(["2026-11", "2026-12"]);
    expect(pontosDoSaldo([])).toEqual([]);
  });
});

describe("data padrão do novo lançamento", () => {
  it("lançando um mês que já passou: 1º dia daquele mês", () => {
    expect(dataPadraoDoLancamento("2026-10", "2026-11-03", "2026-10")).toBe("2026-10-01");
  });
  it("mês atual, sem mês, inválido ou antes do início da prestação: hoje", () => {
    expect(dataPadraoDoLancamento("2026-11", "2026-11-03", "2026-10")).toBe("2026-11-03");
    expect(dataPadraoDoLancamento(null, "2026-11-03", null)).toBe("2026-11-03");
    expect(dataPadraoDoLancamento("2026-1", "2026-11-03", null)).toBe("2026-11-03");
    expect(dataPadraoDoLancamento("2026-09", "2026-11-03", "2026-10")).toBe("2026-11-03");
  });
});

describe("categorias", () => {
  it("o nome vira um identificador simples", () => {
    expect(idDaCategoria("Fundo de reserva / obras")).toBe("fundo-de-reserva-obras");
    expect(idDaCategoria("  Água & Esgoto ")).toBe("agua-esgoto");
  });
  it("nome entre 3 e 40 letras e tipo entrada/saída", () => {
    expect(esquemaNovaCategoria.safeParse({ nome: "Fundo de obras", tipo: "despesa" }).success).toBe(true);
    expect(esquemaNovaCategoria.safeParse({ nome: "ab", tipo: "despesa" }).success).toBe(false);
    expect(esquemaNovaCategoria.safeParse({ nome: "Fundo", tipo: "outro" }).success).toBe(false);
  });
});
