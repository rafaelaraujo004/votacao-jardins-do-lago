import { cookies } from "next/headers";
import {
  comprovantePorCodigo,
  cookieDoLink,
  limparCodigo,
} from "@/server/dados/votacao-links";
import { pdfComprovante } from "@/lib/pdf-simples";
import { formatarDataHora } from "@/lib/formato";

/**
 * Baixa o COMPROVANTE DE VOTAÇÃO da casa (link de voto). Só com a senha do link já digitada
 * (cookie) e só se a casa já votou. O comprovante não mostra o voto.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ codigo: string }> },
) {
  const { codigo: bruto } = await params;
  let texto = bruto;
  try {
    texto = decodeURIComponent(bruto);
  } catch {
    /* inválido */
  }
  const codigo = limparCodigo(texto);
  if (!codigo) return new Response("Link inválido.", { status: 404 });
  if (codigo !== bruto)
    return Response.redirect(
      new URL(`/votar/${codigo}/comprovante`, _req.url),
      303,
    );
  const senhaHash = (await cookies()).get(cookieDoLink(codigo))?.value ?? null;
  const c = await comprovantePorCodigo(codigo, senhaHash);
  if (!c) return Response.redirect(new URL(`/votar/${codigo}`, _req.url), 303);
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
      "X-Robots-Tag": "noindex",
    },
  });
}
