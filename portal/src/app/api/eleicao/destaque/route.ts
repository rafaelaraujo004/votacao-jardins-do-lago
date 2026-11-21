/**
 * GET /api/eleicao/destaque — o PAINEL da votação oficial que aparece no topo do Início de
 * TODOS (moradores e equipe): fase, quantas casas votaram e quantas faltam e, depois do
 * encerramento, o resultado. Veja PainelEleicao em src/lib/eleicoes.ts.
 *
 * SIGILO: só números do condomínio inteiro. Nunca QUAIS casas votaram (o mapa é só da
 * comissão) e nunca parcial de votos (a soma só existe depois do encerramento).
 * Para o morador, vem junto a situação da PRÓPRIA casa (votou / bloqueada), nunca o voto.
 *
 * Exige login; o condomínio vem da sessão. A tela pergunta quando o sinal "eleicoes" muda
 * (a cada voto) e nas viradas de fase (abriu, encerrou, saiu o resultado).
 */
import { NextResponse } from "next/server";
import { getContexto } from "@/server/contexto";
import { painelEmDestaqueGuardado, situacaoDaCasa } from "@/server/dados/eleicoes";

export const dynamic = "force-dynamic";

const SEM_CACHE = { "Cache-Control": "private, no-store" };

export async function GET() {
  const ctx = await getContexto();
  if (!ctx) return NextResponse.json({ erro: "Entre no portal." }, { status: 401, headers: SEM_CACHE });
  if (ctx.precisaTrocarSenha) return NextResponse.json({ erro: "Troque a senha provisória." }, { status: 403, headers: SEM_CACHE });
  try {
    const destaque = await painelEmDestaqueGuardado(ctx.condominioId);
    if (!destaque) return NextResponse.json({ painel: null, casa: null, agora: Date.now() }, { headers: SEM_CACHE });
    // A situação da casa só importa para quem vota e enquanto dá para votar.
    const casa =
      ctx.permissoes.has("eleicoes.votar") && ctx.unitId && destaque.painel.fase !== "resultado"
        ? await situacaoDaCasa(ctx, destaque.eleicao)
        : null;
    return NextResponse.json({ painel: destaque.painel, casa, agora: Date.now() }, { headers: SEM_CACHE });
  } catch (e) {
    console.error("[eleicao/destaque] erro ao montar o painel", e);
    return NextResponse.json({ erro: "Tente de novo." }, { status: 503, headers: SEM_CACHE });
  }
}
