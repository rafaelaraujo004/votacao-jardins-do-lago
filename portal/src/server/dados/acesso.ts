import "server-only";
import { adminAuth, adminDb } from "../firebase-admin";
import { garantirPermissao, type Contexto } from "../contexto";
import { formatarDataHora } from "@/lib/formato";

/** Situação do login com e-mail e senha de uma pessoa da equipe. */
export type SituacaoAcesso = {
  /** E-mail usado para entrar (null = ainda sem acesso com senha). */
  email: string | null;
  temSenha: boolean;
  /** true = está com a senha provisória e precisa trocar no próximo acesso. */
  precisaTrocarSenha: boolean;
  /** Última vez que entrou, já formatada no fuso do condomínio. */
  ultimoAcesso: string | null;
};

/** Lê a conta no Firebase Authentication (null se ela não existir). */
async function contaDoAuth(uid: string) {
  try {
    return await adminAuth().getUser(uid);
  } catch {
    return null;
  }
}

async function precisaTrocar(ctx: Contexto, uid: string): Promise<boolean> {
  const membro = await adminDb().doc(`condominiums/${ctx.condominioId}/members/${uid}`).get();
  return membro.exists && membro.get("precisaTrocarSenha") === true;
}

const SEM_ACESSO: SituacaoAcesso = { email: null, temSenha: false, precisaTrocarSenha: false, ultimoAcesso: null };

/** Para a página da pessoa (gestão): só quem cuida da equipe vê. */
export async function situacaoDoAcesso(ctx: Contexto, uid: string): Promise<SituacaoAcesso> {
  garantirPermissao(ctx, "equipe.gerenciar");
  // Só pessoas DESTE condomínio: nunca consulta (nem mostra o e-mail de) contas de fora.
  const membro = await adminDb().doc(`condominiums/${ctx.condominioId}/members/${uid}`).get();
  if (!membro.exists) return SEM_ACESSO;
  const conta = await contaDoAuth(uid);
  const precisa = membro.get("precisaTrocarSenha") === true;
  const temSenha = Boolean(conta?.providerData.some((p) => p.providerId === "password"));
  const ultimo = conta?.metadata.lastSignInTime;
  return {
    email: temSenha ? (conta?.email ?? null) : null,
    temSenha,
    precisaTrocarSenha: precisa,
    ultimoAcesso: ultimo ? formatarDataHora(new Date(ultimo), ctx.fuso) : null,
  };
}

/** Para a tela "Trocar senha": a situação da PRÓPRIA pessoa logada. */
export async function minhaSituacaoDeAcesso(ctx: Contexto): Promise<SituacaoAcesso> {
  const [conta, precisa] = await Promise.all([contaDoAuth(ctx.uid), precisaTrocar(ctx, ctx.uid)]);
  const temSenha = Boolean(conta?.providerData.some((p) => p.providerId === "password"));
  return {
    email: temSenha ? (conta?.email ?? null) : null,
    temSenha,
    precisaTrocarSenha: precisa,
    ultimoAcesso: null,
  };
}
