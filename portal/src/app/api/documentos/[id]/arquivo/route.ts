/**
 * GET /api/documentos/{id}/arquivo — abre o ARQUIVO de um documento.
 *
 * O arquivo nunca fica público. Aqui o portal confere, a cada abertura:
 * - login válido (sem login → tela de entrada, voltando para /documentos);
 * - permissão "documentos.ver";
 * - o documento é do condomínio da sessão, está ativo e o papel da pessoa
 *   está em "Quem pode ver" (a administração vê tudo, até desativados).
 * Só então entrega um link temporário (5 minutos) para o arquivo no Storage.
 * No computador de testes (simulador) o próprio portal entrega o arquivo.
 * É só leitura (GET): não precisa da checagem de origem.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getContexto } from "@/server/contexto";
import { adminBalde, adminDb, usaEmuladores } from "@/server/firebase-admin";
import { lerArquivo } from "@/server/dados/documentos";
import { idDocumento } from "@/lib/validacao";
import { podeVerDocumento } from "@/lib/documentos";
import { linkEntrar } from "@/lib/destino-seguro";

const SEM_CACHE = { "Cache-Control": "private, no-store" };
const VALIDADE_LINK_MS = 5 * 60 * 1000;

function naoEncontrado() {
  return NextResponse.json({ erro: "Documento não encontrado." }, { status: 404, headers: SEM_CACHE });
}

/** "inline" abre o PDF/foto no próprio navegador; o nome vai codificado (acentos, espaços). */
function disposicao(nome: string): string {
  return `inline; filename="${nome.replace(/[^A-Za-z0-9._-]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(nome)}`;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getContexto();
  if (!ctx) return NextResponse.redirect(new URL(linkEntrar("/documentos"), req.url));
  if (ctx.precisaTrocarSenha) return NextResponse.redirect(new URL("/conta/senha", req.url));
  if (!ctx.permissoes.has("documentos.ver")) return naoEncontrado();

  const { id } = await params;
  if (!idDocumento.safeParse(id).success) return naoEncontrado();

  const doc = await adminDb().collection("condominiums").doc(ctx.condominioId).collection("documents").doc(id).get();
  if (!doc.exists) return naoEncontrado();

  const gerencia = ctx.permissoes.has("documentos.gerenciar");
  const visivelPara = Array.isArray(doc.get("visivelPara")) ? (doc.get("visivelPara") as unknown[]).filter((p): p is string => typeof p === "string") : [];
  const ativo = doc.get("ativo") !== false;
  // Quem não pode ver recebe a MESMA resposta de "não existe" (não revela nada).
  if (!gerencia && !podeVerDocumento({ ativo, visivelPara }, ctx.papel)) return naoEncontrado();

  const arquivo = lerArquivo(doc.get("arquivo"));
  if (!arquivo) return naoEncontrado();

  const objeto = adminBalde().file(arquivo.caminho);
  try {
    if (usaEmuladores()) {
      const [conteudo] = await objeto.download();
      return new NextResponse(new Uint8Array(conteudo), {
        headers: { ...SEM_CACHE, "Content-Type": arquivo.tipo, "Content-Disposition": disposicao(arquivo.nome) },
      });
    }
    const [link] = await objeto.getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + VALIDADE_LINK_MS,
      responseDisposition: disposicao(arquivo.nome),
      responseType: arquivo.tipo,
    });
    return NextResponse.redirect(link, { status: 302, headers: SEM_CACHE });
  } catch (erro) {
    console.error("Documento: não foi possível abrir o arquivo", id, erro);
    return NextResponse.json({ erro: "Não foi possível abrir o arquivo agora. Tente de novo." }, { status: 502, headers: SEM_CACHE });
  }
}
