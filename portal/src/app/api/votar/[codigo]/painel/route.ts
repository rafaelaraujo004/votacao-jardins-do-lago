/**
 * GET /api/votar/{código}/painel — o PAINEL AO VIVO da votação para quem só tem o LINK DE VOTO
 * (sem login no portal): fase, quantas casas votaram e quantas faltam e, depois do
 * encerramento, o resultado. Vem junto só se a PRÓPRIA casa do link já votou (nunca o voto).
 *
 * SIGILO: o mesmo painel público do Início (só números do condomínio inteiro). Nunca QUAIS
 * casas votaram, nunca parcial de votos.
 * Abuso: código que não existe conta no limite do endereço (o mesmo da página do link);
 * código certo nunca é barrado (muitas casas usam o mesmo endereço de internet).
 */
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { adminDb } from "@/server/firebase-admin";
import { LIMITE_IP, contarErroDoIp, ipEstourado, limparCodigo, painelPorCodigo } from "@/server/dados/votacao-links";

export const dynamic = "force-dynamic";

const SEM_CACHE = { "Cache-Control": "private, no-store" };

async function ipDoPedido(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "desconhecido";
}

export async function GET(_: Request, { params }: { params: Promise<{ codigo: string }> }) {
  const { codigo: bruto } = await params;
  const codigo = limparCodigo(bruto);
  try {
    const r = codigo ? await painelPorCodigo(codigo) : null;
    if (!r) {
      const ip = await ipDoPedido();
      if (await ipEstourado(adminDb(), LIMITE_IP.linkInvalido, ip))
        return NextResponse.json({ erro: "Muitas tentativas." }, { status: 429, headers: SEM_CACHE });
      await contarErroDoIp(adminDb(), LIMITE_IP.linkInvalido, ip);
      return NextResponse.json({ painel: null, casa: null, agora: Date.now() }, { status: 404, headers: SEM_CACHE });
    }
    return NextResponse.json({ painel: r.painel, casa: r.casa, agora: Date.now() }, { headers: SEM_CACHE });
  } catch (e) {
    console.error("[votar/painel] erro ao montar o painel", e);
    return NextResponse.json({ erro: "Tente de novo." }, { status: 503, headers: SEM_CACHE });
  }
}
