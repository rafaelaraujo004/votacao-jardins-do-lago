import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { exigirPermissao } from "@/server/contexto";
import { filaModeracao } from "@/server/dados/classificados";
import { CabecalhoPagina } from "@/components/ui/painel";
import { FilaDeModeracao } from "@/components/classificados/fila-moderacao";

export const metadata: Metadata = { title: "Moderar classificados" };

/**
 * Moderação dentro da área do morador: para o morador que recebeu do síndico a
 * permissão extra "Moderar classificados" (ele não entra no painel /admin).
 */
export default async function ModerarClassificados() {
  const ctx = await exigirPermissao("classificados.moderar", "/classificados/moderar");
  const agora = new Date();
  const fila = await filaModeracao(ctx, agora);

  return (
    <div className="flex flex-col gap-5">
      <Link href="/classificados" className="flex min-h-11 w-fit items-center gap-1.5 font-bold text-lake">
        <ArrowLeft aria-hidden className="size-4" /> Classificados
      </Link>
      <CabecalhoPagina
        sobretitulo="Moderação"
        titulo="Moderar classificados"
        subtitulo="Aprove os anúncios que seguem as regras do condomínio. Ao não aprovar ou remover, explique o motivo: o autor vai ler."
      />
      <FilaDeModeracao fila={fila} fuso={ctx.fuso} agora={agora} />
    </div>
  );
}
