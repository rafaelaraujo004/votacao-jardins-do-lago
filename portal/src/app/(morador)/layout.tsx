import { exigirPermissao } from "@/server/contexto";
import { FaixaTopo } from "@/components/layout/faixa-topo";
import { NavMorador } from "@/components/layout/navegacao";

/** Moldura da área do morador. Só entra quem tem a permissão "area.morador". */
export default async function LayoutMorador({ children }: LayoutProps<"/">) {
  const ctx = await exigirPermissao("area.morador");
  const subtitulo = [ctx.nome, ctx.unidadeRotulo].filter(Boolean).join(" · ");

  return (
    <div className="min-h-dvh pb-28 lg:pb-10">
      <FaixaTopo titulo={ctx.condominioNome} subtitulo={subtitulo} demo={ctx.demo} />
      <div className="relative mx-auto -mt-12 grid max-w-5xl gap-6 px-3 sm:px-4 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-4 lg:self-start lg:rounded-[var(--radius-card)] lg:border lg:border-borda-luz lg:bg-surface lg:p-2 lg:shadow-card">
          <NavMorador />
        </aside>
        <main id="conteudo" className="min-w-0">
          {children}
        </main>
      </div>
    </div>
  );
}
