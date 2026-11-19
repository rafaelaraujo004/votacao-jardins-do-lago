/**
 * Link de voto por casa (sem login) contra o simulador (npm run test:emu):
 * um código por casa, um voto por casa (pelo link ou pelo portal), link trocado deixa de valer,
 * casa bloqueada não vota, contatos importados pelo número da casa.
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import type { Contexto } from "@/server/contexto";
import { gravarEleicao, mudarStatusEleicao, registrarVotoEleicao, salvarBloqueios } from "@/server/dados/eleicoes";
import {
  REGEX_CODIGO,
  comprovantePorCodigo,
  conferirSenha,
  gerarLinksFaltantes,
  hashSenha,
  importarContatos,
  limparCodigo,
  listarEnvios,
  resolverCodigo,
  trocarLink,
  votacaoPorCodigo,
  votarPorCodigo,
} from "@/server/dados/votacao-links";
import { calcularPermissoes } from "@/lib/permissoes";
import type { Candidato } from "@/lib/eleicoes";

const PROJETO = "demo-jardins-links";
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
const cand = (n: number): Candidato => ({ id: `c${n}`, numero: n, nome: `Integrante ${n}`, funcao: "Fiscal", casa: "", apresentacao: "", nascimento: null });
const ref = (id: string) => db.doc(`condominiums/a/elections/${id}`);

async function chapaAberta(): Promise<string> {
  const id = await gravarEleicao(db, comissao, {
    id: null,
    titulo: "Eleição do síndico e conselho 2026/2027",
    cargo: "Chapa única",
    modo: "chapa",
    vagas: 2,
    escolhasPorCasa: 1,
    permiteBranco: false,
    regraDesempate: "comissao",
    abreEm: new Date(Date.now() - HORA),
    fechaEm: new Date(Date.now() + 8 * HORA),
    candidatos: [cand(1), cand(2)],
  });
  await mudarStatusEleicao(db, comissao, id, "publicar");
  return id;
}

async function codigoDa(id: string, unitId: string): Promise<string> {
  return (await ref(id).collection("links").doc(unitId).get()).get("codigo") as string;
}

/** Hash da senha certa (o que o cookie guarda depois de digitar a senha). */
async function senhaDa(id: string, unitId: string): Promise<string> {
  const l = (await ref(id).collection("links").doc(unitId).get()).data()!;
  return hashSenha(l.codigo as string, l.senha as string);
}

/** Acha a eleição/casa do código e devolve o hash da senha certa (como o cookie). */
async function senhaPara(codigo: string): Promise<string | null> {
  const idx = await db.collection("votoCodigos").get();
  for (const d of idx.docs) {
    const l = await db.doc(`condominiums/a/elections/${d.get("eleicaoId")}/links/${d.get("unitId")}`).get();
    if (l.get("codigo") === codigo) return hashSenha(codigo, l.get("senha") as string);
  }
  return null; // código antigo/trocado
}

beforeEach(async () => {
  await limpar();
  await db.doc("condominiums/a").set({ nome: "Jardins", status: "ativo", fuso: "America/Belem" });
  await db.doc("condominiums/a/units/casa-001").set({ rotulo: "Casa 1", numero: 1, status: "ativa" });
  await db.doc("condominiums/a/units/casa-002").set({ rotulo: "Casa 2", numero: 2, status: "ativa" });
  await db.doc("condominiums/a/units/casa-003").set({ rotulo: "Casa 3", numero: 3, status: "inativa" });
});

describe("links de voto", () => {
  it("gera um código único por casa ativa; gerar de novo não muda os que existem", async () => {
    const id = await chapaAberta();
    expect(await gerarLinksFaltantes(db, comissao, id)).toEqual({ gerados: 2, total: 2 });
    const c1 = await codigoDa(id, "casa-001");
    const c2 = await codigoDa(id, "casa-002");
    expect(c1).toMatch(REGEX_CODIGO);
    expect(c1).not.toBe(c2);
    expect((await ref(id).collection("links").doc("casa-003").get()).exists).toBe(false);
    expect(await gerarLinksFaltantes(db, comissao, id)).toEqual({ gerados: 0, total: 2 });
    expect(await codigoDa(id, "casa-001")).toBe(c1);
    expect(await resolverCodigo(db, c1)).toMatchObject({ condominioId: "a", eleicaoId: id, unitId: "casa-001" });
    // O índice de busca guarda só o hash, não o código.
    const indice = await db.collection("votoCodigos").get();
    expect(indice.size).toBe(2);
    expect(JSON.stringify(indice.docs.map((d) => [d.id, d.data()]))).not.toContain(c1);
  });

  it("vota pelo link sem login; o mesmo link (ou outra pessoa) depois vê 'voto já realizado'", async () => {
    const id = await chapaAberta();
    await gerarLinksFaltantes(db, comissao, id);
    const codigo = await codigoDa(id, "casa-001");

    const antes = await votacaoPorCodigo(codigo, { db });
    expect(antes).toMatchObject({ casaRotulo: "Casa 1", casaVotou: false, situacao: "aberta", modo: "chapa" });

    await votarPorCodigo(codigo, await senhaPara(codigo), ["sim"], db);
    await expect(votarPorCodigo(codigo, await senhaPara(codigo), ["nao"], db)).rejects.toThrow(/já votou/);
    // Um morador da mesma casa logado no portal também não vota de novo.
    await expect(registrarVotoEleicao(db, contexto("m1", "casa-001", "morador"), id, ["nao"])).rejects.toThrow(/já votou/);

    const depois = await votacaoPorCodigo(codigo, { db });
    expect(depois?.casaVotou).toBe(true);
    expect((await ref(id).collection("urna").doc("contagem").get()).data()).toEqual({ cedulas: 1, sim: 1 });

    // A auditoria registra que a casa votou pelo link — nunca em quê.
    const logs = await db.collection("condominiums/a/auditLogs").where("acao", "==", "eleicao.votar").get();
    expect(logs.docs[0].get("detalhes")).toEqual({ unidade: "casa-001", via: "link" });
  });

  it("casa que votou pelo portal: o link mostra voto já realizado e não vota", async () => {
    const id = await chapaAberta();
    await gerarLinksFaltantes(db, comissao, id);
    await registrarVotoEleicao(db, contexto("m2", "casa-002", "morador"), id, ["nao"]);
    const codigo = await codigoDa(id, "casa-002");
    expect((await votacaoPorCodigo(codigo, { db }))?.casaVotou).toBe(true);
    await expect(votarPorCodigo(codigo, await senhaPara(codigo), ["sim"], db)).rejects.toThrow(/já votou/);
  });

  it("trocar o link: o antigo para de valer na hora e o novo funciona", async () => {
    const id = await chapaAberta();
    await gerarLinksFaltantes(db, comissao, id);
    const antigo = await codigoDa(id, "casa-001");
    await trocarLink(db, comissao, id, "casa-001");
    const novo = await codigoDa(id, "casa-001");
    expect(novo).not.toBe(antigo);
    expect(await votacaoPorCodigo(antigo, { db })).toBeNull();
    await expect(votarPorCodigo(antigo, await senhaPara(antigo), ["sim"], db)).rejects.toThrow(/não vale mais/);
    await votarPorCodigo(novo, await senhaPara(novo), ["sim"], db);
  });

  it("casa bloqueada não vota pelo link; rascunho não aparece; código inventado não acha nada", async () => {
    const id = await chapaAberta();
    await gerarLinksFaltantes(db, comissao, id);
    await salvarBloqueios(db, comissao, id, { adicionar: ["casa-002"], remover: [] });
    const codigo = await codigoDa(id, "casa-002");
    expect((await votacaoPorCodigo(codigo, { db }))?.casaBloqueada).toBe(true);
    await expect(votarPorCodigo(codigo, await senhaPara(codigo), ["sim"], db)).rejects.toThrow(/não está liberada/);

    expect(await votacaoPorCodigo("ABCDEFGHJK", { db })).toBeNull();
    expect(limparCodigo("abcd-efgh jk")).toBe("ABCDEFGHJK");
    expect(limparCodigo("../../x")).toBeNull();
    expect(limparCodigo("ABCDEFGHI0")).toBeNull(); // I e 0 não existem no alfabeto

    const rascunho = await gravarEleicao(db, comissao, {
      id: null,
      titulo: "Rascunho",
      cargo: "Chapa",
      modo: "chapa",
      vagas: 1,
      escolhasPorCasa: 1,
      permiteBranco: false,
      regraDesempate: "comissao",
      abreEm: new Date(Date.now() - HORA),
      fechaEm: new Date(Date.now() + HORA),
      candidatos: [cand(1)],
    });
    await gerarLinksFaltantes(db, comissao, rascunho);
    const cr = await codigoDa(rascunho, "casa-001");
    expect(await votacaoPorCodigo(cr, { db })).toBeNull();
    await expect(votarPorCodigo(cr, await senhaPara(cr), ["sim"], db)).rejects.toThrow(/não encontrada/);
  });

  it("morador não gera nem troca links", async () => {
    const id = await chapaAberta();
    const m = contexto("m1", "casa-001", "morador");
    await expect(gerarLinksFaltantes(db, m, id)).rejects.toThrow();
    await expect(trocarLink(db, m, id, "casa-001")).rejects.toThrow();
  });
});

describe("contatos", () => {
  it("importa pelo número da casa e aparece na lista de envio", async () => {
    const id = await chapaAberta();
    await gerarLinksFaltantes(db, comissao, id);
    const r = await importarContatos(db, comissao, [
      { numeroCasa: 1, nome: "Ana", telefones: ["5594991234567", "5594988887777"], avisos: [] },
      { numeroCasa: 99, nome: "Ninguém", telefones: ["5594990000000"], avisos: [] },
    ]);
    expect(r).toEqual({ gravados: 1, semCadastro: [99], ambiguas: [], semTelefone: [] });
    const lista = await listarEnvios(comissao, id, db);
    const casa1 = lista.find((l) => l.unitId === "casa-001")!;
    expect(casa1).toMatchObject({ nome: "Ana", telefones: ["5594991234567", "5594988887777"], numero: 1, votou: false });
    expect(casa1.codigo).toMatch(REGEX_CODIGO);
    await expect(importarContatos(db, contexto("m1", "casa-001", "morador"), [])).rejects.toThrow();

    // Lista sem telefone para a casa 1: mantém o que já havia.
    const r2 = await importarContatos(db, comissao, [{ numeroCasa: 1, nome: "Ana", telefones: [], avisos: [] }]);
    expect(r2.semTelefone).toEqual([1]);
    expect((await db.doc("condominiums/a/contatosVotacao/casa-001").get()).get("telefones")).toHaveLength(2);

    // Dois cadastros com o mesmo número: não importa (o link poderia ir para a casa errada).
    await db.doc("condominiums/a/units/casa-002b").set({ rotulo: "Casa 2", numero: 2, status: "ativa" });
    const r3 = await importarContatos(db, comissao, [{ numeroCasa: 2, nome: "X", telefones: ["5594990000000"], avisos: [] }]);
    expect(r3).toMatchObject({ gravados: 0, ambiguas: [2] });
  });
});

describe("senha do link e comprovante", () => {
  it("cada link tem senha de 6 números; sem a senha certa não vota", async () => {
    const id = await chapaAberta();
    await gerarLinksFaltantes(db, comissao, id);
    const link = (await ref(id).collection("links").doc("casa-001").get()).data()!;
    expect(link.senha).toMatch(/^\d{6}$/);
    const codigo = link.codigo as string;
    // O índice guarda só o hash da senha.
    expect(JSON.stringify((await db.collection("votoCodigos").get()).docs.map((d) => d.data()))).not.toContain(`"${link.senha}"`);

    await expect(votarPorCodigo(codigo, null, ["sim"], db)).rejects.toThrow(/senha/);
    await expect(votarPorCodigo(codigo, hashSenha(codigo, "000000") === (await senhaDa(id, "casa-001")) ? "x" : hashSenha(codigo, "000000"), ["sim"], db)).rejects.toThrow(/senha/);
    expect((await votacaoPorCodigo(codigo, { db }))?.senhaOk).toBe(false);
    expect((await votacaoPorCodigo(codigo, { db, senhaHash: await senhaDa(id, "casa-001") }))?.senhaOk).toBe(true);
  });

  it("conferirSenha: acertar não gasta tentativas; quem erra de outro aparelho não trava a casa", async () => {
    const id = await chapaAberta();
    await gerarLinksFaltantes(db, comissao, id);
    const link = (await ref(id).collection("links").doc("casa-002").get()).data()!;
    const errada = link.senha === "111111" ? "222222" : "111111";
    // A própria casa acerta várias vezes: nunca trava.
    for (let i = 0; i < 6; i++) expect((await conferirSenha(link.codigo, link.senha, "ip-casa", db)).ok).toBe(true);
    // Um vizinho com o link erra 5 vezes do aparelho dele: só ELE fica travado.
    const r1 = await conferirSenha(link.codigo, errada, "ip-vizinho", db);
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.erro).toMatch(/4 tentativas/);
    for (let i = 0; i < 4; i++) await conferirSenha(link.codigo, errada, "ip-vizinho", db);
    const travado = await conferirSenha(link.codigo, link.senha, "ip-vizinho", db);
    expect(travado.ok).toBe(false);
    if (!travado.ok) expect(travado.erro).toMatch(/15 minutos/);
    // A casa, no aparelho dela, continua conseguindo.
    expect(await conferirSenha(link.codigo, link.senha, "ip-casa", db)).toEqual({ ok: true, senhaHash: hashSenha(link.codigo, link.senha) });
  });

  it("conferirSenha: antes de abrir não aceita senha; código inventado dá a mesma resposta de senha errada", async () => {
    const futura = await gravarEleicao(db, comissao, {
      id: null,
      titulo: "Futura",
      cargo: "Chapa",
      modo: "chapa",
      vagas: 1,
      escolhasPorCasa: 1,
      permiteBranco: false,
      regraDesempate: "comissao",
      abreEm: new Date(Date.now() + 24 * HORA),
      fechaEm: new Date(Date.now() + 30 * HORA),
      candidatos: [cand(1)],
    });
    await mudarStatusEleicao(db, comissao, futura, "publicar");
    await gerarLinksFaltantes(db, comissao, futura);
    const link = (await ref(futura).collection("links").doc("casa-001").get()).data()!;
    const r = await conferirSenha(link.codigo, link.senha, "ip-x", db);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toMatch(/ainda não abriu/);
    const inventado = await conferirSenha("ABCDEFGHJK", "123456", "ip-x", db);
    expect(inventado.ok).toBe(false);
    if (!inventado.ok) expect(inventado.erro).toMatch(/Senha errada ou link inválido/);
  });

  it("comprovante: só depois do voto e com a senha; não traz o voto", async () => {
    const id = await chapaAberta();
    await gerarLinksFaltantes(db, comissao, id);
    const codigo = await codigoDa(id, "casa-001");
    const senha = await senhaDa(id, "casa-001");
    expect(await comprovantePorCodigo(codigo, senha, db)).toBeNull(); // ainda não votou
    const r = await votarPorCodigo(codigo, senha, ["nao"], db);
    expect(r.comprovante).toMatch(/^[23456789A-HJ-NP-Z]{8}$/);
    const c = await comprovantePorCodigo(codigo, senha, db);
    expect(c).toMatchObject({ casa: "Casa 1", codigo: r.comprovante, titulo: "Eleição do síndico e conselho 2026/2027" });
    expect(JSON.stringify(c)).not.toMatch(/"(sim|nao)"/);
    expect(await comprovantePorCodigo(codigo, null, db)).toBeNull();
  });
});
