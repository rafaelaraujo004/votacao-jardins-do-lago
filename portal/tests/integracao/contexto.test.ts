/**
 * Teste do contexto do usuário contra o simulador (npm run test:emu).
 * Garante que o condomínio e o papel vêm do BANCO, e não do pedido.
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { carregarContexto } from "@/server/contexto";
import { consumirTentativa } from "@/server/rate-limit";
import { registrarAuditoria } from "@/server/auditoria";

const PROJETO = "demo-jardins-integracao";
let db: Firestore;

beforeAll(() => {
  const app = getApps().find((a) => a.name === PROJETO) ?? initializeApp({ projectId: PROJETO }, PROJETO);
  db = getFirestore(app);
});

async function limpar() {
  const host = process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080";
  await fetch(`http://${host}/emulator/v1/projects/${PROJETO}/databases/(default)/documents`, { method: "DELETE" });
}

beforeEach(async () => {
  await limpar();
  await db.doc("condominiums/a").set({ nome: "A", status: "ativo", fuso: "America/Belem" });
  await db.doc("condominiums/b").set({ nome: "B", status: "ativo" });
  await db.doc("condominiums/inativo").set({ nome: "Inativo", status: "suspenso" });
  await db.doc("condominiums/a/units/casa-7").set({ rotulo: "Casa 7" });
  await db.doc("condominiums/a/members/u1").set({ nome: "Ana", papel: "morador", unitId: "casa-7", status: "ativo" });
  await db.doc("users/u1").set({ condominioIds: ["a"], condominioAtivo: "a" });
});

describe("carregarContexto", () => {
  it("monta o contexto a partir do vínculo no banco", async () => {
    const ctx = await carregarContexto(db, "u1");
    expect(ctx).toMatchObject({ condominioId: "a", papel: "morador", unitId: "casa-7", unidadeRotulo: "Casa 7" });
    expect(ctx?.permissoes.has("area.morador")).toBe(true);
    expect(ctx?.permissoes.has("area.gestao")).toBe(false);
  });

  it("não aceita condomínio ativo que não está na lista da pessoa", async () => {
    await db.doc("users/u1").set({ condominioIds: ["a"], condominioAtivo: "b" });
    expect(await carregarContexto(db, "u1")).toBeNull();
  });

  it("não aceita condomínio na lista sem vínculo real lá dentro", async () => {
    await db.doc("users/u1").set({ condominioIds: ["a", "b"], condominioAtivo: "b" });
    expect(await carregarContexto(db, "u1")).toBeNull();
  });

  it("barra vínculo suspenso", async () => {
    await db.doc("condominiums/a/members/u1").update({ status: "suspenso" });
    expect(await carregarContexto(db, "u1")).toBeNull();
  });

  it("barra condomínio suspenso", async () => {
    await db.doc("condominiums/inativo/members/u1").set({ papel: "admin", status: "ativo" });
    await db.doc("users/u1").set({ condominioIds: ["inativo"], condominioAtivo: "inativo" });
    expect(await carregarContexto(db, "u1")).toBeNull();
  });

  it("barra papel desconhecido gravado no banco", async () => {
    await db.doc("condominiums/a/members/u1").update({ papel: "superusuario" });
    expect(await carregarContexto(db, "u1")).toBeNull();
  });

  it("pessoa sem cadastro não tem contexto", async () => {
    expect(await carregarContexto(db, "ninguem")).toBeNull();
  });
});

describe("limite de tentativas", () => {
  it("bloqueia depois do limite dentro da janela", async () => {
    for (let i = 0; i < 3; i++) {
      expect((await consumirTentativa(db, "teste", "ip-1", 3, 60)).permitido).toBe(true);
    }
    expect((await consumirTentativa(db, "teste", "ip-1", 3, 60)).permitido).toBe(false);
    expect((await consumirTentativa(db, "teste", "ip-2", 3, 60)).permitido).toBe(true);
  });
});

describe("auditoria", () => {
  it("grava junto com a alteração, na mesma transação", async () => {
    await db.runTransaction(async (tx) => {
      tx.update(db.doc("condominiums/a/members/u1"), { status: "suspenso" });
      registrarAuditoria(db, tx, { condominioId: "a", uid: "sindico", acao: "membro.alterar", alvo: "members/u1" });
    });
    const logs = await db.collection("condominiums/a/auditLogs").get();
    expect(logs.size).toBe(1);
    expect(logs.docs[0].data()).toMatchObject({ acao: "membro.alterar", condominioId: "a", uid: "sindico" });
  });

  it("se a alteração falhar, a auditoria também não é gravada", async () => {
    await expect(
      db.runTransaction(async (tx) => {
        registrarAuditoria(db, tx, { condominioId: "a", uid: "sindico", acao: "membro.alterar" });
        tx.update(db.doc("condominiums/a/members/nao-existe"), { status: "x" });
      }),
    ).rejects.toThrow();
    expect((await db.collection("condominiums/a/auditLogs").get()).size).toBe(0);
  });
});
