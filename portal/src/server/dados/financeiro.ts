import "server-only";
import type { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "../firebase-admin";
import { ErroDeAcesso, type Contexto } from "../contexto";
import { calcularSaldos, type FormaPagamento, type MesComSaldo, type MesResumo, type TipoLancamento } from "@/lib/financeiro";

/**
 * Quem vê o quê:
 * - "financeiro.ver": tudo, inclusive meses ainda não publicados;
 * - "financeiro.ver_publicado": só meses publicados.
 */
export type Visao = "completa" | "publicada";

export function visaoFinanceira(ctx: Contexto): Visao {
  if (ctx.permissoes.has("financeiro.ver")) return "completa";
  if (ctx.permissoes.has("financeiro.ver_publicado")) return "publicada";
  throw new ErroDeAcesso("sem-permissao", "Seu perfil não pode ver o financeiro.");
}

const base = (ctx: Contexto) => adminDb().collection("condominiums").doc(ctx.condominioId);

export type Categoria = { id: string; nome: string; tipo: TipoLancamento; ativa: boolean; ordem: number };

export async function listarCategorias(ctx: Contexto): Promise<Categoria[]> {
  visaoFinanceira(ctx);
  const snap = await base(ctx).collection("financialCategories").get();
  return snap.docs
    .map((d) => ({
      id: d.id,
      nome: String(d.get("nome") ?? d.id),
      tipo: (d.get("tipo") === "receita" ? "receita" : "despesa") as TipoLancamento,
      ativa: d.get("ativa") !== false,
      ordem: Number(d.get("ordem") ?? 99),
    }))
    .sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, "pt-BR"));
}

export type ConfigFinanceira = { saldoInicialCentavos: number; mesInicial: string | null };

export async function configFinanceira(ctx: Contexto): Promise<ConfigFinanceira> {
  visaoFinanceira(ctx);
  const d = await base(ctx).get();
  const f = d.get("financeiro") as { saldoInicialCentavos?: number; mesInicial?: string } | undefined;
  return { saldoInicialCentavos: Number(f?.saldoInicialCentavos ?? 0), mesInicial: f?.mesInicial ?? null };
}

/** Resumo de todos os meses com saldo calculado (só os publicados, para quem tem visão publicada). */
export async function mesesComSaldo(ctx: Contexto): Promise<MesComSaldo[]> {
  const visao = visaoFinanceira(ctx);
  let consulta: FirebaseFirestore.Query = base(ctx).collection("monthlySummaries");
  if (visao === "publicada") consulta = consulta.where("publicado", "==", true);
  const [snap, config] = await Promise.all([consulta.get(), configFinanceira(ctx)]);
  const meses: MesResumo[] = snap.docs.map((d) => ({
    mes: d.id,
    receitasCentavos: Number(d.get("receitasCentavos") ?? 0),
    despesasCentavos: Number(d.get("despesasCentavos") ?? 0),
    publicado: d.get("publicado") === true,
    quantidade: Number(d.get("quantidade") ?? 0),
  }));
  return calcularSaldos(meses, config.saldoInicialCentavos);
}

export type Lancamento = {
  id: string;
  tipo: TipoLancamento;
  categoriaId: string;
  categoriaNome: string;
  valorCentavos: number;
  data: string;
  forma: FormaPagamento;
  descricao: string;
  publicado: boolean;
  estornaId: string | null;
  estornadoPor: string | null;
  criadoPorNome: string;
  criadoEm: Date | null;
};

export async function lancamentosDoMes(ctx: Contexto, mes: string): Promise<Lancamento[]> {
  const visao = visaoFinanceira(ctx);
  let consulta = base(ctx).collection("financialEntries").where("mes", "==", mes);
  if (visao === "publicada") consulta = consulta.where("publicado", "==", true);
  const snap = await consulta.get();
  return snap.docs
    .map((d) => ({
      id: d.id,
      tipo: (d.get("tipo") === "receita" ? "receita" : "despesa") as TipoLancamento,
      categoriaId: String(d.get("categoriaId") ?? ""),
      categoriaNome: String(d.get("categoriaNome") ?? ""),
      valorCentavos: Number(d.get("valorCentavos") ?? 0),
      data: String(d.get("data") ?? ""),
      forma: d.get("forma") as FormaPagamento,
      descricao: String(d.get("descricao") ?? ""),
      publicado: d.get("publicado") === true,
      estornaId: d.get("estornaId") ?? null,
      estornadoPor: d.get("estornadoPor") ?? null,
      // nome de quem lançou só aparece para a gestão
      criadoPorNome: visao === "completa" ? String(d.get("criadoPorNome") ?? "") : "",
      criadoEm: (d.get("criadoEm") as Timestamp | undefined)?.toDate() ?? null,
    }))
    .sort((a, b) => b.data.localeCompare(a.data) || (b.criadoEm?.getTime() ?? 0) - (a.criadoEm?.getTime() ?? 0));
}

/** Soma por categoria (para o relatório). */
export function totaisPorCategoria(lancamentos: Lancamento[]) {
  const mapa = new Map<string, { nome: string; tipo: TipoLancamento; totalCentavos: number }>();
  for (const l of lancamentos) {
    const atual = mapa.get(l.categoriaId) ?? { nome: l.categoriaNome, tipo: l.tipo, totalCentavos: 0 };
    atual.totalCentavos += l.valorCentavos;
    mapa.set(l.categoriaId, atual);
  }
  return [...mapa.values()].filter((c) => c.totalCentavos !== 0).sort((a, b) => b.totalCentavos - a.totalCentavos);
}
