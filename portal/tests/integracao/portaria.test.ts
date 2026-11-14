/**
 * Portaria contra o simulador (npm run test:emu).
 * Confere as leituras por casa e a remoção de nomes antigos (LGPD).
 * As funções do servidor usam o adminDb() do projeto, por isso o projeto é definido antes.
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Firestore } from "firebase-admin/firestore";
import type { Contexto } from "@/server/contexto";
import { calcularPermissoes, type Papel } from "@/lib/permissoes";
import { hojeISO } from "@/lib/formato";
import { NOME_ANONIMIZADO, somarDias } from "@/lib/portaria";

const PROJETO = "demo-jardins-portaria";
process.env.FIREBASE_PROJECT_ID = PROJETO;

let db: Firestore;
let dados: typeof import("@/server/dados/portaria");

function ctx(papel: Papel, unitId: string | null = null): Contexto {
  return {
    uid: `u-${papel}`,
    nome: papel,
    condominioId: "a",
    condominioNome: "A",
    fuso: "America/Belem",
    papel,
    unitId,
    unidadeRotulo: unitId,
    permissoes: calcularPermissoes(papel),
    demo: true,
    precisaTrocarSenha: false,
  };
}

beforeAll(async () => {
  const admin = await import("@/server/firebase-admin");
  db = admin.adminDb();
  dados = await import("@/server/dados/portaria");
});

beforeEach(async () => {
  const host = process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080";
  await fetch(`http://${host}/emulator/v1/projects/${PROJETO}/databases/(default)/documents`, { method: "DELETE" });
});

const hoje = hojeISO(new Date(), "America/Belem");
const antigo = somarDias(hoje, -120);

async function visita(id: string, unitId: string, data: string, extra: Record<string, unknown> = {}) {
  await db.doc(`condominiums/a/visitors/${id}`).set({
    unitId,
    unidadeRotulo: unitId,
    nome: `Visitante ${id}`,
    tipo: "visita",
    data,
    validaAte: data,
    usoUnico: true,
    usos: 0,
    observacao: "placa ABC",
    codigoHash: `hash-${id}`,
    status: "ativa",
    anonimizado: false,
    criadoEm: new Date(),
    ...extra,
  });
}

describe("leituras por casa", () => {
  it("o morador só vê as autorizações da própria casa", async () => {
    await visita("v1", "casa-012", hoje);
    await visita("v2", "casa-045", hoje);
    const minhas = await dados.minhasAutorizacoes(ctx("morador", "casa-012"));
    expect(minhas.map((a) => a.id)).toEqual(["v1"]);
  });

  it("esperados hoje: só ativas que valem hoje", async () => {
    await visita("hoje", "casa-012", hoje);
    await visita("usada", "casa-012", hoje, { status: "usada" });
    await visita("amanha", "casa-012", somarDias(hoje, 1));
    const esperados = await dados.esperadosHoje(ctx("portaria"));
    expect(esperados.map((a) => a.id)).toEqual(["hoje"]);
  });

  it("morador não lê a lista da portaria", async () => {
    await expect(dados.dentroAgora(ctx("morador", "casa-012"))).rejects.toThrow();
  });
});

describe("LGPD: limparVisitantesAntigos", () => {
  it("remove o nome dos registros com mais de 90 dias, mantém os recentes e audita", async () => {
    await visita("velha", "casa-012", antigo);
    await visita("nova", "casa-012", hoje);
    await db.doc("condominiums/a/accessEvents/e1").set({ tipo: "entrada", nome: "Fulano", data: antigo, anonimizado: false, dentro: false });

    const r = await dados.limparVisitantesAntigos(ctx("admin"));
    expect(r).toMatchObject({ autorizacoes: 1, acessos: 1 });

    expect((await db.doc("condominiums/a/visitors/velha").get()).data()).toMatchObject({ nome: NOME_ANONIMIZADO, observacao: "", anonimizado: true });
    expect((await db.doc("condominiums/a/visitors/nova").get()).get("nome")).toBe("Visitante nova");
    const evento = await db.doc("condominiums/a/accessEvents/e1").get();
    expect(evento.exists).toBe(true); // o registro continua
    expect(evento.get("nome")).toBe(NOME_ANONIMIZADO);

    const logs = await db.collection("condominiums/a/auditLogs").get();
    expect(logs.docs.map((d) => d.get("acao"))).toContain("visitante.anonimizar");
  });

  it("portaria não pode rodar a limpeza", async () => {
    await expect(dados.limparVisitantesAntigos(ctx("portaria"))).rejects.toThrow();
  });
});
