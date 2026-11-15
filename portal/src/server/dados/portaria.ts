import "server-only";
import type { Timestamp } from "firebase-admin/firestore";
import { adminDb, usaEmuladores } from "../firebase-admin";
import { garantirPermissao, type Contexto } from "../contexto";
import { registrarAuditoria, type AcaoAuditada } from "../auditoria";
import { hojeISO } from "@/lib/formato";
import {
  limiteDeRetencao,
  NOME_ANONIMIZADO,
  SEGREDO_CODIGO_DESENVOLVIMENTO,
  situacaoDaVisita,
  type SituacaoVisita,
  type StatusVisita,
  type TipoEncomenda,
  type TipoVisita,
} from "@/lib/portaria";

/**
 * Leituras da portaria (visitantes, entradas/saídas e encomendas).
 * Toda função recebe o Contexto: o condomínio vem dele, nunca do navegador.
 *
 * Coleções (dentro de condominiums/{c}):
 * - visitors      autorizações dos moradores (só o HMAC do código fica gravado)
 * - accessEvents  entradas e saídas. O registro nunca é apagado nem reescrito; só os
 *                 campos de controle mudam: "dentro"/"saidaEm"/"saidaId" (quando a pessoa sai)
 *                 e o nome, que vira "Nome removido (LGPD)" depois de 90 dias.
 * - packages      encomendas (aguardando → entregue)
 */

const base = (ctx: Contexto) => adminDb().collection("condominiums").doc(ctx.condominioId);

const texto = (v: unknown) => (typeof v === "string" ? v : "");
const quando = (v: unknown) => (v && typeof (v as Timestamp).toDate === "function" ? (v as Timestamp).toDate() : null);

// ---------- Segredo do código ----------

/**
 * Segredo do HMAC dos códigos (variável PORTARIA_SEGREDO_CODIGO).
 * No computador local (simulador) há um valor padrão; em produção ele é obrigatório,
 * com pelo menos 32 caracteres. Se mudar, os códigos já gerados deixam de valer.
 */
export function segredoDoCodigo(): string {
  const valor = process.env.PORTARIA_SEGREDO_CODIGO;
  if (valor && valor.length >= 32) return valor;
  if (usaEmuladores() || process.env.NODE_ENV !== "production") return valor || SEGREDO_CODIGO_DESENVOLVIMENTO;
  throw new Error("Configure PORTARIA_SEGREDO_CODIGO (pelo menos 32 caracteres) nas variáveis do servidor.");
}

// ---------- Visitantes autorizados ----------

export type Autorizacao = {
  id: string;
  nome: string;
  tipo: TipoVisita;
  unitId: string;
  unidadeRotulo: string;
  data: string;
  validaAte: string;
  usoUnico: boolean;
  usos: number;
  observacao: string;
  status: StatusVisita;
  situacao: SituacaoVisita;
  autorizadoPor: string;
  criadoEm: Date | null;
};

function paraAutorizacao(d: FirebaseFirestore.DocumentSnapshot, hoje: string): Autorizacao {
  const status = (["ativa", "usada", "cancelada"].includes(d.get("status")) ? d.get("status") : "ativa") as StatusVisita;
  const data = texto(d.get("data"));
  const validaAte = texto(d.get("validaAte")) || data;
  return {
    id: d.id,
    nome: texto(d.get("nome")),
    tipo: (texto(d.get("tipo")) || "outro") as TipoVisita,
    unitId: texto(d.get("unitId")),
    unidadeRotulo: texto(d.get("unidadeRotulo")) || texto(d.get("unitId")),
    data,
    validaAte,
    usoUnico: d.get("usoUnico") === true,
    usos: Number(d.get("usos") ?? 0),
    observacao: texto(d.get("observacao")),
    status,
    situacao: situacaoDaVisita({ status, data, validaAte }, hoje),
    autorizadoPor: texto(d.get("criadoPorNome")),
    criadoEm: quando(d.get("criadoEm")),
  };
}

/** Autorizações da casa do morador (as 60 mais recentes). */
export async function minhasAutorizacoes(ctx: Contexto): Promise<Autorizacao[]> {
  garantirPermissao(ctx, "visitantes.autorizar");
  if (!ctx.unitId) return [];
  const hoje = hojeISO(new Date(), ctx.fuso);
  const snap = await base(ctx)
    .collection("visitors")
    .where("unitId", "==", ctx.unitId)
    .orderBy("criadoEm", "desc")
    .limit(60)
    .get();
  return snap.docs.map((d) => paraAutorizacao(d, hoje));
}

/** Autorizações que valem hoje e ainda não foram usadas (lista "Esperados hoje"). */
export async function esperadosHoje(ctx: Contexto): Promise<Autorizacao[]> {
  garantirPermissao(ctx, "visitantes.ver_todos");
  const hoje = hojeISO(new Date(), ctx.fuso);
  const snap = await base(ctx)
    .collection("visitors")
    .where("status", "==", "ativa")
    .where("validaAte", ">=", hoje)
    .limit(300)
    .get();
  return snap.docs
    .map((d) => paraAutorizacao(d, hoje))
    .filter((a) => a.situacao === "valida_hoje")
    .sort((a, b) => a.unidadeRotulo.localeCompare(b.unidadeRotulo, "pt-BR", { numeric: true }) || a.nome.localeCompare(b.nome, "pt-BR"));
}

// ---------- Entradas e saídas ----------

export type EventoAcesso = {
  id: string;
  tipo: "entrada" | "saida";
  nome: string;
  tipoVisita: TipoVisita;
  unitId: string;
  unidadeRotulo: string;
  origem: "codigo" | "sem_codigo";
  dentro: boolean;
  quando: Date | null;
  saidaEm: Date | null;
  registradoPor: string;
  anonimizado: boolean;
};

function paraEvento(d: FirebaseFirestore.DocumentSnapshot): EventoAcesso {
  return {
    id: d.id,
    tipo: d.get("tipo") === "saida" ? "saida" : "entrada",
    nome: texto(d.get("nome")),
    tipoVisita: (texto(d.get("tipoVisita")) || "outro") as TipoVisita,
    unitId: texto(d.get("unitId")),
    unidadeRotulo: texto(d.get("unidadeRotulo")) || texto(d.get("unitId")),
    origem: d.get("origem") === "codigo" ? "codigo" : "sem_codigo",
    dentro: d.get("dentro") === true,
    quando: quando(d.get("quando")),
    saidaEm: quando(d.get("saidaEm")),
    registradoPor: texto(d.get("registradoPorNome")),
    anonimizado: d.get("anonimizado") === true,
  };
}

/** Quem entrou e ainda não saiu (mais antigos primeiro: quem está há mais tempo aparece em cima). */
export async function dentroAgora(ctx: Contexto): Promise<EventoAcesso[]> {
  garantirPermissao(ctx, "portaria.operar");
  const snap = await base(ctx).collection("accessEvents").where("dentro", "==", true).limit(300).get();
  return snap.docs.map(paraEvento).sort((a, b) => (a.quando?.getTime() ?? 0) - (b.quando?.getTime() ?? 0));
}

/** Quantas entradas foram registradas hoje (contagem feita pelo próprio banco, sem baixar os registros). */
export async function entradasHoje(ctx: Contexto): Promise<number> {
  garantirPermissao(ctx, "portaria.operar");
  const hoje = hojeISO(new Date(), ctx.fuso);
  const r = await base(ctx).collection("accessEvents").where("data", "==", hoje).where("tipo", "==", "entrada").count().get();
  return r.data().count;
}

/** Histórico de um dia (filtro opcional por casa), mais recentes primeiro. Somente leitura. */
export async function historicoAcessos(ctx: Contexto, filtro: { data: string; unitId?: string }): Promise<EventoAcesso[]> {
  garantirPermissao(ctx, "visitantes.ver_todos");
  let consulta = base(ctx).collection("accessEvents").where("data", "==", filtro.data);
  if (filtro.unitId) consulta = consulta.where("unitId", "==", filtro.unitId);
  const snap = await consulta.limit(500).get();
  return snap.docs.map(paraEvento).sort((a, b) => (b.quando?.getTime() ?? 0) - (a.quando?.getTime() ?? 0));
}

// ---------- Encomendas ----------

export type Encomenda = {
  id: string;
  unitId: string;
  unidadeRotulo: string;
  destinatario: string;
  tipo: TipoEncomenda;
  observacao: string;
  status: "aguardando" | "entregue";
  recebidoEm: Date | null;
  recebidoPor: string;
  entregueEm: Date | null;
  entreguePor: string;
  retiradoPor: string;
};

function paraEncomenda(d: FirebaseFirestore.DocumentSnapshot): Encomenda {
  return {
    id: d.id,
    unitId: texto(d.get("unitId")),
    unidadeRotulo: texto(d.get("unidadeRotulo")) || texto(d.get("unitId")),
    destinatario: texto(d.get("destinatario")),
    tipo: (texto(d.get("tipo")) || "outro") as TipoEncomenda,
    observacao: texto(d.get("observacao")),
    status: d.get("status") === "entregue" ? "entregue" : "aguardando",
    recebidoEm: quando(d.get("recebidoEm")),
    recebidoPor: texto(d.get("recebidoPorNome")),
    entregueEm: quando(d.get("entregueEm")),
    entreguePor: texto(d.get("entreguePorNome")),
    retiradoPor: texto(d.get("retiradoPor")),
  };
}

const maisAntigaPrimeiro = (a: Encomenda, b: Encomenda) => (a.recebidoEm?.getTime() ?? 0) - (b.recebidoEm?.getTime() ?? 0);

/** Encomendas na portaria esperando retirada (todas as casas). */
export async function encomendasAguardando(ctx: Contexto): Promise<Encomenda[]> {
  garantirPermissao(ctx, "encomendas.registrar");
  const snap = await base(ctx).collection("packages").where("status", "==", "aguardando").limit(300).get();
  return snap.docs.map(paraEncomenda).sort(maisAntigaPrimeiro);
}

/** Encomendas da casa do morador: as que aguardam e as 10 últimas entregues. */
export async function minhasEncomendas(ctx: Contexto): Promise<{ aguardando: Encomenda[]; entregues: Encomenda[] }> {
  garantirPermissao(ctx, "encomendas.ver_proprias");
  if (!ctx.unitId) return { aguardando: [], entregues: [] };
  const col = base(ctx).collection("packages");
  const [aguardando, entregues] = await Promise.all([
    col.where("unitId", "==", ctx.unitId).where("status", "==", "aguardando").limit(50).get(),
    col.where("unitId", "==", ctx.unitId).where("status", "==", "entregue").orderBy("entregueEm", "desc").limit(10).get(),
  ]);
  return { aguardando: aguardando.docs.map(paraEncomenda).sort(maisAntigaPrimeiro), entregues: entregues.docs.map(paraEncomenda) };
}

/** Encomendas recebidas num dia (filtro opcional por casa), para o histórico da administração. */
export async function historicoEncomendas(ctx: Contexto, filtro: { data: string; unitId?: string }): Promise<Encomenda[]> {
  garantirPermissao(ctx, "visitantes.ver_todos");
  let consulta = base(ctx).collection("packages").where("dataRecebimento", "==", filtro.data);
  if (filtro.unitId) consulta = consulta.where("unitId", "==", filtro.unitId);
  const snap = await consulta.limit(500).get();
  return snap.docs.map(paraEncomenda).sort((a, b) => (b.recebidoEm?.getTime() ?? 0) - (a.recebidoEm?.getTime() ?? 0));
}

// ---------- LGPD: remoção dos nomes antigos ----------

// Ação da auditoria da limpeza LGPD (está em ACOES_AUDITADAS).
const ACAO_ANONIMIZAR = "visitante.anonimizar" satisfies AcaoAuditada;

/** No máximo isto por vez (um lote do Firestore aceita 500 gravações; 1 fica para a auditoria). */
const POR_VEZ = 200;

/**
 * Remove o nome (e a observação) de visitantes com mais de 90 dias.
 * O registro de entrada/saída continua existindo, só sem o nome.
 * Pode ser chamada pelo botão da administração e, no futuro, por uma tarefa agendada.
 * Devolve quantos registros foram anonimizados e se ainda sobrou algo para a próxima rodada.
 */
export async function limparVisitantesAntigos(ctx: Contexto): Promise<{ autorizacoes: number; acessos: number; restam: boolean }> {
  // Só a administração: ver todos os visitantes E gerenciar cadastros de pessoas.
  garantirPermissao(ctx, "visitantes.ver_todos");
  garantirPermissao(ctx, "moradores.gerenciar");

  const db = adminDb();
  const c = base(ctx);
  const limite = limiteDeRetencao(hojeISO(new Date(), ctx.fuso));

  const [visitas, eventos] = await Promise.all([
    c.collection("visitors").where("anonimizado", "==", false).where("validaAte", "<", limite).limit(POR_VEZ).get(),
    c.collection("accessEvents").where("anonimizado", "==", false).where("data", "<", limite).limit(POR_VEZ).get(),
  ]);

  const lote = db.batch();
  visitas.docs.forEach((d) => lote.update(d.ref, { nome: NOME_ANONIMIZADO, observacao: "", anonimizado: true }));
  eventos.docs.forEach((d) => lote.update(d.ref, { nome: NOME_ANONIMIZADO, anonimizado: true }));
  registrarAuditoria(db, lote, {
    condominioId: ctx.condominioId,
    uid: ctx.uid,
    nome: ctx.nome,
    papel: ctx.papel,
    acao: ACAO_ANONIMIZAR,
    detalhes: { antesDe: limite, autorizacoes: visitas.size, acessos: eventos.size },
  });
  await lote.commit();

  return { autorizacoes: visitas.size, acessos: eventos.size, restam: visitas.size === POR_VEZ || eventos.size === POR_VEZ };
}
