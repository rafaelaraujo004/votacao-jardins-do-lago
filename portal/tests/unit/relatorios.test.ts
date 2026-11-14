/**
 * Relatórios do síndico (sem banco): ano, limites no fuso, somas e CSV.
 */
import { describe, expect, it } from "vitest";
import {
  agregarPortaria,
  agregarReservas,
  agregarSolicitacoes,
  anoValido,
  anosDoSeletor,
  celulaCsv,
  csvFinanceiro,
  csvReservas,
  descreverDuracao,
  diaDaSemana,
  ehAssunto,
  inicioDoDia,
  limitesDoAno,
  mediaHoras,
  mesesDoAno,
  montarCsv,
  montarFinanceiro,
  nomeCategoria,
  somarCategorias,
} from "@/lib/relatorios";

const FUSO = "America/Belem";
const H = 3_600_000;

describe("ano e assunto", () => {
  it("aceita só anos entre o atual e 4 anos atrás", () => {
    expect(anoValido("2026", 2026)).toBe(2026);
    expect(anoValido("2022", 2026)).toBe(2022);
    expect(anoValido("2021", 2026)).toBe(2026);
    expect(anoValido("2027", 2026)).toBe(2026);
    expect(anoValido("abc", 2026)).toBe(2026);
    expect(anoValido(["2025"], 2026)).toBe(2026);
    expect(anosDoSeletor(2026)).toEqual([2026, 2025, 2024, 2023, 2022]);
  });

  it("reconhece os assuntos", () => {
    expect(ehAssunto("portaria")).toBe(true);
    expect(ehAssunto("pessoas")).toBe(false);
    expect(ehAssunto(undefined)).toBe(false);
  });

  it("monta os 12 meses", () => {
    const m = mesesDoAno(2026);
    expect(m).toHaveLength(12);
    expect(m[0]).toBe("2026-01");
    expect(m[11]).toBe("2026-12");
  });
});

describe("datas no fuso", () => {
  it("o ano começa às 03:00 UTC em Belém (UTC−3)", () => {
    expect(inicioDoDia("2026-01-01", FUSO).toISOString()).toBe("2026-01-01T03:00:00.000Z");
    const lim = limitesDoAno(2026, FUSO);
    expect(lim.instanteFim.toISOString()).toBe("2027-01-01T03:00:00.000Z");
    expect(lim.dataInicio).toBe("2026-01-01");
    expect(lim.mesFim).toBe("2026-12");
  });

  it("dia da semana pelo calendário", () => {
    expect(diaDaSemana("2026-11-14")).toBe(6); // sábado
    expect(diaDaSemana("2026-11-15")).toBe(0); // domingo
  });
});

describe("durações", () => {
  it("média em horas e texto simples", () => {
    expect(mediaHoras([])).toBeNull();
    expect(mediaHoras([2 * H, 4 * H])).toBe(3);
    expect(descreverDuracao(null)).toBe("—");
    expect(descreverDuracao(0.5)).toBe("30 min");
    expect(descreverDuracao(5)).toBe("5 h");
    expect(descreverDuracao(24)).toBe("1 dia");
    expect(descreverDuracao(50)).toBe("2 dias e 2 h");
  });
});

describe("financeiro", () => {
  it("completa os 12 meses e soma o ano", () => {
    const r = montarFinanceiro(2026, [
      { mes: "2026-01", receitasCentavos: 100_00, despesasCentavos: 40_00, saldoFinalCentavos: 560_00, publicado: true },
      { mes: "2026-03", receitasCentavos: 50_00, despesasCentavos: 80_00, saldoFinalCentavos: 530_00, publicado: false },
    ]);
    expect(r.linhas).toHaveLength(12);
    expect(r.linhas[1]).toMatchObject({ mes: "2026-02", receitasCentavos: 0, saldoFinalCentavos: null });
    expect(r.linhas[2].resultadoCentavos).toBe(-30_00);
    expect(r.totais).toEqual({ receitasCentavos: 150_00, despesasCentavos: 120_00, resultadoCentavos: 30_00 });
    expect(r.saldoFinalCentavos).toBe(530_00);
  });

  it("sem lançamentos: saldo nulo", () => {
    expect(montarFinanceiro(2025, []).saldoFinalCentavos).toBeNull();
  });

  it("soma categorias de vários meses e põe receitas primeiro", () => {
    const cats = somarCategorias([
      [{ nome: "Água", tipo: "despesa", totalCentavos: 10_00 }],
      [
        { nome: "Água", tipo: "despesa", totalCentavos: 15_00 },
        { nome: "Contribuições", tipo: "receita", totalCentavos: 500_00 },
      ],
    ]);
    const r = montarFinanceiro(2026, [], cats);
    expect(r.categorias[0].nome).toBe("Contribuições");
    expect(r.categorias.find((c) => c.nome === "Água")?.totalCentavos).toBe(25_00);
  });
});

describe("reservas", () => {
  it("conta por mês e por área, ignora bloqueios e tolera campo ausente", () => {
    const r = agregarReservas(2026, [
      { areaNome: "Salão", mes: "2026-02", status: "confirmada" },
      { areaNome: "Salão", mes: "2026-02", status: "cancelada", cancelamentoTardio: true },
      { areaNome: "Churrasqueira", mes: "2026-03", status: "cancelada" },
      { areaNome: "Churrasqueira", mes: "2026-03", status: "pendente" },
      { areaNome: "Salão", mes: "2026-03", status: "bloqueada" },
      { areaNome: "Salão", mes: "2025-12", status: "confirmada" },
    ]);
    expect(r.totais).toEqual({ confirmadas: 1, canceladas: 2, tardias: 1, outras: 1, total: 4 });
    expect(r.porMes[1]).toMatchObject({ mes: "2026-02", confirmadas: 1, canceladas: 1, tardias: 1 });
    expect(r.porArea.map((a) => a.area)).toEqual(["Churrasqueira", "Salão"]);
  });
});

describe("portaria", () => {
  it("entradas por dia da semana e mês; encomendas e tempo de retirada", () => {
    const r = agregarPortaria(
      2026,
      ["2026-11-14", "2026-11-14", "2026-11-15", "2025-12-31", "lixo"],
      [
        { dataRecebimento: "2026-11-10", status: "entregue", recebidoEm: new Date("2026-11-10T12:00:00Z"), entregueEm: new Date("2026-11-10T16:00:00Z") },
        { dataRecebimento: "2026-11-11", status: "entregue", recebidoEm: new Date("2026-11-11T12:00:00Z"), entregueEm: new Date("2026-11-11T14:00:00Z") },
        { dataRecebimento: "2026-11-12", status: "aguardando", recebidoEm: new Date("2026-11-12T12:00:00Z"), entregueEm: null },
      ],
    );
    expect(r.entradas.total).toBe(3);
    expect(r.entradas.porDiaSemana[6]).toBe(2);
    expect(r.entradas.porDiaSemana[0]).toBe(1);
    expect(r.entradas.porMes[10].total).toBe(3);
    expect(r.encomendas).toMatchObject({ recebidas: 3, entregues: 2, aguardando: 1, tempoMedioHoras: 3 });
  });
});

describe("solicitações", () => {
  it("abertas pelo mês de criação, resolvidas pelo mês de resolução", () => {
    const r = agregarSolicitacoes(
      2026,
      [
        { categoria: "iluminacao", status: "resolvida", criadoEm: new Date("2026-01-10T12:00:00Z"), resolvidoEm: new Date("2026-01-11T12:00:00Z") },
        // aberta em 2025, resolvida em 2026
        { categoria: "limpeza", status: "resolvida", criadoEm: new Date("2025-12-30T12:00:00Z"), resolvidoEm: new Date("2026-01-01T12:00:00Z") },
        { categoria: "", status: "em_andamento", criadoEm: new Date("2026-02-01T12:00:00Z"), resolvidoEm: null },
        { categoria: "outro", status: "cancelada", criadoEm: new Date("2026-02-02T12:00:00Z"), resolvidoEm: null },
        // 31/12 às 23h em Belém = 01/01 em UTC: ainda é dezembro no condomínio
        { categoria: "outro", status: "aberta", criadoEm: new Date("2027-01-01T02:00:00Z"), resolvidoEm: null },
      ],
      FUSO,
    );
    expect(r.totais).toEqual({ abertas: 4, resolvidas: 2, emAndamento: 2, canceladas: 1 });
    expect(r.porMes[0]).toEqual({ mes: "2026-01", abertas: 1, resolvidas: 2 });
    expect(r.porMes[11].abertas).toBe(1);
    expect(r.tempoMedioHoras).toBe(36);
    expect(r.porCategoria.map((c) => c.categoria)).toContain("Sem categoria");
  });

  it("lista vazia não quebra", () => {
    const r = agregarSolicitacoes(2026, [], FUSO);
    expect(r.totais.abertas).toBe(0);
    expect(r.tempoMedioHoras).toBeNull();
  });

  it("nomes de categoria", () => {
    expect(nomeCategoria("areas_comuns")).toBe("Áreas comuns");
    expect(nomeCategoria("vazamento-gas")).toBe("Vazamento gas");
  });
});

describe("CSV", () => {
  it("BOM, ponto e vírgula e proteção contra fórmulas", () => {
    const csv = montarCsv([["a", 1], ["=SOMA(A1)", "-1.234,56"]]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain('"a";"1"\r\n');
    expect(celulaCsv("=SOMA(A1)")).toBe(`"'=SOMA(A1)"`);
    expect(celulaCsv("-1.234,56")).toBe('"-1.234,56"');
    expect(celulaCsv('diz "oi"')).toBe('"diz ""oi"""');
  });

  it("relatórios viram planilha sem dados pessoais", () => {
    const fin = csvFinanceiro("Jardins", montarFinanceiro(2026, [{ mes: "2026-01", receitasCentavos: 123456, despesasCentavos: 0, saldoFinalCentavos: 123456, publicado: true }]));
    expect(fin).toContain('"1.234,56"');
    expect(fin.split("\r\n").length).toBeGreaterThan(15);
    const res = csvReservas("Jardins", agregarReservas(2026, [{ areaNome: "Salão", mes: "2026-01", status: "confirmada" }]));
    expect(res).toContain('"Salão";"1";"0";"0";"0";"1"');
  });
});

describe("nomeCategoria com as categorias das solicitações", () => {
  it("usa o mesmo nome do formulário (com acento)", () => {
    expect(nomeCategoria("convivencia")).toBe("Barulho / convivência");
    expect(nomeCategoria("manutencao")).toBe("Manutenção");
  });
});
