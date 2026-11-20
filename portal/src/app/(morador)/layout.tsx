import { exigirAreaDoMorador, type Contexto } from "@/server/contexto";
import { NOME_DO_PAPEL } from "@/lib/permissoes";
import { FaixaTopo, classeBotaoFaixa } from "@/components/layout/faixa-topo";
import { Sino } from "@/components/notificacoes/sino";
import { Assinatura } from "@/components/ui/assinatura";
import { AtivarApp } from "@/components/app/ativar-app";
import { NavMorador } from "@/components/layout/navegacao";
import { Sincronizar } from "@/components/layout/sincronizar";
import { horaDaMontagem } from "@/lib/sincronizacao";

/** Texto curto do topo: "Casa 12" para o morador, o perfil para a equipe. */
function rotuloDaSessao(ctx: Contexto): string {
  if (ctx.papel === "morador") return ctx.unidadeRotulo ?? "Minha casa";
  return NOME_DO_PAPEL[ctx.papel];
}

/**
 * Moldura da ÁREA DO MORADOR. Tudo aqui exige login:
 * - sem sessão → /entrar (o proxy já manda com o ?volta=);
 * - senha provisória → /conta/senha;
 * - sem a permissão "area.morador" → a versão do módulo na área da pessoa ou "sem acesso";
 * - equipe abrindo um link de módulo (ex.: /reservas) → a versão do módulo na área dela.
 * O condomínio vem SEMPRE da sessão (nunca da URL).
 * Cada página confere de novo (defesa em profundidade).
 * <Sincronizar> mantém a tela em dia com o que as outras pessoas fazem.
 * O sino do topo mostra votações, enquetes, comunicados e respostas aos pedidos.
 */
export default async function LayoutMorador({ children }: LayoutProps<"/">) {
  const ctx = await exigirAreaDoMorador();
  const rotulo = rotuloDaSessao(ctx);

  return (
    <div className="min-h-dvh pb-28 lg:pb-10">
      <FaixaTopo
        titulo={ctx.condominioNome}
        subtitulo="Portal dos moradores"
        demo={ctx.demo}
        sessao={{ rotulo }}
        botoes={<Sino paginaHref="/notificacoes" className={classeBotaoFaixa} />}
      />
      <div className="relative mx-auto -mt-12 grid max-w-5xl gap-6 px-3 sm:px-4 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-4 lg:self-start lg:rounded-[var(--radius-card)] lg:border lg:border-borda-luz lg:bg-surface lg:p-2 lg:shadow-card">
          <NavMorador casa={rotulo} />
        </aside>
        <main id="conteudo" className="min-w-0">
          {children}
          <Assinatura className="mt-8" />
        </main>
      </div>
      <Sincronizar montadaEm={horaDaMontagem()} />
      <AtivarApp />
    </div>
  );
}
