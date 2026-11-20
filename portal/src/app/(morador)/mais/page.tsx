import type { Metadata } from "next";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  Award,
  Bell,
  CalendarDays,
  ChevronRight,
  ClipboardList,
  FolderOpen,
  KeyRound,
  MapPinned,
  Megaphone,
  Package,
  Phone,
  Store,
  UserCheck,
  Vote,
  Wallet,
} from "lucide-react";
import { exigirPermissao } from "@/server/contexto";
import type { Permissao } from "@/lib/permissoes";
import { Cartao } from "@/components/ui/basicos";
import { CabecalhoPagina, TituloSecao, type TomModulo } from "@/components/ui/painel";
import { cx } from "@/lib/cx";
import { Preferencias } from "./preferencias";

export const metadata: Metadata = { title: "Mais" };

type Modulo = { icone: LucideIcon; titulo: string; descricao: string; tom: TomModulo; href: string; permissao: Permissao };

// Módulos da casa e do dia a dia.
const DA_CASA: Modulo[] = [
  { icone: Wallet, titulo: "Prestação de contas", descricao: "Saldo, receitas e despesas", tom: "verde", href: "/financeiro", permissao: "financeiro.ver_publicado" },
  { icone: CalendarDays, titulo: "Agenda das áreas de lazer", descricao: "Horários livres e pedido de reserva", tom: "verde", href: "/reservas", permissao: "reservas.fazer" },
  { icone: ClipboardList, titulo: "Solicitações", descricao: "Informe problemas e acompanhe o protocolo", tom: "vinho", href: "/solicitacoes", permissao: "solicitacoes.abrir" },
  { icone: UserCheck, titulo: "Autorizar visita", descricao: "Código para o visitante entrar", tom: "lago", href: "/visitas", permissao: "visitantes.autorizar" },
  { icone: Package, titulo: "Minhas encomendas", descricao: "O que chegou na portaria", tom: "areia", href: "/encomendas", permissao: "encomendas.ver_proprias" },
];

// Comunicação e informações do condomínio.
const DO_CONDOMINIO: Modulo[] = [
  { icone: Bell, titulo: "Notificações", descricao: "Votações, enquetes, avisos e respostas aos seus pedidos", tom: "vinho", href: "/notificacoes", permissao: "area.morador" },
  { icone: Megaphone, titulo: "Comunicados", descricao: "Avisos da administração", tom: "areia", href: "/comunicados", permissao: "comunicados.ver" },
  { icone: Vote, titulo: "Enquetes", descricao: "Um voto por casa nas decisões do condomínio", tom: "vinho", href: "/enquetes", permissao: "enquetes.votar" },
  { icone: Award, titulo: "Votação oficial", descricao: "Eleições do condomínio com voto secreto", tom: "vinho", href: "/votacao", permissao: "eleicoes.votar" },
  { icone: FolderOpen, titulo: "Documentos", descricao: "Regimento, convenção, atas e prestações", tom: "lago", href: "/documentos", permissao: "documentos.ver" },
  { icone: Store, titulo: "Classificados", descricao: "Compra, venda e serviços entre vizinhos", tom: "areia", href: "/classificados", permissao: "classificados.usar" },
  { icone: Phone, titulo: "Contatos úteis", descricao: "Portaria, ronda, reservas e PIX da taxa", tom: "vinho", href: "/contatos", permissao: "informacoes.ver" },
  { icone: MapPinned, titulo: "Mapa das casas", descricao: "Encontre qualquer casa", tom: "lago", href: "/mapa", permissao: "mapa.ver" },
];

const TONS: Record<TomModulo, string> = {
  verde: "bg-ok-soft text-pine",
  lago: "bg-lake-soft text-lake",
  vinho: "bg-plum-soft text-plum",
  areia: "bg-sand text-texto-areia",
};

/** Item largo da lista (sempre um link). */
function ItemModulo({ m }: { m: Modulo }) {
  const Icone = m.icone;
  return (
    <Link
      href={m.href}
      className="saltado flex min-h-[72px] items-center gap-3 rounded-2xl px-3.5 py-3 transition-shadow active:shadow-afundado"
    >
      <span className={cx("grid size-12 shrink-0 place-items-center rounded-[14px]", TONS[m.tom])}>
        <Icone aria-hidden className="size-6" />
      </span>
      <span className="min-w-0 flex-1">
        <b className="block leading-tight text-ink">{m.titulo}</b>
        <span className="text-[0.88rem] text-muted">{m.descricao}</span>
      </span>
      <ChevronRight aria-hidden className="size-5 shrink-0 text-muted" />
    </Link>
  );
}

/** Lista de módulos de uma seção (some se o perfil não puder ver nenhum). */
function SecaoModulos({ id, titulo, modulos }: { id: string; titulo: string; modulos: Modulo[] }) {
  if (!modulos.length) return null;
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <TituloSecao id={id}>{titulo}</TituloSecao>
      <ul className="grid gap-3 sm:grid-cols-2">
        {modulos.map((m) => (
          <li key={m.titulo}>
            <ItemModulo m={m} />
          </li>
        ))}
      </ul>
    </section>
  );
}

export default async function MaisMorador() {
  const ctx = await exigirPermissao("area.morador", "/mais");
  const pode = (m: Modulo) => ctx.permissoes.has(m.permissao);

  return (
    <div className="flex flex-col gap-6">
      <CabecalhoPagina sobretitulo="Mais" titulo="Todos os módulos" subtitulo="Tudo o que o portal oferece para a sua casa." />

      <SecaoModulos id="titulo-da-casa" titulo="Minha casa" modulos={DA_CASA.filter(pode)} />
      <SecaoModulos id="titulo-do-condominio" titulo="Do condomínio" modulos={DO_CONDOMINIO.filter(pode)} />

      <section aria-labelledby="titulo-preferencias" className="flex flex-col gap-3">
        <TituloSecao id="titulo-preferencias" extra="Valem neste aparelho">
          Preferências
        </TituloSecao>
        <Cartao className="py-2">
          <Preferencias />
        </Cartao>
      </section>

      <Link
        href="/conta/senha"
        className="saltado flex min-h-12 w-full items-center justify-center gap-2 rounded-full px-3 font-bold text-ink-2 active:shadow-afundado"
      >
        <KeyRound aria-hidden className="size-5" /> Trocar minha senha
      </Link>
    </div>
  );
}
