"use client";

/**
 * Menus do portal. Itens sem `href` ainda não existem: aparecem esmaecidos,
 * não são clicáveis e dizem "em breve" (nada de botão que não faz nada).
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
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
} satisfies Record<string, LucideIcon>;
export type NomeIcone = keyof typeof ICONES;
export type ItemMenuSerializavel = Omit<ItemMenu, "icone"> & { icone: NomeIcone };
export type GrupoMenu = { titulo: string; itens: ItemMenuSerializavel[] };

function ativo(caminho: string, href?: string) {
  if (!href) return false;
  return caminho === href || caminho.startsWith(`${href}/`);
}

// ---------- Morador: barra inferior no celular, coluna no computador ----------

const ITENS_MORADOR: ItemMenu[] = [
  { rotulo: "Início", icone: House, href: "/inicio" },
  { rotulo: "Visitantes", icone: UserCheck, fase: "Fase 3" },
  { rotulo: "Reservas", icone: CalendarDays, fase: "Fase 4" },
  { rotulo: "Mais", icone: Ellipsis, fase: "Fase 2" },
];

export function NavMorador() {
  const caminho = usePathname();
  return (
    <nav
      aria-label="Menu principal"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:static lg:border-0 lg:bg-transparent lg:pb-0 lg:backdrop-blur-none"
    >
      <ul className="mx-auto grid max-w-xl grid-cols-4 lg:max-w-none lg:grid-cols-1 lg:gap-1">
        {ITENS_MORADOR.map(({ rotulo, icone: Icone, href, fase }) => {
          const atual = ativo(caminho, href);
          const classes = cx(
            "flex min-h-16 flex-col items-center justify-center gap-0.5 text-[0.8rem] font-bold lg:min-h-12 lg:flex-row lg:justify-start lg:gap-3 lg:rounded-xl lg:px-4 lg:text-base",
            atual ? "text-pine lg:bg-ok-soft" : "text-muted",
          );
          return (
            <li key={rotulo}>
              {href ? (
                <Link href={href} className={classes} aria-current={atual ? "page" : undefined}>
                  <Icone aria-hidden className="size-6" />
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
                "flex min-h-11 items-center gap-3 rounded-xl px-3 font-bold",
                atual ? "bg-white/12 text-band-fg" : "text-band-fg/85 hover:bg-white/8",
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
