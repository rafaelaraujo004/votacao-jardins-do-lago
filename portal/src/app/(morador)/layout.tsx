import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { condominioPublico, sufixoC } from "@/server/publico";
import { rotuloDaSessao, sessaoOpcional } from "@/server/sessao-opcional";
import { FaixaTopo, PortalIndisponivel } from "@/components/layout/faixa-topo";
import { NavMorador } from "@/components/layout/navegacao";

/**
 * Moldura da ÁREA PÚBLICA dos moradores (sem login).
 *
 * Qual condomínio mostrar? O layout não recebe o ?c= da página (o Next não
 * passa searchParams para layouts). Por isso o proxy (src/proxy.ts) copia o
 * ?c= da URL para o cabeçalho interno "x-portal-c" e o layout lê daqui.
 * Sem ?c= vale o condomínio padrão (CONDOMINIO_PUBLICO). As páginas também
 * leem o ?c= direto da URL, e os links do menu mantêm o ?c= ao navegar.
 *
 * Login é OPCIONAL aqui: se houver sessão, o topo mostra "Casa 12 · Sair";
 * senão, "Entrar". Quem ainda está com a senha provisória vai antes escolher
 * a própria senha. (Visitas e encomendas exigem login na própria página.)
 */
export default async function LayoutMorador({ children }: LayoutProps<"/">) {
  const c = (await headers()).get("x-portal-c") ?? undefined;
  const [cp, ctx] = await Promise.all([condominioPublico(c), sessaoOpcional()]);
  if (ctx?.precisaTrocarSenha) redirect("/conta/senha");
  // Condomínio fechado ao público: só quem está logado continua (visitas, encomendas).
  if (!cp && !ctx) return <PortalIndisponivel />;
  const sessao = ctx ? { rotulo: rotuloDaSessao(ctx) } : null;
  const sufixo = cp ? sufixoC(cp) : "";

  return (
    <div className="min-h-dvh pb-28 lg:pb-10">
      <FaixaTopo
        titulo={cp?.nome ?? ctx?.condominioNome ?? ""}
        subtitulo="Portal dos moradores"
        demo={cp ? cp.demo : ctx?.demo}
        publico
        sessao={sessao}
        entrarHref={`/entrar${sufixo}`}
      />
      <div className="relative mx-auto -mt-12 grid max-w-5xl gap-6 px-3 sm:px-4 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-4 lg:self-start lg:rounded-[var(--radius-card)] lg:border lg:border-borda-luz lg:bg-surface lg:p-2 lg:shadow-card">
          <NavMorador casa={ctx?.papel === "morador" ? sessao?.rotulo : null} />
        </aside>
        <main id="conteudo" className="min-w-0">
          {children}
        </main>
      </div>
    </div>
  );
}
