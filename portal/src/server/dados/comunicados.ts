import "server-only";
import type { DocumentData, Firestore, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "../firebase-admin";
import { garantirPermissao, type Contexto } from "../contexto";
import type { AcaoAuditada } from "../auditoria";
import { idDocumento } from "@/lib/validacao";
import {
  destaquesDoInicio,
  ehPrioridade,
  ehStatusComunicado,
  ordenarParaMorador,
  type Prioridade,
  type StatusComunicado,
} from "@/lib/comunicados";
import { enderecosFotos, lerFotos } from "@/lib/fotos";

/**
 * Dados dos comunicados (condominiums/{c}/announcements/{id}).
 *
 * - O morador só recebe comunicados PUBLICADOS, com uma lista fechada de campos
 *   (sem quem escreveu nem datas internas).
 * - A gestão (comunicados.publicar) vê rascunhos e arquivados também.
 * - Nada é apagado: o comunicado é arquivado (sai do ar e fica no histórico).
 */

const colecao = (ctx: Pick<Contexto, "condominioId">, db: Firestore = adminDb()) =>
  db.collection("condominiums").doc(ctx.condominioId).collection("announcements");

/** O que o morador vê. */
export type ComunicadoMorador = {
  id: string;
  titulo: string;
  texto: string;
  prioridade: Prioridade;
  fixado: boolean;
  publicadoEm: Date | null;
  /** Endereços protegidos das fotos (/api/fotos/...), a primeira é a capa. */
  fotos: string[];
};

/** O que a gestão vê (inclui situação e quem escreveu). */
export type ComunicadoGestao = ComunicadoMorador & {
  status: StatusComunicado;
  criadoPorNome: string;
  criadoEm: Date | null;
  atualizadoEm: Date | null;
};

// Campos lidos do banco (o resto do documento nem sai do Firestore).
const CAMPOS_MORADOR = ["titulo", "texto", "prioridade", "fixado", "publicadoEm", "status", "fotos"] as const;

function texto(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function data(v: unknown): Date | null {
  return (v as Timestamp | undefined)?.toDate?.() ?? null;
}

/** `condominioId` só é preciso para as fotos (as ações que só mudam a situação não passam). */
export function paraComunicadoMorador(id: string, d: DocumentData | undefined, condominioId = ""): ComunicadoMorador {
  return {
    id,
    titulo: texto(d?.titulo) || "Comunicado",
    texto: texto(d?.texto),
    prioridade: ehPrioridade(d?.prioridade) ? d.prioridade : "normal",
    fixado: d?.fixado === true,
    publicadoEm: data(d?.publicadoEm),
    fotos: condominioId ? enderecosFotos("comunicados", id, lerFotos(d?.fotos, condominioId, "comunicados")) : [],
  };
}

export function paraComunicadoGestao(id: string, d: DocumentData | undefined, condominioId = ""): ComunicadoGestao {
  return {
    ...paraComunicadoMorador(id, d, condominioId),
    // Situação desconhecida no banco: trata como rascunho (não aparece para o morador).
    status: ehStatusComunicado(d?.status) ? d.status : "rascunho",
    criadoPorNome: texto(d?.criadoPorNome),
    criadoEm: data(d?.criadoEm),
    atualizadoEm: data(d?.atualizadoEm),
  };
}

/** Ações da auditoria dos comunicados (todas estão em ACOES_AUDITADAS). */
export function acaoComunicado(
  a: "comunicado.criar" | "comunicado.editar" | "comunicado.publicar" | "comunicado.arquivar",
): AcaoAuditada {
  return a;
}

// ---------- Morador (e qualquer perfil com comunicados.ver) ----------

/** Comunicados publicados, já na ordem do morador (fixados, urgentes, mais recentes). */
export async function listarPublicados(ctx: Contexto): Promise<ComunicadoMorador[]> {
  garantirPermissao(ctx, "comunicados.ver");
  const snap = await colecao(ctx)
    .where("status", "==", "publicado")
    .select(...CAMPOS_MORADOR)
    .get();
  return ordenarParaMorador(snap.docs.map((d) => paraComunicadoMorador(d.id, d.data(), ctx.condominioId)));
}

/** Um comunicado publicado. Rascunho, arquivado ou inexistente → null (a página mostra "não encontrado"). */
export async function obterPublicado(ctx: Contexto, id: string): Promise<ComunicadoMorador | null> {
  garantirPermissao(ctx, "comunicados.ver");
  if (!idDocumento.safeParse(id).success) return null;
  const d = await colecao(ctx).doc(id).get();
  if (!d.exists || d.get("status") !== "publicado") return null;
  return paraComunicadoMorador(d.id, d.data(), ctx.condominioId);
}

/** Os 3 comunicados do Início (fixados e urgentes primeiro). */
export async function destaquesParaInicio(ctx: Contexto, quantos = 3): Promise<ComunicadoMorador[]> {
  return destaquesDoInicio(await listarPublicados(ctx), quantos);
}

// ---------- Gestão ----------

/** Todos os comunicados (rascunhos, publicados e arquivados), mais recentes primeiro. */
export async function listarParaGestao(ctx: Contexto): Promise<ComunicadoGestao[]> {
  garantirPermissao(ctx, "comunicados.publicar");
  const snap = await colecao(ctx).get();
  const tempo = (c: ComunicadoGestao) => (c.atualizadoEm ?? c.criadoEm)?.getTime() ?? 0;
  return snap.docs.map((d) => paraComunicadoGestao(d.id, d.data(), ctx.condominioId)).sort((a, b) => tempo(b) - tempo(a));
}

export async function obterParaGestao(ctx: Contexto, id: string): Promise<ComunicadoGestao | null> {
  garantirPermissao(ctx, "comunicados.publicar");
  if (!idDocumento.safeParse(id).success) return null;
  const d = await colecao(ctx).doc(id).get();
  return d.exists ? paraComunicadoGestao(d.id, d.data(), ctx.condominioId) : null;
}

/** Contagem por situação (números do topo da tela da gestão). */
export function contarPorStatus(lista: readonly ComunicadoGestao[]): Record<StatusComunicado, number> {
  const total: Record<StatusComunicado, number> = { rascunho: 0, publicado: 0, arquivado: 0 };
  for (const c of lista) total[c.status]++;
  return total;
}
