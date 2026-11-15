"use server";

/**
 * Ações das reservas e das áreas de lazer. Princípios:
 * - a agenda é controlada pela ADMINISTRAÇÃO; o morador pede e, se a área exigir
 *   aprovação, o pedido fica "aguardando aprovação";
 * - toda criação usa transação com a trava do horário (reservationLocks);
 * - nada é apagado: reservas mudam de status e guardam quem decidiu e o motivo.
 *   Só a TRAVA é apagada ao recusar/cancelar, para liberar o horário;
 * - tudo é registrado na auditoria, na mesma transação.
 */
import { revalidatePath } from "next/cache";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "../firebase-admin";
import { garantirPermissao, getContexto, ErroDeAcesso, type Contexto } from "../contexto";
import { registrarAuditoria } from "../auditoria";
import { acaoReserva, gravarReserva, paraArea, paraReserva, type Reserva } from "../dados/reservas";
import { ErroDeNegocio, executar, lerFormulario, type Resultado } from "./resultado";
import {
  AREAS_SUGERIDAS,
  avisoDesistenciaTardia,
  desistenciaForaDoPrazo,
  idDaTrava,
  minutosAgora,
  podeCancelarMorador,
} from "@/lib/reservas";
import { dataISOParaBR, hojeISO } from "@/lib/formato";
import {
  esquemaAprovar,
  esquemaArea,
  esquemaBloqueio,
  esquemaCancelar,
  esquemaPedido,
  esquemaRecusar,
  esquemaReservaAdmin,
} from "@/lib/validacao-reservas";

function revalidarReservas() {
  revalidatePath("/admin/reservas");
  revalidatePath("/reservas");
  revalidatePath("/inicio");
  revalidatePath("/portaria");
}

// ---------- Áreas ----------

/** Cadastra uma área nova ou altera uma existente (campo "id" preenchido). */
export async function salvarArea(_: Resultado, dados: FormData): Promise<Resultado> {
  return executar(async () => {
    const ctx = garantirPermissao(await getContexto(), "areas.configurar");
    const v = lerFormulario(esquemaArea, dados);
    const db = adminDb();
    const col = db.collection("condominiums").doc(ctx.condominioId).collection("amenities");
    const ref = v.id ? col.doc(v.id) : col.doc();
    const campos = {
      tipo: v.tipo,
      nome: v.nome,
      regras: v.regras,
      capacidade: v.capacidade,
      exigeAprovacao: v.exigeAprovacao,
      antecedenciaMinimaHoras: v.antecedenciaMinimaHoras,
      antecedenciaMaxDias: v.antecedenciaMaxDias,
      prazoDesistenciaHoras: v.prazoDesistenciaHoras,
      limitePorMes: v.limitePorMes,
      limitePorCasaPorDia: v.limitePorCasaPorDia,
      permitirExtraSeDiaLivre: v.permitirExtraSeDiaLivre,
      exigencias: v.exigencias,
      avisos: v.avisos,
      faixasLivres: v.faixasLivres,
      ativa: v.ativa,
      ordem: v.ordem,
      faixas: v.faixas,
      atualizadoEm: FieldValue.serverTimestamp(),
      atualizadoPor: ctx.uid,
    };

    await db.runTransaction(async (tx) => {
      const atual = await tx.get(ref);
      if (v.id && !atual.exists) throw new ErroDeNegocio("Área não encontrada. Atualize a página.");
      // Ao editar, apaga o campo antigo em dias (agora a antecedência é em horas).
      if (v.id) tx.update(ref, { ...campos, antecedenciaMinDias: FieldValue.delete() });
      else tx.create(ref, { ...campos, criadoEm: FieldValue.serverTimestamp() });
      registrarAuditoria(db, tx, {
        condominioId: ctx.condominioId,
        uid: ctx.uid,
        nome: ctx.nome,
        papel: ctx.papel,
        acao: acaoReserva(v.id ? "area.editar" : "area.criar"),
        alvo: `amenities/${ref.id}`,
        detalhes: {
          nome: v.nome,
          tipo: v.tipo,
          ativa: v.ativa,
          exigeAprovacao: v.exigeAprovacao,
          faixas: v.faixas.length,
          faixasLivres: v.faixasLivres.length,
          antecedenciaMinimaHoras: v.antecedenciaMinimaHoras,
          prazoDesistenciaHoras: v.prazoDesistenciaHoras,
          limitePorMes: v.limitePorMes,
          limitePorCasaPorDia: v.limitePorCasaPorDia,
          permitirExtraSeDiaLivre: v.permitirExtraSeDiaLivre,
          exigencias: v.exigencias.length,
          avisos: v.avisos.length,
        },
      });
    });

    revalidarReservas();
    revalidatePath("/admin/reservas/areas");
    return v.id ? `Área "${v.nome}" atualizada.` : `Área "${v.nome}" criada.`;
  });
}

/** Cria as áreas e equipamentos sugeridos (AREAS_SUGERIDAS) — só se ainda não houver nenhuma área. */
export async function criarAreasSugeridas(): Promise<Resultado> {
  return executar(async () => {
    const ctx = garantirPermissao(await getContexto(), "areas.configurar");
    const db = adminDb();
    const col = db.collection("condominiums").doc(ctx.condominioId).collection("amenities");
    await db.runTransaction(async (tx) => {
      const existentes = await tx.get(col.limit(1));
      if (!existentes.empty) throw new ErroDeNegocio("Já existem áreas cadastradas. Use \"Nova área\" para acrescentar outras.");
      for (const a of AREAS_SUGERIDAS) {
        const { id, ...campos } = a;
        tx.create(col.doc(id), { ...campos, criadoEm: FieldValue.serverTimestamp(), atualizadoPor: ctx.uid });
      }
      registrarAuditoria(db, tx, {
        condominioId: ctx.condominioId,
        uid: ctx.uid,
        nome: ctx.nome,
        papel: ctx.papel,
        acao: acaoReserva("area.criar"),
        alvo: "amenities",
        detalhes: { sugeridas: AREAS_SUGERIDAS.length, nomes: AREAS_SUGERIDAS.map((a) => a.nome).join(", ") },
      });
    });
    revalidarReservas();
    revalidatePath("/admin/reservas/areas");
    return `${AREAS_SUGERIDAS.length} áreas e equipamentos criados. Confira as regras e os horários de cada um.`;
  });
}

// ---------- Criar reservas ----------

/** Pedido do morador. A casa vem do cadastro dele (nunca do formulário). */
export async function pedirReserva(_: Resultado, dados: FormData): Promise<Resultado> {
  return executar(async () => {
    const ctx = garantirPermissao(await getContexto(), "reservas.fazer");
    if (!ctx.unitId) throw new ErroDeNegocio("Seu cadastro não está ligado a uma casa. Fale com a administração.");
    const v = lerFormulario(esquemaPedido, dados);
    const r = await gravarReserva(adminDb(), ctx, {
      areaId: v.areaId,
      data: v.data,
      faixaId: v.faixaId,
      observacao: v.observacao,
      aceitouRegras: v.aceite,
      tipo: "pedido",
      unitId: ctx.unitId,
    });
    revalidarReservas();
    return r.status === "pendente"
      ? `Pedido enviado: ${r.areaNome}, ${dataISOParaBR(r.data)} (${r.faixa}). Aguardando aprovação da administração.`
      : `Reserva confirmada: ${r.areaNome}, ${dataISOParaBR(r.data)} (${r.faixa}).`;
  });
}

/** A administração reserva para uma casa: já nasce confirmada. */
export async function reservarParaCasa(_: Resultado, dados: FormData): Promise<Resultado> {
  return executar(async () => {
    const ctx = garantirPermissao(await getContexto(), "reservas.gerenciar");
    const v = lerFormulario(esquemaReservaAdmin, dados);
    const r = await gravarReserva(adminDb(), ctx, { ...v, tipo: "admin" });
    revalidarReservas();
    return `Reserva confirmada: ${r.areaNome}, ${dataISOParaBR(r.data)} (${r.faixa}).`;
  });
}

/** Fecha um horário (manutenção, evento do condomínio...). */
export async function bloquearFaixa(_: Resultado, dados: FormData): Promise<Resultado> {
  return executar(async () => {
    const ctx = garantirPermissao(await getContexto(), "reservas.gerenciar");
    const v = lerFormulario(esquemaBloqueio, dados);
    const r = await gravarReserva(adminDb(), ctx, {
      areaId: v.areaId,
      data: v.data,
      faixaId: v.faixaId,
      observacao: "",
      motivo: v.motivo,
      tipo: "bloqueio",
      unitId: null,
    });
    revalidarReservas();
    return `Horário bloqueado: ${r.areaNome}, ${dataISOParaBR(r.data)} (${r.faixa}).`;
  });
}

// ---------- Decidir e cancelar ----------

type Mudanca = { id: string; motivo: string };

/** O que a mudança de status devolve: a reserva (como estava antes) e se a desistência ficou fora do prazo. */
type Mudou = { reserva: Reserva; cancelamentoTardio: boolean; prazoHoras: number };

/**
 * Muda o status de uma reserva numa transação (com auditoria).
 * Ao recusar/cancelar, apaga a trava para o horário voltar a ficar livre.
 * `tardio`: só na desistência do MORADOR — calcula se ficou fora do prazo.
 */
async function mudarStatus(
  tipo: "aprovar" | "recusar" | "cancelar",
  { id, motivo }: Mudanca,
  conferir: (r: Reserva) => void,
  ctx: Contexto,
  tardio?: (r: Reserva, prazoHoras: number) => boolean,
): Promise<Mudou> {
  const db = adminDb();
  const c = db.collection("condominiums").doc(ctx.condominioId);
  const ref = c.collection("reservations").doc(id);
  return db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    if (!doc.exists) throw new ErroDeNegocio("Reserva não encontrada. Atualize a página.");
    const r = paraReserva(doc.id, doc.data());
    conferir(r);
    const travaRef = c.collection("reservationLocks").doc(idDaTrava(r.amenityId, r.data, r.faixaId));
    const trava = tipo === "aprovar" ? null : await tx.get(travaRef);

    // Prazo de desistência: o que valia quando a reserva foi feita; em reservas antigas, o da área hoje.
    let prazoHoras = 0;
    let cancelamentoTardio = false;
    if (tipo === "cancelar" && tardio) {
      if (r.prazoDesistenciaHoras !== null) prazoHoras = r.prazoDesistenciaHoras;
      else if (r.amenityId) prazoHoras = paraArea(r.amenityId, (await tx.get(c.collection("amenities").doc(r.amenityId))).data()).prazoDesistenciaHoras;
      cancelamentoTardio = tardio(r, prazoHoras);
    }

    const novoStatus = tipo === "aprovar" ? "confirmada" : tipo === "recusar" ? "recusada" : "cancelada";
    tx.update(ref, {
      status: novoStatus,
      ...(motivo ? { motivo } : {}),
      statusAnterior: r.status,
      decididoPor: ctx.uid,
      decididoPorNome: ctx.nome,
      decididoEm: FieldValue.serverTimestamp(),
      ...(tipo === "cancelar" ? { canceladoEm: FieldValue.serverTimestamp(), cancelamentoTardio } : {}),
    });
    // Só apaga a trava se ela for desta reserva (nunca a de outra).
    if (trava?.exists && trava.get("reservaId") === r.id) tx.delete(travaRef);

    registrarAuditoria(db, tx, {
      condominioId: ctx.condominioId,
      uid: ctx.uid,
      nome: ctx.nome,
      papel: ctx.papel,
      acao: acaoReserva(tipo === "aprovar" ? "reserva.aprovar" : tipo === "recusar" ? "reserva.recusar" : "reserva.cancelar"),
      alvo: `reservations/${r.id}`,
      detalhes: {
        area: r.amenityId,
        data: r.data,
        faixa: r.faixaId,
        unidade: r.unitId,
        de: r.status,
        para: novoStatus,
        ...(motivo ? { motivo } : {}),
        ...(cancelamentoTardio ? { cancelamentoTardio: true, prazoHoras } : {}),
      },
    });
    return { reserva: r, cancelamentoTardio, prazoHoras };
  });
}

export async function aprovarReserva(_: Resultado, dados: FormData): Promise<Resultado> {
  return executar(async () => {
    const ctx = garantirPermissao(await getContexto(), "reservas.gerenciar");
    const v = lerFormulario(esquemaAprovar, dados);
    const hoje = hojeISO(new Date(), ctx.fuso);
    const { reserva: r } = await mudarStatus("aprovar", { id: v.id, motivo: "" }, (r) => {
      if (r.status !== "pendente") throw new ErroDeNegocio("Este pedido já foi decidido. Atualize a página.");
      if (r.data < hoje) throw new ErroDeNegocio("A data deste pedido já passou. Recuse-o informando o motivo.");
    }, ctx);
    revalidarReservas();
    return `Reserva aprovada: ${r.areaNome}, ${dataISOParaBR(r.data)} — ${r.unidadeRotulo ?? ""}.`;
  });
}

export async function recusarReserva(_: Resultado, dados: FormData): Promise<Resultado> {
  return executar(async () => {
    const ctx = garantirPermissao(await getContexto(), "reservas.gerenciar");
    const v = lerFormulario(esquemaRecusar, dados);
    const { reserva: r } = await mudarStatus("recusar", v, (r) => {
      if (r.status !== "pendente") throw new ErroDeNegocio("Este pedido já foi decidido. Atualize a página.");
    }, ctx);
    revalidarReservas();
    return `Pedido recusado: ${r.areaNome}, ${dataISOParaBR(r.data)}. O horário ficou livre.`;
  });
}

/**
 * Cancelar:
 * - administração ("reservas.gerenciar"): qualquer reserva ou bloqueio ativo, com motivo;
 * - morador ("reservas.fazer"): só da própria casa, só pedidos/reservas que ainda não começaram.
 *   Pode desistir sempre; se faltar menos que o prazo de desistência da área, a reserva fica
 *   marcada "cancelamentoTardio" (sujeita a multa conforme o regimento; o síndico vê no filtro).
 */
export async function cancelarReserva(_: Resultado, dados: FormData): Promise<Resultado> {
  return executar(async () => {
    const ctx = await getContexto();
    if (!ctx) throw new ErroDeAcesso("sem-sessao", "Sua sessão terminou. Entre novamente.");
    const podeGerenciar = ctx.permissoes.has("reservas.gerenciar");
    // Sempre passa por garantirPermissao (ela também barra quem está com senha provisória).
    garantirPermissao(ctx, podeGerenciar ? "reservas.gerenciar" : "reservas.fazer");
    const v = lerFormulario(esquemaCancelar, dados);
    // O síndico que mora numa casa também cancela a PRÓPRIA reserva pela tela do morador
    // (sem motivo). Nesse caso segue as regras do morador. Com motivo = cancelamento da administração.
    const admin = podeGerenciar && (v.motivo.length > 0 || !ctx.unitId || !ctx.permissoes.has("reservas.fazer"));
    if (admin && v.motivo.length < 3) throw new ErroDeNegocio("Explique o motivo do cancelamento (pelo menos 3 letras).");

    const agora = new Date();
    const hoje = hojeISO(agora, ctx.fuso);
    const agoraMin = minutosAgora(agora, ctx.fuso);
    const resultado = await mudarStatus("cancelar", v, (r) => {
      if (admin) {
        if (r.status !== "pendente" && r.status !== "confirmada" && r.status !== "bloqueada") {
          throw new ErroDeNegocio("Esta reserva já não está ativa. Atualize a página.");
        }
        return;
      }
      // Morador: só a própria casa (o servidor confere; o navegador não decide nada).
      if (!ctx.unitId || r.unitId !== ctx.unitId) throw new ErroDeNegocio("Reserva não encontrada. Atualize a página.");
      if (!podeCancelarMorador(r, hoje, agoraMin)) {
        throw new ErroDeNegocio("Só é possível cancelar reservas que ainda não começaram. Fale com a administração.");
      }
    }, ctx, admin ? undefined : (r, prazo) => desistenciaForaDoPrazo(r, prazo, hoje, agoraMin));
    const r = resultado.reserva;
    revalidarReservas();
    if (resultado.cancelamentoTardio) {
      return `Reserva cancelada: ${r.areaNome}, ${dataISOParaBR(r.data)}. ${avisoDesistenciaTardia(resultado.prazoHoras)}`;
    }
    return r.status === "bloqueada"
      ? `Bloqueio removido: ${r.areaNome}, ${dataISOParaBR(r.data)}. O horário ficou livre.`
      : `Reserva cancelada: ${r.areaNome}, ${dataISOParaBR(r.data)}. O horário ficou livre.`;
  });
}
