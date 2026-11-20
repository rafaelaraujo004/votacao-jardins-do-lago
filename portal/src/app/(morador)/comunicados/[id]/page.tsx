import type { Metadata } from "next";
import { LinkVoltarFaixa } from "@/components/ui/link-voltar";
import { notFound } from "next/navigation";
import { CalendarDays } from "lucide-react";
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

/** Um comunicado publicado. Rascunho, arquivado ou de outro condomínio → "não encontrado". */
export default async function ComunicadoMorador({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const valido = idDocumento.safeParse(id).success;
  const ctx = await exigirPermissao("comunicados.ver", valido ? `/comunicados/${id}` : "/comunicados");
  if (!valido) notFound();
  const c = await obterPublicado(ctx, id);
  if (!c) notFound();

  return (
    <div className="flex flex-col gap-5">
      <LinkVoltarFaixa href="/comunicados">Todos os comunicados</LinkVoltarFaixa>

      <Cartao className={cx(c.prioridade === "urgente" && "border-danger")}>
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
