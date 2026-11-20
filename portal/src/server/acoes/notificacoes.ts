"use server";

/**
 * "Vi as notificações": grava a hora em que a pessoa abriu o sino (ou a página
 * de notificações). O que acontecer depois disso volta a aparecer como "Novo".
 * Não entra na auditoria (é como marcar um e-mail como lido).
 */
import { getContexto } from "../contexto";
import { gravarVistasAgora } from "../dados/notificacoes";

export async function marcarNotificacoesVistas(): Promise<{ ok: boolean; vistasEm: number | null }> {
  try {
    const ctx = await getContexto();
    if (!ctx || ctx.precisaTrocarSenha) return { ok: false, vistasEm: null };
    await gravarVistasAgora(ctx);
    return { ok: true, vistasEm: Date.now() };
  } catch (erro) {
    console.error("marcarNotificacoesVistas", erro);
    return { ok: false, vistasEm: null };
  }
}
