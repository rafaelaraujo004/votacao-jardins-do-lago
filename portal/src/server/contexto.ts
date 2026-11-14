/**
 * CONTEXTO DO USUÁRIO — a peça central da segurança no servidor.
 *
 * Responde, a cada pedido: quem é a pessoa, de qual condomínio, com qual
 * papel, de qual unidade e com quais permissões.
 *
 * Regra de ouro: o condomínio NUNCA vem do navegador. Ele sai do cadastro
 * da pessoa (users/{uid}.condominioAtivo) e só vale se existir um vínculo
 * ATIVO em condominiums/{c}/members/{uid}. Repare que nenhuma função aqui
 * recebe "condominioId" como parâmetro vindo de fora.
 */
import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Firestore } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "./firebase-admin";
import { NOME_COOKIE_SESSAO } from "./sessao";
import { calcularPermissoes, ehPapel, type Papel, type Permissao } from "@/lib/permissoes";
import { FUSO_PADRAO } from "@/lib/formato";

export type Contexto = {
  uid: string;
  nome: string;
  condominioId: string;
  condominioNome: string;
  fuso: string;
  papel: Papel;
  unitId: string | null;
  unidadeRotulo: string | null;
  permissoes: ReadonlySet<Permissao>;
  demo: boolean;
};

export class ErroDeAcesso extends Error {
  constructor(
    public readonly motivo: "sem-sessao" | "sem-permissao",
    mensagem: string,
  ) {
    super(mensagem);
    this.name = "ErroDeAcesso";
  }
}

/**
 * Monta o contexto a partir do uid (já verificado pelo Firebase Auth).
 * Retorna null se a pessoa não tiver vínculo ativo com um condomínio ativo.
 */
export async function carregarContexto(db: Firestore, uid: string): Promise<Contexto | null> {
  const usuario = await db.collection("users").doc(uid).get();
  if (!usuario.exists) return null;

  const condominioId = usuario.get("condominioAtivo");
  const lista = usuario.get("condominioIds");
  if (typeof condominioId !== "string" || !Array.isArray(lista) || !lista.includes(condominioId)) {
    return null;
  }

  const condominioRef = db.collection("condominiums").doc(condominioId);
  const [condominio, membro] = await Promise.all([
    condominioRef.get(),
    condominioRef.collection("members").doc(uid).get(),
  ]);

  if (!condominio.exists || condominio.get("status") !== "ativo") return null;
  if (!membro.exists || membro.get("status") !== "ativo") return null;

  const papel = membro.get("papel");
  if (!ehPapel(papel)) return null;

  const unitId = typeof membro.get("unitId") === "string" ? (membro.get("unitId") as string) : null;
  let unidadeRotulo: string | null = null;
  if (unitId) {
    const unidade = await condominioRef.collection("units").doc(unitId).get();
    unidadeRotulo = unidade.exists ? (unidade.get("rotulo") ?? null) : null;
  }

  const extras = membro.get("permissoesExtras");
  const negadas = membro.get("permissoesNegadas");

  return {
    uid,
    nome: String(membro.get("nome") ?? usuario.get("nome") ?? ""),
    condominioId,
    condominioNome: String(condominio.get("nome") ?? ""),
    fuso: String(condominio.get("fuso") ?? FUSO_PADRAO),
    papel,
    unitId,
    unidadeRotulo,
    permissoes: calcularPermissoes(
      papel,
      Array.isArray(extras) ? extras : [],
      Array.isArray(negadas) ? negadas : [],
    ),
    demo: membro.get("demo") === true,
  };
}

/** uid da sessão atual, conferindo assinatura, validade e revogação do cookie. */
export const uidDaSessao = cache(async (): Promise<string | null> => {
  const cookie = (await cookies()).get(NOME_COOKIE_SESSAO)?.value;
  if (!cookie) return null;
  try {
    const decodificado = await adminAuth().verifySessionCookie(cookie, true);
    return decodificado.uid;
  } catch {
    return null;
  }
});

/** Contexto do pedido atual (calculado uma vez por pedido). */
export const getContexto = cache(async (): Promise<Contexto | null> => {
  const uid = await uidDaSessao();
  if (!uid) return null;
  return carregarContexto(adminDb(), uid);
});

/** Para páginas: sem login → tela de entrada. */
export async function exigirContexto(): Promise<Contexto> {
  const ctx = await getContexto();
  if (!ctx) redirect("/entrar");
  return ctx;
}

/** Para páginas: sem a permissão → tela "sem acesso". */
export async function exigirPermissao(permissao: Permissao): Promise<Contexto> {
  const ctx = await exigirContexto();
  if (!ctx.permissoes.has(permissao)) redirect("/sem-acesso");
  return ctx;
}

/** Para ações e rotas: lança erro em vez de redirecionar. */
export function garantirPermissao(ctx: Contexto | null, permissao: Permissao): Contexto {
  if (!ctx) throw new ErroDeAcesso("sem-sessao", "Sua sessão terminou. Entre novamente.");
  if (!ctx.permissoes.has(permissao)) {
    throw new ErroDeAcesso("sem-permissao", "Seu perfil não permite fazer isso.");
  }
  return ctx;
}
