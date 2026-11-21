/**
 * Regras da votação oficial (sem banco): situação, candidatos, cédula, apuração e formulários.
 */
import { describe, expect, it } from "vitest";
import {
  apurar,
  apurarChapa,
  contarNulos,
  dataNascimentoValida,
  minimoParaEleger,
  montarCandidatos,
  ehVotacaoDeTeste,
  porcentagemParticipacao,
  resultadoParaPainel,
  resumoNumerosResultado,
  situacaoEleicao,
  tituloResultado,
  validarEscolha,
  type Candidato,
} from "@/lib/eleicoes";
import { esquemaCedula, esquemaEleicao } from "@/lib/validacao-eleicoes";

const abre = new Date("2026-11-20T10:00:00Z");
const fecha = new Date("2026-11-20T20:00:00Z");
const hoje = new Date("2026-11-19T12:00:00Z");

const cand = (n: number, nascimento: string | null = null): Candidato => ({
  id: `c${n}`,
  numero: n,
  nome: `Candidato ${n}`,
  funcao: "",
  casa: "",
  apresentacao: "",
  nascimento,
});

describe("situacaoEleicao", () => {
  it("rascunho é sempre rascunho", () => {
    expect(situacaoEleicao({ status: "rascunho", abreEm: abre, fechaEm: fecha }, new Date("2026-11-20T12:00:00Z"))).toBe("rascunho");
  });
  it("publicada antes de abrir: agendada; abre no minuto exato; encerra no minuto exato", () => {
    const e = { status: "publicada" as const, abreEm: abre, fechaEm: fecha };
    expect(situacaoEleicao(e, new Date(abre.getTime() - 1))).toBe("agendada");
    expect(situacaoEleicao(e, abre)).toBe("aberta");
    expect(situacaoEleicao(e, new Date(fecha.getTime() - 1))).toBe("aberta");
    expect(situacaoEleicao(e, fecha)).toBe("encerrada");
  });
});

describe("dataNascimentoValida", () => {
  it("aceita datas reais no passado", () => {
    expect(dataNascimentoValida("1960-02-29", hoje)).toBe(true);
  });
  it("recusa data inexistente, futura, muito antiga ou mal escrita", () => {
    expect(dataNascimentoValida("1961-02-29", hoje)).toBe(false);
    expect(dataNascimentoValida("2030-01-01", hoje)).toBe(false);
    expect(dataNascimentoValida("1850-01-01", hoje)).toBe(false);
    expect(dataNascimentoValida("01/02/1980", hoje)).toBe(false);
  });
});

describe("montarCandidatos", () => {
  const linha = (nome: string, extra: Partial<{ casa: string; apresentacao: string; nascimento: string }> = {}) => ({
    nome,
    casa: "",
    apresentacao: "",
    nascimento: "",
    ...extra,
  });

  it("numera em ordem, ignora linhas vazias e limpa espaços", () => {
    const r = montarCandidatos([linha("  Ana   Souza "), linha(""), linha("Bruno", { casa: " Casa 12 ", nascimento: "1970-05-01" })], hoje);
    expect(r).toEqual([
      { id: "c1", numero: 1, nome: "Ana Souza", funcao: "", casa: "", apresentacao: "", nascimento: null },
      { id: "c2", numero: 2, nome: "Bruno", funcao: "", casa: "Casa 12", apresentacao: "", nascimento: "1970-05-01" },
    ]);
  });
  it("exige pelo menos 1 candidato", () => {
    expect(montarCandidatos([linha(""), linha("")], hoje)).toMatch(/pelo menos 1/);
  });
  it("recusa nome curto, repetido (sem diferenciar maiúsculas) e data inválida", () => {
    expect(montarCandidatos([linha("Al")], hoje)).toMatch(/pelo menos 3/);
    expect(montarCandidatos([linha("Ana Souza"), linha("ana souza")], hoje)).toMatch(/repetido/);
    expect(montarCandidatos([linha("Ana", { nascimento: "2099-01-01" })], hoje)).toMatch(/nascimento/);
  });
  it("linha só com a casa preenchida pede o nome", () => {
    expect(montarCandidatos([linha("", { casa: "Casa 3" })], hoje)).toMatch(/nome do candidato 1/);
  });
});

describe("validarEscolha", () => {
  const e = { candidatos: [cand(1), cand(2), cand(3)], escolhasPorCasa: 1, permiteBranco: true };

  it("aceita 1 candidato válido", () => {
    expect(validarEscolha(["c2"], e)).toEqual({ tipo: "candidatos", ids: ["c2"] });
  });
  it("aceita branco sozinho, quando permitido", () => {
    expect(validarEscolha(["branco"], e)).toEqual({ tipo: "branco" });
    expect(validarEscolha(["branco"], { ...e, permiteBranco: false })).toMatch(/não aceita/);
  });
  it("recusa vazio, branco junto com candidato, repetidos e acima do limite", () => {
    expect(validarEscolha([], e)).toMatch(/Escolha/);
    expect(validarEscolha(["branco", "c1"], e)).toMatch(/branco/);
    expect(validarEscolha(["c1", "c1"], { ...e, escolhasPorCasa: 2 })).toMatch(/uma vez/);
    expect(validarEscolha(["c1", "c2"], e)).toMatch(/só 1/);
    expect(validarEscolha(["c1", "c2", "c3"], { ...e, escolhasPorCasa: 2 })).toMatch(/no máximo 2/);
  });
  it("recusa candidato que não existe", () => {
    expect(validarEscolha(["c9"], e)).toMatch(/não existe/);
  });
  it("aceita até N candidatos quando a eleição permite", () => {
    expect(validarEscolha(["c3", "c1"], { ...e, escolhasPorCasa: 2 })).toEqual({ tipo: "candidatos", ids: ["c3", "c1"] });
  });
});

describe("apurar", () => {
  const base = { candidatos: [cand(1), cand(2), cand(3), cand(4)], vagas: 2, regraDesempate: "comissao" as const };

  it("ordena por votos e elege as vagas; conta brancos e cédulas", () => {
    const a = apurar(base, { votos: { c1: 2, c2: 5, c3: 1 }, brancos: 2, cedulas: 10 });
    expect(a.ranking.map((l) => l.candidato.id)).toEqual(["c2", "c1", "c3", "c4"]);
    expect(a.ranking.map((l) => l.votos)).toEqual([5, 2, 1, 0]);
    expect(a.ranking[0].porcentagem).toBe(50);
    expect(a.eleitos).toEqual(["c2", "c1"]);
    expect(a.brancos).toBe(2);
    expect(a.cedulas).toBe(10);
    expect(a.empate).toBeNull();
  });

  it("empate na última vaga: a comissão decide (ninguém é eleito por sorte ou número)", () => {
    const a = apurar(base, { votos: { c1: 5, c2: 3, c3: 3 }, brancos: 0, cedulas: 11 });
    expect(a.eleitos).toEqual(["c1"]);
    expect(a.empate).toEqual({ ids: ["c2", "c3"], votos: 3, vaga: 2, decididos: null });
  });

  it("empate com 0 votos também vai para a regra (não decide pelo número)", () => {
    const a = apurar({ ...base, vagas: 2 }, { votos: { c1: 4 }, brancos: 0, cedulas: 4 });
    expect(a.eleitos).toEqual(["c1"]);
    expect(a.empate?.ids).toEqual(["c2", "c3", "c4"]);
    expect(a.empate?.decididos).toBeNull();
  });

  it("desempate por idade: o mais velho fica com a vaga", () => {
    const e = {
      candidatos: [cand(1, "1980-01-01"), cand(2, "1990-01-01"), cand(3, "1955-07-10")],
      vagas: 2,
      regraDesempate: "idade" as const,
    };
    const a = apurar(e, { votos: { c1: 6, c2: 3, c3: 3 }, brancos: 0, cedulas: 12 });
    expect(a.eleitos).toEqual(["c1", "c3"]);
    expect(a.empate?.decididos).toEqual(["c3"]);
  });

  it("idade não resolve se falta a data de alguém empatado ou se as datas são iguais", () => {
    const semData = { candidatos: [cand(1, "1980-01-01"), cand(2, null)], vagas: 1, regraDesempate: "idade" as const };
    expect(apurar(semData, { votos: { c1: 2, c2: 2 }, brancos: 0, cedulas: 4 }).empate?.decididos).toBeNull();
    const iguais = { candidatos: [cand(1, "1980-01-01"), cand(2, "1980-01-01")], vagas: 1, regraDesempate: "idade" as const };
    const a = apurar(iguais, { votos: { c1: 2, c2: 2 }, brancos: 0, cedulas: 4 });
    expect(a.empate?.decididos).toBeNull();
    expect(a.eleitos).toEqual([]);
  });

  it("ignora contadores estranhos (negativos, texto, candidatos que não existem)", () => {
    const a = apurar(base, { votos: { c1: -3, c2: "9" as unknown as number, cX: 50 }, brancos: -1, cedulas: 0 });
    expect(a.ranking.every((l) => l.votos === 0 && l.porcentagem === 0)).toBe(true);
    expect(a.brancos).toBe(0);
  });

  it("com menos candidatos do que vagas, todos são eleitos", () => {
    const a = apurar({ ...base, candidatos: [cand(1)], vagas: 3 }, { votos: {}, brancos: 1, cedulas: 1 });
    expect(a.eleitos).toEqual(["c1"]);
    expect(a.empate).toBeNull();
  });
});

describe("esquemaEleicao", () => {
  const dados = (extra: Record<string, unknown> = {}) => ({
    titulo: "Eleição da Comissão 2026",
    cargo: "Comissão Eleitoral",
    modo: "candidatos",
    vagas: "3",
    escolhasPorCasa: "1",
    permiteBranco: "sim",
    regraDesempate: "idade",
    abreEm: "2026-11-26T07:00",
    fechaEm: "2026-11-26T17:00",
    candNome: ["Ana Souza", "Bruno Lima"],
    candCasa: ["Casa 1", ""],
    candApresentacao: ["", ""],
    candNascimento: ["", "1970-01-01"],
    ...extra,
  });

  it("aceita o formulário padrão e monta os candidatos", () => {
    const r = esquemaEleicao.parse(dados());
    expect(r.id).toBeNull();
    expect(r.vagas).toBe(3);
    expect(r.permiteBranco).toBe(true);
    expect(r.candidatos.map((c) => c.nome)).toEqual(["Ana Souza", "Bruno Lima"]);
    expect(r.candidatos[1].nascimento).toBe("1970-01-01");
  });
  it("aceita candidato único vindo como texto (não lista)", () => {
    const r = esquemaEleicao.parse(dados({ candNome: "Ana Souza", candCasa: "", candApresentacao: "", candNascimento: "" }));
    expect(r.candidatos).toHaveLength(1);
  });
  it("recusa escolhas acima das vagas, datas invertidas e vagas fora do limite", () => {
    expect(esquemaEleicao.safeParse(dados({ vagas: "1", escolhasPorCasa: "2" })).success).toBe(false);
    expect(esquemaEleicao.safeParse(dados({ fechaEm: "2026-11-26T06:00" })).success).toBe(false);
    expect(esquemaEleicao.safeParse(dados({ vagas: "10" })).success).toBe(false);
    expect(esquemaEleicao.safeParse(dados({ vagas: "0" })).success).toBe(false);
  });
  it("recusa id com barra (caminho do banco)", () => {
    expect(esquemaEleicao.safeParse(dados({ id: "a/b" })).success).toBe(false);
  });
});

describe("esquemaCedula", () => {
  it("aceita 1 escolha ou várias", () => {
    expect(esquemaCedula.parse({ id: "e1", escolha: "c1" }).escolha).toEqual(["c1"]);
    expect(esquemaCedula.parse({ id: "e1", escolha: ["c1", "c2"] }).escolha).toEqual(["c1", "c2"]);
  });
  it("recusa valores que não são candidato nem branco, e listas grandes demais", () => {
    expect(esquemaCedula.safeParse({ id: "e1", escolha: "__proto__" }).success).toBe(false);
    expect(esquemaCedula.safeParse({ id: "e1", escolha: "votos.c1" }).success).toBe(false);
    expect(esquemaCedula.safeParse({ id: "e1", escolha: ["c1", "c2", "c3", "c4", "c5"] }).success).toBe(false);
  });
});

describe("chapa única (Sim ou Não)", () => {
  const chapa = {
    candidatos: [
      { ...cand(1), nome: "José Amaral", funcao: "Síndico" },
      { ...cand(2), nome: "Iza Rabelo", funcao: "Vice-síndica" },
    ],
    escolhasPorCasa: 1,
    permiteBranco: false,
    modo: "chapa" as const,
  };

  it("cédula aceita só um Sim ou um Não para a chapa inteira", () => {
    expect(validarEscolha(["sim"], chapa)).toEqual({ tipo: "chapa", voto: "sim" });
    expect(validarEscolha(["nao"], chapa)).toEqual({ tipo: "chapa", voto: "nao" });
    expect(validarEscolha([], chapa)).toMatch(/Sim ou Não/);
    expect(validarEscolha(["sim", "nao"], chapa)).toMatch(/Sim ou Não/);
    expect(validarEscolha(["c1"], chapa)).toMatch(/Sim ou Não/);
    expect(validarEscolha(["branco"], chapa)).toMatch(/Sim ou Não/);
  });

  it("metade mais 1 dos votos", () => {
    expect(minimoParaEleger(10)).toBe(6);
    expect(minimoParaEleger(9)).toBe(5);
    expect(minimoParaEleger(1)).toBe(1);
    expect(minimoParaEleger(0)).toBe(1);
  });

  it("eleita com metade mais 1; empate ou menos não elege; sem votos não elege", () => {
    expect(apurarChapa({ sim: 6, nao: 4, cedulas: 10 })).toMatchObject({ eleita: true, minimo: 6, porcentagemSim: 60 });
    expect(apurarChapa({ sim: 5, nao: 5, cedulas: 10 })).toMatchObject({ eleita: false, minimo: 6 });
    expect(apurarChapa({ sim: 5, nao: 4, cedulas: 9 })).toMatchObject({ eleita: true, minimo: 5 });
    expect(apurarChapa({ sim: 0, nao: 0, cedulas: 0 })).toMatchObject({ eleita: false, porcentagemSim: 0 });
    expect(apurarChapa({ sim: -2, nao: 3, cedulas: 3 })).toMatchObject({ sim: 0, eleita: false });
  });

  it("formulário da chapa: é o padrão e dispensa vagas, branco e desempate", () => {
    const r = esquemaEleicao.parse({
      titulo: "Eleição do síndico e conselho 2026",
      cargo: "Chapa única",
      abreEm: "2026-11-26T07:00",
      fechaEm: "2026-11-26T17:00",
      candNome: ["José Amaral", "Iza Rabelo"],
      candFuncao: ["Síndico", "Vice-síndica"],
      candCasa: ["", ""],
      candApresentacao: ["", ""],
      candNascimento: ["", ""],
    });
    expect(r.modo).toBe("chapa");
    expect(r.permiteBranco).toBe(false);
    expect(r.vagas).toBe(2);
    expect(r.candidatos.map((c) => c.funcao)).toEqual(["Síndico", "Vice-síndica"]);
  });

  it("cédula aceita os valores sim/nao", () => {
    expect(esquemaCedula.parse({ id: "e1", escolha: "sim" }).escolha).toEqual(["sim"]);
    expect(esquemaCedula.safeParse({ id: "e1", escolha: "talvez" }).success).toBe(false);
  });
});

describe("esquemaBloqueio", () => {
  it("aceita mudanças vazias, uma ou várias casas; recusa id com barra", async () => {
    const { esquemaBloqueio } = await import("@/lib/validacao-eleicoes");
    expect(esquemaBloqueio.parse({ id: "e1" })).toEqual({ id: "e1", adicionar: [], remover: [] });
    expect(esquemaBloqueio.parse({ id: "e1", adicionar: "casa-1" }).adicionar).toEqual(["casa-1"]);
    expect(esquemaBloqueio.parse({ id: "e1", remover: ["casa-1", "casa-2"] }).remover).toHaveLength(2);
    expect(esquemaBloqueio.safeParse({ id: "e1", adicionar: "a/b" }).success).toBe(false);
  });
});

describe("esquemaFotoCandidato", () => {
  it("aceita foto pequena em data URL ou vazio (tirar); recusa outra coisa", async () => {
    const { esquemaFotoCandidato } = await import("@/lib/validacao-eleicoes");
    const ok = { id: "e1", candidato: "c1", foto: "data:image/jpeg;base64,/9j/4AAQSkZJRg==" };
    expect(esquemaFotoCandidato.safeParse(ok).success).toBe(true);
    expect(esquemaFotoCandidato.safeParse({ ...ok, foto: "" }).success).toBe(true);
    expect(esquemaFotoCandidato.safeParse({ ...ok, foto: "https://x.com/a.jpg" }).success).toBe(false);
    expect(esquemaFotoCandidato.safeParse({ ...ok, foto: "data:image/svg+xml;base64,PHN2Zz4=" }).success).toBe(false);
    expect(esquemaFotoCandidato.safeParse({ ...ok, foto: `data:image/png;base64,${"A".repeat(300_001)}` }).success).toBe(false);
    expect(esquemaFotoCandidato.safeParse({ ...ok, candidato: "../x" }).success).toBe(false);
  });
});

describe("contadores da urna", () => {
  it("lê e soma os contadores, ignorando valores estranhos", async () => {
    const { somarUrna } = await import("@/lib/eleicoes");
    const total = somarUrna([
      { cedulas: 2, sim: 1, nao: 1 },
      undefined,
      null,
      { cedulas: 3, sim: 3 },
      { cedulas: 1, brancos: 1, votos: { c1: 1, c2: "x" } },
      { cedulas: -5, sim: Number.NaN, votos: { c1: 2 } },
    ]);
    expect(total).toEqual({ cedulas: 6, sim: 4, nao: 1, brancos: 1, votos: { c1: 3, c2: 0 } });
  });

  it("urna vazia soma zero", async () => {
    const { somarUrna } = await import("@/lib/eleicoes");
    expect(somarUrna([])).toEqual({ cedulas: 0, sim: 0, nao: 0, brancos: 0, votos: {} });
  });
});

// ---------- Decisões de 21/11/2026: votos nulos, painel público e avisos ----------

describe("contarNulos (casas aptas que não votaram)", () => {
  it("sem o número de casas aptas (eleição antiga), não há nulos", () => {
    expect(contarNulos(null, 5)).toBe(0);
    expect(contarNulos(undefined, 5)).toBe(0);
    expect(contarNulos(Number.NaN, 5)).toBe(0);
  });
  it("aptas menos as que votaram; nunca negativo", () => {
    expect(contarNulos(220, 110)).toBe(110);
    expect(contarNulos(3, 3)).toBe(0);
    expect(contarNulos(10, 12)).toBe(0);
    expect(contarNulos(5, -3)).toBe(5);
    expect(contarNulos(10.7, 3.2)).toBe(7);
  });
});

describe("apurarChapa com casas aptas (nulos)", () => {
  it("220 aptas, 60 Sim e 50 Não: eleita (metade mais 1 dos VÁLIDOS) com 110 nulos", () => {
    expect(apurarChapa({ sim: 60, nao: 50, cedulas: 110 }, 220)).toEqual({
      modo: "chapa",
      sim: 60,
      nao: 50,
      cedulas: 110,
      minimo: 56,
      porcentagemSim: 55,
      eleita: true,
      casasAptas: 220,
      nulos: 110,
    });
  });
  it("10 Sim e 10 Não: empate não elege, mesmo com 200 nulos", () => {
    expect(apurarChapa({ sim: 10, nao: 10, cedulas: 20 }, 220)).toMatchObject({ eleita: false, minimo: 11, nulos: 200 });
  });
  it("sem votos: não eleita e todas as aptas são nulos", () => {
    expect(apurarChapa({ sim: 0, nao: 0, cedulas: 0 }, 220)).toMatchObject({ eleita: false, nulos: 220, porcentagemSim: 0 });
  });
  it("os nulos NÃO mudam o resultado (a conta é só de Sim + Não)", () => {
    for (const c of [
      { sim: 2, nao: 1, cedulas: 3 },
      { sim: 1, nao: 1, cedulas: 2 },
      { sim: 6, nao: 4, cedulas: 10 },
      { sim: 4, nao: 6, cedulas: 10 },
    ]) {
      const semAptas = apurarChapa(c);
      const comAptas = apurarChapa(c, 220);
      expect(comAptas.eleita).toBe(semAptas.eleita);
      expect(comAptas.minimo).toBe(semAptas.minimo);
      expect(comAptas.porcentagemSim).toBe(semAptas.porcentagemSim);
    }
    // Só 3 de 220 casas votaram (2 Sim, 1 Não): eleita, com 217 nulos.
    expect(apurarChapa({ sim: 2, nao: 1, cedulas: 3 }, 220)).toMatchObject({ eleita: true, nulos: 217 });
  });
  it("sem casas aptas informadas: casasAptas null e nenhum nulo", () => {
    expect(apurarChapa({ sim: 6, nao: 4, cedulas: 10 })).toMatchObject({ casasAptas: null, nulos: 0 });
  });
});

describe("apurar (candidatos) com casas aptas (nulos)", () => {
  const base = { candidatos: [cand(1), cand(2), cand(3), cand(4)], vagas: 2, regraDesempate: "comissao" as const };
  const contagem = { votos: { c1: 2, c2: 5, c3: 1 }, brancos: 2, cedulas: 10 };

  it("nulos = aptas menos cédulas; a porcentagem continua sobre as cédulas", () => {
    const a = apurar(base, contagem, 25);
    expect(a.casasAptas).toBe(25);
    expect(a.nulos).toBe(15);
    expect(a.eleitos).toEqual(["c2", "c1"]);
    expect(a.ranking[0].porcentagem).toBe(50);
  });
  it("sem aptas: null e 0 nulos; aptas menor que cédulas: 0 nulos", () => {
    expect(apurar(base, contagem)).toMatchObject({ casasAptas: null, nulos: 0 });
    expect(apurar(base, contagem, 8)).toMatchObject({ casasAptas: 8, nulos: 0 });
  });
});

describe("resultadoParaPainel (o que vai para o Início de todos)", () => {
  it("chapa: Sim, Não, nulos, válidos e as duas porcentagens", () => {
    expect(resultadoParaPainel(apurarChapa({ sim: 60, nao: 50, cedulas: 110 }, 220))).toEqual({
      modo: "chapa",
      sim: 60,
      nao: 50,
      nulos: 110,
      validos: 110,
      minimo: 56,
      eleita: true,
      porcentagemSim: 55,
      porcentagemNao: 45,
    });
  });
  it("chapa sem votos: porcentagens 0 (não 100 para o Não)", () => {
    expect(resultadoParaPainel(apurarChapa({ sim: 0, nao: 0, cedulas: 0 }, 3))).toEqual({
      modo: "chapa",
      sim: 0,
      nao: 0,
      nulos: 3,
      validos: 0,
      minimo: 1,
      eleita: false,
      porcentagemSim: 0,
      porcentagemNao: 0,
    });
  });
  it("chapa: Sim + Não somam sempre 100%", () => {
    const p = resultadoParaPainel(apurarChapa({ sim: 1, nao: 2, cedulas: 3 }));
    expect(p).toMatchObject({ porcentagemSim: 33, porcentagemNao: 67 });
  });
  it("candidatos: ranking só com número, nome, votos e eleito; empate pendente aparece", () => {
    const base = { candidatos: [cand(1), cand(2), cand(3), cand(4)], vagas: 2, regraDesempate: "comissao" as const };
    const p = resultadoParaPainel(apurar(base, { votos: { c1: 5, c2: 3, c3: 3 }, brancos: 1, cedulas: 12 }, 20));
    expect(p).toEqual({
      modo: "candidatos",
      ranking: [
        { numero: 1, nome: "Candidato 1", votos: 5, eleito: true },
        { numero: 2, nome: "Candidato 2", votos: 3, eleito: false },
        { numero: 3, nome: "Candidato 3", votos: 3, eleito: false },
        { numero: 4, nome: "Candidato 4", votos: 0, eleito: false },
      ],
      brancos: 1,
      nulos: 8,
      cedulas: 12,
      empate: true,
    });
  });
  it("candidatos: empate resolvido pela idade não fica pendente e a data de nascimento não vai junto", () => {
    const e = {
      candidatos: [cand(1, "1980-01-01"), cand(2, "1990-01-01"), cand(3, "1955-07-10")],
      vagas: 2,
      regraDesempate: "idade" as const,
    };
    const p = resultadoParaPainel(apurar(e, { votos: { c1: 6, c2: 3, c3: 3 }, brancos: 0, cedulas: 12 }));
    expect(p.modo === "candidatos" && p.empate).toBe(false);
    expect(p.modo === "candidatos" && p.ranking.map((l) => l.eleito)).toEqual([true, false, true]);
    expect(JSON.stringify(p)).not.toMatch(/nascimento|1955|1980|1990|"c\d"/);
  });
});

describe("porcentagemParticipacao", () => {
  it("porcentagem inteira de casas aptas que votaram", () => {
    expect(porcentagemParticipacao(2, 3)).toBe(67);
    expect(porcentagemParticipacao(1, 3)).toBe(33);
    expect(porcentagemParticipacao(110, 220)).toBe(50);
    expect(porcentagemParticipacao(3, 3)).toBe(100);
    expect(porcentagemParticipacao(0, 3)).toBe(0);
  });
  it("faltando casa, nunca mostra 100% (219 de 220 = 99%)", () => {
    expect(porcentagemParticipacao(219, 220)).toBe(99);
    expect(porcentagemParticipacao(220, 220)).toBe(100);
  });
  it("nunca passa de 100, nunca negativa; sem casas aptas é 0", () => {
    expect(porcentagemParticipacao(4, 3)).toBe(100);
    expect(porcentagemParticipacao(-2, 10)).toBe(0);
    expect(porcentagemParticipacao(5, 0)).toBe(0);
  });
});

describe("resumoNumerosResultado (linha dos avisos)", () => {
  const base = { candidatos: [cand(1), cand(2), cand(3), cand(4)], vagas: 2, regraDesempate: "comissao" as const };

  it("chapa: Sim, Não e os nulos (só quando existem)", () => {
    expect(resumoNumerosResultado(apurarChapa({ sim: 60, nao: 50, cedulas: 110 }, 220))).toBe("Sim 60 · Não 50 · Sem votar 110");
    expect(resumoNumerosResultado(apurarChapa({ sim: 6, nao: 4, cedulas: 10 }))).toBe("Sim 6 · Não 4");
    expect(resumoNumerosResultado(apurarChapa({ sim: 2, nao: 1, cedulas: 3 }, 3))).toBe("Sim 2 · Não 1");
  });
  it("candidatos: votos (singular/plural), brancos e nulos", () => {
    expect(resumoNumerosResultado(apurar(base, { votos: { c1: 1 }, brancos: 0, cedulas: 1 }))).toBe("1 voto · Brancos 0");
    expect(resumoNumerosResultado(apurar(base, { votos: { c1: 2, c2: 5, c3: 1 }, brancos: 2, cedulas: 10 }, 25))).toBe(
      "10 votos · Brancos 2 · Sem votar 15",
    );
  });
});

describe("tituloResultado (título dos avisos)", () => {
  it("chapa: ELEITA ou NÃO eleita", () => {
    expect(tituloResultado(apurarChapa({ sim: 60, nao: 50, cedulas: 110 }, 220))).toBe("Chapa ELEITA");
    expect(tituloResultado(apurarChapa({ sim: 10, nao: 10, cedulas: 20 }, 220))).toBe("Chapa NÃO eleita");
    expect(tituloResultado(apurarChapa({ sim: 0, nao: 0, cedulas: 0 }, 220))).toBe("Chapa NÃO eleita");
  });
  it("candidatos: nomes dos eleitos na ordem do resultado", () => {
    const base = { candidatos: [cand(1), cand(2), cand(3), cand(4)], vagas: 2, regraDesempate: "comissao" as const };
    expect(tituloResultado(apurar(base, { votos: { c1: 2, c2: 5, c3: 1 }, brancos: 2, cedulas: 10 }))).toBe(
      "Eleitos: Candidato 2, Candidato 1",
    );
    const idade = {
      candidatos: [cand(1, "1980-01-01"), cand(2, "1990-01-01"), cand(3, "1955-07-10")],
      vagas: 2,
      regraDesempate: "idade" as const,
    };
    expect(tituloResultado(apurar(idade, { votos: { c1: 6, c2: 3, c3: 3 }, brancos: 0, cedulas: 12 }))).toBe(
      "Eleitos: Candidato 1, Candidato 3",
    );
  });
  it("candidatos: ninguém eleito por empate: a comissão decide", () => {
    const e = { candidatos: [cand(1), cand(2)], vagas: 1, regraDesempate: "comissao" as const };
    expect(tituloResultado(apurar(e, { votos: { c1: 2, c2: 2 }, brancos: 0, cedulas: 4 }))).toBe(
      "Resultado: a comissão decide o empate",
    );
  });
});

describe("ehVotacaoDeTeste (título com a palavra TESTE)", () => {
  it("reconhece a palavra TESTE em qualquer lugar do título, sem diferenciar maiúsculas", () => {
    for (const t of ["Eleição de TESTE", "TESTE — Votação de demonstração", "Eleição do síndico e conselho 2026/2027 - TESTE", "votação teste", "(Teste) eleição"])
      expect(ehVotacaoDeTeste(t)).toBe(true);
  });
  it("não confunde com outras palavras nem marca a eleição oficial", () => {
    for (const t of ["Eleição do síndico e conselho 2026/2027", "Testemunha da ata", "Contestes", "Atestado", ""])
      expect(ehVotacaoDeTeste(t)).toBe(false);
  });
});
