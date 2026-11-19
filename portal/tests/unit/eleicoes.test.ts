/**
 * Regras da votação oficial (sem banco): situação, candidatos, cédula, apuração e formulários.
 */
import { describe, expect, it } from "vitest";
import {
  apurar,
  apurarChapa,
  dataNascimentoValida,
  minimoParaEleger,
  montarCandidatos,
  situacaoEleicao,
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
