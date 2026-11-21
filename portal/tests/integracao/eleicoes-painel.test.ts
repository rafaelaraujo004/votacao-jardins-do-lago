/**
 * PAINEL PÚBLICO da votação e DIVULGAÇÃO do resultado, contra o simulador.
 *
 * Decisões de 21/11/2026 (síndico): moradores e equipe acompanham QUANTAS casas votaram e
 * quantas faltam, sem ver QUAIS (sigilo); casas aptas que não votaram são votos NULOS; ao
 * encerrar, o resultado é divulgado uma vez só para todos.
 *
 * Por que as eleições daqui abrem e fecham no FUTURO (pela hora real) e os testes usam hora
 * simulada: montarPainel chama garantirFinalizacao, que olha a hora REAL e, se a urna já
 * pudesse abrir, divulgaria o resultado sozinho por trás — e atrapalharia o teste de
 * finalizarEleicao. Com o encerramento no futuro real, nada dispara sozinho.
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getApps, initializeApp } from "firebase-admin/app";
import { Timestamp, getFirestore, type Firestore } from "firebase-admin/firestore";
import type { Contexto } from "@/server/contexto";
import {
  CARENCIA_APURACAO_MS,
  eleicaoEmDestaque,
  finalizarEleicao,
  gravarEleicao,
  montarPainel,
  mudarStatusEleicao,
  painelEmDestaque,
  paraEleicao,
  conferirVotacaoAbertaAntesDoCadastro,
  recalcularAptasDasAgendadas,
  registrarVotoEleicao,
  salvarBloqueios,
  situacaoDaCasa,
} from "@/server/dados/eleicoes";
import { calcularPermissoes } from "@/lib/permissoes";
import type { Candidato } from "@/lib/eleicoes";

const PROJETO = "demo-jardins-painel";
let db: Firestore;

beforeAll(() => {
  const app = getApps().find((a) => a.name === PROJETO) ?? initializeApp({ projectId: PROJETO }, PROJETO);
  db = getFirestore(app);
});

async function limpar() {
  const host = process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080";
  await fetch(`http://${host}/emulator/v1/projects/${PROJETO}/databases/(default)/documents`, { method: "DELETE" });
}

function contexto(uid: string, unitId: string | null, papel: "morador" | "admin"): Contexto {
  return {
    uid,
    nome: uid,
    condominioId: "a",
    condominioNome: "A",
    fuso: "America/Belem",
    papel,
    unitId,
    unidadeRotulo: unitId,
    permissoes: calcularPermissoes(papel),
    demo: false,
    precisaTrocarSenha: false,
  };
}

const comissao = contexto("sindico", null, "admin");
const HORA = 3_600_000;
const MINUTO = 60_000;
const DIA = 24 * HORA;
// A casa do integrante e a data de nascimento NÃO podem ir para o painel.
const cand = (n: number): Candidato => ({
  id: `c${n}`,
  numero: n,
  nome: `Integrante ${n}`,
  funcao: n === 1 ? "Síndico" : "Fiscal",
  casa: `Casa ${40 + n}`,
  apresentacao: "",
  nascimento: "1960-05-17",
});

const ref = (id: string) => db.doc(`condominiums/a/elections/${id}`);
const votar = (unitId: string, voto: "sim" | "nao", agora: Date, id: string) =>
  registrarVotoEleicao(db, contexto(`m-${unitId}`, unitId, "morador"), id, [voto], agora);
async function lerEleicao(id: string) {
  const doc = await ref(id).get();
  return paraEleicao(doc.id, doc.data());
}

/** Cria (e publica, se pedir) uma chapa com horário relativo a T0. */
async function chapa(abreEm: number, fechaEm: number, publicar = true, titulo = "Eleição do síndico 2026"): Promise<string> {
  const id = await gravarEleicao(db, comissao, {
    id: null,
    titulo,
    cargo: "Chapa única",
    modo: "chapa",
    vagas: 2,
    escolhasPorCasa: 1,
    permiteBranco: false,
    regraDesempate: "comissao",
    abreEm: new Date(abreEm),
    fechaEm: new Date(fechaEm),
    candidatos: [cand(1), cand(2)],
  });
  if (publicar) await mudarStatusEleicao(db, comissao, id, "publicar");
  return id;
}

let T0 = 0;

beforeEach(async () => {
  T0 = Date.now();
  await limpar();
  await db.doc("condominiums/a").set({ nome: "A", status: "ativo", fuso: "America/Belem" });
  await db.doc("condominiums/a/units/casa-1").set({ rotulo: "Casa 1", numero: 1, status: "ativa" });
  await db.doc("condominiums/a/units/casa-2").set({ rotulo: "Casa 2", numero: 2, status: "ativa" });
  await db.doc("condominiums/a/units/casa-3").set({ rotulo: "Casa 3", numero: 3, status: "ativa" });
  await db.doc("condominiums/a/units/casa-4").set({ rotulo: "Casa 4", numero: 4, status: "inativa" });
});

describe("painel público (montarPainel / painelEmDestaque)", () => {
  it("acompanha as fases: agendada, aberta (só QUANTAS casas), apurando e resultado", async () => {
    const abre = T0 + HORA;
    const fecha = T0 + 9 * HORA;
    const id = await chapa(abre, fecha);

    // Agendada: ninguém votou ainda.
    const agendada = await montarPainel("a", await lerEleicao(id), new Date(T0), db);
    expect(agendada).toMatchObject({ id, fase: "agendada", casasAptas: 3, votaram: 0, faltam: 3, participacao: 0, resultado: null });
    expect(agendada.integrantes).toEqual([
      { nome: "Integrante 1", funcao: "Síndico" },
      { nome: "Integrante 2", funcao: "Fiscal" },
    ]);

    // Aberta: 2 de 3 casas votaram. Mostra os números, nunca a soma parcial.
    const dentro = new Date(T0 + 2 * HORA);
    await votar("casa-1", "sim", dentro, id);
    await votar("casa-2", "nao", dentro, id);
    const destaque = await painelEmDestaque("a", dentro, db);
    expect(destaque?.eleicao.id).toBe(id);
    const painel = destaque!.painel;
    expect(painel).toMatchObject({ fase: "aberta", casasAptas: 3, votaram: 2, faltam: 1, participacao: 67, resultado: null });
    expect(painel.abreEm).toBe(abre);
    expect(painel.fechaEm).toBe(fecha);
    expect(painel.resultadoEm).toBe(fecha + CARENCIA_APURACAO_MS);
    expect(painel.geradoEm).toBe(dentro.getTime());

    // SIGILO: o painel vai para o navegador de todos. Nenhum id nem rótulo de casa,
    // nenhuma data de nascimento, nenhum campo além dos combinados.
    const json = JSON.stringify(painel);
    expect(json).not.toMatch(/casa-\d|Casa \d|1960-05-17|casasBloqueadas|unitId/i);
    expect(Object.keys(painel).sort()).toEqual(
      [
        "abreEm",
        "cargo",
        "casasAptas",
        "faltam",
        "fase",
        "fechaEm",
        "geradoEm",
        "id",
        "integrantes",
        "modo",
        "participacao",
        "resultado",
        "resultadoEm",
        "titulo",
        "votaram",
      ].sort(),
    );

    // Encerrou, mas ainda na carência: apurando, sem resultado.
    const apurando = await montarPainel("a", await lerEleicao(id), new Date(fecha + MINUTO), db);
    expect(apurando).toMatchObject({ fase: "apurando", votaram: 2, faltam: 1, resultado: null });

    // Depois da carência: o resultado com Sim, Não e os nulos (a casa 3 não votou).
    const final = await montarPainel("a", await lerEleicao(id), new Date(fecha + CARENCIA_APURACAO_MS), db);
    expect(final.fase).toBe("resultado");
    expect(final.resultado).toEqual({
      modo: "chapa",
      sim: 1,
      nao: 1,
      nulos: 1,
      validos: 2,
      minimo: 2,
      eleita: false,
      porcentagemSim: 50,
      porcentagemNao: 50,
    });
    expect(JSON.stringify(final)).not.toMatch(/casa-\d|Casa \d/i);
  });

  it("casas bloqueadas antes de abrir não contam como aptas (nem como nulos)", async () => {
    const fecha = T0 + 9 * HORA;
    const id = await chapa(T0 + HORA, fecha);
    await salvarBloqueios(db, comissao, id, { adicionar: ["casa-3"], remover: [] });
    const dentro = new Date(T0 + 2 * HORA);
    await votar("casa-1", "sim", dentro, id);

    const aberta = await montarPainel("a", await lerEleicao(id), dentro, db);
    expect(aberta).toMatchObject({ casasAptas: 2, votaram: 1, faltam: 1, participacao: 50 });

    const final = await montarPainel("a", await lerEleicao(id), new Date(fecha + CARENCIA_APURACAO_MS), db);
    expect(final.resultado).toMatchObject({ sim: 1, nao: 0, nulos: 1, eleita: true });
  });

  it("sem eleição publicada, não há painel", async () => {
    await chapa(T0 + HORA, T0 + 9 * HORA, false);
    expect(await painelEmDestaque("a", new Date(T0 + 2 * HORA), db)).toBeNull();
  });
});

describe("eleicaoEmDestaque (qual eleição vai para o topo do Início)", () => {
  it("aberta vence tudo; resultado recente (até 2 dias) vence agendada; depois, a agendada mais próxima; rascunho nunca", async () => {
    const encerrada = await chapa(T0 + HORA, T0 + 2 * HORA, true, "Encerrada");
    const aberta = await chapa(T0 + 3 * HORA, T0 + 10 * HORA, true, "Aberta");
    await chapa(T0 + 20 * HORA, T0 + 28 * HORA, true, "Próxima");
    await chapa(T0 + 30 * HORA, T0 + 38 * HORA, true, "Depois");
    // Rascunho que, pelo horário, estaria aberta em todos os momentos abaixo.
    await chapa(T0 + 30 * MINUTO, T0 + 40 * HORA, false, "Rascunho");

    // T0+4h: uma aberta, uma encerrada e duas agendadas → a aberta.
    expect((await eleicaoEmDestaque("a", new Date(T0 + 4 * HORA), db))?.id).toBe(aberta);
    // T0+12h: nenhuma aberta → o resultado que acabou de sair (a "Aberta" encerrou às T0+10h)
    // fica no topo antes da agendada (decisão de 21/11/2026: o resultado não pode sumir).
    expect((await eleicaoEmDestaque("a", new Date(T0 + 12 * HORA), db))?.id).toBe(aberta);
    // T0+19h com as encerradas mais velhas que 2 dias? Ainda não: continua o resultado recente.
    expect((await eleicaoEmDestaque("a", new Date(T0 + 19 * HORA), db))?.id).toBe(aberta);
    // T0+40min: todas agendadas → a que abre primeiro.
    expect((await eleicaoEmDestaque("a", new Date(T0 + 40 * MINUTO), db))?.id).toBe(encerrada);
  });

  it("só encerradas: a mais recente, até 7 dias depois do encerramento; rascunho nunca", async () => {
    await chapa(T0 + HORA, T0 + 2 * HORA, true, "Antiga");
    const recente = await chapa(T0 + 3 * HORA, T0 + 5 * HORA, true, "Recente");
    await chapa(T0 + HORA, T0 + 30 * DIA, false, "Rascunho");

    expect((await eleicaoEmDestaque("a", new Date(T0 + 6 * HORA), db))?.id).toBe(recente);
    expect((await eleicaoEmDestaque("a", new Date(T0 + 5 * HORA + 7 * DIA - MINUTO), db))?.id).toBe(recente);
    expect(await eleicaoEmDestaque("a", new Date(T0 + 5 * HORA + 7 * DIA), db)).toBeNull();
  });

  it("nenhuma publicada: null", async () => {
    await chapa(T0 + HORA, T0 + 9 * HORA, false);
    expect(await eleicaoEmDestaque("a", new Date(T0 + 2 * HORA), db)).toBeNull();
  });
});

describe("finalizarEleicao (divulga o resultado uma vez só)", () => {
  it("antes da carência não faz nada; depois, só uma de duas chamadas ao mesmo tempo divulga", async () => {
    const fecha = T0 + 9 * HORA;
    const id = await chapa(T0 + HORA, fecha);
    const dentro = new Date(T0 + 2 * HORA);
    await votar("casa-1", "sim", dentro, id);
    await votar("casa-2", "sim", dentro, id);

    // Durante a votação e na carência: nada.
    expect(await finalizarEleicao(db, "a", id, dentro)).toEqual({ divulgou: false, apuracao: null });
    expect(await finalizarEleicao(db, "a", id, new Date(fecha + CARENCIA_APURACAO_MS - 1))).toEqual({ divulgou: false, apuracao: null });
    expect((await ref(id).get()).get("resultadoDivulgadoEm")).toBeUndefined();

    // Depois da carência, duas telas pedem ao mesmo tempo: só uma divulga.
    const depois = new Date(fecha + CARENCIA_APURACAO_MS + 1000);
    const r = await Promise.all([finalizarEleicao(db, "a", id, depois), finalizarEleicao(db, "a", id, depois)]);
    expect(r.filter((x) => x.divulgou)).toHaveLength(1);

    const doc = await ref(id).get();
    expect(doc.get("resultadoDivulgadoEm")).toBeInstanceOf(Timestamp);
    expect(doc.get("resultadoFinal")).toEqual({
      modo: "chapa",
      titulo: "Chapa ELEITA",
      numeros: "Sim 2 · Não 0 · Sem votar 1",
      cedulas: 2,
      casasAptas: 3,
      nulos: 1,
      sim: 2,
      nao: 0,
      minimo: 2,
      eleita: true,
      semAviso: false,
    });
    expect(paraEleicao(doc.id, doc.data()).resultadoDivulgadoEm).toBeInstanceOf(Date);

    // Exatamente 1 registro na auditoria, sem nenhuma casa (nem escolha de casa).
    const logs = await db.collection("condominiums/a/auditLogs").where("acao", "==", "eleicao.resultado").get();
    expect(logs.size).toBe(1);
    const log = logs.docs[0].data();
    expect(log.uid).toBe("sistema:apuracao");
    expect(log.alvo).toBe(`elections/${id}`);
    expect(log.detalhes).toEqual({ aviso: true, titulo: "Eleição do síndico 2026", resultado: "Chapa ELEITA", numeros: "Sim 2 · Não 0 · Sem votar 1" });
    expect(JSON.stringify(log)).not.toMatch(/casa-\d|Casa \d|unidade/i);

    // Chamar de novo não divulga outra vez.
    expect((await finalizarEleicao(db, "a", id, new Date(fecha + DIA))).divulgou).toBe(false);
    expect((await db.collection("condominiums/a/auditLogs").where("acao", "==", "eleicao.resultado").get()).size).toBe(1);
  });

  it("chapa sem votos: NÃO eleita e todas as casas aptas são nulos", async () => {
    const fecha = T0 + 9 * HORA;
    const id = await chapa(T0 + HORA, fecha);
    const r = await finalizarEleicao(db, "a", id, new Date(fecha + CARENCIA_APURACAO_MS));
    expect(r.divulgou).toBe(true);
    expect(r.apuracao).toMatchObject({ modo: "chapa", eleita: false, nulos: 3, casasAptas: 3 });
    expect((await ref(id).get()).get("resultadoFinal")).toMatchObject({
      titulo: "Chapa NÃO eleita",
      numeros: "Sim 0 · Não 0 · Sem votar 3",
      eleita: false,
      nulos: 3,
    });
  });

  it("rascunho ou eleição que não existe: não divulga nada", async () => {
    const fecha = T0 + 9 * HORA;
    const rascunho = await chapa(T0 + HORA, fecha, false);
    const depois = new Date(fecha + DIA);
    expect(await finalizarEleicao(db, "a", rascunho, depois)).toEqual({ divulgou: false, apuracao: null });
    expect(await finalizarEleicao(db, "a", "nao-existe", depois)).toEqual({ divulgou: false, apuracao: null });
    expect((await db.collection("condominiums/a/auditLogs").where("acao", "==", "eleicao.resultado").get()).size).toBe(0);
  });
});

describe("situacaoDaCasa (a própria casa: votou? bloqueada?)", () => {
  it("votou e bloqueada certos; quem não é de uma casa recebe null", async () => {
    const id = await chapa(T0 + HORA, T0 + 9 * HORA);
    await salvarBloqueios(db, comissao, id, { adicionar: ["casa-3"], remover: [] });
    await votar("casa-1", "sim", new Date(T0 + 2 * HORA), id);
    const e = await lerEleicao(id);

    expect(await situacaoDaCasa({ condominioId: "a", unitId: "casa-1" }, e, db)).toEqual({ votou: true, bloqueada: false });
    expect(await situacaoDaCasa({ condominioId: "a", unitId: "casa-2" }, e, db)).toEqual({ votou: false, bloqueada: false });
    expect(await situacaoDaCasa({ condominioId: "a", unitId: "casa-3" }, e, db)).toEqual({ votou: false, bloqueada: true });
    expect(await situacaoDaCasa({ condominioId: "a", unitId: null }, e, db)).toBeNull();
  });
});

describe("bloqueio com a votação aberta", () => {
  it("salvarBloqueios recusa e a lista não muda", async () => {
    const id = await chapa(T0 + HORA, T0 + 9 * HORA);
    const dentro = new Date(T0 + 2 * HORA);
    await expect(salvarBloqueios(db, comissao, id, { adicionar: ["casa-1"], remover: [] }, dentro)).rejects.toThrow(/está aberta/);
    expect((await lerEleicao(id)).casasBloqueadas).toEqual([]);
    expect((await ref(id).get()).get("casasAptas")).toBe(3);
  });
});

describe("lista congelada de casas aptas (decisão de 21/11/2026)", () => {
  it("publicar grava a lista; antes de abrir ela acompanha o cadastro", async () => {
    const id = await chapa(T0 + HORA, T0 + 9 * HORA);
    expect((await ref(id).get()).get("casasAptasIds")).toEqual(["casa-1", "casa-2", "casa-3"]);
    // Agendada: inativar a casa 2 no cadastro refaz a lista (é o que o cadastro chama depois de gravar).
    await db.doc("condominiums/a/units/casa-2").update({ status: "inativa" });
    await recalcularAptasDasAgendadas("a", db);
    const e = await lerEleicao(id);
    expect(e.casasAptasIds).toEqual(["casa-1", "casa-3"]);
    expect(e.casasAptas).toBe(2);
  });

  it("com a votação aberta, o cadastro não muda quem vota: casa nova não vota, casa inativada depois ainda vota", async () => {
    const abre = T0 + HORA;
    const id = await chapa(abre, T0 + 9 * HORA);
    const dentro = new Date(abre + 30 * MINUTO);
    // Ativar/inativar casa é recusado com a votação aberta...
    await expect(conferirVotacaoAbertaAntesDoCadastro("a", db, dentro)).rejects.toThrow(/está aberta/);
    // ...e liberado antes de abrir.
    await expect(conferirVotacaoAbertaAntesDoCadastro("a", db, new Date(T0))).resolves.toBeUndefined();
    // Mesmo se alguém mudar o cadastro por fora, vale a lista congelada:
    await db.doc("condominiums/a/units/casa-1").update({ status: "inativa" });
    await db.doc("condominiums/a/units/casa-5").set({ rotulo: "Casa 5", numero: 5, status: "ativa" });
    await votar("casa-1", "sim", dentro, id);
    await expect(votar("casa-5", "sim", dentro, id)).rejects.toThrow(/não estava apta/);
    const p = await montarPainel("a", await lerEleicao(id), dentro, db);
    expect(p.casasAptas).toBe(3);
    expect(p.votaram).toBe(1);
  });
});

describe("divulgação de eleição antiga e ordem do destaque", () => {
  it("eleição encerrada há mais de 2 dias: marca como divulgada SEM aviso (e fora do sino)", async () => {
    const abre = T0 + HORA;
    const fecha = T0 + 2 * HORA;
    const id = await chapa(abre, fecha);
    await votar("casa-1", "sim", new Date(abre + MINUTO), id);
    const r = await finalizarEleicao(db, "a", id, new Date(fecha + 3 * DIA));
    expect(r.divulgou).toBe(true);
    const final = (await ref(id).get()).get("resultadoFinal");
    expect(final.semAviso).toBe(true);
    const logs = await db.collection("condominiums/a/auditLogs").where("acao", "==", "eleicao.resultado").get();
    expect(logs.docs[0].get("detalhes").aviso).toBe(false);
  });

  it("resultado que acabou de sair (até 2 dias) fica no topo antes de uma eleição agendada", async () => {
    const a = await chapa(T0 + HORA, T0 + 2 * HORA, true, "A");
    const b = await chapa(T0 + 5 * DIA, T0 + 5 * DIA + 8 * HORA, true, "B");
    expect((await eleicaoEmDestaque("a", new Date(T0 + 3 * HORA), db))?.id).toBe(a);
    // Três dias depois, a próxima agendada volta para o topo.
    expect((await eleicaoEmDestaque("a", new Date(T0 + 3 * DIA), db))?.id).toBe(b);
  });
});
