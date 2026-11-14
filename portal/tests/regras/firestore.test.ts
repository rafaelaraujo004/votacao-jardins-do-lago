/**
 * Testes das regras do Firestore (rodam no simulador: npm run test:emu).
 * Cada teste simula uma pessoa tentando ler ou gravar algo direto do navegador.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, setDoc, updateDoc, collection, getDocs, query, where } from "firebase/firestore";

const C = "condo-a";
const OUTRO = "condo-b";

let env: RulesTestEnvironment;

beforeAll(async () => {
  const [host, porta] = (process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080").split(":");
  env = await initializeTestEnvironment({
    projectId: "demo-jardins-regras",
    firestore: {
      rules: readFileSync(path.resolve(import.meta.dirname, "../../firestore.rules"), "utf8"),
      host,
      port: Number(porta),
    },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const membro = (c: string, uid: string, dados: object) =>
      setDoc(doc(db, `condominiums/${c}/members/${uid}`), { status: "ativo", permissoesExtras: [], permissoesNegadas: [], ...dados });

    await setDoc(doc(db, `condominiums/${C}`), { nome: "A", status: "ativo" });
    await setDoc(doc(db, `condominiums/${OUTRO}`), { nome: "B", status: "ativo" });

    await membro(C, "morador1", { papel: "morador", unitId: "casa-1" });
    await membro(C, "morador2", { papel: "morador", unitId: "casa-2" });
    await membro(C, "porteiro", { papel: "portaria", unitId: null });
    await membro(C, "sindico", { papel: "admin", unitId: null });
    await membro(C, "conselheiro", { papel: "conselheiro", unitId: null });
    await membro(C, "suspenso", { papel: "morador", unitId: "casa-1", status: "suspenso" });
    await membro(C, "provisorio", { papel: "portaria", unitId: null, precisaTrocarSenha: true });
    await membro(OUTRO, "moradorB", { papel: "morador", unitId: "casa-1" });

    await setDoc(doc(db, "users/morador1"), { nome: "M1", condominioIds: [C], condominioAtivo: C });
    await setDoc(doc(db, `condominiums/${C}/units/casa-1`), { rotulo: "Casa 1" });
    await setDoc(doc(db, `condominiums/${C}/units/casa-2`), { rotulo: "Casa 2" });
    await setDoc(doc(db, `condominiums/${C}/tickets/t1`), { unitId: "casa-1", descricao: "Lâmpada queimada" });
    await setDoc(doc(db, `condominiums/${C}/tickets/t2`), { unitId: "casa-2", descricao: "Vazamento" });
    await setDoc(doc(db, `condominiums/${C}/tickets/t1/updates/u1`), { texto: "Recebida" });
    await setDoc(doc(db, `condominiums/${C}/packages/p1`), { unitId: "casa-1" });
    await setDoc(doc(db, `condominiums/${C}/packages/p2`), { unitId: "casa-2" });
    await setDoc(doc(db, `condominiums/${C}/visitors/v1`), { unitId: "casa-1", nome: "Visitante" });
    await setDoc(doc(db, `condominiums/${C}/financialEntries/f1`), { valorCentavos: 1000, publicado: true });
    await setDoc(doc(db, `condominiums/${C}/financialEntries/f2`), { valorCentavos: 500, publicado: false });
    await setDoc(doc(db, `condominiums/${C}/monthlySummaries/2026-11`), { publicado: true });
    await setDoc(doc(db, `condominiums/${C}/auditLogs/a1`), { acao: "sessao.entrar", uid: "sindico" });
    await setDoc(doc(db, `condominiums/${C}/announcements/an1`), { publicado: true });
    await setDoc(doc(db, `condominiums/${C}/announcements/an2`), { publicado: false });
    await setDoc(doc(db, `condominiums/${C}/documents/d1`), { visivelPara: ["admin", "conselheiro"] });
    await setDoc(doc(db, `condominiums/${C}/documents/d2`), { visivelPara: ["morador", "portaria"] });
    await setDoc(doc(db, `condominiums/${OUTRO}/tickets/tb`), { unitId: "casa-1" });
    await setDoc(doc(db, `condominiums/${C}/usernames/K7M4PX`), { uid: "morador1" });
  });
});

const como = (uid: string) => env.authenticatedContext(uid).firestore();
const anonimo = () => env.unauthenticatedContext().firestore();

describe("sem login", () => {
  it("não lê nada", async () => {
    await assertFails(getDoc(doc(anonimo(), `condominiums/${C}`)));
    await assertFails(getDoc(doc(anonimo(), `condominiums/${C}/announcements/an1`)));
    await assertFails(getDoc(doc(anonimo(), "users/morador1")));
  });
});

describe("isolamento entre unidades", () => {
  it("morador lê a própria solicitação e não a do vizinho", async () => {
    await assertSucceeds(getDoc(doc(como("morador1"), `condominiums/${C}/tickets/t1`)));
    await assertFails(getDoc(doc(como("morador1"), `condominiums/${C}/tickets/t2`)));
  });

  it("morador lê as atualizações só da própria solicitação", async () => {
    await assertSucceeds(getDoc(doc(como("morador1"), `condominiums/${C}/tickets/t1/updates/u1`)));
    await assertFails(getDoc(doc(como("morador2"), `condominiums/${C}/tickets/t1/updates/u1`)));
  });

  it("morador lê as próprias encomendas e não as do vizinho", async () => {
    await assertSucceeds(getDoc(doc(como("morador1"), `condominiums/${C}/packages/p1`)));
    await assertFails(getDoc(doc(como("morador1"), `condominiums/${C}/packages/p2`)));
  });

  it("listar encomendas só funciona filtrando pela própria casa", async () => {
    const db = como("morador1");
    await assertSucceeds(getDocs(query(collection(db, `condominiums/${C}/packages`), where("unitId", "==", "casa-1"))));
    await assertFails(getDocs(collection(db, `condominiums/${C}/packages`)));
  });

  it("morador lê a própria unidade e não a do vizinho", async () => {
    await assertSucceeds(getDoc(doc(como("morador1"), `condominiums/${C}/units/casa-1`)));
    await assertFails(getDoc(doc(como("morador1"), `condominiums/${C}/units/casa-2`)));
  });

  it("morador não lê o vínculo de outra pessoa; lê o próprio", async () => {
    await assertSucceeds(getDoc(doc(como("morador1"), `condominiums/${C}/members/morador1`)));
    await assertFails(getDoc(doc(como("morador1"), `condominiums/${C}/members/morador2`)));
  });

  it("ninguém lê o cadastro de usuário de outra pessoa", async () => {
    await assertSucceeds(getDoc(doc(como("morador1"), "users/morador1")));
    await assertFails(getDoc(doc(como("sindico"), "users/morador1")));
  });
});

describe("isolamento entre condomínios", () => {
  it("morador de outro condomínio não lê nada deste", async () => {
    await assertFails(getDoc(doc(como("moradorB"), `condominiums/${C}`)));
    await assertFails(getDoc(doc(como("moradorB"), `condominiums/${C}/tickets/t1`)));
    await assertFails(getDoc(doc(como("moradorB"), `condominiums/${C}/announcements/an1`)));
  });

  it("síndico deste condomínio não lê nada do outro", async () => {
    await assertFails(getDoc(doc(como("sindico"), `condominiums/${OUTRO}`)));
    await assertFails(getDoc(doc(como("sindico"), `condominiums/${OUTRO}/tickets/tb`)));
  });
});

describe("vínculo suspenso", () => {
  it("não lê nem os dados da própria casa", async () => {
    await assertFails(getDoc(doc(como("suspenso"), `condominiums/${C}/tickets/t1`)));
    await assertFails(getDoc(doc(como("suspenso"), `condominiums/${C}/announcements/an1`)));
  });
});

describe("senha provisória", () => {
  it("não lê nada do condomínio até trocar a senha; lê o próprio vínculo", async () => {
    await assertFails(getDoc(doc(como("provisorio"), `condominiums/${C}/visitors/v1`)));
    await assertFails(getDoc(doc(como("provisorio"), `condominiums/${C}/packages/p1`)));
    await assertFails(getDoc(doc(como("provisorio"), `condominiums/${C}/announcements/an1`)));
    await assertSucceeds(getDoc(doc(como("provisorio"), `condominiums/${C}/members/provisorio`)));
  });
});

describe("financeiro", () => {
  it("portaria não lê nada do financeiro", async () => {
    await assertFails(getDoc(doc(como("porteiro"), `condominiums/${C}/financialEntries/f1`)));
    await assertFails(getDoc(doc(como("porteiro"), `condominiums/${C}/monthlySummaries/2026-11`)));
  });

  it("morador lê só o que foi publicado", async () => {
    await assertSucceeds(getDoc(doc(como("morador1"), `condominiums/${C}/financialEntries/f1`)));
    await assertFails(getDoc(doc(como("morador1"), `condominiums/${C}/financialEntries/f2`)));
  });

  it("conselheiro lê tudo, inclusive o não publicado", async () => {
    await assertSucceeds(getDoc(doc(como("conselheiro"), `condominiums/${C}/financialEntries/f2`)));
  });
});

describe("comunicados e documentos", () => {
  it("morador vê comunicado publicado e não o rascunho", async () => {
    await assertSucceeds(getDoc(doc(como("morador1"), `condominiums/${C}/announcements/an1`)));
    await assertFails(getDoc(doc(como("morador1"), `condominiums/${C}/announcements/an2`)));
  });

  it("documento respeita a lista de quem pode ver", async () => {
    await assertFails(getDoc(doc(como("morador1"), `condominiums/${C}/documents/d1`)));
    await assertSucceeds(getDoc(doc(como("morador1"), `condominiums/${C}/documents/d2`)));
    await assertSucceeds(getDoc(doc(como("conselheiro"), `condominiums/${C}/documents/d1`)));
  });
});

describe("auditoria", () => {
  it("síndico lê; conselheiro sem permissão extra e morador não leem", async () => {
    await assertSucceeds(getDoc(doc(como("sindico"), `condominiums/${C}/auditLogs/a1`)));
    await assertFails(getDoc(doc(como("conselheiro"), `condominiums/${C}/auditLogs/a1`)));
    await assertFails(getDoc(doc(como("morador1"), `condominiums/${C}/auditLogs/a1`)));
  });

  it("ninguém altera nem apaga registros, nem o síndico", async () => {
    const db = como("sindico");
    await assertFails(updateDoc(doc(db, `condominiums/${C}/auditLogs/a1`), { acao: "outra" }));
    await assertFails(deleteDoc(doc(db, `condominiums/${C}/auditLogs/a1`)));
    await assertFails(setDoc(doc(db, `condominiums/${C}/auditLogs/novo`), { acao: "falsa" }));
  });
});

describe("usuários dos moradores (usernames)", () => {
  it("ninguém lê nem grava o índice pelo navegador, nem o síndico (só o servidor)", async () => {
    for (const uid of ["sindico", "morador1", "porteiro"]) {
      await assertFails(getDoc(doc(como(uid), `condominiums/${C}/usernames/K7M4PX`)));
      await assertFails(getDocs(collection(como(uid), `condominiums/${C}/usernames`)));
      await assertFails(setDoc(doc(como(uid), `condominiums/${C}/usernames/ABCDEF`), { uid }));
    }
    await assertFails(getDoc(doc(anonimo(), `condominiums/${C}/usernames/K7M4PX`)));
  });
});

describe("gravação direta pelo navegador", () => {
  it("é negada para todos, em todas as coleções (só o servidor grava)", async () => {
    const tentativas: Array<[string, string]> = [
      ["sindico", `condominiums/${C}/financialEntries/x`],
      ["sindico", `condominiums/${C}/members/novo`],
      ["sindico", `condominiums/${C}`],
      ["morador1", `condominiums/${C}/tickets/x`],
      ["morador1", `condominiums/${C}/visitors/x`],
      ["morador1", `condominiums/${C}/reservations/x`],
      ["morador1", `condominiums/${C}/members/morador1`],
      ["morador1", "users/morador1"],
      ["porteiro", `condominiums/${C}/packages/x`],
      ["porteiro", `condominiums/${C}/accessEvents/x`],
    ];
    for (const [uid, caminho] of tentativas) {
      await assertFails(setDoc(doc(como(uid), caminho), { unitId: "casa-1", papel: "admin", status: "ativo" }));
    }
  });

  it("morador não consegue se promover a síndico", async () => {
    await assertFails(updateDoc(doc(como("morador1"), `condominiums/${C}/members/morador1`), { papel: "admin" }));
  });
});
