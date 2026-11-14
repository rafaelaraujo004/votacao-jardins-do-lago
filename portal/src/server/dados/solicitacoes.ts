import "server-only";
import { Timestamp, type Firestore } from "firebase-admin/firestore";
import { adminDb } from "../firebase-admin";
import { garantirPermissao, type Contexto } from "../contexto";
import { hojeISO } from "@/lib/formato";
import {
  estaAtiva,
  linhaDoTempoDoMorador,
  ordenarAtualizacoes,
  ordenarSolicitacoes,
  paraAtualizacao,
  paraSolicitacao,
  type AtualizacaoSolicitacao,
  type Solicitacao,
} from "@/lib/solicitacoes";
import type { FiltrosSolicitacoes } from "@/lib/validacao-solicitacoes";

/**
 * Dados das SOLICITAÇÕES (leitura). As gravações ficam em ../acoes/solicitacoes.ts.
 *
 * Privacidade:
 * - o morador só recebe as solicitações da PRÓPRIA casa (ctx.unitId) e,
 *   na linha do tempo, só o que é público (notas internas ficam de fora);
 * - a administração ("solicitacoes.gerenciar") vê todas, com a casa.
 */

const base = (ctx: Pick<Contexto, "condominioId">, db: Firestore = adminDb()) =>
  db.collection("condominiums").doc(ctx.condominioId);

const ID_VALIDO = /^[A-Za-z0-9_-]{1,64}$/;

/** Quantas solicitações, no máximo, uma lista traz de uma vez. */
const LIMITE_LISTA = 300;

// ---------- Morador ----------

/** Solicitações da casa de quem está logado (mais novas primeiro). */
export async function solicitacoesDaMinhaCasa(ctx: Contexto): Promise<Solicitacao[]> {
  garantirPermissao(ctx, "solicitacoes.abrir");
  if (!ctx.unitId) return [];
  const snap = await base(ctx).collection("tickets").where("unitId", "==", ctx.unitId).limit(LIMITE_LISTA).get();
  return ordenarSolicitacoes(snap.docs.map((d) => paraSolicitacao(d.id, d.data())));
}

/**
 * Uma solicitação da casa de quem está logado, com a linha do tempo PÚBLICA.
 * Se for de outra casa, responde como se não existisse.
 */
export async function solicitacaoDaMinhaCasa(
  ctx: Contexto,
  id: string,
): Promise<{ solicitacao: Solicitacao; linhaDoTempo: AtualizacaoSolicitacao[] } | null> {
  garantirPermissao(ctx, "solicitacoes.abrir");
  if (!ctx.unitId || !ID_VALIDO.test(id)) return null;
  const ref = base(ctx).collection("tickets").doc(id);
  const doc = await ref.get();
  if (!doc.exists || doc.get("unitId") !== ctx.unitId) return null;
  // Só as públicas saem do banco (e o filtro de novo abaixo, por garantia).
  const atualizacoes = await ref.collection("updates").where("publico", "==", true).get();
  return {
    solicitacao: paraSolicitacao(doc.id, doc.data()),
    linhaDoTempo: linhaDoTempoDoMorador(ordenarAtualizacoes(atualizacoes.docs.map((d) => paraAtualizacao(d.id, d.data())))),
  };
}

/** Resumo para o Início do morador. Quem não pode abrir solicitações recebe null (o Início continua abrindo). */
export async function resumoSolicitacoesDaCasa(
  ctx: Contexto,
): Promise<{ ativas: number; recentes: Solicitacao[] } | null> {
  if (ctx.precisaTrocarSenha || !ctx.permissoes.has("solicitacoes.abrir") || !ctx.unitId) return null;
  const todas = await solicitacoesDaMinhaCasa(ctx);
  const ativas = todas.filter((s) => estaAtiva(s.status));
  return { ativas: ativas.length, recentes: (ativas.length ? ativas : todas).slice(0, 3) };
}

// ---------- Administração ----------

/** Lista da administração com filtros (situação e assunto). */
export async function listarSolicitacoes(ctx: Contexto, filtros: FiltrosSolicitacoes): Promise<Solicitacao[]> {
  garantirPermissao(ctx, "solicitacoes.gerenciar");
  const col = base(ctx).collection("tickets");
  let consulta;
  if (filtros.status === "todas") {
    // Sem filtro de situação: as mais recentes (índice simples de criadoEm).
    consulta = col.orderBy("criadoEm", "desc").limit(LIMITE_LISTA);
  } else if (filtros.status === "ativas") {
    consulta = col.where("status", "in", ["aberta", "em_andamento"]).limit(LIMITE_LISTA);
  } else {
    consulta = col.where("status", "==", filtros.status).limit(LIMITE_LISTA);
  }
  const snap = await consulta.get();
  const lista = snap.docs
    .map((d) => paraSolicitacao(d.id, d.data()))
    // O assunto é filtrado aqui (evita índices compostos no banco).
    .filter((s) => filtros.categoria === "todas" || s.categoria === filtros.categoria);
  return ordenarSolicitacoes(lista);
}

/** Números do topo: abertas, em andamento e resolvidas no mês atual (fuso do condomínio). */
export async function numerosDasSolicitacoes(ctx: Contexto, agora = new Date()) {
  garantirPermissao(ctx, "solicitacoes.gerenciar");
  const col = base(ctx).collection("tickets");
  const mes = hojeISO(agora, ctx.fuso).slice(0, 7);
  // Busca as resolvidas dos últimos 32 dias e confere o mês no fuso do condomínio.
  const desde = Timestamp.fromMillis(agora.getTime() - 32 * 86_400_000);
  const [abertas, andamento, recentes] = await Promise.all([
    col.where("status", "==", "aberta").count().get(),
    col.where("status", "==", "em_andamento").count().get(),
    col.where("resolvidoEm", ">=", desde).get(),
  ]);
  const resolvidasNoMes = recentes.docs
    .map((d) => paraSolicitacao(d.id, d.data()))
    .filter((s) => s.status === "resolvida" && s.resolvidoEm && hojeISO(s.resolvidoEm, ctx.fuso).slice(0, 7) === mes).length;
  return { abertas: abertas.data().count, emAndamento: andamento.data().count, resolvidasNoMes };
}

/** Uma solicitação com a linha do tempo COMPLETA (inclui notas internas). */
export async function solicitacaoParaGestao(
  ctx: Contexto,
  id: string,
): Promise<{ solicitacao: Solicitacao; linhaDoTempo: AtualizacaoSolicitacao[] } | null> {
  garantirPermissao(ctx, "solicitacoes.gerenciar");
  if (!ID_VALIDO.test(id)) return null;
  const ref = base(ctx).collection("tickets").doc(id);
  const [doc, atualizacoes] = await Promise.all([ref.get(), ref.collection("updates").get()]);
  if (!doc.exists) return null;
  return {
    solicitacao: paraSolicitacao(doc.id, doc.data()),
    linhaDoTempo: ordenarAtualizacoes(atualizacoes.docs.map((d) => paraAtualizacao(d.id, d.data()))),
  };
}
