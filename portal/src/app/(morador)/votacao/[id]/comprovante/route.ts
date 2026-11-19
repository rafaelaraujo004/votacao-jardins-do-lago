import { getContexto } from "@/server/contexto";
import { comprovanteDaCasa } from "@/server/dados/eleicoes";
import { pdfComprovante } from "@/lib/pdf-simples";
import { formatarDataHora } from "@/lib/formato";
import { idDocumento } from "@/lib/validacao";

/** Comprovante de votação do morador logado (a casa vem da sessão). Não mostra o voto. */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ctx = await getContexto();
  if (
    !ctx ||
    !ctx.permissoes.has("eleicoes.votar") ||
    !ctx.unitId ||
    !idDocumento.safeParse(id).success
  ) {
    return new Response("Sem acesso.", { status: 403 });
  }
  const c = await comprovanteDaCasa(ctx.condominioId, id, ctx.unitId);
  if (!c) return Response.redirect(new URL(`/votacao/${id}`, req.url), 303);
  const pdf = pdfComprovante({
    condominioNome: c.condominioNome,
    titulo: c.titulo,
    cargo: c.cargo,
    casa: c.casa,
    quando: c.votouEm ? formatarDataHora(c.votouEm, c.fuso) : "—",
    codigo: c.codigo,
    geradoEm: formatarDataHora(new Date(), c.fuso),
  });
  const nome = `comprovante-votacao-${c.casa.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf`;
  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${nome}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
