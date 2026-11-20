/**
 * GET /api/financeiro/comprovantes/{lançamento}/{comprovante} — abre o comprovante de um lançamento.
 *
 * O arquivo nunca fica público. Aqui o portal confere, a cada abertura:
 * - login válido (sem login → tela de entrada, voltando para /financeiro);
 * - quem pode ver o LANÇAMENTO pode ver o comprovante: a gestão ("financeiro.ver") vê
 *   tudo; o morador ("financeiro.ver_publicado") só lançamento publicado de mês publicado.
 * Só então entrega um link temporário (5 minutos) para o arquivo no Storage.
 * No computador de testes (simulador) o próprio portal entrega o arquivo.
 * É só leitura (GET): não precisa da checagem de origem.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getContexto } from "@/server/contexto";
import { adminBalde, adminDb, usaEmuladores } from "@/server/firebase-admin";
import { lerComprovantes, REGEX_ID_COMPROVANTE } from "@/lib/comprovantes";
import { REGEX_MES } from "@/lib/financeiro";
import { linkEntrar } from "@/lib/destino-seguro";

const SEM_CACHE = { "Cache-Control": "private, no-store" };
const VALIDADE_LINK_MS = 5 * 60 * 1000;

function naoEncontrado() {
  return NextResponse.json({ erro: "Comprovante não encontrado." }, { status: 404, headers: SEM_CACHE });
}

/** "inline" abre o PDF/foto no próprio navegador; o nome vai codificado (acentos, espaços). */
function disposicao(nome: string): string {
  return `inline; filename="${nome.replace(/[^A-Za-z0-9._-]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(nome)}`;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ lancamento: string; comprovante: string }> }) {
  const ctx = await getContexto();
  if (!ctx) return NextResponse.redirect(new URL(linkEntrar("/financeiro"), req.url));
  if (ctx.precisaTrocarSenha) return NextResponse.redirect(new URL("/conta/senha", req.url));
  const completa = ctx.permissoes.has("financeiro.ver");
  if (!completa && !ctx.permissoes.has("financeiro.ver_publicado")) return naoEncontrado();

  const { lancamento, comprovante } = await params;
  if (!/^[A-Za-z0-9]{1,64}$/.test(lancamento) || !REGEX_ID_COMPROVANTE.test(comprovante)) return naoEncontrado();

  const base = adminDb().collection("condominiums").doc(ctx.condominioId);
  const doc = await base.collection("financialEntries").doc(lancamento).get();
  if (!doc.exists) return naoEncontrado();

  // Morador: o lançamento e o mês precisam estar publicados (mesma regra da lista de lançamentos).
  // Quem não pode ver recebe a MESMA resposta de "não existe" (não revela nada).
  if (!completa) {
    const mes = String(doc.get("mes") ?? "");
    if (doc.get("publicado") !== true || !REGEX_MES.test(mes)) return naoEncontrado();
    const resumo = await base.collection("monthlySummaries").doc(mes).get();
    if (resumo.get("publicado") !== true) return naoEncontrado();
  }

  const arquivo = lerComprovantes(doc.get("comprovantes")).find((c) => c.id === comprovante);
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
    console.error("Comprovante: não foi possível abrir o arquivo", lancamento, comprovante, erro);
    return NextResponse.json({ erro: "Não foi possível abrir o arquivo agora. Tente de novo." }, { status: 502, headers: SEM_CACHE });
  }
}
