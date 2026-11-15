import "server-only";
import { Timestamp, type DocumentData } from "firebase-admin/firestore";
import { adminDb } from "../firebase-admin";
import { garantirPermissao, type Contexto } from "../contexto";
import { lancamentosDoMes, mesesComSaldo, totaisPorCategoria } from "./financeiro";
import {
  agregarPortaria,
  agregarReservas,
  agregarSolicitacoes,
  limitesDoAno,
  montarFinanceiro,
  somarCategorias,
  type AssuntoRelatorio,
  type EncomendaParaRelatorio,
  type RelatorioFinanceiro,
  type RelatorioPortaria,
  type RelatorioReservas,
  type RelatorioSolicitacoes,
  type SolicitacaoParaRelatorio,
} from "@/lib/relatorios";

/**
 * Leituras dos relatórios do síndico (permissão "relatorios.ver").
 *
 * Cuidados:
 * - Só o ano pedido é lido (filtro por data no próprio banco) e com um teto de documentos.
 * - `.select(...)` baixa SÓ os campos usados nas contas: nomes, casas e textos nem saem do banco.
 * - Todas as consultas usam um único campo com intervalo (mes, data, dataRecebimento,
 *   criadoEm, resolvidoEm): o Firestore já tem esses índices, não precisa criar outro.
 */

const base = (ctx: Contexto) => adminDb().collection("condominiums").doc(ctx.condominioId);

/** Teto de documentos lidos por consulta (protege a conta do Firebase). */
const TETO = { reservas: 10_000, entradas: 40_000, encomendas: 20_000, solicitacoes: 10_000 };

const texto = (v: unknown) => (typeof v === "string" ? v : "");
const instante = (v: unknown): Date | null =>
  v instanceof Date ? v : v && typeof (v as Timestamp).toDate === "function" ? (v as Timestamp).toDate() : null;

/** Resultado com aviso quando o teto foi atingido (aí os números podem estar incompletos). */
export type ComAviso<T> = { dados: T; incompleto: boolean };

// ---------- Financeiro ----------

/**
 * Doze meses do ano + totais por categoria.
 * Usa as funções do financeiro (que conferem "financeiro.ver" ou "financeiro.ver_publicado").
 * Devolve null se o perfil tem relatórios mas não pode ver o financeiro.
 */
export async function relatorioFinanceiro(ctx: Contexto, ano: number): Promise<RelatorioFinanceiro | null> {
  garantirPermissao(ctx, "relatorios.ver");
  if (!ctx.permissoes.has("financeiro.ver") && !ctx.permissoes.has("financeiro.ver_publicado")) return null;

  const todos = await mesesComSaldo(ctx);
  const doAno = todos.filter((m) => m.mes.startsWith(`${ano}-`));
  // Lançamentos só dos meses que têm movimento (no máximo 12 leituras).
  const comMovimento = doAno.filter((m) => m.quantidade > 0 || m.receitasCentavos !== 0 || m.despesasCentavos !== 0);
  const porMes = await Promise.all(comMovimento.map((m) => lancamentosDoMes(ctx, m.mes)));
  const categorias = somarCategorias(porMes.map((l) => totaisPorCategoria(l)));
  return montarFinanceiro(ano, doAno, categorias);
}

// ---------- Reservas ----------

export async function relatorioReservas(ctx: Contexto, ano: number): Promise<ComAviso<RelatorioReservas>> {
  garantirPermissao(ctx, "relatorios.ver");
  const lim = limitesDoAno(ano, ctx.fuso);
  const snap = await base(ctx)
    .collection("reservations")
    .where("mes", ">=", lim.mesInicio)
    .where("mes", "<=", lim.mesFim)
    .select("areaNome", "mes", "status", "cancelamentoTardio")
    .limit(TETO.reservas)
    .get();
  const lista = snap.docs.map((d) => {
    const x: DocumentData = d.data();
    return { areaNome: texto(x.areaNome), mes: texto(x.mes), status: texto(x.status), cancelamentoTardio: x.cancelamentoTardio === true };
  });
  return { dados: agregarReservas(ano, lista), incompleto: snap.size >= TETO.reservas };
}

// ---------- Portaria ----------

export async function relatorioPortaria(ctx: Contexto, ano: number): Promise<ComAviso<RelatorioPortaria>> {
  garantirPermissao(ctx, "relatorios.ver");
  const lim = limitesDoAno(ano, ctx.fuso);
  const c = base(ctx);
  const [eventos, pacotes] = await Promise.all([
    // Entradas e saídas do ano; só "tipo" e "data" (o nome do visitante NÃO é lido).
    c.collection("accessEvents")
      .where("data", ">=", lim.dataInicio)
      .where("data", "<=", lim.dataFim)
      .select("tipo", "data")
      .limit(TETO.entradas)
      .get(),
    c.collection("packages")
      .where("dataRecebimento", ">=", lim.dataInicio)
      .where("dataRecebimento", "<=", lim.dataFim)
      .select("status", "dataRecebimento", "recebidoEm", "entregueEm")
      .limit(TETO.encomendas)
      .get(),
  ]);
  const datasEntradas = eventos.docs.filter((d) => d.get("tipo") !== "saida").map((d) => texto(d.get("data")));
  const encomendas: EncomendaParaRelatorio[] = pacotes.docs.map((d) => ({
    dataRecebimento: texto(d.get("dataRecebimento")),
    status: texto(d.get("status")),
    recebidoEm: instante(d.get("recebidoEm")),
    entregueEm: instante(d.get("entregueEm")),
  }));
  return {
    dados: agregarPortaria(ano, datasEntradas, encomendas),
    incompleto: eventos.size >= TETO.entradas || pacotes.size >= TETO.encomendas,
  };
}

// ---------- Solicitações ----------

export async function relatorioSolicitacoes(ctx: Contexto, ano: number): Promise<ComAviso<RelatorioSolicitacoes>> {
  garantirPermissao(ctx, "relatorios.ver");
  const lim = limitesDoAno(ano, ctx.fuso);
  const col = base(ctx).collection("tickets");
  const inicio = Timestamp.fromDate(lim.instanteInicio);
  const fim = Timestamp.fromDate(lim.instanteFim);
  const campos = ["categoria", "status", "criadoEm", "resolvidoEm"] as const;
  // Duas leituras: as abertas no ano e as resolvidas no ano (algumas foram abertas no ano anterior).
  const [abertas, resolvidas] = await Promise.all([
    col.where("criadoEm", ">=", inicio).where("criadoEm", "<", fim).select(...campos).limit(TETO.solicitacoes).get(),
    col.where("resolvidoEm", ">=", inicio).where("resolvidoEm", "<", fim).select(...campos).limit(TETO.solicitacoes).get(),
  ]);
  const porId = new Map<string, SolicitacaoParaRelatorio>();
  for (const d of [...abertas.docs, ...resolvidas.docs]) {
    porId.set(d.id, {
      categoria: texto(d.get("categoria")),
      status: texto(d.get("status")),
      criadoEm: instante(d.get("criadoEm")),
      resolvidoEm: instante(d.get("resolvidoEm")),
    });
  }
  return {
    dados: agregarSolicitacoes(ano, [...porId.values()], ctx.fuso),
    incompleto: abertas.size >= TETO.solicitacoes || resolvidas.size >= TETO.solicitacoes,
  };
}

// ---------- Para o CSV ----------

export type RelatorioQualquer =
  | { assunto: "financeiro"; dados: RelatorioFinanceiro | null }
  | { assunto: "reservas"; dados: RelatorioReservas }
  | { assunto: "portaria"; dados: RelatorioPortaria }
  | { assunto: "solicitacoes"; dados: RelatorioSolicitacoes };

/** Carrega o relatório de um assunto (usado pela rota do CSV). */
export async function carregarRelatorio(ctx: Contexto, assunto: AssuntoRelatorio, ano: number): Promise<RelatorioQualquer> {
  switch (assunto) {
    case "financeiro":
      return { assunto, dados: await relatorioFinanceiro(ctx, ano) };
    case "reservas":
      return { assunto, dados: (await relatorioReservas(ctx, ano)).dados };
    case "portaria":
      return { assunto, dados: (await relatorioPortaria(ctx, ano)).dados };
    case "solicitacoes":
      return { assunto, dados: (await relatorioSolicitacoes(ctx, ano)).dados };
  }
}
