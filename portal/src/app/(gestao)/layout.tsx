import { Menu } from "lucide-react";
import { exigirPermissao, type Contexto } from "@/server/contexto";
import { NOME_DO_PAPEL, type Permissao } from "@/lib/permissoes";
import { NavGestao, type GrupoMenu, type ItemMenuSerializavel } from "@/components/layout/navegacao";
import { BotaoSair } from "@/components/layout/faixa-topo";
import { Logo } from "@/components/ui/marca";
import { BotaoTema } from "@/components/ui/tema";

type Item = ItemMenuSerializavel & { permissao: Permissao };

const GRUPOS: { titulo: string; itens: Item[] }[] = [
  { titulo: "Visão geral", itens: [{ rotulo: "Painel", icone: "LayoutDashboard", href: "/admin", permissao: "area.gestao" }] },
  {
    titulo: "Pessoas",
    itens: [
      { rotulo: "Unidades", icone: "Building2", fase: "Fase 2", permissao: "unidades.ver" },
      { rotulo: "Moradores", icone: "Users", fase: "Fase 2", permissao: "moradores.ver" },
      { rotulo: "Equipe e permissões", icone: "ShieldCheck", fase: "Fase 2", permissao: "equipe.gerenciar" },
    ],
  },
  { titulo: "Finanças", itens: [{ rotulo: "Prestação de contas", icone: "Landmark", fase: "Fase 2", permissao: "financeiro.ver" }] },
  { titulo: "Serviços", itens: [{ rotulo: "Reservas e solicitações", icone: "Wrench", fase: "Fase 4", permissao: "reservas.ver_todas" }] },
  { titulo: "Comunicação", itens: [{ rotulo: "Comunicados e documentos", icone: "Megaphone", fase: "Fase 4", permissao: "comunicados.ver" }] },
  { titulo: "Configurações", itens: [{ rotulo: "Áreas, mapa e informações", icone: "Settings", fase: "Fase 4", permissao: "areas.configurar" }] },
  { titulo: "Controle", itens: [{ rotulo: "Auditoria", icone: "ScrollText", href: "/admin/auditoria", permissao: "auditoria.ver" }] },
];

/** Mostra só o que o perfil pode ver. */
function menuDo(ctx: Contexto): GrupoMenu[] {
  return GRUPOS.map((g) => ({
    titulo: g.titulo,
    itens: g.itens
      .filter((i) => ctx.permissoes.has(i.permissao))
      .map((i) => ({ rotulo: i.rotulo, icone: i.icone, href: i.href, fase: i.fase })),
  })).filter((g) => g.itens.length > 0);
}

export default async function LayoutGestao({ children }: LayoutProps<"/">) {
  const ctx = await exigirPermissao("area.gestao");
  const grupos = menuDo(ctx);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="bg-band pt-[env(safe-area-inset-top)] text-band-fg lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:overflow-y-auto">
        <div className="flex items-center gap-3 p-4">
          <Logo largura={72} />
          <div className="flex min-w-0 flex-1 flex-col leading-tight">
            <span className="truncate font-display font-bold">{ctx.condominioNome}</span>
            <span className="truncate text-[0.85rem] text-band-muted">{NOME_DO_PAPEL[ctx.papel]}</span>
          </div>
          <BotaoTema className="text-band-fg hover:bg-white/10 lg:hidden" />
        </div>

        {/* Celular: menu recolhível (funciona até sem JavaScript). */}
        <details className="border-t border-white/10 lg:hidden">
          <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 font-bold">
            <Menu aria-hidden className="size-5" /> Menu
          </summary>
          <div className="flex flex-col gap-4 px-2 pb-4">
            <NavGestao grupos={grupos} />
            <BotaoSair className="text-band-fg hover:bg-white/10" />
          </div>
        </details>

        <div className="hidden flex-1 px-2 pb-4 lg:block">
          <NavGestao grupos={grupos} />
        </div>

        <div className="hidden items-center gap-2 border-t border-white/10 p-3 lg:flex">
          <span className="min-w-0 flex-1 truncate px-1 text-[0.92rem]">{ctx.nome}</span>
          <BotaoTema className="text-band-fg hover:bg-white/10" />
          <BotaoSair className="text-band-fg hover:bg-white/10" />
        </div>
      </aside>

      <main id="conteudo" className="mx-auto w-full max-w-5xl px-3 py-5 sm:px-6 lg:px-8 lg:py-8">
        {ctx.demo ? (
          <p className="mb-4 w-fit rounded-full bg-sand px-3 py-0.5 text-[0.78rem] font-bold text-ink">
            Ambiente de demonstração · dados fictícios
          </p>
        ) : null}
        {children}
      </main>
    </div>
  );
}
