/**
 * Regras das reservas (sem banco): horários, conflitos, antecedência, limite
 * e validação dos formulários.
 */
import { describe, expect, it } from "vitest";
import {
  AREAS_SUGERIDAS,
  conferirPedido,
  dataValida,
  diferencaDias,
  faixasDeUmaHora,
  idDaFaixa,
  idDaTrava,
  janelaDoMorador,
  mesAnteriorDe,
  minutosAgora,
  normalizarFaixas,
  podeCancelarMorador,
  proximoMes,
  reservasForaDasFaixas,
  situacaoDasFaixas,
  sobrepoe,
  somarDias,
  validarFaixas,
  type ConfigArea,
  type ReservaNoDia,
} from "@/lib/reservas";
import { esquemaArea, esquemaCancelar, esquemaPedido, esquemaRecusar, juntarFaixas } from "@/lib/validacao-reservas";

const area: ConfigArea = {
  id: "churrasqueira",
  nome: "Churrasqueira",
  regras: "",
  capacidade: 30,
  exigeAprovacao: true,
  antecedenciaMinDias: 1,
  antecedenciaMaxDias: 30,
  limitePorMes: 2,
  ativa: true,
  faixas: normalizarFaixas([
    { rotulo: "Noite", inicio: "17:00", fim: "23:00" },
    { rotulo: "Almoço", inicio: "10:00", fim: "16:00" },
  ]),
  ordem: 1,
};

describe("faixas de horário", () => {
  it("detecta sobreposição, mas aceita faixas que só encostam", () => {
    expect(sobrepoe({ inicio: "08:00", fim: "12:00" }, { inicio: "11:00", fim: "13:00" })).toBe(true);
    expect(sobrepoe({ inicio: "12:00", fim: "13:00" }, { inicio: "13:00", fim: "14:00" })).toBe(false);
    expect(sobrepoe({ inicio: "10:00", fim: "23:00" }, { inicio: "13:00", fim: "14:00" })).toBe(true);
  });

  it("valida a lista de faixas", () => {
    expect(validarFaixas([])).toMatch(/pelo menos uma/);
    expect(validarFaixas([{ rotulo: "Manhã", inicio: "08:00", fim: "12:00" }])).toBeNull();
    expect(validarFaixas([{ rotulo: "", inicio: "08:00", fim: "12:00" }])).toMatch(/nome/);
    expect(validarFaixas([{ rotulo: "Manhã", inicio: "8h", fim: "12:00" }])).toMatch(/inválido/);
    expect(validarFaixas([{ rotulo: "Manhã", inicio: "12:00", fim: "08:00" }])).toMatch(/depois do início/);
    expect(
      validarFaixas([
        { rotulo: "Manhã", inicio: "08:00", fim: "12:00" },
        { rotulo: "Almoço", inicio: "11:30", fim: "14:00" },
      ]),
    ).toMatch(/sobrepostos/);
    expect(
      validarFaixas([
        { rotulo: "Manhã", inicio: "08:00", fim: "12:00" },
        { rotulo: "Tarde", inicio: "12:00", fim: "18:00" },
        { rotulo: "Noite", inicio: "18:00", fim: "24:00" },
      ]),
    ).toBeNull();
  });

  it("gera ids estáveis e ordena pelo início", () => {
    expect(idDaFaixa("08:00", "12:00")).toBe("0800-1200");
    expect(area.faixas.map((f) => f.id)).toEqual(["1000-1600", "1700-2300"]);
  });

  it("faixas de 1 hora da quadra: 7h às 22h = 15 faixas sem sobreposição", () => {
    const f = faixasDeUmaHora(7, 22);
    expect(f).toHaveLength(15);
    expect(f[0]).toMatchObject({ inicio: "07:00", fim: "08:00" });
    expect(f.at(-1)).toMatchObject({ inicio: "21:00", fim: "22:00" });
    expect(validarFaixas(f)).toBeNull();
  });

  it("as áreas sugeridas são válidas e sem taxas", () => {
    for (const a of AREAS_SUGERIDAS) {
      expect(validarFaixas(a.faixas)).toBeNull();
      expect(a.antecedenciaMaxDias).toBeGreaterThanOrEqual(a.antecedenciaMinDias);
      expect(Object.keys(a).some((k) => /taxa|valor|preco/i.test(k))).toBe(false);
    }
    expect(AREAS_SUGERIDAS.find((a) => a.id === "salao-de-festas")?.exigeAprovacao).toBe(true);
    expect(AREAS_SUGERIDAS.find((a) => a.id === "quadra-poliesportiva")?.exigeAprovacao).toBe(false);
  });
});

describe("datas", () => {
  it("soma e conta dias atravessando meses e anos", () => {
    expect(somarDias("2026-11-30", 1)).toBe("2026-12-01");
    expect(somarDias("2026-12-31", 1)).toBe("2027-01-01");
    expect(somarDias("2028-02-28", 1)).toBe("2028-02-29");
    expect(diferencaDias("2026-11-14", "2026-12-14")).toBe(30);
    expect(diferencaDias("2026-11-14", "2026-11-13")).toBe(-1);
  });

  it("recusa datas que não existem", () => {
    expect(dataValida("2026-02-30")).toBe(false);
    expect(dataValida("2026-13-01")).toBe(false);
    expect(dataValida("2026-11-14")).toBe(true);
  });

  it("navega entre meses", () => {
    expect(proximoMes("2026-12")).toBe("2027-01");
    expect(mesAnteriorDe("2027-01")).toBe("2026-12");
  });

  it("hora atual no fuso do condomínio (Belém, UTC-3), não no do servidor", () => {
    // 01:30 UTC = 22:30 do dia anterior em Belém
    expect(minutosAgora(new Date("2026-11-15T01:30:00Z"), "America/Belem")).toBe(22 * 60 + 30);
  });

  it("janela do morador", () => {
    expect(janelaDoMorador(area, "2026-11-14")).toEqual({ primeiro: "2026-11-15", ultimo: "2026-12-14" });
  });
});

describe("conferirPedido", () => {
  const base = { area, faixa: area.faixas[0], hoje: "2026-11-14", agoraMinutos: 9 * 60, reservasDaCasaNoMes: 0 };

  it("aceita um pedido dentro das regras", () => {
    expect(conferirPedido({ ...base, data: "2026-11-20" })).toBeNull();
  });

  it("não reserva no passado nem horário que já começou", () => {
    expect(conferirPedido({ ...base, data: "2026-11-13" })).toMatch(/já passou/);
    expect(conferirPedido({ ...base, data: "2026-11-14", agoraMinutos: 11 * 60, peloAdmin: true })).toMatch(/já começou/);
    // às 9h, o almoço (10h) de hoje ainda não começou: a administração pode reservar
    expect(conferirPedido({ ...base, data: "2026-11-14", peloAdmin: true })).toBeNull();
  });

  it("respeita a antecedência mínima e máxima", () => {
    expect(conferirPedido({ ...base, data: "2026-11-14" })).toMatch(/1 dia de antecedência/);
    expect(conferirPedido({ ...base, data: "2026-12-14" })).toBeNull();
    expect(conferirPedido({ ...base, data: "2026-12-15" })).toMatch(/até 30 dias/);
  });

  it("respeita o limite por casa no mês", () => {
    expect(conferirPedido({ ...base, data: "2026-11-20", reservasDaCasaNoMes: 1 })).toBeNull();
    expect(conferirPedido({ ...base, data: "2026-11-20", reservasDaCasaNoMes: 2 })).toMatch(/limite é 2/);
    expect(conferirPedido({ ...base, area: { ...area, limitePorMes: 0 }, data: "2026-11-20", reservasDaCasaNoMes: 50 })).toBeNull();
  });

  it("área inativa não recebe pedidos (nem da administração)", () => {
    expect(conferirPedido({ ...base, area: { ...area, ativa: false }, data: "2026-11-20", peloAdmin: true })).toMatch(/não está recebendo/);
  });

  it("a administração ignora antecedência e limite", () => {
    expect(conferirPedido({ ...base, data: "2027-06-01", reservasDaCasaNoMes: 9, peloAdmin: true })).toBeNull();
  });
});

describe("situação das faixas no dia", () => {
  const r = (id: string, faixaId: string, inicio: string, fim: string, status: ReservaNoDia["status"]): ReservaNoDia => ({
    id,
    faixaId,
    inicio,
    fim,
    status,
  });

  it("livre, pendente, confirmada e bloqueada; recusadas e canceladas liberam", () => {
    const quadra = faixasDeUmaHora(7, 10);
    const s = situacaoDasFaixas(quadra, [
      r("a", "0700-0800", "07:00", "08:00", "confirmada"),
      r("b", "0800-0900", "08:00", "09:00", "cancelada"),
      r("c", "0800-0900", "08:00", "09:00", "pendente"),
      r("d", "0900-1000", "09:00", "10:00", "recusada"),
    ]);
    expect(s.map((x) => x.estado)).toEqual(["confirmada", "pendente", "livre"]);
    expect(s[1].reserva?.id).toBe("c");
  });

  it("reserva antiga com horário diferente ainda ocupa as faixas novas sobrepostas", () => {
    const novas = normalizarFaixas([
      { rotulo: "Manhã", inicio: "10:00", fim: "14:00" },
      { rotulo: "Tarde", inicio: "14:00", fim: "18:00" },
      { rotulo: "Noite", inicio: "18:00", fim: "23:00" },
    ]);
    const antiga = r("x", "1000-2300", "10:00", "23:00", "bloqueada");
    expect(situacaoDasFaixas(novas, [antiga]).every((s) => s.estado === "bloqueada")).toBe(true);
    expect(reservasForaDasFaixas(novas, [antiga])).toHaveLength(0);
    expect(reservasForaDasFaixas(novas, [r("y", "0600-0800", "06:00", "08:00", "confirmada")])).toHaveLength(1);
  });

  it("trava com id fixo por área, data e faixa", () => {
    expect(idDaTrava("churrasqueira", "2026-11-20", "1000-1600")).toBe("churrasqueira_2026-11-20_1000-1600");
  });
});

describe("cancelamento pelo morador", () => {
  it("só reservas ativas que ainda não começaram", () => {
    const futura = { status: "confirmada" as const, data: "2026-11-20", inicio: "10:00" };
    expect(podeCancelarMorador(futura, "2026-11-14", 600)).toBe(true);
    expect(podeCancelarMorador({ ...futura, data: "2026-11-14" }, "2026-11-14", 9 * 60)).toBe(true);
    expect(podeCancelarMorador({ ...futura, data: "2026-11-14" }, "2026-11-14", 10 * 60)).toBe(false);
    expect(podeCancelarMorador({ ...futura, data: "2026-11-13" }, "2026-11-14", 0)).toBe(false);
    expect(podeCancelarMorador({ ...futura, status: "bloqueada" }, "2026-11-14", 0)).toBe(false);
    expect(podeCancelarMorador({ ...futura, status: "recusada" }, "2026-11-14", 0)).toBe(false);
  });
});

describe("validação dos formulários", () => {
  const formArea = {
    nome: "Salão de festas",
    regras: "Som baixo depois das 22h.",
    capacidade: "80",
    exigeAprovacao: "sim",
    antecedenciaMinDias: "3",
    antecedenciaMaxDias: "90",
    limitePorMes: "1",
    ativa: "sim",
    ordem: "1",
    faixaRotulo: ["Noite", "Manhã", ""],
    faixaInicio: ["18:00", "08:00", ""],
    faixaFim: ["23:00", "12:00", ""],
  };

  it("área válida: ignora linhas em branco e ordena as faixas", () => {
    const r = esquemaArea.safeParse(formArea);
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.id).toBeNull();
    expect(r.data.exigeAprovacao).toBe(true);
    expect(r.data.capacidade).toBe(80);
    expect(r.data.faixas.map((f) => f.rotulo)).toEqual(["Manhã", "Noite"]);
  });

  it("aceita uma faixa só (campo não repetido)", () => {
    const r = esquemaArea.safeParse({ ...formArea, faixaRotulo: "Dia inteiro", faixaInicio: "10:00", faixaFim: "23:00" });
    expect(r.success).toBe(true);
  });

  it("recusa faixas sobrepostas e antecedência invertida", () => {
    const sobre = esquemaArea.safeParse({ ...formArea, faixaInicio: ["11:00", "08:00", ""] });
    expect(sobre.success).toBe(false);
    expect(sobre.error?.issues[0]?.message).toMatch(/sobrepostos/);
    const inv = esquemaArea.safeParse({ ...formArea, antecedenciaMinDias: "10", antecedenciaMaxDias: "5" });
    expect(inv.error?.issues[0]?.message).toMatch(/maior ou igual/);
  });

  it("recusa números inválidos e id com caminho", () => {
    expect(esquemaArea.safeParse({ ...formArea, capacidade: "-3" }).success).toBe(false);
    expect(esquemaArea.safeParse({ ...formArea, capacidade: "0" }).success).toBe(false);
    expect(esquemaArea.safeParse({ ...formArea, id: "../outro" }).success).toBe(false);
  });

  it("junta as listas de faixas sem perder a ordem", () => {
    expect(juntarFaixas(["A", ""], ["08:00", ""], ["09:00", ""])).toEqual([{ rotulo: "A", inicio: "08:00", fim: "09:00" }]);
  });

  it("pedido: data real, faixa no formato certo e observação limitada", () => {
    expect(esquemaPedido.safeParse({ areaId: "salao", data: "2026-11-20", faixaId: "1000-2300" }).success).toBe(true);
    expect(esquemaPedido.safeParse({ areaId: "salao", data: "2026-02-30", faixaId: "1000-2300" }).success).toBe(false);
    expect(esquemaPedido.safeParse({ areaId: "salao", data: "2026-11-20", faixaId: "x" }).success).toBe(false);
    expect(esquemaPedido.safeParse({ areaId: "salao", data: "2026-11-20", faixaId: "1000-2300", observacao: "a".repeat(301) }).success).toBe(false);
  });

  it("recusar exige motivo; cancelar aceita sem motivo (o servidor exige da administração)", () => {
    expect(esquemaRecusar.safeParse({ id: "abc", motivo: "" }).success).toBe(false);
    expect(esquemaRecusar.safeParse({ id: "abc", motivo: "Data do condomínio" }).success).toBe(true);
    expect(esquemaCancelar.safeParse({ id: "abc" }).success).toBe(true);
  });
});
