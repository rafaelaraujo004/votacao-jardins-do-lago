/**
 * Reservas contra o simulador (npm run test:emu): a trava do horário impede
 * reserva dupla, mesmo com dois pedidos ao mesmo tempo.
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import type { Contexto } from "@/server/contexto";
import { gravarReserva } from "@/server/dados/reservas";
import { calcularPermissoes } from "@/lib/permissoes";
import { AREAS_SUGERIDAS, idDaTrava, somarDias } from "@/lib/reservas";
import { hojeISO } from "@/lib/formato";

const PROJETO = "demo-jardins-reservas";
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

const churrasqueira = AREAS_SUGERIDAS.find((a) => a.id === "churrasqueira")!;
const dia = somarDias(hojeISO(new Date(), "America/Belem"), 5);

beforeEach(async () => {
  await limpar();
  await db.doc("condominiums/a").set({ nome: "A", status: "ativo", fuso: "America/Belem" });
  await db.doc("condominiums/a/units/casa-1").set({ rotulo: "Casa 1", status: "ativa" });
  await db.doc("condominiums/a/units/casa-2").set({ rotulo: "Casa 2", status: "ativa" });
  const { id, ...campos } = churrasqueira;
  await db.doc(`condominiums/a/amenities/${id}`).set(campos);
});

describe("gravarReserva", () => {
  it("pedido do morador fica pendente quando a área exige aprovação, com trava e auditoria", async () => {
    const r = await gravarReserva(db, contexto("u1", "casa-1", "morador"), {
      areaId: "churrasqueira",
      data: dia,
      faixaId: "1000-1600",
      observacao: "",
      tipo: "pedido",
      unitId: "casa-1",
    });
    expect(r.status).toBe("pendente");
    const trava = await db.doc(`condominiums/a/reservationLocks/${idDaTrava("churrasqueira", dia, "1000-1600")}`).get();
    expect(trava.get("reservaId")).toBe(r.id);
    const auditoria = await db.collection("condominiums/a/auditLogs").where("acao", "==", "reserva.criar").get();
    expect(auditoria.size).toBe(1);
  });

  it("dois pedidos ao mesmo tempo no mesmo horário: só um passa", async () => {
    const pedido = (uid: string, casa: string) =>
      gravarReserva(db, contexto(uid, casa, "morador"), {
        areaId: "churrasqueira",
        data: dia,
        faixaId: "1700-2300",
        observacao: "",
        tipo: "pedido",
        unitId: casa,
      });
    const resultados = await Promise.allSettled([pedido("u1", "casa-1"), pedido("u2", "casa-2")]);
    expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const ativas = await db.collection("condominiums/a/reservations").where("data", "==", dia).get();
    expect(ativas.size).toBe(1);
  });

  it("horário liberado (trava apagada e reserva cancelada) pode ser reservado de novo", async () => {
    const ctx = contexto("adm", null, "admin");
    const r = await gravarReserva(db, ctx, { areaId: "churrasqueira", data: dia, faixaId: "1000-1600", observacao: "", tipo: "admin", unitId: "casa-1" });
    expect(r.status).toBe("confirmada");
    await db.doc(`condominiums/a/reservations/${r.id}`).update({ status: "cancelada" });
    await db.doc(`condominiums/a/reservationLocks/${idDaTrava("churrasqueira", dia, "1000-1600")}`).delete();
    const de_novo = await gravarReserva(db, ctx, { areaId: "churrasqueira", data: dia, faixaId: "1000-1600", observacao: "", tipo: "admin", unitId: "casa-2" });
    expect(de_novo.status).toBe("confirmada");
  });

  it("trava esquecida de reserva cancelada não impede nova reserva", async () => {
    const ctx = contexto("adm", null, "admin");
    const r = await gravarReserva(db, ctx, { areaId: "churrasqueira", data: dia, faixaId: "1000-1600", observacao: "", tipo: "admin", unitId: "casa-1" });
    await db.doc(`condominiums/a/reservations/${r.id}`).update({ status: "cancelada" }); // trava ficou
    await expect(
      gravarReserva(db, ctx, { areaId: "churrasqueira", data: dia, faixaId: "1000-1600", observacao: "", tipo: "admin", unitId: "casa-2" }),
    ).resolves.toMatchObject({ status: "confirmada" });
  });

  it("limite por casa no mês vale para o morador", async () => {
    await db.doc("condominiums/a/amenities/churrasqueira").update({ limitePorMes: 1 });
    const ctx = contexto("u1", "casa-1", "morador");
    await gravarReserva(db, ctx, { areaId: "churrasqueira", data: dia, faixaId: "1000-1600", observacao: "", tipo: "pedido", unitId: "casa-1" });
    const outroDia = somarDias(dia, 1).slice(0, 7) === dia.slice(0, 7) ? somarDias(dia, 1) : somarDias(dia, -1);
    await expect(
      gravarReserva(db, ctx, { areaId: "churrasqueira", data: outroDia, faixaId: "1000-1600", observacao: "", tipo: "pedido", unitId: "casa-1" }),
    ).rejects.toThrow(/limite/);
  });

  it("bloqueio ocupa o horário", async () => {
    const ctx = contexto("adm", null, "admin");
    await gravarReserva(db, ctx, { areaId: "churrasqueira", data: dia, faixaId: "1700-2300", observacao: "", tipo: "bloqueio", unitId: null, motivo: "manutenção" });
    await expect(
      gravarReserva(db, contexto("u1", "casa-1", "morador"), { areaId: "churrasqueira", data: dia, faixaId: "1700-2300", observacao: "", tipo: "pedido", unitId: "casa-1" }),
    ).rejects.toThrow(/ocupado/);
  });
});
