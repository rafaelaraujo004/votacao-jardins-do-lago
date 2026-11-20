/**
 * Votação oficial contra o simulador (npm run test:emu):
 * 1 voto por CASA numa transação; nenhuma cédula individual guardada;
 * a urna não abre antes do encerramento; a auditoria não guarda a escolha.
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import type { Contexto } from "@/server/contexto";
import {
  CARENCIA_APURACAO_MS,
  apuracaoLiberada,
  gravarEleicao,
  mudarStatusEleicao,
  registrarVotoEleicao,
  salvarBloqueios,
} from "@/server/dados/eleicoes";
import { calcularPermissoes } from "@/lib/permissoes";
import { somarUrna, type Candidato } from "@/lib/eleicoes";

const PROJETO = "demo-jardins-eleicoes";
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
const cand = (n: number): Candidato => ({ id: `c${n}`, numero: n, nome: `Candidato ${n}`, funcao: "", casa: "", apresentacao: "", nascimento: null });

async function eleicao(abreEm: Date, fechaEm: Date, extra: Partial<{ escolhasPorCasa: number; permiteBranco: boolean; modo: "chapa" | "candidatos" }> = {}) {
  const id = await gravarEleicao(db, comissao, {
    id: null,
    titulo: "Eleição da Comissão",
    cargo: "Comissão Eleitoral",
    modo: extra.modo ?? "candidatos",
    vagas: 3,
    escolhasPorCasa: extra.escolhasPorCasa ?? 1,
    permiteBranco: extra.permiteBranco ?? true,
    regraDesempate: "comissao",
    abreEm,
    fechaEm,
    candidatos: [cand(1), cand(2), cand(3)],
  });
  return id;
}

async function aberta(extra?: Partial<{ escolhasPorCasa: number; permiteBranco: boolean; modo: "chapa" | "candidatos" }>) {
  const id = await eleicao(new Date(Date.now() - HORA), new Date(Date.now() + 8 * HORA), extra);
  await mudarStatusEleicao(db, comissao, id, "publicar");
  return id;
}

const ref = (id: string) => db.doc(`condominiums/a/elections/${id}`);
/** Contadores da urna (documento único "contagem"; lidos com a mesma função da apuração). */
async function urnaDe(id: string) {
  const snap = await ref(id).collection("urna").get();
  return somarUrna(snap.docs.map((d) => d.data()));
}

beforeEach(async () => {
  await limpar();
  await db.doc("condominiums/a").set({ nome: "A", status: "ativo", fuso: "America/Belem" });
  await db.doc("condominiums/a/units/casa-1").set({ rotulo: "Casa 1", status: "ativa" });
  await db.doc("condominiums/a/units/casa-2").set({ rotulo: "Casa 2", status: "ativa" });
  await db.doc("condominiums/a/units/casa-3").set({ rotulo: "Casa 3", status: "inativa" });
});

describe("registrarVotoEleicao", () => {
  it("soma na urna, marca a casa e NÃO guarda a escolha em lugar nenhum", async () => {
    const id = await aberta();
    await registrarVotoEleicao(db, contexto("m1", "casa-1", "morador"), id, ["c2"]);

    expect(await urnaDe(id)).toEqual({ cedulas: 1, sim: 0, nao: 0, brancos: 0, votos: { c2: 1 } });

    const votante = (await ref(id).collection("votantes").doc("casa-1").get()).data()!;
    expect(Object.keys(votante).sort()).toEqual(["comprovante", "unidadeRotulo", "votouEm"]);
    expect(JSON.stringify(votante)).not.toMatch(/c2|m1/);

    // A auditoria registra a casa, nunca o candidato.
    const logs = await db.collection("condominiums/a/auditLogs").where("acao", "==", "eleicao.votar").get();
    expect(logs.size).toBe(1);
    expect(JSON.stringify(logs.docs[0].data())).not.toMatch(/"c2"|Candidato 2/);

    // Só existem os documentos esperados (nenhuma cédula individual).
    const subs = await ref(id).listCollections();
    expect(subs.map((s) => s.id).sort()).toEqual(["urna", "votantes"]);
    const partes = await ref(id).collection("urna").get();
    expect(partes.size).toBe(1);
    // A urna é um documento só, com contadores (nunca quem votou nem a casa).
    expect(partes.docs[0].id).toBe("contagem");
    expect(Object.keys(partes.docs[0].data()).sort()).toEqual(["cedulas", "votos"]);
  });

  it("a mesma casa não vota duas vezes (nem por outra pessoa da casa)", async () => {
    const id = await aberta();
    await registrarVotoEleicao(db, contexto("m1", "casa-1", "morador"), id, ["c1"]);
    await expect(registrarVotoEleicao(db, contexto("m1b", "casa-1", "morador"), id, ["c2"])).rejects.toThrow(/já votou/);
    expect((await urnaDe(id)).cedulas).toBe(1);
  });

  it("duas pessoas da mesma casa ao mesmo tempo: só um voto vale", async () => {
    const id = await aberta();
    const r = await Promise.allSettled([
      registrarVotoEleicao(db, contexto("m1", "casa-1", "morador"), id, ["c1"]),
      registrarVotoEleicao(db, contexto("m1b", "casa-1", "morador"), id, ["c2"]),
    ]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    const urna = await urnaDe(id);
    expect(urna.cedulas).toBe(1);
    expect((urna.votos.c1 ?? 0) + (urna.votos.c2 ?? 0)).toBe(1);
  });

  it("voto em branco e várias escolhas somam certo", async () => {
    const id = await aberta({ escolhasPorCasa: 2 });
    await registrarVotoEleicao(db, contexto("m1", "casa-1", "morador"), id, ["branco"]);
    await registrarVotoEleicao(db, contexto("m2", "casa-2", "morador"), id, ["c1", "c3"]);
    expect(await urnaDe(id)).toEqual({ cedulas: 2, sim: 0, nao: 0, brancos: 1, votos: { c1: 1, c3: 1 } });
  });

  it("recusa: sem casa, casa inativa, antes de abrir, depois de fechar, rascunho e escolha inválida", async () => {
    const id = await aberta();
    await expect(registrarVotoEleicao(db, contexto("x", null, "morador"), id, ["c1"])).rejects.toThrow(/não está ligado/);
    await expect(registrarVotoEleicao(db, contexto("m3", "casa-3", "morador"), id, ["c1"])).rejects.toThrow(/não está ativa/);
    await expect(registrarVotoEleicao(db, contexto("m1", "casa-1", "morador"), id, ["c9"])).rejects.toThrow(/não existe/);
    await expect(registrarVotoEleicao(db, contexto("m1", "casa-1", "morador"), id, ["c1", "c2"])).rejects.toThrow(/só 1/);
    await expect(registrarVotoEleicao(db, contexto("m1", "casa-1", "morador"), id, ["c1"], new Date(Date.now() - 2 * HORA))).rejects.toThrow(/ainda não abriu/);
    await expect(registrarVotoEleicao(db, contexto("m1", "casa-1", "morador"), id, ["c1"], new Date(Date.now() + 9 * HORA))).rejects.toThrow(/encerrou/);

    const rascunho = await eleicao(new Date(Date.now() - HORA), new Date(Date.now() + HORA));
    await expect(registrarVotoEleicao(db, contexto("m1", "casa-1", "morador"), rascunho, ["c1"])).rejects.toThrow(/não encontrada/);

    // Nada foi contado.
    expect((await ref(id).collection("urna").get()).size).toBe(0);
    expect((await ref(id).collection("votantes").get()).size).toBe(0);
  });

  it("morador não pode votar com permissão de comissão faltando (e a comissão sem casa não vota)", async () => {
    const id = await aberta();
    await expect(registrarVotoEleicao(db, comissao, id, ["c1"])).rejects.toThrow();
  });
});

describe("comissão", () => {
  it("publicada não pode ser editada; volta a rascunho só antes de abrir", async () => {
    const futura = await eleicao(new Date(Date.now() + 24 * HORA), new Date(Date.now() + 30 * HORA));
    await mudarStatusEleicao(db, comissao, futura, "publicar");
    expect((await ref(futura).get()).get("casasAptas")).toBe(2);
    await expect(
      gravarEleicao(db, comissao, {
        id: futura,
        titulo: "Mudada",
        cargo: "X",
        modo: "candidatos",
        vagas: 1,
        escolhasPorCasa: 1,
        permiteBranco: false,
        regraDesempate: "comissao",
        abreEm: new Date(),
        fechaEm: new Date(Date.now() + HORA),
        candidatos: [cand(1)],
      }),
    ).rejects.toThrow(/já foi publicada/);
    await mudarStatusEleicao(db, comissao, futura, "rascunho");
    expect((await ref(futura).get()).get("status")).toBe("rascunho");

    const id = await aberta();
    await expect(mudarStatusEleicao(db, comissao, id, "rascunho")).rejects.toThrow(/já abriu/);
  });

  it("com qualquer voto na urna, a eleição nunca volta a rascunho (corrida no minuto da abertura)", async () => {
    const futura = await eleicao(new Date(Date.now() + 24 * HORA), new Date(Date.now() + 30 * HORA));
    await mudarStatusEleicao(db, comissao, futura, "publicar");
    // Simula um voto que entrou no mesmo instante em que a comissão tentou despublicar.
    await ref(futura).collection("urna").doc("contagem").set({ cedulas: 1, votos: { c1: 1 } });
    await expect(mudarStatusEleicao(db, comissao, futura, "rascunho")).rejects.toThrow(/já recebeu votos/);
    expect((await ref(futura).get()).get("status")).toBe("publicada");
  });

  it("a urna só abre 2 minutos depois do encerramento", () => {
    const e = { status: "publicada" as const, abreEm: new Date(0), fechaEm: new Date(10 * HORA) };
    expect(apuracaoLiberada(e, new Date(10 * HORA))).toBe(false);
    expect(apuracaoLiberada(e, new Date(10 * HORA + CARENCIA_APURACAO_MS - 1))).toBe(false);
    expect(apuracaoLiberada(e, new Date(10 * HORA + CARENCIA_APURACAO_MS))).toBe(true);
    expect(apuracaoLiberada({ ...e, status: "rascunho" }, new Date(20 * HORA))).toBe(false);
  });

  it("não publica sem casas ativas nem com o encerramento no passado", async () => {
    const passada = await eleicao(new Date(Date.now() - 3 * HORA), new Date(Date.now() - HORA));
    await expect(mudarStatusEleicao(db, comissao, passada, "publicar")).rejects.toThrow(/já passou/);
    await db.doc("condominiums/a/units/casa-1").set({ rotulo: "Casa 1", status: "inativa" });
    await db.doc("condominiums/a/units/casa-2").set({ rotulo: "Casa 2", status: "inativa" });
    const id = await eleicao(new Date(Date.now() - HORA), new Date(Date.now() + HORA));
    await expect(mudarStatusEleicao(db, comissao, id, "publicar")).rejects.toThrow(/casas ativas/);
  });

  it("morador não cria nem publica eleição", async () => {
    const morador = contexto("m1", "casa-1", "morador");
    await expect(
      gravarEleicao(db, morador, {
        id: null,
        titulo: "Golpe",
        cargo: "X",
        modo: "candidatos",
        vagas: 1,
        escolhasPorCasa: 1,
        permiteBranco: true,
        regraDesempate: "comissao",
        abreEm: new Date(),
        fechaEm: new Date(Date.now() + HORA),
        candidatos: [cand(1)],
      }),
    ).rejects.toThrow();
    const id = await eleicao(new Date(Date.now() - HORA), new Date(Date.now() + HORA));
    await expect(mudarStatusEleicao(db, morador, id, "publicar")).rejects.toThrow();
  });
});

describe("chapa única", () => {
  it("cada casa vota Sim ou Não uma vez; a urna guarda só os totais", async () => {
    const id = await aberta({ modo: "chapa" });
    await registrarVotoEleicao(db, contexto("m1", "casa-1", "morador"), id, ["sim"]);
    await registrarVotoEleicao(db, contexto("m2", "casa-2", "morador"), id, ["nao"]);
    await expect(registrarVotoEleicao(db, contexto("m1b", "casa-1", "morador"), id, ["sim"])).rejects.toThrow(/já votou/);
    expect(await urnaDe(id)).toEqual({ cedulas: 2, sim: 1, nao: 1, brancos: 0, votos: {} });
    const votante = (await ref(id).collection("votantes").doc("casa-1").get()).data()!;
    expect(JSON.stringify(votante)).not.toMatch(/sim|nao/);
  });

  it("recusa voto em candidato ou em branco na chapa", async () => {
    const id = await aberta({ modo: "chapa" });
    await expect(registrarVotoEleicao(db, contexto("m1", "casa-1", "morador"), id, ["c1"])).rejects.toThrow(/Sim ou Não/);
    await expect(registrarVotoEleicao(db, contexto("m1", "casa-1", "morador"), id, ["branco"])).rejects.toThrow(/Sim ou Não/);
  });
});

describe("bloqueio de casas", () => {
  it("casa bloqueada não vota; as outras votam; casas aptas descontam as bloqueadas", async () => {
    const id = await aberta({ modo: "chapa" });
    expect((await ref(id).get()).get("casasAptas")).toBe(2);
    const r = await salvarBloqueios(db, comissao, id, { adicionar: ["casa-1", "casa-inexistente"], remover: [] });
    expect(r).toEqual({ bloqueadas: 1, casasAptas: 1 });
    expect((await ref(id).get()).get("casasBloqueadas")).toEqual(["casa-1"]);

    await expect(registrarVotoEleicao(db, contexto("m1", "casa-1", "morador"), id, ["sim"])).rejects.toThrow(/não está liberada/);
    await registrarVotoEleicao(db, contexto("m2", "casa-2", "morador"), id, ["sim"]);

    // Desbloqueou: a casa volta a poder votar.
    await salvarBloqueios(db, comissao, id, { adicionar: [], remover: ["casa-1"] });
    await registrarVotoEleicao(db, contexto("m1", "casa-1", "morador"), id, ["nao"]);
    expect(await urnaDe(id)).toEqual({ cedulas: 2, sim: 1, nao: 1, brancos: 0, votos: {} });

    // Casa que já votou não pode ser bloqueada (a ata ficaria com números errados).
    await expect(salvarBloqueios(db, comissao, id, { adicionar: ["casa-2"], remover: [] })).rejects.toThrow(/já votou/);
  });

  it("duas pessoas da comissão: uma não desfaz o bloqueio da outra", async () => {
    const id = await aberta({ modo: "chapa" });
    await salvarBloqueios(db, comissao, id, { adicionar: ["casa-1"], remover: [] });
    // A outra pessoa, com a tela antiga, só bloqueia a casa 2.
    await salvarBloqueios(db, comissao, id, { adicionar: ["casa-2"], remover: [] });
    expect((await ref(id).get()).get("casasBloqueadas")).toEqual(["casa-1", "casa-2"]);
    expect((await ref(id).get()).get("casasAptas")).toBe(0);
  });

  it("bloqueio no rascunho vale na publicação; depois de encerrada não muda; morador não bloqueia", async () => {
    const id = await eleicao(new Date(Date.now() + HORA), new Date(Date.now() + 9 * HORA), { modo: "chapa" });
    await salvarBloqueios(db, comissao, id, { adicionar: ["casa-2"], remover: [] });
    await mudarStatusEleicao(db, comissao, id, "publicar");
    expect((await ref(id).get()).get("casasAptas")).toBe(1);

    await expect(salvarBloqueios(db, contexto("m1", "casa-1", "morador"), id, { adicionar: [], remover: ["casa-2"] })).rejects.toThrow();
    await expect(salvarBloqueios(db, comissao, id, { adicionar: [], remover: ["casa-2"] }, new Date(Date.now() + 10 * HORA))).rejects.toThrow(/encerrou/);

    const logs = await db.collection("condominiums/a/auditLogs").where("acao", "==", "eleicao.bloqueio").get();
    expect(logs.size).toBe(1);
  });
});
