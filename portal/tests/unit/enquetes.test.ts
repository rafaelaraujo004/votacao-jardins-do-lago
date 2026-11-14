/**
 * Regras das enquetes (sem banco): situação, resultado, opções, datas e formulários.
 */
import { describe, expect, it } from "vitest";
import {
  calcularResultado,
  casas,
  dataHoraLocalParaDate,
  dateParaDataHoraLocal,
  diaMes,
  montarOpcoes,
  participacao,
  resultadoVisivelParaMorador,
  situacaoEnquete,
  vencedoras,
} from "@/lib/enquetes";
import { esquemaEnquete, esquemaIdEnquete, esquemaVoto } from "@/lib/validacao-enquetes";

const FUSO = "America/Belem";
const abre = new Date("2026-11-10T12:00:00Z");
const fecha = new Date("2026-11-20T23:00:00Z");

describe("situacaoEnquete", () => {
  it("rascunho é sempre rascunho, mesmo dentro do prazo", () => {
    expect(situacaoEnquete({ status: "rascunho", abreEm: abre, fechaEm: fecha }, new Date("2026-11-15T00:00:00Z"))).toBe("rascunho");
  });
  it("publicada antes de abrir fica agendada", () => {
    expect(situacaoEnquete({ status: "aberta", abreEm: abre, fechaEm: fecha }, new Date("2026-11-09T00:00:00Z"))).toBe("agendada");
  });
  it("dentro do prazo fica aberta (abre no minuto exato)", () => {
    expect(situacaoEnquete({ status: "aberta", abreEm: abre, fechaEm: fecha }, abre)).toBe("aberta");
  });
  it("passou do prazo: encerrada sozinha, no minuto exato", () => {
    expect(situacaoEnquete({ status: "aberta", abreEm: abre, fechaEm: fecha }, fecha)).toBe("encerrada");
  });
  it("encerrada pelo síndico antes do prazo", () => {
    expect(situacaoEnquete({ status: "encerrada", abreEm: abre, fechaEm: fecha }, new Date("2026-11-12T00:00:00Z"))).toBe("encerrada");
  });
});

describe("resultadoVisivelParaMorador", () => {
  it("'sempre' mostra a parcial", () => {
    expect(resultadoVisivelParaMorador("sempre", "aberta")).toBe(true);
    expect(resultadoVisivelParaMorador("sempre", "agendada")).toBe(true);
  });
  it("'após encerrar' esconde até encerrar", () => {
    expect(resultadoVisivelParaMorador("apos_encerrar", "aberta")).toBe(false);
    expect(resultadoVisivelParaMorador("apos_encerrar", "encerrada")).toBe(true);
  });
  it("rascunho nunca mostra", () => {
    expect(resultadoVisivelParaMorador("sempre", "rascunho")).toBe(false);
  });
});

describe("calcularResultado", () => {
  const opcoes = [
    { id: "o1", texto: "A" },
    { id: "o2", texto: "B" },
    { id: "o3", texto: "C" },
  ];
  it("porcentagens inteiras que somam 100", () => {
    const { linhas, total } = calcularResultado(opcoes, { o1: 1, o2: 1, o3: 1 });
    expect(total).toBe(3);
    expect(linhas.reduce((s, l) => s + l.porcentagem, 0)).toBe(100);
    expect(linhas.map((l) => l.porcentagem)).toEqual([34, 33, 33]);
  });
  it("sem votos: tudo zero", () => {
    const { linhas, total } = calcularResultado(opcoes, {});
    expect(total).toBe(0);
    expect(linhas.every((l) => l.porcentagem === 0 && l.votos === 0)).toBe(true);
  });
  it("ignora lixo e opções que não existem mais", () => {
    const { linhas, total } = calcularResultado(opcoes, { o1: 3, o2: -5, o3: Number.NaN, o9: 10 });
    expect(total).toBe(3);
    expect(linhas[0]).toMatchObject({ votos: 3, porcentagem: 100 });
  });
  it("vencedoras: uma, empate ou nenhuma", () => {
    expect(vencedoras(calcularResultado(opcoes, { o1: 2, o2: 1 }).linhas)).toEqual(["o1"]);
    expect(vencedoras(calcularResultado(opcoes, { o1: 2, o3: 2 }).linhas)).toEqual(["o1", "o3"]);
    expect(vencedoras(calcularResultado(opcoes, {}).linhas)).toEqual([]);
  });
});

describe("montarOpcoes", () => {
  it("limpa espaços, tira vazias e numera", () => {
    expect(montarOpcoes(["  Sim ", "", "Não  sei"])).toEqual([
      { id: "o1", texto: "Sim" },
      { id: "o2", texto: "Não sei" },
    ]);
  });
  it("precisa de 2 a 8", () => {
    expect(typeof montarOpcoes(["Só uma"])).toBe("string");
    expect(typeof montarOpcoes(Array.from({ length: 9 }, (_, i) => `Opção ${i}`))).toBe("string");
  });
  it("não aceita repetida (sem diferença de maiúscula)", () => {
    expect(montarOpcoes(["Sim", "SIM"])).toMatch(/repetida/);
  });
});

describe("datas no fuso do condomínio", () => {
  it("18:00 em Belém = 21:00 UTC", () => {
    expect(dataHoraLocalParaDate("2026-11-20T18:00", FUSO)?.toISOString()).toBe("2026-11-20T21:00:00.000Z");
  });
  it("ida e volta", () => {
    const d = dataHoraLocalParaDate("2026-12-31T23:30", FUSO)!;
    expect(dateParaDataHoraLocal(d, FUSO)).toBe("2026-12-31T23:30");
  });
  it("data que não existe vira null", () => {
    expect(dataHoraLocalParaDate("2026-02-31T10:00", FUSO)).toBeNull();
    expect(dataHoraLocalParaDate("2026-02-10T25:00", FUSO)).toBeNull();
    expect(dataHoraLocalParaDate("10/02/2026 10:00", FUSO)).toBeNull();
  });
  it("funciona com fuso que tem horário de verão (Nova York)", () => {
    expect(dataHoraLocalParaDate("2026-07-01T12:00", "America/New_York")?.toISOString()).toBe("2026-07-01T16:00:00.000Z");
    expect(dataHoraLocalParaDate("2026-01-01T12:00", "America/New_York")?.toISOString()).toBe("2026-01-01T17:00:00.000Z");
  });
  it("dd/mm no fuso: 01:00 UTC ainda é o dia anterior em Belém", () => {
    expect(diaMes(new Date("2026-11-13T01:00:00Z"), FUSO)).toBe("12/11");
  });
});

describe("textos", () => {
  it("casas e participação", () => {
    expect(casas(1)).toBe("1 casa");
    expect(casas(3)).toBe("3 casas");
    expect(participacao(1, 3)).toBe(33);
    expect(participacao(5, 0)).toBe(0);
    expect(participacao(9, 4)).toBe(100);
  });
});

describe("esquemaEnquete", () => {
  const base = {
    pergunta: "Qual a melhor data?",
    descricao: "",
    opcao: ["Sábado", "Domingo", ""],
    abreEm: "2026-11-15T08:00",
    fechaEm: "2026-11-22T20:00",
    resultado: "apos_encerrar",
  };
  it("aceita e monta as opções", () => {
    const r = esquemaEnquete.parse(base);
    expect(r.id).toBeNull();
    expect(r.opcoes).toHaveLength(2);
  });
  it("uma opção só (campo único) é recusada", () => {
    expect(esquemaEnquete.safeParse({ ...base, opcao: "Sábado" }).success).toBe(false);
  });
  it("fechar antes de abrir é recusado", () => {
    const r = esquemaEnquete.safeParse({ ...base, fechaEm: "2026-11-15T07:00" });
    expect(r.success).toBe(false);
  });
  it("regra de resultado inválida é recusada", () => {
    expect(esquemaEnquete.safeParse({ ...base, resultado: "nunca" }).success).toBe(false);
  });
  it("id com caminho perigoso é recusado", () => {
    expect(esquemaEnquete.safeParse({ ...base, id: "../x" }).success).toBe(false);
  });
});

describe("esquemaVoto e esquemaIdEnquete", () => {
  it("aceita opção o1..o8", () => {
    expect(esquemaVoto.safeParse({ id: "abc", opcaoId: "o8" }).success).toBe(true);
  });
  it("recusa opção fora da lista e sem escolha", () => {
    expect(esquemaVoto.safeParse({ id: "abc", opcaoId: "o9" }).success).toBe(false);
    expect(esquemaVoto.safeParse({ id: "abc" }).success).toBe(false);
  });
  it("não aceita casa vinda do formulário (campo ignorado)", () => {
    const r = esquemaVoto.parse({ id: "abc", opcaoId: "o1", unitId: "outra-casa" });
    expect(r).toEqual({ id: "abc", opcaoId: "o1" });
  });
  it("id inválido", () => {
    expect(esquemaIdEnquete.safeParse({ id: "a/b" }).success).toBe(false);
  });
});
