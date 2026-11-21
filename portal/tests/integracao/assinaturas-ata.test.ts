/**
 * ASSINATURAS DIGITAIS DA ATA da votação, contra o simulador.
 *
 * Pedido do dono (21/11/2026): as assinaturas da ata são feitas com o dedo, no aparelho da
 * comissão ou por um link no WhatsApp que vale UMA vez (como no berçário Pingo de Gente).
 *
 * Como em eleicoes-painel.test.ts: a eleição abre e fecha no FUTURO pela hora real (assim nada
 * dispara sozinho por trás) e as funções recebem uma hora SIMULADA depois da apuração.
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getApps, initializeApp } from "firebase-admin/app";
import { Timestamp, getFirestore, type Firestore } from "firebase-admin/firestore";
import type { Contexto } from "@/server/contexto";
import {
  CARENCIA_APURACAO_MS,
  gravarEleicao,
  mudarStatusEleicao,
  registrarVotoEleicao,
} from "@/server/dados/eleicoes";
import {
  LIMITE_ATA_IP,
  assinarNoAparelho,
  assinarPorCodigo,
  ataPorCodigo,
  gerarLinkAssinatura,
  hashCodigoAta,
  lerAssinaturasAta,
  removerAssinatura,
} from "@/server/dados/assinaturas-ata";
import { refLimite } from "@/server/rate-limit";
import { calcularPermissoes } from "@/lib/permissoes";
import type { Candidato } from "@/lib/eleicoes";

const PROJETO = "demo-jardins-assinaturas";
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
    nome: uid === "sindico" ? "José Síndico" : uid,
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
const MINUTO = 60_000;

// PNG de verdade, 4 × 2 pixels (gerado com zlib).
const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAACCAYAAAB/qH1jAAAAEUlEQVR4nGOQt+r6j4wZ0AUA9HIPEfcIoVsAAAAASUVORK5CYII=";

const cand = (n: number): Candidato => ({
  id: `c${n}`,
  numero: n,
  nome: `Integrante ${n}`,
  funcao: n === 1 ? "Síndico" : "Fiscal",
  casa: `Casa ${40 + n}`,
  apresentacao: "",
  nascimento: null,
});

const eleicao = (id: string) => db.doc(`condominiums/a/elections/${id}`);
const assinatura = (id: string, vaga: string) => eleicao(id).collection("assinaturasAta").doc(vaga);
const linkDaVaga = (id: string, vaga: string) => eleicao(id).collection("assinaturasLinks").doc(vaga);
const indice = (codigo: string) => db.collection("ataCodigos").doc(hashCodigoAta(codigo));

let T0 = 0;
let ID = "";
/** Votando (antes do encerramento). */
let DENTRO: Date;
/** Encerrou, mas ainda na carência de 2 minutos (a urna não abriu). */
let CARENCIA: Date;
/** Depois da apuração. */
let DEPOIS: Date;

beforeEach(async () => {
  T0 = Date.now();
  await limpar();
  await db.doc("condominiums/a").set({ nome: "Residencial A", status: "ativo", fuso: "America/Belem" });
  await db.doc("condominiums/a/units/casa-1").set({ rotulo: "Casa 1", numero: 1, status: "ativa" });
  await db.doc("condominiums/a/units/casa-2").set({ rotulo: "Casa 2", numero: 2, status: "ativa" });
  await db.doc("condominiums/a/units/casa-3").set({ rotulo: "Casa 3", numero: 3, status: "ativa" });
  await db.doc("condominiums/a/units/casa-4").set({ rotulo: "Casa 4", numero: 4, status: "inativa" });
  const abre = T0 + HORA;
  const fecha = T0 + 9 * HORA;
  ID = await gravarEleicao(db, comissao, {
    id: null,
    titulo: "Eleição do síndico 2026",
    cargo: "Chapa única",
    modo: "chapa",
    vagas: 2,
    escolhasPorCasa: 1,
    permiteBranco: false,
    regraDesempate: "comissao",
    abreEm: new Date(abre),
    fechaEm: new Date(fecha),
    candidatos: [cand(1), cand(2)],
  });
  await mudarStatusEleicao(db, comissao, ID, "publicar");
  DENTRO = new Date(abre + HORA);
  CARENCIA = new Date(fecha + 30_000);
  DEPOIS = new Date(fecha + CARENCIA_APURACAO_MS + MINUTO);
  await registrarVotoEleicao(db, contexto("m-1", "casa-1", "morador"), ID, ["sim"], DENTRO);
  await registrarVotoEleicao(db, contexto("m-2", "casa-2", "morador"), ID, ["sim"], DENTRO);
});

const entrada = (vaga: string, nome = "  José   da Silva ") => ({ vaga, nome, imagem: PNG, aparelho: `Mozilla/5.0 ${"x".repeat(300)}` });

describe("assinar no aparelho da comissão", () => {
  it("grava nome, papel, imagem, via e quem coletou; a vaga já assinada recusa", async () => {
    const r = await assinarNoAparelho(db, comissao, ID, entrada("sindico"), DEPOIS);
    expect(r).toEqual({ nome: "José da Silva", papel: "Síndico(a)" });

    const doc = await assinatura(ID, "sindico").get();
    expect(doc.data()).toMatchObject({
      papel: "Síndico(a)",
      nome: "José da Silva",
      imagem: PNG,
      via: "aparelho",
      coletadoPorUid: "sindico",
      coletadoPorNome: "José Síndico",
    });
    expect(doc.get("assinadoEm")).toBeInstanceOf(Timestamp);
    expect(doc.get("aparelho")).toHaveLength(160);

    const lidas = await lerAssinaturasAta(comissao, ID, db);
    expect(lidas.assinaturas.sindico).toMatchObject({ vaga: "sindico", nome: "José da Silva", via: "aparelho", imagem: PNG });
    expect(lidas.assinaturas.sindico?.assinadoEm).toBeInstanceOf(Date);
    expect(lidas.links).toEqual({});

    // Uma assinatura por vaga (a transação usa "create").
    await expect(assinarNoAparelho(db, comissao, ID, entrada("sindico", "Outra Pessoa"), DEPOIS)).rejects.toThrow(/já foi assinada/);
    expect((await assinatura(ID, "sindico").get()).get("nome")).toBe("José da Silva");
  });

  it("confere vaga, nome completo e imagem", async () => {
    await expect(assinarNoAparelho(db, comissao, ID, entrada("presidente"), DEPOIS)).rejects.toThrow(/inválida/);
    await expect(assinarNoAparelho(db, comissao, ID, entrada("sindico", "José"), DEPOIS)).rejects.toThrow(/sobrenome/);
    await expect(
      assinarNoAparelho(db, comissao, ID, { ...entrada("sindico"), imagem: "data:image/png;base64,AAAA" }, DEPOIS),
    ).rejects.toThrow(/assine de novo/);
    expect((await assinatura(ID, "sindico").get()).exists).toBe(false);
  });

  it("antes da apuração recusa (votando e na carência de 2 minutos)", async () => {
    for (const agora of [DENTRO, CARENCIA]) {
      await expect(assinarNoAparelho(db, comissao, ID, entrada("sindico"), agora)).rejects.toThrow(/depois da apuração/);
      await expect(gerarLinkAssinatura(db, comissao, ID, "testemunha", agora)).rejects.toThrow(/depois da apuração/);
    }
    expect((await eleicao(ID).collection("assinaturasAta").get()).size).toBe(0);
    expect((await db.collection("ataCodigos").get()).size).toBe(0);
  });

  it("só a comissão (eleicoes.gerenciar) assina no aparelho, gera link, remove e lê", async () => {
    const morador = contexto("m-1", "casa-1", "morador");
    await expect(assinarNoAparelho(db, morador, ID, entrada("sindico"), DEPOIS)).rejects.toThrow(/não permite/);
    await expect(gerarLinkAssinatura(db, morador, ID, "sindico", DEPOIS)).rejects.toThrow(/não permite/);
    await expect(removerAssinatura(db, morador, ID, "sindico")).rejects.toThrow(/não permite/);
    await expect(lerAssinaturasAta(morador, ID, db)).rejects.toThrow(/não permite/);
  });
});

describe("assinar pelo link", () => {
  it("o link vale uma vez: assina, apaga o link e o índice; gerar de novo troca o anterior", async () => {
    const g1 = await gerarLinkAssinatura(db, comissao, ID, "testemunha", DEPOIS);
    const g2 = await gerarLinkAssinatura(db, comissao, ID, "testemunha", DEPOIS);
    expect(g1.codigo).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{10}$/);
    expect(g2.codigo).not.toBe(g1.codigo);
    expect(g2).toMatchObject({ papel: "Testemunha", titulo: "Eleição do síndico 2026" });
    // O índice do link antigo some; o novo aponta para a eleição e a vaga.
    expect((await indice(g1.codigo).get()).exists).toBe(false);
    expect((await indice(g2.codigo).get()).data()).toMatchObject({ condominioId: "a", eleicaoId: ID, vaga: "testemunha" });
    expect((await linkDaVaga(ID, "testemunha").get()).data()).toMatchObject({ codigo: g2.codigo, criadoPor: "sindico" });

    // A comissão vê o link que está valendo (para mandar de novo).
    expect((await lerAssinaturasAta(comissao, ID, db)).links.testemunha?.codigo).toBe(g2.codigo);

    // A página do link: resultado em uma linha e o papel de quem assina.
    expect(await ataPorCodigo(g1.codigo, { db, agora: DEPOIS })).toBeNull();
    const pagina = await ataPorCodigo(g2.codigo.toLowerCase(), { db, agora: DEPOIS });
    expect(pagina).toMatchObject({
      codigo: g2.codigo,
      condominioNome: "Residencial A",
      titulo: "Eleição do síndico 2026",
      vaga: "testemunha",
      papel: "Testemunha",
      resultado: "Chapa ELEITA",
      numeros: "Sim 2 · Não 0 · Nulos 1",
      votaram: 2,
      casasAptas: 3,
      participacao: 67,
    });

    const r = await assinarPorCodigo(
      g2.codigo,
      { nome: "Maria Souza", imagem: PNG, aparelho: "iPhone Safari" },
      { db, agora: DEPOIS, ip: "1.2.3.4" },
    );
    expect(r).toEqual({ nome: "Maria Souza", papel: "Testemunha", titulo: "Eleição do síndico 2026" });
    const doc = await assinatura(ID, "testemunha").get();
    expect(doc.data()).toMatchObject({ papel: "Testemunha", nome: "Maria Souza", imagem: PNG, via: "link", aparelho: "iPhone Safari" });
    expect(doc.get("coletadoPorUid")).toBeUndefined();

    // Na mesma transação: o link e o índice somem.
    expect((await linkDaVaga(ID, "testemunha").get()).exists).toBe(false);
    expect((await indice(g2.codigo).get()).exists).toBe(false);

    // Usar de novo não vale (nem para outra pessoa) e a página não abre mais.
    await expect(
      assinarPorCodigo(g2.codigo, { nome: "Outra Pessoa", imagem: PNG }, { db, agora: DEPOIS, ip: "1.2.3.4" }),
    ).rejects.toThrow(/não vale mais/);
    expect(await ataPorCodigo(g2.codigo, { db, agora: DEPOIS })).toBeNull();
    expect((await assinatura(ID, "testemunha").get()).get("nome")).toBe("Maria Souza");
    // Vaga assinada não aceita link novo.
    await expect(gerarLinkAssinatura(db, comissao, ID, "testemunha", DEPOIS)).rejects.toThrow(/já foi assinada/);
  });

  it("código inválido recusa e conta no limite do endereço; código certo nunca é barrado", async () => {
    const ip = "9.9.9.9";
    const valido = { nome: "Maria Souza", imagem: PNG };
    await expect(assinarPorCodigo("ABCDEFGHJK", valido, { db, agora: DEPOIS, ip })).rejects.toThrow(/não vale mais/);
    await expect(assinarPorCodigo("123", valido, { db, agora: DEPOIS, ip })).rejects.toThrow(/não vale mais/);
    const limite = refLimite(db, LIMITE_ATA_IP.acao, ip);
    expect((await limite.get()).get("contagem")).toBe(2);

    // Passou do limite: os códigos errados são barrados com outro aviso.
    await limite.set({ acao: LIMITE_ATA_IP.acao, inicio: Date.now(), contagem: LIMITE_ATA_IP.limite, expiraEm: Timestamp.fromMillis(Date.now() + 600_000) });
    await expect(assinarPorCodigo("ABCDEFGHJK", valido, { db, agora: DEPOIS, ip })).rejects.toThrow(/Muitas tentativas/);

    // Mesmo assim, o link certo assina (muita gente usa o mesmo endereço de internet).
    const g = await gerarLinkAssinatura(db, comissao, ID, "comissao-2", DEPOIS);
    await expect(assinarPorCodigo(g.codigo, valido, { db, agora: DEPOIS, ip })).resolves.toMatchObject({ papel: "Comissão eleitoral" });
  });

  it("nome incompleto é recusado sem gastar o link", async () => {
    const g = await gerarLinkAssinatura(db, comissao, ID, "sindico", DEPOIS);
    await expect(assinarPorCodigo(g.codigo, { nome: "Maria", imagem: PNG }, { db, agora: DEPOIS, ip: "5.5.5.5" })).rejects.toThrow(
      /sobrenome/,
    );
    expect((await indice(g.codigo).get()).exists).toBe(true);
    expect((await refLimite(db, LIMITE_ATA_IP.acao, "5.5.5.5").get()).exists).toBe(false);
  });

  it("assinar no aparelho derruba o link que esperava a mesma vaga", async () => {
    const g = await gerarLinkAssinatura(db, comissao, ID, "comissao-1", DEPOIS);
    await assinarNoAparelho(db, comissao, ID, entrada("comissao-1"), DEPOIS);
    expect((await linkDaVaga(ID, "comissao-1").get()).exists).toBe(false);
    expect((await indice(g.codigo).get()).exists).toBe(false);
    await expect(assinarPorCodigo(g.codigo, { nome: "Maria Souza", imagem: PNG }, { db, agora: DEPOIS })).rejects.toThrow(
      /não vale mais/,
    );
  });
});

describe("remover e auditoria", () => {
  it("remover apaga a assinatura, audita e a vaga volta a aceitar assinatura", async () => {
    await assinarNoAparelho(db, comissao, ID, entrada("sindico"), DEPOIS);
    await expect(removerAssinatura(db, comissao, ID, "sindico")).resolves.toEqual({ nome: "José da Silva", papel: "Síndico(a)" });
    expect((await assinatura(ID, "sindico").get()).exists).toBe(false);
    await expect(removerAssinatura(db, comissao, ID, "sindico")).rejects.toThrow(/sem assinatura/);
    await expect(assinarNoAparelho(db, comissao, ID, entrada("sindico", "José Correto Silva"), DEPOIS)).resolves.toMatchObject({
      nome: "José Correto Silva",
    });
  });

  it("registra assinou/link/removeu com vaga, papel, nome e via — nunca a imagem nem o código", async () => {
    await assinarNoAparelho(db, comissao, ID, entrada("sindico"), DEPOIS);
    const g = await gerarLinkAssinatura(db, comissao, ID, "testemunha", DEPOIS);
    await assinarPorCodigo(g.codigo, { nome: "Maria Souza", imagem: PNG }, { db, agora: DEPOIS });
    await removerAssinatura(db, comissao, ID, "sindico");

    const snap = await db.collection("condominiums/a/auditLogs").where("acao", "==", "eleicao.assinatura").get();
    const logs = snap.docs.map((d) => d.data());
    const resumo = logs
      .map((l) => [l.detalhes.acao, l.detalhes.vaga, l.detalhes.papel, l.detalhes.nome, l.detalhes.via, l.uid])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0])) || String(a[1]).localeCompare(String(b[1])));
    expect(resumo).toEqual([
      ["assinou", "sindico", "Síndico(a)", "José da Silva", "aparelho", "sindico"],
      ["assinou", "testemunha", "Testemunha", "Maria Souza", "link", "link-ata:testemunha"],
      ["link", "testemunha", "Testemunha", null, "link", "sindico"],
      ["removeu", "sindico", "Síndico(a)", "José da Silva", "aparelho", "sindico"],
    ]);
    for (const l of logs) {
      expect(l.alvo).toMatch(new RegExp(`^elections/${ID}/assinaturasAta/`));
      expect(l.detalhes.titulo).toBe("Eleição do síndico 2026");
    }
    // Nada da imagem nem do código secreto do link.
    const json = JSON.stringify(logs);
    expect(json).not.toMatch(/data:image|iVBOR|base64/);
    expect(json).not.toContain(g.codigo);
    expect(json).not.toContain(hashCodigoAta(g.codigo));
  });
});
