import "server-only";
import { Timestamp, type DocumentData, type Firestore } from "firebase-admin/firestore";
import { adminDb } from "../firebase-admin";
import { garantirPermissao, type Contexto } from "../contexto";
import {
  ehCategoria,
  ehStatusClassificado,
  estaVisivel,
  situacaoEfetiva,
  type CategoriaClassificado,
  type StatusClassificado,
} from "@/lib/classificados";
import { enderecosFotos, lerFotos, type FotoGuardada } from "@/lib/fotos";

/**
 * Dados dos classificados.
 *
 * Coleção (dentro de condominiums/{c}): classifieds/{id}. NUNCA é apagado: o
 * status muda (pendente → aprovado / rejeitado / removido). "Expirado" é
 * calculado na leitura (aprovado com expiraEm no passado).
 *
 * Cada função devolve uma LISTA FECHADA de campos, do jeito que a tela precisa:
 * - lista dos moradores: primeiro nome do autor e o WhatsApp que ele quis mostrar
 *   (nunca a casa, nunca o uid);
 * - "meus anúncios": só os do próprio autor;
 * - moderação: inclui a casa (o síndico precisa saber quem anunciou).
 *
 * As consultas usam um campo só (status ou autorUid) e ordenam aqui no servidor:
 * assim não precisam de índice composto no Firestore.
 */

const base = (ctx: Pick<Contexto, "condominioId">, db: Firestore = adminDb()) =>
  db.collection("condominiums").doc(ctx.condominioId).collection("classifieds");

/** Teto de segurança das leituras (um condomínio pequeno fica bem abaixo disso). */
const LIMITE_LEITURA = 500;

// ---------- Conversão do documento (uso interno) ----------

type Bruto = {
  id: string;
  titulo: string;
  texto: string;
  categoria: CategoriaClassificado;
  preco: number | null;
  contatoWhatsapp: string | null;
  autorUid: string;
  autorPrimeiroNome: string;
  unitId: string | null;
  status: StatusClassificado;
  motivo: string;
  criadoEm: Date | null;
  decididoEm: Date | null;
  expiraEm: Date | null;
  fotos: FotoGuardada[];
};

function data(v: unknown): Date | null {
  return (v as Timestamp | undefined)?.toDate?.() ?? null;
}

function texto(v: unknown, padrao = ""): string {
  return typeof v === "string" ? v : padrao;
}

/** `condominioId` só é preciso para ler as fotos (as ações que só mudam o status não passam). */
export function paraClassificado(id: string, d: DocumentData | undefined, condominioId = ""): Bruto {
  return {
    id,
    titulo: texto(d?.titulo, "Anúncio"),
    texto: texto(d?.texto),
    categoria: ehCategoria(d?.categoria) ? d.categoria : "outro",
    preco: typeof d?.preco === "number" && Number.isSafeInteger(d.preco) && d.preco > 0 ? d.preco : null,
    contatoWhatsapp: typeof d?.contatoWhatsapp === "string" && /^\d{10,13}$/.test(d.contatoWhatsapp) ? d.contatoWhatsapp : null,
    autorUid: texto(d?.autorUid),
    autorPrimeiroNome: texto(d?.autorPrimeiroNome, "Morador"),
    unitId: typeof d?.unitId === "string" ? d.unitId : null,
    // Valor desconhecido no banco: tratamos como removido (não aparece para ninguém).
    status: ehStatusClassificado(d?.status) ? d.status : "removido",
    motivo: texto(d?.motivo),
    criadoEm: data(d?.criadoEm),
    decididoEm: data(d?.decididoEm),
    expiraEm: data(d?.expiraEm),
    fotos: condominioId ? lerFotos(d?.fotos, condominioId, "classificados") : [],
  };
}

/** Endereços protegidos das fotos do anúncio (/api/fotos/...). */
const fotosDe = (a: Bruto) => enderecosFotos("classificados", a.id, a.fotos);

const maisNovoPrimeiro = (a: Date | null, b: Date | null) => (b?.getTime() ?? 0) - (a?.getTime() ?? 0);

// ---------- Lista dos moradores ----------

/** O que qualquer morador logado vê de um anúncio publicado. */
export type AnuncioPublico = {
  id: string;
  titulo: string;
  texto: string;
  categoria: CategoriaClassificado;
  preco: number | null;
  contatoWhatsapp: string | null;
  autorPrimeiroNome: string;
  publicadoEm: Date | null;
  expiraEm: Date | null;
  /** É da própria pessoa? (para mostrar "Seu anúncio"; o uid não sai do servidor) */
  meu: boolean;
  /** Endereços protegidos das fotos (a primeira é a capa). */
  fotos: string[];
};

/** Anúncios aprovados e dentro do prazo, do mais novo para o mais antigo. */
export async function anunciosPublicados(ctx: Contexto, agora = new Date()): Promise<AnuncioPublico[]> {
  garantirPermissao(ctx, "classificados.usar");
  // Busca pelo PRAZO (expiraEm no futuro), não só pelo status: os vencidos continuam
  // "aprovado" no banco e, com o tempo, encheriam o limite de leitura escondendo os novos.
  const snap = await base(ctx).where("expiraEm", ">", Timestamp.fromDate(agora)).limit(LIMITE_LEITURA).get();
  return snap.docs
    .map((d) => paraClassificado(d.id, d.data(), ctx.condominioId))
    .filter((a) => estaVisivel(a.status, a.expiraEm, agora))
    .sort((a, b) => maisNovoPrimeiro(a.decididoEm, b.decididoEm))
    .map((a) => ({
      id: a.id,
      titulo: a.titulo,
      texto: a.texto,
      categoria: a.categoria,
      preco: a.preco,
      contatoWhatsapp: a.contatoWhatsapp,
      autorPrimeiroNome: a.autorPrimeiroNome,
      publicadoEm: a.decididoEm,
      expiraEm: a.expiraEm,
      fotos: fotosDe(a),
      meu: a.autorUid === ctx.uid,
    }));
}

// ---------- Meus anúncios ----------

export type MeuAnuncio = {
  id: string;
  titulo: string;
  texto: string;
  categoria: CategoriaClassificado;
  preco: number | null;
  contatoWhatsapp: string | null;
  /** Já com "expirado" calculado. */
  situacao: StatusClassificado;
  motivo: string;
  criadoEm: Date | null;
  expiraEm: Date | null;
  /** Endereços protegidos das fotos (a primeira é a capa). */
  fotos: string[];
};

/** Todos os anúncios da própria pessoa (qualquer situação), do mais novo para o mais antigo. */
export async function meusAnuncios(ctx: Contexto, agora = new Date()): Promise<MeuAnuncio[]> {
  garantirPermissao(ctx, "classificados.usar");
  const snap = await base(ctx).where("autorUid", "==", ctx.uid).limit(LIMITE_LEITURA).get();
  return snap.docs
    .map((d) => paraClassificado(d.id, d.data(), ctx.condominioId))
    .sort((a, b) => maisNovoPrimeiro(a.criadoEm, b.criadoEm))
    .map((a) => ({
      id: a.id,
      titulo: a.titulo,
      texto: a.texto,
      categoria: a.categoria,
      preco: a.preco,
      contatoWhatsapp: a.contatoWhatsapp,
      situacao: situacaoEfetiva(a.status, a.expiraEm, agora),
      motivo: a.motivo,
      criadoEm: a.criadoEm,
      expiraEm: a.expiraEm,
      fotos: fotosDe(a),
    }));
}

/** Um anúncio da própria pessoa (para editar). De outra pessoa ou inexistente → null. */
export async function meuAnuncio(ctx: Contexto, id: string, agora = new Date()): Promise<MeuAnuncio | null> {
  garantirPermissao(ctx, "classificados.usar");
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return null;
  const d = await base(ctx).doc(id).get();
  if (!d.exists || d.get("autorUid") !== ctx.uid) return null;
  const a = paraClassificado(d.id, d.data(), ctx.condominioId);
  return {
    id: a.id,
    titulo: a.titulo,
    texto: a.texto,
    categoria: a.categoria,
    preco: a.preco,
    contatoWhatsapp: a.contatoWhatsapp,
    situacao: situacaoEfetiva(a.status, a.expiraEm, agora),
    motivo: a.motivo,
    criadoEm: a.criadoEm,
    expiraEm: a.expiraEm,
    fotos: fotosDe(a),
  };
}

// ---------- Moderação ----------

export type AnuncioModeracao = {
  id: string;
  titulo: string;
  texto: string;
  categoria: CategoriaClassificado;
  preco: number | null;
  contatoWhatsapp: string | null;
  autorPrimeiroNome: string;
  /** Casa de quem anunciou (só a moderação vê). */
  unidadeRotulo: string;
  situacao: StatusClassificado;
  motivo: string;
  criadoEm: Date | null;
  decididoEm: Date | null;
  expiraEm: Date | null;
  /** Endereços protegidos das fotos (a primeira é a capa). */
  fotos: string[];
};

export type FilaModeracao = {
  pendentes: AnuncioModeracao[];
  publicados: AnuncioModeracao[];
  /** Últimas decisões (rejeitados, removidos, expirados), para consulta. */
  historico: AnuncioModeracao[];
};

/** Quantos itens do histórico mostrar. */
const TAMANHO_HISTORICO = 20;

/** Rótulo das casas ("Casa 12"), buscando só as que aparecem na lista. */
async function rotulosDasCasas(ctx: Contexto, ids: string[]): Promise<Map<string, string>> {
  const unicos = [...new Set(ids)].filter((id) => /^[A-Za-z0-9_-]{1,64}$/.test(id));
  const mapa = new Map<string, string>();
  if (unicos.length === 0) return mapa;
  const db = adminDb();
  const unidades = db.collection("condominiums").doc(ctx.condominioId).collection("units");
  const docs = await db.getAll(...unicos.map((id) => unidades.doc(id)));
  for (const d of docs) {
    if (d.exists) mapa.set(d.id, texto(d.get("rotulo"), d.id));
  }
  return mapa;
}

/** Fila do síndico: pendentes (mais antigos primeiro), publicados e histórico recente. */
export async function filaModeracao(ctx: Contexto, agora = new Date()): Promise<FilaModeracao> {
  garantirPermissao(ctx, "classificados.moderar");
  const col = base(ctx);
  const [pend, aprov, decididos] = await Promise.all([
    col.where("status", "==", "pendente").limit(LIMITE_LEITURA).get(),
    col.where("status", "==", "aprovado").limit(LIMITE_LEITURA).get(),
    col.where("status", "in", ["rejeitado", "removido", "expirado"]).limit(LIMITE_LEITURA).get(),
  ]);
  const todos = [...pend.docs, ...aprov.docs, ...decididos.docs].map((d) => paraClassificado(d.id, d.data(), ctx.condominioId));
  const casas = await rotulosDasCasas(ctx, todos.map((a) => a.unitId ?? "").filter(Boolean));

  const paraTela = (a: Bruto): AnuncioModeracao => ({
    id: a.id,
    titulo: a.titulo,
    texto: a.texto,
    categoria: a.categoria,
    preco: a.preco,
    contatoWhatsapp: a.contatoWhatsapp,
    autorPrimeiroNome: a.autorPrimeiroNome,
    unidadeRotulo: (a.unitId && casas.get(a.unitId)) || "Casa não informada",
    situacao: situacaoEfetiva(a.status, a.expiraEm, agora),
    motivo: a.motivo,
    criadoEm: a.criadoEm,
    decididoEm: a.decididoEm,
    expiraEm: a.expiraEm,
    fotos: fotosDe(a),
  });
  const lista = todos.map(paraTela);

  return {
    pendentes: lista
      .filter((a) => a.situacao === "pendente")
      .sort((a, b) => maisNovoPrimeiro(b.criadoEm, a.criadoEm)),
    publicados: lista
      .filter((a) => a.situacao === "aprovado")
      .sort((a, b) => maisNovoPrimeiro(a.decididoEm, b.decididoEm)),
    historico: lista
      .filter((a) => a.situacao === "rejeitado" || a.situacao === "removido" || a.situacao === "expirado")
      .sort((a, b) => maisNovoPrimeiro(a.decididoEm ?? a.expiraEm, b.decididoEm ?? b.expiraEm))
      .slice(0, TAMANHO_HISTORICO),
  };
}

/** Números para o painel do síndico. */
export async function numerosClassificados(ctx: Contexto, agora = new Date()): Promise<{ pendentes: number; publicados: number }> {
  garantirPermissao(ctx, "classificados.moderar");
  const col = base(ctx);
  const [pend, aprov] = await Promise.all([
    col.where("status", "==", "pendente").count().get(),
    // Pelo prazo (como em anunciosPublicados): os vencidos não ocupam o limite de leitura.
    col.where("expiraEm", ">", Timestamp.fromDate(agora)).select("status", "expiraEm").limit(LIMITE_LEITURA).get(),
  ]);
  const publicados = aprov.docs.filter((d) => d.get("status") === "aprovado" && estaVisivel("aprovado", data(d.get("expiraEm")), agora)).length;
  return { pendentes: pend.data().count, publicados };
}
