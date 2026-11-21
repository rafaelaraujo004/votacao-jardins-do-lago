/**
 * GET /api/eleicoes/finalizar — ROTINA DE RESERVA da divulgação do resultado.
 *
 * Normalmente o resultado é divulgado sozinho poucos segundos depois do encerramento
 * (+ 2 minutos de carência), pela primeira tela que abrir a votação (garantirFinalizacao).
 * Esta rotina roda uma vez por dia, às 18h05 de Belém (21h05 UTC, vercel.json → crons), para o caso raro de ninguém abrir o
 * portal depois do encerramento: divulga o resultado e manda o aviso a todos.
 *
 * Segurança: se CRON_SECRET estiver configurado na Vercel, só aceita o pedido com
 * "Authorization: Bearer <CRON_SECRET>" (a Vercel manda sozinha). Sem CRON_SECRET, aceita, mas
 * no máximo uma vez por minuto em cada servidor. Não devolve nenhum dado: só quantas divulgou.
 * Repetir não faz mal: cada eleição só é divulgada uma vez.
 */
import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { finalizarPendentes } from "@/server/dados/eleicoes";

export const dynamic = "force-dynamic";

const SEM_CACHE = { "Cache-Control": "no-store" };
let ultimaSemSegredo = 0;

function autorizado(req: NextRequest): boolean {
  const segredo = process.env.CRON_SECRET;
  if (!segredo) {
    const agora = Date.now();
    if (agora - ultimaSemSegredo < 60_000) return false;
    ultimaSemSegredo = agora;
    return true;
  }
  const recebido = Buffer.from(req.headers.get("authorization") ?? "");
  const esperado = Buffer.from(`Bearer ${segredo}`);
  return recebido.length === esperado.length && timingSafeEqual(recebido, esperado);
}

export async function GET(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ erro: "Não autorizado." }, { status: 401, headers: SEM_CACHE });
  try {
    const divulgadas = await finalizarPendentes();
    return NextResponse.json({ divulgadas }, { headers: SEM_CACHE });
  } catch (e) {
    console.error("[eleicoes/finalizar] erro na rotina", e);
    return NextResponse.json({ erro: "Tente de novo." }, { status: 503, headers: SEM_CACHE });
  }
}
