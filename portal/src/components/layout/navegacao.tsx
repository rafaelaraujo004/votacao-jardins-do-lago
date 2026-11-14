"use client";

/**
 * Menus do portal. Itens sem `href` ainda não existem: aparecem esmaecidos,
 * não são clicáveis e dizem "em breve" (nada de botão que não faz nada).
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  LayoutGrid,
  Map as IconeMapa,
  Wallet,
  Ellipsis,
  House,
  UserCheck,
  LayoutDashboard,
  Building2,
  Users,
  ShieldCheck,
  Landmark,
  Wrench,
  Megaphone,
  Settings,
  ScrollText,
  DoorOpen,
  Package,
  type LucideIcon,
} from "lucide-react";
import { cx } from "@/lib/cx";

export type ItemMenu = { rotulo: string; icone: LucideIcon; href?: string; fase?: string };

/** Nomes dos ícones que o servidor pode pedir (componentes não passam do servidor para o navegador). */
const ICONES = {
  House,
  UserCheck,
  CalendarDays,
  Ellipsis,
  LayoutDashboard,
  Building2,
  Users,
  ShieldCheck,
  Landmark,
  Wrench,
  Megaphone,
  Settings,
  ScrollText,
  DoorOpen,
} satisfies Record<string, LucideIcon>;
export type NomeIcone = keyof typeof ICONES;
export type ItemMenuSerializavel = Omit<ItemMenu, "icone"> & { icone: NomeIcone };
export type GrupoMenu = { titulo: string; itens: ItemMenuSerializavel[] };

function ativo(caminho: string, href?: string) {
  if (!href) return false;
  return caminho === href || caminho.startsWith(`${href}/`);
}

// ---------- Morador (sempre com login): barra inferior no celular, coluna no computador ----------

const ITENS_MORADOR: ItemMenu[] = [
  { rotulo: "Início", icone: House, href: "/inicio" },
  { rotulo: "Contas", icone: Wallet, href: "/financeiro" },
  { rotulo: "Mapa", icone: IconeMapa, href: "/mapa" },
  { rotulo: "Agenda", icone: CalendarDays, href: "/reservas" },
  { rotulo: "Mais", icone: LayoutGrid, href: "/mais" },
];

/** Itens da casa. No computador aparecem abaixo do menu. */
const ITENS_CASA: ItemMenu[] = [
  { rotulo: "Autorizar visita", icone: UserCheck, href: "/visitas" },
  { rotulo: "Encomendas", icone: Package, href: "/encomendas" },
];

/** Bloco "Minha casa" (só no computador; no celular o topo mostra "Casa 12 · Sair"). */
function BlocoCasa({ casa, caminho }: { casa: string; caminho: string }) {
  return (
    <div className="mt-3 hidden flex-col gap-1.5 border-t border-line pt-3 lg:flex">
      <p className="px-3 text-[0.74rem] font-bold uppercase tracking-[0.1em] text-muted">{casa}</p>
      <ul className="flex flex-col gap-1.5">
        {ITENS_CASA.map(({ rotulo, icone: Icone, href = "" }) => {
          const atual = ativo(caminho, href);
          return (
            <li key={rotulo}>
              <Link
                href={href}
                aria-current={atual ? "page" : undefined}
                className={cx(
                  "flex min-h-12 items-center gap-3 rounded-2xl px-3 font-bold",
                  atual ? "text-destaque shadow-afundado" : "text-muted hover:text-ink",
                )}
              >
                <Icone aria-hidden className={cx("size-[22px]", atual && "text-pine")} />
                {rotulo}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Menu do morador. `casa`: "Casa 12" (ou o perfil, para a equipe). */
export function NavMorador({ casa }: { casa: string }) {
  const caminho = usePathname();
  return (
    <nav
      aria-label="Menu principal"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-borda-luz bg-canvas px-1.5 pb-[calc(6px+env(safe-area-inset-bottom))] pt-1.5 shadow-[0_-8px_22px_var(--sombra)] lg:static lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none"
    >
      <ul className="mx-auto grid max-w-xl grid-cols-5 lg:max-w-none lg:grid-cols-1 lg:gap-1.5">
        {ITENS_MORADOR.map(({ rotulo, icone: Icone, href, fase }) => {
          const atual = ativo(caminho, href);
          const classes = cx(
            "group flex min-h-[58px] flex-col items-center justify-center gap-1 rounded-2xl text-[0.76rem] font-bold lg:min-h-12 lg:flex-row lg:justify-start lg:gap-3 lg:px-3 lg:text-base",
            atual ? "text-destaque lg:shadow-afundado" : "text-muted hover:text-ink",
          );
          const pilula = cx(
            "grid h-[30px] w-[52px] place-items-center rounded-full transition-shadow lg:h-auto lg:w-auto",
            atual && "text-pine shadow-afundado lg:shadow-none",
          );
          return (
            <li key={rotulo}>
              {href ? (
                <Link href={href} className={classes} aria-current={atual ? "page" : undefined}>
                  <span className={pilula}>
                    <Icone aria-hidden className="size-[22px]" />
                  </span>
                  {rotulo}
                </Link>
              ) : (
                <span className={cx(classes, "opacity-55")} aria-disabled="true" title={`Em breve (${fase})`}>
                  <Icone aria-hidden className="size-6" />
                  <span>
                    {rotulo}
                    <span className="sr-only"> — em breve</span>
                  </span>
                </span>
              )}
            </li>
          );
        })}
      </ul>
      <BlocoCasa casa={casa} caminho={caminho} />
    </nav>
  );
}

// ---------- Gestão: menu lateral em grupos ----------

export function NavGestao({ grupos }: { grupos: GrupoMenu[] }) {
  const caminho = usePathname();
  return (
    <nav aria-label="Menu da administração" className="flex flex-col gap-5">
      {grupos.map((grupo) => (
        <div key={grupo.titulo} className="flex flex-col gap-1">
          <p className="px-3 text-[0.74rem] font-bold uppercase tracking-[0.1em] text-band-muted">{grupo.titulo}</p>
          <ul className="flex flex-col gap-0.5">
            {grupo.itens.map(({ rotulo, icone, href, fase }) => {
              const Icone = ICONES[icone];
              const atual = ativo(caminho, href);
              const classes = cx(
                "flex min-h-11 items-center gap-3 rounded-full px-3 font-bold",
                atual
                  ? "bg-white/15 text-band-fg shadow-[inset_0_0_0_1px_rgb(255_255_255/0.18)]"
                  : "text-band-fg/85 hover:bg-white/8",
              );
              return (
                <li key={rotulo}>
                  {href ? (
                    <Link href={href} className={classes} aria-current={atual ? "page" : undefined}>
                      <Icone aria-hidden className="size-5" />
                      {rotulo}
                    </Link>
                  ) : (
                    <span className={cx(classes, "cursor-default opacity-50 hover:bg-transparent")} aria-disabled="true">
                      <Icone aria-hidden className="size-5" />
                      <span className="flex-1">{rotulo}</span>
                      <span className="text-[0.72rem] font-bold text-band-muted">{fase}</span>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
