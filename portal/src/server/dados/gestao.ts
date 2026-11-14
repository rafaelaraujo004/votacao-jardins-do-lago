/**
 * Consultas da área de gestão.
 *
 * Padrão para TODA função de dados do portal:
 * 1. recebe o Contexto (nunca um condominioId solto vindo de fora);
 * 2. confere a permissão com garantirPermissao;
 * 3. só lê dentro de condominiums/{ctx.condominioId}.
 */
import "server-only";
import type { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "../firebase-admin";
import { garantirPermissao, type Contexto } from "../contexto";
import { PAPEIS, type Papel } from "@/lib/permissoes";

export type ResumoCondominio = {
  unidades: number;
  pessoasPorPapel: Record<Papel, number>;
  suspensos: number;
};

export async function resumoDoCondominio(ctx: Contexto): Promise<ResumoCondominio> {
  garantirPermissao(ctx, "area.gestao");
  const base = adminDb().collection("condominiums").doc(ctx.condominioId);
  const membros = base.collection("members");

  const [unidades, suspensos, ...porPapel] = await Promise.all([
    base.collection("units").count().get(),
    membros.where("status", "!=", "ativo").count().get(),
    ...PAPEIS.map((p) => membros.where("status", "==", "ativo").where("papel", "==", p).count().get()),
  ]);

  const pessoasPorPapel = Object.fromEntries(
    PAPEIS.map((p, i) => [p, porPapel[i].data().count]),
  ) as Record<Papel, number>;

  return { unidades: unidades.data().count, pessoasPorPapel, suspensos: suspensos.data().count };
}

export type LinhaAuditoria = {
  id: string;
  acao: string;
  nome: string | null;
  papel: string | null;
  alvo: string | null;
  quando: Date | null;
};

export async function ultimosRegistrosDeAuditoria(ctx: Contexto, limite = 50): Promise<LinhaAuditoria[]> {
  garantirPermissao(ctx, "auditoria.ver");
  const consulta = await adminDb()
    .collection("condominiums")
    .doc(ctx.condominioId)
    .collection("auditLogs")
    .orderBy("criadoEm", "desc")
    .limit(Math.min(Math.max(limite, 1), 200))
    .get();

  return consulta.docs.map((d) => ({
    id: d.id,
    acao: String(d.get("acao") ?? ""),
    nome: d.get("nome") ?? null,
    papel: d.get("papel") ?? null,
    alvo: d.get("alvo") ?? null,
    quando: (d.get("criadoEm") as Timestamp | undefined)?.toDate() ?? null,
  }));
}
