/**
 * UM LOGIN POR CASA (contra o simulador: npm run test:emu).
 * Pelas ações de verdade (criarAcessoMorador e removerAcessoMorador), com a comissão logada:
 * - a segunda pessoa da mesma casa não ganha outro login;
 * - duas tentativas ao mesmo tempo, em duas pessoas da casa, criam UM login só;
 * - remover o login libera a casa para criar em nome de outra pessoa, e o usuário antigo some;
 * - outra casa não é afetada;
 * - quem tem o login não muda de perfil nem de casa (a família entraria como equipe ou como outra casa);
 * - remover o login derruba na hora quem estiver com o portal aberto (carregarContexto recusa).
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.FIREBASE_PROJECT_ID = "demo-jardins-login-casa";
});
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "localhost:3000", "x-forwarded-proto": "http" }),
  cookies: async () => ({ get: () => undefined, set: () => undefined }),
}));
vi.mock("next/navigation", () => ({
  redirect: (destino: string) => {
    throw new Error(`redirect ${destino}`);
  },
  notFound: () => {
    throw new Error("notFound");
  },
}));
// A comissão (síndico) está logada: o contexto vem do teste, não de um cookie.
vi.mock("@/server/contexto", async (original) => ({
  ...(await original<typeof import("@/server/contexto")>()),
  getContexto: async () => (globalThis as { __contextoTeste?: unknown }).__contextoTeste ?? null,
}));

import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { carregarContexto, type Contexto } from "@/server/contexto";
import { criarAcessoMorador, removerAcessoMorador } from "@/server/acoes/acesso";
import { salvarPessoa } from "@/server/acoes/pessoas";
import { calcularPermissoes } from "@/lib/permissoes";

const PROJETO = "demo-jardins-login-casa";
const C = "c";
let db: Firestore;

const sindico: Contexto = {
  uid: "sindico",
  nome: "Síndico",
  condominioId: C,
  condominioNome: "Condomínio",
  fuso: "America/Belem",
  papel: "admin",
  unitId: null,
  unidadeRotulo: null,
  permissoes: calcularPermissoes("admin"),
  demo: false,
  precisaTrocarSenha: false,
};

beforeAll(() => {
  const app = getApps().find((a) => a.name === "[DEFAULT]") ?? initializeApp({ projectId: PROJETO });
  db = getFirestore(app);
  (globalThis as { __contextoTeste?: unknown }).__contextoTeste = sindico;
});

const formulario = (uid: string) => {
  const f = new FormData();
  f.set("uid", uid);
  return f;
};

beforeEach(async () => {
  const fs = process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080";
  const auth = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "127.0.0.1:9099";
  await fetch(`http://${fs}/emulator/v1/projects/${PROJETO}/databases/(default)/documents`, { method: "DELETE" });
  await fetch(`http://${auth}/emulator/v1/projects/${PROJETO}/accounts`, { method: "DELETE" });
  await db.doc(`condominiums/${C}`).set({ nome: "Condomínio", status: "ativo", fuso: "America/Belem" });
  await db.doc(`condominiums/${C}/units/casa-001`).set({ rotulo: "Casa 1", numero: 1, status: "ativa" });
  await db.doc(`condominiums/${C}/units/casa-002`).set({ rotulo: "Casa 2", numero: 2, status: "ativa" });
  const pessoa = (uid: string, nome: string, unitId: string) =>
    Promise.all([
      db.doc(`condominiums/${C}/members/${uid}`).set({ nome, papel: "morador", unitId, status: "ativo", permissoesExtras: [], permissoesNegadas: [] }),
      db.doc(`users/${uid}`).set({ nome, condominioIds: [C], condominioAtivo: C }),
    ]);
  await pessoa("maria", "Maria", "casa-001");
  await pessoa("joao", "João", "casa-001");
  await pessoa("rui", "Rui", "casa-002");
});

const edicao = (uid: string, nome: string, papel: string, unitId: string) => {
  const f = new FormData();
  f.set("uid", uid);
  f.set("nome", nome);
  f.set("papel", papel);
  f.set("unitId", unitId);
  return f;
};

const usuarioDe = async (uid: string) => (await db.doc(`condominiums/${C}/members/${uid}`).get()).get("usuario") ?? null;

describe("um login por casa", () => {
  it("a segunda pessoa da mesma casa não ganha outro login; outra casa não é afetada", async () => {
    const r1 = await criarAcessoMorador(null, formulario("maria"));
    expect(r1?.ok).toBe(true);
    const r2 = await criarAcessoMorador(null, formulario("joao"));
    expect(r2?.ok).toBe(false);
    if (r2 && !r2.ok) expect(r2.erro).toMatch(/já tem login \(em nome de Maria\)/);
    expect(await usuarioDe("joao")).toBeNull();
    expect((await criarAcessoMorador(null, formulario("rui")))?.ok).toBe(true);
  });

  it("dois cliques ao mesmo tempo, em duas pessoas da casa, criam um login só", async () => {
    const [a, b] = await Promise.all([criarAcessoMorador(null, formulario("maria")), criarAcessoMorador(null, formulario("joao"))]);
    expect([a?.ok, b?.ok].filter(Boolean)).toHaveLength(1);
    const comLogin = [await usuarioDe("maria"), await usuarioDe("joao")].filter(Boolean);
    expect(comLogin).toHaveLength(1);
  });

  it("remover o login libera a casa para outra pessoa, e o usuário antigo some", async () => {
    const r1 = await criarAcessoMorador(null, formulario("maria"));
    expect(r1?.ok).toBe(true);
    const antigo = (await usuarioDe("maria")) as string;
    const contaAntes = await getAuth().getUser("maria");
    expect(contaAntes.email?.startsWith(antigo.toLowerCase())).toBe(true);

    const removido = await removerAcessoMorador(null, formulario("maria"));
    expect(removido?.ok).toBe(true);
    expect(await usuarioDe("maria")).toBeNull();
    expect((await db.doc(`condominiums/${C}/usernames/${antigo}`).get()).exists).toBe(false);
    const contaDepois = await getAuth().getUser("maria");
    expect(contaDepois.email?.startsWith("sem-login-")).toBe(true);

    const r2 = await criarAcessoMorador(null, formulario("joao"));
    expect(r2?.ok).toBe(true);
    expect(await usuarioDe("joao")).not.toBeNull();
  });

  it("depois de remover, dá para criar o login de novo para a mesma pessoa", async () => {
    expect((await criarAcessoMorador(null, formulario("maria")))?.ok).toBe(true);
    expect((await removerAcessoMorador(null, formulario("maria")))?.ok).toBe(true);
    const de_novo = await criarAcessoMorador(null, formulario("maria"));
    expect(de_novo?.ok).toBe(true);
    const conta = await getAuth().getUser("maria");
    expect(conta.email?.startsWith(String(await usuarioDe("maria")).toLowerCase())).toBe(true);
  });

  it("remover: só de quem tem login, e nunca o próprio", async () => {
    const semLogin = await removerAcessoMorador(null, formulario("joao"));
    expect(semLogin?.ok).toBe(false);
    const proprio = await removerAcessoMorador(null, formulario("sindico"));
    expect(proprio?.ok).toBe(false);
  });

  it("quem tem o login não muda de perfil nem de casa; os outros da casa mudam normalmente", async () => {
    expect((await criarAcessoMorador(null, formulario("maria")))?.ok).toBe(true);
    const virarEquipe = await salvarPessoa(null, edicao("maria", "Maria", "conselheiro", ""));
    expect(virarEquipe?.ok).toBe(false);
    if (virarEquipe && !virarEquipe.ok) expect(virarEquipe.erro).toMatch(/Remover login/);
    const mudarDeCasa = await salvarPessoa(null, edicao("maria", "Maria", "morador", "casa-002"));
    expect(mudarDeCasa?.ok).toBe(false);
    const m = (await db.doc(`condominiums/${C}/members/maria`).get()).data();
    expect(m?.papel).toBe("morador");
    expect(m?.unitId).toBe("casa-001");
    // Mudar só o nome continua livre; e quem não tem o login muda de casa normalmente.
    expect((await salvarPessoa(null, edicao("maria", "Maria Souza", "morador", "casa-001")))?.ok).toBe(true);
    expect((await salvarPessoa(null, edicao("joao", "João", "morador", "casa-002")))?.ok).toBe(true);
    // Depois de remover o login, a mudança de casa passa.
    expect((await removerAcessoMorador(null, formulario("maria")))?.ok).toBe(true);
    expect((await salvarPessoa(null, edicao("maria", "Maria Souza", "morador", "casa-002")))?.ok).toBe(true);
  });

  it("remover o login derruba na hora quem estiver com o portal aberto; criar de novo libera", async () => {
    expect((await criarAcessoMorador(null, formulario("maria")))?.ok).toBe(true);
    expect(await carregarContexto(db, "maria")).not.toBeNull();
    expect((await removerAcessoMorador(null, formulario("maria")))?.ok).toBe(true);
    expect(await carregarContexto(db, "maria")).toBeNull();
    expect((await criarAcessoMorador(null, formulario("maria")))?.ok).toBe(true);
    expect((await db.doc(`condominiums/${C}/members/maria`).get()).get("loginRemovido")).toBeUndefined();
    expect(await carregarContexto(db, "maria")).not.toBeNull();
  });
});
