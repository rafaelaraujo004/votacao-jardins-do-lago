/**
 * GET /api/sinais — "o que mudou no condomínio?" para as telas abertas se atualizarem sozinhas.
 * Responde só a hora da última mudança de cada módulo (nenhum dado pessoal).
 * Exige login; o condomínio vem da sessão. É só leitura (GET): não precisa da checagem de origem.
 * Veja src/lib/sincronizacao.ts.
 */
import { NextResponse } from "next/server";
import { uidDaSessao } from "@/server/contexto";
import { sinaisDaPessoa } from "@/server/dados/sinais";

export const dynamic = "force-dynamic";

const SEM_CACHE = { "Cache-Control": "no-store, max-age=0" };

export async function GET() {
  const uid = await uidDaSessao();
  if (!uid) return NextResponse.json({ erro: "Entre no portal." }, { status: 401, headers: SEM_CACHE });
  try {
    const sinais = await sinaisDaPessoa(uid);
    if (!sinais) return NextResponse.json({ erro: "Sem acesso ativo." }, { status: 403, headers: SEM_CACHE });
    return NextResponse.json({ sinais }, { headers: SEM_CACHE });
  } catch (e) {
    console.error("[sinais] erro ao ler", e);
    return NextResponse.json({ erro: "Tente de novo." }, { status: 503, headers: SEM_CACHE });
  }
}
