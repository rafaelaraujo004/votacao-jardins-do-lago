/**
 * GET /api/fotos/{módulo}/{id}/{n} — entrega a n-ª foto de um anúncio, comunicado ou área de lazer.
 *
 * A foto nunca fica pública. A cada pedido o portal confere:
 * - login válido;
 * - CLASSIFICADO: publicado e dentro do prazo (quem usa os classificados), ou do
 *   próprio autor (em qualquer situação), ou de quem modera os classificados;
 * - COMUNICADO: publicado (quem vê comunicados), ou de quem publica comunicados
 *   (vê rascunhos e arquivados);
 * - ÁREA DE LAZER: ativa (quem reserva ou vê a agenda), ou de quem configura as áreas.
 * Quem não pode ver recebe a MESMA resposta de "não existe".
 * Só então entrega um link temporário (10 minutos) para a foto no Storage.
 * No computador de testes (simulador) o próprio portal entrega a foto.
 * É só leitura (GET): não precisa da checagem de origem.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getContexto } from "@/server/contexto";
import { adminBalde, adminDb, usaEmuladores } from "@/server/firebase-admin";
import { idDocumento } from "@/lib/validacao";
import { ehModuloFoto, lerFotos, PASTA_DO_MODULO, type ModuloFoto } from "@/lib/fotos";
import { ehStatusClassificado, estaVisivel } from "@/lib/classificados";
import type { Contexto } from "@/server/contexto";
import type { DocumentData, Timestamp } from "firebase-admin/firestore";

const VALIDADE_LINK_MS = 10 * 60 * 1000;
/** O navegador guarda a resposta por 5 minutos (só neste aparelho). */
const CACHE_CURTO = { "Cache-Control": "private, max-age=300" };
const SEM_CACHE = { "Cache-Control": "private, no-store" };

function naoEncontrada() {
  return NextResponse.json({ erro: "Foto não encontrada." }, { status: 404, headers: SEM_CACHE });
}

const data = (v: unknown): Date | null => (v as Timestamp | undefined)?.toDate?.() ?? null;

/** A pessoa pode ver este anúncio, comunicado ou área? */
function podeVer(modulo: ModuloFoto, d: DocumentData, ctx: Contexto): boolean {
  if (modulo === "areas") {
    if (ctx.permissoes.has("areas.configurar")) return true;
    const vejoAgenda = ctx.permissoes.has("reservas.fazer") || ctx.permissoes.has("reservas.ver_todas") || ctx.permissoes.has("area.morador");
    return vejoAgenda && d.ativa !== false;
  }
  if (modulo === "comunicados") {
    if (ctx.permissoes.has("comunicados.publicar")) return true;
    return ctx.permissoes.has("comunicados.ver") && d.status === "publicado";
  }
  if (ctx.permissoes.has("classificados.moderar")) return true;
  if (!ctx.permissoes.has("classificados.usar")) return false;
  if (d.autorUid === ctx.uid) return true;
  return ehStatusClassificado(d.status) && estaVisivel(d.status, data(d.expiraEm), new Date());
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ modulo: string; id: string; indice: string }> }) {
  const ctx = await getContexto();
  if (!ctx || ctx.precisaTrocarSenha) {
    return NextResponse.json({ erro: "Entre no portal para ver a foto." }, { status: 401, headers: SEM_CACHE });
  }

  const { modulo, id, indice } = await params;
  if (!ehModuloFoto(modulo) || !idDocumento.safeParse(id).success || !/^\d$/.test(indice)) return naoEncontrada();

  const doc = await adminDb().collection("condominiums").doc(ctx.condominioId).collection(PASTA_DO_MODULO[modulo]).doc(id).get();
  const d = doc.data();
  if (!d || !podeVer(modulo, d, ctx)) return naoEncontrada();

  const foto = lerFotos(d.fotos, ctx.condominioId, modulo)[Number(indice)];
  if (!foto) return naoEncontrada();

  const objeto = adminBalde().file(foto.caminho);
  try {
    if (usaEmuladores()) {
      const [conteudo] = await objeto.download();
      return new NextResponse(new Uint8Array(conteudo), {
        headers: { ...CACHE_CURTO, "Content-Type": foto.tipo, "X-Content-Type-Options": "nosniff" },
      });
    }
    const [link] = await objeto.getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + VALIDADE_LINK_MS,
      responseType: foto.tipo,
    });
    return NextResponse.redirect(link, { status: 302, headers: CACHE_CURTO });
  } catch (erro) {
    console.error("Foto: não foi possível entregar", modulo, id, indice, erro);
    return NextResponse.json({ erro: "Não foi possível abrir a foto agora." }, { status: 502, headers: SEM_CACHE });
  }
}
