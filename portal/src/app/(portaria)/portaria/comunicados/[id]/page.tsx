import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays } from "lucide-react";
import { exigirPermissao } from "@/server/contexto";
import { obterPublicado } from "@/server/dados/comunicados";
import { idDocumento } from "@/lib/validacao";
import { ehNovo } from "@/lib/comunicados";
import { formatarDataHora } from "@/lib/formato";
import { cx } from "@/lib/cx";
import { Cartao } from "@/components/ui/basicos";
import { EtiquetasComunicado, TextoComunicado } from "@/components/comunicados/pecas";
import { GaleriaFotos } from "@/components/fotos/galeria";

export const metadata: Metadata = { title: "Comunicado" };

/** Um comunicado publicado, para a portaria. Rascunho, arquivado ou de outro condomínio → "não encontrado". */
export default async function ComunicadoPortaria({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const valido = idDocumento.safeParse(id).success;
  const ctx = await exigirPermissao("comunicados.ver", valido ? `/portaria/comunicados/${id}` : "/portaria/comunicados");
  if (!valido) notFound();
  const c = await obterPublicado(ctx, id);
  if (!c) notFound();

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <Cartao className={cx("flex flex-col gap-3", c.prioridade === "urgente" && "border-danger")}>
        <Link href="/portaria/comunicados" className="flex min-h-11 w-fit items-center gap-1.5 font-bold text-lake">
          <ArrowLeft aria-hidden className="size-4" /> Todos os comunicados
        </Link>
        <article className="flex flex-col gap-3">
          <p className="rotulo-caixa text-plum">Comunicado da administração</p>
          <EtiquetasComunicado prioridade={c.prioridade} fixado={c.fixado} novo={ehNovo(c.publicadoEm)} />
          <h1 className="break-words text-[1.6rem] font-bold text-destaque">{c.titulo}</h1>
          {c.publicadoEm ? (
            <p className="flex items-center gap-1.5 text-[0.92rem] text-muted">
              <CalendarDays aria-hidden className="size-4" />
              Publicado em {formatarDataHora(c.publicadoEm, ctx.fuso)}
            </p>
          ) : null}
          <TextoComunicado texto={c.texto} className="mt-1" />
          <GaleriaFotos fotos={c.fotos} titulo={c.titulo} variante="pagina" className="mt-2" />
        </article>
      </Cartao>
    </div>
  );
}
