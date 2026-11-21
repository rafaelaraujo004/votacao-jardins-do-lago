/**
 * APAGAR OS DADOS PESSOAIS DA VOTAÇÃO (LGPD), contra o simulador.
 * Só depois do resultado divulgado; apaga os links (código e senha) e desativa os índices dos
 * códigos (sem senha nem casa); mantém votantes, urna, ata, assinaturas e a lista de contatos
 * (é do condomínio: a portaria e a importação de moradores usam); audita sem dado pessoal.
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import type { Contexto } from "@/server/contexto";
import { finalizarEleicao, gravarEleicao, mudarStatusEleicao, registrarVotoEleicao, CARENCIA_APURACAO_MS } from "@/server/dados/eleicoes";
import { gerarLinksFaltantes, lerLinkDeVoto } from "@/server/dados/votacao-links";
import { apagarDadosPessoaisDaVotacao, situacaoDaLimpeza } from "@/server/dados/limpeza-votacao";
import { calcularPermissoes } from "@/lib/permissoes";
import type { Candidato } from "@/lib/eleicoes";

const PROJETO = "demo-jardins-limpeza";
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

/** Chapa que abre e fecha no FUTURO real (a divulgação automática não dispara sozinha); hora simulada nos testes. */
async function chapa(abre: number, fecha: number): Promise<string> {
  const id = await gravarEleicao(db, comissao, {
    id: null,
    titulo: "Eleição 2026",
    cargo: "Chapa única",
    modo: "chapa",
    vagas: 1,
    escolhasPorCasa: 1,
    permiteBranco: false,
    regraDesempate: "comissao",
    abreEm: new Date(abre),
    fechaEm: new Date(fecha),
    candidatos: [cand(1)],
  });
  await mudarStatusEleicao(db, comissao, id, "publicar");
  return id;
}

let T0 = 0;
beforeEach(async () => {
  T0 = Date.now();
  await limpar();
  await db.doc("condominiums/a").set({ nome: "A", status: "ativo", fuso: "America/Belem" });
  await db.doc("condominiums/a/units/casa-1").set({ rotulo: "Casa 1", numero: 1, status: "ativa" });
  await db.doc("condominiums/a/units/casa-2").set({ rotulo: "Casa 2", numero: 2, status: "ativa" });
  await db.doc("condominiums/a/contatosVotacao/casa-1").set({ casa: "Casa 1", nome: "Ana", telefones: ["5594991234567"] });
  await db.doc("condominiums/a/contatosVotacao/casa-2").set({ casa: "Casa 2", nome: "Bia", telefones: ["5594988887777"] });
});

describe("apagar dados pessoais da votação", () => {
  it("só depois do resultado divulgado; apaga links e senhas, desativa os códigos; mantém votantes, urna, assinaturas e contatos", async () => {
    const abre = T0 + HORA;
    const fecha = T0 + 2 * HORA;
    const id = await chapa(abre, fecha);
    await gerarLinksFaltantes(db, comissao, id);
    await registrarVotoEleicao(db, contexto("m1", "casa-1", "morador"), id, ["sim"], new Date(abre + 60_000));
    await db.doc(`condominiums/a/elections/${id}/assinaturasAta/comissao-1`).set({ nome: "Fulano de Tal" });

    // Antes da divulgação: recusa.
    await expect(apagarDadosPessoaisDaVotacao(db, comissao, id)).rejects.toThrow(/depois que o resultado/);
    // Morador nunca.
    await expect(apagarDadosPessoaisDaVotacao(db, contexto("m1", "casa-1", "morador"), id)).rejects.toThrow();

    await finalizarEleicao(db, "a", id, new Date(fecha + CARENCIA_APURACAO_MS + 1000));
    expect((await situacaoDaLimpeza(comissao, id, db)).podeApagar).toBe(true);
    const el = db.doc(`condominiums/a/elections/${id}`);
    const codigoCasa1 = (await el.collection("links").doc("casa-1").get()).get("codigo") as string;
    const r = await apagarDadosPessoaisDaVotacao(db, comissao, id);
    expect(r).toEqual({ links: 2, codigos: 2 });

    expect((await el.collection("links").get()).size).toBe(0);
    // Índices ficam DESATIVADOS: sem senha e sem casa, só condomínio e eleição.
    const indices = await db.collection("votoCodigos").where("eleicaoId", "==", id).get();
    expect(indices.size).toBe(2);
    for (const i of indices.docs) {
      expect(i.get("senhaHash")).toBeUndefined();
      expect(i.get("unitId")).toBeUndefined();
      expect(i.get("desativadoEm")).toBeTruthy();
    }
    // O link antigo mostra "votação terminou" (não "link inválido").
    expect((await lerLinkDeVoto(codigoCasa1, { db })).estado).toBe("desativado");
    // A lista de contatos fica (é do condomínio, a portaria também usa).
    expect((await db.collection("condominiums/a/contatosVotacao").get()).size).toBe(2);
    // Fica o registro da eleição.
    expect((await el.collection("votantes").get()).size).toBe(1);
    expect((await el.collection("urna").doc("contagem").get()).get("cedulas")).toBe(1);
    expect((await el.collection("assinaturasAta").doc("comissao-1").get()).exists).toBe(true);
    const s = await situacaoDaLimpeza(comissao, id, db);
    expect(s.apagadosEm).toBeInstanceOf(Date);
    expect(s.links).toBe(0);

    const logs = await db.collection("condominiums/a/auditLogs").where("acao", "==", "eleicao.limpeza").get();
    expect(logs.size).toBe(1);
    expect(JSON.stringify(logs.docs[0].data())).not.toMatch(/5594|Ana|Bia|senha/);

    // Repetir não faz mal.
    await expect(apagarDadosPessoaisDaVotacao(db, comissao, id)).resolves.toEqual({ links: 0, codigos: 0 });
  });
});
