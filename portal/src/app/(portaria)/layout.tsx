import { exigirPermissao } from "@/server/contexto";
import { FaixaTopo } from "@/components/layout/faixa-topo";
import { Sincronizar } from "@/components/layout/sincronizar";
import { horaDaMontagem } from "@/lib/sincronizacao";

/**
 * Moldura da portaria: tela larga, pensada para tablet e computador.
 * A portaria pergunta "o que mudou?" mais vezes (15 s): o visitante pode chegar
 * logo depois de o morador autorizar.
 */
export default async function LayoutPortaria({ children }: LayoutProps<"/">) {
  const ctx = await exigirPermissao("area.portaria");
  return (
    <div className="min-h-dvh pb-10">
      <FaixaTopo titulo="Portaria" subtitulo={`${ctx.condominioNome} · ${ctx.nome}`} demo={ctx.demo} largura="max-w-6xl" contaHref="/conta/senha" />
      <main id="conteudo" className="relative mx-auto -mt-12 max-w-6xl px-3 sm:px-4">
        {children}
      </main>
      <Sincronizar montadaEm={horaDaMontagem()} intervaloSegundos={15} maximoMinutos={10} />
    </div>
  );
}
