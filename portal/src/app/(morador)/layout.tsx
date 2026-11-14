import { exigirPermissao, type Contexto } from "@/server/contexto";
import { NOME_DO_PAPEL } from "@/lib/permissoes";
import { FaixaTopo } from "@/components/layout/faixa-topo";
import { NavMorador } from "@/components/layout/navegacao";

/** Texto curto do topo: "Casa 12" para o morador, o perfil para a equipe. */
function rotuloDaSessao(ctx: Contexto): string {
  if (ctx.papel === "morador") return ctx.unidadeRotulo ?? "Minha casa";
  return NOME_DO_PAPEL[ctx.papel];
}

/**
 * Moldura da ÁREA DO MORADOR. Tudo aqui exige login:
 * - sem sessão → /entrar (o proxy já manda com o ?volta=);
 * - senha provisória → /conta/senha;
 * - sem a permissão "area.morador" → "sem acesso".
 * O condomínio vem SEMPRE da sessão (nunca da URL).
 * Cada página confere de novo (defesa em profundidade).
 */
export default async function LayoutMorador({ children }: LayoutProps<"/">) {
  const ctx = await exigirPermissao("area.morador");
  const rotulo = rotuloDaSessao(ctx);

  return (
    <div className="min-h-dvh pb-28 lg:pb-10">
      <FaixaTopo titulo={ctx.condominioNome} subtitulo="Portal dos moradores" demo={ctx.demo} sessao={{ rotulo }} />
      <div className="relative mx-auto -mt-12 grid max-w-5xl gap-6 px-3 sm:px-4 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-4 lg:self-start lg:rounded-[var(--radius-card)] lg:border lg:border-borda-luz lg:bg-surface lg:p-2 lg:shadow-card">
          <NavMorador casa={rotulo} />
        </aside>
        <main id="conteudo" className="min-w-0">
          {children}
        </main>
      </div>
    </div>
  );
}
