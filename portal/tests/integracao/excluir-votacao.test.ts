/**
 * EXCLUIR VOTAÇÃO DE TESTE pela tela da comissão, contra o simulador.
 * Pode: título com "TESTE" (mesmo com votos) e rascunho sem votos. Nunca: a oficial publicada.
 * Apaga tudo da votação e os índices dos códigos; a auditoria fica e ganha "eleicao.excluir".
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import type { Contexto } from "@/server/contexto";
import { gravarEleicao, mudarStatusEleicao, registrarVotoEleicao } from "@/server/dados/eleicoes";
import { gerarLinksFaltantes } from "@/server/dados/votacao-links";
import { excluirVotacao, podeExcluirVotacao } from "@/server/dados/excluir-votacao";
import { calcularPermissoes } from "@/lib/permissoes";
import type { Candidato } from "@/lib/eleicoes";

const PROJETO = "demo-jardins-excluir";
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
const cand = (n: number): Candidato => ({ id: `c${n}`, numero: n, nome: `Integrante ${n}`, funcao: "", casa: "", apresentacao: "", nascimento: null });

async function eleicao(titulo: string, publicar: boolean): Promise<string> {
  const id = await gravarEleicao(db, comissao, {
    id: null,
    titulo,
    cargo: "Chapa única",
    modo: "chapa",
    vagas: 1,
    escolhasPorCasa: 1,
    permiteBranco: false,
    regraDesempate: "comissao",
    abreEm: new Date(Date.now() + HORA),
    fechaEm: new Date(Date.now() + 9 * HORA),
    candidatos: [cand(1)],
  });
  if (publicar) await mudarStatusEleicao(db, comissao, id, "publicar");
  return id;
}

beforeEach(async () => {
  await limpar();
  await db.doc("condominiums/a").set({ nome: "A", status: "ativo", fuso: "America/Belem" });
  await db.doc("condominiums/a/units/casa-1").set({ rotulo: "Casa 1", numero: 1, status: "ativa" });
  await db.doc("condominiums/a/units/casa-2").set({ rotulo: "Casa 2", numero: 2, status: "ativa" });
});

describe("excluir votação de teste", () => {
  it("regra: TESTE no título sempre; rascunho só sem votos; oficial publicada nunca", () => {
    expect(podeExcluirVotacao({ titulo: "Eleição de TESTE", status: "publicada" }, true)).toBe(true);
    expect(podeExcluirVotacao({ titulo: "Eleição 2026", status: "rascunho" }, false)).toBe(true);
    expect(podeExcluirVotacao({ titulo: "Eleição 2026", status: "rascunho" }, true)).toBe(false);
    expect(podeExcluirVotacao({ titulo: "Eleição 2026", status: "publicada" }, false)).toBe(false);
  });

  it("apaga a votação de TESTE com votos, links e índices; a auditoria fica", async () => {
    const id = await eleicao("Eleição de TESTE", true);
    await gerarLinksFaltantes(db, comissao, id);
    await registrarVotoEleicao(db, contexto("m1", "casa-1", "morador"), id, ["sim"], new Date(Date.now() + 2 * HORA));
    const el = db.doc(`condominiums/a/elections/${id}`);
    expect((await el.collection("links").get()).size).toBe(2);

    const r = await excluirVotacao(db, comissao, id);
    expect(r.titulo).toBe("Eleição de TESTE");
    expect((await el.get()).exists).toBe(false);
    for (const sub of ["votantes", "urna", "links"]) expect((await el.collection(sub).get()).size).toBe(0);
    expect((await db.collection("votoCodigos").where("eleicaoId", "==", id).get()).size).toBe(0);
    const logs = await db.collection("condominiums/a/auditLogs").where("acao", "==", "eleicao.excluir").get();
    expect(logs.size).toBe(1);
    expect(logs.docs[0].get("detalhes")).toMatchObject({ titulo: "Eleição de TESTE", comVotos: true });
  });

  it("nunca apaga a eleição oficial publicada; morador nunca exclui; rascunho sem votos pode", async () => {
    const oficial = await eleicao("Eleição do síndico e conselho 2026/2027", true);
    await expect(excluirVotacao(db, comissao, oficial)).rejects.toThrow(/nunca é excluída/);
    expect((await db.doc(`condominiums/a/elections/${oficial}`).get()).exists).toBe(true);

    const teste = await eleicao("TESTE da comissão", true);
    await expect(excluirVotacao(db, contexto("m1", "casa-1", "morador"), teste)).rejects.toThrow();
    expect((await db.doc(`condominiums/a/elections/${teste}`).get()).exists).toBe(true);

    const rascunho = await eleicao("Eleição 2026", false);
    await excluirVotacao(db, comissao, rascunho);
    expect((await db.doc(`condominiums/a/elections/${rascunho}`).get()).exists).toBe(false);
  });
});
