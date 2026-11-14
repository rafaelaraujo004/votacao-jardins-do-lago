import "server-only";
import { FieldValue, Timestamp, type DocumentData, type Firestore } from "firebase-admin/firestore";
import { adminDb } from "../firebase-admin";
import { garantirPermissao, type Contexto } from "../contexto";
import { registrarAuditoria, type AcaoAuditada } from "../auditoria";
import { ErroDeNegocio } from "../acoes/resultado";
import {
  REGRAS_RESULTADO,
  STATUS_ENQUETE,
  resultadoVisivelParaMorador,
  situacaoEnquete,
  type OpcaoEnquete,
  type RegraResultado,
  type SituacaoEnquete,
  type StatusEnquete,
} from "@/lib/enquetes";

/**
 * Dados das enquetes.
 *
 * Coleções (dentro de condominiums/{c}):
 * - polls/{id}: a enquete. NUNCA é apagada: muda de status (rascunho → aberta → encerrada).
 *   Guarda os TOTAIS por opção (totais.{opcaoId}) e o total de votos;
 * - polls/{id}/votes/{unitId}: o voto de cada CASA. O id é a própria casa, então
 *   não existe segundo voto (a transação usa "create", que falha se já existir).
 *
 * Privacidade: a tela do síndico usa só os totais. Nenhuma função aqui lista os
 * votos por casa. O morador lê só o voto da PRÓPRIA casa (ctx.unitId).
 */

const base = (ctx: Pick<Contexto, "condominioId">, db: Firestore = adminDb()) =>
  db.collection("condominiums").doc(ctx.condominioId);

/** Ações de auditoria das enquetes (todas estão em ACOES_AUDITADAS). */
export type AcaoEnquete = "enquete.criar" | "enquete.editar" | "enquete.publicar" | "enquete.encerrar" | "enquete.votar";
export function acaoEnquete(a: AcaoEnquete): AcaoAuditada {
  return a;
}

// ---------- Conversão dos documentos ----------

function texto(v: unknown, padrao = ""): string {
  return typeof v === "string" ? v : padrao;
}

function data(v: unknown): Date | null {
  return v instanceof Timestamp ? v.toDate() : null;
}

function paraOpcoes(v: unknown): OpcaoEnquete[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((o): o is { id: string; texto: string } => !!o && typeof o.id === "string" && typeof o.texto === "string")
    .map((o) => ({ id: o.id, texto: o.texto }));
}

function paraTotais(v: unknown): Record<string, number> {
  const r: Record<string, number> = {};
  if (v && typeof v === "object") {
    for (const [k, n] of Object.entries(v as Record<string, unknown>)) {
      if (typeof n === "number" && Number.isFinite(n) && n >= 0) r[k] = Math.floor(n);
    }
  }
  return r;
}

/** Documento completo (uso interno do servidor; as telas recebem listas fechadas abaixo). */
type EnqueteInterna = {
  id: string;
  pergunta: string;
  descricao: string;
  opcoes: OpcaoEnquete[];
  abreEm: Date;
  fechaEm: Date;
  status: StatusEnquete;
  resultado: RegraResultado;
  totais: Record<string, number>;
  totalVotos: number;
  criadoPorNome: string;
  criadoEm: Date | null;
  encerradaEm: Date | null;
};

export function paraEnquete(id: string, d: DocumentData | undefined): EnqueteInterna {
  const status = (STATUS_ENQUETE as readonly unknown[]).includes(d?.status) ? (d?.status as StatusEnquete) : "encerrada";
  const resultado = (REGRAS_RESULTADO as readonly unknown[]).includes(d?.resultado)
    ? (d?.resultado as RegraResultado)
    : "apos_encerrar";
  const abreEm = data(d?.abreEm) ?? new Date(0);
  return {
    id,
    pergunta: texto(d?.pergunta, "Enquete"),
    descricao: texto(d?.descricao),
    opcoes: paraOpcoes(d?.opcoes),
    abreEm,
    fechaEm: data(d?.fechaEm) ?? abreEm,
    status,
    resultado,
    totais: paraTotais(d?.totais),
    totalVotos: typeof d?.totalVotos === "number" && d.totalVotos >= 0 ? Math.floor(d.totalVotos) : 0,
    criadoPorNome: texto(d?.criadoPorNome),
    criadoEm: data(d?.criadoEm),
    encerradaEm: data(d?.encerradaEm),
  };
}

const maisRecentes = (a: { abreEm: Date; criadoEm: Date | null }, b: { abreEm: Date; criadoEm: Date | null }) =>
  b.abreEm.getTime() - a.abreEm.getTime() || (b.criadoEm?.getTime() ?? 0) - (a.criadoEm?.getTime() ?? 0);

// ---------- Síndico (enquetes.gerenciar) ----------

/** O que a tela do síndico recebe. Só totais: nunca qual casa votou em quê. */
export type EnqueteGestao = {
  id: string;
  pergunta: string;
  descricao: string;
  opcoes: OpcaoEnquete[];
  abreEm: Date;
  fechaEm: Date;
  status: StatusEnquete;
  situacao: SituacaoEnquete;
  resultado: RegraResultado;
  totais: Record<string, number>;
  totalVotos: number;
  criadoPorNome: string;
  encerradaEm: Date | null;
};

function paraGestao(e: EnqueteInterna, agora: Date): EnqueteGestao {
  return {
    id: e.id,
    pergunta: e.pergunta,
    descricao: e.descricao,
    opcoes: e.opcoes,
    abreEm: e.abreEm,
    fechaEm: e.fechaEm,
    status: e.status,
    situacao: situacaoEnquete(e, agora),
    resultado: e.resultado,
    totais: e.totais,
    totalVotos: e.totalVotos,
    criadoPorNome: e.criadoPorNome,
    encerradaEm: e.encerradaEm,
  };
}

/** Todas as enquetes (inclui rascunhos), as mais recentes primeiro. */
export async function listarEnquetesGestao(ctx: Contexto, agora = new Date()): Promise<EnqueteGestao[]> {
  garantirPermissao(ctx, "enquetes.gerenciar");
  const snap = await base(ctx).collection("polls").orderBy("criadoEm", "desc").limit(200).get();
  return snap.docs
    .map((d) => paraEnquete(d.id, d.data()))
    .sort(maisRecentes)
    .map((e) => paraGestao(e, agora));
}

export async function obterEnqueteGestao(ctx: Contexto, id: string, agora = new Date()): Promise<EnqueteGestao | null> {
  garantirPermissao(ctx, "enquetes.gerenciar");
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return null;
  const d = await base(ctx).collection("polls").doc(id).get();
  if (!d.exists) return null;
  return paraGestao(paraEnquete(d.id, d.data()), agora);
}

/** Quantas casas ATIVAS existem (para "X de Y casas votaram"). */
export async function contarCasasAtivas(ctx: Contexto): Promise<number> {
  garantirPermissao(ctx, "enquetes.gerenciar");
  const snap = await base(ctx).collection("units").select("status").get();
  return snap.docs.filter((d) => d.get("status") !== "inativa").length;
}

// ---------- Morador (enquetes.votar) ----------

/** Voto da PRÓPRIA casa (sem nome de quem votou: só se foi a própria pessoa). */
export type VotoDaCasa = { opcaoId: string; opcaoTexto: string; votadoEm: Date | null; porMim: boolean };

/** O que a tela do morador recebe. Os números só vêm quando a regra deixa ver. */
export type EnqueteMorador = {
  id: string;
  pergunta: string;
  descricao: string;
  opcoes: OpcaoEnquete[];
  abreEm: Date;
  fechaEm: Date;
  situacao: SituacaoEnquete;
  resultado: RegraResultado;
  /** null = o resultado ainda não pode ser visto (regra "após encerrar"). */
  totais: Record<string, number> | null;
  totalVotos: number | null;
  meuVoto: VotoDaCasa | null;
};

async function votoDaCasa(ctx: Contexto, e: EnqueteInterna): Promise<VotoDaCasa | null> {
  if (!ctx.unitId) return null;
  const v = await base(ctx).collection("polls").doc(e.id).collection("votes").doc(ctx.unitId).get();
  if (!v.exists) return null;
  const opcaoId = texto(v.get("opcaoId"));
  return {
    opcaoId,
    opcaoTexto: e.opcoes.find((o) => o.id === opcaoId)?.texto ?? "opção removida",
    votadoEm: data(v.get("votadoEm")),
    porMim: v.get("uid") === ctx.uid,
  };
}

function paraMorador(e: EnqueteInterna, meuVoto: VotoDaCasa | null, agora: Date): EnqueteMorador {
  const situacao = situacaoEnquete(e, agora);
  const visivel = resultadoVisivelParaMorador(e.resultado, situacao);
  return {
    id: e.id,
    pergunta: e.pergunta,
    descricao: e.descricao,
    opcoes: e.opcoes,
    abreEm: e.abreEm,
    fechaEm: e.fechaEm,
    situacao,
    resultado: e.resultado,
    totais: visivel ? e.totais : null,
    totalVotos: visivel ? e.totalVotos : null,
    meuVoto,
  };
}

/** Enquetes publicadas (abertas, agendadas e encerradas), com o voto da casa. */
export async function listarEnquetesMorador(ctx: Contexto, agora = new Date()): Promise<EnqueteMorador[]> {
  garantirPermissao(ctx, "enquetes.votar");
  // Sem ordenar no banco (evita índice composto); as listas são pequenas.
  const snap = await base(ctx).collection("polls").where("status", "in", ["aberta", "encerrada"]).get();
  const enquetes = snap.docs
    .map((d) => paraEnquete(d.id, d.data()))
    .sort(maisRecentes)
    .slice(0, 50);
  const votos = await Promise.all(enquetes.map((e) => votoDaCasa(ctx, e)));
  return enquetes.map((e, i) => paraMorador(e, votos[i], agora));
}

export async function obterEnqueteMorador(ctx: Contexto, id: string, agora = new Date()): Promise<EnqueteMorador | null> {
  garantirPermissao(ctx, "enquetes.votar");
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return null;
  const d = await base(ctx).collection("polls").doc(id).get();
  if (!d.exists) return null;
  const e = paraEnquete(d.id, d.data());
  if (e.status === "rascunho") return null; // rascunho é só do síndico
  return paraMorador(e, await votoDaCasa(ctx, e), agora);
}

/** Para o Início: a enquete ABERTA mais recente (ou null). */
export async function enqueteAbertaDoInicio(ctx: Contexto, agora = new Date()): Promise<EnqueteMorador | null> {
  garantirPermissao(ctx, "enquetes.votar");
  const snap = await base(ctx).collection("polls").where("status", "==", "aberta").get();
  const abertas = snap.docs
    .map((d) => paraEnquete(d.id, d.data()))
    .filter((e) => situacaoEnquete(e, agora) === "aberta")
    .sort(maisRecentes);
  const e = abertas[0];
  if (!e) return null;
  return paraMorador(e, await votoDaCasa(ctx, e), agora);
}

// ---------- Gravações (sempre em transação, com auditoria) ----------

export type NovaEnquete = {
  id: string | null;
  pergunta: string;
  descricao: string;
  opcoes: OpcaoEnquete[];
  abreEm: Date;
  fechaEm: Date;
  resultado: RegraResultado;
};

/** Cria um rascunho, ou altera um rascunho existente (depois de publicada, não muda mais). */
export async function gravarEnquete(db: Firestore, ctx: Contexto, v: NovaEnquete): Promise<string> {
  garantirPermissao(ctx, "enquetes.gerenciar");
  const col = base(ctx, db).collection("polls");
  const ref = v.id ? col.doc(v.id) : col.doc();
  const campos = {
    pergunta: v.pergunta,
    descricao: v.descricao,
    opcoes: v.opcoes,
    abreEm: Timestamp.fromDate(v.abreEm),
    fechaEm: Timestamp.fromDate(v.fechaEm),
    resultado: v.resultado,
    atualizadoEm: FieldValue.serverTimestamp(),
  };
  const zerados = Object.fromEntries(v.opcoes.map((o) => [o.id, 0]));
  await db.runTransaction(async (tx) => {
    const atual = await tx.get(ref);
    if (v.id) {
      if (!atual.exists) throw new ErroDeNegocio("Enquete não encontrada. Atualize a página.");
      if (atual.get("status") !== "rascunho") {
        throw new ErroDeNegocio("Esta enquete já foi publicada e não pode mais ser alterada.");
      }
      // Rascunho não tem votos: os totais recomeçam com as opções novas.
      tx.update(ref, { ...campos, totais: zerados, totalVotos: 0 });
    } else {
      tx.create(ref, {
        ...campos,
        status: "rascunho",
        totais: zerados,
        totalVotos: 0,
        criadoPor: ctx.uid,
        criadoPorNome: ctx.nome,
        criadoEm: FieldValue.serverTimestamp(),
      });
    }
    registrarAuditoria(db, tx, {
      condominioId: ctx.condominioId,
      uid: ctx.uid,
      nome: ctx.nome,
      papel: ctx.papel,
      acao: acaoEnquete(v.id ? "enquete.editar" : "enquete.criar"),
      alvo: `polls/${ref.id}`,
      detalhes: { opcoes: v.opcoes.length, resultado: v.resultado },
    });
  });
  return ref.id;
}

/** Publicar (rascunho → aberta) ou encerrar antes do prazo (aberta → encerrada). */
export async function mudarStatusEnquete(
  db: Firestore,
  ctx: Contexto,
  id: string,
  tipo: "publicar" | "encerrar",
  agora = new Date(),
): Promise<EnqueteGestao> {
  garantirPermissao(ctx, "enquetes.gerenciar");
  const ref = base(ctx, db).collection("polls").doc(id);
  return db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    if (!doc.exists) throw new ErroDeNegocio("Enquete não encontrada. Atualize a página.");
    const e = paraEnquete(doc.id, doc.data());
    if (tipo === "publicar") {
      if (e.status !== "rascunho") throw new ErroDeNegocio("Esta enquete já foi publicada. Atualize a página.");
      if (e.fechaEm.getTime() <= agora.getTime()) {
        throw new ErroDeNegocio("A data de encerramento já passou. Edite a enquete e escolha outra data.");
      }
      if (e.opcoes.length < 2) throw new ErroDeNegocio("A enquete precisa de pelo menos 2 opções.");
      tx.update(ref, { status: "aberta", publicadoEm: FieldValue.serverTimestamp(), atualizadoEm: FieldValue.serverTimestamp() });
    } else {
      if (e.status !== "aberta") throw new ErroDeNegocio("Esta enquete não está aberta. Atualize a página.");
      tx.update(ref, {
        status: "encerrada",
        encerradaEm: FieldValue.serverTimestamp(),
        encerradaPor: ctx.uid,
        atualizadoEm: FieldValue.serverTimestamp(),
      });
    }
    registrarAuditoria(db, tx, {
      condominioId: ctx.condominioId,
      uid: ctx.uid,
      nome: ctx.nome,
      papel: ctx.papel,
      acao: acaoEnquete(tipo === "publicar" ? "enquete.publicar" : "enquete.encerrar"),
      alvo: `polls/${e.id}`,
      detalhes: tipo === "encerrar" ? { totalVotos: e.totalVotos, antesDoPrazo: agora < e.fechaEm } : { opcoes: e.opcoes.length },
    });
    return paraGestao({ ...e, status: tipo === "publicar" ? "aberta" : "encerrada" }, agora);
  });
}

/**
 * Voto da CASA, numa transação:
 * - a enquete precisa estar aberta (status + datas);
 * - a casa precisa estar ativa;
 * - votes/{unitId} é CRIADO (se já existir, a casa já votou: não muda);
 * - os totais sobem 1 na mesma transação.
 * A auditoria registra QUE a casa votou, sem a opção escolhida.
 */
export async function registrarVoto(
  db: Firestore,
  ctx: Contexto,
  id: string,
  opcaoId: string,
  agora = new Date(),
): Promise<{ pergunta: string; opcaoTexto: string }> {
  garantirPermissao(ctx, "enquetes.votar");
  const unitId = ctx.unitId;
  if (!unitId) throw new ErroDeNegocio("Seu cadastro não está ligado a uma casa. Fale com a administração.");
  const c = base(ctx, db);
  const ref = c.collection("polls").doc(id);
  const votoRef = ref.collection("votes").doc(unitId);
  const casaRef = c.collection("units").doc(unitId);

  return db.runTransaction(async (tx) => {
    const [doc, voto, casa] = await Promise.all([tx.get(ref), tx.get(votoRef), tx.get(casaRef)]);
    if (!doc.exists) throw new ErroDeNegocio("Enquete não encontrada. Atualize a página.");
    const e = paraEnquete(doc.id, doc.data());
    const situacao = situacaoEnquete(e, agora);
    if (situacao === "rascunho") throw new ErroDeNegocio("Enquete não encontrada. Atualize a página.");
    if (situacao === "agendada") throw new ErroDeNegocio("Esta enquete ainda não abriu para votos.");
    if (situacao === "encerrada") throw new ErroDeNegocio("Esta enquete já foi encerrada. Não é mais possível votar.");
    if (voto.exists) throw new ErroDeNegocio("Sua casa já votou nesta enquete. O voto não pode ser mudado.");
    if (!casa.exists || casa.get("status") === "inativa") {
      throw new ErroDeNegocio("Sua casa não está ativa no cadastro. Fale com a administração.");
    }
    const opcao = e.opcoes.find((o) => o.id === opcaoId);
    if (!opcao) throw new ErroDeNegocio("Escolha uma das opções da enquete.");

    tx.create(votoRef, { opcaoId, uid: ctx.uid, votadoEm: FieldValue.serverTimestamp() });
    tx.update(ref, {
      [`totais.${opcaoId}`]: FieldValue.increment(1),
      totalVotos: FieldValue.increment(1),
    });
    registrarAuditoria(db, tx, {
      condominioId: ctx.condominioId,
      uid: ctx.uid,
      nome: ctx.nome,
      papel: ctx.papel,
      acao: acaoEnquete("enquete.votar"),
      alvo: `polls/${e.id}`,
      // De propósito SEM a opção escolhida.
      detalhes: { unidade: unitId },
    });
    return { pergunta: e.pergunta, opcaoTexto: opcao.texto };
  });
}
