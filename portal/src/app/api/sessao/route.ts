/**
 * POST /api/sessao — transforma um login do Firebase em sessão no portal.
 *
 * Passos (cada um pode recusar o pedido):
 * 1. o pedido vem do próprio portal (origem);
 * 2. App Check válido (quando ligado);
 * 3. limite de tentativas por IP;
 * 4. dados no formato certo;
 * 5. token do Firebase válido, recente e não revogado;
 * 6. a pessoa tem vínculo ATIVO com um condomínio ATIVO;
 * 7. cria o cookie de sessão e registra na auditoria.
 */
import { NextResponse, type NextRequest } from "next/server";
import { adminAuth, adminDb } from "@/server/firebase-admin";
import { carregarContexto } from "@/server/contexto";
import { appCheckValido } from "@/server/app-check";
import { consumirTentativa } from "@/server/rate-limit";
import { ipDoPedido, mesmaOrigem } from "@/server/seguranca";
import { auditarSozinho } from "@/server/auditoria";
import {
  DURACAO_SESSAO_MS,
  IDADE_MAXIMA_LOGIN_S,
  NOME_COOKIE_SESSAO,
  opcoesDoCookie,
} from "@/server/sessao";
import { pedidoSessao } from "@/lib/validacao";
import { inicioDoPapel } from "@/lib/permissoes";

function erro(status: number, mensagem: string) {
  return NextResponse.json({ erro: mensagem }, { status });
}

export async function POST(req: NextRequest) {
  if (!mesmaOrigem(req)) return erro(403, "Pedido recusado. Abra o portal pelo endereço oficial e tente de novo.");
  if (!(await appCheckValido(req))) return erro(401, "Não conseguimos confirmar este aparelho. Atualize a página e tente de novo.");

  const db = adminDb();
  const tentativa = await consumirTentativa(db, "sessao", ipDoPedido(req), 10, 5 * 60);
  if (!tentativa.permitido) return erro(429, "Muitas tentativas seguidas. Aguarde 5 minutos e tente de novo.");

  const corpo = pedidoSessao.safeParse(await req.json().catch(() => null));
  if (!corpo.success) return erro(400, "Pedido incompleto. Atualize a página e tente de novo.");

  let uid: string;
  try {
    const token = await adminAuth().verifyIdToken(corpo.data.idToken, true);
    if (Date.now() / 1000 - token.auth_time > IDADE_MAXIMA_LOGIN_S) {
      return erro(401, "Seu login expirou. Entre novamente.");
    }
    uid = token.uid;
  } catch {
    return erro(401, "Não foi possível confirmar seu acesso. Entre novamente.");
  }

  const ctx = await carregarContexto(db, uid);
  if (!ctx) {
    return erro(403, "Sua conta ainda não está ligada a uma casa ou está suspensa. Fale com a administração do condomínio.");
  }

  const cookie = await adminAuth().createSessionCookie(corpo.data.idToken, { expiresIn: DURACAO_SESSAO_MS });

  await auditarSozinho(db, {
    condominioId: ctx.condominioId,
    uid: ctx.uid,
    nome: ctx.nome,
    papel: ctx.papel,
    acao: "sessao.entrar",
  });

  const resposta = NextResponse.json({ destino: inicioDoPapel(ctx.papel) });
  resposta.cookies.set(NOME_COOKIE_SESSAO, cookie, opcoesDoCookie(DURACAO_SESSAO_MS / 1000));
  return resposta;
}
