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
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { Firestore } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "./firebase-admin";
import { NOME_COOKIE_SESSAO } from "./sessao";
import { calcularPermissoes, ehPapel, type Papel, type Permissao } from "@/lib/permissoes";
import { FUSO_PADRAO } from "@/lib/formato";
import { linkEntrar } from "@/lib/destino-seguro";
import { CABECALHO_CAMINHO, telaEquivalente } from "@/lib/modulos";

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
  /** Equipe com senha provisória: precisa trocar antes de usar o portal. */
  precisaTrocarSenha: boolean;
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
    precisaTrocarSenha: membro.get("precisaTrocarSenha") === true,
  };
}

/**
 * Rapidez entre telas: a assinatura e a validade do cookie são conferidas em
 * TODO pedido (é local, sem rede). Já a consulta de "sessão revogada" exige
 * uma ida ao Firebase Auth; por isso ela é refeita no máximo a cada 2 minutos
 * por cookie, em cada servidor. Suspender alguém continua valendo na hora,
 * porque carregarContexto confere o status do vínculo a cada pedido.
 */
const REVOGACAO_CONFERIDA_MS = 2 * 60 * 1000;
const revogacaoConferidaEm = new Map<string, number>();

/** uid da sessão atual, conferindo assinatura, validade e revogação do cookie. */
export const uidDaSessao = cache(async (): Promise<string | null> => {
  const cookie = (await cookies()).get(NOME_COOKIE_SESSAO)?.value;
  if (!cookie) return null;
  try {
    const agora = Date.now();
    const conferidoEm = revogacaoConferidaEm.get(cookie);
    const conferirRevogacao = conferidoEm === undefined || agora - conferidoEm > REVOGACAO_CONFERIDA_MS;
    const decodificado = await adminAuth().verifySessionCookie(cookie, conferirRevogacao);
    if (conferirRevogacao) {
      if (revogacaoConferidaEm.size > 5000) revogacaoConferidaEm.clear();
      revogacaoConferidaEm.set(cookie, agora);
    }
    return decodificado.uid;
  } catch {
    revogacaoConferidaEm.delete(cookie);
    return null;
  }
});

/** Contexto do pedido atual (calculado uma vez por pedido). */
export const getContexto = cache(async (): Promise<Contexto | null> => {
  const uid = await uidDaSessao();
  if (!uid) return null;
  return carregarContexto(adminDb(), uid);
});

/**
 * Para páginas: sem login → tela de entrada; com senha provisória → troca de senha.
 * `volta`: caminho interno para onde voltar depois de entrar (ex.: "/visitas").
 * (A tela /conta/senha usa getContexto, e não esta função, para não ficar em laço.)
 */
export async function exigirContexto(volta?: string): Promise<Contexto> {
  const ctx = await getContexto();
  if (!ctx) redirect(linkEntrar(volta));
  if (ctx.precisaTrocarSenha) redirect("/conta/senha");
  return ctx;
}

/** Caminho da página pedida (o src/proxy.ts anota no cabeçalho). */
async function caminhoDoPedido(): Promise<string | null> {
  const caminho = (await headers()).get(CABECALHO_CAMINHO);
  return caminho && caminho.startsWith("/") && !caminho.startsWith("//") ? caminho : null;
}

/**
 * Para páginas: sem login → /entrar?volta=...; sem a permissão → a versão do mesmo módulo
 * para o perfil da pessoa (ex.: morador abrindo /admin/reservas → /reservas) ou, se não
 * houver, a tela "sem acesso". Veja src/lib/modulos.ts.
 */
export async function exigirPermissao(permissao: Permissao, volta?: string): Promise<Contexto> {
  const ctx = await exigirContexto(volta);
  if (!ctx.permissoes.has(permissao)) {
    const caminho = await caminhoDoPedido();
    redirect((caminho && telaEquivalente(caminho, ctx.papel, ctx.permissoes)) || "/sem-acesso");
  }
  return ctx;
}

/**
 * Para a moldura da área do MORADOR: a equipe que abre um link de módulo (ex.: o síndico
 * abrindo /reservas) vai para a versão desse módulo na própria área (/admin/reservas).
 * Telas sem versão na área da equipe (ex.: /mapa) continuam abrindo para quem tem permissão.
 */
export async function exigirAreaDoMorador(): Promise<Contexto> {
  const ctx = await exigirPermissao("area.morador");
  if (ctx.papel !== "morador") {
    const caminho = await caminhoDoPedido();
    const outra = caminho ? telaEquivalente(caminho, ctx.papel, ctx.permissoes) : null;
    if (outra) redirect(outra);
  }
  return ctx;
}

/** Para ações e rotas: lança erro em vez de redirecionar. */
export function garantirPermissao(ctx: Contexto | null, permissao: Permissao): Contexto {
  if (!ctx) throw new ErroDeAcesso("sem-sessao", "Sua sessão terminou. Entre novamente.");
  // Senha provisória: nada é gravado até a pessoa criar a própria senha.
  if (ctx.precisaTrocarSenha) {
    throw new ErroDeAcesso("sem-permissao", "Troque a sua senha provisória antes de continuar.");
  }
  if (!ctx.permissoes.has(permissao)) {
    throw new ErroDeAcesso("sem-permissao", "Seu perfil não permite fazer isso.");
  }
  return ctx;
}
