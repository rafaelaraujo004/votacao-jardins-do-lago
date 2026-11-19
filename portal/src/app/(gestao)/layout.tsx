import Link from "next/link";
import { KeyRound } from "lucide-react";
import { exigirPermissao, type Contexto } from "@/server/contexto";
import { NOME_DO_PAPEL, type Permissao } from "@/lib/permissoes";
import { NavGestao, type GrupoMenu, type ItemMenuSerializavel } from "@/components/layout/navegacao";
import { BotaoSair, classeBotaoFaixa } from "@/components/layout/faixa-topo";
import { Logo } from "@/components/ui/marca";
import { GavetaMenu } from "@/components/layout/gaveta-menu";
import { Sincronizar } from "@/components/layout/sincronizar";
import { horaDaMontagem } from "@/lib/sincronizacao";
import { BotaoTema } from "@/components/ui/tema";
import { FaixaPetalas } from "@/components/ui/painel";
import { ENDERECO_LINHA } from "@/lib/condominio";

type Item = ItemMenuSerializavel & { permissao: Permissao };

const GRUPOS: { titulo: string; itens: Item[] }[] = [
  { titulo: "Visão geral", itens: [{ rotulo: "Painel", icone: "LayoutDashboard", href: "/admin", permissao: "area.gestao" }] },
  {
    titulo: "Pessoas",
    itens: [
      { rotulo: "Unidades", icone: "Building2", href: "/admin/unidades", permissao: "unidades.ver" },
      { rotulo: "Moradores e equipe", icone: "Users", href: "/admin/pessoas", permissao: "moradores.ver" },
    ],
  },
  { titulo: "Portaria", itens: [{ rotulo: "Histórico da portaria", icone: "DoorOpen", href: "/admin/portaria", permissao: "visitantes.ver_todos" }] },
  {
    titulo: "Finanças",
    itens: [
      { rotulo: "Prestação de contas", icone: "Landmark", href: "/admin/financeiro", permissao: "financeiro.ver" },
      { rotulo: "Relatórios", icone: "ChartColumn", href: "/admin/relatorios", permissao: "relatorios.ver" },
    ],
  },
  {
    titulo: "Serviços",
    itens: [
      { rotulo: "Reservas e áreas", icone: "CalendarDays", href: "/admin/reservas", permissao: "reservas.ver_todas" },
      { rotulo: "Solicitações", icone: "ClipboardList", href: "/admin/solicitacoes", permissao: "solicitacoes.gerenciar" },
    ],
  },
  {
    titulo: "Comunicação",
    itens: [
      { rotulo: "Comunicados", icone: "Megaphone", href: "/admin/comunicados", permissao: "comunicados.ver" },
      { rotulo: "Documentos", icone: "FolderOpen", href: "/admin/documentos", permissao: "documentos.ver" },
      { rotulo: "Enquetes", icone: "Vote", href: "/admin/enquetes", permissao: "enquetes.gerenciar" },
      { rotulo: "Votação oficial", icone: "Award", href: "/admin/votacao", permissao: "eleicoes.gerenciar" },
      { rotulo: "Classificados", icone: "Store", href: "/admin/classificados", permissao: "classificados.moderar" },
    ],
  },
  {
    titulo: "Configurações",
    itens: [
      { rotulo: "Links de acesso", icone: "Link2", href: "/admin/links", permissao: "area.gestao" },
      { rotulo: "Informações do condomínio", icone: "Settings", href: "/admin/informacoes", permissao: "informacoes.gerenciar" },
    ],
  },
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
        <FaixaPetalas className="opacity-80" />
        <div className="flex items-center gap-3 p-4">
          <Logo largura={70} className="shrink-0" />
          <div className="flex min-w-0 flex-1 flex-col leading-tight">
            <span className="truncate font-display font-bold tracking-tight">{ctx.condominioNome}</span>
            <span className="mt-0.5 truncate text-[0.8rem] text-band-muted">{ENDERECO_LINHA}</span>
            <span className="mt-0.5 truncate text-[0.84rem] font-bold text-band-fg/90">{NOME_DO_PAPEL[ctx.papel]}</span>
          </div>
          <BotaoTema className={`${classeBotaoFaixa} lg:hidden`} />
          {/* Celular: botão sanduíche ao lado, abre a gaveta com as opções. */}
          <div className="lg:hidden">
            <GavetaMenu titulo="Menu" className={classeBotaoFaixa}>
              <NavGestao grupos={grupos} />
              <div className="mt-auto flex flex-col gap-2 border-t border-white/10 px-1 pt-4">
                <span className="truncate px-2 text-[0.92rem] text-band-muted">{ctx.nome}</span>
                <Link
                  href="/conta/senha"
                  className={`${classeBotaoFaixa} flex min-h-11 w-fit items-center gap-2 rounded-full px-3 font-bold`}
                >
                  <KeyRound aria-hidden className="size-5" /> Trocar senha
                </Link>
                <BotaoSair className={`${classeBotaoFaixa} w-fit`} />
              </div>
            </GavetaMenu>
          </div>
        </div>

        <div className="hidden flex-1 px-2 pb-4 lg:block">
          <NavGestao grupos={grupos} />
        </div>

        <div className="hidden items-center gap-2 border-t border-white/10 p-3 lg:flex">
          <span className="min-w-0 flex-1 truncate px-1 text-[0.92rem]">{ctx.nome}</span>
          <Link
            href="/conta/senha"
            title="Trocar senha"
            className={`${classeBotaoFaixa} grid size-11 place-items-center rounded-full`}
          >
            <KeyRound aria-hidden className="size-5" />
            <span className="sr-only">Trocar senha</span>
          </Link>
          <BotaoTema className={classeBotaoFaixa} />
          <BotaoSair redondo className={classeBotaoFaixa} />
        </div>
      </aside>

      <main id="conteudo" className="mx-auto w-full max-w-5xl px-3 py-5 sm:px-6 lg:px-8 lg:py-8">
        {ctx.demo ? (
          <p className="mb-4 w-fit rounded-full bg-sand px-3 py-0.5 text-[0.78rem] font-bold text-ink shadow-relevo">
            Ambiente de demonstração · dados fictícios
          </p>
        ) : null}
        {children}
      </main>
      <Sincronizar montadaEm={horaDaMontagem()} />
    </div>
  );
}
