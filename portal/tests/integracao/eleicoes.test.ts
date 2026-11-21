/**
 * Votação oficial contra o simulador (npm run test:emu):
 * 1 voto por CASA numa transação; nenhuma cédula individual guardada;
 * a urna não abre antes do encerramento; a auditoria não guarda a escolha.
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, Timestamp, getFirestore, type Firestore } from "firebase-admin/firestore";
import type { Contexto } from "@/server/contexto";
import {
  CARENCIA_APURACAO_MS,
  apuracaoLiberada,
  congelarListaSeFaltar,
  gravarEleicao,
  mudarStatusEleicao,
  obterEleicaoGestao,
  registrarVotoEleicao,
  salvarBloqueios,
} from "@/server/dados/eleicoes";
import { ultimosRegistrosDeAuditoria } from "@/server/dados/gestao";
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

    // A auditoria registra a casa e a via — nunca o candidato, nem a pessoa que votou.
    const logs = await db.collection("condominiums/a/auditLogs").where("acao", "==", "eleicao.votar").get();
    expect(logs.size).toBe(1);
    const log = logs.docs[0].data();
    expect(JSON.stringify(log)).not.toMatch(/"c2"|Candidato 2/);
    expect(log).toMatchObject({ uid: "voto:casa", nome: "Voto da casa", papel: null, detalhes: { unidade: "casa-1", via: "portal" } });
    expect(JSON.stringify(log)).not.toMatch(/"m1"/);

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
    await expect(registrarVotoEleicao(db, contexto("m3", "casa-3", "morador"), id, ["c1"])).rejects.toThrow(/não estava apta|não está ativa/);
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

describe("auditoria do voto (sigilo)", () => {
  /** Conselheiro que recebeu só o extra "ver a auditoria" (não cuida da votação). */
  const conselheiroAuditoria: Contexto = {
    ...contexto("conselheiro", null, "admin"),
    papel: "conselheiro",
    permissoes: calcularPermissoes("conselheiro", ["auditoria.ver"]),
  };

  it("quem não é da comissão vê só 'uma casa votou'; a comissão vê a casa — ninguém vê a pessoa", async () => {
    const id = await aberta({ modo: "chapa" });
    await registrarVotoEleicao(db, contexto("Maria da Casa 1", "casa-1", "morador"), id, ["sim"]);
    // Registro ANTIGO (de antes da correção), que ainda guardava o nome e o uid de quem votou.
    await db.collection("condominiums/a/auditLogs").add({
      condominioId: "a",
      uid: "uid-do-joao",
      nome: "João da Casa 2",
      papel: "morador",
      acao: "eleicao.votar",
      alvo: `elections/${id}`,
      detalhes: { unidade: "casa-2", via: "link" },
      criadoEm: Timestamp.fromMillis(Date.now() - 60_000),
    });

    expect(conselheiroAuditoria.permissoes.has("eleicoes.gerenciar")).toBe(false);
    // Quem não cuida da votação não vê os votos na lista (nem a hora: ao lado de "Fulano entrou
    // no portal", a hora deixaria adivinhar quem votou).
    const listaConselheiro = await ultimosRegistrosDeAuditoria(conselheiroAuditoria, 50, db);
    expect(listaConselheiro.filter((l) => l.acao === "eleicao.votar")).toHaveLength(0);
    expect(JSON.stringify(listaConselheiro)).not.toMatch(/Maria|João|uid-do-joao|casa-1|casa-2|Casa 1|Casa 2/);

    const daComissao = (await ultimosRegistrosDeAuditoria(comissao, 50, db)).filter((l) => l.acao === "eleicao.votar");
    expect(daComissao.map((l) => [l.nome, l.alvo, l.sigilo])).toEqual([
      ["Voto da casa", "Casa 1 · pelo portal", false],
      ["Voto da casa", "Casa 2 · pelo link", false],
    ]);
    expect(JSON.stringify(daComissao)).not.toMatch(/Maria|João|uid-do-joao/);

    // As outras ações continuam iguais para os dois.
    const publicar = (await ultimosRegistrosDeAuditoria(conselheiroAuditoria, 50, db)).find((l) => l.acao === "eleicao.publicar");
    expect(publicar).toMatchObject({ nome: "sindico", sigilo: false });
  });

  it("sem 'ver a auditoria', nem a lista abre", async () => {
    await expect(ultimosRegistrosDeAuditoria(contexto("m1", "casa-1", "morador"), 50, db)).rejects.toThrow();
  });
});

/*
 * Eleição publicada ANTES de existir a lista congelada (é o caso da eleição real de 29/11/2026):
 * - aberta sem a lista, vale o cadastro de agora (ativa vota; inativa e bloqueada, não);
 * - agendada sem a lista, a lista é gravada quando a comissão abre a tela da eleição.
 */
describe("eleição sem a lista congelada (casasAptasIds)", () => {
  const semLista = (id: string) => ref(id).update({ casasAptasIds: FieldValue.delete() });

  it("aberta sem a lista: casa ativa vota; inativa e bloqueada não", async () => {
    const id = await aberta({ modo: "chapa" });
    await semLista(id);
    // A comissão bloqueou a casa 2 antes de abrir (gravado direto: com a votação aberta, a tela recusa).
    await ref(id).update({ casasBloqueadas: ["casa-2"] });
    expect((await ref(id).get()).get("casasAptasIds")).toBeUndefined();

    await registrarVotoEleicao(db, contexto("m1", "casa-1", "morador"), id, ["sim"]);
    await expect(registrarVotoEleicao(db, contexto("m3", "casa-3", "morador"), id, ["sim"])).rejects.toThrow(/não está ativa/);
    await expect(registrarVotoEleicao(db, contexto("m2", "casa-2", "morador"), id, ["nao"])).rejects.toThrow(/não está liberada/);
    expect(await urnaDe(id)).toEqual({ cedulas: 1, sim: 1, nao: 0, brancos: 0, votos: {} });
  });

  it("agendada sem a lista: ao abrir a tela da comissão, a lista é gravada (ativas − bloqueadas) uma vez só", async () => {
    const agora = Date.now();
    const id = await eleicao(new Date(agora + HORA), new Date(agora + 9 * HORA), { modo: "chapa" });
    await mudarStatusEleicao(db, comissao, id, "publicar");
    await semLista(id);
    await ref(id).update({ casasBloqueadas: ["casa-2"], casasAptas: 99 });

    const tela = await obterEleicaoGestao(comissao, id);
    expect(tela?.casasAptas).toBe(1);
    const doc = await ref(id).get();
    expect(doc.get("casasAptasIds")).toEqual(["casa-1"]);
    expect(doc.get("casasAptas")).toBe(1);

    // Já tem a lista: abrir de novo (ou duas telas ao mesmo tempo) não grava outra vez.
    await Promise.all([obterEleicaoGestao(comissao, id), congelarListaSeFaltar(db, "a", id)]);
    expect(await congelarListaSeFaltar(db, "a", id)).toBeNull();
    const logs = await db.collection("condominiums/a/auditLogs").where("uid", "==", "sistema:lista-aptas").get();
    expect(logs.size).toBe(1);
    expect(logs.docs[0].get("acao")).toBe("eleicao.bloqueio");

    // Com a lista gravada, vale ela: a casa 2 (bloqueada) e a casa 3 (inativa) não votam; a 1 vota.
    const dentro = new Date(agora + 2 * HORA);
    await registrarVotoEleicao(db, contexto("m1", "casa-1", "morador"), id, ["sim"], dentro);
    await expect(registrarVotoEleicao(db, contexto("m2", "casa-2", "morador"), id, ["sim"], dentro)).rejects.toThrow(/não está liberada/);
    await expect(registrarVotoEleicao(db, contexto("m3", "casa-3", "morador"), id, ["sim"], dentro)).rejects.toThrow(/não estava apta/);
  });

  it("duas telas ao mesmo tempo: só uma grava a lista", async () => {
    const agora = Date.now();
    const id = await eleicao(new Date(agora + HORA), new Date(agora + 9 * HORA), { modo: "chapa" });
    await mudarStatusEleicao(db, comissao, id, "publicar");
    await semLista(id);
    const r = await Promise.all([congelarListaSeFaltar(db, "a", id), congelarListaSeFaltar(db, "a", id)]);
    expect(r.filter((x) => x !== null)).toHaveLength(1);
    expect((await ref(id).get()).get("casasAptasIds")).toEqual(["casa-1", "casa-2"]);
    const logs = await db.collection("condominiums/a/auditLogs").where("uid", "==", "sistema:lista-aptas").get();
    expect(logs.size).toBe(1);
  });

  it("aberta, encerrada ou rascunho sem a lista: nada é gravado", async () => {
    const agora = Date.now();
    const id = await aberta({ modo: "chapa" });
    await semLista(id);
    expect(await congelarListaSeFaltar(db, "a", id)).toBeNull();
    await obterEleicaoGestao(comissao, id);
    expect((await ref(id).get()).get("casasAptasIds")).toBeUndefined();

    // Mesma eleição agendada, mas com a hora simulada depois do encerramento.
    const futura = await eleicao(new Date(agora + HORA), new Date(agora + 9 * HORA), { modo: "chapa" });
    await mudarStatusEleicao(db, comissao, futura, "publicar");
    await semLista(futura);
    expect(await congelarListaSeFaltar(db, "a", futura, new Date(agora + 10 * HORA))).toBeNull();
    expect((await ref(futura).get()).get("casasAptasIds")).toBeUndefined();

    const rascunho = await eleicao(new Date(agora + HORA), new Date(agora + 9 * HORA));
    expect(await congelarListaSeFaltar(db, "a", rascunho)).toBeNull();
    expect((await ref(rascunho).get()).get("casasAptasIds")).toBeUndefined();
  });
});

/*
 * Bloqueio (decisão de 21/11/2026): a comissão bloqueia e desbloqueia casas só ANTES de a
 * votação abrir (rascunho ou agendada). Com a votação aberta, a lista fica congelada.
 * Por isso os testes criam a eleição AGENDADA (abre daqui a 1 hora), mexem no bloqueio
 * com a hora real e votam com a hora simulada DENTRO do horário (registrarVotoEleicao e
 * salvarBloqueios aceitam a hora como último parâmetro).
 */
describe("bloqueio de casas", () => {
  /** Chapa publicada que abre daqui a 1 hora e fecha daqui a 9 horas. */
  async function agendada(): Promise<{ id: string; dentro: Date }> {
    const agora = Date.now();
    const id = await eleicao(new Date(agora + HORA), new Date(agora + 9 * HORA), { modo: "chapa" });
    await mudarStatusEleicao(db, comissao, id, "publicar");
    // Uma hora simulada com a votação ABERTA (2 horas depois de agora).
    return { id, dentro: new Date(agora + 2 * HORA) };
  }

  it("casa bloqueada antes de abrir não vota; as outras votam; casas aptas descontam as bloqueadas", async () => {
    const { id, dentro } = await agendada();
    expect((await ref(id).get()).get("casasAptas")).toBe(2);
    const r = await salvarBloqueios(db, comissao, id, { adicionar: ["casa-1", "casa-inexistente"], remover: [] });
    expect(r).toEqual({ bloqueadas: 1, casasAptas: 1 });
    expect((await ref(id).get()).get("casasBloqueadas")).toEqual(["casa-1"]);
    expect((await ref(id).get()).get("casasAptas")).toBe(1);

    await expect(registrarVotoEleicao(db, contexto("m1", "casa-1", "morador"), id, ["sim"], dentro)).rejects.toThrow(/não está liberada/);
    await registrarVotoEleicao(db, contexto("m2", "casa-2", "morador"), id, ["sim"], dentro);
    expect(await urnaDe(id)).toEqual({ cedulas: 1, sim: 1, nao: 0, brancos: 0, votos: {} });
  });

  it("desbloqueada antes de abrir, a casa volta a poder votar", async () => {
    const { id, dentro } = await agendada();
    await salvarBloqueios(db, comissao, id, { adicionar: ["casa-1"], remover: [] });
    const r = await salvarBloqueios(db, comissao, id, { adicionar: [], remover: ["casa-1"] });
    expect(r).toEqual({ bloqueadas: 0, casasAptas: 2 });
    expect((await ref(id).get()).get("casasBloqueadas")).toEqual([]);

    await registrarVotoEleicao(db, contexto("m1", "casa-1", "morador"), id, ["nao"], dentro);
    await registrarVotoEleicao(db, contexto("m2", "casa-2", "morador"), id, ["sim"], dentro);
    expect(await urnaDe(id)).toEqual({ cedulas: 2, sim: 1, nao: 1, brancos: 0, votos: {} });
  });

  it("com a votação ABERTA, bloquear e desbloquear são recusados e a lista não muda", async () => {
    const { id, dentro } = await agendada();
    await salvarBloqueios(db, comissao, id, { adicionar: ["casa-1"], remover: [] });

    await expect(salvarBloqueios(db, comissao, id, { adicionar: ["casa-2"], remover: [] }, dentro)).rejects.toThrow(/está aberta/);
    await expect(salvarBloqueios(db, comissao, id, { adicionar: [], remover: ["casa-1"] }, dentro)).rejects.toThrow(/está aberta/);
    // Mesmo "sem mudança nenhuma" a lista não é regravada com a votação aberta.
    await expect(salvarBloqueios(db, comissao, id, { adicionar: [], remover: [] }, dentro)).rejects.toThrow(/está aberta/);

    const doc = await ref(id).get();
    expect(doc.get("casasBloqueadas")).toEqual(["casa-1"]);
    expect(doc.get("casasAptas")).toBe(1);
    // Só o bloqueio de antes de abrir foi registrado.
    const logs = await db.collection("condominiums/a/auditLogs").where("acao", "==", "eleicao.bloqueio").get();
    expect(logs.size).toBe(1);

    // Também numa eleição aberta pela hora real (sem hora simulada).
    const real = await aberta({ modo: "chapa" });
    await expect(salvarBloqueios(db, comissao, real, { adicionar: ["casa-1"], remover: [] })).rejects.toThrow(/está aberta/);
    expect((await ref(real).get()).get("casasBloqueadas") ?? []).toEqual([]);
  });

  it("casa que já votou não pode ser bloqueada (corrida no minuto da abertura)", async () => {
    const { id } = await agendada();
    // Simula um voto que entrou no mesmo instante em que a comissão tentou bloquear.
    await ref(id).collection("votantes").doc("casa-2").set({ unidadeRotulo: "Casa 2" });
    await expect(salvarBloqueios(db, comissao, id, { adicionar: ["casa-2"], remover: [] })).rejects.toThrow(/já votou/);
    expect((await ref(id).get()).get("casasBloqueadas") ?? []).toEqual([]);
  });

  it("duas pessoas da comissão: uma não desfaz o bloqueio da outra", async () => {
    const { id } = await agendada();
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
