import "server-only";
import { FieldValue, type DocumentData, type Firestore, type Timestamp } from "firebase-admin/firestore";
import { adminDb } from "../firebase-admin";
import { ErroDeAcesso, type Contexto } from "../contexto";
import { registrarAuditoria, type AcaoAuditada } from "../auditoria";
import { ErroDeNegocio } from "../acoes/resultado";
import type { Permissao } from "@/lib/permissoes";
import { hojeISO } from "@/lib/formato";
import { dataCurta, dataISO, type EventoAgenda } from "@/lib/agenda";
import {
  STATUS_RESERVA,
  conferirPedido,
  descreverFaixa,
  idDaTrava,
  minutosAgora,
  ocupaHorario,
  somarDias,
  sobrepoe,
  type ConfigArea,
  type Faixa,
  type StatusReserva,
} from "@/lib/reservas";

/**
 * Dados das reservas das áreas de lazer.
 *
 * Coleções (dentro de condominiums/{c}):
 * - amenities/{id}: configuração de cada área (faixas de horário, regras, limites);
 * - reservations/{id}: cada pedido, reserva ou bloqueio. NUNCA é apagado: muda de status
 *   (pendente → confirmada / recusada / cancelada) e guarda quem decidiu e o motivo;
 * - reservationLocks/{area_data_faixa}: a "trava" do horário. Existe enquanto o horário
 *   está ocupado. Ao recusar ou cancelar, a trava é APAGADA (ela não é histórico: o
 *   histórico fica na própria reserva). Assim o horário volta a ficar livre.
 */

const base = (ctx: Pick<Contexto, "condominioId">, db: Firestore = adminDb()) =>
  db.collection("condominiums").doc(ctx.condominioId);

/** Exige pelo menos uma das permissões (ex.: o morador e a gestão leem as áreas). */
function garantirUmaDas(ctx: Contexto, permissoes: Permissao[]): void {
  // Senha provisória: nada é mostrado até a pessoa criar a própria senha (igual ao garantirPermissao).
  if (ctx.precisaTrocarSenha) {
    throw new ErroDeAcesso("sem-permissao", "Troque a sua senha provisória antes de continuar.");
  }
  if (!permissoes.some((p) => ctx.permissoes.has(p))) {
    throw new ErroDeAcesso("sem-permissao", "Seu perfil não permite ver as reservas.");
  }
}

// ---------- Conversão dos documentos ----------

function texto(v: unknown, padrao = ""): string {
  return typeof v === "string" ? v : padrao;
}

function numero(v: unknown, padrao: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : padrao;
}

export function paraArea(id: string, d: DocumentData | undefined): ConfigArea {
  const faixas = Array.isArray(d?.faixas) ? (d.faixas as Partial<Faixa>[]) : [];
  return {
    id,
    nome: texto(d?.nome, id),
    regras: texto(d?.regras),
    capacidade: numero(d?.capacidade, 0),
    exigeAprovacao: d?.exigeAprovacao !== false, // padrão: exige
    antecedenciaMinDias: numero(d?.antecedenciaMinDias, 1),
    antecedenciaMaxDias: numero(d?.antecedenciaMaxDias, 60),
    limitePorMes: numero(d?.limitePorMes, 0),
    ativa: d?.ativa !== false,
    ordem: numero(d?.ordem, 99),
    faixas: faixas
      .filter((f) => typeof f?.id === "string" && typeof f.inicio === "string" && typeof f.fim === "string")
      .map((f) => ({ id: f.id!, rotulo: texto(f.rotulo, f.id), inicio: f.inicio!, fim: f.fim! })),
  };
}

export type Reserva = {
  id: string;
  amenityId: string;
  areaNome: string;
  /** null quando é um bloqueio da administração. */
  unitId: string | null;
  unidadeRotulo: string | null;
  data: string;
  mes: string;
  faixaId: string;
  faixaRotulo: string;
  inicio: string;
  fim: string;
  status: StatusReserva;
  observacao: string;
  /** Motivo do bloqueio, da recusa ou do cancelamento. */
  motivo: string;
  origem: "morador" | "administracao";
  criadoPorNome: string;
  criadoEm: Date | null;
  decididoPorNome: string;
};

function paraStatus(v: unknown): StatusReserva {
  return (STATUS_RESERVA as readonly unknown[]).includes(v) ? (v as StatusReserva) : "cancelada";
}

export function paraReserva(id: string, d: DocumentData | undefined): Reserva {
  return {
    id,
    amenityId: texto(d?.amenityId),
    areaNome: texto(d?.areaNome, "Área"),
    unitId: typeof d?.unitId === "string" ? d.unitId : null,
    unidadeRotulo: typeof d?.unidadeRotulo === "string" ? d.unidadeRotulo : null,
    data: texto(d?.data),
    mes: texto(d?.mes),
    faixaId: texto(d?.faixaId),
    faixaRotulo: texto(d?.faixaRotulo),
    inicio: texto(d?.inicio, "00:00"),
    fim: texto(d?.fim, "00:00"),
    status: paraStatus(d?.status),
    observacao: texto(d?.observacao),
    motivo: texto(d?.motivo),
    origem: d?.origem === "morador" ? "morador" : "administracao",
    criadoPorNome: texto(d?.criadoPorNome),
    criadoEm: (d?.criadoEm as Timestamp | undefined)?.toDate?.() ?? null,
    decididoPorNome: texto(d?.decididoPorNome),
  };
}

const porDataEHora = (a: Reserva, b: Reserva) => a.data.localeCompare(b.data) || a.inicio.localeCompare(b.inicio);

// ---------- Áreas ----------

/** Áreas de lazer. O morador só recebe as ativas; a gestão vê todas. */
export async function listarAreas(ctx: Contexto): Promise<ConfigArea[]> {
  garantirUmaDas(ctx, ["reservas.fazer", "reservas.ver_todas", "areas.configurar"]);
  const snap = await base(ctx).collection("amenities").get();
  const veTodas = ctx.permissoes.has("reservas.ver_todas") || ctx.permissoes.has("areas.configurar");
  return snap.docs
    .map((d) => paraArea(d.id, d.data()))
    .filter((a) => veTodas || a.ativa)
    .sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, "pt-BR"));
}

export async function obterArea(ctx: Contexto, id: string): Promise<ConfigArea | null> {
  garantirUmaDas(ctx, ["reservas.fazer", "reservas.ver_todas", "areas.configurar"]);
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return null;
  const d = await base(ctx).collection("amenities").doc(id).get();
  if (!d.exists) return null;
  const area = paraArea(d.id, d.data());
  const veTodas = ctx.permissoes.has("reservas.ver_todas") || ctx.permissoes.has("areas.configurar");
  return area.ativa || veTodas ? area : null;
}

// ---------- Gestão (agenda completa) ----------

/** Todas as reservas de uma área num mês ("AAAA-MM"), de qualquer status (inclui o histórico). */
export async function reservasDaAreaNoMes(ctx: Contexto, areaId: string, mes: string): Promise<Reserva[]> {
  garantirUmaDas(ctx, ["reservas.ver_todas"]);
  const snap = await base(ctx).collection("reservations").where("amenityId", "==", areaId).where("mes", "==", mes).get();
  return snap.docs.map((d) => paraReserva(d.id, d.data())).sort(porDataEHora);
}

/** Pedidos de moradores esperando a decisão da administração (mais próximos primeiro). */
export async function pedidosPendentes(ctx: Contexto): Promise<Reserva[]> {
  garantirUmaDas(ctx, ["reservas.ver_todas"]);
  const snap = await base(ctx).collection("reservations").where("status", "==", "pendente").get();
  return snap.docs.map((d) => paraReserva(d.id, d.data())).sort(porDataEHora);
}

/** Números do topo da agenda: pendentes, reservas de hoje e dos próximos 7 dias. */
export async function numerosDaAgenda(ctx: Contexto, agora = new Date()) {
  garantirUmaDas(ctx, ["reservas.ver_todas"]);
  const hoje = hojeISO(agora, ctx.fuso);
  const fimDaSemana = somarDias(hoje, 6);
  const [pendentes, semana] = await Promise.all([
    base(ctx).collection("reservations").where("status", "==", "pendente").count().get(),
    base(ctx).collection("reservations").where("data", ">=", hoje).where("data", "<=", fimDaSemana).get(),
  ]);
  // Bloqueios não contam como reserva (são horários fechados pela administração).
  const ativas = semana.docs.map((d) => paraReserva(d.id, d.data())).filter((r) => r.status === "pendente" || r.status === "confirmada");
  return {
    pendentes: pendentes.data().count,
    hoje: ativas.filter((r) => r.data === hoje).length,
    semana: ativas.length,
  };
}

// ---------- Morador ----------

/** O que o morador vê de cada horário ocupado: SEM a casa de quem reservou (privacidade). */
export type OcupacaoPublica = {
  data: string;
  faixaId: string;
  inicio: string;
  fim: string;
  status: StatusReserva;
  /** true se a reserva é da casa de quem está vendo. */
  minha: boolean;
};

/** Horários ocupados de uma área no mês, para o morador escolher um livre. */
export async function ocupacaoDaArea(ctx: Contexto, areaId: string, mes: string): Promise<OcupacaoPublica[]> {
  garantirUmaDas(ctx, ["reservas.fazer", "reservas.ver_todas"]);
  const snap = await base(ctx).collection("reservations").where("amenityId", "==", areaId).where("mes", "==", mes).get();
  return snap.docs
    .map((d) => paraReserva(d.id, d.data()))
    .filter((r) => ocupaHorario(r.status))
    .map((r) => ({
      data: r.data,
      faixaId: r.faixaId,
      inicio: r.inicio,
      fim: r.fim,
      status: r.status,
      minha: !!ctx.unitId && r.unitId === ctx.unitId,
    }));
}

/** Reservas da casa de quem está logado (as próximas primeiro, depois as passadas). */
export async function minhasReservas(ctx: Contexto, agora = new Date()): Promise<Reserva[]> {
  garantirUmaDas(ctx, ["reservas.fazer"]);
  if (!ctx.unitId) return [];
  const snap = await base(ctx).collection("reservations").where("unitId", "==", ctx.unitId).get();
  const hoje = hojeISO(agora, ctx.fuso);
  const todas = snap.docs.map((d) => paraReserva(d.id, d.data()));
  const proximas = todas.filter((r) => r.data >= hoje).sort(porDataEHora);
  const passadas = todas.filter((r) => r.data < hoje).sort((a, b) => porDataEHora(b, a)).slice(0, 20);
  return [...proximas, ...passadas];
}

// ---------- Para outros módulos ----------

export type ReservaDaPortaria = {
  id: string;
  areaNome: string;
  unidadeRotulo: string;
  faixaRotulo: string;
  status: "pendente" | "confirmada" | "bloqueada";
  inicio: string;
  fim: string;
};

/** Reservas ativas de um dia ("AAAA-MM-DD"), para a tela da portaria. */
export async function reservasDoDia(ctx: Contexto, data: string): Promise<ReservaDaPortaria[]> {
  garantirUmaDas(ctx, ["reservas.ver_todas"]);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return [];
  const snap = await base(ctx).collection("reservations").where("data", "==", data).get();
  return snap.docs
    .map((d) => paraReserva(d.id, d.data()))
    .filter((r) => ocupaHorario(r.status))
    .sort((a, b) => a.inicio.localeCompare(b.inicio) || a.areaNome.localeCompare(b.areaNome, "pt-BR"))
    .map((r) => ({
      id: r.id,
      areaNome: r.areaNome,
      unidadeRotulo: r.status === "bloqueada" ? `Fechado: ${r.motivo || "uso do condomínio"}` : (r.unidadeRotulo ?? "—"),
      faixaRotulo: descreverFaixa({ rotulo: r.faixaRotulo, inicio: r.inicio, fim: r.fim }),
      status: r.status as ReservaDaPortaria["status"],
      inicio: r.inicio,
      fim: r.fim,
    }));
}

/**
 * Eventos de reservas de um mês (mes de 1 a 12) no formato da agenda do Início.
 * - Reservas confirmadas de qualquer casa aparecem SEM dizer qual casa (privacidade).
 * - As da própria casa (confirmadas e pedidos pendentes) aparecem com "Sua reserva".
 * - Bloqueios aparecem como "fechado".
 * Quem não pode ver reservas recebe lista vazia (o Início continua abrindo).
 */
export async function reservasDoMesParaAgenda(ctx: Contexto, ano: number, mes: number): Promise<EventoAgenda[]> {
  if (ctx.precisaTrocarSenha) return [];
  if (!ctx.permissoes.has("reservas.fazer") && !ctx.permissoes.has("reservas.ver_todas")) return [];
  const chaveMes = dataISO(ano, mes, 1).slice(0, 7);
  const snap = await base(ctx).collection("reservations").where("mes", "==", chaveMes).get();
  return snap.docs
    .map((d) => paraReserva(d.id, d.data()))
    .filter((r) => {
      const minha = !!ctx.unitId && r.unitId === ctx.unitId;
      return r.status === "confirmada" || r.status === "bloqueada" || (minha && r.status === "pendente");
    })
    .sort(porDataEHora)
    .map((r): EventoAgenda => {
      const minha = !!ctx.unitId && r.unitId === ctx.unitId;
      const horario = descreverFaixa({ rotulo: r.faixaRotulo, inicio: r.inicio, fim: r.fim });
      let titulo: string;
      if (r.status === "bloqueada") titulo = `${r.areaNome}: fechado`;
      else if (minha && r.status === "pendente") titulo = `Seu pedido: ${r.areaNome} (aguardando aprovação)`;
      else if (minha) titulo = `Sua reserva: ${r.areaNome}`;
      else titulo = `${r.areaNome}: reservado`;
      return {
        id: `reserva-${r.id}`,
        data: r.data,
        tipo: r.status === "bloqueada" ? "manutencao" : "salao",
        titulo,
        detalhe: `${dataCurta(r.data)} · ${horario}`,
        exemplo: false,
      };
    });
}

// ---------- Gravação de uma nova reserva (usada pelas ações) ----------

export type NovaReserva = {
  areaId: string;
  data: string;
  faixaId: string;
  observacao: string;
  /** "pedido" = morador; "admin" = administração reservando para uma casa; "bloqueio" = horário fechado. */
  tipo: "pedido" | "admin" | "bloqueio";
  /** Casa da reserva (null no bloqueio). */
  unitId: string | null;
  /** Motivo do bloqueio. */
  motivo?: string;
};

export type ReservaGravada = { id: string; status: StatusReserva; areaNome: string; faixa: string; data: string };

/** Ações da auditoria das reservas (todas estão em ACOES_AUDITADAS). */
export function acaoReserva(
  a: Extract<AcaoAuditada, `reserva.${string}` | `area.${string}`>,
): AcaoAuditada {
  return a;
}

/** Erro do Firestore "documento já existe" (outra pessoa criou a trava no mesmo instante). */
function jaExiste(e: unknown): boolean {
  return !!e && typeof e === "object" && "code" in e && ((e as { code: unknown }).code === 6 || (e as { code: unknown }).code === "already-exists");
}

/**
 * Cria a reserva numa TRANSAÇÃO, junto com a trava do horário e a auditoria.
 * Se duas pessoas pedirem o mesmo horário ao mesmo tempo, só uma consegue:
 * a outra recebe "esse horário acabou de ser reservado".
 */
export async function gravarReserva(
  db: Firestore,
  ctx: Contexto,
  nova: NovaReserva,
  agora = new Date(),
): Promise<ReservaGravada> {
  const c = base(ctx, db);
  const areaRef = c.collection("amenities").doc(nova.areaId);
  const travaRef = c.collection("reservationLocks").doc(idDaTrava(nova.areaId, nova.data, nova.faixaId));
  const unidadeRef = nova.unitId ? c.collection("units").doc(nova.unitId) : null;
  const reservaRef = c.collection("reservations").doc();
  const hoje = hojeISO(agora, ctx.fuso);
  const mes = nova.data.slice(0, 7);

  try {
    return await db.runTransaction(async (tx) => {
      // 1) Leituras (numa transação, todas vêm antes das gravações).
      const [areaDoc, travaDoc, unidadeDoc] = await tx.getAll(areaRef, travaRef, ...(unidadeRef ? [unidadeRef] : []));
      const doDia = await tx.get(c.collection("reservations").where("amenityId", "==", nova.areaId).where("data", "==", nova.data));
      const daCasa = unidadeRef
        ? await tx.get(c.collection("reservations").where("unitId", "==", nova.unitId).where("mes", "==", mes))
        : null;

      if (!areaDoc.exists) throw new ErroDeNegocio("Área não encontrada. Atualize a página.");
      const area = paraArea(areaDoc.id, areaDoc.data());
      const faixa = area.faixas.find((f) => f.id === nova.faixaId);
      if (!faixa) throw new ErroDeNegocio("Esse horário não existe mais nesta área. Atualize a página.");

      let unidadeRotulo: string | null = null;
      if (unidadeRef) {
        if (!unidadeDoc?.exists) throw new ErroDeNegocio("Casa não encontrada.");
        if (unidadeDoc.get("status") === "inativa") throw new ErroDeNegocio("Esta casa está inativa no cadastro.");
        unidadeRotulo = String(unidadeDoc.get("rotulo") ?? unidadeDoc.id);
      }

      const reservasDaCasaNoMes = (daCasa?.docs ?? [])
        .map((d) => paraReserva(d.id, d.data()))
        .filter((r) => r.amenityId === nova.areaId && (r.status === "pendente" || r.status === "confirmada")).length;

      const problema = conferirPedido({
        area,
        data: nova.data,
        faixa,
        hoje,
        agoraMinutos: minutosAgora(agora, ctx.fuso),
        reservasDaCasaNoMes,
        peloAdmin: nova.tipo !== "pedido",
      });
      if (problema) throw new ErroDeNegocio(problema);

      // 2) O horário está livre? Primeiro a trava; depois qualquer reserva com horário sobreposto.
      const ocupadas = doDia.docs.map((d) => paraReserva(d.id, d.data())).filter((r) => ocupaHorario(r.status));
      if (travaDoc.exists && ocupadas.some((r) => r.id === travaDoc.get("reservaId"))) {
        throw new ErroDeNegocio("Esse horário já está ocupado. Escolha outro.");
      }
      if (ocupadas.some((r) => r.faixaId === faixa.id || sobrepoe(r, faixa))) {
        throw new ErroDeNegocio("Esse horário já está ocupado. Escolha outro.");
      }

      const status: StatusReserva =
        nova.tipo === "bloqueio" ? "bloqueada" : nova.tipo === "admin" ? "confirmada" : area.exigeAprovacao ? "pendente" : "confirmada";

      // 3) Gravações: reserva + trava + auditoria, tudo junto.
      tx.create(reservaRef, {
        amenityId: area.id,
        areaNome: area.nome,
        unitId: nova.unitId,
        unidadeRotulo,
        data: nova.data,
        mes,
        faixaId: faixa.id,
        faixaRotulo: faixa.rotulo,
        inicio: faixa.inicio,
        fim: faixa.fim,
        status,
        observacao: nova.observacao,
        motivo: nova.motivo ?? "",
        origem: nova.tipo === "pedido" ? "morador" : "administracao",
        criadoPor: ctx.uid,
        criadoPorNome: ctx.nome,
        criadoEm: FieldValue.serverTimestamp(),
        // Quando a reserva já nasce confirmada pela administração, quem criou é quem decidiu.
        decididoPor: nova.tipo === "pedido" ? null : ctx.uid,
        decididoPorNome: nova.tipo === "pedido" ? "" : ctx.nome,
        decididoEm: nova.tipo === "pedido" ? null : FieldValue.serverTimestamp(),
      });
      // Trava antiga "esquecida" (de uma reserva que já não ocupa o horário) é sobrescrita.
      const dadosTrava = { reservaId: reservaRef.id, amenityId: area.id, data: nova.data, faixaId: faixa.id, criadoEm: FieldValue.serverTimestamp() };
      if (travaDoc.exists) tx.set(travaRef, dadosTrava);
      else tx.create(travaRef, dadosTrava);

      registrarAuditoria(db, tx, {
        condominioId: ctx.condominioId,
        uid: ctx.uid,
        nome: ctx.nome,
        papel: ctx.papel,
        acao: acaoReserva(nova.tipo === "bloqueio" ? "reserva.bloquear" : "reserva.criar"),
        alvo: `reservations/${reservaRef.id}`,
        detalhes: {
          area: area.id,
          data: nova.data,
          faixa: faixa.id,
          unidade: nova.unitId,
          status,
          origem: nova.tipo === "pedido" ? "morador" : "administracao",
          ...(nova.tipo === "bloqueio" ? { motivo: nova.motivo ?? "" } : {}),
        },
      });

      return { id: reservaRef.id, status, areaNome: area.nome, faixa: descreverFaixa(faixa), data: nova.data };
    });
  } catch (e) {
    if (jaExiste(e)) throw new ErroDeNegocio("Esse horário acabou de ser reservado por outra pessoa. Escolha outro.");
    throw e;
  }
}
