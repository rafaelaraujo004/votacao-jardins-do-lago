import { exigirPermissao } from "@/server/contexto";
import { FaixaTopo } from "@/components/layout/faixa-topo";

/** Moldura da portaria: tela larga, pensada para tablet e computador. */
export default async function LayoutPortaria({ children }: LayoutProps<"/">) {
  const ctx = await exigirPermissao("area.portaria");
  return (
    <div className="min-h-dvh pb-10">
      <FaixaTopo titulo="Portaria" subtitulo={`${ctx.condominioNome} · ${ctx.nome}`} demo={ctx.demo} largura="max-w-6xl" />
      <main id="conteudo" className="relative mx-auto -mt-12 max-w-6xl px-3 sm:px-4">
        {children}
      </main>
    </div>
  );
}
