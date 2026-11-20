/**
 * GET /api/notificacoes — a lista do sino de quem está logado (veja src/lib/notificacoes.ts).
 * Exige login; o condomínio e as permissões vêm da sessão. É só leitura (GET).
 */
import { NextResponse } from "next/server";
import { getContexto } from "@/server/contexto";
import { lerVistasEm, notificacoesDaPessoa } from "@/server/dados/notificacoes";

export const dynamic = "force-dynamic";

const SEM_CACHE = { "Cache-Control": "private, no-store" };

export async function GET() {
  const ctx = await getContexto();
  if (!ctx) return NextResponse.json({ erro: "Entre no portal." }, { status: 401, headers: SEM_CACHE });
  if (ctx.precisaTrocarSenha) return NextResponse.json({ erro: "Troque a senha provisória." }, { status: 403, headers: SEM_CACHE });
  try {
    const [itens, vistasEm] = await Promise.all([notificacoesDaPessoa(ctx), lerVistasEm(ctx)]);
    return NextResponse.json({ itens, vistasEm, fuso: ctx.fuso, agora: Date.now() }, { headers: SEM_CACHE });
  } catch (e) {
    console.error("[notificacoes] erro ao montar o sino", e);
    return NextResponse.json({ erro: "Tente de novo." }, { status: 503, headers: SEM_CACHE });
  }
}
