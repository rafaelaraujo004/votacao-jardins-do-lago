/**
 * LEITURAS DA ÁREA DO MORADOR (sempre com login).
 *
 * O condomínio vem SEMPRE da sessão (ctx.condominioId), nunca da URL.
 * Mesmo logado, um morador não deve ver dados de OUTRAS casas. Por isso cada
 * função devolve uma LISTA FECHADA de campos, montada à mão (nunca o
 * documento inteiro do banco).
 *
 * LGPD: nada que identifique outras casas ou pessoas sai daqui (nome de
 * morador, número da casa de quem reservou, quem lançou, quem pagou).
 */
import "server-only";
import type { DocumentData } from "firebase-admin/firestore";
import { adminDb } from "../firebase-admin";
import { garantirPermissao, type Contexto } from "../contexto";
import type { Lancamento } from "./financeiro";
import { ordenarAreas, paraArea, paraReserva, type Reserva } from "./reservas";
import { calcularSaldos, lerQuadroCasas, REGEX_MES, type FormaPagamento, type MesComSaldo, type MesResumo, type TipoLancamento } from "@/lib/financeiro";
import { dataCurta, dataISO, type EventoAgenda } from "@/lib/agenda";
import { descreverFaixa, ocupaHorario, REGEX_MES_RESERVA, type ConfigArea, type StatusReserva } from "@/lib/reservas";

const base = (ctx: Pick<Contexto, "condominioId">) => adminDb().collection("condominiums").doc(ctx.condominioId);

// ---------- Prestação de contas (só meses PUBLICADOS) ----------

/** Meses publicados, com o saldo calculado (o saldo só soma meses publicados). */
export async function mesesPublicados(ctx: Contexto): Promise<MesComSaldo[]> {
  garantirPermissao(ctx, "financeiro.ver_publicado");
  const [snap, condominio] = await Promise.all([
    base(ctx).collection("monthlySummaries").where("publicado", "==", true).get(),
    base(ctx).get(),
  ]);
  const meses: MesResumo[] = snap.docs.map((d) => ({
    mes: d.id,
    receitasCentavos: Number(d.get("receitasCentavos") ?? 0),
    despesasCentavos: Number(d.get("despesasCentavos") ?? 0),
    publicado: true,
    quantidade: Number(d.get("quantidade") ?? 0),
    // Só totais (nenhuma casa identificada), como no relatório em papel.
    casas: lerQuadroCasas(d.get("casas")),
  }));
  const financeiro = condominio.get("financeiro") as { saldoInicialCentavos?: unknown } | undefined;
  const saldoInicial = Number(financeiro?.saldoInicialCentavos ?? 0);
  return calcularSaldos(meses, Number.isFinite(saldoInicial) ? saldoInicial : 0);
}

/**
 * Converte um lançamento do banco no formato que o morador vê.
 * Campos mostrados: descrição, categoria, data, valor, forma (e se é estorno).
 * NUNCA: quem lançou (criadoPor/criadoPorNome), uid, casa (unitId) ou pessoa.
 * Observação: a DESCRIÇÃO é escrita pelo síndico. É responsabilidade dele não
 * pôr nomes de moradores nem número de casa ali (está no docs/SEGURANCA-LGPD.md).
 */
export function paraLancamentoDoMorador(id: string, d: DocumentData | undefined): Lancamento {
  return {
    id,
    tipo: (d?.tipo === "receita" ? "receita" : "despesa") as TipoLancamento,
    categoriaId: typeof d?.categoriaId === "string" ? d.categoriaId : "",
    categoriaNome: typeof d?.categoriaNome === "string" ? d.categoriaNome : "",
    valorCentavos: Number.isFinite(Number(d?.valorCentavos)) ? Number(d?.valorCentavos) : 0,
    data: typeof d?.data === "string" ? d.data : "",
    forma: (typeof d?.forma === "string" ? d.forma : "outro") as FormaPagamento,
    descricao: typeof d?.descricao === "string" ? d.descricao : "",
    publicado: true,
    // Ids de outros lançamentos (só servem para mostrar "Estorno"/"Estornado").
    estornaId: typeof d?.estornaId === "string" ? d.estornaId : null,
    estornadoPor: typeof d?.estornadoPor === "string" ? d.estornadoPor : null,
    criadoPorNome: "", // o morador nunca vê quem lançou
    criadoEm: null,
  };
}

/** Lançamentos de um mês PUBLICADO (lista vazia se o mês não estiver publicado). */
export async function lancamentosPublicados(ctx: Contexto, mes: string): Promise<Lancamento[]> {
  garantirPermissao(ctx, "financeiro.ver_publicado");
  if (!REGEX_MES.test(mes)) return [];
  const resumo = await base(ctx).collection("monthlySummaries").doc(mes).get();
  if (!resumo.exists || resumo.get("publicado") !== true) return [];
  const snap = await base(ctx)
    .collection("financialEntries")
    .where("mes", "==", mes)
    .where("publicado", "==", true)
    .get();
  // Ordem: mais recentes primeiro; no mesmo dia, pelo momento do lançamento.
  return snap.docs
    .map((d) => ({ l: paraLancamentoDoMorador(d.id, d.data()), t: d.get("criadoEm")?.toMillis?.() ?? 0 }))
    .sort((a, b) => b.l.data.localeCompare(a.l.data) || b.t - a.t)
    .map((x) => x.l);
}

// ---------- Áreas de lazer e agenda (sem as casas dos outros) ----------

/** Áreas de lazer e equipamentos ativos (configuração da área não tem dado pessoal). */
export async function areasAtivas(ctx: Contexto): Promise<ConfigArea[]> {
  garantirPermissao(ctx, "area.morador");
  const snap = await base(ctx).collection("amenities").get();
  return snap.docs
    .map((d) => paraArea(d.id, d.data(), ctx.condominioId))
    .filter((a) => a.ativa)
    .sort(ordenarAreas); // áreas primeiro, depois equipamentos
}

/** O que o morador vê de um horário ocupado: SEM a casa de quem reservou. */
export type OcupacaoSemCasa = {
  data: string;
  faixaId: string;
  inicio: string;
  fim: string;
  status: Extract<StatusReserva, "pendente" | "confirmada" | "bloqueada">;
  /** true só quando a reserva é da casa de quem está vendo. */
  minha: boolean;
};

/** Converte uma reserva em ocupação sem casa (null se ela não ocupa o horário). */
export function paraOcupacaoSemCasa(r: Reserva, unitIdDaCasa: string | null = null): OcupacaoSemCasa | null {
  if (!ocupaHorario(r.status)) return null;
  return {
    data: r.data,
    faixaId: r.faixaId,
    inicio: r.inicio,
    fim: r.fim,
    status: r.status as OcupacaoSemCasa["status"],
    minha: !!unitIdDaCasa && r.unitId === unitIdDaCasa,
  };
}

/** Horários ocupados de uma área num mês ("AAAA-MM"), marcando os da casa de quem está logado. */
export async function ocupacaoSemCasaDaArea(ctx: Contexto, areaId: string, mes: string): Promise<OcupacaoSemCasa[]> {
  garantirPermissao(ctx, "area.morador");
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(areaId) || !REGEX_MES_RESERVA.test(mes)) return [];
  const snap = await base(ctx).collection("reservations").where("amenityId", "==", areaId).where("mes", "==", mes).get();
  return snap.docs
    .map((d) => paraOcupacaoSemCasa(paraReserva(d.id, d.data()), ctx.unitId))
    .filter((o): o is OcupacaoSemCasa => o !== null);
}

/**
 * Converte uma reserva em evento da agenda do morador.
 * Mostra só a ÁREA e o horário ("Salão de festas reservado"): nunca a casa.
 * Pedidos ainda pendentes não aparecem (podem ser recusados).
 */
export function eventoSemCasaDaReserva(r: Reserva): EventoAgenda | null {
  if (r.status !== "confirmada" && r.status !== "bloqueada") return null;
  const horario = descreverFaixa({ rotulo: r.faixaRotulo, inicio: r.inicio, fim: r.fim });
  return {
    id: `reserva-${r.id}`,
    data: r.data,
    tipo: r.status === "bloqueada" ? "manutencao" : "salao",
    titulo: r.status === "bloqueada" ? `${r.areaNome}: fechado` : `${r.areaNome} reservado`,
    detalhe: `${dataCurta(r.data)} · ${horario}`,
    exemplo: false,
  };
}

/** Reservas confirmadas e horários fechados de um mês (mes de 1 a 12), sem casas. */
export async function reservasSemCasaDoMes(ctx: Contexto, ano: number, mes: number): Promise<EventoAgenda[]> {
  garantirPermissao(ctx, "area.morador");
  const chaveMes = dataISO(ano, mes, 1).slice(0, 7);
  const snap = await base(ctx).collection("reservations").where("mes", "==", chaveMes).get();
  return snap.docs
    .map((d) => eventoSemCasaDaReserva(paraReserva(d.id, d.data())))
    .filter((e): e is EventoAgenda => e !== null)
    .sort((a, b) => a.data.localeCompare(b.data) || a.detalhe.localeCompare(b.detalhe));
}
