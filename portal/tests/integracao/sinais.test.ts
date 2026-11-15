/**
 * Sinais de mudança contra o simulador (npm run test:emu).
 * Confere que a auditoria marca o módulo na MESMA gravação da alteração
 * (e que nada é marcado se a alteração falhar).
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Timestamp, type Firestore } from "firebase-admin/firestore";

const PROJETO = "demo-jardins-sinais";
process.env.FIREBASE_PROJECT_ID = PROJETO;

let db: Firestore;
let auditoria: typeof import("@/server/auditoria");

beforeAll(async () => {
  const admin = await import("@/server/firebase-admin");
  db = admin.adminDb();
  auditoria = await import("@/server/auditoria");
});

beforeEach(async () => {
  const host = process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080";
  await fetch(`http://${host}/emulator/v1/projects/${PROJETO}/databases/(default)/documents`, { method: "DELETE" });
});

const sinais = () => db.doc("condominiums/a/sistema/sinais").get();

describe("sinais de mudança", () => {
  it("a auditoria marca o módulo junto com a alteração (lote)", async () => {
    const lote = db.batch();
    lote.set(db.doc("condominiums/a/visitors/v1"), { nome: "Maria" });
    auditoria.registrarAuditoria(db, lote, { condominioId: "a", uid: "u1", acao: "visitante.autorizar" });
    await lote.commit();
    const doc = await sinais();
    expect(doc.get("portaria")).toBeInstanceOf(Timestamp);
    expect(doc.get("reservas")).toBeUndefined();
  });

  it("duas auditorias na mesma transação (mesmo módulo e módulos diferentes) gravam juntas", async () => {
    await db.runTransaction(async (tx) => {
      tx.set(db.doc("condominiums/a/members/m1"), { nome: "Ana" });
      auditoria.registrarAuditoria(db, tx, { condominioId: "a", uid: "u1", acao: "membro.criar" });
      auditoria.registrarAuditoria(db, tx, { condominioId: "a", uid: "u1", acao: "acesso.criar_morador" });
      auditoria.registrarAuditoria(db, tx, { condominioId: "a", uid: "u1", acao: "reserva.criar" });
    });
    const doc = await sinais();
    expect(doc.get("pessoas")).toBeInstanceOf(Timestamp);
    expect(doc.get("reservas")).toBeInstanceOf(Timestamp);
  });

  it("marca de novo com hora mais nova e não apaga os outros módulos", async () => {
    await auditoria.auditarSozinho(db, { condominioId: "a", uid: "u1", acao: "reserva.criar" });
    const primeiro = (await sinais()).get("reservas") as Timestamp;
    await auditoria.auditarSozinho(db, { condominioId: "a", uid: "u1", acao: "comunicado.publicar" });
    await auditoria.auditarSozinho(db, { condominioId: "a", uid: "u1", acao: "reserva.aprovar" });
    const doc = await sinais();
    expect((doc.get("reservas") as Timestamp).toMillis()).toBeGreaterThanOrEqual(primeiro.toMillis());
    expect(doc.get("comunicados")).toBeInstanceOf(Timestamp);
  });

  it("entrar e sair não marcam nada", async () => {
    await auditoria.auditarSozinho(db, { condominioId: "a", uid: "u1", acao: "sessao.entrar" });
    expect((await sinais()).exists).toBe(false);
  });

  it("alteração que falha não marca o módulo", async () => {
    await db.doc("condominiums/a/auditLogs/fixo").set({ x: 1 });
    const lote = db.batch();
    lote.create(db.doc("condominiums/a/auditLogs/fixo"), { x: 2 }); // já existe → o lote inteiro falha
    auditoria.registrarAuditoria(db, lote, { condominioId: "a", uid: "u1", acao: "financeiro.lancar" });
    await expect(lote.commit()).rejects.toThrow();
    expect((await sinais()).exists).toBe(false);
  });
});
