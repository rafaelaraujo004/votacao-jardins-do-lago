/**
 * Link de voto por casa (sem login) contra o simulador (npm run test:emu):
 * um código por casa, um voto por casa (pelo link ou pelo portal), link trocado deixa de valer,
 * casa bloqueada não vota, contatos importados pelo número da casa, votação ainda não liberada
 * (rascunho) não é "link inválido", limites da senha (teto do link, IPv6 pelo bloco /64).
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import type { Contexto } from "@/server/contexto";
import { fotosDaEleicao, gravarEleicao, mudarStatusEleicao, registrarVotoEleicao, salvarBloqueios, salvarFotoCandidato } from "@/server/dados/eleicoes";
import {
  LIMITE_IP,
  REGEX_CODIGO,
  chaveDoIp,
  codigoConhecido,
  comprovantePorCodigo,
  conferirSenha,
  contarErroDoIp,
  gerarLinksFaltantes,
  hashSenha,
  tokenDoLink,
  importarContatos,
  lerLinkDeVoto,
  limparCodigo,
  listarEnvios,
  painelPorCodigo,
  resolverCodigo,
  trocarLink,
  validadeDoCookie,
  votacaoPorCodigo,
  votarPorCodigo,
} from "@/server/dados/votacao-links";
import { refLimite } from "@/server/rate-limit";
import { calcularPermissoes } from "@/lib/permissoes";
import { somarUrna, type Candidato } from "@/lib/eleicoes";

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

/** Chapa publicada e ABERTA. `bloquear`: casas bloqueadas ainda no rascunho (com a votação aberta não dá mais). */
async function chapaAberta(bloquear: string[] = []): Promise<string> {
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
  if (bloquear.length) await salvarBloqueios(db, comissao, id, { adicionar: bloquear, remover: [] });
  await mudarStatusEleicao(db, comissao, id, "publicar");
  return id;
}

async function codigoDa(id: string, unitId: string): Promise<string> {
  return (await ref(id).collection("links").doc(unitId).get()).get("codigo") as string;
}

/** O que o cookie guarda depois de digitar a senha certa (lembrete assinado pelo servidor). */
async function senhaDa(id: string, unitId: string): Promise<string> {
  const l = (await ref(id).collection("links").doc(unitId).get()).data()!;
  return tokenDoLink(l.codigo as string, hashSenha(l.codigo as string, l.senha as string));
}

/** Acha a eleição/casa do código e devolve o hash da senha certa (como o cookie). */
async function senhaPara(codigo: string): Promise<string | null> {
  const idx = await db.collection("votoCodigos").get();
  for (const d of idx.docs) {
    const l = await db.doc(`condominiums/a/elections/${d.get("eleicaoId")}/links/${d.get("unitId")}`).get();
    if (l.get("codigo") === codigo) return tokenDoLink(codigo, hashSenha(codigo, l.get("senha") as string));
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
    expect(somarUrna((await ref(id).collection("urna").get()).docs.map((d) => d.data()))).toEqual({ cedulas: 1, sim: 1, nao: 0, brancos: 0, votos: {} });

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
    // Bloqueio só antes de abrir (decisão de 21/11/2026): bloqueada no rascunho.
    const id = await chapaAberta(["casa-002"]);
    await gerarLinksFaltantes(db, comissao, id);
    await expect(salvarBloqueios(db, comissao, id, { adicionar: [], remover: ["casa-002"] })).rejects.toThrow(/está aberta/);
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
    // Mas a página sabe que o código é CERTO: "ainda não foi liberada", sem nada da votação.
    expect(await lerLinkDeVoto(cr, { db })).toEqual({ estado: "indisponivel", codigo: cr, condominioNome: "Jardins" });
    expect(await lerLinkDeVoto("ABCDEFGHJK", { db })).toEqual({ estado: "invalido" });
    await expect(votarPorCodigo(cr, await senhaPara(cr), ["sim"], db)).rejects.toThrow(/não encontrada/);
  });

  it("votação que voltou a rascunho: estado indisponível, não conta no limite do endereço", async () => {
    // Publicada para amanhã, links enviados, e a comissão volta para rascunho (só antes de abrir).
    const id = await gravarEleicao(db, comissao, {
      id: null,
      titulo: "Eleição do síndico e conselho 2026/2027",
      cargo: "Chapa única",
      modo: "chapa",
      vagas: 2,
      escolhasPorCasa: 1,
      permiteBranco: false,
      regraDesempate: "comissao",
      abreEm: new Date(Date.now() + 24 * HORA),
      fechaEm: new Date(Date.now() + 29 * HORA),
      candidatos: [cand(1), cand(2)],
    });
    await mudarStatusEleicao(db, comissao, id, "publicar");
    await gerarLinksFaltantes(db, comissao, id);
    const link = (await ref(id).collection("links").doc("casa-001").get()).data()!;
    expect((await lerLinkDeVoto(link.codigo, { db })).estado).toBe("ok");
    await mudarStatusEleicao(db, comissao, id, "rascunho");

    expect(await lerLinkDeVoto(link.codigo, { db })).toEqual({ estado: "indisponivel", codigo: link.codigo, condominioNome: "Jardins" });
    // Painel ao vivo: sem números, mas o código é conhecido (a rota não conta como tentativa errada).
    expect(await painelPorCodigo(link.codigo, db)).toBeNull();
    expect(await codigoConhecido(link.codigo, db)).toBe(true);
    expect(await codigoConhecido("ABCDEFGHJK", db)).toBe(false);

    // Senha (certa ou errada) com a votação em rascunho: explica, sem contar em limite nenhum.
    for (const senha of [link.senha as string, "000000"]) {
      const r = await conferirSenha(link.codigo, senha, "ip-rascunho", db);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.erro).toMatch(/ainda não foi liberada/);
    }
    expect((await refLimite(db, LIMITE_IP.senhaErrada.acao, "ip-rascunho").get()).exists).toBe(false);
    expect((await refLimite(db, "voto.senha.ip", `${link.codigo}:ip-rascunho`).get()).exists).toBe(false);
  });

  it("painel ao vivo pelo link (sem login): só números do condomínio e se a PRÓPRIA casa votou", async () => {
    const id = await chapaAberta();
    await gerarLinksFaltantes(db, comissao, id);
    await registrarVotoEleicao(db, contexto("m1", "casa-001", "morador"), id, ["sim"]);
    const codigo1 = await codigoDa(id, "casa-001");
    const codigo2 = await codigoDa(id, "casa-002");
    const r1 = await painelPorCodigo(codigo1, db);
    expect(r1?.painel.fase).toBe("aberta");
    expect(r1?.painel.votaram).toBe(1);
    expect(r1?.painel.faltam).toBe(1);
    expect(r1?.painel.resultado).toBeNull(); // nada de parcial
    expect(r1?.casa).toEqual({ votou: true, bloqueada: false });
    expect((await painelPorCodigo(codigo2, db))?.casa).toEqual({ votou: false, bloqueada: false });
    // Sigilo: nenhum id nem rótulo de casa no que vai para o navegador.
    const json = JSON.stringify(r1?.painel);
    expect(json).not.toMatch(/casa-00|Casa \d/);
    // Código que não existe: nada.
    expect(await painelPorCodigo("ABCDEFGHJK", db)).toBeNull();
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
    await expect(votarPorCodigo(codigo, tokenDoLink(codigo, hashSenha(codigo, link.senha === "000000" ? "111111" : "000000")), ["sim"], db)).rejects.toThrow(/senha/);
    expect((await votacaoPorCodigo(codigo, { db }))?.senhaOk).toBe(false);
    expect((await votacaoPorCodigo(codigo, { db, token: await senhaDa(id, "casa-001") }))?.senhaOk).toBe(true);
    // Quem tem só o link não consegue montar o cookie: o hash da senha SEM a assinatura não vale.
    const semAssinatura = hashSenha(codigo, link.senha as string);
    expect((await votacaoPorCodigo(codigo, { db, token: semAssinatura }))?.senhaOk).toBe(false);
    await expect(votarPorCodigo(codigo, semAssinatura, ["sim"], db)).rejects.toThrow(/senha/);
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
    expect(await conferirSenha(link.codigo, link.senha, "ip-casa", db)).toMatchObject({ ok: true, token: tokenDoLink(link.codigo, hashSenha(link.codigo, link.senha)) });
  });

  it("conferirSenha: trava diz o tempo certo e onde pedir ajuda; devolve o encerramento para o cookie", async () => {
    const id = await chapaAberta();
    await gerarLinksFaltantes(db, comissao, id);
    const link = (await ref(id).collection("links").doc("casa-001").get()).data()!;
    const errada = link.senha === "111111" ? "222222" : "111111";
    const r1 = await conferirSenha(link.codigo, errada, "ip-a", db);
    const r2 = await conferirSenha(link.codigo, errada, "ip-a", db);
    expect(!r1.ok && r1.erro).toMatch(/Restam 4 tentativas/);
    expect(!r2.ok && r2.erro).toMatch(/Restam 3 tentativas/);
    for (let i = 0; i < 3; i++) await conferirSenha(link.codigo, errada, "ip-a", db);
    const travado = await conferirSenha(link.codigo, errada, "ip-a", db);
    expect(!travado.ok && travado.erro).toMatch(/Espere 15 minutos.*responda a mensagem da comissão no WhatsApp/);

    const certo = await conferirSenha(link.codigo, link.senha, "ip-b", db);
    expect(certo.ok).toBe(true);
    const fechaEm = (await ref(id).get()).get("fechaEm").toDate() as Date;
    if (certo.ok) expect(certo.fechaEm.getTime()).toBe(fechaEm.getTime());
  });

  it("conferirSenha: teto do link estourado — aparelho sem erro e senha certa entra; quem erra continua contando", async () => {
    const id = await chapaAberta();
    await gerarLinksFaltantes(db, comissao, id);
    const link = (await ref(id).collection("links").doc("casa-002").get()).data()!;
    const codigo = link.codigo as string;
    const errada = link.senha === "111111" ? "222222" : "111111";
    // 29 erros de 6 aparelhos (5+5+5+5+5+4) e 1 erro de um sétimo: o teto (30 por hora) estoura.
    const erros: [string, number][] = [["v1", 5], ["v2", 5], ["v3", 5], ["v4", 5], ["v5", 5], ["v6", 4], ["ip-um-erro", 1]];
    for (const [ip, vezes] of erros)
      for (let i = 0; i < vezes; i++) expect((await conferirSenha(codigo, errada, ip, db)).ok).toBe(false);
    expect((await refLimite(db, "voto.senha.link", codigo).get()).get("contagem")).toBe(30);

    // Aparelho que nunca errou + senha certa: entra (o teto é para quem erra).
    expect((await conferirSenha(codigo, link.senha, "ip-casa", db)).ok).toBe(true);
    // Aparelho que já errou uma vez: espera, mesmo com a senha certa.
    const umErro = await conferirSenha(codigo, link.senha, "ip-um-erro", db);
    expect(umErro.ok).toBe(false);
    if (!umErro.ok) expect(umErro.erro).toMatch(/Espere \d+ minutos?.*WhatsApp/);
    // Aparelho novo que ERRA: o erro conta (no aparelho e no link) e ele perde a vez —
    // depois nem a senha certa passa (ninguém testa senhas trocando de aparelho).
    const novoErra = await conferirSenha(codigo, errada, "ip-novo", db);
    expect(novoErra.ok).toBe(false);
    if (!novoErra.ok) expect(novoErra.erro).toMatch(/Espere/);
    expect((await refLimite(db, "voto.senha.ip", `${codigo}:ip-novo`).get()).get("contagem")).toBe(1);
    // 32: o palpite certo do aparelho que já tinha errado conta como erro (resposta igual à de
    // quem errou: não dá para saber se o palpite estava certo) + o erro do aparelho novo.
    expect((await refLimite(db, "voto.senha.link", codigo).get()).get("contagem")).toBe(32);
    expect((await conferirSenha(codigo, link.senha, "ip-novo", db)).ok).toBe(false);
    // Acertar nunca grava erro.
    expect((await refLimite(db, "voto.senha.ip", `${codigo}:ip-casa`).get()).exists).toBe(false);

    // TETO DURO (40 erros no link): trocar de endereço não adianta mais — ninguém entra, nem um
    // aparelho novo com a senha certa, até a janela acabar (ou a comissão trocar o link).
    let n = (await refLimite(db, "voto.senha.link", codigo).get()).get("contagem") as number;
    for (let i = 0; n < 40; i++, n++) expect((await conferirSenha(codigo, errada, `ip-extra-${i}`, db)).ok).toBe(false);
    const duro = await conferirSenha(codigo, link.senha, "ip-nunca-errou", db);
    expect(duro.ok).toBe(false);
    if (!duro.ok) expect(duro.erro).toMatch(/travado por segurança/);
    // Depois do teto duro, palpites não contam mais (a resposta não depende da senha).
    expect((await refLimite(db, "voto.senha.link", codigo).get()).get("contagem")).toBe(40);
  });

  it("limites por endereço: IPv6 do mesmo bloco /64 conta junto; outro bloco não", async () => {
    expect(chaveDoIp("2001:DB8:1:2:0:0:0:d")).toBe("2001:db8:1:2::/64");
    expect(chaveDoIp("[2001:db8:1:2::c]:443")).toBe("2001:db8:1:2::/64");
    expect(chaveDoIp("2001:db8:1:2::/64")).toBe("2001:db8:1:2::/64"); // chamar de novo não muda
    expect(chaveDoIp("::ffff:10.0.0.7")).toBe("10.0.0.7");
    expect(chaveDoIp("10.0.0.7:5678")).toBe("10.0.0.7");
    expect(chaveDoIp("desconhecido")).toBe("desconhecido");

    const id = await chapaAberta();
    await gerarLinksFaltantes(db, comissao, id);
    const link = (await ref(id).collection("links").doc("casa-001").get()).data()!;
    const codigo = link.codigo as string;
    const errada = link.senha === "111111" ? "222222" : "111111";
    // 5 erros de 5 endereços diferentes do MESMO bloco /64: é o mesmo aparelho/casa.
    for (const ip of ["2001:db8:1:2::a", "2001:db8:1:2::b", "2001:db8:1:2:ffff::1", "[2001:db8:1:2::c]:443", "2001:DB8:1:2:0:0:0:d"])
      expect((await conferirSenha(codigo, errada, ip, db)).ok).toBe(false);
    const mesmoBloco = await conferirSenha(codigo, link.senha, "2001:db8:1:2::e", db);
    expect(mesmoBloco.ok).toBe(false);
    if (!mesmoBloco.ok) expect(mesmoBloco.erro).toMatch(/Espere/);
    expect((await conferirSenha(codigo, link.senha, "2001:db8:1:3::1", db)).ok).toBe(true);

    // Limite de links inválidos (página e painel): mesma chave para o bloco inteiro.
    await contarErroDoIp(db, LIMITE_IP.linkInvalido, "2001:db8:5:6::1");
    await contarErroDoIp(db, LIMITE_IP.linkInvalido, "2001:db8:5:6:aaaa::2");
    expect((await refLimite(db, LIMITE_IP.linkInvalido.acao, "2001:db8:5:6::/64").get()).get("contagem")).toBe(2);
  });

  it("cookie da senha vale até 1 hora depois do encerramento (mínimo 1 h, máximo 24 h)", () => {
    const agora = new Date("2026-11-29T12:00:00Z");
    expect(validadeDoCookie(new Date(agora.getTime() + 5 * HORA), agora)).toBe(6 * 3600);
    expect(validadeDoCookie(new Date(agora.getTime() - 3 * HORA), agora)).toBe(3600);
    expect(validadeDoCookie(new Date(agora.getTime() + 40 * HORA), agora)).toBe(24 * 3600);
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

describe("fotos da chapa", () => {
  const FOTO = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==";
  it("comissão põe, troca e tira a foto; aparece no link; morador não mexe", async () => {
    const id = await chapaAberta();
    await gerarLinksFaltantes(db, comissao, id);
    expect(await salvarFotoCandidato(db, comissao, id, "c1", FOTO)).toEqual({ nome: "Integrante 1" });
    expect(await fotosDaEleicao("a", id, db)).toEqual({ c1: FOTO });
    const codigo = await codigoDa(id, "casa-001");
    expect((await votacaoPorCodigo(codigo, { db }))?.fotos).toEqual({ c1: FOTO });
    await salvarFotoCandidato(db, comissao, id, "c1", "");
    expect(await fotosDaEleicao("a", id, db)).toEqual({});
    await expect(salvarFotoCandidato(db, comissao, id, "c9", FOTO)).rejects.toThrow(/não encontrado/);
    await expect(salvarFotoCandidato(db, comissao, id, "c1", "javascript:alert(1)")).rejects.toThrow(/inválido/);
    await expect(salvarFotoCandidato(db, contexto("m1", "casa-001", "morador"), id, "c1", FOTO)).rejects.toThrow();
    const logs = await db.collection("condominiums/a/auditLogs").where("acao", "==", "eleicao.foto").get();
    expect(logs.size).toBe(2);
  });
});

describe("fotos acompanham a pessoa ao editar o rascunho", () => {
  it("mudou a ordem: a foto vai junto; saiu da chapa: a foto sai", async () => {
    const id = await gravarEleicao(db, comissao, {
      id: null, titulo: "Rascunho com fotos", cargo: "Chapa", modo: "chapa", vagas: 2, escolhasPorCasa: 1,
      permiteBranco: false, regraDesempate: "comissao", abreEm: new Date(Date.now() + HORA), fechaEm: new Date(Date.now() + 9 * HORA),
      candidatos: [cand(1), cand(2)],
    });
    await salvarFotoCandidato(db, comissao, id, "c1", "data:image/jpeg;base64,AAAA");
    await salvarFotoCandidato(db, comissao, id, "c2", "data:image/jpeg;base64,BBBB");
    // Nova ordem: o Integrante 2 vira o 1º e o Integrante 1 sai; entra um novo.
    const novo = { ...cand(2), id: "c1", numero: 1 };
    const outro = { ...cand(3), id: "c2", numero: 2, nome: "Pessoa Nova" };
    await gravarEleicao(db, comissao, {
      id, titulo: "Rascunho com fotos", cargo: "Chapa", modo: "chapa", vagas: 2, escolhasPorCasa: 1,
      permiteBranco: false, regraDesempate: "comissao", abreEm: new Date(Date.now() + HORA), fechaEm: new Date(Date.now() + 9 * HORA),
      candidatos: [novo, outro],
    });
    expect(await fotosDaEleicao("a", id, db)).toEqual({ c1: "data:image/jpeg;base64,BBBB" });
  });
});
