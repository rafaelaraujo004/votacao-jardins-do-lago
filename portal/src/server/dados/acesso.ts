import "server-only";
import { headers } from "next/headers";
import { adminAuth, adminDb } from "../firebase-admin";
import { garantirPermissao, type Contexto } from "../contexto";
import { formatarDataHora } from "@/lib/formato";
import { ehEmailDeMorador, ehUsuarioValido, situacaoLoginMorador, type SituacaoLoginMorador } from "@/lib/usuario-morador";
import { idCondominioPadrao, linkAcessoMoradores } from "@/lib/condominio-id";

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
  // E-mail sintético de morador (ex.: quem mudou de morador para equipe) não conta como acesso da equipe.
  const temSenha = Boolean(conta?.providerData.some((p) => p.providerId === "password")) && !ehEmailDeMorador(conta?.email);
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

// ======================================================================
// ACESSO DO MORADOR (usuário com código + senha)
// ======================================================================

/** Situação do login de um morador, para a página da pessoa. */
export type SituacaoAcessoMorador = {
  /** Código do usuário (ex.: "K7M4PX"); null = ainda sem acesso. */
  usuario: string | null;
  situacao: SituacaoLoginMorador;
  /** Última vez que entrou, já formatada no fuso do condomínio. */
  ultimoAcesso: string | null;
};

/** Para a página da pessoa: só quem cuida dos moradores vê. */
export async function situacaoAcessoMorador(ctx: Contexto, uid: string): Promise<SituacaoAcessoMorador> {
  garantirPermissao(ctx, "moradores.gerenciar");
  const membro = await adminDb().doc(`condominiums/${ctx.condominioId}/members/${uid}`).get();
  if (!membro.exists || membro.get("papel") !== "morador") return { usuario: null, situacao: "sem-acesso", ultimoAcesso: null };
  const dados = { usuario: membro.get("usuario"), precisaTrocarSenha: membro.get("precisaTrocarSenha") };
  const situacao = situacaoLoginMorador(dados);
  const conta = situacao === "sem-acesso" ? null : await contaDoAuth(uid);
  const ultimo = conta?.metadata.lastSignInTime;
  return {
    usuario: ehUsuarioValido(dados.usuario) ? dados.usuario : null,
    situacao,
    ultimoAcesso: ultimo ? formatarDataHora(new Date(ultimo), ctx.fuso) : null,
  };
}

/**
 * Situação do login de TODOS os moradores (uid → situação), para a lista de
 * pessoas e a página da unidade. Lê só o banco (uma consulta), sem o Firebase Auth.
 */
export async function situacoesLoginMoradores(ctx: Contexto): Promise<Map<string, SituacaoLoginMorador>> {
  garantirPermissao(ctx, "moradores.ver");
  const snap = await adminDb()
    .collection("condominiums")
    .doc(ctx.condominioId)
    .collection("members")
    .where("papel", "==", "morador")
    .select("usuario", "precisaTrocarSenha")
    .get();
  const mapa = new Map<string, SituacaoLoginMorador>();
  for (const d of snap.docs) {
    mapa.set(d.id, situacaoLoginMorador({ usuario: d.get("usuario"), precisaTrocarSenha: d.get("precisaTrocarSenha") }));
  }
  return mapa;
}

// Endereço usado se o pedido vier sem um "host" confiável.
const ENDERECO_RESERVA = "https://portal-jardins-do-lago.vercel.app";

/** Endereço base do portal a partir do próprio pedido (ex.: https://portal.exemplo.com). */
export async function enderecoDoPortal(): Promise<string> {
  const h = await headers();
  const host = (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(",")[0].trim();
  if (!/^[A-Za-z0-9.-]+(:\d{1,5})?$/.test(host)) return ENDERECO_RESERVA;
  const protoBruto = (h.get("x-forwarded-proto") ?? "").split(",")[0].trim();
  const proto = protoBruto === "http" || protoBruto === "https" ? protoBruto : host.startsWith("localhost") ? "http" : "https";
  return `${proto}://${host}`;
}

/** Link da tela de entrada do morador: "<base>/entrar" (+ "?c=<id>" se não for o condomínio padrão). */
export function linkEntrarMorador(base: string, condominioId: string): string {
  return linkAcessoMoradores(base, condominioId, idCondominioPadrao());
}
