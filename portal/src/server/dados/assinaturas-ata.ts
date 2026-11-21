import "server-only";
import { createHash } from "node:crypto";
import {
  FieldValue,
  type DocumentSnapshot,
  type Firestore,
  type Transaction,
} from "firebase-admin/firestore";
import { adminDb } from "../firebase-admin";
import { garantirPermissao, type Contexto } from "../contexto";
import { registrarAuditoria } from "../auditoria";
import { consumirTentativa, limiteEstourado } from "../rate-limit";
import { ErroDeNegocio } from "../acoes/resultado";
import {
  apuracaoLiberada,
  base,
  contarVotantes,
  data,
  eleicoesDe,
  lerApuracao,
  paraEleicao,
  texto,
  type EleicaoInterna,
} from "./eleicoes";
import { limparCodigo, novoCodigo } from "./votacao-links";
import {
  papelDaVaga,
  resumoAparelho,
  vagaValida,
  validarImagemAssinatura,
  validarNomeCompleto,
  type VagaAta,
  type ViaAssinatura,
} from "@/lib/assinaturas-ata";
import {
  porcentagemParticipacao,
  resumoNumerosResultado,
  tituloResultado,
} from "@/lib/eleicoes";
import { FUSO_PADRAO } from "@/lib/formato";

/**
 * ASSINATURAS DIGITAIS DA ATA (relatório final) da votação oficial.
 *
 * Pedido do dono (21/11/2026): "as assinaturas necessárias no relatório final devem ser
 * preenchidas digitalmente, como já fazemos no berçário Pingo de Gente". Duas formas:
 * - NO APARELHO da comissão: a pessoa pega o celular da comissão, escreve o nome completo e
 *   assina com o dedo na própria ata. Fica registrado quem da comissão estava com o aparelho.
 * - POR LINK no WhatsApp: a comissão gera um link com CÓDIGO secreto (mesmo jeito do link de
 *   voto, 10 letras/números sem os que se confundem) e manda. Quem recebe abre, confere o
 *   resultado, escreve o nome e assina, sem senha. O link vale UMA vez.
 *
 * Coleções (dentro de condominiums/{c}/elections/{id}):
 * - assinaturasAta/{vaga}: { papel, nome, imagem (PNG em data URL), assinadoEm, aparelho,
 *   via, coletadoPorUid/Nome (só no aparelho) }. O id é a vaga: "create" garante uma
 *   assinatura por vaga, mesmo com duas pessoas assinando ao mesmo tempo.
 * - assinaturasLinks/{vaga}: { codigo, hash, criadoEm, criadoPor } — o link que está valendo
 *   para a vaga (a comissão pode mandar de novo). Gerar outro troca o anterior.
 * E fora do condomínio, para achar rápido pelo código:
 * - ataCodigos/{sha256("ata:"+código)}: { condominioId, eleicaoId, vaga, criadoEm }.
 *
 * Regras:
 * - só depois da apuração (apuracaoLiberada) e só em vaga ainda sem assinatura;
 * - assinar pelo link grava a assinatura E apaga o link e o índice na MESMA transação: o
 *   mesmo link nunca assina duas vezes; assinar no aparelho também derruba o link da vaga;
 * - remover (para corrigir engano) é só da comissão e fica na auditoria;
 * - a auditoria ("eleicao.assinatura") guarda vaga, papel, nome e como foi — NUNCA a imagem
 *   nem o código do link;
 * - o navegador não lê nada disso: firestore.rules nega elections/** e qualquer caminho não
 *   listado (ataCodigos). Tudo passa por aqui, no servidor.
 */

const COL_ASSINATURAS = "assinaturasAta";
const COL_LINKS = "assinaturasLinks";

const codigosCol = (db: Firestore) => db.collection("ataCodigos");

export const hashCodigoAta = (codigo: string) =>
  createHash("sha256").update(`ata:${codigo}`).digest("hex");

const refsDaVaga = (db: Firestore, condominioId: string, id: string, vaga: VagaAta) => {
  const eleicao = eleicoesDe({ condominioId }, db).doc(id);
  return {
    eleicao,
    assinatura: eleicao.collection(COL_ASSINATURAS).doc(vaga),
    link: eleicao.collection(COL_LINKS).doc(vaga),
  };
};

export type AssinaturaAta = {
  vaga: VagaAta;
  papel: string;
  nome: string;
  imagem: string;
  assinadoEm: Date | null;
  via: ViaAssinatura;
};

export type LinkAssinaturaAta = {
  vaga: VagaAta;
  codigo: string;
  criadoEm: Date | null;
};

export type AssinaturasDaAta = {
  assinaturas: Partial<Record<VagaAta, AssinaturaAta>>;
  /** Links que ainda estão valendo (vaga sem assinatura). Só a comissão vê. */
  links: Partial<Record<VagaAta, LinkAssinaturaAta>>;
};

// ---------- Conferências ----------

/** Confere nome e imagem; lança erro de negócio com a explicação para a pessoa. */
function conferirAssinatura(nome: string, imagem: string): { nome: string; imagem: string } {
  const n = validarNomeCompleto(nome);
  if (!n.ok) throw new ErroDeNegocio(n.erro);
  const i = validarImagemAssinatura(imagem);
  if (!i.ok) throw new ErroDeNegocio(i.erro);
  return { nome: n.nome, imagem: i.imagem };
}

function conferirVaga(vaga: string): VagaAta {
  if (!vagaValida(vaga)) throw new ErroDeNegocio("Parte da ata inválida. Atualize a página.");
  return vaga;
}

/** A ata só existe depois da apuração (mesma regra do resultado). */
function exigirApuracao(e: EleicaoInterna, agora: Date): void {
  if (e.status !== "publicada" || !apuracaoLiberada(e, agora))
    throw new ErroDeNegocio("A ata só pode ser assinada depois da apuração da votação.");
}

const jaAssinada = (vaga: VagaAta) =>
  new ErroDeNegocio(`A parte "${papelDaVaga(vaga)}" já foi assinada. Atualize a página para ver.`);

/** Apaga o link da vaga (e o índice do código), se houver um valendo. */
function apagarLink(tx: Transaction, db: Firestore, link: DocumentSnapshot): void {
  if (!link.exists) return;
  const hash = link.get("hash");
  if (typeof hash === "string" && /^[0-9a-f]{64}$/.test(hash)) tx.delete(codigosCol(db).doc(hash));
  tx.delete(link.ref);
}

type Autor = { condominioId: string; uid: string; nome?: string; papel?: string };

function auditar(
  db: Firestore,
  tx: Transaction,
  autor: Autor,
  id: string,
  detalhes: {
    acao: "assinou" | "removeu" | "link";
    vaga: VagaAta;
    titulo: string;
    nome?: string;
    via?: ViaAssinatura;
  },
) {
  registrarAuditoria(db, tx, {
    condominioId: autor.condominioId,
    uid: autor.uid,
    nome: autor.nome,
    papel: autor.papel,
    acao: "eleicao.assinatura",
    alvo: `elections/${id}/${COL_ASSINATURAS}/${detalhes.vaga}`,
    // Nunca a imagem nem o código do link.
    detalhes: {
      acao: detalhes.acao,
      vaga: detalhes.vaga,
      papel: papelDaVaga(detalhes.vaga),
      titulo: detalhes.titulo,
      nome: detalhes.nome ?? null,
      via: detalhes.via ?? null,
    },
  });
}

function paraAssinatura(vaga: VagaAta, d: DocumentSnapshot): AssinaturaAta | null {
  const imagem = validarImagemAssinatura(d.get("imagem"));
  const nome = texto(d.get("nome"));
  if (!imagem.ok || !nome) return null;
  return {
    vaga,
    papel: texto(d.get("papel"), papelDaVaga(vaga)),
    nome,
    imagem: imagem.imagem,
    assinadoEm: data(d.get("assinadoEm")),
    via: d.get("via") === "link" ? "link" : "aparelho",
  };
}

// ---------- Comissão (eleicoes.gerenciar) ----------

/** Assinaturas já feitas e links ainda valendo, para a ata. */
export async function lerAssinaturasAta(
  ctx: Contexto,
  id: string,
  db: Firestore = adminDb(),
): Promise<AssinaturasDaAta> {
  garantirPermissao(ctx, "eleicoes.gerenciar");
  const eleicao = eleicoesDe(ctx, db).doc(id);
  const [assinaturas, links] = await Promise.all([
    eleicao.collection(COL_ASSINATURAS).get(),
    eleicao.collection(COL_LINKS).get(),
  ]);
  const r: AssinaturasDaAta = { assinaturas: {}, links: {} };
  for (const d of assinaturas.docs) {
    if (!vagaValida(d.id)) continue;
    const a = paraAssinatura(d.id, d);
    if (a) r.assinaturas[d.id] = a;
  }
  for (const d of links.docs) {
    const codigo = limparCodigo(texto(d.get("codigo")));
    if (!vagaValida(d.id) || !codigo || r.assinaturas[d.id]) continue;
    r.links[d.id] = { vaga: d.id, codigo, criadoEm: data(d.get("criadoEm")) };
  }
  return r;
}

/**
 * Assinatura feita NO APARELHO da comissão (a pessoa assina com o dedo no celular de quem
 * está com a ata aberta). Fica registrado quem da comissão estava com o aparelho.
 */
export async function assinarNoAparelho(
  db: Firestore,
  ctx: Contexto,
  id: string,
  entrada: { vaga: string; nome: string; imagem: string; aparelho?: string | null },
  agora = new Date(),
): Promise<{ nome: string; papel: string }> {
  garantirPermissao(ctx, "eleicoes.gerenciar");
  const vaga = conferirVaga(entrada.vaga);
  const { nome, imagem } = conferirAssinatura(entrada.nome, entrada.imagem);
  const papel = papelDaVaga(vaga);
  const refs = refsDaVaga(db, ctx.condominioId, id, vaga);
  await db.runTransaction(async (tx) => {
    const [doc, assinatura, link] = await tx.getAll(refs.eleicao, refs.assinatura, refs.link);
    if (!doc.exists) throw new ErroDeNegocio("Votação não encontrada. Atualize a página.");
    const e = paraEleicao(doc.id, doc.data());
    exigirApuracao(e, agora);
    if (assinatura.exists) throw jaAssinada(vaga);
    // Quem assinou aqui não precisa mais do link: ele para de valer.
    apagarLink(tx, db, link);
    tx.create(refs.assinatura, {
      papel,
      nome,
      imagem,
      assinadoEm: FieldValue.serverTimestamp(),
      aparelho: resumoAparelho(entrada.aparelho),
      via: "aparelho",
      coletadoPorUid: ctx.uid,
      coletadoPorNome: ctx.nome,
    });
    auditar(db, tx, ctx, id, { acao: "assinou", vaga, titulo: e.titulo, nome, via: "aparelho" });
  });
  return { nome, papel };
}

/**
 * Cria (ou troca) o link de assinatura de UMA vaga. O link anterior da vaga para de valer na
 * hora. Devolve o código; o endereço completo é montado por quem chama.
 */
export async function gerarLinkAssinatura(
  db: Firestore,
  ctx: Contexto,
  id: string,
  vagaBruta: string,
  agora = new Date(),
): Promise<{ codigo: string; papel: string; titulo: string }> {
  garantirPermissao(ctx, "eleicoes.gerenciar");
  const vaga = conferirVaga(vagaBruta);
  const refs = refsDaVaga(db, ctx.condominioId, id, vaga);
  return db.runTransaction(async (tx) => {
    const [doc, assinatura, link] = await tx.getAll(refs.eleicao, refs.assinatura, refs.link);
    if (!doc.exists) throw new ErroDeNegocio("Votação não encontrada. Atualize a página.");
    const e = paraEleicao(doc.id, doc.data());
    exigirApuracao(e, agora);
    if (assinatura.exists) throw jaAssinada(vaga);
    const antigo = link.get("hash");
    if (typeof antigo === "string" && /^[0-9a-f]{64}$/.test(antigo)) tx.delete(codigosCol(db).doc(antigo));
    const codigo = novoCodigo();
    const hash = hashCodigoAta(codigo);
    tx.create(codigosCol(db).doc(hash), {
      condominioId: ctx.condominioId,
      eleicaoId: id,
      vaga,
      criadoEm: FieldValue.serverTimestamp(),
    });
    tx.set(refs.link, { codigo, hash, criadoEm: FieldValue.serverTimestamp(), criadoPor: ctx.uid });
    auditar(db, tx, ctx, id, { acao: "link", vaga, titulo: e.titulo, via: "link" });
    return { codigo, papel: papelDaVaga(vaga), titulo: e.titulo };
  });
}

/** Tira uma assinatura da ata (para corrigir engano). Fica na auditoria. */
export async function removerAssinatura(
  db: Firestore,
  ctx: Contexto,
  id: string,
  vagaBruta: string,
): Promise<{ nome: string; papel: string }> {
  garantirPermissao(ctx, "eleicoes.gerenciar");
  const vaga = conferirVaga(vagaBruta);
  const refs = refsDaVaga(db, ctx.condominioId, id, vaga);
  return db.runTransaction(async (tx) => {
    const [doc, assinatura] = await tx.getAll(refs.eleicao, refs.assinatura);
    if (!doc.exists) throw new ErroDeNegocio("Votação não encontrada. Atualize a página.");
    if (!assinatura.exists)
      throw new ErroDeNegocio(`A parte "${papelDaVaga(vaga)}" já estava sem assinatura. Atualize a página.`);
    const nome = texto(assinatura.get("nome"));
    const via: ViaAssinatura = assinatura.get("via") === "link" ? "link" : "aparelho";
    tx.delete(refs.assinatura);
    auditar(db, tx, ctx, id, {
      acao: "removeu",
      vaga,
      titulo: texto(doc.get("titulo"), "Eleição"),
      nome,
      via,
    });
    return { nome, papel: papelDaVaga(vaga) };
  });
}

// ---------- Público: página do link de assinatura ----------

/**
 * Limite por endereço de internet (IP) só para códigos ERRADOS (que não existem ou já foram
 * usados): abrir a página ou tentar assinar com eles. Código certo nunca é barrado.
 */
export const LIMITE_ATA_IP = { acao: "ata.codigo.invalido", limite: 30, janelaSegundos: 10 * 60 } as const;

export const ipBarradoAta = (db: Firestore, ip: string) =>
  limiteEstourado(db, LIMITE_ATA_IP.acao, ip, LIMITE_ATA_IP.limite, LIMITE_ATA_IP.janelaSegundos);

export const contarCodigoInvalidoAta = (db: Firestore, ip: string) =>
  consumirTentativa(db, LIMITE_ATA_IP.acao, ip, LIMITE_ATA_IP.limite, LIMITE_ATA_IP.janelaSegundos);

const MENSAGEM_LINK_INVALIDO =
  "Este link de assinatura não vale mais (já foi usado ou foi trocado). Peça um link novo à comissão eleitoral.";

/** Recusa um código errado vindo de `ip`: conta no limite do endereço e explica. */
async function recusarCodigo(db: Firestore, ip: string | undefined): Promise<never> {
  if (ip) {
    if (await ipBarradoAta(db, ip))
      throw new ErroDeNegocio("Muitas tentativas seguidas. Espere alguns minutos e tente de novo.");
    await contarCodigoInvalidoAta(db, ip);
  }
  throw new ErroDeNegocio(MENSAGEM_LINK_INVALIDO);
}

type AlvoAta = { condominioId: string; eleicaoId: string; vaga: VagaAta; hash: string };

async function resolverCodigoAta(db: Firestore, codigo: string): Promise<AlvoAta | null> {
  const hash = hashCodigoAta(codigo);
  const doc = await codigosCol(db).doc(hash).get();
  if (!doc.exists) return null;
  const condominioId = texto(doc.get("condominioId"));
  const eleicaoId = texto(doc.get("eleicaoId"));
  const vaga = doc.get("vaga");
  return condominioId && eleicaoId && vagaValida(vaga) ? { condominioId, eleicaoId, vaga, hash } : null;
}

export type AtaPorLink = {
  codigo: string;
  condominioNome: string;
  fuso: string;
  titulo: string;
  cargo: string;
  vaga: VagaAta;
  papel: string;
  /** "Chapa ELEITA" / "Eleitos: …" */
  resultado: string;
  /** "Sim 30 · Não 5 · Sem votar 3" */
  numeros: string;
  votaram: number;
  casasAptas: number;
  participacao: number;
};

/**
 * Tudo que a página do link mostra: condomínio, votação, resultado em uma linha e o papel de
 * quem assina. null se o código não existe, já foi usado, foi trocado ou a vaga já tem
 * assinatura (a página mostra um aviso simples e conta no limite do endereço).
 */
export async function ataPorCodigo(
  codigoBruto: string,
  opcoes: { db?: Firestore; agora?: Date } = {},
): Promise<AtaPorLink | null> {
  const db = opcoes.db ?? adminDb();
  const agora = opcoes.agora ?? new Date();
  const codigo = limparCodigo(codigoBruto);
  if (!codigo) return null;
  const alvo = await resolverCodigoAta(db, codigo);
  if (!alvo) return null;
  const refs = refsDaVaga(db, alvo.condominioId, alvo.eleicaoId, alvo.vaga);
  const [cond, doc, assinatura, link] = await Promise.all([
    base({ condominioId: alvo.condominioId }, db).get(),
    refs.eleicao.get(),
    refs.assinatura.get(),
    refs.link.get(),
  ]);
  if (!cond.exists || cond.get("status") === "suspenso" || !doc.exists) return null;
  if (assinatura.exists || link.get("hash") !== alvo.hash) return null;
  const e = paraEleicao(doc.id, doc.data());
  if (e.status !== "publicada" || !apuracaoLiberada(e, agora)) return null;
  const ctx = { condominioId: alvo.condominioId };
  const [apuracao, votaram] = await Promise.all([
    lerApuracao(ctx, e, agora, db),
    contarVotantes(ctx, e.id, db),
  ]);
  const casasAptas = e.casasAptas ?? votaram;
  return {
    codigo,
    condominioNome: texto(cond.get("nome"), "Residencial Jardins do Lago"),
    fuso: texto(cond.get("fuso"), FUSO_PADRAO),
    titulo: e.titulo,
    cargo: e.cargo,
    vaga: alvo.vaga,
    papel: papelDaVaga(alvo.vaga),
    resultado: tituloResultado(apuracao),
    numeros: resumoNumerosResultado(apuracao),
    votaram,
    casasAptas,
    participacao: porcentagemParticipacao(votaram, casasAptas),
  };
}

/** Erro interno: o código não vale (some ou foi trocado) — tratado fora da transação. */
class CodigoQueNaoVale extends Error {}

/**
 * Assinatura pelo LINK (sem login). A eleição e a vaga vêm do CÓDIGO, nunca do formulário.
 * Na mesma transação: grava a assinatura, apaga o link da vaga e o índice do código.
 */
export async function assinarPorCodigo(
  codigoBruto: string,
  entrada: { nome: string; imagem: string; aparelho?: string | null },
  opcoes: { db?: Firestore; agora?: Date; ip?: string } = {},
): Promise<{ nome: string; papel: string; titulo: string }> {
  const db = opcoes.db ?? adminDb();
  const agora = opcoes.agora ?? new Date();
  const codigo = limparCodigo(codigoBruto);
  if (!codigo) return recusarCodigo(db, opcoes.ip);
  const { nome, imagem } = conferirAssinatura(entrada.nome, entrada.imagem);
  const alvo = await resolverCodigoAta(db, codigo);
  if (!alvo) return recusarCodigo(db, opcoes.ip);
  const refs = refsDaVaga(db, alvo.condominioId, alvo.eleicaoId, alvo.vaga);
  const indice = codigosCol(db).doc(alvo.hash);
  const papel = papelDaVaga(alvo.vaga);
  try {
    return await db.runTransaction(async (tx) => {
      const [i, link, assinatura, doc, cond] = await tx.getAll(
        indice,
        refs.link,
        refs.assinatura,
        refs.eleicao,
        base({ condominioId: alvo.condominioId }, db),
      );
      // Conferido de novo DENTRO da transação: duas abas assinando ao mesmo tempo com o
      // mesmo link — a segunda encontra o índice já apagado.
      if (!i.exists || link.get("hash") !== alvo.hash) throw new CodigoQueNaoVale();
      if (!cond.exists || cond.get("status") === "suspenso" || !doc.exists) throw new CodigoQueNaoVale();
      const e = paraEleicao(doc.id, doc.data());
      exigirApuracao(e, agora);
      if (assinatura.exists) throw jaAssinada(alvo.vaga);
      tx.create(refs.assinatura, {
        papel,
        nome,
        imagem,
        assinadoEm: FieldValue.serverTimestamp(),
        aparelho: resumoAparelho(entrada.aparelho),
        via: "link",
      });
      tx.delete(refs.link);
      tx.delete(indice);
      auditar(
        db,
        tx,
        { condominioId: alvo.condominioId, uid: `link-ata:${alvo.vaga}`, nome: `Link da ata · ${papel}` },
        alvo.eleicaoId,
        { acao: "assinou", vaga: alvo.vaga, titulo: e.titulo, nome, via: "link" },
      );
      return { nome, papel, titulo: e.titulo };
    });
  } catch (erro) {
    if (erro instanceof CodigoQueNaoVale) return recusarCodigo(db, opcoes.ip);
    throw erro;
  }
}
