/**
 * Os dados fictícios da demonstração (scripts/demo-modulos.ts) são lidos certo
 * pelas funções de dados dos módulos, e o morador demo só vê o que pode.
 * Roda no simulador (npm run test:emu).
 */
import { beforeAll, describe, expect, it } from "vitest";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import type { Contexto } from "@/server/contexto";
import { calcularPermissoes } from "@/lib/permissoes";
import { hojeISO } from "@/lib/formato";
import { semearAreasDemo, semearModulosDemo } from "../../scripts/demo-modulos";
import { listarPublicados, listarParaGestao } from "@/server/dados/comunicados";
import { solicitacoesDaMinhaCasa, solicitacaoDaMinhaCasa, numerosDasSolicitacoes } from "@/server/dados/solicitacoes";
import { documentosVisiveis } from "@/server/dados/documentos";
import { listarEnquetesMorador } from "@/server/dados/enquetes";
import { anunciosPublicados, meusAnuncios, numerosClassificados } from "@/server/dados/classificados";
import { listarAreas, numerosDaAgenda, cancelamentosTardios } from "@/server/dados/reservas";

const PROJETO = "demo-jardins-demo-modulos";
const C = "demo";
let db: Firestore;

function contexto(uid: string, unitId: string | null, papel: "morador" | "admin"): Contexto {
  return {
    uid,
    nome: uid,
    condominioId: C,
    condominioNome: "Demo",
    fuso: "America/Belem",
    papel,
    unitId,
    unidadeRotulo: unitId,
    permissoes: calcularPermissoes(papel),
    demo: true,
    precisaTrocarSenha: false,
  };
}
const morador = contexto("morador-demo", "casa-012", "morador");
const sindico = contexto("sindico-demo", null, "admin");

beforeAll(async () => {
  // As funções de dados usam o app PADRÃO do Admin SDK (adminDb()).
  process.env.FIREBASE_PROJECT_ID = PROJETO;
  process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9099";
  const app = getApps().find((a) => a.name === "[DEFAULT]") ?? initializeApp({ projectId: PROJETO });
  db = getFirestore(app);
  const host = process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080";
  await fetch(`http://${host}/emulator/v1/projects/${PROJETO}/databases/(default)/documents`, { method: "DELETE" });

  await db.doc(`condominiums/${C}`).set({ nome: "Demo", status: "ativo", fuso: "America/Belem" });
  for (const u of ["casa-001", "casa-002", "casa-012", "casa-045", "casa-120"]) {
    await db.doc(`condominiums/${C}/units/${u}`).set({ rotulo: u, status: "ativa" });
  }
  const lote = db.batch();
  const pessoas = {
    hoje: hojeISO(new Date(), "America/Belem"),
    adminUid: sindico.uid,
    adminNome: "Síndico Demo",
    moradorUid: morador.uid,
    moradorNome: "Ana Demonstração",
  };
  semearAreasDemo(db, lote, `condominiums/${C}`, pessoas);
  semearModulosDemo(db, lote, `condominiums/${C}`, pessoas);
  await lote.commit();
});

describe("dados de demonstração dos módulos", () => {
  it("comunicados: o morador vê os 2 publicados (o urgente entre eles); o síndico vê também o rascunho", async () => {
    const pub = await listarPublicados(morador);
    expect(pub).toHaveLength(2);
    expect(pub.some((c) => c.prioridade === "urgente")).toBe(true);
    expect(await listarParaGestao(sindico)).toHaveLength(3);
  });

  it("solicitações: a Casa 12 vê só as próprias, sem a nota interna", async () => {
    const minhas = await solicitacoesDaMinhaCasa(morador);
    expect(minhas.map((s) => s.status).sort()).toEqual(["aberta", "em_andamento"]);
    const detalhe = await solicitacaoDaMinhaCasa(morador, "demo-sol-2");
    expect(detalhe?.linhaDoTempo.length).toBe(2); // a nota interna fica de fora
    expect(await solicitacaoDaMinhaCasa(morador, "demo-sol-1")).toBeNull(); // de outra casa
    const n = await numerosDasSolicitacoes(sindico);
    expect(n).toMatchObject({ abertas: 1, emAndamento: 1 });
  });

  it("documentos, enquetes e classificados", async () => {
    expect(await documentosVisiveis(morador)).toHaveLength(3);

    const enquetes = await listarEnquetesMorador(morador);
    expect(enquetes).toHaveLength(2);
    const aberta = enquetes.find((e) => e.id === "demo-enquete-aberta")!;
    expect(aberta.meuVoto).toBeNull(); // a Casa 12 ainda pode votar
    const encerrada = enquetes.find((e) => e.id === "demo-enquete-encerrada")!;
    expect(encerrada.meuVoto?.opcaoTexto).toBe("Sim");

    const anuncios = await anunciosPublicados(morador);
    expect(anuncios).toHaveLength(2);
    expect(JSON.stringify(anuncios)).not.toMatch(/casa-|autorUid|unitId/);
    expect(await meusAnuncios(morador)).toHaveLength(2);
    expect(await numerosClassificados(sindico)).toEqual({ pendentes: 1, publicados: 2 });
  });

  it("áreas reais e reservas de exemplo", async () => {
    const areas = await listarAreas(morador);
    expect(areas.map((a) => a.id).sort()).toEqual(["area-de-lazer", "carrinho-de-mao", "quadra", "rocadeira"]);
    expect((await numerosDaAgenda(sindico)).pendentes).toBe(2);
    expect((await cancelamentosTardios(sindico)).map((r) => r.id)).toEqual(["demo-res-4"]);
  });
});
