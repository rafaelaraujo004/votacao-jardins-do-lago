import type { Metadata } from "next";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  CalendarDays,
  ChevronRight,
  FileText,
  MapPinned,
  Megaphone,
  MessageSquareWarning,
  Package,
  Phone,
  UserCheck,
  Vote,
  Wallet,
} from "lucide-react";
import { exigirPermissao } from "@/server/contexto";
import { Cartao } from "@/components/ui/basicos";
import { CabecalhoPagina, TituloSecao, type TomModulo } from "@/components/ui/painel";
import { BotaoSair } from "@/components/layout/faixa-topo";
import { cx } from "@/lib/cx";
import { Preferencias } from "./preferencias";

export const metadata: Metadata = { title: "Mais" };

type Modulo = { icone: LucideIcon; titulo: string; descricao: string; tom: TomModulo; href?: string };

// Módulos que já funcionam (são links).
const PRONTOS: Modulo[] = [
  { icone: Wallet, titulo: "Prestação de contas", descricao: "Saldo, receitas e despesas", tom: "verde", href: "/financeiro" },
  { icone: MapPinned, titulo: "Mapa das casas", descricao: "Encontre qualquer casa", tom: "lago", href: "/mapa" },
  { icone: Phone, titulo: "Contatos úteis", descricao: "Endereço, portaria e emergência", tom: "vinho", href: "/contatos" },
  { icone: CalendarDays, titulo: "Reservas de lazer", descricao: "Salão, churrasqueira e quadra", tom: "verde", href: "/reservas" },
  { icone: UserCheck, titulo: "Autorização de visitas", descricao: "Libere visitas e entregas", tom: "lago", href: "/visitas" },
  { icone: Package, titulo: "Encomendas", descricao: "Veja o que chegou para você", tom: "areia", href: "/encomendas" },
];

// Módulos que ainda vão chegar (sem link: não são clicáveis).
const EM_BREVE: Modulo[] = [
  { icone: Megaphone, titulo: "Comunicados", descricao: "Avisos da administração", tom: "areia" },
  { icone: MessageSquareWarning, titulo: "Solicitações", descricao: "Peça reparos e tire dúvidas", tom: "vinho" },
  { icone: Vote, titulo: "Votações e assembleias", descricao: "Eleições e decisões do condomínio", tom: "verde" },
  { icone: FileText, titulo: "Documentos", descricao: "Regimento, convenção e atas", tom: "lago" },
];

const TONS: Record<TomModulo, string> = {
  verde: "bg-ok-soft text-pine",
  lago: "bg-lake-soft text-lake",
  vinho: "bg-plum-soft text-plum",
  areia: "bg-sand text-texto-areia",
};

/** Item largo da lista: com link é clicável; sem link mostra "Em breve". */
function ItemModulo({ m }: { m: Modulo }) {
  const Icone = m.icone;
  const conteudo = (
    <>
      <span className={cx("grid size-12 shrink-0 place-items-center rounded-[14px]", TONS[m.tom])}>
        <Icone aria-hidden className="size-6" />
      </span>
      <span className="min-w-0 flex-1">
        <b className="block leading-tight text-ink">{m.titulo}</b>
        <span className="text-[0.88rem] text-muted">{m.descricao}</span>
      </span>
      {m.href ? (
        <ChevronRight aria-hidden className="size-5 shrink-0 text-muted" />
      ) : (
        <span className="shrink-0 rounded-full bg-sand px-2 py-0.5 text-[0.68rem] font-bold uppercase tracking-wide text-ink-2">
          Em breve
        </span>
      )}
    </>
  );
  const classes = "saltado flex min-h-[72px] items-center gap-3 rounded-2xl px-3.5 py-3";
  if (m.href) {
    return (
      <Link href={m.href} className={cx(classes, "transition-shadow active:shadow-afundado")}>
        {conteudo}
      </Link>
    );
  }
  return (
    <div className={cx(classes, "opacity-75")} aria-disabled="true">
      {conteudo}
    </div>
  );
}

export default async function MaisMorador() {
  await exigirPermissao("area.morador");

  return (
    <div className="flex flex-col gap-6">
      <CabecalhoPagina sobretitulo="Mais" titulo="Todos os módulos" subtitulo="Tudo o que o portal oferece, e o que ainda vem por aí." />

      <section aria-labelledby="titulo-prontos" className="flex flex-col gap-3">
        <TituloSecao id="titulo-prontos">Já disponíveis</TituloSecao>
        <ul className="grid gap-3 sm:grid-cols-2">
          {PRONTOS.map((m) => (
            <li key={m.titulo}>
              <ItemModulo m={m} />
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="titulo-em-breve" className="flex flex-col gap-3">
        <TituloSecao id="titulo-em-breve" extra="Chegam nas próximas fases">
          Em breve
        </TituloSecao>
        <ul className="grid gap-3 sm:grid-cols-2">
          {EM_BREVE.map((m) => (
            <li key={m.titulo}>
              <ItemModulo m={m} />
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="titulo-preferencias" className="flex flex-col gap-3">
        <TituloSecao id="titulo-preferencias" extra="Valem neste aparelho">
          Preferências
        </TituloSecao>
        <Cartao className="py-2">
          <Preferencias />
        </Cartao>
      </section>

      <BotaoSair className="saltado min-h-12 w-full justify-center text-plum active:shadow-afundado" />
    </div>
  );
}
