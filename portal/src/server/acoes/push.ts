"use server";

/**
 * Ações das notificações no celular (Web Push). Veja src/lib/push.ts.
 * - chavePublicaPush: a chave pública que o navegador usa para se inscrever;
 * - salvarInscricaoPush: guarda a inscrição deste aparelho para quem está logado;
 * - removerInscricaoPush: tira a inscrição (desligou as notificações neste aparelho).
 * Não entram na auditoria (não mudam nada para as outras pessoas).
 */
import { headers } from "next/headers";
import { getContexto } from "../contexto";
import { apagarInscricao, chavesPush, guardarInscricao } from "../push";
import { esquemaInscricao } from "@/lib/push";

export async function chavePublicaPush(): Promise<string | null> {
  const ctx = await getContexto();
  if (!ctx || ctx.precisaTrocarSenha) return null;
  try {
    return (await chavesPush()).publicKey;
  } catch (erro) {
    console.error("chavePublicaPush", erro);
    return null;
  }
}

export async function salvarInscricaoPush(bruto: unknown): Promise<{ ok: boolean }> {
  const ctx = await getContexto();
  if (!ctx || ctx.precisaTrocarSenha) return { ok: false };
  const r = esquemaInscricao.safeParse(bruto);
  if (!r.success) return { ok: false };
  try {
    const navegador = (await headers()).get("user-agent") ?? "";
    await guardarInscricao(ctx.condominioId, ctx.uid, r.data, navegador);
    return { ok: true };
  } catch (erro) {
    console.error("salvarInscricaoPush", erro);
    return { ok: false };
  }
}

export async function removerInscricaoPush(endpoint: unknown): Promise<{ ok: boolean }> {
  const ctx = await getContexto();
  if (!ctx || typeof endpoint !== "string" || endpoint.length > 2000) return { ok: false };
  try {
    await apagarInscricao(ctx.condominioId, ctx.uid, endpoint);
    return { ok: true };
  } catch (erro) {
    console.error("removerInscricaoPush", erro);
    return { ok: false };
  }
}
