/**
 * Regras das reservas (sem banco): horários, conflitos, antecedência, limite
 * e validação dos formulários.
 */
import { describe, expect, it } from "vitest";
import {
  AREAS_SUGERIDAS,
  antecedenciaEmHoras,
  avisoDesistenciaTardia,
  conferirPedido,
  contarNoDia,
  desistenciaForaDoPrazo,
  minutosAteInicio,
  problemaDoLimiteDoDia,
  textoHoras,
  validarFaixasLivres,
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
  tipo: "area",
  nome: "Churrasqueira",
  regras: "",
  capacidade: 30,
  exigeAprovacao: true,
  antecedenciaMinimaHoras: 24,
  antecedenciaMaxDias: 30,
  prazoDesistenciaHoras: 48,
  limitePorMes: 2,
  limitePorCasaPorDia: null,
  permitirExtraSeDiaLivre: false,
  exigencias: [],
  avisos: [],
  faixasLivres: [],
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
      expect(a.antecedenciaMaxDias * 24).toBeGreaterThanOrEqual(a.antecedenciaMinimaHoras);
      expect(validarFaixasLivres(a.faixasLivres, a.faixas)).toBeNull();
      expect(Object.keys(a).some((k) => /taxa|valor|preco/i.test(k))).toBe(false);
    }
    expect(AREAS_SUGERIDAS.find((a) => a.id === "salao-de-festas")?.exigeAprovacao).toBe(true);
    expect(AREAS_SUGERIDAS.find((a) => a.id === "quadra-poliesportiva")?.exigeAprovacao).toBe(false);
    expect(AREAS_SUGERIDAS.some((a) => a.tipo === "equipamento")).toBe(true);
  });

  it("uso livre não pode coincidir com faixa reservável nem se sobrepor", () => {
    const faixas = [{ rotulo: "Noite", inicio: "18:00", fim: "23:00" }];
    expect(validarFaixasLivres([], faixas)).toBeNull();
    expect(validarFaixasLivres([{ rotulo: "Manhã", inicio: "08:00", fim: "12:00" }], faixas)).toBeNull();
    expect(validarFaixasLivres([{ rotulo: "Tarde", inicio: "14:00", fim: "19:00" }], faixas)).toMatch(/coincide/);
    expect(
      validarFaixasLivres(
        [
          { rotulo: "A", inicio: "08:00", fim: "12:00" },
          { rotulo: "B", inicio: "11:00", fim: "13:00" },
        ],
        faixas,
      ),
    ).toMatch(/sobrepostos/);
    expect(validarFaixasLivres([{ rotulo: "", inicio: "08:00", fim: "12:00" }], faixas)).toMatch(/nome/);
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

  it("janela do morador (antecedência em horas, contando a hora de agora)", () => {
    expect(janelaDoMorador(area, "2026-11-14")).toEqual({ primeiro: "2026-11-15", ultimo: "2026-12-14" });
    // 24h a partir das 10h de hoje: o primeiro dia possível é amanhã
    expect(janelaDoMorador(area, "2026-11-14", 10 * 60).primeiro).toBe("2026-11-15");
    // 72h (salão) às 23h: 3 dias e 23h à frente → o primeiro dia é daqui a 3 dias (só os horários depois das 23h)
    expect(janelaDoMorador({ ...area, antecedenciaMinimaHoras: 72 }, "2026-11-14", 23 * 60).primeiro).toBe("2026-11-17");
    expect(janelaDoMorador({ ...area, antecedenciaMinimaHoras: 0 }, "2026-11-14", 23 * 60).primeiro).toBe("2026-11-14");
  });

  it("minutos até o início, atravessando dias", () => {
    expect(minutosAteInicio({ data: "2026-11-15", inicio: "10:00" }, "2026-11-14", 9 * 60)).toBe(25 * 60);
    expect(minutosAteInicio({ data: "2026-11-14", inicio: "08:00" }, "2026-11-14", 9 * 60)).toBe(-60);
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

  it("respeita a antecedência mínima (em horas) e máxima", () => {
    expect(conferirPedido({ ...base, data: "2026-11-14" })).toMatch(/24 horas \(1 dia\) de antecedência/);
    // amanhã às 10h, agora 9h: faltam 25h ≥ 24h → pode
    expect(conferirPedido({ ...base, data: "2026-11-15" })).toBeNull();
    // amanhã às 10h, agora 11h: faltam 23h < 24h → não pode
    expect(conferirPedido({ ...base, data: "2026-11-15", agoraMinutos: 11 * 60 })).toMatch(/antecedência/);
    // 0h de antecedência: pode até o horário começar
    expect(conferirPedido({ ...base, area: { ...area, antecedenciaMinimaHoras: 0 }, data: "2026-11-14" })).toBeNull();
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

  it("limite por casa no dia, com extra quando o dia está livre", () => {
    const limitada = { ...area, limitePorCasaPorDia: 1 };
    expect(conferirPedido({ ...base, area: limitada, data: "2026-11-20", reservasDaCasaNoDia: 0 })).toBeNull();
    expect(conferirPedido({ ...base, area: limitada, data: "2026-11-20", reservasDaCasaNoDia: 1 })).toMatch(/1 por dia/);
    const comExtra = { ...limitada, permitirExtraSeDiaLivre: true };
    // nenhuma outra casa reservou o dia: pode passar do limite
    expect(conferirPedido({ ...base, area: comExtra, data: "2026-11-20", reservasDaCasaNoDia: 1, outrasCasasNoDia: 0 })).toBeNull();
    expect(conferirPedido({ ...base, area: comExtra, data: "2026-11-20", reservasDaCasaNoDia: 3, outrasCasasNoDia: 0 })).toBeNull();
    // outra casa reservou: volta a valer o limite
    expect(conferirPedido({ ...base, area: comExtra, data: "2026-11-20", reservasDaCasaNoDia: 1, outrasCasasNoDia: 1 })).toMatch(
      /Outra casa já reservou/,
    );
    // sem limite por dia
    expect(problemaDoLimiteDoDia({ limitePorCasaPorDia: null, permitirExtraSeDiaLivre: false }, 10, 10)).toBeNull();
    expect(problemaDoLimiteDoDia({ limitePorCasaPorDia: 2, permitirExtraSeDiaLivre: false }, 2, 0)).toMatch(/limite é 2 por dia/);
  });

  it("conta as reservas do dia: só pendentes e confirmadas; bloqueio não é casa", () => {
    expect(
      contarNoDia([
        { status: "confirmada", minha: true },
        { status: "pendente", minha: false },
        { status: "bloqueada", minha: false },
        { status: "cancelada", minha: false },
        { status: "recusada", minha: true },
      ]),
    ).toEqual({ daCasa: 1, outrasCasas: 1 });
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

describe("antecedência: migração do campo antigo em dias", () => {
  it("usa horas quando existe; senão converte dias × 24; padrão 24h", () => {
    expect(antecedenciaEmHoras({ antecedenciaMinimaHoras: 6, antecedenciaMinDias: 3 })).toBe(6);
    expect(antecedenciaEmHoras({ antecedenciaMinDias: 3 })).toBe(72);
    expect(antecedenciaEmHoras({ antecedenciaMinimaHoras: 0 })).toBe(0);
    expect(antecedenciaEmHoras({})).toBe(24);
    expect(antecedenciaEmHoras(undefined)).toBe(24);
    expect(antecedenciaEmHoras({ antecedenciaMinimaHoras: "12", antecedenciaMinDias: 1 })).toBe(24);
  });

  it("texto das horas", () => {
    expect(textoHoras(1)).toBe("1 hora");
    expect(textoHoras(12)).toBe("12 horas");
    expect(textoHoras(24)).toBe("24 horas (1 dia)");
    expect(textoHoras(72)).toBe("72 horas (3 dias)");
  });
});

describe("prazo de desistência", () => {
  const confirmada = { status: "confirmada" as const, data: "2026-11-16", inicio: "10:00" };

  it("fora do prazo quando falta menos que o prazo para começar", () => {
    // agora: 14/11 às 9h; começa 16/11 às 10h → faltam 49h
    expect(desistenciaForaDoPrazo(confirmada, 48, "2026-11-14", 9 * 60)).toBe(false);
    expect(desistenciaForaDoPrazo(confirmada, 72, "2026-11-14", 9 * 60)).toBe(true);
    expect(desistenciaForaDoPrazo(confirmada, 49, "2026-11-14", 9 * 60)).toBe(false);
  });

  it("sem prazo ou pedido ainda pendente: nunca fica fora do prazo", () => {
    expect(desistenciaForaDoPrazo(confirmada, 0, "2026-11-16", 9 * 60)).toBe(false);
    expect(desistenciaForaDoPrazo({ ...confirmada, status: "pendente" }, 72, "2026-11-16", 9 * 60)).toBe(false);
  });

  it("texto da confirmação", () => {
    expect(avisoDesistenciaTardia(48)).toBe("Desistência fora do prazo de 48 horas (2 dias): sujeita a multa conforme o regimento.");
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
    antecedenciaMinimaHoras: "72",
    antecedenciaMaxDias: "90",
    prazoDesistenciaHoras: "48",
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
    expect(r.data.tipo).toBe("area");
    expect(r.data.antecedenciaMinimaHoras).toBe(72);
    expect(r.data.prazoDesistenciaHoras).toBe(48);
    expect(r.data.limitePorCasaPorDia).toBeNull();
    expect(r.data.permitirExtraSeDiaLivre).toBe(false);
    expect(r.data.exigencias).toEqual([]);
    expect(r.data.faixasLivres).toEqual([]);
  });

  it("campos novos: limite por dia, extra, exigências, avisos e uso livre", () => {
    const r = esquemaArea.safeParse({
      ...formArea,
      tipo: "equipamento",
      capacidade: "50",
      limitePorCasaPorDia: "1",
      permitirExtraSeDiaLivre: "sim",
      exigencia: ["  Usar óculos de proteção ", "", "Devolver limpa"],
      aviso: "Combustível por conta de quem reserva",
      livreRotulo: ["Tarde livre", ""],
      livreInicio: ["13:00", ""],
      livreFim: ["17:00", ""],
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.tipo).toBe("equipamento");
    expect(r.data.capacidade).toBe(1); // equipamento não tem capacidade de pessoas
    expect(r.data.limitePorCasaPorDia).toBe(1);
    expect(r.data.permitirExtraSeDiaLivre).toBe(true);
    expect(r.data.exigencias).toEqual(["Usar óculos de proteção", "Devolver limpa"]);
    expect(r.data.avisos).toEqual(["Combustível por conta de quem reserva"]);
    expect(r.data.faixasLivres).toEqual([{ rotulo: "Tarde livre", inicio: "13:00", fim: "17:00" }]);
  });

  it("sem limite por dia, a opção de passar do limite fica desligada", () => {
    const r = esquemaArea.safeParse({ ...formArea, limitePorCasaPorDia: "", permitirExtraSeDiaLivre: "sim" });
    expect(r.success && r.data.permitirExtraSeDiaLivre).toBe(false);
    expect(esquemaArea.safeParse({ ...formArea, limitePorCasaPorDia: "abc" }).success).toBe(false);
  });

  it("uso livre que coincide com faixa reservável é recusado", () => {
    const r = esquemaArea.safeParse({ ...formArea, livreRotulo: "Livre", livreInicio: "19:00", livreFim: "20:00" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toMatch(/coincide/);
  });

  it("aceita uma faixa só (campo não repetido)", () => {
    const r = esquemaArea.safeParse({ ...formArea, faixaRotulo: "Dia inteiro", faixaInicio: "10:00", faixaFim: "23:00" });
    expect(r.success).toBe(true);
  });

  it("recusa faixas sobrepostas e antecedência invertida", () => {
    const sobre = esquemaArea.safeParse({ ...formArea, faixaInicio: ["11:00", "08:00", ""] });
    expect(sobre.success).toBe(false);
    expect(sobre.error?.issues[0]?.message).toMatch(/sobrepostos/);
    const inv = esquemaArea.safeParse({ ...formArea, antecedenciaMinimaHoras: "240", antecedenciaMaxDias: "5" });
    expect(inv.error?.issues[0]?.message).toMatch(/maior ou igual/);
  });

  it("recusa números inválidos e id com caminho", () => {
    expect(esquemaArea.safeParse({ ...formArea, capacidade: "-3" }).success).toBe(false);
    expect(esquemaArea.safeParse({ ...formArea, capacidade: "2001" }).success).toBe(false);
    // 0 = capacidade não informada (a tela não mostra "até N pessoas").
    expect(esquemaArea.safeParse({ ...formArea, capacidade: "0" }).success).toBe(true);
    expect(esquemaArea.safeParse({ ...formArea, id: "../outro" }).success).toBe(false);
  });

  it("junta as listas de faixas sem perder a ordem", () => {
    expect(juntarFaixas(["A", ""], ["08:00", ""], ["09:00", ""])).toEqual([{ rotulo: "A", inicio: "08:00", fim: "09:00" }]);
  });

  it("pedido: data real, faixa no formato certo e observação limitada", () => {
    expect(esquemaPedido.safeParse({ areaId: "salao", data: "2026-11-20", faixaId: "1000-2300" }).success).toBe(true);
    // caixa "Li e concordo": marcada vira true; ausente vira false
    expect(esquemaPedido.parse({ areaId: "salao", data: "2026-11-20", faixaId: "1000-2300", aceite: "sim" }).aceite).toBe(true);
    expect(esquemaPedido.parse({ areaId: "salao", data: "2026-11-20", faixaId: "1000-2300" }).aceite).toBe(false);
    expect(esquemaPedido.safeParse({ areaId: "salao", data: "2026-11-20", faixaId: "1000-2300", aceite: "talvez" }).success).toBe(false);
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
