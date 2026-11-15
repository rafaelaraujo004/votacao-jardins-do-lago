"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { adminDb } from "./firebase-admin";
import { getContexto } from "./contexto";
import { auditarSozinho } from "./auditoria";
import { NOME_COOKIE_SESSAO } from "./sessao";
import { idCondominioPadrao, sufixoDoId } from "@/lib/condominio-id";

/**
 * Sair: apaga o cookie de sessão deste aparelho e registra na auditoria.
 * É uma Server Action: o Next.js já recusa chamadas vindas de outros sites.
 */
export async function sair(): Promise<void> {
  const ctx = await getContexto();
  if (ctx) {
    await auditarSozinho(adminDb(), {
      condominioId: ctx.condominioId,
      uid: ctx.uid,
      nome: ctx.nome,
      papel: ctx.papel,
      acao: "sessao.sair",
    });
  }
  (await cookies()).delete(NOME_COOKIE_SESSAO);
  // Mantém o ?c= do condomínio da pessoa na tela de entrada: o login do morador depende dele.
  const sufixo = ctx ? sufixoDoId(ctx.condominioId, idCondominioPadrao()) : "";
  redirect(sufixo ? `/entrar?saiu=1&${sufixo.slice(1)}` : "/entrar?saiu=1");
}
