/**
 * POST /api/demo/entrar — SÓ NO COMPUTADOR LOCAL, com o simulador.
 *
 * Entrega um "token personalizado" de um usuário fictício. O navegador usa
 * esse token para entrar no Firebase Auth (simulado) e depois segue o MESMO
 * caminho de um login real: POST /api/sessao.
 *
 * Fora do simulador, ou em build de produção, responde 404 como se não existisse.
 */
import { NextResponse, type NextRequest } from "next/server";
import { demoAtivo } from "@/server/demo";
import { adminAuth, adminDb } from "@/server/firebase-admin";
import { mesmaOrigem } from "@/server/seguranca";
import { pedidoDemo } from "@/lib/validacao";
import { USUARIOS_DEMO } from "@/lib/demo";

export async function POST(req: NextRequest) {
  if (!demoAtivo()) return new NextResponse(null, { status: 404 });
  if (!mesmaOrigem(req)) return NextResponse.json({ erro: "Pedido recusado." }, { status: 403 });

  const corpo = pedidoDemo.safeParse(await req.json().catch(() => null));
  if (!corpo.success) return NextResponse.json({ erro: "Perfil inválido." }, { status: 400 });

  const usuario = USUARIOS_DEMO[corpo.data.perfil];
  const existe = await adminDb().collection("users").doc(usuario.uid).get();
  if (!existe.exists) {
    return NextResponse.json(
      { erro: "Dados de demonstração não encontrados. Rode: npm run semear" },
      { status: 409 },
    );
  }

  const token = await adminAuth().createCustomToken(usuario.uid);
  return NextResponse.json({ token });
}
