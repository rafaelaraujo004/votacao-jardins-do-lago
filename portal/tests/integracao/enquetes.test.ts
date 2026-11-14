/**
 * Enquetes contra o simulador (npm run test:emu): 1 voto por CASA, numa
 * transação; a auditoria não guarda a opção escolhida.
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import type { Contexto } from "@/server/contexto";
import { gravarEnquete, mudarStatusEnquete, registrarVoto } from "@/server/dados/enquetes";
import { calcularPermissoes } from "@/lib/permissoes";

const PROJETO = "demo-jardins-enquetes";
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

const sindico = contexto("sindico", null, "admin");
const HORA = 3_600_000;

async function enqueteAberta(): Promise<string> {
  const id = await gravarEnquete(db, sindico, {
    id: "",
    pergunta: "Qual o melhor dia?",
    descricao: "",
    opcoes: [
      { id: "o1", texto: "Sábado" },
      { id: "o2", texto: "Domingo" },
    ],
    abreEm: new Date(Date.now() - HORA),
    fechaEm: new Date(Date.now() + 48 * HORA),
    resultado: "apos_encerrar",
  });
  await mudarStatusEnquete(db, sindico, id, "publicar");
  return id;
}

beforeEach(async () => {
  await limpar();
  await db.doc("condominiums/a").set({ nome: "A", status: "ativo", fuso: "America/Belem" });
  await db.doc("condominiums/a/units/casa-1").set({ rotulo: "Casa 1", status: "ativa" });
  await db.doc("condominiums/a/units/casa-2").set({ rotulo: "Casa 2", status: "inativa" });
});

describe("registrarVoto", () => {
  it("conta 1 voto por casa e não aceita o segundo da mesma casa", async () => {
    const id = await enqueteAberta();
    await registrarVoto(db, contexto("m1", "casa-1", "morador"), id, "o2");
    await expect(registrarVoto(db, contexto("m1b", "casa-1", "morador"), id, "o1")).rejects.toThrow(/já votou/);

    const enquete = await db.doc(`condominiums/a/polls/${id}`).get();
    expect(enquete.get("totalVotos")).toBe(1);
    expect(enquete.get("totais")).toEqual({ o1: 0, o2: 1 });
    expect((await db.doc(`condominiums/a/polls/${id}/votes/casa-1`).get()).get("opcaoId")).toBe("o2");
  });

  it("dois moradores da mesma casa ao mesmo tempo: só um voto vale", async () => {
    const id = await enqueteAberta();
    const r = await Promise.allSettled([
      registrarVoto(db, contexto("m1", "casa-1", "morador"), id, "o1"),
      registrarVoto(db, contexto("m1b", "casa-1", "morador"), id, "o2"),
    ]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect((await db.doc(`condominiums/a/polls/${id}`).get()).get("totalVotos")).toBe(1);
  });

  it("recusa casa inativa, rascunho e enquete encerrada", async () => {
    const id = await enqueteAberta();
    await expect(registrarVoto(db, contexto("m2", "casa-2", "morador"), id, "o1")).rejects.toThrow(/não está ativa/);

    await mudarStatusEnquete(db, sindico, id, "encerrar");
    await expect(registrarVoto(db, contexto("m1", "casa-1", "morador"), id, "o1")).rejects.toThrow(/encerrada/);

    const rascunho = await gravarEnquete(db, sindico, {
      id: "",
      pergunta: "Rascunho de teste",
      descricao: "",
      opcoes: [
        { id: "o1", texto: "A" },
        { id: "o2", texto: "B" },
      ],
      abreEm: new Date(Date.now() - HORA),
      fechaEm: new Date(Date.now() + HORA),
      resultado: "sempre",
    });
    await expect(registrarVoto(db, contexto("m1", "casa-1", "morador"), rascunho, "o1")).rejects.toThrow(/não encontrada/);
  });

  it("a auditoria registra que a casa votou, sem a opção", async () => {
    const id = await enqueteAberta();
    await registrarVoto(db, contexto("m1", "casa-1", "morador"), id, "o2");
    const logs = await db.collection("condominiums/a/auditLogs").where("acao", "==", "enquete.votar").get();
    expect(logs.size).toBe(1);
    const detalhes = logs.docs[0].get("detalhes") as Record<string, unknown>;
    expect(detalhes).toEqual({ unidade: "casa-1" });
  });
});
