/**
 * LEITURAS DA ÁREA PÚBLICA (sem login).
 *
 * Tudo aqui pode ser visto por qualquer pessoa que tenha o link do portal.
 * Por isso, cada função devolve uma LISTA FECHADA de campos, montada à mão:
 * nunca o documento inteiro do banco.
 *
 * LGPD: nada que identifique casas ou pessoas sai daqui (nome de morador,
 * número da casa de quem reservou, quem lançou, quem pagou).
 */
import "server-only";
import type { DocumentData } from "firebase-admin/firestore";
import { adminDb } from "../firebase-admin";
import type { CondominioPublico } from "../publico";
import type { Lancamento } from "./financeiro";
import { paraArea, paraReserva, type Reserva } from "./reservas";
import { calcularSaldos, REGEX_MES, type FormaPagamento, type MesComSaldo, type MesResumo, type TipoLancamento } from "@/lib/financeiro";
import { dataCurta, dataISO, type EventoAgenda } from "@/lib/agenda";
import { descreverFaixa, ocupaHorario, REGEX_MES_RESERVA, type ConfigArea, type StatusReserva } from "@/lib/reservas";

const base = (cp: Pick<CondominioPublico, "id">) => adminDb().collection("condominiums").doc(cp.id);

// ---------- Prestação de contas (só meses PUBLICADOS) ----------

/** Meses publicados, com o saldo calculado (o saldo só soma meses publicados). */
export async function mesesPublicados(cp: CondominioPublico): Promise<MesComSaldo[]> {
  const [snap, condominio] = await Promise.all([
    base(cp).collection("monthlySummaries").where("publicado", "==", true).get(),
    base(cp).get(),
  ]);
  const meses: MesResumo[] = snap.docs.map((d) => ({
    mes: d.id,
    receitasCentavos: Number(d.get("receitasCentavos") ?? 0),
    despesasCentavos: Number(d.get("despesasCentavos") ?? 0),
    publicado: true,
    quantidade: Number(d.get("quantidade") ?? 0),
  }));
  const financeiro = condominio.get("financeiro") as { saldoInicialCentavos?: unknown } | undefined;
  const saldoInicial = Number(financeiro?.saldoInicialCentavos ?? 0);
  return calcularSaldos(meses, Number.isFinite(saldoInicial) ? saldoInicial : 0);
}

/**
 * Converte um lançamento do banco no formato público.
 * Campos mostrados: descrição, categoria, data, valor, forma (e se é estorno).
 * NUNCA: quem lançou (criadoPor/criadoPorNome), uid, casa (unitId) ou pessoa.
 * Observação: a DESCRIÇÃO é escrita pelo síndico. É responsabilidade dele não
 * pôr nomes de moradores nem número de casa ali (está no docs/SEGURANCA-LGPD.md).
 */
export function paraLancamentoPublico(id: string, d: DocumentData | undefined): Lancamento {
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
    criadoPorNome: "", // nunca mostramos quem lançou na área pública
    criadoEm: null,
  };
}

/** Lançamentos de um mês PUBLICADO (lista vazia se o mês não estiver publicado). */
export async function lancamentosPublicados(cp: CondominioPublico, mes: string): Promise<Lancamento[]> {
  if (!REGEX_MES.test(mes)) return [];
  const resumo = await base(cp).collection("monthlySummaries").doc(mes).get();
  if (!resumo.exists || resumo.get("publicado") !== true) return [];
  const snap = await base(cp)
    .collection("financialEntries")
    .where("mes", "==", mes)
    .where("publicado", "==", true)
    .get();
  // Ordem: mais recentes primeiro; no mesmo dia, pelo momento do lançamento.
  return snap.docs
    .map((d) => ({ l: paraLancamentoPublico(d.id, d.data()), t: d.get("criadoEm")?.toMillis?.() ?? 0 }))
    .sort((a, b) => b.l.data.localeCompare(a.l.data) || b.t - a.t)
    .map((x) => x.l);
}

// ---------- Áreas de lazer e agenda (sem casas) ----------

/** Áreas de lazer ativas (configuração da área não tem dado pessoal). */
export async function areasPublicas(cp: CondominioPublico): Promise<ConfigArea[]> {
  const snap = await base(cp).collection("amenities").get();
  return snap.docs
    .map((d) => paraArea(d.id, d.data()))
    .filter((a) => a.ativa)
    .sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, "pt-BR"));
}

/** O que qualquer pessoa vê de um horário ocupado: SEM a casa de quem reservou. */
export type OcupacaoPublica = {
  data: string;
  faixaId: string;
  inicio: string;
  fim: string;
  status: Extract<StatusReserva, "pendente" | "confirmada" | "bloqueada">;
  /** true só quando a casa identificada (número + código) é a dona da reserva. */
  minha: boolean;
};

/** Converte uma reserva em ocupação pública (null se ela não ocupa o horário). */
export function paraOcupacaoPublica(r: Reserva, unitIdDaCasa: string | null = null): OcupacaoPublica | null {
  if (!ocupaHorario(r.status)) return null;
  return {
    data: r.data,
    faixaId: r.faixaId,
    inicio: r.inicio,
    fim: r.fim,
    status: r.status as OcupacaoPublica["status"],
    minha: !!unitIdDaCasa && r.unitId === unitIdDaCasa,
  };
}

/**
 * Horários ocupados de uma área num mês ("AAAA-MM").
 * `unitIdDaCasa`: casa identificada pelo código (para marcar "sua reserva"); null para o público.
 */
export async function ocupacaoPublicaDaArea(
  cp: CondominioPublico,
  areaId: string,
  mes: string,
  unitIdDaCasa: string | null = null,
): Promise<OcupacaoPublica[]> {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(areaId) || !REGEX_MES_RESERVA.test(mes)) return [];
  const snap = await base(cp).collection("reservations").where("amenityId", "==", areaId).where("mes", "==", mes).get();
  return snap.docs
    .map((d) => paraOcupacaoPublica(paraReserva(d.id, d.data()), unitIdDaCasa))
    .filter((o): o is OcupacaoPublica => o !== null);
}

/**
 * Converte uma reserva em evento da agenda pública.
 * Mostra só a ÁREA e o horário ("Salão de festas reservado"): nunca a casa.
 * Pedidos ainda pendentes não aparecem (podem ser recusados).
 */
export function eventoPublicoDaReserva(r: Reserva): EventoAgenda | null {
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
export async function reservasPublicasDoMes(cp: CondominioPublico, ano: number, mes: number): Promise<EventoAgenda[]> {
  const chaveMes = dataISO(ano, mes, 1).slice(0, 7);
  const snap = await base(cp).collection("reservations").where("mes", "==", chaveMes).get();
  return snap.docs
    .map((d) => eventoPublicoDaReserva(paraReserva(d.id, d.data())))
    .filter((e): e is EventoAgenda => e !== null)
    .sort((a, b) => a.data.localeCompare(b.data) || a.detalhe.localeCompare(b.detalhe));
}
