/**
 * Login do MORADOR contra o simulador do Firebase Auth (npm run test:emu).
 * Confere que o e-mail sintético ".invalid" é aceito pelo Firebase e que o
 * usuário digitado de qualquer jeito (minúsculas, espaço) vira o mesmo login.
 * Também confere que o morador entra no contexto e que o suspenso é barrado.
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { carregarContexto } from "@/server/contexto";
import { emailDoMorador, normalizarUsuario } from "@/lib/usuario-morador";
import { gerarSenhaProvisoria } from "@/lib/senha";

// O simulador do Auth atende um projeto só (o do firebase.json): o login pela API REST cai nele.
const PROJETO = "demo-jardins";
const C = "condo-teste";
const UID = "morador-teste";
const CODIGO = "K7M4PX";
let auth: Auth;
let db: Firestore;
let senha = "";

/** Entra como o navegador faria (API REST do simulador). Devolve o código de erro ou "ok". */
async function entrar(email: string, s: string): Promise<string> {
  const host = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "127.0.0.1:9099";
  const r = await fetch(`http://${host}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=chave-falsa`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: s, returnSecureToken: true }),
  });
  if (r.ok) return "ok";
  const corpo = (await r.json().catch(() => null)) as { error?: { message?: string } } | null;
  return corpo?.error?.message ?? `HTTP ${r.status}`;
}

beforeAll(() => {
  const app = getApps().find((a) => a.name === PROJETO) ?? initializeApp({ projectId: PROJETO }, PROJETO);
  auth = getAuth(app);
  db = getFirestore(app);
});

beforeEach(async () => {
  const host = process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080";
  await fetch(`http://${host}/emulator/v1/projects/${PROJETO}/databases/(default)/documents`, { method: "DELETE" });
  await auth.deleteUser(UID).catch(() => undefined);
  senha = gerarSenhaProvisoria();
  // Como o cadastro faz: conta sem e-mail; depois o síndico cria o acesso (e-mail sintético + senha).
  await auth.createUser({ uid: UID, displayName: "Morador Teste" });
  await auth.updateUser(UID, { email: emailDoMorador(CODIGO, C), password: senha });

  await db.doc(`condominiums/${C}`).set({ nome: "Teste", status: "ativo" });
  await db.doc(`condominiums/${C}/units/casa-12`).set({ rotulo: "Casa 12" });
  await db.doc(`condominiums/${C}/members/${UID}`).set({
    nome: "Morador Teste",
    papel: "morador",
    unitId: "casa-12",
    status: "ativo",
    usuario: CODIGO,
    precisaTrocarSenha: true,
  });
  await db.doc(`condominiums/${C}/usernames/${CODIGO}`).set({ uid: UID });
  await db.doc(`users/${UID}`).set({ condominioIds: [C], condominioAtivo: C });
});

describe("login do morador (usuário + senha)", () => {
  it("o Firebase aceita o e-mail sintético .invalid", async () => {
    const conta = await auth.getUser(UID);
    expect(conta.email).toBe("k7m4px@morador.condo-teste.portal.invalid");
  });

  it("entra com o usuário digitado em minúsculas e com espaço", async () => {
    const codigo = normalizarUsuario(" k7m 4px ");
    expect(codigo).toBe(CODIGO);
    expect(await entrar(emailDoMorador(codigo!, C), senha)).toBe("ok");
  });

  it("senha errada e usuário inexistente são recusados (a tela mostra a mesma mensagem)", async () => {
    expect(await entrar(emailDoMorador(CODIGO, C), `${senha}x`)).not.toBe("ok");
    expect(await entrar(emailDoMorador("ZZZZZZ", C), senha)).not.toBe("ok");
    // O mesmo usuário em OUTRO condomínio é outra conta (não existe).
    expect(await entrar(emailDoMorador(CODIGO, "outro-condo"), senha)).not.toBe("ok");
  });

  it("o contexto do morador vem do banco, com a casa e a senha provisória", async () => {
    const ctx = await carregarContexto(db, UID);
    expect(ctx?.papel).toBe("morador");
    expect(ctx?.unidadeRotulo).toBe("Casa 12");
    expect(ctx?.precisaTrocarSenha).toBe(true);
  });

  it("morador suspenso não tem contexto (a sessão é recusada)", async () => {
    await db.doc(`condominiums/${C}/members/${UID}`).update({ status: "suspenso" });
    expect(await carregarContexto(db, UID)).toBeNull();
  });
});
